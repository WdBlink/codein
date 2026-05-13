import { Notice, Plugin, WorkspaceLeaf, normalizePath } from "obsidian";

import { LEGACY_CODEX_ARGS, LEGACY_CODEX_READ_ONLY_ARGS } from "./defaults";
import { installLatestCodeianRelease, type GitHubReleaseUpdateResult } from "./githubUpdater";
import { buildCurrentNoteContextPrompt } from "./promptContext";
import { CodeianSettingTab, DEFAULT_SETTINGS, CodeianSettings } from "./settings";
import { normalizeSidebarSessions } from "./sessionState";
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
						await view?.setPrompt(buildCurrentNoteContextPrompt(activeFile.path, content), true);
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

		await workspace.revealLeaf(leaf);
		return leaf.view instanceof CodeianView ? leaf.view : null;
	}

	getVaultPath(): string | null {
		const adapter = this.app.vault.adapter;
		if ("basePath" in adapter && typeof adapter.basePath === "string") {
			return adapter.basePath;
		}
		return null;
	}

	async installLatestRelease(): Promise<GitHubReleaseUpdateResult> {
		return installLatestCodeianRelease(
			this.app.vault.adapter,
			this.getPluginInstallDir(),
			this.manifest.version,
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CodeianSettings>);
		normalizeSidebarSessions(this.settings);
		if (this.settings.codexExtraArgs === LEGACY_CODEX_ARGS || this.settings.codexExtraArgs === LEGACY_CODEX_READ_ONLY_ARGS) {
			this.settings.codexExtraArgs = DEFAULT_SETTINGS.codexExtraArgs;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getSidebarLeaf(): WorkspaceLeaf {
		return this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
	}

	private getPluginInstallDir(): string {
		const manifestWithDir = this.manifest as typeof this.manifest & { dir?: string };
		if (manifestWithDir.dir) {
			return normalizePath(manifestWithDir.dir);
		}

		const vaultWithConfigDir = this.app.vault as typeof this.app.vault & { configDir?: string };
		if (!vaultWithConfigDir.configDir) {
			throw new Error("Could not resolve the current vault configuration folder.");
		}
		return normalizePath(`${vaultWithConfigDir.configDir}/plugins/${this.manifest.id}`);
	}
}
