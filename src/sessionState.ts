import type { CodeianSession, CodeianSessionTranscriptEntry, CodeianSettings } from "./settings";

export const MAX_CODEIAN_SESSIONS = 5;
const DEFAULT_SESSION_TITLE = "New chat";
const MAX_REASONING_ITEMS = 24;
const MAX_TRANSCRIPT_ENTRIES = 12;
const MAX_TRANSCRIPT_CONTENT_LENGTH = 6000;

export interface PersistedSidebarState {
	lastPrompt: string;
	lastOutput: string;
	lastPromptContainsNoteContext: boolean;
}

export interface SessionStateUpdate {
	prompt: string;
	output: string;
	reasoning: readonly string[];
	containsNoteContext: boolean;
	recordTranscript?: boolean;
}

export function buildPersistedSidebarState(
	prompt: string,
	output: string,
	containsNoteContext: boolean,
): PersistedSidebarState {
	if (containsNoteContext) {
		return {
			lastOutput: "",
			lastPrompt: "",
			lastPromptContainsNoteContext: true,
		};
	}

	return {
		lastOutput: output,
		lastPrompt: prompt,
		lastPromptContainsNoteContext: false,
	};
}

export function resolveInitialSidebarPrompt(settings: CodeianSettings): string {
	if (settings.lastPromptContainsNoteContext) {
		return "";
	}

	if (settings.lastOutput) {
		return settings.defaultPrompt || "";
	}

	return settings.lastPrompt || settings.defaultPrompt || "";
}

export function normalizeSidebarSessions(settings: CodeianSettings, now = Date.now()): void {
	const rawSessions = Array.isArray(settings.sessions) ? settings.sessions : [];
	const seen = new Set<string>();
	const sessions = rawSessions
		.map((session, index) => normalizeSession(session, now - index))
		.filter((session): session is CodeianSession => {
			if (!session || seen.has(session.id)) {
				return false;
			}
			seen.add(session.id);
			return true;
		})
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, MAX_CODEIAN_SESSIONS);

	if (sessions.length === 0) {
		sessions.push(createCodeianSession({
			id: createSessionId(now),
			lastOutput: settings.lastOutput,
			lastPrompt: settings.lastPromptContainsNoteContext ? "" : settings.lastPrompt,
			lastPromptContainsNoteContext: settings.lastPromptContainsNoteContext,
			title: inferSessionTitle(settings.lastPrompt) || DEFAULT_SESSION_TITLE,
			updatedAt: now,
		}));
	}

	settings.sessions = sessions;
	if (!settings.activeSessionId || !sessions.some((session) => session.id === settings.activeSessionId)) {
		settings.activeSessionId = sessions[0]?.id ?? "";
	}
	syncLegacyStateFromActiveSession(settings);
}

export function getActiveSidebarSession(settings: CodeianSettings): CodeianSession {
	normalizeSidebarSessions(settings);
	const session = settings.sessions.find((candidate) => candidate.id === settings.activeSessionId);
	return session ?? settings.sessions[0] ?? createCodeianSession();
}

export function createNewSidebarSession(settings: CodeianSettings, now = Date.now()): CodeianSession {
	normalizeSidebarSessions(settings, now);
	const session = createCodeianSession({
		id: createSessionId(now),
		lastPrompt: settings.defaultPrompt || "",
		title: DEFAULT_SESSION_TITLE,
		updatedAt: now,
	});
	settings.sessions = [
		session,
		...settings.sessions.filter((existing) => existing.id !== session.id),
	].slice(0, MAX_CODEIAN_SESSIONS);
	settings.activeSessionId = session.id;
	syncLegacyStateFromActiveSession(settings);
	return session;
}

export function switchSidebarSession(settings: CodeianSettings, sessionId: string): CodeianSession {
	normalizeSidebarSessions(settings);
	const session = settings.sessions.find((candidate) => candidate.id === sessionId);
	if (!session) {
		return getActiveSidebarSession(settings);
	}
	settings.activeSessionId = session.id;
	syncLegacyStateFromActiveSession(settings);
	return session;
}

export function deleteSidebarSession(settings: CodeianSettings, sessionId: string, now = Date.now()): CodeianSession {
	normalizeSidebarSessions(settings, now);
	settings.sessions = settings.sessions.filter((session) => session.id !== sessionId);
	if (settings.sessions.length === 0) {
		settings.sessions = [createCodeianSession({ id: createSessionId(now), updatedAt: now })];
	}
	if (!settings.sessions.some((session) => session.id === settings.activeSessionId)) {
		settings.activeSessionId = settings.sessions[0]?.id ?? "";
	}
	syncLegacyStateFromActiveSession(settings);
	return getActiveSidebarSession(settings);
}

export function updateActiveSidebarSession(settings: CodeianSettings, update: SessionStateUpdate, now = Date.now()): CodeianSession {
	return updateSidebarSession(settings, settings.activeSessionId, update, now);
}

