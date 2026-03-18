import { build, context } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const outdir = path.resolve(__dirname, "../dist");

await mkdir(outdir, { recursive: true });

const buildOptions = {
  entryPoints: [path.resolve(__dirname, "../src/embed.ts")],
  outfile: path.resolve(outdir, "chat-me-widget.js"),
  bundle: true,
  format: "iife",
  globalName: "ChatMeWidgetBundle",
  platform: "browser",
  target: ["es2020"],
  sourcemap: true,
  minify: false,
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
