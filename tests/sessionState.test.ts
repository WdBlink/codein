import { describe, expect, it } from "vitest";

import { DEFAULT_CODEX_ARGS } from "../src/defaults";
import type { CodeianSettings } from "../src/settings";
import {
	buildPersistedSidebarState,
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
