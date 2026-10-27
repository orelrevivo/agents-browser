import type { Agent, AgentInput, BrowserTask, ChatMessage, Conversation, ConversationWithMessages, Memory } from "@groubot/db";
import type { BrowserState } from "@groubot/browser/types";

const homeTab = { id: "home", kind: "home", url: "groubot://", title: "Groubot", canGoBack: false, canGoForward: false, isLoading: false, active: true } as const;

interface NativeEvent { type: string; tabId: string; value: string }
interface NativeBridge { command: (command: string, value?: string) => boolean }

function normalizeExternalAddress(input: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function installGroubotBridge(): void {
  if (window.groubot) return;
  const native = (window as Window & { groubotNative?: NativeBridge }).groubotNative;
  let state: BrowserState = { tabs: [homeTab], activeTabId: homeTab.id };
  let conversations: Conversation[] = [];
  const listeners = new Set<(next: BrowserState) => void>();
  const streamListeners = new Set<(event: never) => void>();
  const emit = () => listeners.forEach((listener) => listener(state));
  const sendNative = (command: string, value = "") => native?.command(command, value);
  (window as Window & { groubotNativeEvent?: (event: NativeEvent) => void }).groubotNativeEvent = (event) => {
    if (event.type === "READY" || event.type === "CLOSED") return;
    const tab = state.tabs.find((item) => item.id === event.tabId);
    if (!tab) return;
    if (event.type === "TITLE") tab.title = event.value || tab.title;
    if (event.type === "URL") tab.url = event.value;
    if (event.type === "LOAD_START") tab.isLoading = true;
    if (event.type === "LOAD_END") tab.isLoading = false;
    if (event.type === "LOAD_ERROR") { tab.isLoading = false; tab.lastError = event.value; }
    if (event.type === "HISTORY") {
      const [loading, canGoBack, canGoForward] = event.value.split("\t");
      tab.isLoading = loading === "1";
      tab.canGoBack = canGoBack === "1";
      tab.canGoForward = canGoForward === "1";
    }
    state = { ...state, tabs: [...state.tabs] };
    emit();
  };
  const browser = {
    getState: async () => state,
    createTab: async () => {
      const id = crypto.randomUUID();
      state = { tabs: [...state.tabs.map((tab) => ({ ...tab, active: false })), { ...homeTab, id, active: true }], activeTabId: id };
      emit();
    },
    selectTab: async (id: string) => { const selected = state.tabs.find((tab) => tab.id === id); state = { ...state, activeTabId: id, tabs: state.tabs.map((tab) => ({ ...tab, active: tab.id === id })) }; sendNative("SELECT_TAB", selected?.kind === "web" ? id : "home"); emit(); },
    closeTab: async (id: string) => { const closing = state.tabs.find((tab) => tab.id === id); if (closing?.kind === "web") sendNative("CLOSE_TAB", id); const remaining = state.tabs.filter((tab) => tab.id !== id); const next = remaining.at(-1) ?? homeTab; state = { tabs: remaining.length ? remaining.map((tab) => ({ ...tab, active: tab.id === next.id })) : [homeTab], activeTabId: remaining.length ? next.id : homeTab.id }; if (next.kind === "web") sendNative("SELECT_TAB", next.id); else sendNative("SELECT_TAB", "home"); emit(); },
    navigate: async (input: string) => {
      if (/^groubot:\/\//.test(input)) {
        const activeId = state.activeTabId ?? homeTab.id;
        const current = state.tabs.find((tab) => tab.id === activeId);
        if (current?.kind === "web") sendNative("CLOSE_TAB", activeId);
        sendNative("SELECT_TAB", "home");
        const kind = input === "groubot://" ? "home" : input.startsWith("groubot://chat/") ? "chat" : input === "groubot://agents" ? "agents" : "home";
        state = { ...state, activeTabId: activeId, tabs: state.tabs.map((tab) => tab.id === activeId ? { ...tab, kind, url: input, title: kind === "agents" ? "Agents" : kind === "chat" ? "Chat" : "Groubot", active: true } : { ...tab, active: false }) } as BrowserState;
        emit();
        return;
      }
      const url = normalizeExternalAddress(input);
      const currentId = state.activeTabId ?? homeTab.id;
      const current = state.tabs.find((tab) => tab.id === currentId);
      const activeId = current?.kind === "home" ? crypto.randomUUID() : currentId;
      state = { ...state, activeTabId: activeId, tabs: state.tabs.map((tab) => tab.id === currentId ? { ...tab, id: activeId, kind: "web", url, title: url, isLoading: true, active: true } : { ...tab, active: false }) } as BrowserState;
      if (native) sendNative("NAVIGATE", `${activeId}\t${url}`);
      else window.location.assign(url);
      emit();
    },
    goBack: async () => { if (native) sendNative("BACK", state.activeTabId ?? "home"); else window.history.back(); },
    goForward: async () => { if (native) sendNative("FORWARD", state.activeTabId ?? "home"); else window.history.forward(); },
    reload: async () => { if (native) sendNative("RELOAD", state.activeTabId ?? "home"); else window.location.reload(); },
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
