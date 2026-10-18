import { describe, expect, it, vi } from "vite-plus/test";
import { registerServiceWorker } from "./register";

/** Minimal stand-ins for the browser's service worker objects. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  posted: unknown[] = [];
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  setState(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  startUpdate(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeContainer extends EventTarget {
  controller: object | null;
  registration = new FakeRegistration();
  registered: string[] = [];
  constructor(controlled: boolean) {
    super();
    this.controller = controlled ? {} : null;
  }
  async register(url: string) {
    this.registered.push(url);
    return this.registration;
  }
  takeControl() {
    this.dispatchEvent(new Event("controllerchange"));
  }
}

const asContainer = (c: FakeContainer) => c as unknown as ServiceWorkerContainer;

describe("registerServiceWorker", () => {
  it("registers the service worker script", async () => {
    const container = new FakeContainer(false);
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady: vi.fn(),
      reload: vi.fn(),
    });
    expect(container.registered).toEqual(["/sw.js"]);
  });

  it("does nothing where service workers are unsupported", async () => {
    const onUpdateReady = vi.fn();
    await expect(
      registerServiceWorker({ container: undefined, onUpdateReady, reload: vi.fn() }),
    ).resolves.toBeUndefined();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("does not announce an update for the very first install", async () => {
    const container = new FakeContainer(false);
    const onUpdateReady = vi.fn();
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const worker = new FakeWorker();
    container.registration.startUpdate(worker);
    worker.setState("installed");
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("announces an update once a new version has installed behind a running one", async () => {
    const container = new FakeContainer(true);
    const onUpdateReady = vi.fn();
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const worker = new FakeWorker();
    container.registration.startUpdate(worker);
    worker.setState("installing");
    expect(onUpdateReady).not.toHaveBeenCalled();
    worker.setState("installed");
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("announces an update that was already waiting from an earlier visit", async () => {
    const container = new FakeContainer(true);
    container.registration.waiting = new FakeWorker();
    const onUpdateReady = vi.fn();
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady,
      reload: vi.fn(),
    });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("does not switch or reload until the user applies the update", async () => {
    const container = new FakeContainer(true);
    const reload = vi.fn();
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady: vi.fn(),
      reload,
    });

    const worker = new FakeWorker();
    container.registration.startUpdate(worker);
    worker.setState("installed");
    expect(worker.posted).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("applies the update on request: tells the waiting worker to take over, then reloads once", async () => {
    const container = new FakeContainer(true);
    const reload = vi.fn();
    let apply: () => void = () => {};
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady: (fn) => {
        apply = fn;
      },
      reload,
    });
    const worker = new FakeWorker();
    container.registration.waiting = worker;
    container.registration.startUpdate(worker);
    worker.setState("installed");

    apply();
    expect(worker.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reload).not.toHaveBeenCalled();

    container.takeControl();
    container.takeControl();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on a control change the user did not ask for", async () => {
    const container = new FakeContainer(true);
    const reload = vi.fn();
    await registerServiceWorker({
      container: asContainer(container),
      onUpdateReady: vi.fn(),
      reload,
    });
    container.takeControl();
    expect(reload).not.toHaveBeenCalled();
  });
});
