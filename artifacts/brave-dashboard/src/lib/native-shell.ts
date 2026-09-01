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
import { canonicalToLegacyPath } from "./season-routing";

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

    // Both calls below are no-ops from Android 15 on. They are kept for the
    // Android 8–14 devices still in the fleet (minSdk here is 26), where they
    // do work and give an opaque status bar with content laid out below it.
    //
    // On Android 15+ the system forces edge-to-edge and ignores them: the
    // plugin's setBackgroundColor bails out for an app targeting 16, and
    // setOverlaysWebView is implemented with SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN,
    // which is a deprecated no-op. Clearing the bar there is MainActivity's
    // job — it publishes the real insets as --safe-area-inset-*, which the
    // header and the bottom navigation reserve space with.
    //
    // The two paths agree by construction rather than by coincidence: those
    // insets are measured on the WebView itself, so when the old flags DO push
    // content below the bars there is nothing left to reserve and they report
    // zero.
    await StatusBar.setBackgroundColor({ color: HEADER_COLOR });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* plugin unavailable; the app still renders */
  }
}

/**
 * Switch the status bar icons for a screen that is NOT under the maroon header.
 *
 * On Android 15+ the status bar is transparent and shows whatever the page
 * paints behind it. Every signed-in screen paints the dark header there, so
 * light icons are right. The sign-in screen paints the cream ground instead,
 * and light icons on cream are invisible — on the very first screen a student
 * ever sees.
 *
 * Pass "light-content" for a dark ground, "dark-content" for a light one.
 * No-ops on web.
 */
export async function setStatusBarContrast(
  content: "light-content" | "dark-content",
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const nativePlugin = "@capacitor/status-bar";
    const { StatusBar, Style } = await import(/* @vite-ignore */ nativePlugin);
    // Style.Dark means "light content"; Style.Light means "dark content".
    await StatusBar.setStyle({
      style: content === "light-content" ? Style.Dark : Style.Light,
    });
  } catch {
    /* plugin unavailable */
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
const ROUTER_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function routePathname(): string {
  const pathname = window.location.pathname;
  if (!ROUTER_BASE) return pathname;
  if (pathname === ROUTER_BASE) return "/";
  return pathname.startsWith(ROUTER_BASE + "/")
    ? pathname.slice(ROUTER_BASE.length)
    : pathname;
}

/**
 * Android's back button at the root of the app should EXIT, not navigate into
 * browser history and reveal the login screen the student already passed.
 */
async function wireBackButton(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      const path = canonicalToLegacyPath(routePathname());
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
