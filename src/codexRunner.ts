import { normalizePath } from "obsidian";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process";

import type { CodeianSettings } from "./settings";

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
			const spawn = this.spawnProcess ?? (await import("child_process")).spawn;
			const args = buildCodexArgs(options.settings, cwd);

			return await new Promise<CodexRunResult>((resolve, reject) => {
				let stdout = "";
				let stderr = "";

				const child = spawn(options.settings.codexCommand || "codex", args, {
					cwd,
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

export const DEFAULT_CODEX_ARGS = "exec --ask-for-approval never --sandbox read-only --skip-git-repo-check";

export function buildCodexArgs(settings: CodeianSettings, cwd: string): string[] {
	return [
		...splitCommandLine(settings.codexExtraArgs || DEFAULT_CODEX_ARGS),
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
	const sandboxIndex = args.indexOf("--sandbox");
	if (sandboxIndex < 0 || args[sandboxIndex + 1] !== "read-only") {
		return "The configured arguments do not include --sandbox read-only. The CLI may be able to modify files.";
	}

	const approvalIndex = args.indexOf("--ask-for-approval");
	if (approvalIndex < 0 || args[approvalIndex + 1] !== "never") {
		return "The configured arguments do not include --ask-for-approval never. The CLI may prompt or block unexpectedly.";
	}

	return null;
}

function resolveWorkingDirectory(settings: CodeianSettings, vaultPath: string | null): string | null {
	const configured = settings.workingDirectory.trim();
	if (configured) {
		return normalizePath(configured);
	}

	return vaultPath ? normalizePath(vaultPath) : null;
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
