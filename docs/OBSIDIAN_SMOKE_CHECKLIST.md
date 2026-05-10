# Obsidian Smoke Checklist

Use a dedicated test vault. Do not run development builds in a primary vault.

## Install

- [ ] Run `npm run build`.
- [ ] Run `npm run verify:release`.
- [ ] Run `npm run smoke:test-vault`.
- [ ] Copy `main.js`, `manifest.json`, and `styles.css` into `<test-vault>/.obsidian/plugins/codeian/`.
- [ ] Enable Codeian from Obsidian community plugins.

## Sidebar

- [ ] Open Codeian from the ribbon icon.
- [ ] Open Codeian from the command palette action `Open sidebar`.
- [ ] Confirm the sidebar appears in the right sidebar.
- [ ] Confirm the output panel can be focused with the keyboard.
- [ ] Confirm `Clear output` clears the output and does not delete the prompt.

## Settings

- [ ] Open Codeian settings.
- [ ] Confirm `CLI command`, `Codex arguments`, and `Working directory` are visible.
- [ ] Confirm settings persist after closing and reopening Obsidian settings.
- [ ] Restore the default arguments before testing a real run: `--ask-for-approval never exec --sandbox read-only --skip-git-repo-check`.

## Safety

- [ ] Run with an empty prompt and confirm Codeian shows a prompt-required state.
- [ ] Use `Add current note context` and confirm the note is inserted into the prompt but not sent immediately.
- [ ] Press `Run` on note-context prompt and confirm Codeian asks before sending note content.
- [ ] Temporarily change the command away from `codex` or remove `--sandbox read-only`; confirm Codeian warns before running.

## CLI Run

- [ ] With a safe test prompt, press `Run`.
- [ ] Confirm the status changes to `Running Codex...`.
- [ ] Confirm stdout or stderr appears in the output panel.
- [ ] Confirm `Cancel` is enabled while running.
- [ ] Confirm a completed run reports `Finished` or a nonzero exit code.

## Recovery

- [ ] Temporarily set `CLI command` to a missing executable.
- [ ] Press `Run` with a harmless prompt.
- [ ] Confirm the sidebar explains that the CLI could not be launched and tells the user to check Codeian settings.
- [ ] Restore `CLI command` to `codex`.
