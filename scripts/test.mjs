import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
fs.mkdirSync("work", { recursive: true });
await build({
  entryPoints: ["tests/entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "work/test-services.mjs",
});
const result = spawnSync(
  process.execPath,
  ["--test", "tests/domain.test.mjs"],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
