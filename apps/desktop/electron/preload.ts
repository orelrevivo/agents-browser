import { contextBridge, ipcRenderer } from "electron";
import type { BrowserState } from "./browser/types";
import type { Agent, AgentInput, BrowserTask, ChatMessage, Conversation, ConversationWithMessages, Memory } from "@groubot/db";

type ChatStreamEvent = { requestId: string; conversationId: string; type: "started" | "delta" | "completed" | "cancelled" | "error" | "tool_activity" | "waiting_for_human"; delta?: string; content?: string; code?: string; message?: string; toolName?: string; status?: "started" | "finished"; taskId?: string };
type ApprovalRequest = { approvalId: string; toolName: string; description: string; input: Record<string, unknown> };

const browser = {
  getState: () => ipcRenderer.invoke("browser:get-state") as Promise<BrowserState>,
  createTab: (input?: string) => ipcRenderer.invoke("browser:create-tab", input) as Promise<void>,
  selectTab: (tabId: string) => ipcRenderer.invoke("browser:select-tab", tabId) as Promise<void>,
  closeTab: (tabId: string) => ipcRenderer.invoke("browser:close-tab", tabId) as Promise<void>,
  navigate: (input: string) => ipcRenderer.invoke("browser:navigate", input) as Promise<void>,
  goBack: () => ipcRenderer.invoke("browser:go-back") as Promise<void>,
  goForward: () => ipcRenderer.invoke("browser:go-forward") as Promise<void>,
  reload: () => ipcRenderer.invoke("browser:reload") as Promise<void>,
  onStateChanged: (listener: (state: BrowserState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => listener(state);
    ipcRenderer.on("browser:state-changed", handler);
    return () => ipcRenderer.removeListener("browser:state-changed", handler);
  },
};

const agents = {
  list: () => ipcRenderer.invoke("agents:list") as Promise<Agent[]>,
  create: (input: AgentInput) => ipcRenderer.invoke("agents:create", input) as Promise<Agent>,
  update: (id: string, input: AgentInput) => ipcRenderer.invoke("agents:update", id, input) as Promise<Agent>,
  duplicate: (id: string) => ipcRenderer.invoke("agents:duplicate", id) as Promise<Agent>,
  remove: (id: string) => ipcRenderer.invoke("agents:delete", id) as Promise<void>,
  setDefault: (id: string) => ipcRenderer.invoke("agents:set-default", id) as Promise<Agent>,
};

const chats = {
  list: () => ipcRenderer.invoke("chats:list") as Promise<Conversation[]>,
  get: (id: string) => ipcRenderer.invoke("chats:get", id) as Promise<ConversationWithMessages | undefined>,
  create: (agentId?: string | null) => ipcRenderer.invoke("chats:create", agentId) as Promise<Conversation>,
  sendMessage: (input: { conversationId: string; content: string }) => ipcRenderer.invoke("chats:send-message", input) as Promise<{ requestId: string; message: ChatMessage; taskId?: string }>,
  cancel: (requestId: string) => ipcRenderer.invoke("chats:cancel", requestId) as Promise<string>,
  onStream: (listener: (event: ChatStreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatStreamEvent) => listener(payload);
    ipcRenderer.on("chats:stream", handler);
    return () => ipcRenderer.removeListener("chats:stream", handler);
  },
  respondToApproval: (approvalId: string, approved: boolean) => ipcRenderer.invoke("ai:approval-response", approvalId, approved) as Promise<boolean>,
  onApprovalRequest: (listener: (request: ApprovalRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ApprovalRequest) => listener(payload);
    ipcRenderer.on("ai:approval-request", handler);
    return () => ipcRenderer.removeListener("ai:approval-request", handler);
  },
  rename: (input: { id: string; title: string }) => ipcRenderer.invoke("chats:rename", input) as Promise<Conversation>,
  remove: (id: string) => ipcRenderer.invoke("chats:delete", id) as Promise<void>,
};

const browserTasks = {
  list: (conversationId?: string) => ipcRenderer.invoke("browser-tasks:list", conversationId) as Promise<BrowserTask[]>,
  get: (taskId: string) => ipcRenderer.invoke("browser-tasks:get", taskId) as Promise<BrowserTask | undefined>,
  resume: (taskId: string) => ipcRenderer.invoke("browser-tasks:resume", taskId) as Promise<{ resumed: boolean; requestId?: string; taskId?: string; reason?: string }>,
};

const memories = {
  list: (agentId: string) => ipcRenderer.invoke("memories:list", agentId) as Promise<Memory[]>,
  create: (input: { agentId: string; content: string }) => ipcRenderer.invoke("memories:create", input) as Promise<Memory>,
  remove: (id: string) => ipcRenderer.invoke("memories:delete", id) as Promise<void>,
  clear: (agentId: string) => ipcRenderer.invoke("memories:clear", agentId) as Promise<void>,
};

const ai = {
  getConfig: () => ipcRenderer.invoke("ai:get-config") as Promise<{ model: string; apiKeyConfigured: boolean; webSearchEnabled: boolean; memoryEnabled: boolean }>,
};

contextBridge.exposeInMainWorld("groubot", {
  version: "0.1.0",
  browser,
  agents,
  chats,
  browserTasks,
  memories,
  ai,
});
