import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { BrowserSession } from "./session";

const sessions = new Map<number, BrowserSession>();

export function createBrowserSession(window: BrowserWindow): BrowserSession {
  const session = new BrowserSession(window);
  sessions.set(window.id, session);
  window.once("closed", () => sessions.delete(window.id));
  return session;
}

export function getBrowserSession(event: IpcMainInvokeEvent): BrowserSession {
  return getSession(event);
}

export function registerBrowserIpc(): void {
  ipcMain.handle("browser:get-state", (event) => getSession(event).getState());
  ipcMain.handle("browser:create-tab", (event, input?: string) => getSession(event).createTab(input));
  ipcMain.handle("browser:select-tab", (event, tabId: string) => getSession(event).selectTab(tabId));
  ipcMain.handle("browser:close-tab", (event, tabId: string) => getSession(event).closeTab(tabId));
  ipcMain.handle("browser:navigate", (event, input: string) => getSession(event).navigate(input));
  ipcMain.handle("browser:go-back", (event) => getSession(event).goBack());
  ipcMain.handle("browser:go-forward", (event) => getSession(event).goForward());
  ipcMain.handle("browser:reload", (event) => getSession(event).reload());
}

function getSession(event: IpcMainInvokeEvent): BrowserSession {
  const window = BrowserWindow.fromWebContents(event.sender);
  const session = window ? sessions.get(window.id) : undefined;
  if (!session) throw new Error("No browser session is associated with this window");
  return session;
}
