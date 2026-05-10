import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{
		ignores: [
			".obsidian/**",
			"main.js",
			"node_modules",
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		plugins: {
			obsidianmd,
		},
		rules: {
			...obsidianmd.configs.recommended,
			"@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
		},
	},
	{
		files: ["scripts/**/*.mjs"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
);
