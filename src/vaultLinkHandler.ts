export interface AnchorLike {
	dataset?: Record<string, string | undefined>;
	getAttribute: (name: string) => string | null;
	textContent?: string | null;
}

export interface VaultLinkTarget {
	displayText: string;
	linktext: string;
}

export interface VaultLinkTargetOptions {
	vaultPath?: string;
}

export interface VaultFileResolverLike {
	getAbstractFileByPath: (path: string) => { path: string; children?: unknown } | null;
	getFiles: () => Array<{ path: string }>;
}

const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:", "obsidian:", "tel:"]);

export function getVaultLinkTarget(anchor: AnchorLike, options: VaultLinkTargetOptions = {}): VaultLinkTarget | null {
	const rawTarget = anchor.dataset?.href || anchor.getAttribute("data-href") || anchor.getAttribute("href") || "";
	const normalized = normalizeVaultLinkTarget(rawTarget, options);
	if (!normalized) {
		return null;
	}
	return {
		displayText: anchor.textContent?.trim() || normalized,
		linktext: normalized,
	};
}

export function normalizeVaultLinkTarget(rawTarget: string, options: VaultLinkTargetOptions = {}): string {
	let target = rawTarget.trim();
	if (!target || target.startsWith("#")) {
		return "";
	}

	if (isIgnoredScheme(target)) {
		return "";
	}

	target = stripObsidianAppPrefix(target);
	target = safeDecodeUri(target).trim();
	target = stripQuery(target);
	target = stripWrappingAngles(target);
	target = stripLeadingMention(target);
	target = normalizeSlashes(target);
	target = stripVaultPath(target, options.vaultPath);
	if (target.startsWith("/") || target.startsWith("~")) {
		return "";
	}
	target = target.replace(/^\.\//, "").replace(/^\/+/, "");
	return target;
}

export function getVaultLinkLookupPath(linktext: string): string {
	return linktext
		.split("#")[0]
		?.split("^")[0]
		?.replace(/\/+$/, "")
		.trim() ?? "";
}

export function resolveVaultFileLink(
	vault: VaultFileResolverLike,
	linktext: string,
	sourcePath = "",
): string | null {
	const candidates = getVaultLinkCandidates(linktext, sourcePath);
	for (const candidate of candidates) {
		const exact = vault.getAbstractFileByPath(candidate);
		if (exact && !("children" in exact)) {
			return exact.path;
		}
	}

	const looseCandidates = new Set<string>();
	for (const candidate of candidates) {
		looseCandidates.add(toLooseLinkKey(candidate));
		looseCandidates.add(toLooseLinkKey(stripMarkdownExtension(candidate)));
	}
	for (const file of vault.getFiles()) {
		const aliases = getLooseFileAliases(file.path);
		if (aliases.some((alias) => looseCandidates.has(alias))) {
			return file.path;
		}
	}
	return null;
}

export function toLooseLinkKey(value: string): string {
	return stripMarkdownExtension(value)
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[（(][^（）()]*[）)]/g, "")
		.replace(/[\\/\s\-_.。,，、:：;；'"“”‘’`~!！?？[\]{}<>《》|]+/g, "");
}

function isIgnoredScheme(target: string): boolean {
	const schemeMatch = target.match(/^[a-z][a-z0-9+.-]*:/i);
	if (!schemeMatch?.[0]) {
		return false;
	}
	const scheme = schemeMatch[0].toLowerCase();
	if (scheme === "app:" && target.toLowerCase().startsWith("app://obsidian.md/")) {
		return false;
	}
	return EXTERNAL_SCHEMES.has(scheme) || scheme !== "app:";
}

function stripObsidianAppPrefix(target: string): string {
	return target.replace(/^app:\/\/obsidian\.md\/+/i, "");
}

function safeDecodeUri(target: string): string {
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

function stripQuery(target: string): string {
	const queryIndex = target.indexOf("?");
	return queryIndex >= 0 ? target.slice(0, queryIndex) : target;
}

function stripWrappingAngles(target: string): string {
	if (target.startsWith("<") && target.endsWith(">")) {
		return target.slice(1, -1).trim();
	}
	return target;
}

function stripLeadingMention(target: string): string {
	return target.startsWith("@") ? target.slice(1).trim() : target;
}

function normalizeSlashes(target: string): string {
	return target.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function getVaultLinkCandidates(linktext: string, sourcePath: string): string[] {
	const lookupPath = getVaultLinkLookupPath(linktext);
	if (!lookupPath) {
		return [];
	}
	const candidates = new Set<string>();
	addPathCandidates(candidates, lookupPath);
	if (sourcePath && !lookupPath.includes("/")) {
		const sourceDir = sourcePath.split("/").slice(0, -1).join("/");
		if (sourceDir) {
			addPathCandidates(candidates, `${sourceDir}/${lookupPath}`);
		}
	}
	return [...candidates];
}

function addPathCandidates(candidates: Set<string>, path: string): void {
	const normalized = normalizeSlashes(path).replace(/^\.\//, "").replace(/^\/+/, "").trim();
	if (!normalized) {
		return;
	}
	candidates.add(normalized);
	if (!normalized.toLowerCase().endsWith(".md")) {
		candidates.add(`${normalized}.md`);
	}
}

function getLooseFileAliases(filePath: string): string[] {
	const withoutExtension = stripMarkdownExtension(filePath);
	const basename = withoutExtension.split("/").pop() ?? withoutExtension;
	return [
		toLooseLinkKey(filePath),
		toLooseLinkKey(withoutExtension),
		toLooseLinkKey(basename),
	];
}

function stripMarkdownExtension(filePath: string): string {
	return filePath.replace(/\.md$/i, "");
}

function stripVaultPath(target: string, vaultPath = ""): string {
	if (!vaultPath) {
		return target;
	}
	const normalizedTarget = normalizeSlashes(target);
	const normalizedVaultPath = normalizeSlashes(vaultPath).replace(/\/+$/, "");
	if (normalizedTarget === normalizedVaultPath) {
		return "";
	}
	if (normalizedTarget.startsWith(`${normalizedVaultPath}/`)) {
		return normalizedTarget.slice(normalizedVaultPath.length + 1);
	}
	return target;
}
