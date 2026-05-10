import { readFile, stat } from "node:fs/promises";

const requiredFiles = ["main.js", "manifest.json", "styles.css"];
const missing = [];

for (const file of requiredFiles) {
	try {
		const info = await stat(file);
		if (!info.isFile() || info.size === 0) {
			missing.push(`${file} is empty or not a file`);
		}
	} catch {
		missing.push(`${file} is missing`);
	}
}

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (manifest.id !== "codeian") {
	missing.push("manifest.json id must be codeian");
}
if (manifest.isDesktopOnly !== true) {
	missing.push("manifest.json must be desktop-only");
}

if (missing.length > 0) {
	console.error("Release file verification failed:");
	for (const item of missing) {
		console.error(`- ${item}`);
	}
	process.exit(1);
}

console.log(`Release files verified: ${requiredFiles.join(", ")}`);
