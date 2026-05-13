import { normalizePath, requestUrl, type DataAdapter, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

export const CODEIAN_RELEASE_API_URL = "https://api.github.com/repos/WdBlink/codein/releases/latest";
export const CODEIAN_RELEASE_FILES = ["main.js", "manifest.json", "styles.css"] as const;

export interface GitHubReleaseUpdateResult {
	currentVersion: string;
	installedFiles: string[];
	releaseUrl: string;
	tagName: string;
	version: string;
}

export type ReleaseFileName = typeof CODEIAN_RELEASE_FILES[number];

type Requester = (request: RequestUrlParam | string) => Promise<RequestUrlResponse>;

interface GitHubReleaseAsset {
	name?: unknown;
	browser_download_url?: unknown;
}

interface GitHubReleaseResponse {
	tag_name?: unknown;
	html_url?: unknown;
	assets?: unknown;
}

interface DownloadedReleaseAsset {
	data: ArrayBuffer;
	fileName: ReleaseFileName;
	text: string;
}

export async function installLatestCodeianRelease(
	adapter: DataAdapter,
	pluginDir: string,
	currentVersion: string,
	requester: Requester = requestUrl,
): Promise<GitHubReleaseUpdateResult> {
	const release = await fetchLatestRelease(requester);
	const downloads = await Promise.all(CODEIAN_RELEASE_FILES.map((fileName) => downloadReleaseAsset(release, fileName, requester)));
	const manifestAsset = downloads.find((asset) => asset.fileName === "manifest.json");
	const releaseVersion = manifestAsset ? readReleaseManifestVersion(manifestAsset.text) : "";

	await ensureDirectory(adapter, pluginDir);
	for (const asset of downloads) {
		await adapter.writeBinary(normalizePath(`${pluginDir}/${asset.fileName}`), asset.data);
	}

	return {
		currentVersion,
		installedFiles: downloads.map((asset) => asset.fileName),
		releaseUrl: release.url,
		tagName: release.tagName,
		version: releaseVersion,
	};
}

async function fetchLatestRelease(requester: Requester): Promise<{ assets: Map<string, string>; tagName: string; url: string }> {
	const response = await requester({
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		url: CODEIAN_RELEASE_API_URL,
	});
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`GitHub release lookup failed with HTTP ${response.status}.`);
	}

	const body = response.json as GitHubReleaseResponse;
	const assets = Array.isArray(body.assets) ? body.assets as GitHubReleaseAsset[] : [];
	const assetMap = new Map<string, string>();
	for (const asset of assets) {
		if (typeof asset.name === "string" && typeof asset.browser_download_url === "string") {
			assetMap.set(asset.name, asset.browser_download_url);
		}
	}

	const tagName = typeof body.tag_name === "string" ? body.tag_name : "";
	const url = typeof body.html_url === "string" ? body.html_url : CODEIAN_RELEASE_API_URL;
	if (!tagName) {
		throw new Error("GitHub release response did not include a tag name.");
	}

	return { assets: assetMap, tagName, url };
}

async function downloadReleaseAsset(
	release: { assets: Map<string, string> },
	fileName: ReleaseFileName,
	requester: Requester,
): Promise<DownloadedReleaseAsset> {
	const url = release.assets.get(fileName);
	if (!url) {
		throw new Error(`Latest GitHub release is missing ${fileName}.`);
	}

	const response = await requester({ url });
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Downloading ${fileName} failed with HTTP ${response.status}.`);
	}
	if (response.arrayBuffer.byteLength === 0) {
		throw new Error(`Downloaded ${fileName} is empty.`);
	}

	return {
		data: response.arrayBuffer,
		fileName,
		text: response.text || decodeUtf8(response.arrayBuffer),
	};
}

function readReleaseManifestVersion(manifestText: string): string {
	let manifest: { id?: unknown; version?: unknown };
	try {
		manifest = JSON.parse(manifestText) as { id?: unknown; version?: unknown };
	} catch {
		throw new Error("Downloaded manifest.json is not valid JSON.");
	}
	if (manifest.id !== "codeian") {
		throw new Error("Downloaded manifest.json does not identify the Codeian plugin.");
	}
	if (typeof manifest.version !== "string" || !manifest.version.trim()) {
		throw new Error("Downloaded manifest.json is missing a version.");
	}
	return manifest.version;
}

async function ensureDirectory(adapter: DataAdapter, dir: string): Promise<void> {
	const normalized = normalizePath(dir);
	const parts = normalized.split("/").filter(Boolean);
	let current = normalized.startsWith("/") ? "/" : "";
	for (const part of parts) {
		current = normalizePath(current ? `${current}/${part}` : part);
		if (!await adapter.exists(current)) {
			await adapter.mkdir(current);
		}
	}
}

function decodeUtf8(data: ArrayBuffer): string {
	return new TextDecoder().decode(data);
}
