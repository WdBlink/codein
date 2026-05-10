import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import { CodexRunner, getCodexSafetyWarning } from "./codexRunner";
import type CodeianPlugin from "./main";

export const VIEW_TYPE_CODEIAN = "codeian-codex-view";

export class CodeianView extends ItemView {
	private plugin: CodeianPlugin;
	private runner = new CodexRunner();
	private promptEl: HTMLTextAreaElement | null = null;
	private runButtonEl: HTMLButtonElement | null = null;
	private cancelButtonEl: HTMLButtonElement | null = null;
	private clearButtonEl: HTMLButtonElement | null = null;
	private settingsButtonEl: HTMLButtonElement | null = null;
	private newSessionButtonEl: HTMLButtonElement | null = null;
	private outputEl: HTMLElement | null = null;
	private outputBodyEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private sessionTitleEl: HTMLElement | null = null;
	private lastPrompt: string;
	private promptContainsNoteContext = false;
	private readonly emptyOutputText = "Output will appear here after a run.";

	constructor(leaf: WorkspaceLeaf, plugin: CodeianPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.lastPrompt = plugin.settings.lastPrompt;
	}

	getViewType(): string {
		return VIEW_TYPE_CODEIAN;
	}

	getDisplayText(): string {
		return "Codeian";
	}

	getIcon(): string {
		return "bot";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.runner.cancel();
		await this.persistSessionState();
	}

