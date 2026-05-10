export type PromptSuggestionTrigger = "/" | "$" | "@" | "#";

export interface PromptSuggestion {
	trigger: PromptSuggestionTrigger;
	value: string;
	label: string;
	detail: string;
}

export interface PromptTokenContext {
	trigger: PromptSuggestionTrigger;
	start: number;
	end: number;
	query: string;
}

export const BUILT_IN_PROMPT_SUGGESTIONS: readonly PromptSuggestion[] = [
	{ trigger: "/", value: "/help", label: "/help", detail: "Show Codex command help" },
	{ trigger: "/", value: "/status", label: "/status", detail: "Inspect current run status" },
	{ trigger: "/", value: "/model", label: "/model", detail: "Review or switch model context" },
	{ trigger: "/", value: "/review", label: "/review", detail: "Ask Codex for a focused code review" },
	{ trigger: "/", value: "/diff", label: "/diff", detail: "Summarize current workspace changes" },
	{ trigger: "/", value: "/new", label: "/new", detail: "Start a fresh task context" },
	{ trigger: "/", value: "/compact", label: "/compact", detail: "Condense long task context" },
	{ trigger: "$", value: "$opc loop", label: "$opc loop", detail: "Run an OPC engineering loop" },
	{ trigger: "$", value: "$computer-use", label: "$computer-use", detail: "Use desktop app automation" },
	{ trigger: "$", value: "$browser", label: "$browser", detail: "Use the in-app browser" },
	{ trigger: "$", value: "$openai-docs", label: "$openai-docs", detail: "Consult OpenAI documentation" },
	{ trigger: "$", value: "$plugin-creator", label: "$plugin-creator", detail: "Build or edit a plugin" },
	{ trigger: "$", value: "$imagegen", label: "$imagegen", detail: "Generate or edit images" },
	{ trigger: "@", value: "@filename", label: "@filename", detail: "Reference a vault file by name" },
	{ trigger: "@", value: "@current-note", label: "@current-note", detail: "Reference the active note" },
	{ trigger: "@", value: "@workspace", label: "@workspace", detail: "Reference the current workspace" },
	{ trigger: "@", value: "@selection", label: "@selection", detail: "Reference selected text" },
	{ trigger: "#", value: "#instructions", label: "#instructions", detail: "Add task-specific instructions" },
	{ trigger: "#", value: "#plan", label: "#plan", detail: "Ask for a plan first" },
	{ trigger: "#", value: "#review", label: "#review", detail: "Frame the request as a review" },
	{ trigger: "#", value: "#tests", label: "#tests", detail: "Emphasize verification" },
] as const;

const TRIGGERS = new Set<string>(["/", "$", "@", "#"]);

export function getPromptTokenContext(value: string, caret: number): PromptTokenContext | null {
	const boundedCaret = Math.max(0, Math.min(caret, value.length));
	let start = boundedCaret;
	while (start > 0 && !/\s/.test(value.charAt(start - 1))) {
		start -= 1;
	}

	const token = value.slice(start, boundedCaret);
	const trigger = token.charAt(0);
	if (!TRIGGERS.has(trigger)) {
		return null;
	}

	const previous = start > 0 ? value.charAt(start - 1) : "";
	if (previous && !/\s/.test(previous)) {
		return null;
	}

	return {
		trigger: trigger as PromptSuggestionTrigger,
		start,
		end: boundedCaret,
		query: token.slice(1).toLowerCase(),
	};
}

export function getPromptSuggestions(
	value: string,
	caret: number,
	limit = 6,
	suggestions: readonly PromptSuggestion[] = BUILT_IN_PROMPT_SUGGESTIONS,
): PromptSuggestion[] {
	const context = getPromptTokenContext(value, caret);
	if (!context) {
		return [];
	}

	const matches = suggestions.filter((suggestion) => {
		if (suggestion.trigger !== context.trigger) {
			return false;
		}
		if (!context.query) {
			return true;
		}
		return suggestion.value.toLowerCase().slice(1).includes(context.query);
	});

	return matches.slice(0, limit);
}

export function applyPromptSuggestion(
	value: string,
	caret: number,
	suggestion: PromptSuggestion,
): { value: string; caret: number } {
	const context = getPromptTokenContext(value, caret);
	const start = context?.start ?? caret;
	const end = context?.end ?? caret;
	const nextChar = value.charAt(end);
	const shouldAddTrailingSpace = !nextChar || !/\s/.test(nextChar);
	const insertion = shouldAddTrailingSpace ? `${suggestion.value} ` : suggestion.value;
	const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;

	return {
		value: nextValue,
		caret: start + insertion.length,
	};
}
