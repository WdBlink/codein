import { describe, expect, it } from "vitest";

import {
	getVaultLinkLookupPath,
	getVaultLinkTarget,
	normalizeVaultLinkTarget,
	type AnchorLike,
} from "../src/vaultLinkHandler";

describe("vault link handler", () => {
	it("extracts markdown link targets for vault notes", () => {
		expect(getVaultLinkTarget(createAnchor({ href: "PROJECT_BRIEF.md", text: "PROJECT_BRIEF" }))).toEqual({
			displayText: "PROJECT_BRIEF",
			linktext: "PROJECT_BRIEF.md",
		});
	});

	it("prefers Obsidian internal data-href over rendered href", () => {
		expect(getVaultLinkTarget(createAnchor({
			dataHref: "Notes/Daily",
			href: "app://obsidian.md/Notes/Daily",
			text: "Daily",
		}))).toEqual({
			displayText: "Daily",
			linktext: "Notes/Daily",
		});
	});

	it("normalizes relative, encoded, and absolute vault paths", () => {
		expect(normalizeVaultLinkTarget("./Folder%20Name/Note.md#Heading")).toBe("Folder Name/Note.md#Heading");
		expect(normalizeVaultLinkTarget("/Users/echooo/SynologyDrive/Typora/LLM-Wiki/Page.md", {
			vaultPath: "/Users/echooo/SynologyDrive/Typora",
		})).toBe("LLM-Wiki/Page.md");
		expect(normalizeVaultLinkTarget("@LLM-Wiki/generated/")).toBe("LLM-Wiki/generated/");
	});

	it("ignores external and same-page links", () => {
		expect(getVaultLinkTarget(createAnchor({ href: "https://example.com", text: "external" }))).toBeNull();
		expect(getVaultLinkTarget(createAnchor({ href: "mailto:team@example.com", text: "mail" }))).toBeNull();
		expect(getVaultLinkTarget(createAnchor({ href: "obsidian://open?vault=Typora&file=Note", text: "obsidian uri" }))).toBeNull();
		expect(getVaultLinkTarget(createAnchor({ href: "#heading", text: "heading" }))).toBeNull();
	});

	it("builds lookup paths without headings or block fragments", () => {
		expect(getVaultLinkLookupPath("Folder/Note.md#Heading")).toBe("Folder/Note.md");
		expect(getVaultLinkLookupPath("Folder/Note.md#^block-id")).toBe("Folder/Note.md");
		expect(getVaultLinkLookupPath("Folder/")).toBe("Folder");
	});
});

function createAnchor(input: { dataHref?: string; href?: string; text?: string }): AnchorLike {
	return {
		dataset: input.dataHref ? { href: input.dataHref } : {},
		getAttribute: (name) => {
			if (name === "data-href") {
				return input.dataHref ?? null;
			}
			if (name === "href") {
				return input.href ?? null;
			}
			return null;
		},
		textContent: input.text ?? "",
	};
}
