import { describe, expect, it, vi } from "vitest";
import { HISTORY_NAV_CHANNEL } from "../shared/history-nav";
import { TAB_SELECTION_CHANNEL } from "../shared/tab-selection";
import { dispatchShortcutResult } from "./shortcut-dispatch";

function makeSender() {
  return { send: vi.fn() };
}

describe("dispatchShortcutResult", () => {
  it("forwards each tab-switch intent as the direction the renderer expects", () => {
    const sender = makeSender();
    expect(dispatchShortcutResult("prev-tab", sender)).toBe(true);
    expect(sender.send).toHaveBeenCalledWith(TAB_SELECTION_CHANNEL, "previous");

    expect(dispatchShortcutResult("next-tab", sender)).toBe(true);
    expect(sender.send).toHaveBeenCalledWith(TAB_SELECTION_CHANNEL, "next");
  });

  it("forwards each history intent on the shared history channel", () => {
    const sender = makeSender();
    expect(dispatchShortcutResult("history-back", sender)).toBe(true);
    expect(sender.send).toHaveBeenCalledWith(HISTORY_NAV_CHANNEL, "back");

    expect(dispatchShortcutResult("history-forward", sender)).toBe(true);
    expect(sender.send).toHaveBeenCalledWith(HISTORY_NAV_CHANNEL, "forward");
  });

  it("forwards close-tab", () => {
    const sender = makeSender();
    expect(dispatchShortcutResult("close-tab", sender)).toBe(true);
    expect(sender.send).toHaveBeenCalledWith("tab:close-active");
  });

  it("swallows a bare true without sending anything", () => {
    const sender = makeSender();
    expect(dispatchShortcutResult(true, sender)).toBe(true);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("lets an unhandled key through", () => {
    const sender = makeSender();
    expect(dispatchShortcutResult(false, sender)).toBe(false);
    expect(sender.send).not.toHaveBeenCalled();
  });
});
