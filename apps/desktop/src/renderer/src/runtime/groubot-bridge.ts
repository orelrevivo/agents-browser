import type { Agent, AgentInput, BrowserTask, ChatMessage, Conversation, ConversationWithMessages, Memory } from "@groubot/db";
import type { BrowserState } from "@groubot/browser/types";

const homeTab = { id: "home", kind: "home", url: "groubot://", title: "Groubot", canGoBack: false, canGoForward: false, isLoading: false, active: true } as const;

export function installGroubotBridge(): void {
  if (window.groubot) return;
  let state: BrowserState = { tabs: [homeTab], activeTabId: homeTab.id };
  let conversations: Conversation[] = [];
  const listeners = new Set<(next: BrowserState) => void>();
  const streamListeners = new Set<(event: never) => void>();
  const emit = () => listeners.forEach((listener) => listener(state));
  const browser = {
    getState: async () => state,
    createTab: async () => {
      const id = crypto.randomUUID();
      state = { tabs: [...state.tabs.map((tab) => ({ ...tab, active: false })), { ...homeTab, id, active: true }], activeTabId: id };
      emit();
    },
    selectTab: async (id: string) => { state = { ...state, activeTabId: id, tabs: state.tabs.map((tab) => ({ ...tab, active: tab.id === id })) }; emit(); },
    closeTab: async (id: string) => { const remaining = state.tabs.filter((tab) => tab.id !== id); const next = remaining.at(-1) ?? homeTab; state = { tabs: remaining.length ? remaining.map((tab) => ({ ...tab, active: tab.id === next.id })) : [homeTab], activeTabId: remaining.length ? next.id : homeTab.id }; emit(); },
    navigate: async (input: string) => {
      if (/^groubot:\/\//.test(input)) {
        const activeId = state.activeTabId ?? homeTab.id;
        const kind = input === "groubot://" ? "home" : input.startsWith("groubot://chat/") ? "chat" : input === "groubot://agents" ? "agents" : "home";
        state = { ...state, activeTabId: activeId, tabs: state.tabs.map((tab) => tab.id === activeId ? { ...tab, kind, url: input, title: kind === "agents" ? "Agents" : kind === "chat" ? "Chat" : "Groubot", active: true } : { ...tab, active: false }) } as BrowserState;
        emit();
        return;
      }
      window.location.assign(input);
    },
    goBack: async () => window.history.back(),
    goForward: async () => window.history.forward(),
    reload: async () => window.location.reload(),
    onStateChanged: (listener: (next: BrowserState) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const chats = {
    list: async () => conversations,
    get: async (_id: string) => undefined as ConversationWithMessages | undefined,
    create: async (agentId?: string | null) => { const conversation = { id: crypto.randomUUID(), agentId: agentId ?? null, title: "New chat", createdAt: Date.now(), updatedAt: Date.now() } as Conversation; conversations = [conversation, ...conversations]; return conversation; },
    sendMessage: async ({ conversationId, content }: { conversationId: string; content: string }) => ({ requestId: crypto.randomUUID(), message: { id: crypto.randomUUID(), conversationId, role: "user", content, createdAt: Date.now() } as ChatMessage }),
    cancel: async () => "cancelled",
    onStream: (listener: (event: never) => void) => { streamListeners.add(listener); return () => streamListeners.delete(listener); },
    respondToApproval: async () => false,
    onApprovalRequest: () => () => undefined,
    rename: async ({ id, title }: { id: string; title: string }) => { const conversation = conversations.find((item) => item.id === id); if (!conversation) throw new Error("Conversation not found"); conversation.title = title; return conversation; },
    remove: async (id: string) => { conversations = conversations.filter((conversation) => conversation.id !== id); },
  };
  const emptyAgents = {
    list: async () => [] as Agent[],
    create: async (_input: AgentInput) => { throw new Error("The CEF backend bridge is not connected yet."); },
    update: async (_id: string, _input: AgentInput) => { throw new Error("The CEF backend bridge is not connected yet."); },
    duplicate: async (_id: string) => { throw new Error("The CEF backend bridge is not connected yet."); },
    remove: async (_id: string) => { throw new Error("The CEF backend bridge is not connected yet."); },
    setDefault: async (_id: string) => { throw new Error("The CEF backend bridge is not connected yet."); },
  };
  const memories = { list: async (_agentId: string) => [] as Memory[], create: async (_input: { agentId: string; content: string }) => { throw new Error("The CEF backend bridge is not connected yet."); }, remove: async (_id: string) => undefined, clear: async (_agentId: string) => undefined };
  const browserTasks = { list: async (_conversationId?: string) => [] as BrowserTask[], get: async (_taskId: string) => undefined as BrowserTask | undefined, resume: async () => ({ resumed: false, reason: "The CEF backend bridge is not connected yet." }) };
  window.groubot = { version: "cef", browser, agents: emptyAgents, chats, browserTasks, memories, ai: { getConfig: async () => ({ model: "gpt-5.6-luna", apiKeyConfigured: false, webSearchEnabled: false, memoryEnabled: false }) } };
}
