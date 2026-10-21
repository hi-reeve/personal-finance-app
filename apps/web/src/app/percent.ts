import type { NumberFormat } from "@pfa/core";

/** Basis points as a percentage with at most one decimal: 9180 is "91.8", 5000 is "50". */
export function formatPercent(basisPoints: number, numberFormat: NumberFormat): string {
  const tenths = Math.round(basisPoints / 10);
  const whole = Math.trunc(tenths / 10);
  const fraction = Math.abs(tenths % 10);
  const sign = tenths < 0 && whole === 0 ? "-" : "";
  const text = fraction === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
  return numberFormat === "dot-comma" ? text.replace(".", ",") : text;
}
