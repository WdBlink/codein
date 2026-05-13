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
