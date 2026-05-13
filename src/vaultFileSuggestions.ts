import type { PromptSuggestion } from "./promptSuggestions";

export interface VaultFileLike {
	path: string;
	basename?: string;
	extension?: string;
}

export interface VaultFolderLike {
	path: string;
}

export interface VaultFileSuggestionOptions {
	configDir?: string;
	folders?: readonly VaultFolderLike[];
	limit?: number;
	vaultPath?: string;
}

const IGNORED_PATH_SEGMENTS = new Set([".git", "node_modules"]);
const MAX_VAULT_FILE_SUGGESTIONS = 500;

export function buildVaultFileSuggestions(
	files: readonly VaultFileLike[],
	options: VaultFileSuggestionOptions = {},
): PromptSuggestion[] {
	const configDir = normalizeVaultPath(options.configDir ?? "");
	const limit = options.limit ?? MAX_VAULT_FILE_SUGGESTIONS;
	const fileSuggestions: PromptSuggestion[] = files
		.map((file) => ({
			...file,
			path: normalizeVaultPath(file.path),
		}))
		.filter((file) => isMentionableFile(file, configDir))
		.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }))
		.map((file) => {
			const basename = getFileDisplayName(file);
			return {
				detail: file.path,
				label: `@${basename}`,
				searchText: buildVaultSearchText(file.path, options.vaultPath),
				trigger: "@",
				value: `@${file.path}`,
			};
		});
	const folderSuggestions: PromptSuggestion[] = uniqueFolders(options.folders ?? [])
		.filter((folder) => isMentionableFolder(folder, configDir))
		.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }))
		.map((folder) => {
			const basename = getPathBasename(folder.path);
			const folderPath = `${folder.path}/`;
			return {
				detail: `Folder · ${folderPath}`,
				label: `@${basename}/`,
				searchText: buildVaultSearchText(folderPath, options.vaultPath),
				trigger: "@",
				value: `@${folderPath}`,
			};
		});
	return [...fileSuggestions.slice(0, limit), ...folderSuggestions.slice(0, limit)];
}

function isMentionableFile(file: VaultFileLike, configDir: string): boolean {
	if (!file.path || pathHasIgnoredSegment(file.path, configDir)) {
		return false;
	}
	return Boolean(getPathBasename(file.path));
}

function isMentionableFolder(folder: VaultFolderLike, configDir: string): boolean {
	return Boolean(folder.path && !pathHasIgnoredSegment(folder.path, configDir));
}

function uniqueFolders(folders: readonly VaultFolderLike[]): VaultFolderLike[] {
	const seen = new Set<string>();
	const result: VaultFolderLike[] = [];
	for (const folder of folders) {
		const path = normalizeVaultPath(folder.path).replace(/\/+$/, "");
		if (!path || seen.has(path)) {
			continue;
		}
		seen.add(path);
		result.push({ path });
	}
	return result;
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

function getFileDisplayName(file: VaultFileLike): string {
	const filename = file.path.split("/").pop() ?? file.path;
	const extension = (file.extension ?? getPathExtension(file.path)).toLowerCase();
	if (extension === "md") {
		return file.basename?.trim() || filename.replace(/\.md$/i, "");
	}
	return file.basename?.trim() && file.extension
		? `${file.basename.trim()}.${file.extension}`
		: filename;
}

function buildVaultSearchText(vaultPath: string, rootPath = ""): string {
	const normalizedPath = normalizeVaultPath(vaultPath);
	const aliases = new Set<string>([
		normalizedPath,
		`/${normalizedPath}`,
		stripMarkdownExtension(normalizedPath),
		`/${stripMarkdownExtension(normalizedPath)}`,
	]);
	if (rootPath) {
		const normalizedRootPath = normalizeVaultPath(rootPath);
		aliases.add(`${normalizedRootPath}/${normalizedPath}`);
		aliases.add(`${normalizedRootPath}/${stripMarkdownExtension(normalizedPath)}`);
		aliases.add(`/${normalizedRootPath}/${normalizedPath}`);
		aliases.add(`/${normalizedRootPath}/${stripMarkdownExtension(normalizedPath)}`);
	}
	return [...aliases].join(" ");
}

function stripMarkdownExtension(filePath: string): string {
	return filePath.replace(/\.md$/i, "");
}

function getPathExtension(filePath: string): string {
	const filename = filePath.split("/").pop() ?? "";
	const extensionIndex = filename.lastIndexOf(".");
	return extensionIndex >= 0 ? filename.slice(extensionIndex + 1) : "";
}
