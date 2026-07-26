import { useEffect } from "react";
import { useTabStore } from "@/stores/tab-store";
import { useTabHistory } from "@/hooks/use-tab-history";

/**
 * Per-tab history back/forward driven from the main process — the macOS
 * trackpad swipe and the platform history chords share one channel.
 */
export function useHistoryNav(): void {
  const { goBack, goForward } = useTabHistory();

  useEffect(() => {
    return window.desktopAPI.onHistoryNav((direction) => {
      if (direction === "back") {
        goBack();
      } else {
        goForward();
      }
    });
  }, [goBack, goForward]);
}

/** Previous/next tab, recognized in main and resolved against the tab store. */
export function useTabSelectionShortcut(): void {
  useEffect(() => {
    return window.desktopAPI.onSelectRelativeTab((direction) => {
      useTabStore.getState().selectAdjacentTab(direction);
    });
  }, []);
}
