import { mkdtemp, mkdir, copyFile, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const vault = await mkdtemp(join(tmpdir(), "codeian-vault-"));
const pluginDir = join(vault, ".obsidian", "plugins", "codeian");
await mkdir(pluginDir, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
	await copyFile(file, join(pluginDir, file));
	const info = await stat(join(pluginDir, file));
	if (!info.isFile() || info.size === 0) {
		throw new Error(`${file} was not copied into the test vault plugin directory`);
	}
}

const manifest = JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8"));
if (manifest.id !== "codeian" || manifest.name !== "Codeian") {
	throw new Error("Copied manifest does not identify the Codeian plugin");
}

console.log(`Smoke test vault plugin files OK: ${pluginDir}`);
