import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete the request.";
}
