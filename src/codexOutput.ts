export interface CodexUsageSummary {
	inputTokens?: number;
	outputTokens?: number;
	reasoningOutputTokens?: number;
}

export interface CodexFileChangeEntry {
	path: string;
	kind: string;
	addedLines?: number;
	removedLines?: number;
	diff?: string;
}

export interface CodexFileChange {
	id: string;
	status: "running" | "completed" | "failed";
	toolName: string;
	entries: CodexFileChangeEntry[];
}

export interface CodexJsonStreamState {
	finalOutput: string;
	fileChanges: CodexFileChange[];
	pendingLine: string;
	usage: CodexUsageSummary | null;
	errorText: string;
	eventCount: number;
}

export interface CodexOutputSnapshot {
	finalOutput: string;
	hasFinalOutput: boolean;
	usage: CodexUsageSummary | null;
	errorText: string;
	eventCount: number;
	fileChanges: CodexFileChange[];
}

interface CodexJsonEvent {
	type?: string;
	call_id?: string;
	payload?: unknown;
	item?: {
		id?: string;
		call_id?: string;
		name?: string;
		type?: string;
		text?: string;
		status?: string;
		input?: string;
		changes?: unknown;
	};
	changes?: unknown;
	success?: boolean;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		reasoning_output_tokens?: number;
	};
	message?: string;
	content?: string;
}

export function createCodexJsonStreamState(): CodexJsonStreamState {
	return {
		errorText: "",
		eventCount: 0,
		fileChanges: [],
		finalOutput: "",
		pendingLine: "",
		usage: null,
	};
}

export function appendCodexJsonChunk(state: CodexJsonStreamState, chunk: string): CodexOutputSnapshot {
	state.pendingLine += chunk.replace(/\r\n/g, "\n");

	let newlineIndex = state.pendingLine.indexOf("\n");
	while (newlineIndex >= 0) {
		const line = state.pendingLine.slice(0, newlineIndex).trim();
		state.pendingLine = state.pendingLine.slice(newlineIndex + 1);
		consumeCodexJsonLine(state, line);
		newlineIndex = state.pendingLine.indexOf("\n");
	}

	return buildCodexOutputSnapshot(state);
}

export function flushCodexJsonStream(state: CodexJsonStreamState): CodexOutputSnapshot {
	consumeCodexJsonLine(state, state.pendingLine.trim());
	state.pendingLine = "";
	return buildCodexOutputSnapshot(state);
}

export function buildCodexOutputSnapshot(state: CodexJsonStreamState): CodexOutputSnapshot {
	return {
		errorText: state.errorText,
		eventCount: state.eventCount,
		fileChanges: state.fileChanges,
		finalOutput: state.finalOutput.trim(),
		hasFinalOutput: state.finalOutput.trim().length > 0,
		usage: state.usage,
	};
}

export function formatCodexUsage(usage: CodexUsageSummary | null): string {
	if (!usage) {
		return "";
	}

	const parts: string[] = [];
	if (typeof usage.outputTokens === "number") {
		parts.push(`${usage.outputTokens.toLocaleString()} output`);
	}
	if (typeof usage.reasoningOutputTokens === "number" && usage.reasoningOutputTokens > 0) {
		parts.push(`${usage.reasoningOutputTokens.toLocaleString()} reasoning`);
	}

	return parts.length ? parts.join(" · ") : "";
}

function consumeCodexJsonLine(state: CodexJsonStreamState, line: string): void {
	if (!line) {
		return;
	}

	let event: CodexJsonEvent;
	try {
		event = JSON.parse(line) as CodexJsonEvent;
	} catch {
		state.errorText = state.errorText ? `${state.errorText}\n${line}` : line;
		return;
	}

	state.eventCount++;
	const fileChange = extractFileChangeEvent(event);
	if (fileChange) {
		upsertFileChange(state, fileChange);
	}

	if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
		state.finalOutput = event.item.text;
		return;
	}

	if (event.type === "turn.completed" && event.usage) {
		state.usage = {
			inputTokens: event.usage.input_tokens,
			outputTokens: event.usage.output_tokens,
			reasoningOutputTokens: event.usage.reasoning_output_tokens,
		};
		return;
	}

	if (event.type === "error") {
		state.errorText = [state.errorText, event.message, event.content].filter(Boolean).join("\n");
	}
}

