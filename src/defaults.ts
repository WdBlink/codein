export const CODEX_SANDBOX_MODES = ["workspace-write", "read-only", "danger-full-access"] as const;
export type CodexSandboxMode = typeof CODEX_SANDBOX_MODES[number];

export const DEFAULT_CODEX_SANDBOX: CodexSandboxMode = "workspace-write";
export const DEFAULT_CODEX_ARGS = "--ask-for-approval never exec --skip-git-repo-check";
export const LEGACY_CODEX_ARGS = "exec --ask-for-approval never --sandbox read-only --skip-git-repo-check";
export const LEGACY_CODEX_READ_ONLY_ARGS = "--ask-for-approval never exec --sandbox read-only --skip-git-repo-check";

export function resolveSandboxMode(value: string | undefined): CodexSandboxMode {
	return CODEX_SANDBOX_MODES.includes(value as CodexSandboxMode)
		? value as CodexSandboxMode
		: DEFAULT_CODEX_SANDBOX;
}
