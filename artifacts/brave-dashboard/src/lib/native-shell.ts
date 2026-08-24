// Native shell setup (additive, isolated).
//
// Small platform touches that a browser cannot do and that an installed app is
// judged on: the status bar matching the app's own header rather than showing
// a stray white strip, and the back button behaving the way Android users
// expect at the root of a task.
//
// Every call is guarded and swallowed — a missing plugin must never stop the
// app rendering. No-ops entirely on web.
//
// Deleting this file means removing its one call in main.tsx.
import { isNativeApp } from "./native-auth";

/**
 * Exactly --sidebar from index.css, hsl(0 65% 22%), converted to hex because
 * the native API takes no hsl. Keep the two in step: a status bar a shade off
 * the header is more noticeable than one that clearly differs.
 */
const HEADER_COLOR = "#5D1414";

/**
 * Paint the status bar to match the header.
 *
 * Without this Android leaves a white strip above a dark maroon header, which
 * is the single most obvious "this is a web page in a shell" tell.
 */
async function styleStatusBar(): Promise<void> {
  try {
      const nativePlugin = "@capacitor/status-bar";
      const { StatusBar, Style } = await import(/* @vite-ignore */ nativePlugin);
    // Light TEXT on our dark header — the enum is named for the content, not
    // the background, which is the usual source of confusion here.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: HEADER_COLOR });
    // The header already reserves space via env(safe-area-inset-top), so the
    // bar must not additionally push content down.
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* plugin unavailable; the app still renders */
  }
}

/**
 * The screens the bottom bar can reach directly. Back on one of these EXITS,
 * which is what Android users expect at the start of a task — unwinding
 * instead would surface the dashboard, or worse the login screen, that the
 * student already passed through.
 *
 * Anything deeper (/leads/12, /leads/12/project) is a drill-down and goes back
 * a screen normally.
 */
const TOP_LEVEL = ["/", "/leads", "/projects", "/journal"];

/**
 * Android's back button at the root of the app should EXIT, not navigate into
 * browser history and reveal the login screen the student already passed.
 */
async function wireBackButton(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      const path = window.location.pathname;
      // Trailing slashes and nothing else must still count as top level.
      const normalised = path.length > 1 ? path.replace(/\/+$/, "") : path;
      const atTopLevel = TOP_LEVEL.includes(normalised);
      // Anywhere below the top level, go back a screen.
      if (canGoBack && !atTopLevel) {
        window.history.back();
        return;
      }
      // At a start destination, leave the app rather than unwinding.
      void App.exitApp();
    });
  } catch {
    /* listener unavailable; the system default still applies */
  }
}

/** Call once, as early as possible. Safe on web, where it does nothing. */
export function initNativeShell(): void {
  if (!isNativeApp()) return;
  void styleStatusBar();
  void wireBackButton();
}