function upsertFileChange(state: CodexJsonStreamState, change: CodexFileChange): void {
	const index = state.fileChanges.findIndex((existing) => existing.id === change.id);
	if (index >= 0) {
		state.fileChanges[index] = {
			...state.fileChanges[index],
			...change,
			entries: change.entries.length ? change.entries : state.fileChanges[index]?.entries ?? [],
		};
		return;
	}
	state.fileChanges.push(change);
}

function extractFileChangeEvent(event: CodexJsonEvent): CodexFileChange | null {
	const payload = asRecord(event.payload);
	if (payload?.type === "patch_apply_end") {
		return {
			entries: normalizeChanges(payload.changes),
			id: getString(payload.call_id) ?? event.call_id ?? `patch-${Date.now()}`,
			status: payload.success === false ? "failed" : "completed",
			toolName: "apply_patch",
		};
	}

	const item = asRecord(event.item) ?? asRecord(payload?.item) ?? payload;
	const itemType = normalizeToolName(item?.type);
	const itemName = normalizeToolName(item?.name);
	const isPatchTool = itemType === "filechange"
		|| itemType === "file_change"
		|| itemName === "apply_patch"
		|| itemName === "edit"
		|| itemName === "write";
	if (!isPatchTool || !item) {
		return null;
	}

	const toolName = getString(item.name) ?? getString(item.type) ?? "file_change";
	const itemInput = getString(item.input) ?? "";
	const entries = normalizeChanges(item.changes).concat(extractPatchEntries(itemInput));
	const status = event.type === "item.started" || item.status === "in_progress" ? "running" : "completed";
	return {
		entries: dedupeEntries(entries),
		id: getString(item.id) ?? getString(item.call_id) ?? event.call_id ?? `${toolName}-${Date.now()}`,
		status,
		toolName,
	};
}

function normalizeChanges(changes: unknown): CodexFileChangeEntry[] {
	if (Array.isArray(changes)) {
		return changes.flatMap((change) => {
			const record = asRecord(change);
			if (!record) return [];
			const path = getString(record.path) ?? getString(record.file) ?? getString(record.file_path);
			if (!path) return [];
			const diff = getString(record.unified_diff) ?? getString(record.diff);
			return [{
				addedLines: getNumber(record.added_lines),
				diff,
				kind: getString(record.type) ?? getString(record.kind) ?? "update",
				path,
				removedLines: getNumber(record.removed_lines),
				...countDiffLines(diff),
			}];
		});
	}

	const record = asRecord(changes);
	if (!record) return [];

	return Object.entries(record).map(([path, value]) => {
		const change = asRecord(value);
		const diff = getString(change?.unified_diff) ?? getString(change?.diff);
		return {
			...countDiffLines(diff),
			diff,
			kind: getString(change?.type) ?? "update",
			path,
		};
	});
}

function extractPatchEntries(input: string): CodexFileChangeEntry[] {
	if (!input.includes("*** Begin Patch")) {
		return [];
	}

	const entries: CodexFileChangeEntry[] = [];
	for (const line of input.split("\n")) {
		const match = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line.trim());
		if (!match) continue;
		const kind = match[1];
		const path = match[2];
		if (!kind || !path) continue;
		entries.push({
			kind: kind.toLowerCase(),
			path,
		});
	}
	return entries;
}

function dedupeEntries(entries: CodexFileChangeEntry[]): CodexFileChangeEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = `${entry.path}:${entry.kind}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function countDiffLines(diff: string | undefined): Pick<CodexFileChangeEntry, "addedLines" | "removedLines"> {
	if (!diff) return {};
	let addedLines = 0;
	let removedLines = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) addedLines++;
		if (line.startsWith("-") && !line.startsWith("---")) removedLines++;
	}
	return { addedLines, removedLines };
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function normalizeToolName(value: unknown): string {
	return typeof value === "string" ? value.toLowerCase() : "";
}
