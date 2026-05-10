import { spawn as nodeSpawn } from "child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process";

import { normalizeFileSystemPath, resolveCliCommand, type CliSelfTestResult } from "./cliResolver";
import type { CodeianSettings } from "./settings";
import { DEFAULT_CODEX_ARGS } from "./defaults";

export interface CodexRunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export interface CodexRunOptions {
	prompt: string;
	settings: CodeianSettings;
	vaultPath: string | null;
	onStdout: (chunk: string) => void;
	onStderr: (chunk: string) => void;
}

export type CodexSpawn = (
	command: string,
	args: string[],
	options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export class CodexRunner {
	private abortController: AbortController | null = null;

	constructor(private readonly spawnProcess?: CodexSpawn) {
	}

	isRunning(): boolean {
		return this.abortController !== null;
	}

	cancel(): void {
		this.abortController?.abort();
	}

	async run(options: CodexRunOptions): Promise<CodexRunResult> {
		if (this.abortController) {
			throw new Error("CodeX is already running.");
		}

		const prompt = options.prompt.trim();
		if (!prompt) {
			throw new Error("Prompt is empty.");
		}

		const cwd = resolveWorkingDirectory(options.settings, options.vaultPath);
		if (!cwd) {
			throw new Error("Could not resolve a working directory. Set one in Codeian settings.");
		}

		this.abortController = new AbortController();

		try {
			const spawn = this.spawnProcess ?? nodeSpawn;
			const resolvedCommand = await resolveCliCommand(options.settings);
			const args = buildCodexArgs(options.settings, cwd);

			return await new Promise<CodexRunResult>((resolve, reject) => {
				let stdout = "";
				let stderr = "";

				const child = spawn(resolvedCommand.command, args, {
					cwd,
					env: resolvedCommand.env,
					shell: false,
					signal: this.abortController?.signal,
				});

				child.stdout.on("data", (data: Buffer) => {
					const chunk = data.toString();
					stdout += chunk;
					options.onStdout(chunk);
				});

				child.stderr.on("data", (data: Buffer) => {
					const chunk = data.toString();
					stderr += chunk;
					options.onStderr(chunk);
				});

				child.on("error", (error) => {
					if (this.abortController?.signal.aborted) {
						resolve({ code: null, stdout, stderr: stderr || "Cancelled." });
						return;
					}
					reject(error);
				});

				child.on("close", (code) => {
					resolve({ code, stdout, stderr });
				});

				child.stdin.write(prompt);
				child.stdin.end();
			});
		} finally {
			this.abortController = null;
		}
	}
}

export async function testCodexCli(
	settings: CodeianSettings,
	vaultPath: string | null,
	spawnProcess?: CodexSpawn,
): Promise<CliSelfTestResult> {
	const cwd = resolveWorkingDirectory(settings, vaultPath) ?? vaultPath ?? "/";
	const resolvedCommand = await resolveCliCommand(settings);
	const spawn = spawnProcess ?? nodeSpawn;
	const args = ["--version"];

	return await new Promise<CliSelfTestResult>((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const child = spawn(resolvedCommand.command, args, {
			cwd,
			env: resolvedCommand.env,
			shell: false,
		});
		const timeout = globalThis.setTimeout(() => {
			child.kill();
			finish({
				ok: false,
				command: resolvedCommand.command,
				message: "Codex CLI self-test timed out after 4 seconds.",
				stdout,
				stderr,
				code: null,
			});
		}, 4000);
		const finish = (result: CliSelfTestResult) => {
			if (settled) return;
			settled = true;
			globalThis.clearTimeout(timeout);
			resolve(result);
		};

		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		child.on("error", (error) => {
			finish({
				ok: false,
				command: resolvedCommand.command,
				message: formatCliLaunchError(error.message, resolvedCommand.path),
				stdout,
				stderr,
				code: null,
			});
		});

		child.on("close", (code) => {
			const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
			finish({
				ok: code === 0,
				command: resolvedCommand.command,
				message: code === 0 ? `Codex CLI self-test passed: ${output || resolvedCommand.command}` : `Codex CLI self-test exited with code ${code}.`,
				stdout,
				stderr,
				code,
			});
		});

		child.stdin.end();
	});
}

export function buildCodexArgs(settings: CodeianSettings, cwd: string): string[] {
	const args = splitCommandLine(settings.codexExtraArgs || DEFAULT_CODEX_ARGS);
	const execIndex = args.indexOf("exec");
	const structuredArgs = execIndex >= 0
		? withStructuredOutputArgs(args)
		: args;
	const model = settings.codexModel.trim();
	const effort = settings.codexEffort.trim();

	return [
		...structuredArgs,
		...(model ? ["--model", model] : []),
		...(effort ? ["-c", `model_reasoning_effort="${effort}"`] : []),
		"-C",
		cwd,
		"-",
	];
}

export function getCodexSafetyWarning(settings: CodeianSettings): string | null {
	const command = (settings.codexCommand || "codex").trim();
	const commandName = command.split(/[\\/]/).pop()?.toLowerCase() ?? command.toLowerCase();
	if (commandName !== "codex") {
		return "The configured CLI command is not codex. Only continue if you trust this executable.";
	}

	const args = splitCommandLine(settings.codexExtraArgs || DEFAULT_CODEX_ARGS);
	const execIndex = args.indexOf("exec");
	if (execIndex < 0) {
		return "The configured arguments do not include exec. Codeian expects Codex to run non-interactively.";
	}

	const sandboxIndex = args.lastIndexOf("--sandbox");
	if (sandboxIndex < 0 || args[sandboxIndex + 1] !== "read-only") {
		return "The effective configured arguments do not include --sandbox read-only. The CLI may be able to modify files.";
	}

	const approvalIndex = args.lastIndexOf("--ask-for-approval");
	if (approvalIndex < 0 || args[approvalIndex + 1] !== "never") {
		return "The effective configured arguments do not include --ask-for-approval never. The CLI may prompt or block unexpectedly.";
	}
	if (approvalIndex > execIndex) {
		return "The configured arguments place --ask-for-approval after exec. Put it before exec for the current Codex CLI.";
	}

	return null;
}

function resolveWorkingDirectory(settings: CodeianSettings, vaultPath: string | null): string | null {
	const configured = settings.workingDirectory.trim();
	if (configured) {
		return normalizeFileSystemPath(configured);
	}

	return vaultPath ? normalizeFileSystemPath(vaultPath) : null;
}

function formatCliLaunchError(message: string, enhancedPath: string): string {
	if (message.includes("ENOENT")) {
		return [
			"Could not launch codex from Obsidian.",
			"Codeian searched the configured command and an enhanced PATH for common local binary directories.",
			`Enhanced PATH: ${enhancedPath}`,
			"Set an absolute CLI command path in Codeian settings if Codex is installed by a version manager.",
		].join("\n");
	}

	return message;
}

export function splitCommandLine(input: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: "'" | "\"" | null = null;
	let escaping = false;
	let hasToken = false;

	for (const char of input.trim()) {
		if (escaping) {
			current += char;
			hasToken = true;
			escaping = false;
			continue;
		}

		if (char === "\\") {
			escaping = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
				hasToken = true;
			}
			continue;
		}

		if (char === "'" || char === "\"") {
			quote = char;
			hasToken = true;
			continue;
		}

		if (/\s/.test(char)) {
			if (hasToken) {
				args.push(current);
				current = "";
				hasToken = false;
			}
			continue;
		}

		current += char;
		hasToken = true;
	}

	if (escaping) {
		current += "\\";
		hasToken = true;
	}

	if (quote) {
		throw new Error("Unclosed quote in CodeX arguments.");
	}

	if (hasToken) {
		args.push(current);
	}

	return args;
}

function withStructuredOutputArgs(args: string[]): string[] {
	let next = args.includes("--json") ? args : insertAfterExec(args, "--json");
	if (!next.includes("--color")) {
		next = insertAfterExec(next, "--color", "never");
	}
	return next;
}

function insertAfterExec(args: string[], ...additions: string[]): string[] {
	const execIndex = args.indexOf("exec");
	if (execIndex < 0) {
		return args;
	}

	const next = [...args];
	next.splice(execIndex + 1, 0, ...additions);
	return next;
}
