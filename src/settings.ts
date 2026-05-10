import { App, Notice, PluginSettingTab, Setting } from "obsidian";

import CodeianPlugin from "./main";
import { testCodexCli } from "./codexRunner";
import { DEFAULT_CODEX_ARGS } from "./defaults";

export interface CodeianSettings {
	codexCommand: string;
	codexExtraArgs: string;
	workingDirectory: string;
	lastPrompt: string;
	lastOutput: string;
	lastStatus: string;
}

export const DEFAULT_SETTINGS: CodeianSettings = {
	codexCommand: "codex",
	codexExtraArgs: DEFAULT_CODEX_ARGS,
	lastOutput: "",
	lastPrompt: "",
	lastStatus: "Ready",
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
			.setDesc("Arguments passed before the prompt. The prompt is sent through stdin.")
			.addTextArea((text) => text
				.setPlaceholder(DEFAULT_SETTINGS.codexExtraArgs)
				.setValue(this.plugin.settings.codexExtraArgs)
				.onChange(async (value) => {
					this.plugin.settings.codexExtraArgs = value.trim();
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
