import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import { CodexRunner, getCodexSafetyWarning } from "./codexRunner";
import {
	appendCodexJsonChunk,
	createCodexJsonStreamState,
	flushCodexJsonStream,
	formatCodexUsage,
	type CodexJsonStreamState,
} from "./codexOutput";
import { shouldRunPromptFromKey } from "./keyboard";
import type CodeianPlugin from "./main";
import { buildPersistedSidebarState, resolveInitialSidebarPrompt } from "./sessionState";

export const VIEW_TYPE_CODEIAN = "codeian-codex-view";

const MODEL_OPTIONS = [
	{ value: "gpt-5.4-mini", label: "GPT-5.4 Mini", group: "Codex" },
	{ value: "gpt-5.5", label: "GPT-5.5", group: "Codex" },
	{ value: "gpt-5.4", label: "GPT-5.4", group: "Codex" },
	{ value: "gpt-5.3-codex-spark", label: "GPT-5.3 Spark", group: "Codex" },
] as const;

const EFFORT_OPTIONS = [
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "XHigh" },
] as const;

export class CodeianView extends ItemView {
	private plugin: CodeianPlugin;
	private runner = new CodexRunner();
	private promptEl: HTMLTextAreaElement | null = null;
	private runButtonEl: HTMLButtonElement | null = null;
	private cancelButtonEl: HTMLButtonElement | null = null;
	private clearButtonEl: HTMLButtonElement | null = null;
	private settingsButtonEl: HTMLButtonElement | null = null;
	private newSessionButtonEl: HTMLButtonElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private modelLabelEl: HTMLElement | null = null;
	private effortLabelEl: HTMLElement | null = null;
	private currentAssistantContentEl: HTMLElement | null = null;
	private currentAssistantMetaEl: HTMLElement | null = null;
	private jsonState: CodexJsonStreamState = createCodexJsonStreamState();
	private diagnosticText = "";
	private lastPrompt: string;
	private promptContainsNoteContext: boolean;
	private running = false;

	constructor(leaf: WorkspaceLeaf, plugin: CodeianPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.promptContainsNoteContext = plugin.settings.lastPromptContainsNoteContext;
		this.lastPrompt = resolveInitialSidebarPrompt(plugin.settings);
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
		if (this.running) {
			this.setStatus("Cancelled");
		}
		await this.persistSessionState();
	}

