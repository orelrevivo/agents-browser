import { ipcMain } from "electron";

export function registerAIConfigIpc(model: string, apiKeyConfigured: boolean): void {
  ipcMain.handle("ai:get-config", () => ({ model, apiKeyConfigured, webSearchEnabled: true, memoryEnabled: true }));
}
