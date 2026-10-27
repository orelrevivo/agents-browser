import { randomUUID } from "node:crypto";
import { app, BrowserWindow, session as electronSession, WebContentsView, type WebContents } from "electron";
import { join } from "node:path";
import { CefHost } from "./cef-host";
import type { BrowserState, BrowserTabState } from "./types";

export const CHROME_HEIGHT = 104;
const HOME_URL = "groubot://";

interface BrowserTab {
  id: string;
  kind: "home" | "chat" | "agents" | "web";
  view?: WebContentsView;
  cef?: CefHost;
  title: string;
  url: string;
  isLoading: boolean;
  returnToHome: boolean;
  internalBackUrl?: string;
  controlledByTaskId?: string;
  lastError?: string;
  isUnresponsive?: boolean;
  requiresUserAction?: boolean;
  userActionMessage?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  verificationPoll?: ReturnType<typeof setInterval>;
}

export class BrowserSession {
  private readonly tabs = new Map<string, BrowserTab>();
  private activeTabId: string | null = null;
  private readonly browserProfile = electronSession.fromPartition("persist:groubot-browser");

  constructor(private readonly window: BrowserWindow) {
    window.on("resize", () => this.layout());
    window.on("closed", () => this.destroy());
    this.attachNetworkDiagnostics();
    void this.createTab(HOME_URL);
  }

  getState(): BrowserState {
    return {
      activeTabId: this.activeTabId,
      tabs: [...this.tabs.values()].map((tab) => this.serializeTab(tab)),
    };
  }

  async createTab(input = HOME_URL, activate = true): Promise<void> {
    const internalUrl = parseInternalUrl(input);
    const isInternal = internalUrl !== undefined;
    const isHome = internalUrl?.kind === "home";
    const tab: BrowserTab = {
      id: randomUUID(),
      kind: isInternal ? internalUrl.kind : "web",
      view: isInternal || this.usesNativeCef() ? undefined : this.createWebView(),
      cef: isInternal || !this.usesNativeCef() ? undefined : new CefHost(this.window),
      title: isHome ? "Groubot" : internalUrl?.kind === "chat" ? "Chat" : internalUrl?.kind === "agents" ? "Agents" : "New tab",
      url: isInternal ? internalUrl.url : input,
      isLoading: !isInternal,
      returnToHome: false,
      canGoBack: false,
      canGoForward: false,
    };

    this.tabs.set(tab.id, tab);
    if (tab.view) {
      this.window.contentView.addChildView(tab.view);
      this.attachTabEvents(tab);
    }
    if (activate) await this.selectTab(tab.id);
    else this.layout();
    if (tab.cef) {
      try {
        tab.cef.start({ url: normalizeAddress(input), bounds: this.browserBounds(), profilePath: join(app.getPath("userData"), "cef-browser-profile") });
        this.attachCefEvents(tab);
      } catch (error) {
        this.markTabError(tab, error);
      }
    } else if (tab.view) {
      try {
        await tab.view.webContents.loadURL(normalizeAddress(input));
      } catch (error) {
        this.markTabError(tab, error);
        throw error;
      }
    }
  }

  listTabs(): BrowserTabState[] { return [...this.tabs.values()].map((tab) => this.serializeTab(tab)); }

  async openTab(input?: string, activate = false, taskId?: string): Promise<string> {
    const before = new Set(this.tabs.keys());
    await this.createTab(input || HOME_URL, activate);
    const tabId = [...this.tabs.keys()].find((id) => !before.has(id)) ?? this.activeTabId ?? "";
    if (taskId && tabId) this.claimTab(taskId, tabId);
    return tabId;
  }

  claimTab(taskId: string, tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error("Browser tab not found");
    tab.controlledByTaskId = taskId;
    this.emitState();
  }

  getUserActionRequirement(tabId: string): string | undefined {
    return this.tabs.get(tabId)?.userActionMessage;
  }