	async setPrompt(prompt: string, containsNoteContext = false): Promise<void> {
		if (!this.promptEl) {
			this.render();
		}
		this.lastPrompt = prompt;
		this.promptContainsNoteContext = containsNoteContext;
		this.plugin.settings.lastPromptContainsNoteContext = containsNoteContext;
		if (this.promptEl) {
			this.promptEl.value = prompt;
			this.promptEl.focus();
		}
		if (containsNoteContext) {
			this.plugin.settings.lastPrompt = "";
			await this.plugin.saveSettings();
		} else {
			await this.persistSessionState();
		}
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("codeian-view");

		const headerEl = this.contentEl.createDiv({ cls: "codeian-header" });
		const titleGroupEl = headerEl.createDiv({ cls: "codeian-title-group" });
		titleGroupEl.createEl("h3", { text: "Codeian", cls: "codeian-title" });
		titleGroupEl.createDiv({ text: "Codex in Obsidian", cls: "codeian-subtitle" });
		const headerActionsEl = headerEl.createDiv({ cls: "codeian-header-actions" });
		this.newSessionButtonEl = headerActionsEl.createEl("button", {
			cls: "clickable-icon codeian-header-button",
			attr: { "aria-label": "New chat", title: "New chat" },
		});
		this.newSessionButtonEl.setText("+");
		this.settingsButtonEl = headerActionsEl.createEl("button", {
			cls: "clickable-icon codeian-header-button",
			attr: { "aria-label": "Open settings", title: "Open settings" },
		});
		this.settingsButtonEl.setText("...");
		const statusWrapEl = headerEl.createDiv({ cls: "codeian-status-wrap" });
		statusWrapEl.createDiv({ cls: "codeian-status-dot", attr: { "aria-hidden": "true" } });
		this.statusEl = statusWrapEl.createDiv({
			cls: "codeian-status",
			text: this.plugin.settings.lastStatus || "Ready",
			attr: {
				"aria-atomic": "true",
				"aria-live": "polite",
				role: "status",
			},
		});

		const messagesWrapperEl = this.contentEl.createDiv({ cls: "codeian-messages-wrapper" });
		this.messagesEl = messagesWrapperEl.createDiv({
			cls: "codeian-messages",
			attr: {
				"aria-label": "Codeian conversation",
				role: "log",
				tabindex: "0",
			},
		});
		this.renderInitialMessages();

		const inputContainerEl = this.contentEl.createDiv({ cls: "codeian-input-container" });
		const inputWrapperEl = inputContainerEl.createDiv({ cls: "codeian-composer-box" });
		this.promptEl = inputWrapperEl.createEl("textarea", {
			cls: "codeian-prompt",
			attr: {
				"aria-label": "Codex prompt",
				id: "codeian-prompt-input",
				placeholder: "Ask for help with this vault",
				rows: "3",
			},
		});
		this.promptEl.value = this.lastPrompt;
		this.promptEl.addEventListener("input", () => {
			this.lastPrompt = this.promptEl?.value ?? "";
			this.promptContainsNoteContext = false;
			this.plugin.settings.lastPromptContainsNoteContext = false;
		});
		this.promptEl.addEventListener("keydown", (event) => {
			if (!shouldRunPromptFromKey(event)) {
				return;
			}
			event.preventDefault();
			void this.runPrompt();
		});

		const toolbarEl = inputWrapperEl.createDiv({ cls: "codeian-input-toolbar" });
		const pickerGroupEl = toolbarEl.createDiv({ cls: "codeian-picker-group" });
		this.modelLabelEl = this.createMenuSelector(
			pickerGroupEl,
			"Model",
			MODEL_OPTIONS,
			() => this.plugin.settings.codexModel,
			async (value) => {
				this.plugin.settings.codexModel = value;
				await this.plugin.saveSettings();
				this.updatePickerLabels();
			},
		);
		this.effortLabelEl = this.createMenuSelector(
			pickerGroupEl,
			"Effort",
			EFFORT_OPTIONS,
			() => this.plugin.settings.codexEffort,
			async (value) => {
				this.plugin.settings.codexEffort = value;
				await this.plugin.saveSettings();
				this.updatePickerLabels();
			},
		);
		const actionEl = toolbarEl.createDiv({ cls: "codeian-actions" });
		this.clearButtonEl = actionEl.createEl("button", {
			text: "Clear",
			cls: "codeian-action-button",
		});
		this.cancelButtonEl = actionEl.createEl("button", {
			text: "Cancel",
			cls: "codeian-action-button",
		});
		this.runButtonEl = actionEl.createEl("button", {
			text: "Run",
			cls: "codeian-action-button codeian-run-button",
		});
		this.cancelButtonEl.disabled = true;

		this.newSessionButtonEl.addEventListener("click", () => {
			if (this.running) return;
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
			this.clearMessages();
			this.setStatus("Ready");
			void this.persistSessionState();
		});
		this.updatePickerLabels();
	}

