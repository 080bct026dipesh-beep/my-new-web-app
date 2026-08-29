"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js once the app has mounted. Renders nothing --
 * this is a side-effect-only component, dropped into the root layout
 * alongside NavBar.
 *
 * Registration failures are swallowed on purpose: this is a progressive
 * enhancement (offline shell + cached list data), not a requirement for
 * the app to function, and browsers without service worker support (or
 * with it disabled) should just get the normal always-online experience
 * with no error surfaced to the user.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Progressive enhancement -- see docstring above.
    });
  }, []);

  return null;
}
