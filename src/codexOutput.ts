export interface CodexOutputSnapshot {
	finalOutput: string;
	rawOutput: string;
	hasFinalOutput: boolean;
}

const CODEX_FINAL_MARKER = "codex";
const FINAL_STOP_PATTERNS = [
	/^tokens used\b/i,
	/^session id:\s/i,
	/^--------+$/,
];

export function buildCodexOutputSnapshot(rawOutput: string): CodexOutputSnapshot {
	const finalOutput = extractFinalCodexOutput(rawOutput);
	return {
		finalOutput,
		hasFinalOutput: finalOutput.length > 0,
		rawOutput,
	};
}

export function extractFinalCodexOutput(rawOutput: string): string {
	const lines = rawOutput.replace(/\r\n/g, "\n").split("\n");
	const markerIndex = findLastCodexMarker(lines);
	if (markerIndex < 0) {
		return "";
	}

	const finalLines: string[] = [];
	for (const line of lines.slice(markerIndex + 1)) {
		if (FINAL_STOP_PATTERNS.some((pattern) => pattern.test(line.trim()))) {
			break;
		}
		finalLines.push(line);
	}

	return trimBlankLines(finalLines).join("\n");
}

export function getVisibleCodexOutput(rawOutput: string, fallbackText: string): string {
	const snapshot = buildCodexOutputSnapshot(rawOutput);
	return snapshot.hasFinalOutput ? snapshot.finalOutput : fallbackText;
}

function findLastCodexMarker(lines: string[]): number {
	for (let index = lines.length - 1; index >= 0; index--) {
		if (lines[index]?.trim().toLowerCase() === CODEX_FINAL_MARKER) {
			return index;
		}
	}
	return -1;
}

function trimBlankLines(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;

	while (start < end && lines[start]?.trim() === "") {
		start++;
	}
	while (end > start && lines[end - 1]?.trim() === "") {
		end--;
	}

	return lines.slice(start, end);
}
