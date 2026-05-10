import { describe, expect, it, vi } from "vitest";
import * as path from "node:path";

import type { CodeianSettings } from "../src/settings";
import { DEFAULT_CODEX_ARGS } from "../src/defaults";
import {
	discoverCodexCommandSuggestions,
	discoverSkillSuggestions,
	mergePromptSuggestions,
	parseCodexHelpCommands,
	parseSkillMarkdown,
	PromptSuggestionRegistry,
	type SkillFileReader,
} from "../src/promptSuggestionRegistry";

const SETTINGS: CodeianSettings = {
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	codexEffort: "medium",
	codexModel: "gpt-5.4-mini",
	defaultPrompt: "",
	lastOutput: "",
	lastPrompt: "",
	lastPromptContainsNoteContext: false,
	lastStatus: "Ready",
	workingDirectory: "",
};

describe("parseCodexHelpCommands", () => {
	it("parses command names and descriptions from Codex help", () => {
		const suggestions = parseCodexHelpCommands(`
Commands:
  exec            Run Codex non-interactively [aliases: e]
  review          Run a code review non-interactively
  apply           Apply the latest diff produced by Codex agent as a \`git apply\` to your local
                  working tree [aliases: a]

Arguments:
  [PROMPT]
`);

		expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["/exec", "/review", "/apply"]);
		expect(suggestions[0]?.detail).toBe("Run Codex non-interactively");
		expect(suggestions[2]?.detail).toContain("working tree");
	});

	it("discovers commands through the configured CLI runner", async () => {
		const commandRunner = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "Commands:\n  review          Run a code review non-interactively\n\nArguments:\n",
			stderr: "",
		});

		const suggestions = await discoverCodexCommandSuggestions(SETTINGS, { commandRunner });

		expect(commandRunner).toHaveBeenCalledWith(expect.stringContaining("codex"), ["--help"], expect.objectContaining({
			shell: false,
		}));
		expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["/review"]);
	});

	it("does not auto-run non-codex commands for help discovery", async () => {
		const commandRunner = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "Commands:\n  fake            Fake command\n",
			stderr: "",
		});

		const suggestions = await discoverCodexCommandSuggestions({ ...SETTINGS, codexCommand: "node" }, { commandRunner });

		expect(suggestions).toEqual([]);
		expect(commandRunner).not.toHaveBeenCalled();
	});
});

describe("skill suggestion discovery", () => {
	it("parses skill frontmatter metadata", () => {
		expect(parseSkillMarkdown(`---
name: opc
description: "One Person Company"
---

# OPC
`)).toEqual({ name: "opc", description: "One Person Company" });
	});

	it("scans local skill registries without exposing paths", async () => {
		const root = normalize("/tmp/skills");
		const fileReader = createMemoryFileReader({
			[normalize("/tmp/skills/opc/SKILL.md")]: `---
name: opc
description: One Person Company
---`,
			[normalize("/tmp/skills/nested/tool/SKILL.md")]: `---
name: nested-tool
description: Nested tool
---`,
		});

		const suggestions = await discoverSkillSuggestions({ fileReader, skillRoots: [root] });

		expect(suggestions.map((suggestion) => suggestion.value).sort()).toEqual(["$nested-tool", "$opc"]);
		expect(suggestions.map((suggestion) => suggestion.detail).join(" ")).not.toContain("/tmp/skills");
	});
});

describe("PromptSuggestionRegistry", () => {
	it("filters from cache without invoking discovery during keypress filtering", async () => {
		const discover = vi.fn().mockResolvedValue([
			{ trigger: "$", value: "$dynamic-skill", label: "$dynamic-skill", detail: "Dynamic skill" },
		]);
		const registry = new PromptSuggestionRegistry(discover);

		await registry.refresh(SETTINGS);
		expect(discover).toHaveBeenCalledTimes(1);

		expect(registry.getSuggestions("$dyn", 4).map((suggestion) => suggestion.value)).toEqual(["$dynamic-skill"]);
		expect(registry.getSuggestions("$dyna", 5).map((suggestion) => suggestion.value)).toEqual(["$dynamic-skill"]);
		expect(discover).toHaveBeenCalledTimes(1);
	});

	it("falls back to built-in suggestions when discovery fails", async () => {
		const registry = new PromptSuggestionRegistry(vi.fn().mockRejectedValue(new Error("scan failed")));

		await registry.refresh(SETTINGS);

		expect(registry.getSuggestions("$op", 3).map((suggestion) => suggestion.value)).toContain("$opc loop");
	});

	it("deduplicates dynamic and fallback suggestions by trigger and value", () => {
		expect(mergePromptSuggestions([
			{ trigger: "/", value: "/review", label: "/review", detail: "one" },
			{ trigger: "/", value: "/review", label: "/review", detail: "two" },
			{ trigger: "$", value: "$review", label: "$review", detail: "three" },
		]).map((suggestion) => suggestion.detail)).toEqual(["one", "three"]);
	});
});

function createMemoryFileReader(files: Record<string, string>): SkillFileReader {
	const dirs = new Set<string>();
	for (const filePath of Object.keys(files)) {
		let dir = path.dirname(filePath);
		while (dir !== path.dirname(dir)) {
			dirs.add(dir);
			dir = path.dirname(dir);
		}
	}

	return {
		exists: (filePath) => filePath in files || dirs.has(normalize(filePath)),
		isDirectory: (filePath) => dirs.has(normalize(filePath)),
		isFile: (filePath) => normalize(filePath) in files,
		listDir: (dirPath) => {
			const normalizedDir = normalize(dirPath);
			const children = new Set<string>();
			for (const candidate of [...Object.keys(files), ...dirs]) {
				if (path.dirname(candidate) === normalizedDir) {
					children.add(path.basename(candidate));
				}
			}
			return [...children].sort();
		},
		readFile: (filePath) => files[normalize(filePath)] ?? "",
	};
}

function normalize(filePath: string): string {
	return path.normalize(filePath);
}
