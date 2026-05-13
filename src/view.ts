import { App, ItemView, MarkdownRenderer, Modal, Notice, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";

import { CodexRunner, getCodexSafetyWarning } from "./codexRunner";
import {
	appendCodexJsonChunk,
	createCodexJsonStreamState,
	flushCodexJsonStream,
	formatCodexUsage,
	type CodexFileChange,
	type CodexJsonStreamState,
	type CodexReasoningItem,
} from "./codexOutput";
import { shouldRunPromptFromKey } from "./keyboard";
import type CodeianPlugin from "./main";
import {
	applyPromptSuggestion,
	type PromptSuggestion,
} from "./promptSuggestions";
import { PromptSuggestionRegistry } from "./promptSuggestionRegistry";
import {
	buildCodexPromptForSession,
	clearActiveSidebarSessionConversation,
	createNewSidebarSession,
	deleteSidebarSession,
	getActiveSidebarSession,
	normalizeSidebarSessions,
	switchSidebarSession,
	updateActiveSidebarSession,
	updateSidebarSessionMetadata,
} from "./sessionState";
import { buildVaultFileSuggestions, type VaultFolderLike } from "./vaultFileSuggestions";
import { getVaultLinkLookupPath, getVaultLinkTarget, type VaultLinkTarget } from "./vaultLinkHandler";

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

const SANDBOX_OPTIONS = [
	{ value: "workspace-write", label: "Write" },
	{ value: "read-only", label: "Read" },
	{ value: "danger-full-access", label: "YOLO" },
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
	private sandboxLabelEl: HTMLElement | null = null;
	private sessionListEl: HTMLElement | null = null;
	private sessionTitleEl: HTMLInputElement | null = null;
	private sessionNoteEl: HTMLTextAreaElement | null = null;
	private currentAssistantContentEl: HTMLElement | null = null;
	private currentToolEventsEl: HTMLElement | null = null;
	private currentReasoningEl: HTMLElement | null = null;
	private currentAssistantMetaEl: HTMLElement | null = null;
	private suggestionsEl: HTMLElement | null = null;
	private promptSuggestions: PromptSuggestion[] = [];
	private activeSuggestionIndex = 0;
	private suggestionRegistry = new PromptSuggestionRegistry();
	private jsonState: CodexJsonStreamState = createCodexJsonStreamState();
	private diagnosticText = "";
	private lastPrompt: string;
	private currentAssistantOutput = "";
	private currentReasoningItems: string[] = [];
	private promptContainsNoteContext: boolean;
	private running = false;

	constructor(leaf: WorkspaceLeaf, plugin: CodeianPlugin) {
		super(leaf);
		this.plugin = plugin;
		normalizeSidebarSessions(this.plugin.settings);
		const activeSession = getActiveSidebarSession(plugin.settings);
		this.promptContainsNoteContext = activeSession.lastPromptContainsNoteContext;
		this.lastPrompt = resolveSessionPrompt(activeSession.lastPrompt, activeSession.lastOutput, activeSession.lastPromptContainsNoteContext, plugin.settings.defaultPrompt);
		this.currentAssistantOutput = activeSession.lastOutput;
		this.currentReasoningItems = activeSession.reasoning;
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

	onOpen(): Promise<void> {
		this.render();
		this.refreshVaultFileSuggestions();
		this.registerEvent(this.app.vault.on("create", () => this.handleVaultFilesChanged()));
		this.registerEvent(this.app.vault.on("delete", () => this.handleVaultFilesChanged()));
		this.registerEvent(this.app.vault.on("rename", () => this.handleVaultFilesChanged()));
		return this.refreshPromptSuggestionRegistry();
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
			this.updatePromptSuggestions();
		}
		if (containsNoteContext) {
			this.plugin.settings.lastPrompt = "";
			updateActiveSidebarSession(this.plugin.settings, {
				containsNoteContext,
				output: this.currentAssistantOutput,
				prompt,
				reasoning: this.currentReasoningItems,
			});
			await this.plugin.saveSettings();
		} else {
			await this.persistSessionState();
		}
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("codeian-view");

		const headerEl = this.contentEl.createDiv({ cls: "codeian-header" });
		const brandEl = headerEl.createDiv({ cls: "codeian-brand-mark", attr: { "aria-hidden": "true" } });
		setIcon(brandEl, "bot");
		const titleGroupEl = headerEl.createDiv({ cls: "codeian-title-group" });
		titleGroupEl.createEl("h3", { text: "Codeian", cls: "codeian-title" });
		titleGroupEl.createDiv({ text: "Codex in Obsidian", cls: "codeian-subtitle" });
		const headerActionsEl = headerEl.createDiv({ cls: "codeian-header-actions" });
		this.newSessionButtonEl = headerActionsEl.createEl("button", {
			cls: "clickable-icon codeian-header-button",
			attr: { "aria-label": "New chat", title: "New chat" },
		});
		setIcon(this.newSessionButtonEl, "plus");
		this.settingsButtonEl = headerActionsEl.createEl("button", {
			cls: "clickable-icon codeian-header-button",
			attr: { "aria-label": "Open settings", title: "Open settings" },
		});
		setIcon(this.settingsButtonEl, "settings");
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

		this.renderSessionPanel();

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
			this.updatePromptSuggestions();
		});
		this.promptEl.addEventListener("keydown", (event) => {
			if (this.handleSuggestionKey(event)) {
				return;
			}
			if (!shouldRunPromptFromKey(event)) {
				return;
			}
			if (this.runner.isRunning()) {
				return;
			}
			event.preventDefault();
			void this.runPrompt();
		});
		this.promptEl.addEventListener("click", () => {
			this.updatePromptSuggestions();
		});
		this.promptEl.addEventListener("focus", () => {
			void this.refreshPromptSuggestionRegistry();
		});
		this.promptEl.addEventListener("keyup", (event) => {
			if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
				this.updatePromptSuggestions();
			}
		});

		this.suggestionsEl = inputWrapperEl.createDiv({
			cls: "codeian-suggestions",
			attr: {
				"aria-hidden": "true",
				role: "listbox",
				"aria-label": "Codex suggestions",
			},
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
		this.sandboxLabelEl = this.createMenuSelector(
			pickerGroupEl,
			"Access",
			SANDBOX_OPTIONS,
			() => this.plugin.settings.codexSandbox,
			async (value) => {
				this.plugin.settings.codexSandbox = value;
				await this.plugin.saveSettings();
				this.updatePickerLabels();
			},
		);
		const actionEl = toolbarEl.createDiv({ cls: "codeian-actions" });
		this.clearButtonEl = actionEl.createEl("button", {
			cls: "codeian-action-button",
			attr: { "aria-label": "Clear conversation", title: "Clear" },
		});
		setIcon(this.clearButtonEl, "trash-2");
		this.cancelButtonEl = actionEl.createEl("button", {
			cls: "codeian-action-button",
			attr: { "aria-label": "Cancel run", title: "Cancel" },
		});
		setIcon(this.cancelButtonEl, "square");
		this.runButtonEl = actionEl.createEl("button", {
			cls: "codeian-action-button codeian-run-button",
			attr: { "aria-label": "Run prompt", title: "Run" },
		});
		setIcon(this.runButtonEl, "send");
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
			void this.clearActiveSessionConversation();
		});
		this.updatePickerLabels();
	}

	private renderInitialMessages(): void {
		this.clearMessages(false);
		const activeSession = getActiveSidebarSession(this.plugin.settings);
		this.currentAssistantOutput = activeSession.lastOutput;
		this.currentReasoningItems = activeSession.reasoning;
		if (activeSession.transcript.length > 0) {
			for (const entry of activeSession.transcript) {
				this.appendMessage(entry.role, entry.content, entry.reasoning);
			}
			return;
		}
		if (activeSession.lastPrompt) {
			this.appendMessage("user", activeSession.lastPrompt);
		}
		if (activeSession.lastOutput || activeSession.reasoning.length) {
			const message = this.appendMessage("assistant", activeSession.lastOutput || "No final response stored for this run.", activeSession.reasoning);
			this.currentAssistantContentEl = message.contentEl;
			this.currentAssistantMetaEl = message.metaEl;
		}
		if (!activeSession.lastPrompt && !activeSession.lastOutput && activeSession.reasoning.length === 0) {
			this.renderWelcome();
		}
	}

	private renderSessionPanel(): void {
		const panelEl = this.contentEl.createDiv({ cls: "codeian-session-panel" });
		const listWrapEl = panelEl.createDiv({ cls: "codeian-session-list-wrap" });
		this.sessionListEl = listWrapEl.createDiv({
			cls: "codeian-session-list",
			attr: {
				"aria-label": "Codeian sessions",
				role: "tablist",
			},
		});
		const editorEl = panelEl.createDiv({ cls: "codeian-session-editor" });
		const activeSession = getActiveSidebarSession(this.plugin.settings);
		const titleFieldEl = editorEl.createDiv({ cls: "codeian-session-field" });
		titleFieldEl.createEl("label", {
			cls: "codeian-session-label",
			text: "Session name",
			attr: { for: "codeian-session-title" },
		});
		this.sessionTitleEl = titleFieldEl.createEl("input", {
			cls: "codeian-session-title-input",
			value: activeSession.title,
			attr: {
				id: "codeian-session-title",
				spellcheck: "false",
				type: "text",
			},
		});
		const noteFieldEl = editorEl.createDiv({ cls: "codeian-session-field" });
		noteFieldEl.createEl("label", {
			cls: "codeian-session-label",
			text: "Topic note",
			attr: { for: "codeian-session-note" },
		});
		this.sessionNoteEl = noteFieldEl.createEl("textarea", {
			cls: "codeian-session-note-input",
			text: activeSession.note,
			attr: {
				id: "codeian-session-note",
				rows: "2",
				spellcheck: "true",
			},
		});

		this.sessionTitleEl.addEventListener("input", () => {
			void this.persistSessionMetadata(false);
		});
		this.sessionTitleEl.addEventListener("blur", () => {
			void this.persistSessionMetadata(true);
		});
		this.sessionNoteEl.addEventListener("input", () => {
			void this.persistSessionMetadata(false);
		});
		this.sessionNoteEl.addEventListener("blur", () => {
			void this.persistSessionMetadata(true);
		});
		this.renderSessionList();
	}

	private renderSessionList(): void {
		const listEl = this.sessionListEl;
		if (!listEl) {
			return;
		}
		normalizeSidebarSessions(this.plugin.settings);
		listEl.empty();
		for (const [index, session] of this.plugin.settings.sessions.entries()) {
			const isActive = session.id === this.plugin.settings.activeSessionId;
			const rowEl = listEl.createDiv({
				cls: `codeian-session-tab${isActive ? " is-active" : ""}`,
				attr: {
					"aria-selected": String(isActive),
					role: "tab",
					tabindex: isActive ? "0" : "-1",
					title: session.note || session.title,
				},
			});
			const buttonEl = rowEl.createEl("button", { cls: "codeian-session-switch" });
			buttonEl.createSpan({ cls: "codeian-session-index", text: String(index + 1) });
			const textEl = buttonEl.createSpan({ cls: "codeian-session-text" });
			textEl.createSpan({ cls: "codeian-session-name", text: session.title });
			if (session.note) {
				textEl.createSpan({ cls: "codeian-session-note-preview", text: session.note });
			}
			buttonEl.addEventListener("click", () => {
				if (isActive) return;
				void this.switchSession(session.id);
			});
			buttonEl.addEventListener("keydown", (event) => {
				if (event.key === "Delete" || event.key === "Backspace") {
					event.preventDefault();
					void this.deleteSession(session.id);
				}
			});
			rowEl.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				void this.deleteSession(session.id);
			});
			const deleteButtonEl = rowEl.createEl("button", {
				cls: "clickable-icon codeian-session-delete",
				attr: {
					"aria-label": `Delete ${session.title}`,
					title: "Delete session",
				},
			});
			setIcon(deleteButtonEl, "x");
			deleteButtonEl.addEventListener("click", (event) => {
				event.stopPropagation();
				void this.deleteSession(session.id);
			});
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

		if (this.promptContainsNoteContext) {
			const sendNoteContext = await confirmCodeianAction(
				this.app,
				"Send note content?",
				"This prompt includes the current note content. Send it to Codex now?",
				"Send",
			);
			if (!sendNoteContext.confirmed) {
				this.setStatus("Send cancelled");
				return;
			}
		}

		const safetyWarning = getCodexSafetyWarning(this.plugin.settings);
		const runAnyway = safetyWarning ? await this.confirmSafetyWarning(safetyWarning) : true;
		if (!runAnyway) {
			this.setStatus("Run cancelled");
			return;
		}

		const activeSessionBeforeRun = getActiveSidebarSession(this.plugin.settings);
		const codexPrompt = buildCodexPromptForSession(activeSessionBeforeRun, prompt);

		this.setRunning(true);
		this.clearComposer();
		this.currentAssistantOutput = "";
		this.currentReasoningItems = [];
		await this.persistSessionState(prompt, true);
		this.setStatus(`Running · ${this.getRunMetadata()}`);
		this.beginRunMessage(prompt);

		try {
			const result = await this.runner.run({
				prompt: codexPrompt,
				settings: this.plugin.settings,
				vaultPath: this.plugin.getVaultPath(),
				onStdout: (chunk) => this.appendStructuredCodexOutput(chunk),
				onStderr: (chunk) => {
					this.diagnosticText += chunk;
				},
			});

			const snapshot = flushCodexJsonStream(this.jsonState);
			this.renderFileChanges(snapshot.fileChanges);
			this.renderReasoningHistory(snapshot.reasoningItems);
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
			await this.persistSessionState(prompt, true);
		}
	}

	private async confirmSafetyWarning(safetyWarning: string): Promise<boolean> {
		const isYoloWarning = this.plugin.settings.codexSandbox === "danger-full-access"
			&& safetyWarning.toLowerCase().includes("unrestricted");
		if (isYoloWarning && this.plugin.settings.suppressYoloWarning) {
			return true;
		}

		const result = await confirmCodeianAction(
			this.app,
			isYoloWarning ? "Unrestricted file access" : "Run Codex?",
			`${safetyWarning}\n\nRun anyway?`,
			"Run",
			isYoloWarning ? { checkboxLabel: "Do not show this YOLO warning again" } : undefined,
		);
		if (result.confirmed && result.checked && isYoloWarning) {
			this.plugin.settings.suppressYoloWarning = true;
			await this.plugin.saveSettings();
		}
		return result.confirmed;
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
			optionEl.addEventListener("click", (event) => {
				event.stopPropagation();
				void onSelect(option.value)
					.then(() => {
						selectorEl.removeClass("is-open");
						buttonEl.setAttr("aria-expanded", "false");
					})
					.catch((error: unknown) => {
						new Notice(formatUnknownError(error));
					});
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
		message.contentEl.empty();
		this.currentToolEventsEl = message.contentEl.createDiv({ cls: "codeian-tool-events" });
		this.currentAssistantContentEl = message.contentEl.createDiv({ cls: "codeian-assistant-text codeian-thinking" });
		const thinkingStackEl = this.currentAssistantContentEl.createDiv({ cls: "codeian-thinking-stack", attr: { "aria-label": "Working" } });
		thinkingStackEl.createDiv({ cls: "codeian-thinking-line codeian-thinking-line-strong" });
		thinkingStackEl.createDiv({ cls: "codeian-thinking-line" });
		thinkingStackEl.createDiv({ cls: "codeian-thinking-line codeian-thinking-line-short" });
		this.currentAssistantMetaEl = message.metaEl;
		this.currentAssistantMetaEl?.setText(`Streaming · ${this.getRunMetadata()}`);
		this.scrollMessagesToBottom();
	}

	private appendStructuredCodexOutput(chunk: string): void {
		const snapshot = appendCodexJsonChunk(this.jsonState, chunk);
		this.renderFileChanges(snapshot.fileChanges);
		this.renderReasoningHistory(snapshot.reasoningItems);
		if (snapshot.hasFinalOutput) {
			this.setAssistantContent(snapshot.finalOutput);
		}
	}

	private appendMessage(role: "assistant" | "system" | "user", content: string, reasoningItems: readonly string[] = []): { contentEl: HTMLElement; metaEl: HTMLElement | null } {
		this.removeWelcome();
		const messagesEl = this.messagesEl;
		if (!messagesEl) {
			return { contentEl: this.contentEl, metaEl: null };
		}

		const messageEl = messagesEl.createDiv({ cls: `codeian-message codeian-message-${role}` });
		const contentEl = messageEl.createDiv({ cls: "codeian-message-content" });
		if (role === "assistant") {
			if (reasoningItems.length > 0) {
				this.renderReasoningHistory(reasoningItems.map((text, index) => ({ id: `stored-${index}`, text })), contentEl);
			}
			const assistantTextEl = contentEl.createDiv({ cls: "codeian-assistant-text" });
			this.renderMarkdownContent(assistantTextEl, content);
		} else {
			contentEl.setText(content);
		}
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
			this.renderMarkdownContent(this.currentAssistantContentEl, content);
		}
		this.currentAssistantMetaEl?.setText(this.getRunMetadata());
		this.currentAssistantOutput = content;
		this.plugin.settings.lastOutput = content;
		this.scrollMessagesToBottom();
	}

	private renderReasoningHistory(items: readonly CodexReasoningItem[], parentEl = this.currentToolEventsEl): void {
		const targetEl = parentEl;
		if (!targetEl) {
			return;
		}

		const reasoningTexts = dedupeText(items.map((item) => item.text).filter(Boolean));
		this.currentReasoningItems = reasoningTexts;
		if (reasoningTexts.length === 0) {
			if (targetEl === this.currentToolEventsEl) {
				this.currentReasoningEl?.remove();
				this.currentReasoningEl = null;
			}
			return;
		}

		let blockEl: HTMLElement;
		if (targetEl === this.currentToolEventsEl) {
			if (!this.currentReasoningEl) {
				this.currentReasoningEl = targetEl.createEl("details", { cls: "codeian-reasoning-block" });
			}
			blockEl = this.currentReasoningEl;
		} else {
			blockEl = targetEl.createEl("details", { cls: "codeian-reasoning-block" });
		}

		blockEl.empty();
		const summaryEl = blockEl.createEl("summary", { cls: "codeian-reasoning-summary" });
		summaryEl.createSpan({ cls: "codeian-reasoning-title", text: "Reasoning history" });
		summaryEl.createSpan({ cls: "codeian-reasoning-count", text: String(reasoningTexts.length) });
		const bodyEl = blockEl.createDiv({ cls: "codeian-reasoning-body" });
		for (const text of reasoningTexts) {
			bodyEl.createDiv({ cls: "codeian-reasoning-item", text });
		}
		this.scrollMessagesToBottom();
	}

	private renderFileChanges(fileChanges: CodexFileChange[]): void {
		if (!this.currentToolEventsEl) {
			return;
		}
		this.currentToolEventsEl.empty();
		for (const fileChange of fileChanges) {
			if (fileChange.entries.length === 0) {
				continue;
			}
			const detailsEl = this.currentToolEventsEl.createEl("details", { cls: "codeian-write-edit-block" });
			const summaryEl = detailsEl.createEl("summary", { cls: "codeian-write-edit-summary" });
			summaryEl.createSpan({ cls: "codeian-write-edit-name", text: formatToolName(fileChange.toolName) });
			summaryEl.createSpan({ cls: `codeian-write-edit-state is-${fileChange.status}`, text: formatFileChangeStatus(fileChange.status) });

			const bodyEl = detailsEl.createDiv({ cls: "codeian-write-edit-body" });
			for (const entry of fileChange.entries) {
				const rowEl = bodyEl.createDiv({ cls: "codeian-write-edit-row" });
				rowEl.createSpan({ cls: "codeian-write-edit-kind", text: entry.kind });
				rowEl.createSpan({ cls: "codeian-write-edit-path", text: entry.path });
				const stats = formatFileChangeStats(entry.addedLines, entry.removedLines);
				if (stats) {
					rowEl.createSpan({ cls: "codeian-write-edit-stats", text: stats });
				}
				if (entry.diff) {
					rowEl.createEl("pre", { cls: "codeian-write-edit-diff", text: entry.diff });
				}
			}
		}
		this.scrollMessagesToBottom();
	}

	private renderMarkdownContent(contentEl: HTMLElement, content: string): void {
		contentEl.empty();
		void MarkdownRenderer.render(this.app, content, contentEl, this.getMarkdownSourcePath(), this)
			.then(() => {
				this.bindRenderedVaultLinks(contentEl);
			})
			.catch(() => {
				contentEl.setText(content);
			})
			.finally(() => {
				this.scrollMessagesToBottom();
			});
	}

	private bindRenderedVaultLinks(contentEl: HTMLElement): void {
		for (const anchor of Array.from(contentEl.querySelectorAll("a"))) {
			anchor.addEventListener("click", (event) => {
				const target = getVaultLinkTarget(anchor, { vaultPath: this.plugin.getVaultPath() ?? undefined });
				if (!target) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				void this.openRenderedVaultLink(target, shouldOpenLinkInNewLeaf(event));
			});
		}
	}

	private async openRenderedVaultLink(target: VaultLinkTarget, newLeaf: boolean): Promise<void> {
		const sourcePath = this.getMarkdownSourcePath();
		if (!this.canResolveVaultLink(target.linktext, sourcePath)) {
			new Notice(`Codeian could not find "${target.displayText}" in this vault.`);
			return;
		}

		try {
			await this.app.workspace.openLinkText(target.linktext, sourcePath, newLeaf);
		} catch (error) {
			new Notice(`Codeian could not open "${target.displayText}": ${formatUnknownError(error)}`);
		}
	}

	private canResolveVaultLink(linktext: string, sourcePath: string): boolean {
		const lookupPath = getVaultLinkLookupPath(linktext);
		if (!lookupPath) {
			return false;
		}
		if (this.app.metadataCache.getFirstLinkpathDest(lookupPath, sourcePath)) {
			return true;
		}

		const exactPath = normalizePath(lookupPath);
		const exactFile = this.app.vault.getAbstractFileByPath(exactPath);
		if (exactFile && !("children" in exactFile)) {
			return true;
		}

		if (!exactPath.toLowerCase().endsWith(".md")) {
			const markdownFile = this.app.vault.getAbstractFileByPath(`${exactPath}.md`);
			return Boolean(markdownFile && !("children" in markdownFile));
		}

		return false;
	}

	private clearMessages(renderEmpty = true): void {
		this.messagesEl?.empty();
		this.currentAssistantContentEl = null;
		this.currentToolEventsEl = null;
		this.currentReasoningEl = null;
		this.currentAssistantMetaEl = null;
		this.currentAssistantOutput = "";
		this.currentReasoningItems = [];
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
		await this.persistSessionState();
		const session = createNewSidebarSession(this.plugin.settings);
		this.lastPrompt = resolveSessionPrompt(session.lastPrompt, session.lastOutput, session.lastPromptContainsNoteContext, this.plugin.settings.defaultPrompt);
		this.promptContainsNoteContext = false;
		this.currentAssistantOutput = "";
		this.currentReasoningItems = [];
		if (this.promptEl) {
			this.promptEl.value = this.lastPrompt;
			this.promptEl.focus();
			this.updatePromptSuggestions();
		}
		this.clearMessages();
		this.renderSessionList();
		this.updateSessionEditor();
		this.setStatus("Ready");
		await this.plugin.saveSettings();
	}

	private async switchSession(sessionId: string): Promise<void> {
		if (this.running) {
			new Notice("Cancel the running task before switching sessions.");
			return;
		}
		await this.persistSessionState();
		const session = switchSidebarSession(this.plugin.settings, sessionId);
		this.lastPrompt = resolveSessionPrompt(session.lastPrompt, session.lastOutput, session.lastPromptContainsNoteContext, this.plugin.settings.defaultPrompt);
		this.promptContainsNoteContext = session.lastPromptContainsNoteContext;
		this.currentAssistantOutput = session.lastOutput;
		this.currentReasoningItems = session.reasoning;
		if (this.promptEl) {
			this.promptEl.value = this.lastPrompt;
			this.updatePromptSuggestions();
		}
		this.renderInitialMessages();
		this.renderSessionList();
		this.updateSessionEditor();
		this.setStatus(this.plugin.settings.lastStatus || "Ready");
		await this.plugin.saveSettings();
	}

	private async deleteSession(sessionId: string): Promise<void> {
		if (this.running) {
			new Notice("Cancel the running task before deleting sessions.");
			return;
		}
		const wasActive = sessionId === this.plugin.settings.activeSessionId;
		deleteSidebarSession(this.plugin.settings, sessionId);
		if (wasActive) {
			const session = getActiveSidebarSession(this.plugin.settings);
			this.lastPrompt = resolveSessionPrompt(session.lastPrompt, session.lastOutput, session.lastPromptContainsNoteContext, this.plugin.settings.defaultPrompt);
			this.promptContainsNoteContext = session.lastPromptContainsNoteContext;
			this.currentAssistantOutput = session.lastOutput;
			this.currentReasoningItems = session.reasoning;
			if (this.promptEl) {
				this.promptEl.value = this.lastPrompt;
				this.updatePromptSuggestions();
			}
			this.renderInitialMessages();
			this.updateSessionEditor();
		}
		this.renderSessionList();
		await this.plugin.saveSettings();
	}

	private async persistSessionMetadata(renderList: boolean): Promise<void> {
		const activeSession = getActiveSidebarSession(this.plugin.settings);
		updateSidebarSessionMetadata(this.plugin.settings, activeSession.id, {
			note: this.sessionNoteEl?.value ?? activeSession.note,
			title: this.sessionTitleEl?.value ?? activeSession.title,
		});
		if (renderList) {
			this.renderSessionList();
			this.updateSessionEditor();
		}
		await this.plugin.saveSettings();
	}

	private updateSessionEditor(): void {
		const activeSession = getActiveSidebarSession(this.plugin.settings);
		if (this.sessionTitleEl && document.activeElement !== this.sessionTitleEl) {
			this.sessionTitleEl.value = activeSession.title;
		}
		if (this.sessionNoteEl && document.activeElement !== this.sessionNoteEl) {
			this.sessionNoteEl.value = activeSession.note;
		}
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

	private clearComposer(): void {
		if (this.promptEl) {
			this.promptEl.value = "";
		}
		this.hidePromptSuggestions();
	}

	private updatePromptSuggestions(): void {
		const promptEl = this.promptEl;
		const suggestionsEl = this.suggestionsEl;
		if (!promptEl || !suggestionsEl) {
			return;
		}

		this.promptSuggestions = this.suggestionRegistry.getSuggestions(promptEl.value, promptEl.selectionStart);
		if (this.promptSuggestions.length === 0) {
			this.hidePromptSuggestions();
			return;
		}

		this.activeSuggestionIndex = Math.min(this.activeSuggestionIndex, this.promptSuggestions.length - 1);
		suggestionsEl.empty();
		suggestionsEl.toggleClass("is-visible", true);
		suggestionsEl.setAttr("aria-hidden", "false");

		for (const [index, suggestion] of this.promptSuggestions.entries()) {
			const optionEl = suggestionsEl.createDiv({
				cls: `codeian-suggestion${index === this.activeSuggestionIndex ? " is-active" : ""}`,
				attr: {
					id: `codeian-suggestion-${index}`,
					role: "option",
					"aria-selected": String(index === this.activeSuggestionIndex),
				},
			});
			optionEl.createSpan({ cls: "codeian-suggestion-label", text: suggestion.label });
			optionEl.createSpan({ cls: "codeian-suggestion-detail", text: suggestion.detail });
			optionEl.addEventListener("mousedown", (event) => {
				event.preventDefault();
				this.acceptPromptSuggestion(index);
			});
		}
		promptEl.setAttr("aria-activedescendant", `codeian-suggestion-${this.activeSuggestionIndex}`);
	}

	private hidePromptSuggestions(): void {
		this.promptSuggestions = [];
		this.activeSuggestionIndex = 0;
		this.suggestionsEl?.empty();
		this.suggestionsEl?.toggleClass("is-visible", false);
		this.suggestionsEl?.setAttr("aria-hidden", "true");
		this.promptEl?.removeAttribute("aria-activedescendant");
	}

	private handleSuggestionKey(event: KeyboardEvent): boolean {
		if (this.promptSuggestions.length === 0) {
			return false;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			this.activeSuggestionIndex = (this.activeSuggestionIndex + 1) % this.promptSuggestions.length;
			this.updatePromptSuggestions();
			return true;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			this.activeSuggestionIndex =
				(this.activeSuggestionIndex + this.promptSuggestions.length - 1) % this.promptSuggestions.length;
			this.updatePromptSuggestions();
			return true;
		}

		if (event.key === "Tab" || event.key === "Enter") {
			event.preventDefault();
			this.acceptPromptSuggestion(this.activeSuggestionIndex);
			return true;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			this.hidePromptSuggestions();
			return true;
		}

		return false;
	}

	private acceptPromptSuggestion(index: number): void {
		const promptEl = this.promptEl;
		const suggestion = this.promptSuggestions[index];
		if (!promptEl || !suggestion) {
			return;
		}

		const result = applyPromptSuggestion(promptEl.value, promptEl.selectionStart, suggestion);
		promptEl.value = result.value;
		promptEl.setSelectionRange(result.caret, result.caret);
		promptEl.focus();
		this.lastPrompt = result.value;
		this.promptContainsNoteContext = false;
		this.plugin.settings.lastPromptContainsNoteContext = false;
		this.hidePromptSuggestions();
	}

	private async refreshPromptSuggestionRegistry(): Promise<void> {
		this.refreshVaultFileSuggestions();
		await this.suggestionRegistry.refresh(this.plugin.settings);
		if (this.suggestionsEl?.hasClass("is-visible")) {
			return;
		}
		this.updatePromptSuggestions();
	}

	private refreshVaultFileSuggestions(): void {
		const vaultWithConfigDir = this.app.vault as typeof this.app.vault & {
			configDir?: string;
			getAllFolders?: (includeRoot?: boolean) => VaultFolderLike[];
			getAllLoadedFiles?: () => Array<VaultFolderLike & { children?: unknown }>;
		};
		this.suggestionRegistry.setVaultFileSuggestions(
			buildVaultFileSuggestions(getVaultFiles(vaultWithConfigDir, this.app.vault.getMarkdownFiles()), {
				configDir: vaultWithConfigDir.configDir,
				folders: getVaultFolders(vaultWithConfigDir),
				vaultPath: this.plugin.getVaultPath() ?? undefined,
			}),
		);
	}

	private handleVaultFilesChanged(): void {
		this.refreshVaultFileSuggestions();
		this.updatePromptSuggestions();
	}

	private getRunMetadata(): string {
		return [
			this.getOptionLabel(MODEL_OPTIONS, this.plugin.settings.codexModel),
			this.getOptionLabel(EFFORT_OPTIONS, this.plugin.settings.codexEffort),
			this.getOptionLabel(SANDBOX_OPTIONS, this.plugin.settings.codexSandbox),
		].join(" · ");
	}

	private getOptionLabel<T extends string>(options: readonly { value: T; label: string }[], value: string): string {
		return options.find((option) => option.value === value)?.label ?? value;
	}

	private getMarkdownSourcePath(): string {
		return this.app.workspace.getActiveFile()?.path ?? "";
	}

	private async persistSessionState(promptOverride?: string, recordTranscript = false): Promise<void> {
		this.plugin.settings.lastPromptContainsNoteContext = this.promptContainsNoteContext;
		updateActiveSidebarSession(this.plugin.settings, {
			containsNoteContext: this.promptContainsNoteContext,
			output: this.currentAssistantOutput,
			prompt: promptOverride ?? this.promptEl?.value ?? this.lastPrompt,
			recordTranscript,
			reasoning: this.currentReasoningItems,
		});
		this.renderSessionList();
		this.updateSessionEditor();
		await this.plugin.saveSettings();
	}

	private async clearActiveSessionConversation(): Promise<void> {
		this.promptContainsNoteContext = false;
		this.lastPrompt = "";
		clearActiveSidebarSessionConversation(this.plugin.settings);
		this.renderSessionList();
		this.updateSessionEditor();
		await this.plugin.saveSettings();
	}
}

function formatToolName(toolName: string): string {
	const normalized = toolName.toLowerCase();
	if (normalized === "apply_patch" || normalized === "file_change" || normalized === "filechange") {
		return "File changes";
	}
	if (normalized === "write") return "Write";
	if (normalized === "edit") return "Edit";
	return toolName;
}

function formatFileChangeStatus(status: CodexFileChange["status"]): string {
	if (status === "running") return "Running";
	if (status === "failed") return "Failed";
	return "Done";
}

function formatFileChangeStats(addedLines: number | undefined, removedLines: number | undefined): string {
	const added = addedLines ?? 0;
	const removed = removedLines ?? 0;
	if (!added && !removed) return "";
	return `+${added} -${removed}`;
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

function resolveSessionPrompt(lastPrompt: string, lastOutput: string, containsNoteContext: boolean, defaultPrompt: string): string {
	if (containsNoteContext) {
		return "";
	}
	if (lastOutput) {
		return defaultPrompt || "";
	}
	return lastPrompt || defaultPrompt || "";
}

function dedupeText(items: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of items) {
		const text = item.trim();
		if (!text || seen.has(text)) {
			continue;
		}
		seen.add(text);
		result.push(text);
	}
	return result;
}

function getVaultFolders(vault: {
	getAllFolders?: (includeRoot?: boolean) => VaultFolderLike[];
	getAllLoadedFiles?: () => Array<VaultFolderLike & { children?: unknown }>;
}): VaultFolderLike[] {
	if (typeof vault.getAllFolders === "function") {
		return vault.getAllFolders(false);
	}
	if (typeof vault.getAllLoadedFiles !== "function") {
		return [];
	}
	return vault.getAllLoadedFiles()
		.filter((entry): entry is VaultFolderLike & { children: unknown[] } => typeof entry.path === "string" && Array.isArray(entry.children))
		.map((folder) => ({ path: folder.path }));
}

function getVaultFiles<T extends { path: string }>(
	vault: { getAllLoadedFiles?: () => Array<T & { children?: unknown }> },
	markdownFiles: readonly T[],
): T[] {
	if (typeof vault.getAllLoadedFiles !== "function") {
		return [...markdownFiles];
	}
	return vault.getAllLoadedFiles()
		.filter((entry): entry is T => typeof entry.path === "string" && !Array.isArray(entry.children));
}

function shouldOpenLinkInNewLeaf(event: MouseEvent): boolean {
	return event.metaKey || event.ctrlKey || event.button === 1;
}

interface ConfirmOptions {
	checkboxLabel?: string;
}

interface ConfirmResult {
	confirmed: boolean;
	checked: boolean;
}

function confirmCodeianAction(app: App, title: string, message: string, confirmText: string, options: ConfirmOptions = {}): Promise<ConfirmResult> {
	return new Promise((resolve) => {
		const modal = new CodeianConfirmModal(app, title, message, confirmText, options, resolve);
		modal.open();
	});
}

class CodeianConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly titleText: string,
		private readonly messageText: string,
		private readonly confirmText: string,
		private readonly options: ConfirmOptions,
		private readonly resolve: (result: ConfirmResult) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.titleText);
		const contentEl = this.contentEl;
		contentEl.empty();
		contentEl.createEl("p", { text: this.messageText });
		let checkboxEl: HTMLInputElement | null = null;
		if (this.options.checkboxLabel) {
			const checkboxWrapEl = contentEl.createEl("label", { cls: "codeian-confirm-checkbox" });
			checkboxEl = checkboxWrapEl.createEl("input", { attr: { type: "checkbox" } });
			checkboxWrapEl.createSpan({ text: this.options.checkboxLabel });
		}

		const buttonRowEl = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelButtonEl = buttonRowEl.createEl("button", { text: "Cancel" });
		const confirmButtonEl = buttonRowEl.createEl("button", {
			cls: "mod-cta",
			text: this.confirmText,
		});

		cancelButtonEl.addEventListener("click", () => {
			this.finish(false, checkboxEl?.checked ?? false);
		});
		confirmButtonEl.addEventListener("click", () => {
			this.finish(true, checkboxEl?.checked ?? false);
		});
	}

	onClose(): void {
		this.contentEl.empty();
		this.finish(false, false);
	}

	private finish(confirmed: boolean, checked: boolean): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.resolve({ checked, confirmed });
		this.close();
	}
}

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "Codeian action failed.";
}
