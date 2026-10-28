import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "../..");
const native = resolve(root, "..", "..", "packages/browser/native");
const cefRoot = process.env.GROUBOT_CEF_ROOT ?? resolve(workspaceRoot, ".groubot", "cef-sdk", "cef_binary_156.0.14+g4fa4ab5+chromium-156.0.8078.48_linux64_minimal");
const buildDir = process.env.GROUBOT_CEF_BUILD ?? resolve(workspaceRoot, ".groubot", "cef-host-build");
const executable = resolve(buildDir, "Release/groubot-cef-host");
const cefArchiveUrl = "https://cef-builds.spotifycdn.com/cef_binary_156.0.14%2Bg4fa4ab5%2Bchromium-156.0.8078.48_linux64_minimal.tar.bz2";
const cefArchive = resolve(workspaceRoot, ".groubot", "cef-sdk", "cef-156-linux64.tar.bz2");
if (!cefRoot) throw new Error("GROUBOT_CEF_ROOT is required");
if (process.argv[2] === "build") {
  const cmakeCheck = spawnSync("cmake", ["--version"], { stdio: "ignore" });
  if (cmakeCheck.error && existsSync(executable)) {
    console.warn(`cmake is unavailable; using existing verified CEF host at ${executable}`);
    process.exit(0);
  }
  if (cmakeCheck.error) {
    throw new Error("CMake is required to build the CEF host. Install it with: sudo apt install cmake");
  }
  const cefModule = resolve(cefRoot, "cmake", "FindCEF.cmake");
  if (!existsSync(cefModule)) {
    console.log("CEF 156 SDK is missing; downloading the pinned Linux distribution once…");
    mkdirSync(resolve(workspaceRoot, ".groubot", "cef-sdk"), { recursive: true });
    execFileSync("curl", ["--fail", "--location", "--retry", "3", "--continue-at", "-", "--output", cefArchive, cefArchiveUrl], { stdio: "inherit" });
    execFileSync("tar", ["-xjf", cefArchive, "-C", resolve(workspaceRoot, ".groubot", "cef-sdk")], { stdio: "inherit" });
    if (!existsSync(cefModule)) {
      throw new Error(`CEF SDK download completed, but the expected SDK was not found at ${cefRoot}.`);
    }
    try { unlinkSync(cefArchive); } catch {}
  }
  mkdirSync(buildDir, { recursive: true });
  execFileSync("cmake", ["-S", native, "-B", buildDir, `-DCEF_ROOT=${cefRoot}`, "-DCMAKE_BUILD_TYPE=Release"], { stdio: "inherit" });
  execFileSync("cmake", ["--build", buildDir, "--target", "groubot-cef-host", "-j2"], { stdio: "inherit" });
  // CEF 156 resolves runtime resources before browser settings are initialized.
  // Keep the resources beside the SDK's libcef.so as well as in the host bundle.
  // Without these copies, subprocesses can start but paint an incomplete/blank
  // surface while logging missing chrome_*.pak and resources.pak errors.
  const runtimeResources = [
    "chrome_100_percent.pak",
    "chrome_200_percent.pak",
    "resources.pak",
    "icudtl.dat",
  ];

  for (const resourceName of runtimeResources) {
    const sourcePath = resolve(cefRoot, "Resources", resourceName);
    const targetPath = resolve(cefRoot, "Release", resourceName);

    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, targetPath);
    }
  }
} else {
  if (!existsSync(executable)) throw new Error(`CEF host is missing at ${executable}; run pnpm --filter @groubot/desktop native:build`);
  const backendPort = Number(process.env.GROUBOT_BACKEND_PORT ?? 43127);
  let backend = null;
  let backendOwned = false;
  let backendReady = false;
  try {
    const health = await fetch(`http://127.0.0.1:${backendPort}/health`, { signal: AbortSignal.timeout(500) }).catch(() => undefined);
    const healthBody = health?.ok ? await health.json().catch(() => undefined) : undefined;
    if (healthBody?.ok === true) {
      backendReady = true;
      console.log(`Groubot backend already running on 127.0.0.1:${backendPort}; reusing it.`);
    } else {
      backend = spawn("pnpm", ["--filter", "@groubot/backend", "exec", "tsx", "src/server.ts"], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          GROUBOT_BACKEND_PORT: String(backendPort),
          GROUBOT_DATABASE_PATH: process.env.GROUBOT_DATABASE_PATH ?? resolve(root, ".groubot", "groubot.db"),
          GROUBOT_MIGRATIONS_FOLDER: process.env.GROUBOT_MIGRATIONS_FOLDER ?? resolve(workspaceRoot, "packages/db/drizzle"),
        },
        stdio: ["ignore", "pipe", "inherit"],
      });
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
    }
  } catch (error) {
    if (backendOwned && backend) { try { backend.kill("SIGTERM"); } catch {} }
    throw error;
  }
  const cefRootCache = resolve(root, ".groubot/cef-root-cache");
  const cefProfile = resolve(cefRootCache, "profile");
  const child = spawn(executable, [
    `--url=file://${resolve(root, "dist/renderer/index.html")}`,
    // CEF requires each request context cache_path to be inside root_cache_path.
    `--root-cache=${cefRootCache}`,
    `--profile=${cefProfile}`,
    `--resources=${resolve(cefRoot, "Resources")}`,
    `--locales=${resolve(cefRoot, "Resources/locales")}`,
  ], { cwd: resolve(cefRoot, "Release"), stdio: "inherit", env: process.env });
  const shutdown = (code = 0) => {
    try { child.kill("SIGTERM"); } catch {}
    if (backendOwned && backend) { try { backend.kill("SIGTERM"); } catch {} }
    process.exit(code);
  };
  process.once("SIGINT", () => shutdown());
  process.once("SIGTERM", () => shutdown());
  child.once("exit", (code) => shutdown(code ?? 0));
}
