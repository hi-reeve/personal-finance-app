export interface RegisterOptions {
  /** The browser's service worker container, or undefined where unsupported. */
  container: ServiceWorkerContainer | undefined;
  /** Called when a newer version is ready. `apply` switches to it and reloads. */
  onUpdateReady: (apply: () => void) => void;
  reload: () => void;
}

export interface ServiceWorkerHandle {
  /** Ask the browser to look for a newer service worker now. */
  checkForUpdate: () => Promise<void>;
}

const SCRIPT_URL = "/sw.js";

/**
 * Registers the service worker and reports updates. A new version never takes over by itself:
 * it waits until the user asks, so an open session is never switched underneath them.
 */
export async function registerServiceWorker({
  container,
  onUpdateReady,
  reload,
}: RegisterOptions): Promise<ServiceWorkerHandle | undefined> {
  if (!container) return undefined;

  const registration = await container.register(SCRIPT_URL);
  // A page with no running version is being claimed for the first time; that is not an update.
  const wasControlled = container.controller !== null;
  let applying = false;
  let reloaded = false;

  const tellToTakeOver = (worker: ServiceWorker) => worker.postMessage({ type: "SKIP_WAITING" });

  const apply = () => {
    applying = true;
    const { waiting, installing } = registration;
    if (waiting) {
      tellToTakeOver(waiting);
    } else if (installing) {
      // Only a waiting worker can be told to take over, so wait for it to finish installing.
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") tellToTakeOver(installing);
      });
    }
  };

  container.addEventListener("controllerchange", () => {
    if (applying) {
      if (!reloaded) {
        reloaded = true;
        reload();
      }
    } else if (wasControlled) {
      // Another tab applied an update. This tab keeps running its old version until the user reloads.
      onUpdateReady(reload);
    }
  });

  if (wasControlled && registration.waiting) onUpdateReady(apply);

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && container.controller) onUpdateReady(apply);
    });
  });

  return { checkForUpdate: () => registration.update().then(() => undefined) };
}
