import * as fs from "fs";
import * as path from "path";

import type { CodeianSettings } from "./settings";

export interface ResolvedCommand {
	command: string;
	env: Record<string, string>;
	path: string;
	wasResolvedFromPath: boolean;
}

export interface CliSelfTestResult {
	ok: boolean;
	command: string;
	message: string;
	stdout: string;
	stderr: string;
	code: number | null;
}

export type ExecutableExists = (filePath: string) => boolean | Promise<boolean>;

const PATH_SEPARATOR = process.platform === "win32" ? ";" : ":";

export function getEnhancedPath(basePath = process.env.PATH ?? "", home = getHomeDirectory()): string {
	const entries = [
		...getCommonBinaryPaths(home),
		...parsePathEntries(basePath),
	];
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const entry of entries) {
		if (!entry) continue;
		const normalized = process.platform === "win32" ? entry.toLowerCase() : entry;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(entry);
	}

	return unique.join(PATH_SEPARATOR);
}

export async function resolveCliCommand(
	settings: CodeianSettings,
	executableExists: ExecutableExists = defaultExecutableExists,
): Promise<ResolvedCommand> {
	const rawCommand = (settings.codexCommand || "codex").trim() || "codex";
	const baseEnv = getProcessEnv();
	const enhancedPath = getEnhancedPath(baseEnv.PATH);
	const env = { ...baseEnv, PATH: enhancedPath };

	if (hasPathSeparator(rawCommand)) {
		return {
			command: normalizeFileSystemPath(rawCommand),
			env,
			path: enhancedPath,
			wasResolvedFromPath: false,
		};
	}

	for (const dir of parsePathEntries(enhancedPath)) {
		const candidate = await joinPath(dir, rawCommand);
		if (await executableExists(candidate)) {
			return {
				command: candidate,
				env,
				path: enhancedPath,
				wasResolvedFromPath: true,
			};
		}
	}

	return {
		command: rawCommand,
		env,
		path: enhancedPath,
		wasResolvedFromPath: false,
	};
}

export function parsePathEntries(value: string): string[] {
	return value
		.split(PATH_SEPARATOR)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function getCommonBinaryPaths(home: string): string[] {
	const paths = [
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
		"/opt/local/bin",
	];

	if (!home) return paths;

	return [
		...paths,
		`${home}/.local/bin`,
		`${home}/.cargo/bin`,
		`${home}/.bun/bin`,
		`${home}/.volta/bin`,
		`${home}/.asdf/shims`,
		`${home}/.asdf/bin`,
		`${home}/.fnm`,
		`${home}/.npm-global/bin`,
		`${home}/Library/pnpm`,
	];
}

function hasPathSeparator(command: string): boolean {
	return command.includes("/") || command.includes("\\");
}

function getHomeDirectory(): string {
	return process.env.HOME ?? process.env.USERPROFILE ?? "";
}

function getProcessEnv(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
	);
}

function joinPath(dir: string, command: string): string {
	return normalizeFileSystemPath(path.join(dir, command));
}

async function defaultExecutableExists(filePath: string): Promise<boolean> {
	try {
		if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
			return false;
		}
		if (process.platform === "win32") {
			return true;
		}
		fs.accessSync(filePath, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function normalizeFileSystemPath(filePath: string): string {
	return path.normalize(filePath);
}
