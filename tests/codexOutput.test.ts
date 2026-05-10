import { describe, expect, it } from "vitest";

import { buildCodexOutputSnapshot, extractFinalCodexOutput, getVisibleCodexOutput } from "../src/codexOutput";

describe("extractFinalCodexOutput", () => {
	it("extracts the final answer after the current Codex final marker", () => {
		const transcript = [
			"OpenAI Codex v0.130.0",
			"--------",
			"user",
			"Reply with exactly: Codeian GUI smoke test.",
			"2026-05-10T08:38:51.296008Z ERROR rmcp::transport::worker: worker quit",
			"codex",
			"Codeian GUI smoke test",
			"tokens used",
			"24,529",
		].join("\n");

		expect(extractFinalCodexOutput(transcript)).toBe("Codeian GUI smoke test");
	});

	it("uses the last final marker when multiple runs appear in a transcript", () => {
		const transcript = "codex\nold answer\ntokens used\n1\ncodex\nnew answer";
		expect(extractFinalCodexOutput(transcript)).toBe("new answer");
	});

	it("returns an empty string before a final answer marker exists", () => {
		expect(extractFinalCodexOutput("OpenAI Codex v0.130.0\nuser\nhello")).toBe("");
	});
});

describe("buildCodexOutputSnapshot", () => {
	it("separates raw output from final output", () => {
		const snapshot = buildCodexOutputSnapshot("metadata\ncodex\nFinal only");

		expect(snapshot).toEqual({
			finalOutput: "Final only",
			hasFinalOutput: true,
			rawOutput: "metadata\ncodex\nFinal only",
		});
	});

	it("falls back to concise visible text when no final answer exists", () => {
		expect(getVisibleCodexOutput("metadata only", "Waiting")).toBe("Waiting");
	});
});
