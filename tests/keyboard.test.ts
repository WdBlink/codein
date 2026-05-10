import { describe, expect, it } from "vitest";

import { shouldRunPromptFromKey } from "../src/keyboard";

describe("shouldRunPromptFromKey", () => {
	it("runs on Enter", () => {
		expect(shouldRunPromptFromKey({ key: "Enter", shiftKey: false })).toBe(true);
	});

	it("does not run on Shift+Enter", () => {
		expect(shouldRunPromptFromKey({ key: "Enter", shiftKey: true })).toBe(false);
	});

	it("does not run while an IME composition is active", () => {
		expect(shouldRunPromptFromKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
	});

	it("ignores non-Enter keys", () => {
		expect(shouldRunPromptFromKey({ key: "a", shiftKey: false })).toBe(false);
	});
});
