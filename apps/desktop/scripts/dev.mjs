import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
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
try {
  spawnSync("pkill", ["-TERM", "-x", "groubot-cef-host"], { stdio: "ignore" });
} catch {}
await new Promise((resolveWait) => setTimeout(resolveWait, 400));
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
  process.exit(code);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
child.once("exit", (code, signal) => void shutdown(code ?? (signal ? 1 : 0)));
console.log(`Groubot CEF renderer: http://127.0.0.1:${port}/`);
