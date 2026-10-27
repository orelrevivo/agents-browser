import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BrowserWindow } from "electron";

export interface CefBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CefHostOptions {
  url: string;
  bounds: CefBounds;
  profilePath: string;
}

export class CefHost {
  private process?: ChildProcessWithoutNullStreams;
  private output = "";
  private closed = false;
  private readonly listeners = new Set<(event: CefHostEvent) => void>();

  constructor(private readonly window: BrowserWindow) {}

  start(options: CefHostOptions): void {
    if (process.platform !== "linux") throw new Error("The native CEF milestone currently supports Linux only.");
    if (this.process) throw new Error("CEF host is already running");
    const executable = process.env.GROUBOT_CEF_HOST ?? resolve(process.cwd(), "../../packages/browser/native/build/Release/groubot-cef-host");
    if (!existsSync(executable)) throw new Error(`CEF host executable was not found: ${executable}`);

    const nativeHandle = this.window.getNativeWindowHandle();
    const parentWindow = nativeHandle.length >= 4 ? nativeHandle.readUInt32LE(0) : 0;
    if (!parentWindow) throw new Error("Electron did not provide an X11 parent window handle");

    const cefRoot = process.env.GROUBOT_CEF_ROOT;
    const resources = process.env.GROUBOT_CEF_RESOURCES;
    const locales = process.env.GROUBOT_CEF_LOCALES;
    const args = [
      `--parent-window=${parentWindow}`,
      `--x=${options.bounds.x}`,
      `--y=${options.bounds.y}`,
      `--width=${options.bounds.width}`,
      `--height=${options.bounds.height}`,
      `--url=${options.url}`,
      `--profile=${options.profilePath}`,
      ...(cefRoot ? [`--root-cache=${resolve(options.profilePath, "..").replaceAll("\\\\", "/")}`] : []),
      ...(resources ? [`--resources=${resources}`] : []),
      ...(locales ? [`--locales=${locales}`] : []),
      "--ozone-platform=x11",
    ];
    this.process = spawn(executable, args, { stdio: "pipe", env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => this.consume(chunk));
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk: string) => console.warn("[groubot.cef]", chunk.trim()));
    this.process.once("error", (error) => this.emit({ type: "error", message: error.message }));
    this.process.once("exit", (code, signal) => {
      this.process = undefined;
      this.emit({ type: "exit", code, signal });
    });
  }

  onEvent(listener: (event: CefHostEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  navigate(url: string): void {
    this.send(`NAVIGATE\t${url}`);
  }

  resize(bounds: CefBounds): void {
    this.send(`RESIZE\t${bounds.x}\t${bounds.y}\t${bounds.width}\t${bounds.height}`);
  }

  reload(): void {
    this.send("RELOAD");
  }

  goBack(): void { this.send("BACK"); }

  goForward(): void { this.send("FORWARD"); }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.send("CLOSE");
    setTimeout(() => this.process?.kill(), 1500).unref();
  }

  private consume(chunk: string): void {
    this.output += chunk;
    const lines = this.output.split("\n");
    this.output = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const [type, ...parts] = line.split("\t");
      if (["READY", "LOAD_START", "LOAD_END", "CLOSED"].includes(type)) {
        this.emit({ type: type as "READY" | "LOAD_START" | "LOAD_END" | "CLOSED", value: parts.join("\t") });
      } else if (["TITLE", "URL", "LOAD_ERROR", "HISTORY"].includes(type)) {
        this.emit({ type: type as "TITLE" | "URL" | "LOAD_ERROR" | "HISTORY", value: parts.join("\t") });
      }
    }
  }

  private send(command: string): void {
    const child = this.process;
    if (child && !child.stdin.destroyed) child.stdin.write(`${command}\n`);
  }

  private emit(event: CefHostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export type CefHostEvent =
  | { type: "READY" | "LOAD_START" | "LOAD_END" | "CLOSED"; value?: string }
  | { type: "TITLE" | "URL" | "LOAD_ERROR" | "HISTORY"; value: string }
  | { type: "error"; message: string }
  | { type: "exit"; code: number | null; signal: NodeJS.Signals | null };
