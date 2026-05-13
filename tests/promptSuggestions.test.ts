import { describe, expect, it } from "vitest";

import { applyPromptSuggestion, getPromptSuggestions, getPromptTokenContext } from "../src/promptSuggestions";

describe("prompt suggestions", () => {
	it("detects slash token context at the caret", () => {
		expect(getPromptTokenContext("please /re", 10)).toEqual({
			trigger: "/",
			start: 7,
			end: 10,
			query: "re",
		});
	});

	it("does not trigger inside ordinary words", () => {
		expect(getPromptTokenContext("https://example.com", 8)).toBeNull();
		expect(getPromptSuggestions("email/name", 7)).toEqual([]);
	});

	it("filters skill candidates from dollar-prefixed tokens", () => {
		expect(getPromptSuggestions("$op", 3).map((suggestion) => suggestion.value)).toContain("$opc loop");
	});

	it("returns mention candidates for at-prefixed tokens", () => {
		expect(getPromptSuggestions("@cur", 4).map((suggestion) => suggestion.value)).toEqual(["@current-note"]);
	});

	it("keeps at-file token context across spaces and Chinese punctuation", () => {
		const prompt = "@LLM-Wiki/raw/notes/和 GPT 关于向量世界（AI 世界）什么最重要的讨论";

		expect(getPromptTokenContext(prompt, prompt.length)).toEqual({
			end: prompt.length,
			query: "llm-wiki/raw/notes/和 gpt 关于向量世界（ai 世界）什么最重要的讨论",
			start: 0,
			trigger: "@",
		});
	});

	it("matches mention candidates by label, value, and detail", () => {
		const suggestions = [
			{ trigger: "@", value: "@docs/Long Path.md", label: "@Long Path", detail: "docs/Long Path.md" },
			{ trigger: "@", value: "@notes/PROJECT_BRIEF.md", label: "@PROJECT_BRIEF", detail: "notes/PROJECT_BRIEF.md" },
		] as const;

		expect(getPromptSuggestions("@project", 8, 6, suggestions).map((suggestion) => suggestion.value)).toEqual([
			"@notes/PROJECT_BRIEF.md",
		]);
		expect(getPromptSuggestions("@docs", 5, 6, suggestions).map((suggestion) => suggestion.value)).toEqual([
			"@docs/Long Path.md",
		]);
	});

	it("applies a selected suggestion over the active token", () => {
		const [suggestion] = getPromptSuggestions("run /rev", 8);

		expect(applyPromptSuggestion("run /rev now", 8, suggestion)).toEqual({
			value: "run /review now",
			caret: 11,
		});
	});
});
