// Per-tab history back/forward, delivered from the main process to the
// renderer, which routes it to the active tab's goBack/goForward. The same
// channel carries both a macOS trackpad swipe (installNavigationGestures) and
// the Cmd/Ctrl+[ / ] keyboard shortcuts (handleAppShortcut).
export const HISTORY_NAV_CHANNEL = "navigation:history";

export type HistoryNavDirection = "back" | "forward";

export function isHistoryNavDirection(value: unknown): value is HistoryNavDirection {
  return value === "back" || value === "forward";
}

export function historyNavFromSwipe(
  direction: string,
): HistoryNavDirection | null {
  if (direction === "right") return "back";
  if (direction === "left") return "forward";
  return null;
}