	private renderInitialMessages(): void {
		this.clearMessages(false);
		if (this.plugin.settings.lastPrompt) {
			this.appendMessage("user", this.plugin.settings.lastPrompt);
		}
		if (this.plugin.settings.lastOutput) {
			const message = this.appendMessage("assistant", this.plugin.settings.lastOutput);
			this.currentAssistantContentEl = message.contentEl;
			this.currentAssistantMetaEl = message.metaEl;
		}
		if (!this.plugin.settings.lastPrompt && !this.plugin.settings.lastOutput) {
			this.renderWelcome();
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
			new Notice("Enter a prompt before running.");
			return;
		}
		this.lastPrompt = prompt;
		if (!this.promptContainsNoteContext) {
			await this.persistSessionState();
		}

		if (this.promptContainsNoteContext && !window.confirm("This prompt includes the current note content. Send it to Codex now?")) {
			this.setStatus("Send cancelled");
			return;
		}

		const safetyWarning = getCodexSafetyWarning(this.plugin.settings);
		if (safetyWarning && !window.confirm(`${safetyWarning}\n\nRun anyway?`)) {
			this.setStatus("Run cancelled");
			return;
		}

		this.setRunning(true);
		this.setStatus("Running Codex...");
		this.beginRunMessage(prompt);

		try {
			const result = await this.runner.run({
				prompt,
				settings: this.plugin.settings,
				vaultPath: this.plugin.getVaultPath(),
				onStdout: (chunk) => this.appendStructuredCodexOutput(chunk),
				onStderr: (chunk) => {
					this.diagnosticText += chunk;
				},
			});

			const snapshot = flushCodexJsonStream(this.jsonState);
			if (snapshot.hasFinalOutput) {
				this.setAssistantContent(snapshot.finalOutput);
			}

			if (result.code === 0) {
				const usage = formatCodexUsage(snapshot.usage);
				this.setStatus(usage ? `Finished · ${usage}` : "Finished");
				if (!snapshot.hasFinalOutput) {
					this.setAssistantContent("Codex finished without a final response.");
				}
			} else if (result.code === null) {
				this.setStatus("Cancelled");
				if (!snapshot.hasFinalOutput) {
					this.setAssistantContent("Codex run was cancelled.");
				}
			} else {
				this.setStatus(`Exited with code ${result.code}`);
				if (!snapshot.hasFinalOutput) {
					this.setAssistantContent(formatFailureMessage(this.diagnosticText || snapshot.errorText || `Codex exited with code ${result.code}.`));
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.setStatus("Failed");
			this.setAssistantContent(formatFailureMessage(message));
			new Notice(`Codeian failed: ${message}`);
		} finally {
			this.setRunning(false);
			await this.persistSessionState();
		}
	}

	private createMenuSelector<T extends string>(
		parentEl: HTMLElement,
		label: string,
		options: readonly { value: T; label: string; group?: string }[],
		getValue: () => string,
		onSelect: (value: T) => Promise<void>,
	): HTMLElement {
		const selectorEl = parentEl.createDiv({ cls: "codeian-selector" });
		const buttonEl = selectorEl.createDiv({
			cls: "codeian-selector-button",
			attr: {
				"aria-expanded": "false",
				"aria-haspopup": "menu",
				"aria-label": label,
				role: "button",
				tabindex: "0",
			},
		});
		buttonEl.createSpan({ cls: "codeian-selector-prefix", text: `${label}:` });
		const labelEl = buttonEl.createSpan({ cls: "codeian-selector-label" });
		const dropdownEl = selectorEl.createDiv({ cls: "codeian-selector-dropdown" });

		let lastGroup = "";
		for (const option of [...options].reverse()) {
			if (option.group && option.group !== lastGroup) {
				dropdownEl.createDiv({ cls: "codeian-selector-group", text: option.group });
				lastGroup = option.group;
			}
			const optionEl = dropdownEl.createDiv({ cls: "codeian-selector-option", text: option.label });
			optionEl.addEventListener("click", async (event) => {
				event.stopPropagation();
				await onSelect(option.value);
				selectorEl.removeClass("is-open");
				buttonEl.setAttr("aria-expanded", "false");
			});
		}

		const toggleOpen = () => {
			const open = !selectorEl.hasClass("is-open");
			selectorEl.toggleClass("is-open", open);
			buttonEl.setAttr("aria-expanded", String(open));
		};
		buttonEl.addEventListener("click", (event) => {
			event.stopPropagation();
			toggleOpen();
		});
		buttonEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				toggleOpen();
			}
			if (event.key === "Escape") {
				selectorEl.removeClass("is-open");
				buttonEl.setAttr("aria-expanded", "false");
			}
		});
		this.registerDomEvent(document, "click", () => {
			selectorEl.removeClass("is-open");
			buttonEl.setAttr("aria-expanded", "false");
		});

