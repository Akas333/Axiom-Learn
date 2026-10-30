import { defineConfig, globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

/**
 * ESLint with one job: ENFORCE THE ENGINE'S IMPORT LAW (docs/architecture.md).
 *
 *   src/core/**  →  never imports src/agent, src/server, src/store, src/http
 *                   (pure core: adapters implement core/ports.ts)
 *   src/agent/** →  never imports src/server, src/store, src/http
 *                   (dependencies arrive via factories/closures)
 *   src/http/**  →  imports ONLY the barrels "src/core" and "src/server"
 *                   (the transport-neutral route handlers)
 *
 * tests/ and scripts/ are internal — unrestricted. The app-side rules (what
 * the UI may import from the engine) live in each app's own config.
 */
export default defineConfig([
	globalIgnores(["node_modules/**", "data/**", "scripts/**", "src/host/**"]),
	{
		files: ["**/*.{js,mjs,ts,tsx}"],
		languageOptions: {
			parser: tsParser,
			parserOptions: { ecmaVersion: "latest", sourceType: "module" },
		},
		plugins: { import: importPlugin },
		settings: {
			"import/resolver": { typescript: { alwaysTryTypes: true } },
		},
		rules: {
			"import/no-restricted-paths": [
				"error",
				{
					zones: [
						{
							target: "./src/core",
							from: ["./src/agent", "./src/server", "./src/store", "./src/http"],
							message:
								"Pure core never imports IO layers (agent/server/store/http): adapters implement core/ports.ts, and the composition root (src/server/stores.ts) passes them in (architecture: docs/architecture.md).",
						},
						{
							target: "./src/agent",
							from: ["./src/server", "./src/store", "./src/http"],
							message:
								"The agent layer receives its dependencies (storage ports via factories/closures) — it never imports the server layer, store adapters, or the HTTP surface (architecture: docs/architecture.md).",
						},
						{
							target: "./src/http",
							from: "./src",
							except: ["./core/index.ts", "./server/index.ts", "./http"],
							message:
								"src/http (route handlers) imports ONLY the barrels: src/core/index.ts and src/server/index.ts.",
						},
					],
				},
			],
		},
	},
]);
