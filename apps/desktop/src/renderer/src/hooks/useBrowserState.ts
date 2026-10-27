import { useEffect, useState } from "react";
import type { BrowserState } from "../../../../electron/browser/types";

const initialBrowserState: BrowserState = { tabs: [], activeTabId: null };

export function useBrowserState() {
  const [browserState, setBrowserState] = useState(initialBrowserState);

  useEffect(() => {
    let mounted = true;
    void window.groubot.browser.getState().then((state) => {
      if (mounted) setBrowserState(state);
    });
    const unsubscribe = window.groubot.browser.onStateChanged((state) => {
      if (mounted) setBrowserState(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return browserState;
}
