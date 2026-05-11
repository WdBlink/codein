import { describe, expect, it } from "vitest";

import { buildVaultFileSuggestions } from "../src/vaultFileSuggestions";

describe("vault file suggestions", () => {
	it("creates mention suggestions from vault markdown files", () => {
		expect(buildVaultFileSuggestions([
			{ path: "PROJECT_BRIEF.md", basename: "PROJECT_BRIEF", extension: "md" },
			{ path: "docs/Smoke Checklist.md", basename: "Smoke Checklist", extension: "md" },
			{ path: "image.png", basename: "image", extension: "png" },
		])).toEqual([
			{
				detail: "docs/Smoke Checklist.md",
				label: "@Smoke Checklist",
				trigger: "@",
				value: "@docs/Smoke Checklist.md",
			},
			{
				detail: "PROJECT_BRIEF.md",
				label: "@PROJECT_BRIEF",
				trigger: "@",
				value: "@PROJECT_BRIEF.md",
			},
		]);
	});

	it("excludes hidden, Obsidian config, git, and dependency paths", () => {
		expect(buildVaultFileSuggestions([
			{ path: ".config/plugins/codeian/data.md", extension: "md" },
			{ path: ".hidden/note.md", extension: "md" },
			{ path: ".git/COMMIT_EDITMSG.md", extension: "md" },
			{ path: "node_modules/pkg/README.md", extension: "md" },
			{ path: "notes/Visible.md", basename: "Visible", extension: "md" },
		], { configDir: ".config" }).map((suggestion) => suggestion.value)).toEqual(["@notes/Visible.md"]);
	});
});
