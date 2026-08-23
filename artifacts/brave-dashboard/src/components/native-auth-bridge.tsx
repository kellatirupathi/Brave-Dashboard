// Deep-link listener for native sign-in (additive, isolated).
//
// Renders nothing. Exists so the listener is mounted for the whole app
// lifetime rather than only while the login page happens to be on screen — a
// student can be sent to the SSO from any protected route.
//
// No-ops entirely on web. Deleting this file means removing the one
// <NativeAuthBridge /> tag in App.tsx.
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { registerAuthDeepLink } from "@/lib/native-auth";

export function NativeAuthBridge() {
  const { refresh } = useAuth();

  useEffect(() => {
    // refresh() re-reads /api/auth/user, which now succeeds because the token
    // exchange has just set the session cookie. Every consumer of useAuth
    // updates from the shared store, so no reload is needed.
    return registerAuthDeepLink(() => {
      void refresh();
    });
  }, [refresh]);

  return null;
}
