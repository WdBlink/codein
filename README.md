# Codeian

Codeian is an Obsidian desktop plugin demo that opens CodeX from a right sidebar.

The first version focuses on the smallest useful integration:

- Register an Obsidian sidebar view.
- Accept a prompt inside Obsidian.
- Run the local CodeX/Codex CLI through `codex exec`.
- Stream stdout and stderr back into the sidebar.

## Requirements

- Obsidian desktop.
- Node.js and npm for development.
- CodeX/Codex CLI available on `PATH` as `codex`, or configured in Codeian settings.

This plugin is desktop only because it launches a local CLI process.

## Development

```bash
npm install
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

## Settings

- `CLI command`: defaults to `codex`.
- `Codex arguments`: defaults to `exec --ask-for-approval never --sandbox read-only --skip-git-repo-check`.
- `Working directory`: optional absolute path. When empty, Codeian uses the current vault path when available.

## Reference

Project requirements and reference links are kept in [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
