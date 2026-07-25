import type { WebContents } from "electron";

// Shape of the input subset we read from Electron's `before-input-event`.
// Modeled as a structural type so the handler is unit-testable without a
// real Electron Input instance.
export type ShortcutInput = {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  isAutoRepeat?: boolean;
};

// Subset of WebContents the zoom handler needs. Keeps the test mock tiny.
export type ZoomTarget = Pick<WebContents, "getZoomLevel" | "setZoomLevel">;

// Match Electron's built-in zoomIn/zoomOut roles (Chromium default of 0.5
// per step). Clamp to a range that keeps the UI legible — values outside
// this band turn the workspace into either confetti or a microfiche.
const ZOOM_STEP = 0.5;
const ZOOM_MIN = -3;
const ZOOM_MAX = 4.5;

/**
 * Inspect a `before-input-event` key and apply (or block) the matching
 * window-level shortcut. Returns `true` when the caller should call
 * `event.preventDefault()` — that both swallows the renderer keydown and
 * prevents the application menu accelerator from firing, so we don't
 * double-trigger zoom on macOS where the default menu also binds these
 * keys.
 *
 * Why we don't rely on the menu's `zoomIn` / `zoomOut` roles: on macOS the
 * default `Cmd+-` accelerator does not fire reliably across keyboard
 * layouts (issue MUL-2354 — Cmd+= zooms in but Cmd+- doesn't undo it).
 * Handling the shortcuts here gives identical behavior on every platform
 * and every layout.
 */
/**
 * Result of handleAppShortcut. Anything other than `false` means the caller
 * should `preventDefault()`; the string variants additionally name an IPC the
 * caller must forward to the renderer (the main process has no access to the
 * tab store or per-tab history — those live in the renderer):
 * - `false`: not handled, let Electron continue
 * - `true`: handled (preventDefault), no further action
 * - `"close-tab"`: Cmd/Ctrl+W — close the active tab
 * - `"prev-tab"` / `"next-tab"`: switch product tab
 *   (macOS `Cmd+Shift+[ / ]`; Windows/Linux `Ctrl+PgUp / PgDn`)
 * - `"history-back"` / `"history-forward"`: per-tab history
 *   (macOS `Cmd+[ / ]`; Windows/Linux `Alt+← / →`)
 */
export type ShortcutResult =
  | boolean
  | "close-tab"
  | "prev-tab"
  | "next-tab"
  | "history-back"
  | "history-forward";

/**
 * Tab-switch and per-tab-history chords, using each platform's native
 * convention rather than a blind Cmd→Ctrl swap (which would put macOS's
 * bracket keys on Windows, where they mean nothing). Returns the intent to
 * forward to the renderer, or `null` when the input isn't a navigation chord.
 *
 *   macOS:         Cmd+[ / Cmd+]              history back / forward
 *                  Cmd+Shift+[ / Cmd+Shift+]  previous / next tab
 *   Windows/Linux: Alt+Left / Alt+Right        history back / forward
 *                  Ctrl+PageUp / Ctrl+PageDown previous / next tab
 *
 * `input.key` follows the DOM `KeyboardEvent.key` values ("ArrowLeft",
 * "PageUp", …). Each branch demands an exact modifier set so a superset chord
 * (e.g. Ctrl+Alt+Left) does not trigger navigation.
 */
function matchNavigationShortcut(
  input: ShortcutInput,
  isMac: boolean,
): ShortcutResult | null {
  if (isMac) {
    // Command only — no Control/Option. Shift selects tab-switch vs history.
    if (!input.meta || input.control || input.alt) return null;
    // With Shift the bracket keys report their shifted glyphs ("{" / "}") on a
    // US layout, mirroring the zoom cases' "+"/"_" assumption — accept either.
    const leftBracket = input.key === "[" || input.key === "{";
    const rightBracket = input.key === "]" || input.key === "}";
    if (leftBracket || rightBracket) {
      if (input.shift) return leftBracket ? "prev-tab" : "next-tab";
      return leftBracket ? "history-back" : "history-forward";
    }
    return null;
  }

  // Windows / Linux — history on Alt+arrows, tabs on Ctrl+PageUp/PageDown.
  if (input.alt && !input.control && !input.meta && !input.shift) {
    if (input.key === "ArrowLeft") return "history-back";
    if (input.key === "ArrowRight") return "history-forward";
  }
  if (input.control && !input.alt && !input.meta && !input.shift) {
    if (input.key === "PageUp") return "prev-tab";
    if (input.key === "PageDown") return "next-tab";
  }
  return null;
}

export function handleAppShortcut(
  input: ShortcutInput,
  webContents: ZoomTarget,
  platform: NodeJS.Platform = process.platform,
): ShortcutResult {
  if (input.type !== "keyDown") return false;
  const isMac = platform === "darwin";
  const primary = isMac ? input.meta : input.control;
  const secondary = isMac ? input.control : input.meta;
  const noSecondaryModifiers = !secondary && !input.alt;

  // Block reload — accidental Cmd+R / Ctrl+R / F5 destroys in-memory state
  // (tabs, drafts, WS connections) with no URL bar to recover from.
  if ((primary && input.key.toLowerCase() === "r") || input.key === "F5") {
    return true;
  }

  // Tab switching & per-tab history, using each platform's native chords.
  // Handled before the primary-modifier gate below because the Windows/Linux
  // history binding is Alt+arrow, which carries no Cmd/Ctrl.
  const navigation = matchNavigationShortcut(input, isMac);
  if (navigation) return navigation;

  if (!primary || !noSecondaryModifiers) return false;

  // Cmd/Ctrl + "=" (unshifted) or "+" (Shift+=) → zoom in.
  if (
    (input.key === "=" && !input.shift) ||
    (input.key === "+" && input.shift)
  ) {
    const next = Math.min(webContents.getZoomLevel() + ZOOM_STEP, ZOOM_MAX);
    webContents.setZoomLevel(next);
    return true;
  }

  // Cmd/Ctrl + "-" (unshifted) or "_" (Shift+-) → zoom out.
  if (
    (input.key === "-" && !input.shift) ||
    (input.key === "_" && input.shift)
  ) {
    const next = Math.max(webContents.getZoomLevel() - ZOOM_STEP, ZOOM_MIN);
    webContents.setZoomLevel(next);
    return true;
  }

  // Cmd/Ctrl + 0 → reset zoom to 100%.
  if (input.key === "0" && !input.shift) {
    webContents.setZoomLevel(0);
    return true;
  }

  // Cmd/Ctrl + W → close active tab (or window if last tab).
  // Cmd/Ctrl + Shift + W is reserved for "close window" — do not intercept.
  // Return a signal so the caller can send IPC to the renderer.
  if (input.key.toLowerCase() === "w" && !input.shift) {
    // Holding Cmd/Ctrl+W must not race through several product tabs. Swallow
    // Electron's repeated keydown without issuing another close request.
    if (input.isAutoRepeat) return true;
    return "close-tab";
  }

  return false;
}
