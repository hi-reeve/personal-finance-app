/** Today's calendar date on this device, as `YYYY-MM-DD`. Local time, not UTC. */
export function today(now: Date = new Date()): string {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}
