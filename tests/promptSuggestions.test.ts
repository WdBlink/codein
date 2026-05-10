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

	it("applies a selected suggestion over the active token", () => {
		const [suggestion] = getPromptSuggestions("run /rev", 8);

		expect(applyPromptSuggestion("run /rev now", 8, suggestion)).toEqual({
			value: "run /review now",
			caret: 11,
		});
	});
});
