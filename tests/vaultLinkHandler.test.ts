import { describe, expect, it } from "vitest";

import {
	getVaultLinkLookupPath,
	getVaultLinkTarget,
	normalizeVaultLinkTarget,
	resolveVaultFileLink,
	toLooseLinkKey,
	type AnchorLike,
	type VaultFileResolverLike,
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

	it("normalizes Obsidian app links with absolute encoded vault paths and line suffixes", () => {
		const link = "app://obsidian.md/Users/echooo/SynologyDrive/Typora/LLM-Wiki/wiki/concepts/%E4%B8%8A%E4%B8%8B%E6%96%87%E5%B7%A5%E7%A8%8B.md:29";

		expect(normalizeVaultLinkTarget(link, {
			vaultPath: "/Users/echooo/SynologyDrive/Typora",
		})).toBe("LLM-Wiki/wiki/concepts/上下文工程.md:29");
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
		expect(getVaultLinkLookupPath("Folder/Note.md:29")).toBe("Folder/Note.md");
		expect(getVaultLinkLookupPath("Folder/Note.md:29:4")).toBe("Folder/Note.md");
		expect(getVaultLinkLookupPath("Folder/")).toBe("Folder");
	});

	it("resolves exact vault files and markdown-extension fallbacks", () => {
		const vault = createVault(["LLM-Wiki/raw/notes/手工川线下分享会.md"]);

		expect(resolveVaultFileLink(vault, "LLM-Wiki/raw/notes/手工川线下分享会")).toBe("LLM-Wiki/raw/notes/手工川线下分享会.md");
	});

	it("resolves rendered app links copied from assistant markdown output", () => {
		const vault = createVault(["LLM-Wiki/wiki/concepts/上下文工程.md"]);
		const target = getVaultLinkTarget(createAnchor({
			href: "app://obsidian.md/Users/echooo/SynologyDrive/Typora/LLM-Wiki/wiki/concepts/%E4%B8%8A%E4%B8%8B%E6%96%87%E5%B7%A5%E7%A8%8B.md:29",
			text: "上下文工程.md",
		}), {
			vaultPath: "/Users/echooo/SynologyDrive/Typora",
		});

		expect(target).toEqual({
			displayText: "上下文工程.md",
			linktext: "LLM-Wiki/wiki/concepts/上下文工程.md:29",
		});
		expect(target && resolveVaultFileLink(vault, target.linktext)).toBe("LLM-Wiki/wiki/concepts/上下文工程.md");
	});

	it("resolves loose assistant links that omit spaces and parenthetical qualifiers", () => {
		const vault = createVault([
			"LLM-Wiki/raw/notes/和 GPT 关于向量世界（AI 世界）什么最重要的讨论.md",
		]);

		expect(resolveVaultFileLink(vault, "和GPT关于向量世界什么最重要的讨论.md")).toBe("LLM-Wiki/raw/notes/和 GPT 关于向量世界（AI 世界）什么最重要的讨论.md");
	});

	it("normalizes loose link keys for Chinese names", () => {
		expect(toLooseLinkKey("和 GPT 关于向量世界（AI 世界）什么最重要的讨论.md")).toBe("和gpt关于向量世界什么最重要的讨论");
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

function createVault(paths: string[]): VaultFileResolverLike {
	return {
		getAbstractFileByPath: (path) => paths.includes(path) ? { path } : null,
		getFiles: () => paths.map((path) => ({ path })),
	};
}
