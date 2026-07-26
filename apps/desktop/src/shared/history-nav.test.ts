import { describe, expect, it } from "vitest";
import {
  isHistoryNavDirection,
  historyNavFromSwipe,
} from "./history-nav";

describe("historyNavFromSwipe", () => {
  it("maps horizontal macOS swipe directions to browser-style history", () => {
    expect(historyNavFromSwipe("right")).toBe("back");
    expect(historyNavFromSwipe("left")).toBe("forward");
  });

  it("ignores vertical and unknown directions", () => {
    expect(historyNavFromSwipe("up")).toBeNull();
    expect(historyNavFromSwipe("down")).toBeNull();
    expect(historyNavFromSwipe("sideways")).toBeNull();
  });
});

describe("isHistoryNavDirection", () => {
  it("accepts only the two history directions, whichever producer sent them", () => {
    expect(isHistoryNavDirection("back")).toBe(true);
    expect(isHistoryNavDirection("forward")).toBe(true);
    expect(isHistoryNavDirection("right")).toBe(false);
    expect(isHistoryNavDirection(null)).toBe(false);
  });
});
