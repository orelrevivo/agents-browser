import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const lockPath = "/tmp/groubot-cef-dev.lock";
function acquireLauncherLock() {
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${process.pid}\n`);
    closeSync(fd);
    return true;
  } catch {
    if (existsSync(lockPath)) {
      const previousPid = Number(readFileSync(lockPath, "utf8").trim());
      try {
        process.kill(previousPid, 0);
        return false;
      } catch {
        try { unlinkSync(lockPath); } catch {}
        return acquireLauncherLock();
      }
    }
    return false;
  }
}
if (!acquireLauncherLock()) {
  console.log("Groubot is already running; no additional window was created.");
  process.exit(0);
}
const vite = await createServer({ configFile: resolve(root, "vite.renderer.config.ts"), server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer.address();
const port = typeof address === "object" && address ? address.port : 5173;
const cefRoot = process.env.GROUBOT_CEF_ROOT ?? "/tmp/cef-test-156.0.14/cef_binary_156.0.14+g4fa4ab5+chromium-156.0.8078.48_linux64_minimal";
if (!cefRoot) {
  console.error("GROUBOT_CEF_ROOT is required. Point it to the tested CEF 156 distribution.");
  await vite.close();
  process.exit(1);
}
const buildDir = process.env.GROUBOT_CEF_BUILD ?? "/tmp/groubot-cef-host-build";
const executable = resolve(buildDir, "Release/groubot-cef-host");
function findHostPids() {
  return readdirSync("/proc", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .flatMap((entry) => {
      try {
        return readlinkSync(`/proc/${entry.name}/exe`) === executable ? [Number(entry.name)] : [];
      } catch {
        return [];
      }
    });
}

for (const pid of findHostPids()) {
  if (pid !== process.pid) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
}
await new Promise((resolveWait) => setTimeout(resolveWait, 400));
for (const pid of findHostPids()) {
  if (pid !== process.pid) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
}
const child = spawn(executable, [
  `--url=http://127.0.0.1:${port}/`,
  `--root-cache=${resolve(root, ".groubot/cef-profile")}`,
  `--profile=${resolve(root, ".groubot/cef-profile")}`,
  `--resources=${resolve(cefRoot, "Resources")}`,
  `--locales=${resolve(cefRoot, "Resources/locales")}`,
], { cwd: root, stdio: "inherit", env: process.env, detached: process.platform !== "win32" });
const shutdown = async (code = 0) => {
  try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); } catch {}
  await vite.close();
  try { unlinkSync(lockPath); } catch {}
  process.exit(code);
};
process.once("exit", () => { try { unlinkSync(lockPath); } catch {} });
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
child.once("exit", (code, signal) => void shutdown(code ?? (signal ? 1 : 0)));
console.log(`Groubot CEF renderer: http://127.0.0.1:${port}/`);