export function updateSidebarSession(settings: CodeianSettings, sessionId: string, update: SessionStateUpdate, now = Date.now()): CodeianSession {
	normalizeSidebarSessions(settings, now);
	const index = settings.sessions.findIndex((session) => session.id === sessionId);
	const current = settings.sessions[index] ?? getActiveSidebarSession(settings);
	const targetSessionId = current.id;
	const persisted = buildPersistedSidebarState(update.prompt, update.output, update.containsNoteContext);
	const reasoning = persisted.lastPromptContainsNoteContext ? [] : normalizeReasoningHistory(update.reasoning);
	const next: CodeianSession = {
		...current,
		lastOutput: persisted.lastOutput,
		lastPrompt: persisted.lastPrompt,
		lastPromptContainsNoteContext: persisted.lastPromptContainsNoteContext,
		reasoning,
		title: current.title === DEFAULT_SESSION_TITLE && persisted.lastPrompt
			? inferSessionTitle(persisted.lastPrompt)
			: current.title,
		transcript: update.recordTranscript === false
			? normalizeTranscript(current.transcript, now)
			: updateTranscript(current.transcript, persisted, reasoning, now),
		updatedAt: now,
	};
	if (index >= 0) {
		settings.sessions[index] = next;
	} else {
		settings.sessions.unshift(next);
	}
	settings.sessions = settings.sessions
		.sort((a, b) => {
			if (a.id === settings.activeSessionId) return -1;
			if (b.id === settings.activeSessionId) return 1;
			return b.updatedAt - a.updatedAt;
		})
		.slice(0, MAX_CODEIAN_SESSIONS);
	if (targetSessionId === settings.activeSessionId) {
		syncLegacyStateFromActiveSession(settings);
	}
	return next;
}

export function clearActiveSidebarSessionConversation(settings: CodeianSettings, now = Date.now()): CodeianSession {
	normalizeSidebarSessions(settings, now);
	const index = settings.sessions.findIndex((session) => session.id === settings.activeSessionId);
	const current = settings.sessions[index] ?? getActiveSidebarSession(settings);
	const next: CodeianSession = {
		...current,
		lastOutput: "",
		lastPrompt: "",
		lastPromptContainsNoteContext: false,
		reasoning: [],
		transcript: [],
		updatedAt: now,
	};
	if (index >= 0) {
		settings.sessions[index] = next;
	}
	syncLegacyStateFromActiveSession(settings);
	return next;
}

export function buildCodexPromptForSession(session: CodeianSession, currentPrompt: string): string {
	const prompt = currentPrompt.trim();
	const transcript = normalizeTranscript(session.transcript, session.updatedAt);
	if (transcript.length === 0) {
		return prompt;
	}

	const history = transcript
		.map((entry) => formatTranscriptEntry(entry))
		.join("\n\n");
	return [
		"You are continuing a Codeian sidebar session in Obsidian.",
		"Use only the session history below as prior conversation context. Do not continue from other Codeian sessions, unrelated folders, or local memories unless the current request explicitly asks for them.",
		"",
		"<session-history>",
		history,
		"</session-history>",
		"",
		"Current user request:",
		prompt,
	].join("\n");
}

export function updateSidebarSessionMetadata(
	settings: CodeianSettings,
	sessionId: string,
	metadata: Partial<Pick<CodeianSession, "note" | "title">>,
	now = Date.now(),
): CodeianSession {
	normalizeSidebarSessions(settings, now);
	const index = settings.sessions.findIndex((session) => session.id === sessionId);
	const current = settings.sessions[index] ?? getActiveSidebarSession(settings);
	const next = {
		...current,
		note: normalizeWhitespace(metadata.note ?? current.note, 260),
		title: normalizeTitle(metadata.title ?? current.title),
		updatedAt: now,
	};
	if (index >= 0) {
		settings.sessions[index] = next;
	}
	syncLegacyStateFromActiveSession(settings);
	return next;
}

export function syncLegacyStateFromActiveSession(settings: CodeianSettings): void {
	const session = settings.sessions.find((candidate) => candidate.id === settings.activeSessionId) ?? settings.sessions[0];
	if (!session) {
		settings.lastPrompt = "";
		settings.lastOutput = "";
		settings.lastPromptContainsNoteContext = false;
		return;
	}
	settings.lastPrompt = session.lastPrompt;
	settings.lastOutput = session.lastOutput;
	settings.lastPromptContainsNoteContext = session.lastPromptContainsNoteContext;
}

export function createCodeianSession(input: Partial<CodeianSession> = {}): CodeianSession {
	const now = input.updatedAt ?? Date.now();
	const reasoning = normalizeReasoningHistory(input.reasoning ?? []);
	const lastPromptContainsNoteContext = input.lastPromptContainsNoteContext ?? false;
	const lastPrompt = input.lastPrompt ?? "";
	const lastOutput = input.lastOutput ?? "";
	const transcript = normalizeTranscript(input.transcript, now);
	const hasPersistedTranscript = Array.isArray(input.transcript);
	return {
		id: input.id || createSessionId(now),
		lastOutput,
		lastPrompt,
		lastPromptContainsNoteContext,
		note: normalizeWhitespace(input.note ?? "", 260),
		reasoning,
		title: normalizeTitle(input.title ?? DEFAULT_SESSION_TITLE),
		transcript: hasPersistedTranscript
			? transcript
			: createTranscriptFromLegacyState(lastPrompt, lastOutput, reasoning, lastPromptContainsNoteContext, now),
		updatedAt: now,
	};
}

