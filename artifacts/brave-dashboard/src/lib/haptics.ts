// Haptic feedback (additive, isolated).
//
// A short vibration on a meaningful action is one of the strongest signals
// that separates an app from a web page. PhonePe taps back when a payment
// lands; a website never does.
//
// POSTURE
// - Used SPARINGLY. Buzzing on every tap is worse than none at all — it stops
//   meaning anything and drains battery. Reserved for: a completed action, a
//   refused one, and pulling a sheet open.
// - Never awaited by callers. A missing plugin, a device with no motor, or a
//   user who disabled vibration must never delay or break the action itself.
// - No-ops on web, where the API mostly does not exist.
import { isNativeApp } from "./native-auth";

type Style = "light" | "medium" | "heavy";

/**
 * Light tap. For navigation and opening a sheet — the app acknowledging the
 * gesture, not the outcome.
 */
export function tapFeedback(style: Style = "light"): void {
  if (!isNativeApp()) return;
  void (async () => {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      const map = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      } as const;
      await Haptics.impact({ style: map[style] });
    } catch {
      /* no motor, no plugin, or vibration disabled — all fine */
    }
  })();
}

/**
 * Something succeeded — a journal submitted, a lead captured, a payment
 * recorded. This is the one students should come to recognise.
 */
export function successFeedback(): void {
  if (!isNativeApp()) return;
  void (async () => {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      /* ignored */
    }
  })();
}

/** Something was refused — a failed gate, a rejected save. */
export function errorFeedback(): void {
  if (!isNativeApp()) return;
  void (async () => {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Error });
    } catch {
      /* ignored */
    }
  })();
}
