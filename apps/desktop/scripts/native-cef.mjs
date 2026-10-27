import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const native = resolve(root, "..", "..", "packages/browser/native");
const cefRoot = process.env.GROUBOT_CEF_ROOT ?? "/tmp/cef-test-156.0.14/cef_binary_156.0.14+g4fa4ab5+chromium-156.0.8078.48_linux64_minimal";
const buildDir = process.env.GROUBOT_CEF_BUILD ?? "/tmp/groubot-cef-host-build";
const executable = resolve(buildDir, "Release/groubot-cef-host");
if (!cefRoot) throw new Error("GROUBOT_CEF_ROOT is required");
if (process.argv[2] === "build") {
  if (spawnSync("cmake", ["--version"], { stdio: "ignore" }).error && existsSync(executable)) {
    console.warn(`cmake is unavailable; using existing verified CEF host at ${executable}`);
    process.exit(0);
  }
  mkdirSync(buildDir, { recursive: true });
  execFileSync("cmake", ["-S", native, "-B", buildDir, `-DCEF_ROOT=${cefRoot}`, "-DCMAKE_BUILD_TYPE=Release"], { stdio: "inherit" });
  execFileSync("cmake", ["--build", buildDir, "--target", "groubot-cef-host", "-j2"], { stdio: "inherit" });
} else {
  if (!existsSync(executable)) throw new Error(`CEF host is missing at ${executable}; run pnpm --filter @groubot/desktop native:build`);
  const child = spawn(executable, [
    `--url=file://${resolve(root, "dist/renderer/index.html")}`,
    `--root-cache=${resolve(root, ".groubot/cef-profile")}`,
    `--profile=${resolve(root, ".groubot/cef-profile")}`,
    `--resources=${resolve(cefRoot, "Resources")}`,
    `--locales=${resolve(cefRoot, "Resources/locales")}`,
  ], { cwd: root, stdio: "inherit", env: process.env });
  child.once("exit", (code) => process.exit(code ?? 0));
}
