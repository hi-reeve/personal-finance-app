import { useHideAmounts } from "./hide-amounts";

export type Direction = "income" | "expense" | "neutral";

interface AmountProps {
  direction: Direction;
  /** `list` is plain ink; `total` carries the income or expense colour. */
  variant: "list" | "total";
  /** The amount already formatted for display, for example "Rp 25.000". */
  formatted: string;
}

const LABEL: Record<Direction, string> = { income: "Income", expense: "Expense", neutral: "" };
const SIGN: Record<Direction, string> = { income: "+", expense: "−", neutral: "" };
const HIDDEN_DOTS = "••••••";

function DirectionIcon({ direction }: { direction: Exclude<Direction, "neutral"> }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {direction === "income" ? <path d="M4 12 12 4M5 4h7v7" /> : <path d="M4 4l8 8M12 5v7H5" />}
    </svg>
  );
}

/**
 * The one component every money figure goes through. Direction is always shown by sign and icon,
 * never by colour alone, and hide-amounts is honoured here so no screen can forget it.
 */
export function Amount({ direction, variant, formatted }: AmountProps) {
  const { hidden } = useHideAmounts();
  const tone = variant === "total" && direction !== "neutral" ? direction : undefined;
  const toneClass =
    tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-ink";
  const weight = variant === "total" ? "font-semibold" : "font-normal";

  if (hidden) {
    return (
      <span role="img" aria-label="Amount hidden" className="tabular-nums text-ink">
        {HIDDEN_DOTS}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={`${LABEL[direction]} ${formatted}`.trim()}
      data-tone={tone}
      className={`inline-flex items-center gap-1 tabular-nums ${toneClass} ${weight}`}
    >
      {direction !== "neutral" && <DirectionIcon direction={direction} />}
      {direction !== "neutral" && <span aria-hidden="true">{SIGN[direction]}</span>}
      <span aria-hidden="true">{formatted}</span>
    </span>
  );
}
