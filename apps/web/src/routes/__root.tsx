import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { themeCss } from "@pfa/tokens";
import { APPEARANCE_INIT_SCRIPT, AppearanceProvider } from "../components/appearance";
import { HideAmountsProvider } from "../components/hide-amounts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Personal finance" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    styles: [{ children: themeCss() }],
    scripts: [{ children: APPEARANCE_INIT_SCRIPT }],
  }),
  component: () => (
    <Shell>
      <AppearanceProvider>
        <HideAmountsProvider>
          <Outlet />
        </HideAmountsProvider>
      </AppearanceProvider>
    </Shell>
  ),
});

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
