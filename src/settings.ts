import { App, Notice, PluginSettingTab, Setting } from "obsidian";

import CodeianPlugin from "./main";
import { testCodexCli } from "./codexRunner";
import {
	DEFAULT_CODEX_ARGS,
	DEFAULT_CODEX_SANDBOX,
	resolveSandboxMode,
	type CodexSandboxMode,
} from "./defaults";

export interface CodeianSettings {
	codexCommand: string;
	codexExtraArgs: string;
	codexEffort: string;
	codexModel: string;
	codexSandbox: CodexSandboxMode;
	defaultPrompt: string;
	activeSessionId: string;
	sessions: CodeianSession[];
	suppressYoloWarning: boolean;
	workingDirectory: string;
	lastPrompt: string;
	lastOutput: string;
	lastStatus: string;
	lastPromptContainsNoteContext: boolean;
}

export interface CodeianSession {
	id: string;
	title: string;
	note: string;
	lastPrompt: string;
	lastOutput: string;
	reasoning: string[];
	transcript: CodeianSessionTranscriptEntry[];
	lastPromptContainsNoteContext: boolean;
	updatedAt: number;
}

export interface CodeianSessionTranscriptEntry {
	role: "assistant" | "user";
	content: string;
	reasoning: string[];
	createdAt: number;
}

export const DEFAULT_SETTINGS: CodeianSettings = {
	activeSessionId: "",
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	codexEffort: "medium",
	codexModel: "gpt-5.4-mini",
	codexSandbox: DEFAULT_CODEX_SANDBOX,
	defaultPrompt: "",
	lastOutput: "",
	lastPrompt: "",
	lastPromptContainsNoteContext: false,
	lastStatus: "Ready",
	sessions: [],
	suppressYoloWarning: false,
	workingDirectory: "",
};

export class CodeianSettingTab extends PluginSettingTab {
	plugin: CodeianPlugin;

	constructor(app: App, plugin: CodeianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Integration")
			.setHeading();

		new Setting(containerEl)
			.setName("CLI command")
			.setDesc("Command used to launch the local agent CLI.")
			.addText((text) => text
				.setValue(this.plugin.settings.codexCommand)
				.onChange(async (value) => {
					this.plugin.settings.codexCommand = value.trim() || DEFAULT_SETTINGS.codexCommand;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Codex arguments")
			.setDesc("Arguments passed before the prompt.")
			.addTextArea((text) => text
				.setPlaceholder(DEFAULT_SETTINGS.codexExtraArgs)
				.setValue(this.plugin.settings.codexExtraArgs)
				.onChange(async (value) => {
					this.plugin.settings.codexExtraArgs = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("File access")
			.setDesc("Controls codex --sandbox; write allows edits inside the vault/workspace, and yolo gives unrestricted filesystem access.")
			.addDropdown((dropdown) => dropdown
				.addOption("workspace-write", "Write")
				.addOption("read-only", "Read")
				.addOption("danger-full-access", "YOLO")
				.setValue(resolveSandboxMode(this.plugin.settings.codexSandbox))
				.onChange(async (value) => {
					this.plugin.settings.codexSandbox = resolveSandboxMode(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Warn before unrestricted runs")
			.setDesc("Show the unrestricted file access reminder before running with yolo access.")
			.addToggle((toggle) => toggle
				.setValue(!this.plugin.settings.suppressYoloWarning)
				.onChange(async (value) => {
					this.plugin.settings.suppressYoloWarning = !value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Working directory")
			.setDesc("Optional absolute path. When empty, uses the current vault path.")
			.addText((text) => text
				.setPlaceholder("/path/to/test/vault")
				.setValue(this.plugin.settings.workingDirectory)
				.onChange(async (value) => {
					this.plugin.settings.workingDirectory = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default model")
			.setDesc("Model used by new sidebar runs. The sidebar selector can change this quickly.")
			.addDropdown((dropdown) => dropdown
				.addOption("gpt-5.4-mini", "Mini model")
				.addOption("gpt-5.5", "Latest model")
				.addOption("gpt-5.4", "Balanced model")
				.addOption("gpt-5.3-codex-spark", "Spark model")
				.setValue(this.plugin.settings.codexModel)
				.onChange(async (value) => {
					this.plugin.settings.codexModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default effort")
			.setDesc("Reasoning effort used by new sidebar runs.")
			.addDropdown((dropdown) => dropdown
				.addOption("low", "Low")
				.addOption("medium", "Medium")
				.addOption("high", "High")
				.addOption("xhigh", "Extra high")
				.setValue(this.plugin.settings.codexEffort)
				.onChange(async (value) => {
					this.plugin.settings.codexEffort = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default prompt")
			.setDesc("Optional prompt text used to seed new sessions. Leave empty for a blank composer.")
			.addTextArea((text) => text
				.setPlaceholder("Optional instructions for new sessions")
				.setValue(this.plugin.settings.defaultPrompt)
				.onChange(async (value) => {
					this.plugin.settings.defaultPrompt = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Updates")
			.setHeading();

		const updateResultEl = containerEl.createDiv({ cls: "codeian-settings-test-result" });
		new Setting(containerEl)
			.setName("Update from GitHub release")
			.setDesc("Download the latest release files from the project repository and install them into this vault.")
			.addButton((button) => button
				.setButtonText("Update")
				.onClick(async () => {
					button.setDisabled(true);
					updateResultEl.removeClass("codeian-settings-test-error");
					updateResultEl.setText("Checking GitHub releases...");
					try {
						const result = await this.plugin.installLatestRelease();
						updateResultEl.setText(formatReleaseUpdateResult(result));
						new Notice("Codeian update installed. Reload this plugin to use the new files.");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						updateResultEl.addClass("codeian-settings-test-error");
						updateResultEl.setText(message);
						new Notice(`Codeian update failed: ${message}`);
					} finally {
						button.setDisabled(false);
					}
				}));

		const testResultEl = containerEl.createDiv({ cls: "codeian-settings-test-result" });
		new Setting(containerEl)
			.setName("Test command")
			.setDesc("Check whether Obsidian can launch the configured command.")
			.addButton((button) => button
				.setButtonText("Test")
				.onClick(async () => {
					button.setDisabled(true);
					testResultEl.setText("Testing command...");
					try {
						const result = await testCodexCli(this.plugin.settings, this.plugin.getVaultPath());
						testResultEl.toggleClass("codeian-settings-test-error", !result.ok);
						testResultEl.setText(result.message);
						new Notice(result.ok ? "Codex CLI test passed." : "Codex CLI test failed.");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						testResultEl.addClass("codeian-settings-test-error");
						testResultEl.setText(message);
						new Notice(`Codex CLI test failed: ${message}`);
					} finally {
						button.setDisabled(false);
					}
				}));
	}
}

function formatReleaseUpdateResult(result: Awaited<ReturnType<CodeianPlugin["installLatestRelease"]>>): string {
	const versionText = result.version && result.version !== result.currentVersion
		? `Installed ${result.version} over ${result.currentVersion}.`
		: `Installed latest release ${result.tagName}.`;
	return `${versionText} Files: ${result.installedFiles.join(", ")}. Reload this plugin to finish.`;
}
