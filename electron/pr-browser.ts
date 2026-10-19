import { app, BrowserWindow, WebContentsView, session, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents, WebPreferences } from "electron";
import {
  PR_BROWSER_PARTITION,
  isBrowserNavigationUrl,
  isPullRequestUrl,
  validPrBrowserBounds,
  type PrBrowserBounds,
  type PrBrowserCommand,
  type PrBrowserState,
} from "../src/shared/pr-browser";
import { IPC } from "./ipc-channels";
import { safeHandle } from "./ipc-safe-handle";
import { getBinding, matchElectronInput } from "./keybindings-reader";

const browserPreferences: WebPreferences = {
  partition: PR_BROWSER_PARTITION,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
};

type BrowserEntry = {
  host: BrowserWindow;
  view: WebContentsView;
  sessionId: string;
  mountId: string;
  initialUrl: string;
  error: string | null;
  popups: Set<BrowserWindow>;
};

const browsers = new Map<number, Map<string, BrowserEntry>>();

function owner(event: IpcMainInvokeEvent): BrowserWindow {
  const host = BrowserWindow.fromWebContents(event.sender);
  if (!host || host.isDestroyed()) throw new Error("Browser window unavailable");
  return host;
}

function validId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    throw new Error("Invalid browser session");
  }
}

function state(entry: BrowserEntry): PrBrowserState {
  const contents = entry.view.webContents;
  const currentUrl = contents.getURL();
  return {
    sessionId: entry.sessionId,
    url: isBrowserNavigationUrl(currentUrl) ? currentUrl : entry.initialUrl,
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    error: entry.error,
  };
}

function publish(entry: BrowserEntry) {
  if (!entry.host.isDestroyed() && !entry.view.webContents.isDestroyed()) {
    entry.host.webContents.send(IPC.prBrowserState, state(entry));
  }
}

function restrictNavigation(contents: WebContents) {
  const check = (event: Electron.Event, url: string) => {
    if (url !== "about:blank" && !isBrowserNavigationUrl(url)) event.preventDefault();
  };
  contents.on("will-navigate", check);
  contents.on("will-redirect", check);
}

function configurePopups(contents: WebContents, entry: BrowserEntry) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url !== "about:blank" && !isBrowserNavigationUrl(url)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        parent: entry.host,
        autoHideMenuBar: true,
        webPreferences: browserPreferences,
      },
    };
  });
  contents.on("did-create-window", (popup) => {
    entry.popups.add(popup);
    popup.once("closed", () => entry.popups.delete(popup));
    restrictNavigation(popup.webContents);
    configurePopups(popup.webContents, entry);
  });
}

function dispose(entry: BrowserEntry) {
  for (const popup of entry.popups) if (!popup.isDestroyed()) popup.destroy();
  if (!entry.host.isDestroyed()) entry.host.contentView.removeChildView(entry.view);
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
}

function ownedBrowsers(host: BrowserWindow): Map<string, BrowserEntry> {
  let entries = browsers.get(host.id);
  if (entries) return entries;
  entries = new Map();
  browsers.set(host.id, entries);
  const hide = () => {
    for (const entry of entries.values()) entry.view.setVisible(false);
  };
  // A renderer reload removes its layout owners; keep pages cached but detached
  // until the new renderer explicitly supplies visible bounds.
  host.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) hide();
  });
  host.once("closed", () => {
    for (const entry of entries.values()) dispose(entry);
    browsers.delete(host.id);
  });
  return entries;
}

function setBounds(entry: BrowserEntry, bounds: PrBrowserBounds | null) {
  if (!bounds) { entry.view.setVisible(false); return; }
  if (!validPrBrowserBounds(bounds)) throw new Error("Invalid browser bounds");
  const scale = entry.host.webContents.getZoomFactor();
  const size = entry.host.getContentBounds();
  const x = Math.min(size.width, Math.round(bounds.x * scale));
  const y = Math.min(size.height, Math.round(bounds.y * scale));
  const width = Math.max(0, Math.min(size.width - x, Math.round(bounds.width * scale)));
  const height = Math.max(0, Math.min(size.height - y, Math.round(bounds.height * scale)));
  entry.view.setBounds({ x, y, width, height });
  entry.view.setVisible(width > 0 && height > 0);
}

