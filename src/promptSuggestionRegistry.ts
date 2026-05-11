import { spawn as nodeSpawn } from "child_process";
import type { SpawnOptionsWithoutStdio } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { resolveCliCommand } from "./cliResolver";
import {
	BUILT_IN_PROMPT_SUGGESTIONS,
	getPromptSuggestions,
	type PromptSuggestion,
} from "./promptSuggestions";
import type { CodeianSettings } from "./settings";

interface CommandResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export type CommandRunner = (
	command: string,
	args: string[],
	options: SpawnOptionsWithoutStdio,
) => Promise<CommandResult>;

export interface SkillFileReader {
	exists: (filePath: string) => boolean | Promise<boolean>;
	listDir: (dirPath: string) => string[] | Promise<string[]>;
	readFile: (filePath: string) => string | Promise<string>;
	isDirectory: (filePath: string) => boolean | Promise<boolean>;
	isFile: (filePath: string) => boolean | Promise<boolean>;
}

export interface DiscoverPromptSuggestionsOptions {
	commandRunner?: CommandRunner;
	fileReader?: SkillFileReader;
	skillRoots?: string[];
	home?: string;
	maxSkillDepth?: number;
}

const CODEX_HELP_TIMEOUT_MS = 2500;
const MAX_CODEX_HELP_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_SKILL_DEPTH = 5;
const MIN_REFRESH_INTERVAL_MS = 30000;

export class PromptSuggestionRegistry {
	private suggestions: readonly PromptSuggestion[] = BUILT_IN_PROMPT_SUGGESTIONS;
	private discoveredSuggestions: readonly PromptSuggestion[] = [];
	private vaultFileSuggestions: readonly PromptSuggestion[] = [];
	private refreshPromise: Promise<void> | null = null;
	private lastRefreshAt = 0;

	constructor(
		private readonly discoverSuggestions = discoverPromptSuggestions,
	) {
	}

	getSuggestions(value: string, caret: number, limit = 6): PromptSuggestion[] {
		return getPromptSuggestions(value, caret, limit, this.suggestions);
	}

	setVaultFileSuggestions(suggestions: readonly PromptSuggestion[]): void {
		this.vaultFileSuggestions = suggestions;
		this.rebuildSuggestions();
	}

	async refresh(settings: CodeianSettings, force = false): Promise<void> {
		if (this.refreshPromise) {
			return this.refreshPromise;
		}
		if (!force && this.lastRefreshAt > 0 && Date.now() - this.lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
			return;
		}

		this.refreshPromise = this.discoverSuggestions(settings)
			.then((suggestions) => {
				this.discoveredSuggestions = suggestions;
				this.rebuildSuggestions();
				this.lastRefreshAt = Date.now();
			})
			.catch(() => {
				this.discoveredSuggestions = [];
				this.rebuildSuggestions();
				this.lastRefreshAt = Date.now();
			})
			.finally(() => {
				this.refreshPromise = null;
			});

		return this.refreshPromise;
	}

	private rebuildSuggestions(): void {
		const mentionBuiltIns = BUILT_IN_PROMPT_SUGGESTIONS.filter((suggestion) => suggestion.trigger === "@");
		const otherBuiltIns = BUILT_IN_PROMPT_SUGGESTIONS.filter((suggestion) => suggestion.trigger !== "@");
		this.suggestions = mergePromptSuggestions([
			...otherBuiltIns,
			...this.discoveredSuggestions,
			...this.vaultFileSuggestions,
			...mentionBuiltIns,
		]);
	}
}

export async function discoverPromptSuggestions(
	settings: CodeianSettings,
	options: DiscoverPromptSuggestionsOptions = {},
): Promise<PromptSuggestion[]> {
	const [codexCommands, skills] = await Promise.all([
		discoverCodexCommandSuggestions(settings, options),
		discoverSkillSuggestions(options),
	]);

	return mergePromptSuggestions([...codexCommands, ...skills]);
}

export async function discoverCodexCommandSuggestions(
	settings: CodeianSettings,
	options: DiscoverPromptSuggestionsOptions = {},
): Promise<PromptSuggestion[]> {
	if (!isCodexCommand(settings.codexCommand)) {
		return [];
	}

	const runner = options.commandRunner ?? runCommand;
	const resolvedCommand = await resolveCliCommand(settings);
	const result = await runner(resolvedCommand.command, ["--help"], {
		env: resolvedCommand.env,
		shell: false,
	});

	if (result.code !== 0 && !result.stdout.trim()) {
		return [];
	}

	return parseCodexHelpCommands(result.stdout || result.stderr);
}

export function parseCodexHelpCommands(helpText: string): PromptSuggestion[] {
	const lines = helpText.split(/\r?\n/);
	const commandsStart = lines.findIndex((line) => line.trim() === "Commands:");
	if (commandsStart < 0) {
		return [];
	}

	const suggestions: PromptSuggestion[] = [];
	let current: PromptSuggestion | null = null;

	for (const line of lines.slice(commandsStart + 1)) {
		if (/^[A-Z][A-Za-z ]+:$/.test(line.trim())) {
			break;
		}

		const commandMatch = line.match(/^\s{2}([a-z][\w-]*)\s{2,}(.+?)\s*$/);
		if (commandMatch) {
			const commandName = commandMatch[1];
			const description = cleanHelpDescription(commandMatch[2] ?? "");
			current = {
				trigger: "/",
				value: `/${commandName}`,
				label: `/${commandName}`,
				detail: description || "Codex CLI command",
			};
			suggestions.push(current);
			continue;
		}

		const continuationMatch = line.match(/^\s{18,}(.+?)\s*$/);
		if (current && continuationMatch?.[1]) {
			current.detail = `${current.detail} ${cleanHelpDescription(continuationMatch[1])}`.trim();
		}
	}

	return suggestions;
}

