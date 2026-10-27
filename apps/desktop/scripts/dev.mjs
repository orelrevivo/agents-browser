import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const command = process.platform === "win32" ? "electron-vite.cmd" : "electron-vite";
const env = { ...process.env };

const generatedAssets = spawnSync(process.execPath, ["scripts/generate-agent-assets.mjs"], { cwd: process.cwd(), stdio: "inherit" });
if (generatedAssets.status !== 0) process.exit(generatedAssets.status ?? 1);

if (process.platform === "linux" && !env.ELECTRON_OZONE_PLATFORM_HINT) {
  env.ELECTRON_OZONE_PLATFORM_HINT = "x11";
}

if (process.platform === "linux") {
  env.ELECTRON_EXEC_PATH = resolve("scripts/electron-linux.mjs");
}

const child = spawn(command, ["dev"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  detached: process.platform !== "win32",
});

function stopChild(signal) {
  if (child.killed) return;
  try {
    process.kill(process.platform === "win32" ? child.pid : -child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  else process.exit(code ?? 1);
});
