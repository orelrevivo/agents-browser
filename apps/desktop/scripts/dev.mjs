import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readlinkSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "../..");
const backendPort = Number(process.env.GROUBOT_BACKEND_PORT ?? 43127);
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
function envFileHasValue(name) {
  try {
    const line = readFileSync(resolve(workspaceRoot, ".env"), "utf8").split(/\r?\n/).find((item) => new RegExp(`^\\s*${name}\\s*=`).test(item));
    if (!line) return false;
    const value = line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
    return value.length > 0;
  } catch { return false; }
}

function findBackendPids() {
  return readdirSync("/proc", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .flatMap((entry) => {
      try {
        const command = readFileSync(`/proc/${entry.name}/cmdline`, "utf8").replaceAll("\0", " ");
        return command.includes("/packages/backend/") && command.includes("src/server.ts") ? [Number(entry.name)] : [];
      } catch { return []; }
    });
}

function backendProcessGroupId(pid) {
  try { return Number(readFileSync(`/proc/${pid}/stat`, "utf8").trim().split(" ")[4]); } catch { return 0; }
}

function stopStaleBackend() {
  for (const group of new Set(findBackendPids().map(backendProcessGroupId).filter((value) => value > 0))) {
    try { process.kill(-group, "SIGTERM"); } catch {}
  }
}
if (!acquireLauncherLock()) {
  console.log("Groubot is already running; no additional window was created.");
  process.exit(0);
}
const backendEnvironment = {
  ...(() => { try { return parseDotenv(readFileSync(resolve(workspaceRoot, ".env"), "utf8")); } catch { return {}; } })(),
  ...process.env,
  GROUBOT_BACKEND_PORT: String(backendPort),
  GROUBOT_DATABASE_PATH: process.env.GROUBOT_DATABASE_PATH ?? resolve(root, ".groubot", "groubot.db"),
  GROUBOT_MIGRATIONS_FOLDER: process.env.GROUBOT_MIGRATIONS_FOLDER ?? resolve(workspaceRoot, "packages/db/drizzle"),
};
let backend = null;
let backendOwned = false;
let backendReady = false;
async function backendAlreadyRunning() {
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    const body = await response.json();
    if (body?.ok !== true || body.apiVersion !== 4 || body.groupFanout !== true) {
      console.log("Existing Groubot backend is outdated; restarting it for group execution.");
      stopStaleBackend();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      return false;
    }
    const configResponse = await fetch(`http://127.0.0.1:${backendPort}/api/ai/config`, { signal: AbortSignal.timeout(500) });
    const config = await configResponse.json();
    const expectedKey = Boolean(process.env.OPENAI_API_KEY) || envFileHasValue("OPENAI_API_KEY");
    const expectedModel = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    if (Boolean(config.apiKeyConfigured) !== expectedKey || config.model !== expectedModel) {
      console.log("Existing Groubot backend configuration is stale; restarting it.");
      stopStaleBackend();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      return false;
    }

    const skillsResponse = await fetch(`http://127.0.0.1:${backendPort}/api/skills`, {
      signal: AbortSignal.timeout(500),
    });

    if (skillsResponse.status === 404) {
      console.log("Existing Groubot backend is outdated; restarting it for the current API.");
      stopStaleBackend();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      return false;
    }

    if (!skillsResponse.ok) {
      console.log("Existing Groubot backend failed the API compatibility check; restarting it.");
      stopStaleBackend();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      return false;
    }

    const groupsResponse = await fetch(`http://127.0.0.1:${backendPort}/api/groups`, {
      signal: AbortSignal.timeout(500),
    });

    if (groupsResponse.status === 404) {
      console.log("Existing Groubot backend is missing agent groups; restarting it for the current API.");
      stopStaleBackend();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      return false;
    }

    if (!groupsResponse.ok) {
      console.log("Existing Groubot backend failed the groups API compatibility check; restarting it.");
      stopStaleBackend();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      return false;
    }

    return true;
  } catch { return false; }
}