function normalizeSession(value: unknown, updatedAt: number): CodeianSession | null {
	if (!isRecord(value)) {
		return null;
	}
	return createCodeianSession({
		id: getString(value.id) ?? createSessionId(updatedAt),
		lastOutput: getString(value.lastOutput) ?? "",
		lastPrompt: getString(value.lastPrompt) ?? "",
		lastPromptContainsNoteContext: value.lastPromptContainsNoteContext === true,
		note: getString(value.note) ?? "",
		reasoning: Array.isArray(value.reasoning) ? value.reasoning.filter((item): item is string => typeof item === "string") : [],
		title: getString(value.title) ?? DEFAULT_SESSION_TITLE,
		transcript: Array.isArray(value.transcript) ? value.transcript as CodeianSessionTranscriptEntry[] : [],
		updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : updatedAt,
	});
}

function updateTranscript(
	existing: readonly CodeianSessionTranscriptEntry[],
	persisted: PersistedSidebarState,
	reasoning: readonly string[],
	now: number,
): CodeianSessionTranscriptEntry[] {
	const transcript = normalizeTranscript(existing, now);
	if (persisted.lastPromptContainsNoteContext) {
		return transcript;
	}

	const prompt = trimTranscriptContent(persisted.lastPrompt);
	const output = trimTranscriptContent(persisted.lastOutput);
	if (prompt) {
		const last = transcript[transcript.length - 1];
		if (last?.role === "user" && last.content === prompt) {
			transcript[transcript.length - 1] = { ...last, createdAt: last.createdAt || now };
		} else {
			transcript.push({ content: prompt, createdAt: now, reasoning: [], role: "user" });
		}
	}

	if (output) {
		const normalizedReasoning = normalizeReasoningHistory(reasoning);
		const last = transcript[transcript.length - 1];
		if (last?.role === "assistant") {
			transcript[transcript.length - 1] = {
				...last,
				content: output,
				createdAt: now,
				reasoning: normalizedReasoning,
			};
		} else {
			transcript.push({
				content: output,
				createdAt: now,
				reasoning: normalizedReasoning,
				role: "assistant",
			});
		}
	}

	return transcript.slice(-MAX_TRANSCRIPT_ENTRIES);
}

function createTranscriptFromLegacyState(
	lastPrompt: string,
	lastOutput: string,
	reasoning: readonly string[],
	containsNoteContext: boolean,
	now: number,
): CodeianSessionTranscriptEntry[] {
	if (containsNoteContext) {
		return [];
	}
	return updateTranscript([], buildPersistedSidebarState(lastPrompt, lastOutput, false), reasoning, now);
}

function normalizeTranscript(value: unknown, updatedAt: number): CodeianSessionTranscriptEntry[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const normalized: CodeianSessionTranscriptEntry[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) {
			continue;
		}
		const role = entry.role === "assistant" || entry.role === "user" ? entry.role : null;
		const content = trimTranscriptContent(getString(entry.content) ?? "");
		if (!role || !content) {
			continue;
		}
		normalized.push({
			content,
			createdAt: typeof entry.createdAt === "number" ? entry.createdAt : updatedAt,
			reasoning: Array.isArray(entry.reasoning) ? normalizeReasoningHistory(entry.reasoning.filter((item): item is string => typeof item === "string")) : [],
			role,
		});
	}
	return normalized.slice(-MAX_TRANSCRIPT_ENTRIES);
}

function formatTranscriptEntry(entry: CodeianSessionTranscriptEntry): string {
	const label = entry.role === "user" ? "User" : "Assistant";
	const chunks = [`${label}:\n${entry.content}`];
	if (entry.role === "assistant" && entry.reasoning.length > 0) {
		chunks.push(`Reasoning summary:\n${entry.reasoning.join("\n")}`);
	}
	return chunks.join("\n");
}

function normalizeReasoningHistory(items: readonly string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const item of items) {
		const text = normalizeWhitespace(item, 1400);
		if (!text || seen.has(text)) {
			continue;
		}
		seen.add(text);
		normalized.push(text);
	}
	return normalized.slice(-MAX_REASONING_ITEMS);
}

function normalizeTitle(title: string): string {
	return normalizeWhitespace(title, 64) || DEFAULT_SESSION_TITLE;
}

function inferSessionTitle(prompt: string): string {
	const firstLine = prompt.split(/\r?\n/).find((line) => line.trim());
	return normalizeWhitespace(firstLine ?? "", 44);
}

function normalizeWhitespace(value: string, maxLength: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

function trimTranscriptContent(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length <= MAX_TRANSCRIPT_CONTENT_LENGTH) {
		return trimmed;
	}
	return trimmed.slice(0, MAX_TRANSCRIPT_CONTENT_LENGTH).trimEnd();
}

function createSessionId(now: number): string {
	return `session-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
