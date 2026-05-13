import { describe, expect, it } from "vitest";

import { DEFAULT_CODEX_ARGS } from "../src/defaults";
import type { CodeianSettings } from "../src/settings";
import {
	buildCodexPromptForSession,
	buildPersistedSidebarState,
	clearActiveSidebarSessionConversation,
	createNewSidebarSession,
	deleteSidebarSession,
	getActiveSidebarSession,
	MAX_CODEIAN_SESSIONS,
	normalizeSidebarSessions,
	resolveInitialSidebarPrompt,
	updateActiveSidebarSession,
	updateSidebarSessionMetadata,
} from "../src/sessionState";

const SETTINGS: CodeianSettings = {
	activeSessionId: "",
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	codexEffort: "medium",
	codexModel: "gpt-5.4-mini",
	codexSandbox: "workspace-write",
	defaultPrompt: "",
	lastOutput: "",
	lastPrompt: "",
	lastPromptContainsNoteContext: false,
	lastStatus: "Ready",
	sessions: [],
	suppressYoloWarning: false,
	workingDirectory: "",
};

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

describe("sidebar sessions", () => {
	it("migrates legacy sidebar state into the first retained session", () => {
		const settings = {
			...SETTINGS,
			lastOutput: "done",
			lastPrompt: "Summarize this project",
		};

		normalizeSidebarSessions(settings, 1000);

		expect(settings.sessions).toHaveLength(1);
		expect(settings.activeSessionId).toBe(settings.sessions[0]?.id);
		expect(getActiveSidebarSession(settings)).toMatchObject({
			lastOutput: "done",
			lastPrompt: "Summarize this project",
			title: "Summarize this project",
		});
		expect(getActiveSidebarSession(settings).transcript.map((entry) => entry.content)).toEqual([
			"Summarize this project",
			"done",
		]);
	});

	it("creates a new retained session without deleting the previous conversation", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 1000);
		updateActiveSidebarSession(settings, {
			containsNoteContext: false,
			output: "old answer",
			prompt: "Old topic",
			reasoning: ["Checked context"],
		}, 1001);

		const previousId = settings.activeSessionId;
		const session = createNewSidebarSession(settings, 1002);

		expect(settings.activeSessionId).toBe(session.id);
		expect(settings.sessions.some((candidate) => candidate.id === previousId && candidate.lastOutput === "old answer")).toBe(true);
		expect(settings.sessions).toHaveLength(2);
	});

	it("builds a Codex prompt from only the active session transcript", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 5000);
		updateActiveSidebarSession(settings, {
			containsNoteContext: false,
			output: "The source folder is handcraft-chuan-offline-meeting/docx-extracted.",
			prompt: "Digest the offline meeting transcripts",
			reasoning: ["Identified the active transcript source."],
		}, 5001);

		createNewSidebarSession(settings, 5002);
		updateActiveSidebarSession(settings, {
			containsNoteContext: false,
			output: "A separate release task is complete.",
			prompt: "Prepare release notes",
			reasoning: [],
		}, 5003);

		const codexPrompt = buildCodexPromptForSession(getActiveSidebarSession(settings), "继续");

		expect(codexPrompt).toContain("Prepare release notes");
		expect(codexPrompt).toContain("Current user request:\n继续");
		expect(codexPrompt).not.toContain("handcraft-chuan-offline-meeting");
		expect(codexPrompt).not.toContain("Digest the offline meeting transcripts");
	});

	it("keeps the cancelled prompt as current-session context for a later continue request", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 6000);
		updateActiveSidebarSession(settings, {
			containsNoteContext: false,
			output: "",
			prompt: "消化一下 /Typora/LLM-Wiki/generated/transcript-source-compiler/handcraft-chuan-offline-meeting/docx-extracted 中的内容",
			reasoning: [],
		}, 6001);

		const codexPrompt = buildCodexPromptForSession(getActiveSidebarSession(settings), "继续");

		expect(codexPrompt).toContain("handcraft-chuan-offline-meeting/docx-extracted");
		expect(codexPrompt).toContain("Do not continue from other Codeian sessions");
		expect(codexPrompt).toContain("Current user request:\n继续");
	});

	it("does not persist note-context prompts or echoed note content into the transcript", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 7000);

		updateActiveSidebarSession(settings, {
			containsNoteContext: true,
			output: "secret echo",
			prompt: "Path: secret.md\nsecret note body",
			reasoning: ["Read note"],
		}, 7001);

		const activeSession = getActiveSidebarSession(settings);
		expect(activeSession.lastPrompt).toBe("");
		expect(activeSession.lastOutput).toBe("");
		expect(activeSession.transcript).toEqual([]);
		expect(buildCodexPromptForSession(activeSession, "继续")).toBe("继续");
	});

	it("clears the active session transcript with the visible conversation", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 8000);
		updateActiveSidebarSession(settings, {
			containsNoteContext: false,
			output: "done",
			prompt: "Old current topic",
			reasoning: [],
		}, 8001);

		clearActiveSidebarSessionConversation(settings, 8002);

		const activeSession = getActiveSidebarSession(settings);
		expect(activeSession.lastPrompt).toBe("");
		expect(activeSession.lastOutput).toBe("");
		expect(activeSession.transcript).toEqual([]);
	});

	it("can save an unsent composer draft without adding it to the Codex transcript", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 9000);

		updateActiveSidebarSession(settings, {
			containsNoteContext: false,
			output: "",
			prompt: "Draft only",
			reasoning: [],
			recordTranscript: false,
		}, 9001);

		const activeSession = getActiveSidebarSession(settings);
		expect(activeSession.lastPrompt).toBe("Draft only");
		expect(activeSession.transcript).toEqual([]);
		expect(buildCodexPromptForSession(activeSession, "继续")).toBe("继续");
	});

	it("keeps at most five sessions by dropping the oldest non-active entries", () => {
		const settings = { ...SETTINGS };
		for (let index = 0; index < MAX_CODEIAN_SESSIONS + 2; index += 1) {
			createNewSidebarSession(settings, 2000 + index);
			updateActiveSidebarSession(settings, {
				containsNoteContext: false,
				output: `answer ${index}`,
				prompt: `topic ${index}`,
				reasoning: [],
			}, 2100 + index);
		}

		expect(settings.sessions).toHaveLength(MAX_CODEIAN_SESSIONS);
		expect(settings.sessions[0]?.lastPrompt).toBe("topic 6");
		expect(settings.sessions.some((session) => session.lastPrompt === "topic 0")).toBe(false);
	});

	it("updates title and note metadata for the active session", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 3000);
		const active = getActiveSidebarSession(settings);

		updateSidebarSessionMetadata(settings, active.id, {
			note: "Release prep",
			title: "Marketplace review",
		}, 3001);

		expect(getActiveSidebarSession(settings)).toMatchObject({
			note: "Release prep",
			title: "Marketplace review",
		});
	});

	it("deletes sessions while keeping one active fallback session", () => {
		const settings = { ...SETTINGS };
		normalizeSidebarSessions(settings, 4000);
		const activeId = settings.activeSessionId;

		const next = deleteSidebarSession(settings, activeId, 4001);

		expect(settings.sessions).toHaveLength(1);
		expect(settings.activeSessionId).toBe(next.id);
	});
});

describe("resolveInitialSidebarPrompt", () => {
	it("starts blank when there is no saved or configured prompt", () => {
		expect(resolveInitialSidebarPrompt(SETTINGS)).toBe("");
	});

	it("uses the configured default prompt when there is no saved prompt", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			defaultPrompt: "Use concise answers.",
		})).toBe("Use concise answers.");
	});

	it("prefers a saved prompt over the configured default prompt", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			defaultPrompt: "Default",
			lastPrompt: "Saved",
		})).toBe("Saved");
	});

	it("starts from a blank composer after a completed run with no configured default prompt", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			lastOutput: "done",
			lastPrompt: "Already sent",
		})).toBe("");
	});

	it("does not restore note-context prompts", () => {
		expect(resolveInitialSidebarPrompt({
			...SETTINGS,
			defaultPrompt: "Default",
			lastPrompt: "Path: secret.md",
			lastPromptContainsNoteContext: true,
		})).toBe("");
	});
});
