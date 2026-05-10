import { describe, expect, it } from "vitest";

import { buildPersistedSidebarState } from "../src/sessionState";

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
