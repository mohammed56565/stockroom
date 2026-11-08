import { fail } from "./errors";
import type { Row } from "@shared/types";

export function jsonObject(value: unknown, label = "Request"): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be a JSON object.`);
  return value as Row;
}

export async function requestBody(request: Request): Promise<Row> {
  const raw = await request.text();
  if (raw.length > 40000) fail("Request is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("Request contains invalid JSON.");
  }
  return jsonObject(parsed);
}

export const text = (v: unknown, label: string, max = 200): string => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    fail(`${label} is required (maximum ${max} characters).`);
  return (v as string).trim();
};
export const optional = (v: unknown, max = 1000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
export function quantity(v: unknown, allowZero = false) {
  if (typeof v !== "number" && typeof v !== "string")
    fail("Enter a valid quantity.");
  const n = Number(v);
  const scaled = Math.round(n * 1000);
  if (
    String(v).trim() === "" ||
    !Number.isFinite(n) ||
    n > 1e9 ||
    n < 0 ||
    (!allowZero && n === 0) ||
    Math.abs(n * 1000 - scaled) > 0.000001
  )
    fail("Quantity must be positive, with at most 3 decimal places.");
  return scaled;
}
export function email(v: unknown, required = false) {
  const s = required
    ? text(v, "Email", 254).toLowerCase()
    : optional(v, 254).toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    fail("Enter a valid email address.");
  return s;
}
