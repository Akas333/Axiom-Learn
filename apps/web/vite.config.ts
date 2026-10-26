import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: [
			// The engine's browser-safe core, shared with the server.
			{ find: /^@\/src\//, replacement: here("../../packages/engine/src/") },
			{ find: /^@\/src$/, replacement: here("../../packages/engine/src") },
			// One core module imports node:crypto for a server-only helper.
			{ find: /^node:crypto$/, replacement: here("./lib/crypto-browser.ts") },
			{ find: /^@\//, replacement: here("./") },
		],
	},
	define: {
		"process.env.LH_VERSION": JSON.stringify(pkg.version),
		"process.env.LH_HOMEPAGE": JSON.stringify(""),
	},
	server: {
		// PORT lets a second dev server run beside another (the app assigns it).
		port: Number(process.env.PORT ?? 5173),
		strictPort: true,
		// The API runs in apps/server (npm run dev:server).
		proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: false, ws: true } },
	},
});
