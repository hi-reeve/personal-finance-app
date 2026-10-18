import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "./locale";
import {
  PHONE_LEFT,
  PHONE_RIGHT,
  RAIL,
  SIDEBAR_FOOTER,
  SIDEBAR_GROUPS,
  isCurrent,
  type Destination,
  type IconName,
} from "./nav-items";

const ICON_PATHS: Record<IconName, string> = {
  home: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
  activity: "M4 6h16M4 12h16M4 18h10",
  plan: "M4 5h16v14H4zM4 10h16M9 5v14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  accounts: "M3 8h18v11H3zM3 8l3-4h12l3 4M16 14h2",
  debts: "M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6",
  split: "M12 3v6M12 9 6 21M12 9l6 12",
  reports: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
  add: "M12 5v14M5 12h14",
};

function Icon({ name, size = 22 }: { name: IconName; size?: number | undefined }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CURRENT = "aria-[current=page]:font-semibold aria-[current=page]:text-accent";

function NavLink({
  destination,
  pathname,
  className,
  iconSize,
}: {
  destination: Destination;
  pathname: string;
  className: string;
  iconSize?: number;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLAnchorElement>(null);
  const current = isCurrent(destination, pathname);
  // Set on the element directly: the router decides `aria-current` from its own location, which is
  // stale on a deep link opened in the prerendered shell, and a Link prop cannot override that.
  useEffect(() => {
    if (current) ref.current?.setAttribute("aria-current", "page");
    else ref.current?.removeAttribute("aria-current");
  }, [current]);
  return (
    <Link ref={ref} to={destination.to} className={`${className} ${CURRENT} ${FOCUS}`}>
      <Icon name={destination.icon} size={iconSize} />
      <span>{t[destination.label]()}</span>
    </Link>
  );
}

function PhoneBar({ pathname, onAdd }: { pathname: string; onAdd: () => void }) {
  const { t } = useLocale();
  const tab = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-ink";
  return (
    <nav
      data-nav="phone"
      aria-label={t.nav_label()}
      className="fixed inset-x-0 bottom-0 z-20 flex items-end border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {PHONE_LEFT.map((d) => (
        <NavLink key={d.to} destination={d} pathname={pathname} className={tab} />
      ))}
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={onAdd}
          className={`-mt-6 mb-1 flex size-14 flex-col items-center justify-center rounded-full bg-accent text-on-accent shadow-lg ${FOCUS}`}
        >
          <Icon name="add" />
          <span className="text-[0.65rem] leading-none">{t.nav_add()}</span>
        </button>
      </div>
      {PHONE_RIGHT.map((d) => (
        <NavLink key={d.to} destination={d} pathname={pathname} className={tab} />
      ))}
    </nav>
  );
}

function Rail({ pathname }: { pathname: string }) {
  const { t } = useLocale();
  return (
    <nav
      data-nav="rail"
      aria-label={t.nav_label()}
      className="fixed inset-y-0 left-0 z-10 hidden w-24 flex-col items-stretch gap-1 border-r border-line bg-surface p-2 md:flex lg:hidden"
    >
      {RAIL.map((d) => (
        <NavLink
          key={d.to}
          destination={d}
          pathname={pathname}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-xs text-ink"
        />
      ))}
    </nav>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { t } = useLocale();
  const row = "flex min-h-11 items-center gap-3 rounded-lg px-3 text-ink";
  return (
    <nav
      data-nav="sidebar"
      aria-label={t.nav_label()}
      className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col justify-between border-r border-line bg-surface p-3 lg:flex"
    >
      <div className="flex flex-col gap-4">
        {SIDEBAR_GROUPS.map((group, index) => (
          <div key={index} className="flex flex-col gap-1">
            {group.heading && (
              <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t[group.heading]()}
              </h2>
            )}
            {group.items.map((d) => (
              <NavLink
                key={d.to}
                destination={d}
                pathname={pathname}
                className={row}
                iconSize={20}
              />
            ))}
          </div>
        ))}
      </div>
      <NavLink destination={SIDEBAR_FOOTER} pathname={pathname} className={row} iconSize={20} />
    </nav>
  );
}

function AddDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog.Root open={open} onOpenChange={(details) => onOpenChange(details.open)}>
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 z-30 bg-ink/40" />
        <Dialog.Positioner className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
          <Dialog.Content className="w-full rounded-t-2xl border border-line bg-surface p-5 text-ink shadow-xl md:max-w-md md:rounded-2xl">
            <Dialog.Title className="text-lg font-semibold">{t.add_transaction()}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-ink-muted">
              {t.add_placeholder()}
            </Dialog.Description>
            <Dialog.CloseTrigger
              className={`mt-4 min-h-11 rounded-lg border border-control px-4 ${FOCUS}`}
            >
              {t.add_close()}
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The path the browser is on. The router's own location stays at "/" on a deep link opened in the
 * prerendered shell until the first navigation, so this reads the browser and follows history.
 */
function useCurrentPath(): string {
  const { history } = useRouter();
  const [path, setPath] = useState("/");
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    sync();
    return history.subscribe(sync);
  }, [history]);
  return path;
}

/** Navigation frame for every screen: phone bar, tablet rail or desktop sidebar, plus Add. */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const pathname = useCurrentPath();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n") return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      setAdding(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh md:pl-24 lg:pl-64">
      <Rail pathname={pathname} />
      <Sidebar pathname={pathname} />
      <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-28">{children}</main>
      <PhoneBar pathname={pathname} onAdd={() => setAdding(true)} />
      <button
        type="button"
        aria-label={t.add_transaction()}
        onClick={() => setAdding(true)}
        className={`fixed right-6 bottom-6 z-20 hidden size-14 items-center justify-center gap-2 rounded-full bg-accent text-on-accent shadow-lg md:flex lg:h-14 lg:w-auto lg:px-5 ${FOCUS}`}
      >
        <Icon name="add" />
        <span className="hidden lg:inline">{t.add_transaction()}</span>
      </button>
      <AddDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
