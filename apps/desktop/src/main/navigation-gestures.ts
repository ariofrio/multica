import type { BrowserWindow } from "electron";
import {
  HISTORY_NAV_CHANNEL,
  historyNavFromSwipe,
} from "../shared/history-nav";

export function installNavigationGestures(
  win: BrowserWindow,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "darwin") return;

  win.on("swipe", (_event, direction) => {
    const gesture = historyNavFromSwipe(direction);
    if (!gesture) return;
    win.webContents.send(HISTORY_NAV_CHANNEL, gesture);
  });
}
