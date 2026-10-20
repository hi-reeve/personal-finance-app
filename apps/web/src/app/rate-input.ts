import { normalizeRate, type NumberFormat } from "@pfa/core";

/** Reads a rate typed in the user's number format into the plain decimal text core stores. */
export function parseRateInput(text: string, numberFormat: NumberFormat): string | undefined {
  const plain =
    numberFormat === "dot-comma"
      ? text.trim().replaceAll(".", "").replace(",", ".")
      : text.trim().replaceAll(",", "");
  return normalizeRate(plain);
}

/** Shows plain rate text with the user's decimal separator. */
export function formatRateInput(rate: string, numberFormat: NumberFormat): string {
  return numberFormat === "dot-comma" ? rate.replace(".", ",") : rate;
}