	async setPrompt(prompt: string, containsNoteContext = false): Promise<void> {
		if (!this.promptEl) {
			this.render();
		}
		this.lastPrompt = prompt;
		this.promptContainsNoteContext = containsNoteContext;
		if (this.promptEl) {
			this.promptEl.value = prompt;
			this.promptEl.focus();
		}
		await this.persistSessionState();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("codeian-view");

		const headerEl = this.contentEl.createDiv({ cls: "codeian-header" });
		const titleGroupEl = headerEl.createDiv({ cls: "codeian-title-group" });
		titleGroupEl.createEl("h3", { text: "Codeian", cls: "codeian-title" });
		titleGroupEl.createDiv({ text: "Local command sidebar", cls: "codeian-subtitle" });
		const headerActionsEl = headerEl.createDiv({ cls: "codeian-header-actions" });
		this.newSessionButtonEl = headerActionsEl.createEl("button", {
			cls: "clickable-icon codeian-icon-button",
			attr: { "aria-label": "New session", title: "New session" },
		});
		this.newSessionButtonEl.setText("+");
		this.settingsButtonEl = headerActionsEl.createEl("button", {
			cls: "clickable-icon codeian-icon-button",
			attr: { "aria-label": "Open settings", title: "Open settings" },
		});
		this.settingsButtonEl.setText("...");
		const statusWrapEl = headerEl.createDiv({ cls: "codeian-status-wrap" });
		statusWrapEl.createDiv({ cls: "codeian-status-dot", attr: { "aria-hidden": "true" } });
		this.statusEl = statusWrapEl.createDiv({
			cls: "codeian-status",
			text: "Ready",
			attr: {
				"aria-atomic": "true",
				"aria-live": "polite",
				role: "status",
			},
		});

		const sessionEl = this.contentEl.createDiv({ cls: "codeian-session-strip" });
		this.sessionTitleEl = sessionEl.createDiv({
			cls: "codeian-session-title",
			text: this.lastPrompt ? firstLine(this.lastPrompt) : "New session",
		});
		sessionEl.createDiv({ cls: "codeian-session-meta", text: "Codex" });

		const formEl = this.contentEl.createDiv({ cls: "codeian-form" });
		const promptHeaderEl = formEl.createDiv({ cls: "codeian-section-header" });
		promptHeaderEl.createEl("label", {
			text: "Prompt",
			cls: "codeian-label",
			attr: { for: "codeian-prompt-input" },
		});
		promptHeaderEl.createDiv({ text: "Vault-aware request", cls: "codeian-meta" });
		formEl.createDiv({
			text: "Default settings run in read-only mode. Current note context requires confirmation before it is sent.",
			cls: "codeian-safety-note",
		});
		const hintEl = formEl.createDiv({ cls: "codeian-command-hints", attr: { "aria-label": "Command hints" } });
		for (const hint of [
			["/", "Commands"],
			["$", "Skills"],
			["@", "Mentions"],
			["#", "Instructions"],
		] as const) {
			const pillEl = hintEl.createDiv({ cls: "codeian-command-pill" });
			pillEl.createSpan({ cls: "codeian-command-token", text: hint[0] });
			pillEl.createSpan({ text: hint[1] });
		}
		this.promptEl = formEl.createEl("textarea", {
			cls: "codeian-prompt",
			attr: {
				"aria-describedby": "codeian-prompt-help",
				"aria-label": "Codex prompt",
				id: "codeian-prompt-input",
				placeholder: "Ask the agent to inspect, explain, or plan changes for this vault...",
				rows: "8",
			},
		});
		this.promptEl.value = this.lastPrompt;
		this.promptEl.addEventListener("input", () => {
			this.lastPrompt = this.promptEl?.value ?? "";
			this.updateSessionTitle();
			void this.persistSessionState();
		});
		formEl.createDiv({
			text: "Keep prompts specific. Include the note only when the task needs the full context.",
			cls: "codeian-help",
			attr: { id: "codeian-prompt-help" },
		});

		const actionEl = formEl.createDiv({ cls: "codeian-actions" });
		this.runButtonEl = actionEl.createEl("button", {
			text: "Run",
			cls: "mod-cta",
		});
		this.cancelButtonEl = actionEl.createEl("button", {
			text: "Cancel",
		});
		this.clearButtonEl = actionEl.createEl("button", {
			text: "Clear output",
		});

		this.cancelButtonEl.disabled = true;

		this.newSessionButtonEl.addEventListener("click", () => {
			void this.newSession();
		});
		this.settingsButtonEl.addEventListener("click", () => {
			this.openSettings();
		});
		this.runButtonEl.addEventListener("click", () => {
			void this.runPrompt();
		});
		this.cancelButtonEl.addEventListener("click", () => {
			this.runner.cancel();
			this.setStatus("Cancelling...");
		});
		this.clearButtonEl.addEventListener("click", () => {
			this.setOutput("");
			this.setStatus("Ready");
		});

		const outputPanelEl = this.contentEl.createDiv({ cls: "codeian-output-panel" });
		const outputHeaderEl = outputPanelEl.createDiv({ cls: "codeian-section-header" });
		outputHeaderEl.createDiv({ text: "Output", cls: "codeian-label" });
		outputHeaderEl.createDiv({ text: "Live log", cls: "codeian-meta" });
		this.outputEl = outputPanelEl.createEl("pre", {
			cls: "codeian-output",
			attr: {
				"aria-label": "Codex output",
				role: "log",
				tabindex: "0",
			},
		});
		this.outputBodyEl = this.outputEl.createEl("code", { text: this.emptyOutputText });
		if (this.plugin.settings.lastOutput) {
			this.setOutput(this.plugin.settings.lastOutput);
		}
		if (this.plugin.settings.lastStatus) {
			this.setStatus(this.plugin.settings.lastStatus);
		}
	}

