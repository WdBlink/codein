import { describe, expect, it } from "vitest";

import { DEFAULT_CODEX_ARGS, splitCommandLine } from "../src/codexRunner";

describe("splitCommandLine", () => {
	it("splits basic whitespace-delimited arguments", () => {
		expect(splitCommandLine("exec --sandbox read-only")).toEqual(["exec", "--sandbox", "read-only"]);
	});

	it("trims leading and trailing whitespace", () => {
		expect(splitCommandLine("  exec   --skip-git-repo-check  ")).toEqual(["exec", "--skip-git-repo-check"]);
	});

	it("keeps double-quoted values together", () => {
		expect(splitCommandLine("exec --model \"gpt-5 codex\"")).toEqual(["exec", "--model", "gpt-5 codex"]);
	});

	it("keeps single-quoted values together", () => {
		expect(splitCommandLine("exec --profile 'local safe'")).toEqual(["exec", "--profile", "local safe"]);
	});

	it("supports escaped whitespace outside quotes", () => {
		expect(splitCommandLine("exec --label local\\ vault")).toEqual(["exec", "--label", "local vault"]);
	});

	it("keeps empty quoted values", () => {
		expect(splitCommandLine("exec --label \"\" --profile ''")).toEqual(["exec", "--label", "", "--profile", ""]);
	});

	it("keeps adjacent quoted and unquoted segments in one argument", () => {
		expect(splitCommandLine("exec --label pre\"middle\"post")).toEqual(["exec", "--label", "premiddlepost"]);
	});

	it("supports escaped quotes inside quoted values", () => {
		expect(splitCommandLine("exec --label \"say \\\"hello\\\"\"")).toEqual(["exec", "--label", "say \"hello\""]);
	});

	it("treats tabs and newlines as separators", () => {
		expect(splitCommandLine("exec\t--sandbox\nread-only")).toEqual(["exec", "--sandbox", "read-only"]);
	});

	it("returns an empty array for empty input", () => {
		expect(splitCommandLine(" \t\n ")).toEqual([]);
	});

	it("preserves trailing backslashes", () => {
		expect(splitCommandLine("exec path\\\\")).toEqual(["exec", "path\\"]);
	});

	it("throws on unclosed quotes", () => {
		expect(() => splitCommandLine("exec --model \"gpt-5")).toThrow("Unclosed quote");
	});

	it("keeps the production default in read-only non-interactive mode", () => {
		expect(splitCommandLine(DEFAULT_CODEX_ARGS)).toEqual([
			"exec",
			"--ask-for-approval",
			"never",
			"--sandbox",
			"read-only",
			"--skip-git-repo-check",
		]);
	});
});
