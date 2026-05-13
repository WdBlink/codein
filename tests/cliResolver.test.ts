import { describe, expect, it } from "vitest";

import {
	getEnhancedPath,
	normalizeFileSystemPath,
	parsePathEntries,
	resolveCliCommand,
} from "../src/cliResolver";
import { DEFAULT_CODEX_ARGS } from "../src/defaults";
import type { CodeianSettings } from "../src/settings";

const SETTINGS: CodeianSettings = {
	activeSessionId: "",
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	codexEffort: "medium",
	codexModel: "gpt-5.4-mini",
	codexSandbox: "workspace-write",
	defaultPrompt: "",
	lastOutput: "",
	lastPrompt: "",
	lastPromptContainsNoteContext: false,
	lastStatus: "Ready",
	sessions: [],
	suppressYoloWarning: false,
	workingDirectory: "",
};

describe("getEnhancedPath", () => {
	it("preserves existing PATH entries and adds common GUI app binary paths", () => {
		const enhanced = getEnhancedPath("/custom/bin:/usr/bin", "/Users/tester");
		const entries = parsePathEntries(enhanced);

		expect(entries).toContain("/custom/bin");
		expect(entries.indexOf("/opt/homebrew/bin")).toBeLessThan(entries.indexOf("/custom/bin"));
		expect(entries).toContain("/opt/homebrew/bin");
		expect(entries).toContain("/usr/local/bin");
		expect(entries).toContain("/Users/tester/.local/bin");
		expect(entries).toContain("/Users/tester/.volta/bin");
	});

	it("deduplicates path entries", () => {
		const entries = parsePathEntries(getEnhancedPath("/usr/local/bin:/usr/local/bin", "/Users/tester"));
		expect(entries.filter((entry) => entry === "/usr/local/bin")).toHaveLength(1);
	});
});

describe("resolveCliCommand", () => {
	it("resolves codex from the enhanced PATH", async () => {
		const result = await resolveCliCommand(SETTINGS, (filePath) => filePath === "/opt/homebrew/bin/codex");

		expect(result.command).toBe("/opt/homebrew/bin/codex");
		expect(result.wasResolvedFromPath).toBe(true);
		expect(parsePathEntries(result.env.PATH)).toContain("/opt/homebrew/bin");
	});

	it("prefers common local binary paths over inherited PATH entries", async () => {
		const result = await resolveCliCommand(SETTINGS, (filePath) => (
			filePath === "/opt/homebrew/bin/codex" || filePath === "/custom/bin/codex"
		));

		expect(result.command).toBe("/opt/homebrew/bin/codex");
	});

	it("keeps explicit command paths unchanged", async () => {
		const result = await resolveCliCommand({
			...SETTINGS,
			codexCommand: "/Users/tester/bin/codex",
		}, () => false);

		expect(result.command).toBe("/Users/tester/bin/codex");
		expect(result.wasResolvedFromPath).toBe(false);
	});

	it("falls back to the configured command name when it cannot be resolved", async () => {
		const result = await resolveCliCommand(SETTINGS, () => false);

		expect(result.command).toBe("codex");
		expect(result.wasResolvedFromPath).toBe(false);
		expect(result.path).toContain("/usr/local/bin");
	});
});

describe("normalizeFileSystemPath", () => {
	it("preserves leading slashes for absolute system executable paths", () => {
		expect(normalizeFileSystemPath("/opt/homebrew/bin/codex")).toBe("/opt/homebrew/bin/codex");
	});
});
