# Contributing to Codeian

Thanks for helping improve Codeian. This plugin runs a local Codex CLI from Obsidian, so changes should be tested with both automated checks and a real desktop vault before release.

## Development Setup

```bash
npm install
npm run build
```

For local watch builds:

```bash
npm run dev
```

Copy `main.js`, `manifest.json`, and `styles.css` into an isolated test vault under:

```text
<vault>/.obsidian/plugins/codeian/
```

Do not test unreleased builds in a primary vault.

## Verification

Run the full local check set before opening a pull request or publishing a release:

```bash
npm test
npm run lint
npm run build
npm run verify:release
npm run smoke:test-vault
```

For UI changes, also use `docs/OBSIDIAN_SMOKE_CHECKLIST.md` in a real Obsidian desktop vault.

## Safety Expectations

- Keep local file access explicit and visible in the UI.
- Do not add telemetry.
- Do not send note content automatically when the sidebar opens.
- Prefer Obsidian APIs over direct filesystem access for vault content.
- Keep child-process environment handling minimal and documented.

## Releases

Each GitHub release must include the Obsidian plugin assets:

- `main.js`
- `manifest.json`
- `styles.css`

The release tag must match the `version` in `manifest.json`.
