import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { PwaBanner } from "../pwa/pwa-banner";
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
  }),
  shellComponent: Shell,
  component: Root,
});

function Root() {
  const pwa = usePwa();
  return (
    <>
      <PwaBanner
        updateReady={pwa.updateReady}
        canInstall={pwa.canInstall}
        onApply={pwa.applyUpdate}
        onInstall={pwa.install}
      />
      <Outlet />
    </>
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
