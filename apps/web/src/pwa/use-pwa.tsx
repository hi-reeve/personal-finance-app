import { useEffect, useState } from "react";
import { registerServiceWorker } from "./register";

/** The event Chromium-based browsers fire when the app can be installed. Not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** Registers the service worker in production builds and tracks update and install availability. */
export function usePwa() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (import.meta.env.PROD) {
      void registerServiceWorker({
        container: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
        onUpdateReady: (applyUpdate) => setApply(() => applyUpdate),
        reload: () => location.reload(),
      });
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    updateReady: apply !== null,
    applyUpdate: () => apply?.(),
    canInstall: installEvent !== null,
    install: async () => {
      await installEvent?.prompt();
      setInstallEvent(null);
    },
  };
}