  async refreshHumanVerificationState(tabId: string): Promise<string | undefined> {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.cef) return undefined;
    if (!tab?.view || tab.view.webContents.isDestroyed()) return undefined;
    let pageSignals = "";
    try {
      pageSignals = await tab.view.webContents.executeJavaScript("(() => { const text = document.body?.innerText || ''; const frames = Array.from(document.querySelectorAll('iframe')).map((frame) => frame.src || frame.title || '').join(' '); return (document.title + ' ' + text.slice(0, 12000) + ' ' + frames).slice(0, 16000); })()", true) as string;
    } catch {
      return tab.userActionMessage;
    }
    this.updateUserActionState(tab, tab.url, pageSignals);
    this.emitState();
    return tab.userActionMessage;
  }

  async navigateTab(tabId: string, url: string): Promise<{ tabId: string; url: string }> {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error("Browser tab not found");
    if (tab.cef) throw new Error("Agent browser inspection is not available in the initial native CEF milestone");
    if (!tab.view) throw new Error("This internal Groubot page cannot be controlled as a website");
    tab.returnToHome = false;
    tab.internalBackUrl = undefined;
    tab.kind = "web";
    tab.isLoading = true;
    tab.lastError = undefined;
    try {
      await tab.view.webContents.loadURL(url);
    } catch (error) {
      tab.isLoading = false;
      this.markTabError(tab, error);
      this.emitState();
      console.error("[groubot.browser] navigation_failed", JSON.stringify({ tabId, url, error: error instanceof Error ? error.message : "Navigation failed" }));
      throw error;
    }
    this.emitState();
    return { tabId, url };
  }

  async inspectPage(tabId: string): Promise<{ tabId: string; title: string; url: string; text: string; interactive: Array<{ tag: string; text: string; selector: string }> }> {
    const tab = this.requireWebTab(tabId);
    const result = await tab.view!.webContents.executeJavaScript(`(() => { const text = (document.body?.innerText || '').slice(0, 20000); const interactive = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).slice(0, 200).map((element) => ({ tag: element.tagName.toLowerCase(), text: ((element.textContent || (element instanceof HTMLInputElement ? element.value : '') || '')).trim().slice(0, 180), selector: element.id ? '#' + CSS.escape(element.id) : element.getAttribute('name') ? element.tagName.toLowerCase() + '[name="' + CSS.escape(element.getAttribute('name') || '') + '"]' : element.tagName.toLowerCase() })); return { text, interactive }; })()`, true) as { text?: string; interactive?: Array<{ tag: string; text: string; selector: string }> };
    const accessibility = await this.readAccessibilityTree(tab);
    return { tabId, title: tab.title, url: tab.url, text: String(result?.text ?? ""), interactive: [...(result?.interactive ?? []), ...accessibility] };
  }

  async captureScreenshot(tabId: string): Promise<{ tabId: string; mimeType: string; data: string }> {
    const tab = this.requireWebTab(tabId);
    const data = await tab.view!.webContents.capturePage().then((image) => image.toPNG().toString("base64"));
    return { tabId, mimeType: "image/png", data };
  }

  async getPageContent(tabId: string): Promise<{ tabId: string; title: string; url: string; content: string }> {
    const tab = this.requireWebTab(tabId);
    const content = await tab.view!.webContents.executeJavaScript("(() => { const root = document.body; return root ? (root.innerText || root.textContent || '').slice(0, 30000) : ''; })()", true);
    return { tabId, title: tab.title, url: tab.url, content: String(content ?? "") };
  }

  async getPageTitle(tabId: string): Promise<{ tabId: string; title: string; url: string }> {
    const tab = this.requireWebTab(tabId);
    return { tabId, title: tab.title, url: tab.url };
  }

  async clickElement(tabId: string, selector: string): Promise<{ tabId: string; selector: string; clicked: boolean }> {
    const tab = this.requireWebTab(tabId);
    const clicked = await tab.view!.webContents.executeJavaScript(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.scrollIntoView({ block: 'center', behavior: 'instant' }); element.click(); return true; })()`, true);
    if (!clicked) throw new Error("No element matched the selector");
    return { tabId, selector, clicked: true };
  }

  async typeText(tabId: string, selector: string, text: string): Promise<{ tabId: string; selector: string; typed: boolean }> {
    const tab = this.requireWebTab(tabId);
    const typed = await tab.view!.webContents.executeJavaScript(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.focus(); if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) { const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set; setter?.call(element, ${JSON.stringify(text)}); } else if (element instanceof HTMLElement && element.isContentEditable) { element.textContent = ${JSON.stringify(text)}; } else { return false; } element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(text)} })); element.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`, true);
    if (!typed) throw new Error("No editable input matched the selector");
    return { tabId, selector, typed: true };
  }

  async scrollPage(tabId: string, direction: "up" | "down", amount = 600): Promise<{ tabId: string; direction: string; amount: number }> {
    const tab = this.requireWebTab(tabId);
    await tab.view!.webContents.executeJavaScript(`window.scrollBy({ top: ${direction === "down" ? amount : -amount}, behavior: 'smooth' })`, true);
    return { tabId, direction, amount };
  }

  async selectTab(tabId: string): Promise<void> {
    if (!this.tabs.has(tabId)) return;
    this.activeTabId = tabId;
    this.layout();
    this.emitState();
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    const wasActive = this.activeTabId === tabId;
    const tabIds = [...this.tabs.keys()];
    const tabIndex = tabIds.indexOf(tabId);
    if (tab.view) {
      this.window.contentView.removeChildView(tab.view);
      if (tab.verificationPoll) clearInterval(tab.verificationPoll);
      this.closeWebView(tab.view);
    }
    tab.cef?.close();
    this.tabs.delete(tabId);

    if (this.tabs.size === 0) {
      void this.createTab(HOME_URL);
      return;
    }

    if (wasActive) {
      const nextTab = [...this.tabs.values()][Math.max(0, tabIndex - 1)];
      this.activeTabId = nextTab?.id ?? [...this.tabs.keys()][0];
    }

    this.layout();
    this.emitState();
  }

  navigate(input: string): void {
    const tab = this.getActiveTab();
    if (!tab || !input.trim()) return;

    const internalUrl = parseInternalUrl(input.trim());
    if (internalUrl) {
      this.navigateInternal(tab, internalUrl);
      return;
    }

    const openedFromHome = !tab.view;
    if (!tab.view && !tab.cef) {
      tab.kind = "web";
      tab.title = "New tab";
      if (this.usesNativeCef()) {
        tab.cef = new CefHost(this.window);
        tab.cef.start({ url: normalizeAddress(input.trim()), bounds: this.browserBounds(), profilePath: join(app.getPath("userData"), "cef-browser-profile") });
        this.attachCefEvents(tab);
      } else {
        tab.view = this.createWebView();
        this.window.contentView.addChildView(tab.view);
        this.attachTabEvents(tab);
      }
      this.layout();
    }

    tab.returnToHome = openedFromHome;
    tab.internalBackUrl = undefined;
    tab.isLoading = true;
    tab.lastError = undefined;
    if (tab.cef) {
      tab.cef.navigate(normalizeAddress(input.trim()));
    } else if (tab.view) {
      void tab.view.webContents.loadURL(normalizeAddress(input.trim())).catch((error: unknown) => this.markTabError(tab, error));
    }
    this.emitState();
  }

  goBack(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    const contents = this.getLiveWebContents(tab);
    if (contents?.navigationHistory.canGoBack()) {
      contents.navigationHistory.goBack();
      return;
    }
    if (tab.cef) { tab.cef.goBack(); return; }
    if (tab.returnToHome) this.restoreHome(tab);
    else if (tab.internalBackUrl) {
      const previousRoute = parseInternalUrl(tab.internalBackUrl);
      if (previousRoute) this.restoreInternal(tab, previousRoute);
    }
  }

  goForward(): void {
    const tab = this.getActiveTab();
    const contents = tab ? this.getLiveWebContents(tab) : undefined;
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    else if (tab?.cef) tab.cef.goForward();
  }

  reload(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.isLoading = true;
    if (!tab.view && tab.cef) {
      tab.cef.reload();
      this.emitState();
      return;
    }
    if (!tab.view) {
      this.emitState();
      void this.window.webContents.reload();
      return;
    }
    const contents = this.getLiveWebContents(tab);
    if (!contents || contents.isCrashed()) {
      void this.recoverTab(tab.id);
    } else {
      try {
        contents.reload();
      } catch (error) {
        this.markTabError(tab, error);
      }
    }
    this.emitState();
  }

  private attachTabEvents(tab: BrowserTab): void {
    if (!tab.view) return;
    const { webContents } = tab.view;

    webContents.on("did-start-loading", () => {
      tab.isLoading = true;
      tab.lastError = undefined;
      tab.isUnresponsive = false;
      this.emitState();
    });
    webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      tab.isLoading = false;
      if (errorCode === -3) {
        console.warn("[groubot.browser] navigation_aborted", JSON.stringify({ tabId: tab.id, validatedURL }));
      } else {
        tab.lastError = errorDescription || `Navigation failed (${errorCode})`;
        console.error("[groubot.browser] did_fail_load", JSON.stringify({ tabId: tab.id, errorCode, errorDescription, validatedURL }));
      }
      this.emitState();
    });
    webContents.on("did-stop-loading", () => {
      tab.isLoading = false;
      this.emitState();
    });
    webContents.on("did-navigate", (_event, url) => {
      tab.url = url;
      this.updateUserActionState(tab, url, "");
      this.emitState();
      void this.refreshHumanVerificationState(tab.id);
    });
    webContents.on("did-navigate-in-page", (_event, url) => {
      tab.url = url;
      this.updateUserActionState(tab, url, "");
      this.emitState();
      void this.refreshHumanVerificationState(tab.id);
    });
    webContents.on("will-redirect", (_event, url) => {
      console.info("[groubot.browser] redirect", JSON.stringify({ tabId: tab.id, url: sanitizeSourceUrl(url) }));
    });
    webContents.on("did-finish-load", () => {
      void this.refreshHumanVerificationState(tab.id);
    });
    webContents.on("render-process-gone", (_event, details) => {
      tab.isLoading = false;
      tab.lastError = `Page renderer stopped (${details.reason})`;
      console.error("[groubot.browser] render_process_gone", JSON.stringify({ tabId: tab.id, reason: details.reason, exitCode: details.exitCode }));
      this.emitState();
    });
    webContents.on("unresponsive", () => {
      tab.isUnresponsive = true;
      console.warn("[groubot.browser] renderer_unresponsive", JSON.stringify({ tabId: tab.id }));
      this.emitState();
    });
    webContents.on("responsive", () => {
      tab.isUnresponsive = false;
      this.emitState();
    });
    webContents.on("console-message", (details) => {
      if (details.level !== "warning" && details.level !== "error") return;
      console.warn("[groubot.browser] page_console_error", JSON.stringify({ tabId: tab.id, level: details.level, message: details.message.slice(0, 500), line: details.lineNumber, source: sanitizeSourceUrl(details.sourceId) }));
    });
    webContents.on("page-title-updated", (_event, title) => {
      tab.title = title || "New tab";
      this.emitState();
    });
    webContents.setWindowOpenHandler(({ url }) => {
      if (isSupportedPopupUrl(url)) {
        console.info("[groubot.browser] secure_popup_allowed", JSON.stringify({ host: safeHostname(url) }));
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              session: this.browserProfile,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }
      console.warn("[groubot.browser] popup_blocked", JSON.stringify({ host: safeHostname(url) }));
      return { action: "deny" };
    });
  }

  private attachCefEvents(tab: BrowserTab): void {
    tab.cef?.onEvent((event) => {
      if (event.type === "LOAD_START") tab.isLoading = true;
      if (event.type === "LOAD_END") tab.isLoading = false;
      if (event.type === "TITLE" && event.value) tab.title = event.value || "New tab";
      if (event.type === "URL" && event.value) tab.url = event.value;
      if (event.type === "HISTORY") {
        const [back, forward] = event.value.split("\t");
        tab.canGoBack = back === "1";
        tab.canGoForward = forward === "1";
      }
      if (event.type === "LOAD_ERROR") {
        tab.isLoading = false;
        tab.lastError = event.value;
      }
      if (event.type === "error") {
        tab.isLoading = false;
        tab.lastError = event.message;
      }
      this.emitState();
    });
  }

  private getActiveTab(): BrowserTab | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
  }

  private requireWebTab(tabId: string): BrowserTab {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error("Browser tab not found");
    if (!tab.view) throw new Error("This internal Groubot page has no external page content");
    if (!this.getLiveWebContents(tab)) throw new Error("This browser tab renderer is no longer available. Reload the tab and try again.");
    return tab;
  }

  private serializeTab(tab: BrowserTab): BrowserTabState {
    const contents = this.getLiveWebContents(tab);
    return {
      id: tab.id,
      kind: tab.kind,
      title: tab.title,
      url: tab.url,
      isLoading: tab.isLoading,
      canGoBack: tab.cef ? tab.canGoBack : (tab.returnToHome || tab.internalBackUrl !== undefined || Boolean(contents?.navigationHistory?.canGoBack())),
      canGoForward: tab.cef ? tab.canGoForward : Boolean(contents?.navigationHistory?.canGoForward()),
      active: tab.id === this.activeTabId,
      controlledByTaskId: tab.controlledByTaskId,
      lastError: tab.lastError,
      isUnresponsive: tab.isUnresponsive,
      requiresUserAction: tab.requiresUserAction,
      userActionMessage: tab.userActionMessage,
    };
  }

  private layout(): void {
    const [width, height] = this.window.getContentSize();
    for (const tab of this.tabs.values()) {
      if (tab.view && tab.id === this.activeTabId) {
        try { tab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) }); } catch (error) { this.markTabError(tab, error); }
      } else if (tab.view) {
        try { tab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width: 0, height: 0 }); } catch (error) { this.markTabError(tab, error); }
      }
      if (tab.cef) {
        try { tab.cef.resize(this.browserBounds()); } catch (error) { this.markTabError(tab, error); }
      }
    }
  }

  private emitState(): void {
    if (!this.window.isDestroyed()) this.window.webContents.send("browser:state-changed", this.getState());
  }

  private attachNetworkDiagnostics(): void {
    this.browserProfile.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
      if (!isDiagnosticUrl(details.url)) return;
      console.warn("[groubot.browser] request_error", JSON.stringify({ method: details.method, url: sanitizeSourceUrl(details.url), error: details.error, resourceType: details.resourceType }));
    });
    this.browserProfile.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
      if (!isDiagnosticUrl(details.url)) return;
      console.info("[groubot.browser] request_completed", JSON.stringify({ method: details.method, url: sanitizeSourceUrl(details.url), status: details.statusCode, resourceType: details.resourceType }));
    });
  }

  private getLiveWebContents(tab: BrowserTab): WebContents | undefined {
    const contents = tab.view?.webContents;
    if (!contents || contents.isDestroyed()) return undefined;
    return contents;
  }

  private closeWebView(view: WebContentsView): void {
    try {
      if (!view.webContents?.isDestroyed()) view.webContents?.close();
    } catch {
      // A renderer can disappear between the lifecycle check and close.
    }
  }

  private markTabError(tab: BrowserTab, error: unknown): void {
    tab.isLoading = false;
    if (isAbortedNavigation(error)) {
      tab.lastError = undefined;
      return;
    }
    tab.lastError = error instanceof Error ? error.message : "Browser navigation failed.";
    console.error("[groubot.browser] tab_error", JSON.stringify({ tabId: tab.id, error: tab.lastError }));
    this.emitState();
  }

  private updateUserActionState(tab: BrowserTab, url: string, pageSignals: string): void {
    const requiresUserAction = isHumanVerificationUrl(url) || isHumanVerificationPage(pageSignals);
    if (requiresUserAction) {
      tab.requiresUserAction = true;
      tab.userActionMessage = "Complete the human verification manually in this tab. Groubot will not solve or bypass it.";
      if (!tab.verificationPoll) tab.verificationPoll = setInterval(() => { void this.refreshHumanVerificationState(tab.id); }, 2000);
    } else {
      tab.requiresUserAction = false;
      tab.userActionMessage = undefined;
      if (tab.verificationPoll) clearInterval(tab.verificationPoll);
      tab.verificationPoll = undefined;
    }
  }

  private async recoverTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab?.view) return;
    const url = tab.url;
    try {
      this.window.contentView.removeChildView(tab.view);
      this.closeWebView(tab.view);
    } catch {
      // The renderer may already be gone; create a fresh view below.
    }
    tab.view = this.createWebView();
    this.window.contentView.addChildView(tab.view);
    this.attachTabEvents(tab);
    tab.isLoading = true;
    tab.lastError = undefined;
    this.layout();
    this.emitState();
    try {
      await tab.view.webContents.loadURL(normalizeAddress(url));
    } catch (error) {
      this.markTabError(tab, error);
    }
  }

  private destroy(): void {
    for (const tab of this.tabs.values()) {
      if (tab.verificationPoll) clearInterval(tab.verificationPoll);
      if (tab.view) this.closeWebView(tab.view);
      if (tab.cef) tab.cef.close();
    }
    this.tabs.clear();
  }

  private restoreHome(tab: BrowserTab): void {
    this.restoreInternal(tab, { kind: "home", url: HOME_URL });
  }

  private restoreInternal(tab: BrowserTab, route: InternalRoute): void {
    if (tab.view) {
      this.window.contentView.removeChildView(tab.view);
      if (tab.verificationPoll) clearInterval(tab.verificationPoll);
      this.closeWebView(tab.view);
    }
    tab.view = undefined;
    tab.kind = route.kind;
    tab.title = route.kind === "home" ? "Groubot" : route.kind === "chat" ? "Chat" : "Agents";
    tab.url = route.url;
    tab.isLoading = false;
    tab.returnToHome = false;
    tab.internalBackUrl = undefined;
    this.layout();
    this.emitState();
  }

  private navigateInternal(tab: BrowserTab, internalUrl: InternalRoute): void {
    const previousInternalUrl = !tab.view && (tab.kind === "home" || tab.kind === "chat" || tab.kind === "agents") ? tab.url : undefined;
    if (tab.view) {
      this.window.contentView.removeChildView(tab.view);
      if (tab.verificationPoll) clearInterval(tab.verificationPoll);
      this.closeWebView(tab.view);
      tab.view = undefined;
    }
    tab.kind = internalUrl.kind;
    tab.title = internalUrl.kind === "home" ? "Groubot" : internalUrl.kind === "chat" ? "Chat" : "Agents";
    tab.url = internalUrl.url;
    tab.isLoading = false;
    tab.returnToHome = false;
    tab.internalBackUrl = previousInternalUrl;
    this.layout();
    this.emitState();
  }

  private createWebView(): WebContentsView {
    return new WebContentsView({
      webPreferences: {
        session: this.browserProfile,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  }

  private usesNativeCef(): boolean {
    return process.platform === "linux" && process.env.GROUBOT_CEF === "1";
  }

  private browserBounds(): { x: number; y: number; width: number; height: number } {
    const [width, height] = this.window.getContentSize();
    return { x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) };
  }

  private async readAccessibilityTree(tab: BrowserTab): Promise<Array<{ tag: string; text: string; selector: string }>> {
    const debuggerSession = tab.view!.webContents.debugger;
    let attachedHere = false;
    try {
      if (!debuggerSession.isAttached()) { debuggerSession.attach("1.3"); attachedHere = true; }
      const tree = await debuggerSession.sendCommand("Accessibility.getFullAXTree") as { nodes?: Array<{ role?: { value?: string }; name?: { value?: string }; properties?: Array<{ name?: string; value?: { value?: unknown } }> }> };
      return (tree.nodes ?? []).filter((node) => ["button", "link", "textbox", "combobox", "checkbox"].includes(String(node.role?.value))).slice(0, 100).map((node) => ({ tag: String(node.role?.value ?? "element"), text: String(node.name?.value ?? "").slice(0, 180), selector: "[role=\"" + String(node.role?.value ?? "") + "\"]" }));
    } catch (error) {
      console.warn("[groubot.browser] accessibility_unavailable", JSON.stringify({ tabId: tab.id, error: error instanceof Error ? error.message : "Accessibility inspection failed" }));
      return [];
    } finally {
      if (attachedHere && debuggerSession.isAttached()) debuggerSession.detach();
    }
  }
}

function normalizeAddress(input: string): string {
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(withProtocol);
    if (url.hostname.includes(".") || url.hostname === "localhost" || url.protocol !== "https:") {
      return url.toString();
    }
  } catch {
    // Fall through to a Google search for non-URL input.
  }

  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

function isHumanVerificationUrl(input: string): boolean {
  const value = input.toLowerCase();
  return value.includes("google.com/sorry") || value.includes("recaptcha") || value.includes("gstatic.com/recaptcha") || value.includes("challenges.cloudflare.com") || value.includes("hcaptcha.com") || value.includes("turnstile");
}

function isHumanVerificationPage(input: string): boolean {
  const value = input.toLowerCase();
  return /verify\s+(you|that)\s+are\s+human|performing security verification|checking your browser|verify you are not a robot/.test(value)
    || (value.includes("just a moment") && (value.includes("cloudflare") || value.includes("turnstile")))
    || value.includes("challenges.cloudflare.com") || value.includes("hcaptcha") || value.includes("turnstile");
}

function sanitizeSourceUrl(input: string): string {
  try {
    const url = new URL(input);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return "unknown";
  }
}

function isDiagnosticUrl(input: string): boolean {
  const value = input.toLowerCase();
  return value.includes("claude.ai") || value.includes("cloudflare") || value.includes("hcaptcha") || value.includes("google.com") || value.includes("gstatic.com") || value.includes("turnstile");
}

function safeHostname(input: string): string {
  try { return new URL(input).hostname; } catch { return "unknown"; }
}

function isSupportedPopupUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || input === "about:blank";
  } catch {
    return false;
  }
}

function isAbortedNavigation(error: unknown): boolean {
  return error instanceof Error && /ERR_ABORTED\s*\(-3\)/i.test(error.message);
}

type InternalRoute = { kind: "home" | "chat" | "agents"; url: string };

function parseInternalUrl(input: string): InternalRoute | undefined {
  if (input === "groubot://" || input === "groubot://home") return { kind: "home", url: HOME_URL };
  if (input === "groubot://agents") return { kind: "agents", url: "groubot://agents" };
  const chatMatch = input.match(/^groubot:\/\/chat\/([^/?#]+)$/i);
  if (chatMatch) return { kind: "chat", url: `groubot://chat/${chatMatch[1]}` };
  return undefined;
}
