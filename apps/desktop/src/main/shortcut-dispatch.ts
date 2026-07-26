import { HISTORY_NAV_CHANNEL } from "../shared/history-nav";
import { TAB_SELECTION_CHANNEL } from "../shared/tab-selection";
import type { ShortcutResult } from "./keyboard-shortcuts";

/** The one `WebContents` method the dispatch needs; keeps the test mock tiny. */
export type ShortcutSender = {
  send: (channel: string, ...args: unknown[]) => void;
};

/**
 * Forward a handled shortcut to the renderer. Returns whether the caller
 * should `preventDefault()` the originating `before-input-event`.
 */
export function dispatchShortcutResult(
  result: ShortcutResult,
  sender: ShortcutSender,
): boolean {
  switch (result) {
    case false:
      return false;
    case "close-tab":
      sender.send("tab:close-active");
      return true;
    case "prev-tab":
    case "next-tab":
      sender.send(
        TAB_SELECTION_CHANNEL,
        result === "prev-tab" ? "previous" : "next",
      );
      return true;
    case "history-back":
    case "history-forward":
      sender.send(
        HISTORY_NAV_CHANNEL,
        result === "history-back" ? "back" : "forward",
      );
      return true;
    default:
      return true;
  }
}