export async function discoverSkillSuggestions(options: DiscoverPromptSuggestionsOptions = {}): Promise<PromptSuggestion[]> {
	const fileReader = options.fileReader ?? nodeFileReader;
	const roots = options.skillRoots ?? getDefaultSkillRoots(options.home);
	const maxDepth = options.maxSkillDepth ?? DEFAULT_MAX_SKILL_DEPTH;
	const suggestions: PromptSuggestion[] = [];

	for (const root of roots) {
		if (!await fileReader.exists(root) || !await fileReader.isDirectory(root)) {
			continue;
		}
		for (const skillFile of await findSkillFiles(root, fileReader, maxDepth)) {
			const metadata = parseSkillMarkdown(await fileReader.readFile(skillFile), path.basename(path.dirname(skillFile)));
			if (!metadata.name) {
				continue;
			}
			suggestions.push({
				trigger: "$",
				value: `$${metadata.name}`,
				label: `$${metadata.name}`,
				detail: metadata.description || "Local Codex skill",
			});
		}
	}

	return mergePromptSuggestions(suggestions);
}

export function parseSkillMarkdown(markdown: string, fallbackName = ""): { name: string; description: string } {
	const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
	const source = frontmatter?.[1] ?? "";
	const name = readFrontmatterValue(source, "name") || fallbackName;
	const description = readFrontmatterValue(source, "description");

	return {
		name: sanitizeSkillName(name),
		description: stripQuotes(description).trim(),
	};
}

export function mergePromptSuggestions(suggestions: readonly PromptSuggestion[]): PromptSuggestion[] {
	const seen = new Set<string>();
	const merged: PromptSuggestion[] = [];

	for (const suggestion of suggestions) {
		const key = `${suggestion.trigger}:${suggestion.value.toLowerCase()}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		merged.push(suggestion);
	}

	return merged;
}

async function findSkillFiles(root: string, fileReader: SkillFileReader, maxDepth: number): Promise<string[]> {
	const results: string[] = [];
	const visit = async (dir: string, depth: number): Promise<void> => {
		if (depth > maxDepth) {
			return;
		}

		const directSkill = path.join(dir, "SKILL.md");
		if (await fileReader.exists(directSkill) && await fileReader.isFile(directSkill)) {
			results.push(directSkill);
			return;
		}

		for (const entry of await safeListDir(fileReader, dir)) {
			const child = path.join(dir, entry);
			if (await fileReader.isDirectory(child)) {
				await visit(child, depth + 1);
			}
		}
	};

	await visit(root, 0);
	return results;
}

function getDefaultSkillRoots(home = process.env.HOME ?? ""): string[] {
	if (!home) {
		return [];
	}

	return [
		path.join(home, ".codex", "skills"),
		path.join(home, ".codex", "skills", ".system"),
		path.join(home, ".agents", "skills"),
	];
}

function runCommand(command: string, args: string[], options: SpawnOptionsWithoutStdio): Promise<CommandResult> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const child = nodeSpawn(command, args, options);
		const timeout = globalThis.setTimeout(() => {
			child.kill();
			finish({ code: null, stdout, stderr: stderr || "Timed out." });
		}, CODEX_HELP_TIMEOUT_MS);

		const finish = (result: CommandResult) => {
			if (settled) return;
			settled = true;
			globalThis.clearTimeout(timeout);
			resolve(result);
		};
		const appendOutput = (target: "stdout" | "stderr", data: Buffer) => {
			const text = data.toString();
			const nextBytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(text);
			if (nextBytes > MAX_CODEX_HELP_OUTPUT_BYTES) {
				child.kill();
				finish({ code: null, stdout, stderr: "Codex help output exceeded the capture limit." });
				return;
			}
			if (target === "stdout") {
				stdout += text;
			} else {
				stderr += text;
			}
		};

		child.stdout.on("data", (data: Buffer) => {
			appendOutput("stdout", data);
		});
		child.stderr.on("data", (data: Buffer) => {
			appendOutput("stderr", data);
		});
		child.on("error", (error) => {
			finish({ code: null, stdout, stderr: error.message });
		});
		child.on("close", (code) => {
			finish({ code, stdout, stderr });
		});
		child.stdin.end();
	});
}

function cleanHelpDescription(value: string): string {
	return value.replace(/\s+\[aliases?:.+?\]\s*$/i, "").trim();
}

function isCodexCommand(command: string): boolean {
	const rawCommand = (command || "codex").trim() || "codex";
	return path.basename(rawCommand).toLowerCase() === "codex";
}

function readFrontmatterValue(source: string, key: string): string {
	const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
	return stripQuotes(source.match(pattern)?.[1] ?? "");
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function sanitizeSkillName(value: string): string {
	return value.trim().replace(/\s+/g, "-");
}

async function safeListDir(fileReader: SkillFileReader, dir: string): Promise<string[]> {
	try {
		return (await fileReader.listDir(dir)).sort();
	} catch {
		return [];
	}
}

const nodeFileReader: SkillFileReader = {
	exists: async (filePath) => {
		try {
			await fs.promises.access(filePath);
			return true;
		} catch {
			return false;
		}
	},
	isDirectory: async (filePath) => {
		try {
			return (await fs.promises.stat(filePath)).isDirectory();
		} catch {
			return false;
		}
	},
	isFile: async (filePath) => {
		try {
			return (await fs.promises.stat(filePath)).isFile();
		} catch {
			return false;
		}
	},
	listDir: async (dirPath) => fs.promises.readdir(dirPath),
	readFile: async (filePath) => fs.promises.readFile(filePath, "utf8"),
};
