// Bundles src/ into dist/ and copies static/ alongside, with the version
// from package.json written into the manifest.
import { cp, readFile, rm, writeFile } from "node:fs/promises";

import * as esbuild from "esbuild";

const ENTRY_POINTS = {
  background: "src/background.ts",
  chip: "src/chip/chip.ts",
  options: "src/options/options.ts",
  popup: "src/popup/popup.ts",
};

const pkg = JSON.parse(await readFile("package.json", "utf8"));

await rm("dist", { recursive: true, force: true });
await esbuild.build({
  entryPoints: ENTRY_POINTS,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "firefox142",
  logLevel: "warning",
});
await cp("static", "dist", { recursive: true });
const manifest = JSON.parse(await readFile("static/manifest.json", "utf8"));
manifest.version = pkg.version;
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
