import type {
  Agent,
  AgentGroupInput,
  AgentGroupUpdate,
  AgentInput,
  AutomationInput,
  AutomationUpdate,
  BrowserTask,
  ChatMessage,
  ChatMessageMetadata,
  ChatQuestion,
  Conversation,
  ConversationWithMessages,
  Memory,
} from "@groubot/db";
import type { BrowserDownloadState, BrowserState } from "@groubot/browser/types";
import { backendClient, type BackendRunEvent } from "./backend-client";
import { hideAgentCursorScript, showAgentCursorScript, typeTextScript } from "./page-automation";

const homeTab = {
  id: "home",
  kind: "home",
  url: "groubot://",
  title: "Groubot",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  active: true,
} as const;

interface NativeEvent {
  type: string;
  tabId: string;
  value: string;
}
interface NativeBridge {
  command: (command: string, value?: string) => boolean;
}
interface ChatStreamEvent {
  requestId: string;
  conversationId: string;
  type:
    | "started"
    | "delta"
    | "completed"
    | "cancelled"
    | "error"
    | "tool_activity"
    | "approval_request"
    | "question";
  delta?: string;
  content?: string;
  code?: string;
  message?: string;
  toolName?: string;
  status?: "started" | "finished";
  approvalId?: string;
  description?: string;
  input?: Record<string, unknown>;
  question?: ChatQuestion;
}