const backendStartup = (async () => {
  if (await backendAlreadyRunning()) {
    backendReady = true;
    console.log(`Groubot backend already running on 127.0.0.1:${backendPort}; reusing it.`);
    return;
  }
  backend = spawn("pnpm", ["--filter", "@groubot/backend", "exec", "tsx", "src/server.ts"], { cwd: workspaceRoot, env: backendEnvironment, stdio: ["ignore", "pipe", "inherit"], detached: process.platform !== "win32" });
  backendOwned = true;
  await new Promise((resolveBackend, rejectBackend) => {
    let output = "";
    const timer = setTimeout(() => rejectBackend(new Error(`Backend did not start on port ${backendPort}.`)), 15_000);
    backend.stdout.on("data", (chunk) => {
      output += String(chunk);
      for (const line of output.split("\n").slice(0, -1)) {
        try {
          const message = JSON.parse(line);
          if (message.type === "backend-ready" && Number(message.port) === backendPort) {
            backendReady = true;
            clearTimeout(timer);
            resolveBackend();
          }
        } catch {}
      }
      output = output.split("\n").at(-1) ?? "";
    });
    backend.once("exit", (code) => {
      if (!backendReady) {
        clearTimeout(timer);
        rejectBackend(new Error(`Backend exited before startup (code ${code ?? "unknown"}).`));
      }
    });
  });
})();
try {
  await backendStartup;
} catch (error) {
  if (backendOwned && backend) {
    try { if (backend.pid && process.platform !== "win32") process.kill(-backend.pid, "SIGTERM"); else backend.kill("SIGTERM"); } catch {}
  }
  try { unlinkSync(lockPath); } catch {}
  throw error;
}
execFileSync(process.execPath, [resolve(root, "scripts/generate-agent-assets.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const vite = await createServer({ configFile: resolve(root, "vite.renderer.config.ts"), server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer.address();
const port = typeof address === "object" && address ? address.port : 5173;
const cefRoot = process.env.GROUBOT_CEF_ROOT ?? resolve(workspaceRoot, ".groubot", "cef-sdk", "cef_binary_156.0.14+g4fa4ab5+chromium-156.0.8078.48_linux64_minimal");
if (!cefRoot) {
  console.error("GROUBOT_CEF_ROOT is required. Point it to the tested CEF 156 distribution.");
  await vite.close();
  process.exit(1);
}
const buildDir = process.env.GROUBOT_CEF_BUILD ?? resolve(workspaceRoot, ".groubot", "cef-host-build");
const executable = resolve(buildDir, "Release/groubot-cef-host");
function nativeSourcesAreNewer() {
  try {
    const built = statSync(executable).mtimeMs;
    const sourceDir = resolve(workspaceRoot, "packages/browser/native/src");
    return readdirSync(sourceDir).some((name) => statSync(resolve(sourceDir, name)).mtimeMs > built);
  } catch { return false; }
}
if (!existsSync(executable) || nativeSourcesAreNewer()) {
  console.log("CEF host is not built; building it in the persistent project directory…");
  try {
    execFileSync(process.execPath, [resolve(root, "scripts/native-cef.mjs"), "build"], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    await vite.close().catch(() => undefined);
    try { unlinkSync(lockPath); } catch {}
    throw new Error(
      `CEF host could not be built. Install/extract the CEF 156 SDK and set ` +
        `GROUBOT_CEF_ROOT to its cef_binary_156 distribution, then run ` +
        `pnpm --filter @groubot/desktop native:build. Details: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
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

function processGroupId(pid) {
  try {
    const fields = readFileSync(`/proc/${pid}/stat`, "utf8").trim().split(" ");
    return Number(fields[4]);
  } catch {
    return 0;
  }
}

function terminateHostProcessGroups(signal) {
  const groups = new Set(findHostPids().map(processGroupId).filter((group) => group > 0));
  for (const group of groups) {
    try { process.kill(-group, signal); } catch {}
  }
}

terminateHostProcessGroups("SIGTERM");
await new Promise((resolveWait) => setTimeout(resolveWait, 400));
terminateHostProcessGroups("SIGKILL");

function cleanStaleProfileArtifacts(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        cleanStaleProfileArtifacts(full);
      } else if (
        entry.name === "LOCK" ||
        entry.name.endsWith(".lock") ||
        entry.name.startsWith("Singleton") ||
        (entry.name.endsWith("-journal") && statSync(full).size === 0)
      ) {
        try { unlinkSync(full); } catch {}
      }
    }
  } catch {}
}
cleanStaleProfileArtifacts(resolve(root, ".groubot/cef-profile"));
const child = spawn(executable, [
  `--url=http://127.0.0.1:${port}/`,
  // CEF requires root_cache_path to be separate from each request context's
  // cache_path. Sharing the profile directory makes Chromium show its
  // "Profile error occurred" dialog during startup.
  `--root-cache=${resolve(root, ".groubot/cef-root-cache")}`,
  `--profile=${resolve(root, ".groubot/cef-profile")}`,
  `--resources=${resolve(cefRoot, "Resources")}`,
  `--locales=${resolve(cefRoot, "Resources/locales")}`,
], { cwd: resolve(cefRoot, "Release"), stdio: "inherit", env: process.env, detached: process.platform !== "win32" });
child.once("error", (error) => {
  console.error(`Unable to start the CEF host: ${error.message}`);
  void shutdown(1);
});
const shutdown = async (code = 0) => {
  try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); } catch {}
  if (backendOwned && backend) {
    try { if (backend.pid && process.platform !== "win32") process.kill(-backend.pid, "SIGTERM"); else backend.kill("SIGTERM"); } catch {}
  }
  await vite.close();
  try { unlinkSync(lockPath); } catch {}
  process.exit(code);
};
process.once("exit", () => { try { unlinkSync(lockPath); } catch {} });
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
child.once("exit", (code, signal) => void shutdown(code ?? (signal ? 1 : 0)));
console.log(`Groubot CEF renderer: http://127.0.0.1:${port}/`);
