import { describe, expect, it } from "vitest";

import { buildCurrentNoteContextPrompt } from "../src/promptContext";

describe("buildCurrentNoteContextPrompt", () => {
	it("includes the note path and markdown body exactly once", () => {
		const prompt = buildCurrentNoteContextPrompt("folder/note.md", "# Title\nBody");

		expect(prompt.match(/^Path: folder\/note\.md$/gm)).toHaveLength(1);
		expect(prompt.match(/^```markdown$/gm)).toHaveLength(1);
		expect(prompt.match(/^```$/gm)).toHaveLength(1);
		expect(prompt).toContain("# Title\nBody");
		expect(prompt.endsWith("Task:")).toBe(true);
	});
});
