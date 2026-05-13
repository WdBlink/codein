import { describe, expect, it } from "vitest";
import type { DataAdapter, RequestUrlParam, RequestUrlResponse } from "obsidian";

import {
	CODEIAN_RELEASE_API_URL,
	installLatestCodeianRelease,
} from "../src/githubUpdater";

describe("installLatestCodeianRelease", () => {
	it("downloads required release assets and writes them into the plugin directory", async () => {
		const adapter = createFakeAdapter([".obsidian", ".obsidian/plugins", ".obsidian/plugins/codeian"]);
		const requester = createReleaseRequester({
			"main.js": "console.log('codeian');",
			"manifest.json": JSON.stringify({ id: "codeian", version: "0.3.0" }),
			"styles.css": ".codeian-view {}",
		});

		const result = await installLatestCodeianRelease(adapter, ".obsidian/plugins/codeian", "0.2.3", requester);

		expect(result).toEqual({
			currentVersion: "0.2.3",
			installedFiles: ["main.js", "manifest.json", "styles.css"],
			releaseUrl: "https://github.com/WdBlink/codein/releases/tag/v0.3.0",
			tagName: "v0.3.0",
			version: "0.3.0",
		});
		expect(adapter.files.get(".obsidian/plugins/codeian/main.js")).toBe("console.log('codeian');");
		expect(adapter.files.get(".obsidian/plugins/codeian/manifest.json")).toContain("\"version\":\"0.3.0\"");
		expect(adapter.files.get(".obsidian/plugins/codeian/styles.css")).toBe(".codeian-view {}");
	});

	it("fails before writing files when a required release asset is missing", async () => {
		const adapter = createFakeAdapter([".obsidian", ".obsidian/plugins", ".obsidian/plugins/codeian"]);
		const requester = createReleaseRequester({
			"main.js": "console.log('codeian');",
			"manifest.json": JSON.stringify({ id: "codeian", version: "0.3.0" }),
		});

		await expect(installLatestCodeianRelease(adapter, ".obsidian/plugins/codeian", "0.2.3", requester))
			.rejects.toThrow("missing styles.css");
		expect(adapter.files.size).toBe(0);
	});

	it("validates the downloaded manifest before installing", async () => {
		const adapter = createFakeAdapter([".obsidian", ".obsidian/plugins", ".obsidian/plugins/codeian"]);
		const requester = createReleaseRequester({
			"main.js": "console.log('codeian');",
			"manifest.json": JSON.stringify({ id: "other-plugin", version: "0.3.0" }),
			"styles.css": ".codeian-view {}",
		});

		await expect(installLatestCodeianRelease(adapter, ".obsidian/plugins/codeian", "0.2.3", requester))
			.rejects.toThrow("does not identify the Codeian plugin");
		expect(adapter.files.size).toBe(0);
	});
});

function createReleaseRequester(files: Record<string, string>) {
	const urls = new Map(Object.entries(files).map(([fileName, content]) => [`https://download.example/${fileName}`, content]));
	return async (request: RequestUrlParam | string): Promise<RequestUrlResponse> => {
		const url = typeof request === "string" ? request : request.url;
		if (url === CODEIAN_RELEASE_API_URL) {
			return createJsonResponse({
				assets: Object.keys(files).map((name) => ({
					browser_download_url: `https://download.example/${name}`,
					name,
				})),
				html_url: "https://github.com/WdBlink/codein/releases/tag/v0.3.0",
				tag_name: "v0.3.0",
			});
		}
		const content = urls.get(url);
		if (!content) {
			return createTextResponse("", 404);
		}
		return createTextResponse(content);
	};
}

function createFakeAdapter(existingDirs: string[]) {
	const dirs = new Set(existingDirs);
	const files = new Map<string, string>();
	const adapter = {
		exists: async (path: string) => dirs.has(path) || files.has(path),
		files,
		mkdir: async (path: string) => {
			dirs.add(path);
		},
		writeBinary: async (path: string, data: ArrayBuffer) => {
			files.set(path, new TextDecoder().decode(data));
		},
	} as Partial<DataAdapter> & {
		files: Map<string, string>;
	};
	return adapter as DataAdapter & { files: Map<string, string> };
}

function createJsonResponse(json: unknown): RequestUrlResponse {
	const text = JSON.stringify(json);
	return {
		arrayBuffer: new TextEncoder().encode(text).buffer,
		headers: {},
		json,
		status: 200,
		text,
	};
}

function createTextResponse(text: string, status = 200): RequestUrlResponse {
	return {
		arrayBuffer: new TextEncoder().encode(text).buffer,
		headers: {},
		json: undefined,
		status,
		text,
	};
}
