import { Notice, Plugin, WorkspaceLeaf } from "obsidian";

import { CodeianSettingTab, DEFAULT_SETTINGS, CodeianSettings } from "./settings";
import { CodeianView, VIEW_TYPE_CODEIAN } from "./view";

export default class CodeianPlugin extends Plugin {
	settings: CodeianSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_CODEIAN,
			(leaf) => new CodeianView(leaf, this),
		);

		this.addRibbonIcon("bot", "Open chat", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-sidebar",
			name: "Open sidebar",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "add-current-note-context",
			name: "Add current note context",
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return false;

				if (!checking) {
					void (async () => {
						const content = await this.app.vault.cachedRead(activeFile);
						const view = await this.activateView();
						view?.setPrompt([
							"Use the following Obsidian note as context.",
							"",
							`Path: ${activeFile.path}`,
							"",
							"```markdown",
							content,
							"```",
							"",
							"Task:",
						].join("\n"));
						new Notice("Current note context added.");
					})();
				}

				return true;
			},
		});

		this.addSettingTab(new CodeianSettingTab(this.app, this));
	}

	async activateView(): Promise<CodeianView | null> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_CODEIAN)[0];

		if (!leaf) {
			leaf = this.getSidebarLeaf();
			await leaf.setViewState({
				type: VIEW_TYPE_CODEIAN,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
		return leaf.view instanceof CodeianView ? leaf.view : null;
	}

	getVaultPath(): string | null {
		const adapter = this.app.vault.adapter;
		if ("basePath" in adapter && typeof adapter.basePath === "string") {
			return adapter.basePath;
		}
		return null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CodeianSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getSidebarLeaf(): WorkspaceLeaf {
		return this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
	}
}