	private async runPrompt(): Promise<void> {
		if (this.runner.isRunning()) {
			new Notice("Codex is already running.");
			return;
		}

		const prompt = this.promptEl?.value.trim() ?? "";
		if (!prompt) {
			this.setStatus("Prompt required");
			this.setOutput("Enter a prompt, then run Codex. Nothing is sent until you press Run.");
			new Notice("Enter a prompt before running.");
			return;
		}
		this.lastPrompt = prompt;
		this.updateSessionTitle();
		await this.persistSessionState();

		if (this.promptContainsNoteContext && !window.confirm("This prompt includes the current note content. Send it to Codex now?")) {
			this.setStatus("Send cancelled");
			this.setOutput("The current note content was not sent. Review the prompt and press Run when ready.");
			return;
		}

		const safetyWarning = getCodexSafetyWarning(this.plugin.settings);
		if (safetyWarning && !window.confirm(`${safetyWarning}\n\nRun anyway?`)) {
			this.setStatus("Run cancelled");
			this.setOutput(`${safetyWarning}\n\nOpen Codeian settings to restore the default read-only Codex configuration.`);
			return;
		}

		this.setRunning(true);
		this.setStatus("Running Codex...");
		this.setOutput("");

		try {
			const result = await this.runner.run({
				prompt,
				settings: this.plugin.settings,
				vaultPath: this.plugin.getVaultPath(),
				onStdout: (chunk) => this.appendOutput(chunk),
				onStderr: (chunk) => this.appendOutput(chunk),
			});

			if (result.code === 0) {
				this.setStatus("Finished");
			} else if (result.code === null) {
				this.setStatus("Cancelled");
			} else {
				this.setStatus(`Exited with code ${result.code}`);
				if (!result.stdout && !result.stderr) {
					this.appendOutput("Codex exited without output.");
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.setStatus("Failed");
			this.setOutput(formatFailureMessage(message));
			new Notice(`Codeian failed: ${message}`);
		} finally {
			this.setRunning(false);
			await this.persistSessionState();
		}
	}

	private setRunning(running: boolean): void {
		this.contentEl.toggleClass("codeian-is-running", running);
		if (this.runButtonEl) {
			this.runButtonEl.disabled = running;
		}
		if (this.cancelButtonEl) {
			this.cancelButtonEl.disabled = !running;
		}
		if (this.clearButtonEl) {
			this.clearButtonEl.disabled = running;
		}
		if (this.promptEl) {
			this.promptEl.toggleClass("codeian-prompt-running", running);
		}
	}

	private setStatus(status: string): void {
		if (this.statusEl) {
			this.statusEl.setText(status);
		}
		this.plugin.settings.lastStatus = status;
	}

	private setOutput(output: string): void {
		if (!this.outputEl) return;
		this.outputEl.empty();
		this.outputBodyEl = this.outputEl.createEl("code", { text: output || this.emptyOutputText });
		this.plugin.settings.lastOutput = output;
	}

	private appendOutput(chunk: string): void {
		if (!this.outputEl) return;

		const codeEl = this.outputBodyEl ?? this.outputEl.querySelector("code");
		if (!codeEl) {
			this.outputBodyEl = this.outputEl.createEl("code", { text: chunk });
			return;
		}

		if (codeEl.textContent === this.emptyOutputText) {
			codeEl.textContent = "";
		}
		codeEl.textContent += chunk;
		this.plugin.settings.lastOutput = codeEl.textContent ?? "";
		this.outputEl.scrollTop = this.outputEl.scrollHeight;
	}

	private async newSession(): Promise<void> {
		this.lastPrompt = "";
		this.promptContainsNoteContext = false;
		if (this.promptEl) {
			this.promptEl.value = "";
			this.promptEl.focus();
		}
		this.setOutput("");
		this.setStatus("Ready");
		this.updateSessionTitle();
		await this.persistSessionState();
	}

	private openSettings(): void {
		const appWithSetting = this.plugin.app as typeof this.plugin.app & {
			setting?: {
				open: () => void | Promise<void>;
				openTabById: (id: string) => void | Promise<void>;
			};
		};
		void appWithSetting.setting?.open();
		void appWithSetting.setting?.openTabById(this.plugin.manifest.id);
	}

	private updateSessionTitle(): void {
		this.sessionTitleEl?.setText(this.lastPrompt ? firstLine(this.lastPrompt) : "New session");
	}

	private async persistSessionState(): Promise<void> {
		this.plugin.settings.lastPrompt = this.promptEl?.value ?? this.lastPrompt;
		await this.plugin.saveSettings();
	}
}

function firstLine(text: string): string {
	const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
	return line.length > 72 ? `${line.slice(0, 69)}...` : line;
}

function formatFailureMessage(message: string): string {
	if (message.includes("ENOENT")) {
		return `${message}\n\nCould not launch the configured CLI. Check Codeian settings and confirm the command is available on PATH.`;
	}

	if (message.includes("working directory")) {
		return `${message}\n\nSet an absolute working directory in Codeian settings, or open Codeian from a desktop vault with a local path.`;
	}

	if (message.includes("Unclosed quote")) {
		return `${message}\n\nCheck Codeian settings for unmatched quotes in the Codex arguments field.`;
	}

	return `${message}\n\nCheck Codeian settings, then try again.`;
}
