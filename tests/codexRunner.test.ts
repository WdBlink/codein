import { describe, expect, it } from "vitest";

import { splitCommandLine } from "../src/codexRunner";

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

	it("preserves trailing backslashes", () => {
		expect(splitCommandLine("exec path\\\\")).toEqual(["exec", "path\\"]);
	});

	it("throws on unclosed quotes", () => {
		expect(() => splitCommandLine("exec --model \"gpt-5")).toThrow("Unclosed quote");
	});
});
