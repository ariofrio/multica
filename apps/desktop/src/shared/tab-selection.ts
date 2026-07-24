export const TAB_SELECTION_CHANNEL = "tab:select-relative";

export type TabSelectionDirection = "previous" | "next";

export function isTabSelectionDirection(
  value: unknown,
): value is TabSelectionDirection {
  return value === "previous" || value === "next";
}
