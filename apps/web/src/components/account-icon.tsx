import type { AccountColor, AccountIcon } from "@pfa/core";

const PATHS: Record<AccountIcon, string> = {
  wallet: "M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2",
  bank: "M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  phone: "M8 3h8v18H8zM11 18h2",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  piggy: "M5 12a7 6 0 0 1 14 0v3l-3 2v2h-3v-2h-3v2H8v-2l-3-2zM15 10h.01",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
};

/** The Account's icon in its colour. The colour comes from the theme, so it holds contrast in dark mode. */
export function AccountGlyph({ icon, color }: { icon?: AccountIcon; color?: AccountColor }) {
  return (
    <span data-accent={color} className="text-accent">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={PATHS[icon ?? "wallet"]} />
      </svg>
    </span>
  );
}
