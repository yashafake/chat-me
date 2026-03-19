import { build, context } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const outdir = path.resolve(__dirname, "../dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const buildOptions = {
  entryPoints: {
    "chat-me-widget": path.resolve(__dirname, "../src/embed.ts"),
    "chat-me-widget.runtime": path.resolve(__dirname, "../src/runtime.ts")
  },
  outdir,
  entryNames: "[name]",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  sourcemap: watch,
  minify: !watch,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production")
  }
};

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("Watching widget bundle...");
} else {
  await build(buildOptions);
}
