export interface BrowserTabState {
  id: string;
  kind: "home" | "chat" | "agents" | "web";
  title: string;
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  active: boolean;
  controlledByTaskId?: string;
  lastError?: string;
  isUnresponsive?: boolean;
  requiresUserAction?: boolean;
  userActionMessage?: string;
}

export interface BrowserState {
  tabs: BrowserTabState[];
  activeTabId: string | null;
}

export type BrowserCommand =
  | { type: "create-tab"; input?: string }
  | { type: "select-tab"; tabId: string }
  | { type: "close-tab"; tabId: string }
  | { type: "navigate"; input: string }
  | { type: "go-back" }
  | { type: "go-forward" }
  | { type: "reload" };
