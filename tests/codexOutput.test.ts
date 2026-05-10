import { describe, expect, it } from "vitest";

import {
	appendCodexJsonChunk,
	createCodexJsonStreamState,
	flushCodexJsonStream,
	formatCodexUsage,
} from "../src/codexOutput";

describe("Codex JSON output parsing", () => {
	it("extracts only the final assistant message from Codex JSONL", () => {
		const state = createCodexJsonStreamState();

		appendCodexJsonChunk(state, [
			"{\"type\":\"thread.started\",\"thread_id\":\"abc\"}",
			"{\"type\":\"turn.started\"}",
			"{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"agent_message\",\"text\":\"Clean final answer\"}}",
			"{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":10,\"output_tokens\":3,\"reasoning_output_tokens\":1}}",
		].join("\n"));
		const snapshot = flushCodexJsonStream(state);

		expect(snapshot.finalOutput).toBe("Clean final answer");
		expect(snapshot.hasFinalOutput).toBe(true);
		expect(snapshot.eventCount).toBe(4);
		expect(snapshot.usage).toEqual({
			inputTokens: 10,
			outputTokens: 3,
			reasoningOutputTokens: 1,
		});
	});

	it("handles split JSON lines across stream chunks", () => {
		const state = createCodexJsonStreamState();
		appendCodexJsonChunk(state, "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",");
		appendCodexJsonChunk(state, "\"text\":\"split final\"}}\n");

		expect(flushCodexJsonStream(state).finalOutput).toBe("split final");
	});

	it("keeps non-JSON diagnostics out of the final output", () => {
		const state = createCodexJsonStreamState();
		appendCodexJsonChunk(state, "OpenAI Codex v0.130.0\n");

		const snapshot = flushCodexJsonStream(state);
		expect(snapshot.finalOutput).toBe("");
		expect(snapshot.errorText).toContain("OpenAI Codex");
	});

	it("formats compact usage text", () => {
		expect(formatCodexUsage({ outputTokens: 17, reasoningOutputTokens: 9 })).toBe("17 output · 9 reasoning");
		expect(formatCodexUsage(null)).toBe("");
	});
});
