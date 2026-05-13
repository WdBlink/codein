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

	it("preserves concise reasoning summary items outside the final output", () => {
		const state = createCodexJsonStreamState();
		appendCodexJsonChunk(state, [
			JSON.stringify({
				type: "item.completed",
				item: {
					id: "reasoning_1",
					type: "reasoning",
					summary: [{ text: "Checked the sidebar state model before changing persistence." }],
				},
			}),
			JSON.stringify({
				type: "event_msg",
				payload: {
					id: "reasoning_2",
					type: "reasoning_summary",
					content: "Chose a five-session cap to keep the sidebar compact.",
				},
			}),
			"{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"Final only\"}}",
		].join("\n") + "\n");

		const snapshot = flushCodexJsonStream(state);
		expect(snapshot.finalOutput).toBe("Final only");
		expect(snapshot.reasoningItems).toEqual([
			{
				id: "reasoning_1",
				text: "Checked the sidebar state model before changing persistence.",
			},
			{
				id: "reasoning_2",
				text: "Chose a five-session cap to keep the sidebar compact.",
			},
		]);
	});

	it("extracts apply_patch file change events without mixing them into final output", () => {
		const state = createCodexJsonStreamState();
		appendCodexJsonChunk(state, JSON.stringify({
			type: "event_msg",
			payload: {
				type: "patch_apply_end",
				call_id: "call_patch",
				success: true,
				changes: {
					"Notes/demo.md": {
						type: "update",
						unified_diff: "@@\n-old\n+new\n+next\n",
					},
				},
			},
		}) + "\n");
		appendCodexJsonChunk(state, "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"Done\"}}\n");

		const snapshot = flushCodexJsonStream(state);
		expect(snapshot.finalOutput).toBe("Done");
		expect(snapshot.fileChanges).toHaveLength(1);
		expect(snapshot.fileChanges[0]).toMatchObject({
			id: "call_patch",
			status: "completed",
			toolName: "apply_patch",
		});
		expect(snapshot.fileChanges[0]?.entries[0]).toMatchObject({
			addedLines: 2,
			kind: "update",
			path: "Notes/demo.md",
			removedLines: 1,
		});
	});

	it("updates file_change lifecycle events from codex exec json output", () => {
		const state = createCodexJsonStreamState();
		appendCodexJsonChunk(state, [
			JSON.stringify({
				type: "item.started",
				item: {
					id: "item_1",
					type: "file_change",
					changes: [{ path: "/tmp/vault/codeian-write-test.md", kind: "add" }],
					status: "in_progress",
				},
			}),
			JSON.stringify({
				type: "item.completed",
				item: {
					id: "item_1",
					type: "file_change",
					changes: [{ path: "/tmp/vault/codeian-write-test.md", kind: "add" }],
					status: "completed",
				},
			}),
		].join("\n") + "\n");

		const snapshot = flushCodexJsonStream(state);
		expect(snapshot.fileChanges).toEqual([{
			entries: [{
				addedLines: undefined,
				diff: undefined,
				kind: "add",
				path: "/tmp/vault/codeian-write-test.md",
				removedLines: undefined,
			}],
			id: "item_1",
			status: "completed",
			toolName: "file_change",
		}]);
	});

	it("formats compact usage text", () => {
		expect(formatCodexUsage({ outputTokens: 17, reasoningOutputTokens: 9 })).toBe("17 output · 9 reasoning");
		expect(formatCodexUsage(null)).toBe("");
	});
});