function createBrowser(host: BrowserWindow, sessionId: string, mountId: string, url: string): BrowserEntry {
  const view = new WebContentsView({ webPreferences: browserPreferences });
  view.setVisible(false);
  host.contentView.addChildView(view);
  const entry: BrowserEntry = { host, view, sessionId, mountId, initialUrl: url, error: null, popups: new Set() };
  const contents = view.webContents;
  restrictNavigation(contents);
  configurePopups(contents, entry);
  contents.on("did-start-loading", () => publish(entry));
  contents.on("did-stop-loading", () => {
    publish(entry);
    void contents.session.cookies.flushStore().catch(() => {});
  });
  contents.on("did-navigate", () => publish(entry));
  contents.on("did-navigate-in-page", () => publish(entry));
  contents.on("focus", () => {
    if (!host.isDestroyed()) host.webContents.send(IPC.prBrowserIntent, { sessionId, action: "focus" });
  });
  contents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    entry.error = "Page could not load. Reload or open the PR externally.";
    publish(entry);
  });
  contents.on("render-process-gone", () => {
    entry.error = "Browser stopped. Reload to reopen the page.";
    publish(entry);
  });
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const dir = app.getPath("userData");
    const action = matchElectronInput(input, getBinding(dir, "terminal.expandToggle")) ? "expand"
      : matchElectronInput(input, getBinding(dir, "terminal.close")) ||
        matchElectronInput(input, getBinding(dir, "session.closeWindow")) ? "hide" : null;
    if (!action) return;
    event.preventDefault();
    host.webContents.focus();
    host.webContents.send(IPC.prBrowserIntent, { sessionId, action });
  });
  return entry;
}

function navigate(entry: BrowserEntry, url: string) {
  entry.error = null;
  entry.initialUrl = url;
  void entry.view.webContents.loadURL(url).catch(() => {
    if (entry.view.webContents.isDestroyed()) return;
    entry.error = "Page could not load. Reload or open the PR externally.";
    publish(entry);
  });
}

export function registerPrBrowserHandlers() {
  safeHandle(IPC.prBrowserShow, (event, sessionId: unknown, mountId: unknown, url: unknown, bounds: unknown) => {
    validId(sessionId); validId(mountId);
    if (typeof url !== "string" || !isPullRequestUrl(url) || !validPrBrowserBounds(bounds)) {
      throw new Error("Invalid PR browser request");
    }
    const host = owner(event);
    const entries = ownedBrowsers(host);
    let entry = entries.get(sessionId);
    if (!entry) {
      entry = createBrowser(host, sessionId, mountId, url);
      entries.set(sessionId, entry);
      navigate(entry, url);
    } else if (entry.initialUrl !== url) {
      navigate(entry, url);
    }
    entry.mountId = mountId;
    setBounds(entry, bounds);
    return state(entry);
  });
  safeHandle(IPC.prBrowserLayout, (event, sessionId: unknown, mountId: unknown, bounds: unknown) => {
    validId(sessionId); validId(mountId);
    if (bounds !== null && !validPrBrowserBounds(bounds)) throw new Error("Invalid browser bounds");
    const entry = browsers.get(owner(event).id)?.get(sessionId);
    if (entry?.mountId === mountId) setBounds(entry, bounds as PrBrowserBounds | null);
  });
  safeHandle(IPC.prBrowserCommand, async (event, sessionId: unknown, command: PrBrowserCommand) => {
    validId(sessionId);
    const entry = browsers.get(owner(event).id)?.get(sessionId);
    if (!entry) throw new Error("PR browser unavailable");
    const contents = entry.view.webContents;
    switch (command) {
      case "back": if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); break;
      case "forward": if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); break;
      case "reload": entry.error = null; contents.reload(); break;
      case "external": await shell.openExternal(entry.initialUrl); break;
      case "focus": contents.focus(); break;
      default: throw new Error("Invalid browser command");
    }
    return state(entry);
  });
  safeHandle(IPC.prBrowserDestroy, (event, sessionId: unknown) => {
    validId(sessionId);
    const entries = browsers.get(owner(event).id);
    const entry = entries?.get(sessionId);
    if (entry) { dispose(entry); entries?.delete(sessionId); }
  });
  app.on("before-quit", () => {
    void session.fromPartition(PR_BROWSER_PARTITION).cookies.flushStore().catch(() => {});
  });
}