		const update = () => {
			const current = getValue();
			const currentOption = options.find((option) => option.value === current) ?? options[0];
			labelEl.setText(currentOption?.label ?? current);
			for (const optionEl of Array.from(dropdownEl.querySelectorAll(".codeian-selector-option"))) {
				optionEl.toggleClass("selected", optionEl.textContent === currentOption?.label);
			}
		};
		labelEl.dataset.update = "true";
		(selectorEl as HTMLElement & { updateCodeianSelector?: () => void }).updateCodeianSelector = update;
		update();
		return labelEl;
	}

	private updatePickerLabels(): void {
		for (const selectorEl of Array.from(this.contentEl.querySelectorAll(".codeian-selector"))) {
			(selectorEl as HTMLElement & { updateCodeianSelector?: () => void }).updateCodeianSelector?.();
		}
	}

	private beginRunMessage(prompt: string): void {
		this.jsonState = createCodexJsonStreamState();
		this.diagnosticText = "";
		this.removeWelcome();
		this.appendMessage("user", prompt);
		const message = this.appendMessage("assistant", "Working...");
		message.contentEl.addClass("codeian-thinking");
		this.currentAssistantContentEl = message.contentEl;
		this.currentAssistantMetaEl = message.metaEl;
		this.currentAssistantMetaEl?.setText("Streaming");
		this.scrollMessagesToBottom();
	}

	private appendStructuredCodexOutput(chunk: string): void {
		const snapshot = appendCodexJsonChunk(this.jsonState, chunk);
		if (snapshot.hasFinalOutput) {
			this.setAssistantContent(snapshot.finalOutput);
		}
	}

	private appendMessage(role: "assistant" | "system" | "user", content: string): { contentEl: HTMLElement; metaEl: HTMLElement | null } {
		this.removeWelcome();
		const messagesEl = this.messagesEl;
		if (!messagesEl) {
			return { contentEl: this.contentEl, metaEl: null };
		}

		const messageEl = messagesEl.createDiv({ cls: `codeian-message codeian-message-${role}` });
		const contentEl = messageEl.createDiv({ cls: "codeian-message-content", text: content });
		const metaEl = role === "assistant" ? messageEl.createDiv({ cls: "codeian-message-meta" }) : null;
		this.scrollMessagesToBottom();
		return { contentEl, metaEl };
	}

	private setAssistantContent(content: string): void {
		if (!this.currentAssistantContentEl) {
			const message = this.appendMessage("assistant", content);
			this.currentAssistantContentEl = message.contentEl;
			this.currentAssistantMetaEl = message.metaEl;
		} else {
			this.currentAssistantContentEl.removeClass("codeian-thinking");
			this.currentAssistantContentEl.setText(content);
		}
		this.currentAssistantMetaEl?.setText("");
		this.plugin.settings.lastOutput = content;
		this.scrollMessagesToBottom();
	}

	private clearMessages(renderEmpty = true): void {
		this.messagesEl?.empty();
		this.currentAssistantContentEl = null;
		this.currentAssistantMetaEl = null;
		this.plugin.settings.lastOutput = "";
		if (renderEmpty) {
			this.renderWelcome();
		}
	}

	private renderWelcome(): void {
		if (!this.messagesEl || this.messagesEl.querySelector(".codeian-welcome")) {
			return;
		}
		const welcomeEl = this.messagesEl.createDiv({ cls: "codeian-welcome" });
		welcomeEl.createDiv({ cls: "codeian-welcome-greeting", text: "How can I help you today?" });
	}

	private removeWelcome(): void {
		this.messagesEl?.querySelector(".codeian-welcome")?.remove();
	}

	private scrollMessagesToBottom(): void {
		if (!this.messagesEl) return;
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private setRunning(running: boolean): void {
		this.running = running;
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
		if (this.newSessionButtonEl) {
			this.newSessionButtonEl.disabled = running;
		}
		if (this.promptEl) {
			this.promptEl.disabled = running;
			this.promptEl.toggleClass("codeian-prompt-running", running);
		}
	}

	private setStatus(status: string): void {
		if (this.statusEl) {
			this.statusEl.setText(status);
		}
		this.plugin.settings.lastStatus = status;
	}

	private async newSession(): Promise<void> {
		this.lastPrompt = this.plugin.settings.defaultPrompt || "";
		this.promptContainsNoteContext = false;
		this.plugin.settings.lastPromptContainsNoteContext = false;
		if (this.promptEl) {
			this.promptEl.value = this.lastPrompt;
			this.promptEl.focus();
		}
		this.clearMessages();
		this.setStatus("Ready");
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

	private async persistSessionState(): Promise<void> {
		this.plugin.settings.lastPromptContainsNoteContext = this.promptContainsNoteContext;
		const snapshot = buildPersistedSidebarState(
			this.promptEl?.value ?? this.lastPrompt,
			this.plugin.settings.lastOutput,
			this.promptContainsNoteContext,
		);
		this.plugin.settings.lastPrompt = snapshot.lastPrompt;
		this.plugin.settings.lastOutput = snapshot.lastOutput;
		this.plugin.settings.lastPromptContainsNoteContext = snapshot.lastPromptContainsNoteContext;
		await this.plugin.saveSettings();
	}
}

function formatFailureMessage(message: string): string {
	const trimmed = message.trim();
	if (trimmed.includes("ENOENT")) {
		return `${trimmed}\n\nCould not launch the configured CLI. Check Codeian settings and confirm the command is available on PATH.`;
	}

	if (trimmed.includes("working directory")) {
		return `${trimmed}\n\nSet an absolute working directory in Codeian settings, or open Codeian from a desktop vault with a local path.`;
	}

	if (trimmed.includes("Unclosed quote")) {
		return `${trimmed}\n\nCheck Codeian settings for unmatched quotes in the Codex arguments field.`;
	}

	return trimmed || "Codex failed. Check Codeian settings, then try again.";
}
