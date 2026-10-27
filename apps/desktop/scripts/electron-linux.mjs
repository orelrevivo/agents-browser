#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const electronModulePath = dirname(require.resolve("electron"));
const executablePath = readFileSync(join(electronModulePath, "path.txt"), "utf8").trim();
const electronPath = join(electronModulePath, "dist", executablePath);

const chromiumArgs = ["--ozone-platform=x11"];
if (process.env.GROUBOT_DISABLE_GPU === "1") chromiumArgs.push("--disable-gpu", "--disable-gpu-compositing");

const child = spawn(
  electronPath,
  [...chromiumArgs, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
