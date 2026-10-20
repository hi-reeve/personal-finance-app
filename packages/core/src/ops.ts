import type { Hlc } from "./hlc";

export type OpValue = string | number;

export type Entity =
  | "transaction"
  | "line"
  | "account"
  | "settings"
  | "category"
  | "tag"
  | "tagging"
  | "transfer";

/** One field of one record set to a value. The op log is a list of these. */
export interface Op {
  /** Unique op id, used to ignore an op seen twice. */
  id: string;
  hlc: Hlc;
  entity: Entity;
  recordId: string;
  field: string;
  value: OpValue;
}
