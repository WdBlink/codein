export interface CodexUsageSummary {
	inputTokens?: number;
	outputTokens?: number;
	reasoningOutputTokens?: number;
}

export interface CodexJsonStreamState {
	finalOutput: string;
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
}

interface CodexJsonEvent {
	type?: string;
	item?: {
		type?: string;
		text?: string;
	};
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
