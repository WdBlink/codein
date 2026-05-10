import { describe, expect, it } from "vitest";

import manifest from "../manifest.json";
import packageJson from "../package.json";
import versions from "../versions.json";

describe("project metadata", () => {
	it("keeps manifest and package versions aligned", () => {
		expect(manifest.version).toBe(packageJson.version);
	});

	it("publishes the manifest version in versions.json", () => {
		expect(Object.keys(versions)).toContain(manifest.version);
	});

	it("keeps the minimum Obsidian app version aligned", () => {
		expect(versions[manifest.version as keyof typeof versions]).toBe(manifest.minAppVersion);
	});

	it("keeps package main aligned with the Obsidian build output", () => {
		expect(packageJson.main).toBe("main.js");
	});

	it("declares the plugin as desktop-only for CLI execution", () => {
		expect(manifest.isDesktopOnly).toBe(true);
	});
});
