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

	it("declares required manifest identity fields", () => {
		expect(manifest.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
		expect(manifest.name.trim()).toBe("Codeian");
		expect(manifest.description.trim().length).toBeGreaterThan(20);
		expect(manifest.author.trim().length).toBeGreaterThan(0);
	});

	it("uses semver for package and manifest versions", () => {
		expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("declares an Obsidian minimum app version", () => {
		expect(manifest.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("declares a Node runtime compatible with the test toolchain", () => {
		expect(packageJson.engines.node).toBe(">=20.19.0");
	});
});
