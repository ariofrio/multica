import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import {
  createShortcutChord,
  configureShortcutPlatform,
  getShortcut,
  useShortcutStore,
} from "@multica/core/shortcuts";
import { renderWithI18n } from "../../test/i18n";
import { KeyboardShortcutsTab } from "./keyboard-shortcuts-tab";

describe("KeyboardShortcutsTab", () => {
  beforeEach(() => {
    configureShortcutPlatform("windows");
    useShortcutStore.getState().resetAll();
  });

  afterEach(() => {
    cleanup();
    configureShortcutPlatform(null);
    useShortcutStore.getState().resetAll();
  });

  it("records a shortcut and applies it immediately", () => {
    renderWithI18n(<KeyboardShortcutsTab />);
    const recorder = screen.getByRole("button", {
      name: "Change shortcut for Open search",
    });

    fireEvent.click(recorder);
    fireEvent.keyDown(recorder, { key: "j", ctrlKey: true });

    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("J", { primary: true }),
    );
    expect(within(recorder).getByTitle("Ctrl")).toHaveTextContent("Ctrl");
    expect(within(recorder).getByTitle("J")).toHaveTextContent("J");
  });

  it("only captures keys while the recorder is active", () => {
    renderWithI18n(<KeyboardShortcutsTab />);
    const recorder = screen.getByRole("button", {
      name: "Change shortcut for Open search",
    });

    recorder.focus();
    fireEvent.keyDown(recorder, { key: "j", ctrlKey: true });
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("K", { primary: true }),
    );

    fireEvent.click(recorder);
    fireEvent.keyDown(recorder, { key: "j", ctrlKey: true });
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("J", { primary: true }),
    );

    // Focus remains on the button after a successful recording. Tab must move
    // focus normally instead of silently replacing the shortcut with Tab.
    fireEvent.keyDown(recorder, { key: "Tab" });
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("J", { primary: true }),
    );
  });

  it("rejects unsafe plain keys in editors while allowing Send = Enter", () => {
    renderWithI18n(<KeyboardShortcutsTab />);
    const searchRecorder = screen.getByRole("button", {
      name: "Change shortcut for Open search",
    });
    fireEvent.click(searchRecorder);
    fireEvent.keyDown(searchRecorder, { key: "j" });
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("K", { primary: true }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This key would interfere with typing or basic keyboard navigation.",
    );

    const sendRecorder = screen.getByRole("button", {
      name: "Change shortcut for Send",
    });
    fireEvent.click(sendRecorder);
    fireEvent.keyDown(sendRecorder, { key: "Enter" });
    expect(getShortcut("send")).toEqual(createShortcutChord("Enter"));
  });

  it("only allows Enter or Primary+Enter for Send", () => {
    renderWithI18n(<KeyboardShortcutsTab />);
    const sendRecorder = screen.getByRole("button", {
      name: "Change shortcut for Send",
    });

    fireEvent.click(sendRecorder);
    fireEvent.keyDown(sendRecorder, { key: "Enter", shiftKey: true });
    expect(getShortcut("send")).toEqual(
      createShortcutChord("Enter", { primary: true }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Send can only use Enter or Mod+Enter.",
    );

    fireEvent.keyDown(sendRecorder, { key: "Enter", ctrlKey: true });
    expect(getShortcut("send")).toEqual(
      createShortcutChord("Enter", { primary: true }),
    );
  });

  it("rejects shortcuts already assigned to another action", () => {
    renderWithI18n(<KeyboardShortcutsTab />);
    const recorder = screen.getByRole("button", {
      name: "Change shortcut for Create issue",
    });

    fireEvent.click(recorder);
    fireEvent.keyDown(recorder, { key: "k", ctrlKey: true });

    expect(getShortcut("createIssue")).toEqual(createShortcutChord("C"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Already used by Open search.",
    );
  });

  it("can disable and restore an action", () => {
    renderWithI18n(<KeyboardShortcutsTab />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Disable Create issue shortcut",
      }),
    );
    expect(getShortcut("createIssue")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Reset Create issue" }),
    );
    expect(getShortcut("createIssue")).toEqual(createShortcutChord("C"));
  });

  it("confirms before restoring all shortcut defaults", () => {
    useShortcutStore.getState().setShortcut(
      "openSearch",
      createShortcutChord("J", { primary: true }),
    );
    renderWithI18n(<KeyboardShortcutsTab />);

    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "This will remove every custom shortcut and restore the defaults on this device.",
    );
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("J", { primary: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("J", { primary: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore all defaults" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(getShortcut("openSearch")).toEqual(
      createShortcutChord("K", { primary: true }),
    );
  });
});

// The keycaps of the fixed row whose label is `label`, read as their
// accessible titles ("Ctrl", "Page Up", …). Walks up from the label to the
// SettingsRow, which is the first ancestor that also holds the keycaps.
function fixedRowKeys(label: string): string[] {
  let node: HTMLElement | null = screen.getByText(label);
  while (node && node.querySelectorAll("[title]").length === 0) {
    node = node.parentElement;
  }
  return Array.from(node?.querySelectorAll("[title]") ?? []).map(
    (cap) => cap.getAttribute("title") ?? "",
  );
}

// The fixed tab/history rows must show the keys apps/desktop `handleAppShortcut`
// actually binds on the viewer's OS. They are derived from the AUTHORITATIVE
// platform (configureShortcutPlatform, set by CoreProvider on first render) —
// not from a module-eval snapshot of the navigator fallback, which would show
// Windows users the macOS brackets that handleAppShortcut ignores there.
describe("KeyboardShortcutsTab fixed tab/history shortcuts", () => {
  afterEach(() => {
    cleanup();
    configureShortcutPlatform(null);
  });

  it("shows the Windows/Linux native keys when the configured platform is windows", () => {
    configureShortcutPlatform("windows");
    renderWithI18n(<KeyboardShortcutsTab />);

    expect(fixedRowKeys("Previous tab")).toEqual(["Ctrl", "Page Up"]);
    expect(fixedRowKeys("Next tab")).toEqual(["Ctrl", "Page Down"]);
    expect(fixedRowKeys("Back")).toEqual(["Alt", "Left Arrow"]);
    expect(fixedRowKeys("Forward")).toEqual(["Alt", "Right Arrow"]);
  });

  it("shows the macOS bracket keys when the configured platform is macos", () => {
    configureShortcutPlatform("macos");
    renderWithI18n(<KeyboardShortcutsTab />);

    expect(fixedRowKeys("Previous tab")).toEqual(["Command", "Shift", "["]);
    expect(fixedRowKeys("Next tab")).toEqual(["Command", "Shift", "]"]);
    expect(fixedRowKeys("Back")).toEqual(["Command", "["]);
    expect(fixedRowKeys("Forward")).toEqual(["Command", "]"]);
  });
});
