import { describe, expect, it } from "vitest";

import { getPromptSuggestions } from "../src/promptSuggestions";
import { buildVaultFileSuggestions } from "../src/vaultFileSuggestions";

describe("vault file suggestions", () => {
	it("creates mention suggestions from vault files", () => {
		expect(publicSuggestions(buildVaultFileSuggestions([
			{ path: "PROJECT_BRIEF.md", basename: "PROJECT_BRIEF", extension: "md" },
			{ path: "docs/Smoke Checklist.md", basename: "Smoke Checklist", extension: "md" },
			{ path: "image.png", basename: "image", extension: "png" },
		]))).toEqual([
			{
				detail: "docs/Smoke Checklist.md",
				label: "@Smoke Checklist",
				trigger: "@",
				value: "@docs/Smoke Checklist.md",
			},
			{
				detail: "image.png",
				label: "@image.png",
				trigger: "@",
				value: "@image.png",
			},
			{
				detail: "PROJECT_BRIEF.md",
				label: "@PROJECT_BRIEF",
				trigger: "@",
				value: "@PROJECT_BRIEF.md",
			},
		]);
	});

	it("creates mention suggestions from vault folders", () => {
		expect(publicSuggestions(buildVaultFileSuggestions([
			{ path: "PROJECT_BRIEF.md", basename: "PROJECT_BRIEF", extension: "md" },
		], {
			folders: [
				{ path: "LLM-Wiki/generated" },
				{ path: "LLM-Wiki/generated/transcript-source-compiler" },
				{ path: "LLM-Wiki/generated/transcript-source-compiler" },
			],
		}))).toEqual([
			{
				detail: "PROJECT_BRIEF.md",
				label: "@PROJECT_BRIEF",
				trigger: "@",
				value: "@PROJECT_BRIEF.md",
			},
			{
				detail: "Folder · LLM-Wiki/generated/",
				label: "@generated/",
				trigger: "@",
				value: "@LLM-Wiki/generated/",
			},
			{
				detail: "Folder · LLM-Wiki/generated/transcript-source-compiler/",
				label: "@transcript-source-compiler/",
				trigger: "@",
				value: "@LLM-Wiki/generated/transcript-source-compiler/",
			},
		]);
	});

	it("finds nested folder suggestions by basename or path fragment", () => {
		const suggestions = buildVaultFileSuggestions([], {
			folders: [
				{ path: "LLM-Wiki/generated/transcript-source-compiler" },
				{ path: "Projects/Meeting Notes" },
			],
		});

		expect(getPromptSuggestions("@transcript", 11, 6, suggestions).map((suggestion) => suggestion.value)).toEqual([
			"@LLM-Wiki/generated/transcript-source-compiler/",
		]);
		expect(getPromptSuggestions("@generated", 10, 6, suggestions).map((suggestion) => suggestion.value)).toEqual([
			"@LLM-Wiki/generated/transcript-source-compiler/",
		]);
	});

	it("finds vault files by path without extension and absolute vault path", () => {
		const suggestions = buildVaultFileSuggestions([
			{ path: "LLM-Wiki/raw/notes/手工川线下分享会.md", basename: "手工川线下分享会", extension: "md" },
		], {
			vaultPath: "/Users/echooo/SynologyDrive/Typora",
		});
		const relativePrompt = "@LLM-Wiki/raw/notes/手工川线下分享会";
		const absolutePrompt = "@/Users/echooo/SynologyDrive/Typora/LLM-Wiki/raw/notes/手工川线下分享会";

		expect(getPromptSuggestions(relativePrompt, relativePrompt.length, 6, suggestions).map((suggestion) => suggestion.value)).toEqual([
			"@LLM-Wiki/raw/notes/手工川线下分享会.md",
		]);
		expect(getPromptSuggestions(absolutePrompt, absolutePrompt.length, 6, suggestions).map((suggestion) => suggestion.value)).toEqual([
			"@LLM-Wiki/raw/notes/手工川线下分享会.md",
		]);
	});

	it("excludes hidden, Obsidian config, git, and dependency paths", () => {
		expect(buildVaultFileSuggestions([
			{ path: ".config/plugins/codeian/data.md", extension: "md" },
			{ path: ".hidden/note.md", extension: "md" },
			{ path: ".git/COMMIT_EDITMSG.md", extension: "md" },
			{ path: "node_modules/pkg/README.md", extension: "md" },
			{ path: "notes/Visible.md", basename: "Visible", extension: "md" },
		], {
			configDir: ".config",
			folders: [
				{ path: ".config/plugins" },
				{ path: ".obsidian/plugins" },
				{ path: ".hidden/folder" },
				{ path: ".git/refs" },
				{ path: "node_modules/pkg" },
				{ path: "notes/Folder" },
			],
		}).map((suggestion) => suggestion.value)).toEqual(["@notes/Visible.md", "@notes/Folder/"]);
	});

	it("handles empty and files-only vaults", () => {
		expect(buildVaultFileSuggestions([])).toEqual([]);
		expect(publicSuggestions(buildVaultFileSuggestions([
			{ path: "notes/Visible.md", basename: "Visible", extension: "md" },
		]))).toEqual([
			{
				detail: "notes/Visible.md",
				label: "@Visible",
				trigger: "@",
				value: "@notes/Visible.md",
			},
		]);
	});

	it("does not drop folder suggestions when the file limit is reached", () => {
		expect(buildVaultFileSuggestions([
			{ path: "a.md", basename: "a", extension: "md" },
			{ path: "b.md", basename: "b", extension: "md" },
		], {
			folders: [{ path: "Folder Target" }],
			limit: 1,
		}).map((suggestion) => suggestion.value)).toEqual(["@a.md", "@Folder Target/"]);
	});
});

function publicSuggestions(suggestions: ReturnType<typeof buildVaultFileSuggestions>) {
	return suggestions.map(({ searchText, ...suggestion }) => {
		void searchText;
		return suggestion;
	});
}
