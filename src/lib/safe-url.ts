// A link that came from shared state -- anybody in a room can write an item's
// data, not only through this interface -- is only used if it goes to a web
// page. Anything else (javascript:, data:, a file on the machine) is dropped.

export function webUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
