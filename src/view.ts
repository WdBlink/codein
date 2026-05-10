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
	private outputEl: HTMLElement | null = null;
	private outputBodyEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private lastPrompt = "";
	private promptContainsNoteContext = false;
	private readonly emptyOutputText = "Output will appear here after a run.";

	constructor(leaf: WorkspaceLeaf, plugin: CodeianPlugin) {
		super(leaf);
		this.plugin = plugin;
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
	}

	setPrompt(prompt: string, containsNoteContext = false): void {
		if (!this.promptEl) {
			this.render();
		}
		this.lastPrompt = prompt;
		this.promptContainsNoteContext = containsNoteContext;
		if (this.promptEl) {
			this.promptEl.value = prompt;
			this.promptEl.focus();
		}
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("codeian-view");

		const headerEl = this.contentEl.createDiv({ cls: "codeian-header" });
		const titleGroupEl = headerEl.createDiv({ cls: "codeian-title-group" });
		titleGroupEl.createEl("h3", { text: "Codeian", cls: "codeian-title" });
		titleGroupEl.createDiv({ text: "Local command sidebar", cls: "codeian-subtitle" });
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
	}

	private setOutput(output: string): void {
		if (!this.outputEl) return;
		this.outputEl.empty();
		this.outputBodyEl = this.outputEl.createEl("code", { text: output || this.emptyOutputText });
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
		this.outputEl.scrollTop = this.outputEl.scrollHeight;
	}
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
