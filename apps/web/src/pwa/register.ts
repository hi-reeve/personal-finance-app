export interface RegisterOptions {
  /** The browser's service worker container, or undefined where unsupported. */
  container: ServiceWorkerContainer | undefined;
  /** Called when a newer version is installed and waiting. `apply` switches to it and reloads. */
  onUpdateReady: (apply: () => void) => void;
  reload: () => void;
  scriptUrl?: string;
}

/**
 * Registers the service worker and reports updates. A new version never takes over by itself:
 * it waits until the user asks, so an open session is never switched underneath them.
 */
export async function registerServiceWorker({
  container,
  onUpdateReady,
  reload,
  scriptUrl = "/sw.js",
}: RegisterOptions): Promise<void> {
  if (!container) return;

  const registration = await container.register(scriptUrl);
  let applying = false;
  let reloaded = false;

  const apply = () => {
    applying = true;
    (registration.waiting ?? registration.installing)?.postMessage({ type: "SKIP_WAITING" });
  };

  container.addEventListener("controllerchange", () => {
    if (!applying || reloaded) return;
    reloaded = true;
    reload();
  });

  // A first install has no running version to replace, so there is nothing to announce.
  if (container.controller && registration.waiting) onUpdateReady(apply);

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && container.controller) onUpdateReady(apply);
    });
  });
}
