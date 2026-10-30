export interface BrowserTabState {
  id: string;
  kind:
    | "home"
    | "chat"
    | "agents"
    | "skills"
    | "marketplace"
    | "group"
    | "preferences"
    | "downloads"
    | "web";
  title: string;
  url: string;
  faviconUrl?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  active: boolean;
  controlledByTaskId?: string;
  lastError?: string;
  isUnresponsive?: boolean;
  requiresUserAction?: boolean;
  userActionMessage?: string;
  isComputer?: boolean;
}

export interface BrowserState {
  tabs: BrowserTabState[];
  activeTabId: string | null;
}

export interface BrowserDownloadState {
  id: string;
  fileName: string;
  progress: number;
  status: "downloading" | "paused" | "completed" | "failed";
  remainingText?: string;
}

export type BrowserCommand =
  | { type: "create-tab"; input?: string }
  | { type: "select-tab"; tabId: string }
  | { type: "close-tab"; tabId: string }
  | { type: "navigate"; input: string }
  | { type: "go-back" }
  | { type: "go-forward" }
  | { type: "reload" };
