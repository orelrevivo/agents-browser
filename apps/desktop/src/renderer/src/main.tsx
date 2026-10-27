import type { FormEvent } from "react";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { ChatWorkspace } from "./components/ChatWorkspace";
import { AgentsPage } from "./components/AgentsPage";
import { TabBar } from "./components/TabBar";
import { useBrowserState } from "./hooks/useBrowserState";
import "./styles.css";
import { installGroubotBridge } from "./runtime/groubot-bridge";

installGroubotBridge();

function App() {
  const browserState = useBrowserState();
  const activeTab = useMemo(() => browserState.tabs.find((tab) => tab.id === browserState.activeTabId), [browserState]);
  const [address, setAddress] = useState("groubot://");
  const editingAddress = useRef(false);
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingAddress.current) setAddress(activeTab?.kind === "home" ? "groubot://" : activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.kind, activeTab?.url]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const insideInteractive = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable || Boolean(target?.closest("button, a, [role=button]"));

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
        const index = tabs.findIndex((tab) => tab.id === browserState.activeTabId);
        if (index >= 0 && tabs.length > 1) {
          const nextIndex = event.shiftKey ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
          void window.groubot.browser.selectTab(tabs[nextIndex].id);
        }
        return;
      }
      if ((event.altKey && event.key === "ArrowLeft") || (event.metaKey && event.key === "[")) {
        event.preventDefault();
        void window.groubot.browser.goBack();
        return;
      }
      if ((event.altKey && event.key === "ArrowRight") || (event.metaKey && event.key === "]")) {
        event.preventDefault();
        void window.groubot.browser.goForward();
        return;
      }
      if (event.key === "Tab" && activeTab?.kind === "home" && !insideInteractive) {
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
      setAddress(activeTab?.kind === "home" ? "groubot://" : activeTab?.url ?? "");
      return;
    }
    void window.groubot.browser.navigate(address);
  }

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <TabBar state={browserState} />
      <BrowserToolbar activeTab={activeTab} address={address} addressRef={addressRef} onAddressChange={setAddress} onAddressFocus={() => { if (activeTab?.kind === "home") setAddress(""); }} onAddressSubmit={submitAddress} onEditingChange={(editing) => { editingAddress.current = editing; }} />
      <section className="relative min-h-0 flex-1 overflow-hidden">
        {activeTab?.kind === "home" ? <ChatWorkspace /> : activeTab?.kind === "chat" ? <ChatWorkspace conversationId={activeTab.url.replace("groubot://chat/", "")} /> : activeTab?.kind === "agents" ? <AgentsPage /> : <div className="h-full bg-background" />}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
