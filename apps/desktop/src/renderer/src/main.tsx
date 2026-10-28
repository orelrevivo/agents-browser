import type { FormEvent } from "react";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { ChatWorkspace } from "./components/ChatWorkspace";
import { AgentsPage } from "./components/AgentsPage";
import { SkillsPage } from "./components/SkillsPage";
import { MarketplacePage } from "./marketplace/MarketplacePage";
import { DownloadsPage } from "./components/DownloadsPage";
import { TabBar } from "./components/TabBar";
import {
  SettingsPage,
  type AppearanceTheme,
  type TabLayout,
} from "./components/SettingsPage";
import { useBrowserState } from "./hooks/useBrowserState";
import "./styles.css";
import { installGroubotBridge } from "./runtime/groubot-bridge";
import { Button } from "@groubot/ui";
import { ShieldCheck } from "lucide-react";
import type { BrowserDownloadState } from "@groubot/browser/types";
import type { Agent, AgentGroupInput } from "@groubot/db";
import { GroupEditorSheet } from "./marketplace/GroupEditorSheet";
import { GroupPage } from "./components/GroupPage";
import { AutomationTaskSheet } from "./components/AutomationTaskSheet";
import type { SearchHistoryEntry } from "./components/SearchHistoryPanel";

installGroubotBridge();

