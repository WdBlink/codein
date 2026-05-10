import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import { CodexRunner } from "./codexRunner";
import type CodeianPlugin from "./main";

export const VIEW_TYPE_CODEIAN = "codeian-codex-view";

export class CodeianView extends ItemView {
	private plugin: CodeianPlugin;
	private runner = new CodexRunner();
	private promptEl: HTMLTextAreaElement | null = null;
	private runButtonEl: HTMLButtonElement | null = null;
	private cancelButtonEl: HTMLButtonElement | null = null;
	private outputEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;

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

	setPrompt(prompt: string): void {
		if (!this.promptEl) {
			this.render();
		}
		if (this.promptEl) {
			this.promptEl.value = prompt;
			this.promptEl.focus();
		}
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("codeian-view");

		const headerEl = this.contentEl.createDiv({ cls: "codeian-header" });
		headerEl.createEl("h3", { text: "Codeian" });
		this.statusEl = headerEl.createDiv({ cls: "codeian-status", text: "Ready" });

		const formEl = this.contentEl.createDiv({ cls: "codeian-form" });
		this.promptEl = formEl.createEl("textarea", {
				cls: "codeian-prompt",
				attr: {
					placeholder: "Ask the agent to inspect, explain, or plan changes for this vault...",
					rows: "8",
				},
			});

		const actionEl = formEl.createDiv({ cls: "codeian-actions" });
		this.runButtonEl = actionEl.createEl("button", {
			text: "Run",
			cls: "mod-cta",
		});
		this.cancelButtonEl = actionEl.createEl("button", {
			text: "Cancel",
		});
		const clearButtonEl = actionEl.createEl("button", {
			text: "Clear",
		});

		this.cancelButtonEl.disabled = true;

		this.runButtonEl.addEventListener("click", () => {
			void this.runPrompt();
		});
		this.cancelButtonEl.addEventListener("click", () => {
			this.runner.cancel();
			this.setStatus("Cancelling...");
		});
		clearButtonEl.addEventListener("click", () => {
			this.setOutput("");
			this.setStatus("Ready");
		});

		this.outputEl = this.contentEl.createEl("pre", { cls: "codeian-output" });
		this.outputEl.createEl("code", { text: "Output will appear here." });
	}

	private async runPrompt(): Promise<void> {
		if (this.runner.isRunning()) {
			new Notice("Codex is already running.");
			return;
		}

		const prompt = this.promptEl?.value.trim() ?? "";
		if (!prompt) {
			new Notice("Enter a prompt before running.");
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
			this.appendOutput(message);
			new Notice(`Codeian failed: ${message}`);
		} finally {
			this.setRunning(false);
		}
	}

	private setRunning(running: boolean): void {
		if (this.runButtonEl) {
			this.runButtonEl.disabled = running;
		}
		if (this.cancelButtonEl) {
			this.cancelButtonEl.disabled = !running;
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
		this.outputEl.createEl("code", { text: output || "Output will appear here." });
	}

	private appendOutput(chunk: string): void {
		if (!this.outputEl) return;

		const codeEl = this.outputEl.querySelector("code");
		if (!codeEl) {
			this.outputEl.createEl("code", { text: chunk });
			return;
		}

		if (codeEl.textContent === "Output will appear here.") {
			codeEl.textContent = "";
		}
		codeEl.textContent += chunk;
		this.outputEl.scrollTop = this.outputEl.scrollHeight;
	}
}
