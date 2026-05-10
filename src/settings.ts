import { App, PluginSettingTab, Setting } from "obsidian";

import CodeianPlugin from "./main";

export interface CodeianSettings {
	codexCommand: string;
	codexExtraArgs: string;
	workingDirectory: string;
}

export const DEFAULT_SETTINGS: CodeianSettings = {
	codexCommand: "codex",
	codexExtraArgs: "exec --ask-for-approval never --sandbox read-only --skip-git-repo-check",
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
	}
}
