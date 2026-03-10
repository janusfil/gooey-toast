import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const outDir = resolve(rootDir, "demo-dist");
const assetsDir = resolve(outDir, "assets");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });

await build({
	entryPoints: [resolve(rootDir, "playground/main.ts")],
	bundle: true,
	outfile: resolve(assetsDir, "main.js"),
	format: "esm",
	platform: "browser",
	target: "es2020",
	sourcemap: true,
});

copyFileSync(resolve(rootDir, "playground/styles.css"), resolve(outDir, "styles.css"));
copyFileSync(resolve(rootDir, "src/styles.css"), resolve(outDir, "gooey-toast.css"));

const indexHtml = readFileSync(resolve(rootDir, "playground/index.html"), "utf8")
	.replace("../src/styles.css", "./gooey-toast.css")
	.replace("./.build/main.js", "./assets/main.js");

writeFileSync(resolve(outDir, "index.html"), indexHtml);

console.log(`Demo site built in ${outDir}`);
