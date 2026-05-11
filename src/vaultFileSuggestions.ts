import type { PromptSuggestion } from "./promptSuggestions";

export interface VaultFileLike {
	path: string;
	basename?: string;
	extension?: string;
}

export interface VaultFileSuggestionOptions {
	configDir?: string;
	limit?: number;
}

const IGNORED_PATH_SEGMENTS = new Set([".git", "node_modules"]);
const MAX_VAULT_FILE_SUGGESTIONS = 500;

export function buildVaultFileSuggestions(
	files: readonly VaultFileLike[],
	options: VaultFileSuggestionOptions = {},
): PromptSuggestion[] {
	const configDir = normalizeVaultPath(options.configDir ?? "");
	const limit = options.limit ?? MAX_VAULT_FILE_SUGGESTIONS;
	return files
		.map((file) => ({
			...file,
			path: normalizeVaultPath(file.path),
		}))
		.filter((file) => isMentionableMarkdownFile(file, configDir))
		.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }))
		.slice(0, limit)
		.map((file) => {
			const basename = file.basename?.trim() || getPathBasename(file.path);
			return {
				detail: file.path,
				label: `@${basename}`,
				trigger: "@",
				value: `@${file.path}`,
			};
		});
}

function isMentionableMarkdownFile(file: VaultFileLike, configDir: string): boolean {
	if (!file.path || pathHasIgnoredSegment(file.path, configDir)) {
		return false;
	}
	return (file.extension ?? getPathExtension(file.path)).toLowerCase() === "md";
}

function pathHasIgnoredSegment(filePath: string, configDir: string): boolean {
	return filePath
		.split("/")
		.some((segment) => IGNORED_PATH_SEGMENTS.has(segment) || segment === configDir || segment.startsWith("."));
}

function normalizeVaultPath(filePath: string): string {
	return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function getPathBasename(filePath: string): string {
	const filename = filePath.split("/").pop() ?? filePath;
	return filename.replace(/\.md$/i, "");
}

function getPathExtension(filePath: string): string {
	const filename = filePath.split("/").pop() ?? "";
	const extensionIndex = filename.lastIndexOf(".");
	return extensionIndex >= 0 ? filename.slice(extensionIndex + 1) : "";
}
