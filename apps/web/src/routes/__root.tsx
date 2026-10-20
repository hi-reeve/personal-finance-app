import { useEffect, type ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { themeCss } from "@pfa/tokens";
import { APPEARANCE_INIT_SCRIPT, AppearanceProvider } from "../components/appearance";
import { ActivityFilterProvider } from "../app/activity-filter-state";
import { AppGate } from "../app/app-gate";
import { AppProvider } from "../app/app-provider";
import { LocalOnlyBanner } from "../app/local-only-banner";
import { AppShell } from "../components/app-shell";
import { HideAmountsProvider } from "../components/hide-amounts";
import { LocaleProvider } from "../components/locale";
import { PwaBanner } from "../pwa/pwa-banner";
import { requestPersistence } from "../storage/persistence";
import { usePwa } from "../pwa/use-pwa";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#a84d31" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Finance" },
      { title: "Personal finance" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/icons/icon-192.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
    styles: [{ children: themeCss() }],
    scripts: [{ children: APPEARANCE_INIT_SCRIPT }],
  }),
  shellComponent: Shell,
  component: Root,
});

function Root() {
  const pwa = usePwa();
  // Ask once at start-up so the browser can protect our data from the first record on.
  useEffect(() => {
    void requestPersistence();
  }, []);
  return (
    <AppearanceProvider>
      <LocaleProvider>
        <HideAmountsProvider>
          <PwaBanner
            updateReady={pwa.updateReady}
            canInstall={pwa.canInstall}
            onApply={pwa.applyUpdate}
            onInstall={pwa.install}
          />
          <AppProvider>
            <ActivityFilterProvider>
              <AppGate>
                <AppShell>
                  <LocalOnlyBanner />
                  <Outlet />
                </AppShell>
              </AppGate>
            </ActivityFilterProvider>
          </AppProvider>
        </HideAmountsProvider>
      </LocaleProvider>
    </AppearanceProvider>
  );
}

function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
