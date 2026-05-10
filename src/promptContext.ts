export function buildCurrentNoteContextPrompt(path: string, content: string): string {
	return [
		"Use the following Obsidian note as context.",
		"",
		`Path: ${path}`,
		"",
		"```markdown",
		content,
		"```",
		"",
		"Task:",
	].join("\n");
}
