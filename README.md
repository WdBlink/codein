# Codeian

Codeian is an Obsidian desktop plugin demo that opens CodeX from a right sidebar.

The first version focuses on the smallest useful integration:

- Register an Obsidian sidebar view.
- Accept a prompt inside Obsidian.
- Run the local CodeX/Codex CLI through `codex exec`.
- Stream stdout and stderr back into the sidebar.

## Requirements

- Obsidian desktop.
- Node.js 20.19.0 or newer and npm for development.
- CodeX/Codex CLI available on `PATH` as `codex`, or configured in Codeian settings.

This plugin is desktop only because it launches a local CLI process.

## Development

```bash
npm install
npm test
npm run lint
npm run build
```

For watch mode:

```bash
npm run dev
```

## Usage

1. Build the plugin.
2. Copy `main.js`, `manifest.json`, and `styles.css` into a dedicated test vault plugin folder.
3. Enable Codeian from Obsidian community plugins.
4. Open the sidebar from the ribbon icon or command palette.

Do not test development builds in a primary production vault.

Example test-vault plugin path:

```text
/path/to/test-vault/.obsidian/plugins/codeian/
```

## Settings

- `CLI command`: defaults to `codex`.
- `Codex arguments`: defaults to `exec --ask-for-approval never --sandbox read-only --skip-git-repo-check`.
- `Working directory`: optional absolute path. When empty, Codeian uses the current vault path when available.

The default arguments run Codex non-interactively with no approval prompts and a read-only sandbox. Change them only when you intentionally want a different execution mode.

## Safety and privacy

- Codeian does not run automatically on startup.
- Codeian does not send note content when you open the sidebar.
- The current-note command only inserts note content into the prompt box. You must press `Run` before anything is sent to the CLI.
- No telemetry is collected by this plugin.
- Settings are stored with Obsidian plugin data APIs.
- The first demo is intentionally desktop-only because mobile Obsidian cannot launch a local CLI process.

## Release files

An installable release must include:

- `main.js`
- `manifest.json`
- `styles.css`

The GitHub Actions workflow runs `npm test`, `npm run lint`, and `npm run build` on pushed commits and pull requests.

## Known limits

- The first demo uses `codex exec`, so each run is non-interactive.
- Conversation history, multi-tab chat, inline editing, MCP management, and app-server integration are not part of this version.
- GUI acceptance still needs to be performed inside an isolated Obsidian test vault.

## Reference

Project requirements and reference links are kept in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
