import { ipcMain } from "electron";
import { agentIdSchema, memoryIdSchema, memoryInputSchema, type Memory } from "@groubot/db";

export interface MemoryRepository {
  list(agentId: string): Memory[];
  create(input: { agentId: string; content: string }): Memory;
  remove(id: string): void;
  clear(agentId: string): void;
}

export function registerMemoryIpc(repository: MemoryRepository): void {
  ipcMain.handle("memories:list", (_event, agentId: string) => repository.list(agentIdSchema.parse(agentId)));
  ipcMain.handle("memories:create", (_event, input: { agentId: string; content: string }) => repository.create(memoryInputSchema.parse(input)));
  ipcMain.handle("memories:delete", (_event, id: string) => repository.remove(memoryIdSchema.parse(id)));
  ipcMain.handle("memories:clear", (_event, agentId: string) => repository.clear(agentIdSchema.parse(agentId)));
}
