export interface PromptKeyEventLike {
	key: string;
	shiftKey: boolean;
	isComposing?: boolean;
}

export function shouldRunPromptFromKey(event: PromptKeyEventLike): boolean {
	return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}