function normalizeExternalAddress(input: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function isMarketplaceRoute(input: string): boolean {
  return input === "groubot://marketplace" || input === "groubot://marketplace/";
}

function isGroupRoute(input: string): boolean {
  return /^groubot:\/\/group\/[0-9a-f-]+$/i.test(input);
}

export function installGroubotBridge(): void {
  if (window.groubot) return;
  const native = (window as Window & { groubotNative?: NativeBridge }).groubotNative;
  let state: BrowserState = { tabs: [homeTab], activeTabId: homeTab.id };
  let downloads: BrowserDownloadState[] = [];
  const listeners = new Set<(next: BrowserState) => void>();
  const downloadListeners = new Set<(next: BrowserDownloadState[]) => void>();
  const streamListeners = new Set<(event: ChatStreamEvent) => void>();
  const approvalListeners = new Set<
    (request: {
      approvalId: string;
      toolName: string;
      description: string;
      input: Record<string, unknown>;
    }) => void
  >();
  const cancelledRequests = new Set<string>();
  const polledRequests = new Set<string>();
  // The backend keeps an unresolved request in its pending queue until the
  // renderer completes it. Polling faster than a native CEF operation can
  // finish must not execute that same request more than once.
  const browserRequestsInFlight = new Set<string>();
  const pageResults = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const nativeReadyTabs = new Set<string>();
  const computerTabIds = new Set<string>();
  const computerTabConversations = new Map<string, string>();
  const nativeReadyWaiters = new Map<string, Set<() => void>>();
  function normalizeBrowserState(next: BrowserState): BrowserState {
    const tabs = next.tabs.length > 0 ? next.tabs : [homeTab];
    const activeId = tabs.some((tab) => tab.id === next.activeTabId)
      ? next.activeTabId!
      : (tabs.find((tab) => tab.active)?.id ?? tabs[0]!.id);
    return {
      activeTabId: activeId,
      tabs: tabs.map((tab) => ({ ...tab, active: tab.id === activeId })),
    };
  }
  function waitForNativeTab(tabId: string): Promise<void> {
    if (!native || nativeReadyTabs.has(tabId)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => resolve();
      const waiters = nativeReadyWaiters.get(tabId) ?? new Set<() => void>();
      waiters.add(finish);
      nativeReadyWaiters.set(tabId, waiters);
      window.setTimeout(() => {
        if (!nativeReadyWaiters.get(tabId)?.delete(finish)) return;
        if (nativeReadyWaiters.get(tabId)?.size === 0) nativeReadyWaiters.delete(tabId);
        reject(new Error("The new browser tab did not become ready."));
      }, 15_000);
    });
  }
  const emit = () => {
    state = normalizeBrowserState(state);
    listeners.forEach((listener) => listener(state));
    void backendClient.browser.state(state.tabs).catch(() => undefined);
  };
  const activateTab = (id: string) => {
    state = {
      ...state,
      activeTabId: id,
      tabs: state.tabs.map((tab) => ({ ...tab, active: tab.id === id })),
    };
  };
  const sendNative = (command: string, value = "") => native?.command(command, value);
  // A renderer reload must replace the backend's previous snapshot. Without
  // this initial reconciliation, the agent could receive tabs from a prior
  // CEF host instance that no longer exist in the current browser process.
  void backendClient.browser.state(state.tabs).catch(() => undefined);
  (window as Window & { groubotNativeEvent?: (event: NativeEvent) => void }).groubotNativeEvent = (
    event,
  ) => {
    if (event.type === "READY") {
      if (event.tabId && event.tabId !== "shell") {
        if (computerTabIds.has(event.tabId)) {
          console.info("[groubot.computer] native READY", { tabId: event.tabId });
        }
        nativeReadyTabs.add(event.tabId);
        nativeReadyWaiters.get(event.tabId)?.forEach((resolve) => resolve());
        nativeReadyWaiters.delete(event.tabId);
      }
      return;
    }
    if (event.type === "CLOSED") {
      if (computerTabIds.has(event.tabId)) {
        console.error("[groubot.computer] native browser CLOSED", { tabId: event.tabId });
        computerTabIds.delete(event.tabId);
        computerTabConversations.delete(event.tabId);
      }
      nativeReadyTabs.delete(event.tabId);
      return;
    }
    if (event.type === "RESIZE") {
      window.dispatchEvent(new Event("resize"));
      return;
    }
    if (event.type === "SHORTCUT" && event.value === "CTRL_T") {
      void browser.createTab();
      return;
    }
    if (event.type === "OPEN_TAB" && /^https?:\/\//i.test(event.value)) {
      void browser.createTab(event.value);
      return;
    }
    if (
      event.type === "SHORTCUT" &&
      (event.value === "CTRL_TAB_NEXT" || event.value === "CTRL_TAB_PREV")
    ) {
      const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
      if (index >= 0 && state.tabs.length > 1) {
        const next =
          event.value === "CTRL_TAB_NEXT"
            ? (index + 1) % state.tabs.length
            : (index - 1 + state.tabs.length) % state.tabs.length;
        const selected = state.tabs[next];
        state = {
          ...state,
          activeTabId: selected.id,
          tabs: state.tabs.map((tab) => ({
            ...tab,
            active: tab.id === selected.id,
          })),
        };
        sendNative("SELECT_TAB", selected.kind === "web" ? selected.id : "home");
        emit();
      }
      return;
    }
    if (event.type === "BROWSER_RESULT") {
      try {
        const result = JSON.parse(event.value) as {
          requestId?: string;
          ok?: boolean;
          result?: unknown;
          error?: string;
        };
        const pending = result.requestId ? pageResults.get(result.requestId) : undefined;
        if (!pending) return;
        pageResults.delete(result.requestId!);
        result.ok
          ? pending.resolve(result.result)
          : pending.reject(new Error(result.error || "Page operation failed."));
      } catch {
        /* malformed native result is reported through the request timeout */
      }
      return;
    }
    if (event.type === "DOWNLOAD") {
      try {
        const download = JSON.parse(event.value) as BrowserDownloadState;
        downloads = [...downloads.filter((item) => item.id !== download.id), download];
        downloadListeners.forEach((listener) => listener(downloads));
      } catch {
        /* Ignore malformed download events from the native host. */
      }
      return;
    }
    const tab = state.tabs.find((item) => item.id === event.tabId);
    if (!tab) return;
    if (event.type === "TITLE") tab.title = event.value || tab.title;
    if (event.type === "FAVICON") tab.faviconUrl = event.value || undefined;
    if (event.type === "URL") {
      tab.url = event.value;
      const computerConversationId = computerTabConversations.get(event.tabId);
      if (computerConversationId && /^https?:\/\//i.test(event.value)) {
        localStorage.setItem(`groubot.computer.url.${computerConversationId}`, event.value);
      }
    }
    if (event.type === "LOAD_START") tab.isLoading = true;
    if (event.type === "LOAD_END") tab.isLoading = false;
    if (event.type === "LOAD_ERROR") {
      tab.isLoading = false;
      tab.lastError = event.value;
    }
    if (event.type === "HISTORY") {
      const [loading, canGoBack, canGoForward] = event.value.split("\t");
      tab.isLoading = loading === "1";
      tab.canGoBack = canGoBack === "1";
      tab.canGoForward = canGoForward === "1";
    }
    state = { ...state, tabs: [...state.tabs] };
    emit();
  };
  const evaluatePage = (tabId: string, script: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      pageResults.set(requestId, { resolve, reject });
      if (!sendNative("BROWSER_EVAL", JSON.stringify({ tabId, requestId, script }))) {
        pageResults.delete(requestId);
        reject(new Error("CEF browser bridge is unavailable."));
      }
      setTimeout(() => {
        if (pageResults.delete(requestId)) reject(new Error("Page operation timed out."));
      }, 30_000);
    });
  const browser = {
    getState: async () => state,
    createTab: async (input?: string) => {
      const id = crypto.randomUUID();
      const isDownloads = input === "groubot://downloads";
      const isExternal = Boolean(input && /^https?:\/\//i.test(input));
      const url = isExternal ? normalizeExternalAddress(input!) : (input ?? homeTab.url);
      state = {
        tabs: [
          ...state.tabs.map((tab) => ({ ...tab, active: false })),
          {
            ...homeTab,
            id,
            active: true,
            kind: isDownloads ? "downloads" : isExternal ? "web" : "home",
            url,
            title: isDownloads ? "Downloads" : isExternal ? url : homeTab.title,
            isLoading: isExternal,
          },
        ],
        activeTabId: id,
      };
      if (isExternal) sendNative("NAVIGATE", `${id}\t${url}`);
      emit();
      void backendClient.browser.state(state.tabs);
    },
    selectTab: async (id: string) => {
      const selected = state.tabs.find((tab) => tab.id === id);
      activateTab(id);
      sendNative("SELECT_TAB", selected?.kind === "web" ? id : "home");
      emit();
      void backendClient.browser.state(state.tabs);
    },
    closeTab: async (id: string) => {
      const closing = state.tabs.find((tab) => tab.id === id);
      if (closing?.kind === "web") sendNative("CLOSE_TAB", id);
      const remaining = state.tabs.filter((tab) => tab.id !== id);
      const next = remaining.at(-1) ?? homeTab;
      state = {
        tabs: remaining.length
          ? remaining.map((tab) => ({ ...tab, active: tab.id === next.id }))
          : [homeTab],
        activeTabId: remaining.length ? next.id : homeTab.id,
      };
      if (next.kind === "web") sendNative("SELECT_TAB", next.id);
      else sendNative("SELECT_TAB", "home");
      emit();
    },
    navigate: async (input: string) => {
      if (/^groubot:\/\//.test(input) || input === "about:preferences") {
        const activeId = state.activeTabId ?? homeTab.id;
        const current = state.tabs.find((tab) => tab.id === activeId);
        if (current?.kind === "web") sendNative("CLOSE_TAB", activeId);
        sendNative("SELECT_TAB", "home");
        const kind =
          input === "groubot://"
            ? "home"
            : input.startsWith("groubot://chat/")
              ? "chat"
              : input === "groubot://agents"
                ? "agents"
                : input === "groubot://skills"
                  ? "skills"
                  : isGroupRoute(input)
                    ? "group"
                    : input === "groubot://downloads"
                      ? "downloads"
                      : isMarketplaceRoute(input)
                        ? "marketplace"
                        : input === "groubot://preferences" || input === "about:preferences"
                          ? "preferences"
                          : "home";
        state = {
          ...state,
          activeTabId: activeId,
          tabs: state.tabs.map((tab) =>
            tab.id === activeId
              ? {
                  ...tab,
                  kind,
                  url: input,
                  title:
                    kind === "agents"
                      ? "Agents"
                      : kind === "skills"
                        ? "Skills"
                        : kind === "group"
                          ? "Group"
                          : kind === "marketplace"
                            ? "Marketplace Agents"
                            : kind === "downloads"
                              ? "Downloads"
                              : kind === "preferences"
                                ? "Settings"
                                : kind === "chat"
                                  ? "Chat"
                                  : "Groubot",
                  active: true,
                }
              : { ...tab, active: false },
          ),
        } as BrowserState;
        emit();
        void backendClient.browser.state(state.tabs);
        return;
      }
      const url = normalizeExternalAddress(input);
      const currentId = state.activeTabId ?? homeTab.id;
      const current = state.tabs.find((tab) => tab.id === currentId);
      const activeId = current?.kind === "web" ? currentId : crypto.randomUUID();
      const nextTab = {
        ...homeTab,
        id: activeId,
        kind: "web" as const,
        url,
        title: url,
        isLoading: true,
        active: true,
      };
      state = {
        ...state,
        activeTabId: activeId,
        tabs:
          current?.kind === "web"
            ? state.tabs.map((tab) =>
                tab.id === currentId ? { ...tab, ...nextTab } : { ...tab, active: false },
              )
            : [...state.tabs.map((tab) => ({ ...tab, active: false })), nextTab],
      } as BrowserState;
      if (native) sendNative("NAVIGATE", `${activeId}\t${url}`);
      else window.location.assign(url);
      emit();
      void backendClient.browser.state(state.tabs);
    },
    goBack: async () => {
      if (native) sendNative("BACK", state.activeTabId ?? "home");
      else window.history.back();
    },
    goForward: async () => {
      if (native) sendNative("FORWARD", state.activeTabId ?? "home");
      else window.history.forward();
    },
    reload: async () => {
      if (native) sendNative("RELOAD", state.activeTabId ?? "home");
      else window.location.reload();
    },
    newWindow: async () => {
      sendNative("NEW_WINDOW");
    },
    setLayout: async (layout: "top" | "sidebar") => {
      sendNative("SET_LAYOUT", layout);
    },
    setOverlayVisible: async (
      visible: boolean,
      bounds?: { x: number; y: number; width: number; height: number },
    ) => {
      const payload = bounds
        ? `open\t${Math.round(bounds.x)}\t${Math.round(bounds.y)}\t${Math.round(bounds.width)}\t${Math.round(bounds.height)}`
        : visible
          ? "open"
          : "closed";
      sendNative("SET_OVERLAY", payload);
    },
    openComputer: async (
      conversationId: string,
      tabId: string,
      url: string,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      const payload = `${tabId}\t${url}\t${Math.round(bounds.x)}\t${Math.round(bounds.y)}\t${Math.round(bounds.width)}\t${Math.round(bounds.height)}`;
      console.info("[groubot.computer] opening", {
        conversationId,
        tabId,
        url,
        bounds,
        nativeAvailable: Boolean(native),
      });
      computerTabIds.add(tabId);
      computerTabConversations.set(tabId, conversationId);
      state = {
        ...state,
        tabs: [
          ...state.tabs,
          {
            ...homeTab,
            id: tabId,
            kind: "web",
            url,
            title: url,
            active: false,
            isLoading: true,
            isComputer: true,
          },
        ],
      } as BrowserState;
      emit();
      await backendClient.browser.setComputer(conversationId, tabId).catch((error) => {
        console.error("[groubot.computer] backend association failed", error);
      });
      const accepted = sendNative("COMPUTER_OPEN", payload);
      if (!accepted) {
        computerTabIds.delete(tabId);
        computerTabConversations.delete(tabId);
        console.error("[groubot.computer] native command rejected", { tabId, payload });
        throw new Error("The native browser host rejected COMPUTER_OPEN.");
      }
      console.info("[groubot.computer] COMPUTER_OPEN accepted", { tabId });
    },
    closeComputer: async (conversationId: string, tabId: string) => {
      sendNative("COMPUTER_CLOSE");
      sendNative("CLOSE_TAB", tabId);
      computerTabConversations.delete(tabId);
      state = { ...state, tabs: state.tabs.filter((tab) => tab.id !== tabId) } as BrowserState;
      emit();
      void backendClient.browser.setComputer(conversationId, null);
    },
    resizeComputer: async (bounds: { x: number; y: number; width: number; height: number }) => {
      sendNative(
        "COMPUTER_BOUNDS",
        `${Math.round(bounds.x)}\t${Math.round(bounds.y)}\t${Math.round(bounds.width)}\t${Math.round(bounds.height)}`,
      );
    },
    pauseDownload: async (downloadId: string) => {
      sendNative("DOWNLOAD_PAUSE", downloadId);
    },
    cancelDownload: async (downloadId: string) => {
      sendNative("DOWNLOAD_CANCEL", downloadId);
    },
    getDownloads: async () => downloads,
    onDownloadsChanged: (listener: (next: BrowserDownloadState[]) => void) => {
      downloadListeners.add(listener);
      return () => downloadListeners.delete(listener);
    },
    onStateChanged: (listener: (next: BrowserState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const executeBrowserRequest = async (request: {
    requestId: string;
    operation: string;
    payload: any;
  }) => {
    try {
      const payload = request.payload ?? {};
      let result: unknown;
      switch (request.operation) {
        case "list_tabs":
          result = state.tabs;
          break;
        case "attach_tab": {
          const tab = state.tabs.find((item) => item.id === payload.tabId);
          if (!tab) throw new Error("The requested tab is no longer open.");
          if (tab.kind !== "web") {
            throw new Error("Only an external website tab can be attached.");
          }
          state = {
            ...state,
            tabs: state.tabs.map((item) =>
              item.id === tab.id ? { ...item, controlledByTaskId: "agent-active" } : item,
            ),
          };
          emit();
          result = {
            attached: true,
            tabId: tab.id,
            title: tab.title,
            url: tab.url,
            active: tab.active,
          };
          break;
        }
        case "open_tab": {
          const id = crypto.randomUUID();
          const url = payload.url ? normalizeExternalAddress(String(payload.url)) : "groubot://";
          const tab = {
            ...homeTab,
            id,
            kind: payload.url ? "web" : "home",
            url,
            title: payload.url ? url : "Groubot",
            active: true,
            isLoading: Boolean(payload.url),
            controlledByTaskId: payload.url ? "agent-active" : undefined,
          } as any;
          state = {
            ...state,
            tabs: [...state.tabs.map((item) => ({ ...item, active: false })), tab],
            activeTabId: id,
          };
          if (payload.url) {
            const ready = waitForNativeTab(id);
            sendNative("NAVIGATE", `${id}\t${url}`);
            await ready;
          } else sendNative("SELECT_TAB", "home");
          emit();
          result = { tabId: id, url };
          break;
        }
        case "navigate": {
          const url = normalizeExternalAddress(String(payload.url));
          const tab = state.tabs.find((item) => item.id === payload.tabId);
          if (
            !tab ||
            tab.kind === "home" ||
            tab.kind === "chat" ||
            tab.kind === "agents" ||
            tab.kind === "skills" ||
            tab.kind === "marketplace"
          )
            throw new Error("Target tab is not an external website tab.");
          const isComputer = Boolean(tab.isComputer);
          state = {
            ...state,
            // Computer is an embedded side surface. Navigating it must not
            // select a hidden browser tab and replace the chat route.
            activeTabId: isComputer ? state.activeTabId : tab.id,
            tabs: state.tabs.map((item) =>
              item.id === payload.tabId
                ? {
                    ...item,
                    active: isComputer ? item.active : true,
                    controlledByTaskId: "agent-active",
                    isLoading: true,
                    url,
                    title: url,
                  }
                : isComputer
                  ? item
                  : { ...item, active: false },
            ),
          };
          emit();
          sendNative("NAVIGATE", `${payload.tabId}\t${url}`);
          result = { tabId: payload.tabId, url };
          break;
        }
        case "get_page_title":
          result = await evaluatePage(payload.tabId, "({title:document.title,url:location.href})");
          break;
        case "get_page_content":
          result = await evaluatePage(
            payload.tabId,
            "({content:(document.body?.innerText||'').slice(0,20000),url:location.href,title:document.title})",
          );
          break;
        case "inspect_page":
          result = await evaluatePage(
            payload.tabId,
            "(()=>{const elements=[...document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=textbox],[contenteditable=\"true\"],canvas')].slice(0,100);const selector=(e)=>{if(e.id)return '#'+CSS.escape(e.id);for(const attr of ['name','aria-label','placeholder','data-testid']){const value=e.getAttribute(attr);if(value)return `${e.tagName.toLowerCase()}[${attr}=\"${value.replaceAll('\\\"','\\\\\\\"')}\"]`;}const parts=[];let node=e;while(node&&node.nodeType===1&&node!==document.body){let part=node.tagName.toLowerCase();let sibling=node;let index=1;while((sibling=sibling.previousElementSibling))if(sibling.tagName===node.tagName)index++;parts.unshift(`${part}:nth-of-type(${index})`);node=node.parentElement;}return 'body>'+parts.join('>');};return {url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,12000),elements:elements.map((e,i)=>({index:i,selector:selector(e),tag:e.tagName.toLowerCase(),role:e.getAttribute('role'),text:(e.innerText||e.getAttribute('aria-label')||e.getAttribute('data-placeholder')||e.getAttribute('aria-placeholder')||e.getAttribute('placeholder')||'').slice(0,200),type:e.getAttribute('type'),contenteditable:e.getAttribute('contenteditable')==='true',disabled:e.matches(':disabled')}))};})()",
          );
          break;
        case "capture_screenshot":
          throw new Error("Screenshot capture is not available in the current CEF bridge.");
        case "click_element": {
          const point = (await evaluatePage(
            payload.tabId,
            showAgentCursorScript(String(payload.selector), "click"),
          )) as { x: number; y: number };
          try {
            if (
              !sendNative(
                "BROWSER_CLICK",
                JSON.stringify({
                  tabId: payload.tabId,
                  x: point.x,
                  y: point.y,
                }),
              )
            )
              throw new Error("CEF native mouse bridge is unavailable.");
            await new Promise((resolve) => setTimeout(resolve, 700));
            result = { clicked: true, x: point.x, y: point.y, native: true };
          } finally {
            await evaluatePage(payload.tabId, hideAgentCursorScript()).catch(() => undefined);
          }
          break;
        }
        case "type_text": {
          const selector = String(payload.selector);
          const text = String(payload.text);
          const point = (await evaluatePage(
            payload.tabId,
            showAgentCursorScript(selector, "type"),
          )) as { x: number; y: number };
          try {
            try {
              // DOM insertion is deterministic for ordinary inputs and
              // contenteditable controls, and avoids platform-specific key
              // code differences in Chromium/Linux.
              result = await evaluatePage(payload.tabId, typeTextScript(selector, text));
            } catch (domError) {
              if (!sendNative("BROWSER_TYPE", JSON.stringify({ tabId: payload.tabId, text }))) {
                throw domError;
              }
              await new Promise((resolve) =>
                setTimeout(resolve, Math.max(400, Math.min(1200, text.length * 35))),
              );
              const observed = await evaluatePage(
                payload.tabId,
                `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e?String(e.value??e.textContent??""):""})()`,
              );
              if (typeof observed !== "string" || !observed.includes(text)) {
                throw new Error("The browser did not accept the requested text.");
              }
              result = {
                typed: true,
                length: text.length,
                native: true,
                x: point.x,
                y: point.y,
              };
            }
            if (!result) {
              result = await evaluatePage(payload.tabId, typeTextScript(selector, text));
            }
          } finally {
            await evaluatePage(payload.tabId, hideAgentCursorScript()).catch(() => undefined);
          }
          break;
        }
        case "scroll_page":
          result = await evaluatePage(
            payload.tabId,
            `(()=>{window.scrollBy({top:${payload.direction === "down" ? Number(payload.amount) : -Number(payload.amount)},behavior:'instant'});return {scrolled:true,scrollY:window.scrollY};})()`,
          );
          break;
        case "workspace_list_files": {
          const workspace = (
            window as Window & { groubotWorkspace?: { listFiles: () => Promise<unknown> } }
          ).groubotWorkspace;
          if (!workspace)
            throw new Error("Open the Files panel and select a workspace folder first.");
          result = await workspace.listFiles();
          break;
        }
        case "workspace_read_file": {
          const workspace = (
            window as Window & {
              groubotWorkspace?: { readFile: (path: string) => Promise<unknown> };
            }
          ).groubotWorkspace;
          if (!workspace)
            throw new Error("Open the Files panel and select a workspace folder first.");
          result = await workspace.readFile(String(payload.path));
          break;
        }
        case "workspace_write_file": {
          const workspace = (
            window as Window & {
              groubotWorkspace?: { writeFile: (path: string, content: string) => Promise<unknown> };
            }
          ).groubotWorkspace;
          if (!workspace)
            throw new Error("Open the Files panel and select a workspace folder first.");
          result = await workspace.writeFile(String(payload.path), String(payload.content));
          break;
        }
        default:
          throw new Error(`Unsupported browser operation: ${request.operation}`);
      }
      await backendClient.browser.complete(request.requestId, true, result);
    } catch (error) {
      await backendClient.browser.complete(
        request.requestId,
        false,
        undefined,
        error instanceof Error ? error.message : "Browser operation failed.",
      );
    }
  };
  const pollBrowserRequests = async () => {
    try {
      for (const request of await backendClient.browser.pending()) {
        if (browserRequestsInFlight.has(request.requestId)) continue;
        browserRequestsInFlight.add(request.requestId);
        void executeBrowserRequest(request).finally(() => {
          browserRequestsInFlight.delete(request.requestId);
        });
      }
    } catch {
      /* backend may still be starting */
    }
    window.setTimeout(() => void pollBrowserRequests(), 120);
  };
  void pollBrowserRequests();
  const emitStream = (event: ChatStreamEvent) => {
    streamListeners.forEach((listener) => listener(event));
    if (
      (event.type === "completed" || event.type === "error" || event.type === "cancelled") &&
      state.tabs.some((tab) => tab.controlledByTaskId)
    ) {
      state = {
        ...state,
        tabs: state.tabs.map((tab) => ({
          ...tab,
          controlledByTaskId: undefined,
        })),
      };
      emit();
    }
    if (event.type === "approval_request" && event.approvalId && event.description)
      approvalListeners.forEach((listener) =>
        listener({
          approvalId: event.approvalId!,
          toolName: event.toolName ?? "browser action",
          description: event.description!,
          input: event.input ?? {},
        }),
      );
  };
  const pollRun = async (requestId: string, conversationId: string) => {
    if (polledRequests.has(requestId)) return;
    polledRequests.add(requestId);
    let offset = 0;
    try {
      while (!cancelledRequests.has(requestId)) {
        const snapshot = await backendClient.chats.run(requestId);
        for (const event of snapshot.events.slice(offset))
          emitStream({ ...event, requestId, conversationId } as ChatStreamEvent);
        offset = snapshot.events.length;
        if (snapshot.done) break;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } finally {
      polledRequests.delete(requestId);
      cancelledRequests.delete(requestId);
    }
  };
  const resumeActiveRuns = async () => {
    try {
      const activeRuns = await backendClient.chats.active();
      await Promise.all(
        activeRuns
          .filter((run) => !run.done)
          .map((run) => pollRun(run.requestId, run.conversationId)),
      );
    } catch {
      /* The backend may still be starting; a later renderer request will retry. */
    }
  };
  const chats = {
    list: () => backendClient.chats.list(),
    active: () => backendClient.chats.active(),
    get: async (id: string) => (await backendClient.chats.get(id)) ?? undefined,
    create: (agentId?: string | null, groupId?: string | null, permissionMode?: "ask" | "full") =>
      backendClient.chats.create(agentId, groupId, permissionMode),
    sendMessage: async ({
      conversationId,
      content,
      metadata,
    }: {
      conversationId: string;
      content: string;
      metadata?: ChatMessageMetadata;
    }) => {
      const started = await backendClient.chats.sendMessage(conversationId, content, metadata);
      void pollRun(started.requestId, conversationId).catch((error: unknown) =>
        emitStream({
          requestId: started.requestId,
          conversationId,
          type: "error",
          message:
            error instanceof Error ? error.message : "The chat runtime could not be reached.",
        }),
      );
      return started;
    },
    updateMessageMetadata: ({
      conversationId,
      messageId,
      metadata,
    }: {
      conversationId: string;
      messageId: string;
      metadata: ChatMessageMetadata;
    }) => backendClient.chats.updateMessageMetadata(conversationId, messageId, metadata),
    cancel: async (requestId: string) => {
      cancelledRequests.add(requestId);
      emitStream({ requestId, conversationId: "", type: "cancelled" });
      return "cancelled";
    },
    onStream: (listener: (event: ChatStreamEvent) => void) => {
      streamListeners.add(listener);
      return () => streamListeners.delete(listener);
    },
    respondToApproval: async (approvalId: string, approved: boolean) => {
      await backendClient.browser.approve(approvalId, approved);
      return true;
    },
    onApprovalRequest: (
      listener: (request: {
        approvalId: string;
        toolName: string;
        description: string;
        input: Record<string, unknown>;
      }) => void,
    ) => {
      approvalListeners.add(listener);
      return () => approvalListeners.delete(listener);
    },
    rename: ({ id, title }: { id: string; title: string }) => backendClient.chats.rename(id, title),
    attachToGroup: ({ id, groupId }: { id: string; groupId: string }) =>
      backendClient.chats.attachToGroup(id, groupId),
    setPinned: ({ id, pinned }: { id: string; pinned: boolean }) =>
      backendClient.chats.setPinned(id, pinned),
    setPermissionMode: ({ id, permissionMode }: { id: string; permissionMode: "ask" | "full" }) =>
      backendClient.chats.setPermissionMode(id, permissionMode),
    remove: (id: string) => backendClient.chats.remove(id),
  };
  const agents = backendClient.agents;
  const groups = {
    list: () => backendClient.groups.list(),
    get: (id: string) => backendClient.groups.get(id),
    create: (input: AgentGroupInput) => backendClient.groups.create(input),
    update: (id: string, input: AgentGroupUpdate) => backendClient.groups.update(id, input),
    remove: (id: string) => backendClient.groups.remove(id),
  };
  const memories = {
    ...backendClient.memories,
    clear: async (agentId: string) => {
      const items = await backendClient.memories.list(agentId);
      await Promise.all(items.map((item) => backendClient.memories.remove(item.id)));
    },
  };
  const browserTasks = {
    list: async (_conversationId?: string) => [] as BrowserTask[],
    get: async (_taskId: string) => undefined as BrowserTask | undefined,
    resume: async () => ({
      resumed: false,
      reason: "The CEF backend bridge is not connected yet.",
    }),
  };
  const automations = {
    list: () => backendClient.automations.list(),
    create: (input: AutomationInput) => backendClient.automations.create(input),
    update: (id: string, input: AutomationUpdate) => backendClient.automations.update(id, input),
    setStatus: (id: string, status: "active" | "paused") =>
      backendClient.automations.setStatus(id, status),
    run: (id: string) => backendClient.automations.run(id),
    remove: (id: string) => backendClient.automations.remove(id),
  };
  void resumeActiveRuns();
  window.setInterval(() => void resumeActiveRuns(), 1_000);
  window.groubot = {
    version: "cef",
    browser,
    agents,
    groups,
    skills: backendClient.skills,
    automations,
    chats,
    browserTasks,
    memories,
    ai: { getConfig: backendClient.ai.config },
  };
}
