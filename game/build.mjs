import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
const opts = {
  entryPoints: { game: "src/main.js", kidsheet: "src/kidsheet.js" }, bundle: true, format: "iife", outdir: "dist",
  target: "es2022", minify: !watch, sourcemap: watch ? "inline" : false, logLevel: "info", loader: { ".glb": "binary", ".png": "dataurl" },
};
if (watch) await (await esbuild.context(opts)).watch();
else await esbuild.build(opts);
