# Codeian reference audit

This note captures the implementation baseline for the first Codeian demo.

## Official Obsidian baseline

- Build and test from the TypeScript sample-plugin path.
- Keep development in a separate test vault, not a primary notes vault.
- Obsidian loads a community plugin from `<vault>/.obsidian/plugins/<plugin-id>/`.
- A release/installable plugin needs `main.js`, `manifest.json`, and optionally `styles.css`.
- Users enable the plugin from Settings -> Community plugins after the files are present.
- `onload()` should register views, commands, settings, and lifecycle hooks only; do not launch Codex or scan the vault during startup.

## Claudian reference features

Claudian is the functional reference, but its current version is much larger than the first Codeian demo target. The relevant first-demo features are:

- A ribbon icon and command palette command open a sidebar chat view.
- The sidebar has a persistent chat surface, header actions, new conversation controls, and running-state feedback.
- The active vault is the working directory for the agent runtime.
- The settings page lets users configure CLI path and runtime environment when GUI Obsidian cannot inherit shell PATH.
- The plugin supports current-note context, inline workflows, slash commands or skills, `@mention`, instruction mode, plan mode, and history.
- Privacy copy is explicit: user input, attached/context files, and tool outputs may be sent to the configured provider; local transcripts are stored by the provider runtime.

## Codeian first-demo parity target

Codeian should not attempt full Claudian parity in one step. The required first-demo parity is:

- Open Codeian from ribbon and command palette into a right sidebar.
- Provide a usable Codex prompt surface with run, cancel, clear, settings, and new session controls.
- Show command hints for `/`, `$`, `@`, and `#` so the UI matches the reference interaction model even before full command expansion exists.
- Insert current-note context with clear user consent and a predictable prompt shape.
- Run the local Codex CLI in the vault working directory and stream output into the sidebar.
- Resolve `codex` robustly when launched from GUI Obsidian by enhancing PATH with common local binary directories.
- Persist enough local state to restore recent session text and output after reopening the view.
- Provide actionable errors and a settings-level CLI self-test.

## Out of first-demo scope

- Provider-neutral architecture for Claude, Codex, Opencode, and ACP.
- Codex JSON-RPC app-server protocol, native Codex history hydration, and conversation fork/compact parity.
- MCP server management in the Obsidian UI.
- Image attachment support and full `@mention` resolver.
- Inline edit diff preview.
- Community plugin marketplace submission.
