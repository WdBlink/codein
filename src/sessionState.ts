import type { CodeianSettings } from "./settings";

export interface PersistedSidebarState {
	lastPrompt: string;
	lastOutput: string;
	lastPromptContainsNoteContext: boolean;
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
