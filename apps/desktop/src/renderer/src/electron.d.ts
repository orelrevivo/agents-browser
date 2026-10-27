import type { BrowserState } from "../../../electron/browser/types";
import type { Agent, AgentInput, BrowserTask, ChatMessage, Conversation, ConversationWithMessages, Memory } from "@groubot/db";

interface GroubotBrowserApi {
  getState: () => Promise<BrowserState>;
  createTab: (input?: string) => Promise<void>;
  selectTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  navigate: (input: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: () => Promise<void>;
  onStateChanged: (listener: (state: BrowserState) => void) => () => void;
}

interface GroubotAgentsApi {
  list: () => Promise<Agent[]>;
  create: (input: AgentInput) => Promise<Agent>;
  update: (id: string, input: AgentInput) => Promise<Agent>;
  duplicate: (id: string) => Promise<Agent>;
  remove: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<Agent>;
}

interface GroubotChatsApi {
  list: () => Promise<Conversation[]>;
  get: (id: string) => Promise<ConversationWithMessages | undefined>;
  create: (agentId?: string | null) => Promise<Conversation>;
  sendMessage: (input: { conversationId: string; content: string }) => Promise<{ requestId: string; message: ChatMessage; taskId?: string }>;
  cancel: (requestId: string) => Promise<string>;
  onStream: (listener: (event: ChatStreamEvent) => void) => () => void;
  respondToApproval: (approvalId: string, approved: boolean) => Promise<boolean>;
  onApprovalRequest: (listener: (request: ApprovalRequest) => void) => () => void;
  rename: (input: { id: string; title: string }) => Promise<Conversation>;
  remove: (id: string) => Promise<void>;
}

interface GroubotMemoriesApi {
  list: (agentId: string) => Promise<Memory[]>;
  create: (input: { agentId: string; content: string }) => Promise<Memory>;
  remove: (id: string) => Promise<void>;
  clear: (agentId: string) => Promise<void>;
}

interface GroubotAIConfigApi {
  getConfig: () => Promise<{ model: string; apiKeyConfigured: boolean; webSearchEnabled: boolean; memoryEnabled: boolean }>;
}

interface ChatStreamEvent {
  requestId: string;
  conversationId: string;
  type: "started" | "delta" | "completed" | "cancelled" | "error" | "tool_activity" | "waiting_for_human";
  delta?: string;
  content?: string;
  code?: string;
  message?: string;
  toolName?: string;
  status?: "started" | "finished";
  taskId?: string;
}

interface GroubotBrowserTasksApi {
  list: (conversationId?: string) => Promise<BrowserTask[]>;
  get: (taskId: string) => Promise<BrowserTask | undefined>;
  resume: (taskId: string) => Promise<{ resumed: boolean; requestId?: string; taskId?: string; reason?: string }>;
}

interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
}

declare global {
  interface Window {
    groubot: {
      version: string;
      browser: GroubotBrowserApi;
      agents: GroubotAgentsApi;
      chats: GroubotChatsApi;
      browserTasks: GroubotBrowserTasksApi;
      memories: GroubotMemoriesApi;
      ai: GroubotAIConfigApi;
    };
  }
}

export {};