function App() {
  const browserState = useBrowserState();
  const activeTab = useMemo(
    () => browserState.tabs.find((tab) => tab.id === browserState.activeTabId),
    [browserState],
  );
  const [address, setAddress] = useState("groubot://");
  const [downloads, setDownloads] = useState<BrowserDownloadState[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("groubot.search-history") ?? "[]",
      ) as SearchHistoryEntry[];
    } catch {
      return [];
    }
  });
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [groupAgents, setGroupAgents] = useState<Agent[]>([]);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [automationAgents, setAutomationAgents] = useState<Agent[]>([]);
  const [theme, setTheme] = useState<AppearanceTheme>(() => {
    return localStorage.getItem("groubot.theme") === "light" ? "light" : "dark";
  });
  const [tabLayout, setTabLayout] = useState<TabLayout>(() => {
    return localStorage.getItem("groubot.tabLayout") === "sidebar"
      ? "sidebar"
      : "top";
  });
  const [approvalRequest, setApprovalRequest] = useState<{
    approvalId: string;
    toolName: string;
    description: string;
    input: Record<string, unknown>;
  }>();
  const editingAddress = useRef(false);
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("groubot.theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("groubot.tabLayout", tabLayout);
    void window.groubot.browser.setLayout(tabLayout);
  }, [tabLayout]);

  useEffect(
    () => window.groubot.chats.onApprovalRequest(setApprovalRequest),
    [],
  );

  useEffect(() => {
    function handleNewGroup() {
      setGroupEditorOpen(true);
    }
    function handleAutomation() {
      setAutomationOpen(true);
    }

    window.addEventListener("groubot:new-group", handleNewGroup);
    window.addEventListener("groubot:automation", handleAutomation);
    return () => {
      window.removeEventListener("groubot:new-group", handleNewGroup);
      window.removeEventListener("groubot:automation", handleAutomation);
    };
  }, []);

  useEffect(() => {
    if (!groupEditorOpen) return;
    void window.groubot.agents.list().then(setGroupAgents);
  }, [groupEditorOpen]);

  useEffect(() => {
    if (!automationOpen) return;
    void window.groubot.agents.list().then(setAutomationAgents);
  }, [automationOpen]);

  useEffect(() => {
    void window.groubot.browser.getDownloads().then(setDownloads);
    return window.groubot.browser.onDownloadsChanged(setDownloads);
  }, []);

  async function respondToApproval(approved: boolean) {
    if (!approvalRequest) return;
    const current = approvalRequest;
    try {
      await window.groubot.chats.respondToApproval(
        current.approvalId,
        approved,
      );
      setApprovalRequest(undefined);
    } catch {
      /* the chat stream will surface a failed approval response */
    }
  }

  useEffect(() => {
    if (!editingAddress.current)
      setAddress(
        activeTab?.kind === "home" ? "groubot://" : (activeTab?.url ?? ""),
      );
    if (activeTab?.kind === "web" && activeTab.url) {
      recordHistory(activeTab.url);
    }
  }, [activeTab?.id, activeTab?.kind, activeTab?.url]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const insideInteractive =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        Boolean(target?.closest("button, a, [role=button]"));

      if (modifier && event.key.toLowerCase() === "l") {
        event.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
        return;
      }
      if (modifier && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void window.groubot.browser.createTab();
        return;
      }
      if (modifier && event.key.toLowerCase() === "w") {
        event.preventDefault();
        if (activeTab) void window.groubot.browser.closeTab(activeTab.id);
        return;
      }
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        const tabs = browserState.tabs;
        const index = tabs.findIndex(
          (tab) => tab.id === browserState.activeTabId,
        );
        if (index >= 0 && tabs.length > 1) {
          const nextIndex = event.shiftKey
            ? (index - 1 + tabs.length) % tabs.length
            : (index + 1) % tabs.length;
          void window.groubot.browser.selectTab(tabs[nextIndex].id);
        }
        return;
      }
      if (
        (event.altKey && event.key === "ArrowLeft") ||
        (event.metaKey && event.key === "[")
      ) {
        event.preventDefault();
        void window.groubot.browser.goBack();
        return;
      }
      if (
        (event.altKey && event.key === "ArrowRight") ||
        (event.metaKey && event.key === "]")
      ) {
        event.preventDefault();
        void window.groubot.browser.goForward();
        return;
      }
      if (
        event.key === "Tab" &&
        activeTab?.kind === "home" &&
        !insideInteractive
      ) {
        event.preventDefault();
        addressRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, browserState.activeTabId, browserState.tabs]);

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    editingAddress.current = false;
    if (!address.trim()) {
      setAddress(
        activeTab?.kind === "home" ? "groubot://" : (activeTab?.url ?? ""),
      );
      return;
    }
    recordHistory(address);
    void window.groubot.browser.navigate(address);
  }

  function recordHistory(input: string) {
    const value = input.trim();
    if (!value || value === "groubot://") return;
    const isUrl = /^https?:\/\//i.test(value);
    const entry: SearchHistoryEntry = {
      id: crypto.randomUUID(),
      value,
      label: isUrl ? (() => {
        try {
          return new URL(value).hostname.replace(/^www\./, "");
        } catch {
          return value;
        }
      })() : value,
      kind: isUrl ? "site" : "search",
    };
    setSearchHistory((current) => {
      const next = [entry, ...current.filter((item) => item.value !== value)].slice(
        0,
        30,
      );
      localStorage.setItem("groubot.search-history", JSON.stringify(next));
      return next;
    });
  }

  function selectHistoryEntry(entry: SearchHistoryEntry) {
    editingAddress.current = false;
    setAddress(entry.value);
    recordHistory(entry.value);
    void window.groubot.browser.navigate(entry.value);
  }

  function clearSearchHistory() {
    localStorage.removeItem("groubot.search-history");
    setSearchHistory([]);
  }

  function openAgents() {
    void window.groubot.browser.navigate("groubot://agents");
  }

  function openNewTab() {
    void window.groubot.browser.createTab();
  }

  async function createGroup(input: AgentGroupInput) {
    const group = await window.groubot.groups.create(input);
    window.dispatchEvent(new Event("groubot:groups-changed"));
    await window.groubot.browser.navigate(`groubot://group/${group.id}`);
  }

  return (
    <main
      className={`flex h-screen min-h-0 flex-col overflow-hidden text-foreground selection:bg-primary/30 ${
        tabLayout === "sidebar"
          ? "gap-[4px] p-3 bg-browser-frame"
          : "bg-background"
      }`}
    >
      {tabLayout === "top" && <TabBar state={browserState} />}
      {approvalRequest && (
        <div className="pointer-events-auto fixed right-3 top-[72px] z-[2147483647] flex max-w-[min(30rem,calc(100vw-1.5rem))] items-center gap-3 rounded-lg border border-primary/40 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              Permission needed: {approvalRequest.toolName}
            </span>
            <span className="block truncate text-muted-foreground">
              {approvalRequest.description}
            </span>
          </span>
          <Button
            className="h-7 px-2 text-[11px]"
            onClick={() => void respondToApproval(false)}
            size="sm"
            variant="ghost"
          >
            Deny
          </Button>
          <Button
            className="h-7 px-2 text-[11px]"
            onClick={() => void respondToApproval(true)}
            size="sm"
          >
            Allow
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {tabLayout === "sidebar" && (
          <TabBar orientation="sidebar" state={browserState} />
        )}
        <div
          className={`flex min-w-0 flex-1 flex-col ${
            tabLayout === "sidebar"
              ? "overflow-hidden rounded-md bg-background shadow-lg"
              : ""
          }`}
        >
          <BrowserToolbar
            activeTab={activeTab}
            address={address}
            addressRef={addressRef}
            onAddressChange={setAddress}
            onAddressFocus={() => {
              if (activeTab?.kind === "home") setAddress("");
            }}
            onAddressSubmit={submitAddress}
            onEditingChange={(editing) => {
              editingAddress.current = editing;
            }}
            onNewTab={openNewTab}
            onNewWindow={() => void window.groubot.browser.newWindow()}
            onOpenAgents={openAgents}
            onOpenDownloads={() =>
              void window.groubot.browser.createTab("groubot://downloads")
            }
            downloads={downloads}
            onOverlayChange={(open, bounds) => {
              void window.groubot.browser.setOverlayVisible(open, bounds);
            }}
            history={searchHistory}
            onHistorySelect={selectHistoryEntry}
            onClearHistory={clearSearchHistory}
          />
          <section className="relative min-h-0 flex-1 overflow-hidden">
            {activeTab?.kind === "home" ? (
              <ChatWorkspace />
            ) : activeTab?.kind === "chat" ? (
              <ChatWorkspace
                conversationId={activeTab.url.replace("groubot://chat/", "")}
              />
            ) : activeTab?.kind === "agents" ? (
              <AgentsPage />
            ) : activeTab?.kind === "skills" ? (
              <SkillsPage />
            ) : activeTab?.kind === "marketplace" ? (
              <MarketplacePage />
            ) : activeTab?.kind === "group" ? (
              <GroupPage groupId={activeTab.url.replace("groubot://group/", "")} />
            ) : activeTab?.kind === "downloads" ? (
              <DownloadsPage downloads={downloads} />
            ) : activeTab?.kind === "preferences" ? (
              <SettingsPage
                onBack={() =>
                  void window.groubot.browser.navigate("groubot://")
                }
                onTabLayoutChange={setTabLayout}
                onThemeChange={setTheme}
                tabLayout={tabLayout}
                theme={theme}
              />
            ) : (
              <div className="h-full bg-background" />
            )}
          </section>
        </div>
      </div>
      <GroupEditorSheet
        agents={groupAgents}
        onCreate={createGroup}
        onOpenChange={setGroupEditorOpen}
        open={groupEditorOpen}
      />
      <AutomationTaskSheet
        agents={automationAgents}
        onOpenChange={setAutomationOpen}
        open={automationOpen}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
