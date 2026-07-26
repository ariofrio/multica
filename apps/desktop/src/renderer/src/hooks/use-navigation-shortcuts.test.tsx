import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { HistoryNavDirection } from "../../../shared/history-nav";
import type { TabSelectionDirection } from "../../../shared/tab-selection";

const state = vi.hoisted(() => ({
  goBack: vi.fn(),
  goForward: vi.fn(),
  selectAdjacentTab: vi.fn<(direction: TabSelectionDirection) => void>(),
}));

vi.mock("@/hooks/use-tab-history", () => ({
  useTabHistory: () => ({ goBack: state.goBack, goForward: state.goForward }),
}));

vi.mock("@/stores/tab-store", () => {
  const store = { selectAdjacentTab: state.selectAdjacentTab };
  return {
    useTabStore: Object.assign(() => store, { getState: () => store }),
  };
});

import {
  useHistoryNav,
  useTabSelectionShortcut,
} from "./use-navigation-shortcuts";

let historyNavCallback: ((direction: HistoryNavDirection) => void) | null = null;
let tabSelectCallback: ((direction: TabSelectionDirection) => void) | null = null;
const unsubscribeHistory = vi.fn();
const unsubscribeTabSelect = vi.fn();

beforeEach(() => {
  historyNavCallback = null;
  tabSelectCallback = null;
  state.goBack.mockReset();
  state.goForward.mockReset();
  state.selectAdjacentTab.mockReset();
  unsubscribeHistory.mockReset();
  unsubscribeTabSelect.mockReset();
  vi.stubGlobal("desktopAPI", {
    onHistoryNav: (cb: (direction: HistoryNavDirection) => void) => {
      historyNavCallback = cb;
      return unsubscribeHistory;
    },
    onSelectRelativeTab: (cb: (direction: TabSelectionDirection) => void) => {
      tabSelectCallback = cb;
      return unsubscribeTabSelect;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("useHistoryNav", () => {
  it("routes each direction to the matching tab-history action", () => {
    renderHook(() => useHistoryNav());

    historyNavCallback?.("back");
    expect(state.goBack).toHaveBeenCalledTimes(1);
    expect(state.goForward).not.toHaveBeenCalled();

    historyNavCallback?.("forward");
    expect(state.goForward).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    renderHook(() => useHistoryNav()).unmount();
    expect(unsubscribeHistory).toHaveBeenCalled();
  });
});

describe("useTabSelectionShortcut", () => {
  it("passes the direction through to the tab store unchanged", () => {
    renderHook(() => useTabSelectionShortcut());

    tabSelectCallback?.("previous");
    expect(state.selectAdjacentTab).toHaveBeenCalledWith("previous");

    tabSelectCallback?.("next");
    expect(state.selectAdjacentTab).toHaveBeenCalledWith("next");
  });

  it("unsubscribes on unmount", () => {
    renderHook(() => useTabSelectionShortcut()).unmount();
    expect(unsubscribeTabSelect).toHaveBeenCalled();
  });
});
