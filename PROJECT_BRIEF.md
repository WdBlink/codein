# Codeian Obsidian Plugin - Project Brief

## 1. Purpose

This document stores the prerequisite references, design constraints, and development rules for the first demo version of the Codeian Obsidian plugin.

The project should follow the official Obsidian plugin development path as the primary source of truth:

`obsidian-sample-plugin` -> `Build a plugin` -> plugin guidelines and self-critique checklist -> test in a separate vault -> GitHub release -> submit to `obsidian-releases`.

## 2. Official References

### Obsidian Developer Docs

Link: <https://docs.obsidian.md/>

The official developer documentation covers plugin development, themes, API usage, submission, and release workflows. It also points developers to community support channels, including the `#plugin-dev` Discord channel and the Developers & API section of the Obsidian forum.

### Build a Plugin

Link: <https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin>

Official tutorial for starting a plugin from scratch. The recommended baseline stack is:

- TypeScript
- Node.js
- Git

Important rule: do not develop or test a plugin directly inside a primary note vault. Use a separate test vault so plugin bugs cannot accidentally modify real notes.

### Official Sample Plugin

Link: <https://github.com/obsidianmd/obsidian-sample-plugin>

The official community plugin template. New plugins usually start from this repository. It includes the core files and workflow needed for an Obsidian plugin:

- `manifest.json`
- `main.ts`
- build configuration
- release workflow
- ESLint configuration

### Submit Your Plugin

Link: <https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin>

Official submission flow for publishing a plugin to the community plugin marketplace. Submission requires:

- GitHub repository
- `README.md`
- `LICENSE`
- `manifest.json`
- GitHub release
- pull request to `obsidianmd/obsidian-releases`

### Obsidian October Plugin Self-Critique Checklist

Link: <https://docs.obsidian.md/oo/plugin>

Useful pre-release and design-quality checklist. It covers naming, compatibility, mobile support, security, API usage, performance, UI copy, and other official review preferences.

Key rules to keep in mind:

- Do not set default hotkeys without a strong reason.
- Do not hard-code the `.obsidian` path.
- Do not use Node or Electron modules at the top level when mobile support is expected.
- Do not add telemetry casually.
- Prefer official Obsidian APIs such as `Vault`, `FileManager`, and `Plugin.loadData()`.

### Optimize Plugin Load Time

Link: <https://docs.obsidian.md/plugins/guides/load-time>

Obsidian plugins affect app startup speed. Keep `onload()` lightweight:

- Register only required commands, settings, views, events, and lifecycle hooks in `onload()`.
- Move heavier work until after `workspace.onLayoutReady()`.
- Avoid blocking startup with network calls, large file scans, or expensive initialization.

## 3. Template Project Reference

Reference template project:

<https://github.com/YishenTu/claudian>

Use this as an additional structural and product reference when designing the first Codeian demo, but keep official Obsidian docs and APIs as the final authority for plugin behavior.

## 4. Project Design Goals

### Core Goal

The core feature of this Obsidian plugin is to make the CodeX tool available inside Obsidian as a sidebar-based tool.

The plugin should allow users to access CodeX from within the Obsidian workspace, instead of switching to a separate terminal or external application.

### Development Standard

The plugin should follow the development model and programming-language conventions recommended by the official Obsidian documentation.

Baseline expectations:

- Use TypeScript.
- Follow the official Obsidian plugin structure.
- Use Obsidian's plugin lifecycle methods and official APIs.
- Keep plugin behavior compatible with Obsidian's review expectations where possible.

### Functional Reference

The GitHub template project listed above can be used as the main functional reference.

That template project demonstrates how to embed Claude Code into Obsidian as a sidebar tool. Codeian should use the same general product pattern:

- Register an Obsidian sidebar view.
- Render an embedded coding-agent interface inside that view.
- Keep the tool accessible from Obsidian commands or workspace UI.
- Treat Obsidian as the host workspace and the coding tool as the embedded assistant/tooling layer.

### First Demo Target

The first demo version of Codeian should be conceptually close to the template project, but with one key substitution:

- Replace Claude Code with the user's CodeX tool.

The existing core ideas from the template project can be reused where appropriate, including sidebar integration, workspace registration, lifecycle handling, command registration, and basic UI layout.

The first demo should prioritize proving that CodeX can be opened and used from an Obsidian sidebar before expanding into deeper vault-aware features.

## 5. Repository and Version Management

Development should be managed through a dedicated GitHub repository for this plugin.

Expected workflow:

- Create a new GitHub repository for Codeian.
- Keep all plugin source code, documentation, release notes, and project decisions in that repository.
- Use Git commits to track every meaningful development step.
- Use branches for larger experiments or risky changes.
- Use tags and GitHub releases for demo builds and publishable plugin versions.
- Keep the local repository synchronized with the GitHub remote during development.

Security rules for GitHub access:

- Do not commit GitHub tokens, API keys, credentials, or personal secrets.
- Do not store tokens in project Markdown files, source files, config files, or committed shell scripts.
- Use local environment variables, macOS Keychain, GitHub CLI authentication, or another secure credential store for GitHub access.
- If a token is accidentally exposed, revoke it in GitHub and generate a new one before continuing.

## 6. First Demo Development Rules

### Development Environment

- Start from the official `obsidianmd/obsidian-sample-plugin` structure unless there is a clear reason not to.
- Use TypeScript for plugin code.
- Keep plugin logic isolated from any real production vault during development.
- Create a dedicated Obsidian test vault for manual testing.

### File and Data Safety

- Never assume the user's vault layout.
- Do not hard-code `.obsidian` paths.
- Use Obsidian's official APIs for file operations.
- Treat note writes, moves, deletes, and renames as high-risk operations.
- Make destructive or bulk operations explicit and reversible where possible.

### Startup and Runtime Behavior

- Keep `onload()` minimal.
- Defer expensive initialization until `workspace.onLayoutReady()`.
- Avoid scanning large vaults during startup.
- Avoid network calls during startup unless they are strictly necessary and clearly optional.

### Mobile Compatibility

- Avoid top-level Node or Electron imports if the plugin should support mobile.
- Gate platform-specific behavior behind runtime checks.
- Prefer APIs that work across desktop and mobile.

### UX and Settings

- Do not define default hotkeys unless necessary.
- Keep command names clear and action-oriented.
- Put configurable behavior in a settings tab.
- Store plugin settings with `Plugin.loadData()` and `Plugin.saveData()`.
- Keep user-facing copy concise and specific.

### Security and Privacy

- Do not add telemetry unless the feature is explicit, optional, documented, and disabled by default.
- Do not send vault content to external services without clear user consent.
- Keep authentication secrets out of source code and local committed files.

## 7. Release Checklist

Before publishing or preparing a community plugin submission:

- Confirm `manifest.json` is complete and accurate.
- Confirm `README.md` explains the plugin's purpose, usage, settings, and limitations.
- Confirm `LICENSE` exists.
- Build the plugin from a clean checkout.
- Test in a separate vault.
- Test plugin startup performance.
- Check mobile compatibility assumptions.
- Create a GitHub release containing the required release files.
- Submit a pull request to `obsidianmd/obsidian-releases` if publishing to the community plugin marketplace.
