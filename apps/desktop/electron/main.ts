import { app, BrowserWindow, Menu } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createBrowserSession, registerBrowserIpc } from "./browser/ipc";
import { createAgentRepository, createBrowserTaskRepository, createChatRepository, createMemoryRepository } from "@groubot/db";
import { registerAgentIpc } from "./agents/ipc";
import { registerChatIpc } from "./chats/ipc";
import { registerMemoryIpc } from "./memories/ipc";
import { registerAIConfigIpc } from "./ai/ipc";
import { GroubotAgentRunner } from "@groubot/ai";

const mainDirectory = dirname(fileURLToPath(import.meta.url));
const hasSingleInstanceLock = app.requestSingleInstanceLock();

app.on("browser-window-created", (_event, window) => {
  window.setMenuBarVisibility(false);
  window.setAutoHideMenuBar(true);
});

// Hardware acceleration is important for WebGL/WebGPU-backed authentication and
// verification widgets. Users with a known-bad Linux driver can opt into the
// safer software fallback with GROUBOT_DISABLE_GPU=1.
if (process.platform === "linux" && process.env.GROUBOT_DISABLE_GPU === "1") {
  app.commandLine.appendSwitch("ozone-platform", "x11");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.disableHardwareAcceleration();
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(mainDirectory, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setMenuBarVisibility(false);
  window.setAutoHideMenuBar(true);

  createBrowserSession(window);
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Groubot preload failed: ${preloadPath}`, error);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(mainDirectory, "../renderer/index.html"));
  }
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    const envPath = app.isPackaged ? join(app.getPath("userData"), ".env") : join(app.getAppPath(), "../../.env");
    loadEnv({ path: envPath });
    const migrationsFolder = app.isPackaged
      ? join(process.resourcesPath, "db", "drizzle")
      : join(app.getAppPath(), "../../packages/db/drizzle");
    const databasePath = join(app.getPath("userData"), "groubot.db");
    const agentRepository = createAgentRepository(databasePath, migrationsFolder);
    const chatRepository = createChatRepository(databasePath, migrationsFolder);
    const memoryRepository = createMemoryRepository(databasePath, migrationsFolder);
    const browserTaskRepository = createBrowserTaskRepository(databasePath, migrationsFolder);
    const configuredModel = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    const agentRunner = new GroubotAgentRunner(process.env.OPENAI_API_KEY, configuredModel);
    registerBrowserIpc();
    registerAgentIpc(agentRepository);
    registerMemoryIpc(memoryRepository);
    registerAIConfigIpc(configuredModel, Boolean(process.env.OPENAI_API_KEY));
    registerChatIpc(chatRepository, agentRepository, memoryRepository, browserTaskRepository, agentRunner);
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    // The repository owns the SQLite connection and is closed by the process exit.
  });
}
