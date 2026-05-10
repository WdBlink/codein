import { describe, expect, it } from "vitest";

import { DEFAULT_CODEX_ARGS } from "../src/defaults";
import type { CodeianSettings } from "../src/settings";
import { buildPersistedSidebarState, resolveInitialSidebarPrompt } from "../src/sessionState";

const SETTINGS: CodeianSettings = {
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	codexEffort: "medium",
	codexModel: "gpt-5.4-mini",
	defaultPrompt: "",
	lastOutput: "",
	lastPrompt: "",
	lastPromptContainsNoteContext: false,
	lastStatus: "Ready",
	workingDirectory: "",
};

describe("buildPersistedSidebarState", () => {
	it("does not persist note-context prompts or output that may echo note content", () => {
		expect(buildPersistedSidebarState("Path: secret.md\nsecret", "secret echo", true)).toEqual({
			lastOutput: "",
			lastPrompt: "",
			lastPromptContainsNoteContext: true,
		});
	});

	it("persists ordinary prompt and output for sidebar continuity", () => {
		expect(buildPersistedSidebarState("List files", "done", false)).toEqual({
			lastOutput: "done",
			lastPrompt: "List files",
			lastPromptContainsNoteContext: false,
		});
	});
});

describe("resolveInitialSidebarPrompt", () => {
	it("starts blank when there is no saved or configured prompt", () => {
		expect(resolveInitialSidebarPrompt(SETTINGS)).toBe("");
	});

	it("uses the configured default prompt when there is no saved prompt", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			defaultPrompt: "Use concise answers.",
		})).toBe("Use concise answers.");
	});

	it("prefers a saved prompt over the configured default prompt", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			defaultPrompt: "Default",
			lastPrompt: "Saved",
		})).toBe("Saved");
	});

	it("starts from a blank composer after a completed run with no configured default prompt", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			lastOutput: "done",
			lastPrompt: "Already sent",
		})).toBe("");
	});

	it("does not restore note-context prompts", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			defaultPrompt: "Default",
			lastPrompt: "Path: secret.md",
			lastPromptContainsNoteContext: true,
		})).toBe("");
	});
});
