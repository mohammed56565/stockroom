import type { Row } from "@shared/types";

export async function api(url: string, body?: Row): Promise<Row> {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Stockroom": "1" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data: Row = await res.json();
  if (!res.ok)
    throw new Error(typeof data.error === "string" ? data.error : "Unable to complete the request.");
  return data;
}
