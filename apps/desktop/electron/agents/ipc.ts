import { ipcMain } from "electron";
import type { Agent, AgentInput } from "@groubot/db";
import { agentIdSchema, agentInputSchema } from "@groubot/db";

export interface AgentRepository {
  list(): Agent[];
  create(input: AgentInput): Agent;
  update(id: string, input: AgentInput): Agent;
  duplicate(id: string): Agent;
  remove(id: string): void;
  setDefault(id: string): Agent;
}

export function registerAgentIpc(repository: AgentRepository): void {
  ipcMain.handle("agents:list", () => repository.list());
  ipcMain.handle("agents:create", (_event, input: AgentInput) => repository.create(agentInputSchema.parse(input)));
  ipcMain.handle("agents:update", (_event, id: string, input: AgentInput) => repository.update(agentIdSchema.parse(id), agentInputSchema.parse(input)));
  ipcMain.handle("agents:duplicate", (_event, id: string) => repository.duplicate(agentIdSchema.parse(id)));
  ipcMain.handle("agents:delete", (_event, id: string) => repository.remove(agentIdSchema.parse(id)));
  ipcMain.handle("agents:set-default", (_event, id: string) => repository.setDefault(agentIdSchema.parse(id)));
}
