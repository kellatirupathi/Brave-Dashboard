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

/**
 * How many screens the student has opened since the app started.
 *
 * The WebView's own `canGoBack` is not usable here: it counts entries from
 * before the app's first screen, so trusting it can unwind back through the
 * Forms sign-in the student already passed. This counter only ever describes
 * navigation that happened inside the app, so it can never walk out of the
 * bottom of our own stack.
 *
 * A replace — the canonical-season redirects, for one — deliberately does not
 * count, because it did not open a screen the student can meaningfully return
 * to.
 */
let navigationDepth = 0;

/**
 * Count in-app navigation. wouter pushes through the History API, so patching
 * it observes every route change without coupling this file to the router.
 */
function trackNavigationDepth(): void {
  const push = window.history.pushState.bind(window.history);
  window.history.pushState = function patchedPushState(
    ...args: Parameters<History["pushState"]>
  ) {
    navigationDepth += 1;
    return push(...args);
  };
  window.addEventListener("popstate", () => {
    navigationDepth = Math.max(0, navigationDepth - 1);
  });
}


/**
 * Android's back button returns to the previous screen, and leaves the app only
 * once there is no previous screen left.
 *
 * It used to exit from any of four "top level" routes even when the student had
 * navigated there from somewhere else, so Dashboard → Leads → back closed the
 * app instead of returning to the dashboard. Depth is the honest question:
 * did this app open a screen that can be returned to?
 */
async function wireBackButton(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", () => {
      if (navigationDepth > 0) {
        window.history.back();
        return;
      }
      // Nothing left in our own stack — this is the first screen of the
      // session, so behave like a launcher activity and leave.
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
  trackNavigationDepth();
  void wireBackButton();
}
