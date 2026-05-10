import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import type { CodeianSettings } from "../src/settings";
import { DEFAULT_CODEX_ARGS } from "../src/defaults";
import {
	buildCodexArgs,
	CodexRunner,
	type CodexSpawn,
	getCodexSafetyWarning,
	splitCommandLine,
	testCodexCli,
} from "../src/codexRunner";

const SETTINGS: CodeianSettings = {
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	lastOutput: "",
	lastPrompt: "",
	lastPromptContainsNoteContext: false,
	lastStatus: "Ready",
	workingDirectory: "",
};

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
			"--ask-for-approval",
			"never",
			"exec",
			"--sandbox",
			"read-only",
			"--skip-git-repo-check",
		]);
	});
});

describe("buildCodexArgs", () => {
	it("appends working directory and stdin prompt marker", () => {
		expect(buildCodexArgs(SETTINGS, "/tmp/vault")).toEqual([
			"--ask-for-approval",
			"never",
			"exec",
			"--sandbox",
			"read-only",
			"--skip-git-repo-check",
			"-C",
			"/tmp/vault",
			"-",
		]);
	});
});

describe("getCodexSafetyWarning", () => {
	it("accepts the default read-only configuration", () => {
		expect(getCodexSafetyWarning(SETTINGS)).toBeNull();
	});

	it("warns when the command is not codex", () => {
		expect(getCodexSafetyWarning({ ...SETTINGS, codexCommand: "node" })).toContain("not codex");
	});

	it("warns when sandbox is not read-only", () => {
		expect(getCodexSafetyWarning({ ...SETTINGS, codexExtraArgs: "exec --sandbox danger-full-access" })).toContain("read-only");
	});

	it("warns when later duplicate sandbox arguments override read-only mode", () => {
		expect(getCodexSafetyWarning({
			...SETTINGS,
			codexExtraArgs: "--ask-for-approval never exec --sandbox read-only --sandbox danger-full-access",
		})).toContain("read-only");
	});

	it("warns when approval policy is placed after the exec subcommand", () => {
		expect(getCodexSafetyWarning({
			...SETTINGS,
			codexExtraArgs: "exec --ask-for-approval never --sandbox read-only",
		})).toContain("after exec");
	});

	it("warns when later duplicate approval arguments override never mode", () => {
		expect(getCodexSafetyWarning({
			...SETTINGS,
			codexExtraArgs: "--ask-for-approval never exec --sandbox read-only --ask-for-approval on-request",
		})).toContain("never");
	});
});

describe("CodexRunner", () => {
	it("spawns the configured command with cwd, streams output, and writes prompt to stdin", async () => {
		const calls: SpawnCall[] = [];
		const spawn = createFakeSpawn(calls, (child) => {
			child.stdout.write("out");
			child.stderr.write("err");
			child.emit("close", 0);
		});
		const stdout: string[] = [];
		const stderr: string[] = [];

		const result = await new CodexRunner(spawn).run({
			prompt: " explain ",
			settings: SETTINGS,
			vaultPath: "/tmp/vault",
			onStdout: (chunk) => stdout.push(chunk),
			onStderr: (chunk) => stderr.push(chunk),
		});

		expect(result).toEqual({ code: 0, stdout: "out", stderr: "err" });
		expect(stdout).toEqual(["out"]);
		expect(stderr).toEqual(["err"]);
		expect(calls[0]?.command.endsWith("codex")).toBe(true);
		expect(calls[0]?.args.slice(-3)).toEqual(["-C", "/tmp/vault", "-"]);
		expect(calls[0]?.options.cwd).toBe("/tmp/vault");
		expect(calls[0]?.options.env?.PATH).toContain("/usr/local/bin");
		expect(calls[0]?.stdin).toBe("explain");
	});

	it("preserves absolute configured working directories for child_process", async () => {
		const calls: SpawnCall[] = [];
		const spawn = createFakeSpawn(calls, (child) => {
			child.emit("close", 0);
		});

		await new CodexRunner(spawn).run({
			prompt: "run",
			settings: { ...SETTINGS, workingDirectory: "/Users/tester/Vault" },
			vaultPath: "/tmp/vault",
			onStdout: () => undefined,
			onStderr: () => undefined,
		});

		expect(calls[0]?.args.slice(-3)).toEqual(["-C", "/Users/tester/Vault", "-"]);
		expect(calls[0]?.options.cwd).toBe("/Users/tester/Vault");
	});

	it("returns nonzero exit codes without throwing", async () => {
		const spawn = createFakeSpawn([], (child) => {
			child.stderr.write("bad args");
			child.emit("close", 2);
		});

		const result = await new CodexRunner(spawn).run({
			prompt: "run",
			settings: SETTINGS,
			vaultPath: "/tmp/vault",
			onStdout: () => undefined,
			onStderr: () => undefined,
		});

		expect(result.code).toBe(2);
		expect(result.stderr).toBe("bad args");
	});

	it("rejects missing command errors", async () => {
		const spawn = createFakeSpawn([], (child) => {
			child.emit("error", new Error("spawn codex ENOENT"));
		});

		await expect(new CodexRunner(spawn).run({
			prompt: "run",
			settings: SETTINGS,
			vaultPath: "/tmp/vault",
			onStdout: () => undefined,
			onStderr: () => undefined,
		})).rejects.toThrow("ENOENT");
	});
});

describe("testCodexCli", () => {
	it("uses the same exec argument shape as a real run and writes a stdin probe", async () => {
		const calls: SpawnCall[] = [];
		const spawn = createFakeSpawn(calls, (child) => {
			child.stdout.write("Codeian CLI self-test");
			child.emit("close", 0);
		});

		const result = await testCodexCli(SETTINGS, "/tmp/vault", spawn);

		expect(result.ok).toBe(true);
		expect(calls[0]?.args.slice(-3)).toEqual(["-C", "/tmp/vault", "-"]);
		expect(calls[0]?.stdin).toBe("Reply with exactly: Codeian CLI self-test.");
	});

	it("reports launch errors with recovery guidance", async () => {
		const spawn = createFakeSpawn([], (child) => {
			child.emit("error", new Error("spawn codex ENOENT"));
		});

		const result = await testCodexCli(SETTINGS, "/tmp/vault", spawn);

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Could not launch codex");
	});
});

interface SpawnCall {
	command: string;
	args: string[];
	options: SpawnOptionsWithoutStdio;
	stdin: string;
}

function createFakeSpawn(
	calls: SpawnCall[],
	afterSpawn: (child: ChildProcessWithoutNullStreams) => void,
): CodexSpawn {
	return (command, args, options) => {
		const stdin = new PassThrough();
		const child = new EventEmitter() as ChildProcessWithoutNullStreams;
		child.stdin = stdin;
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.kill = () => true;
		const call: SpawnCall = { command, args, options, stdin: "" };
		calls.push(call);
		stdin.on("data", (chunk: Buffer) => {
			call.stdin += chunk.toString();
		});
		setTimeout(() => afterSpawn(child), 0);
		return child;
	};
}
