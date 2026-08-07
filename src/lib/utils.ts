import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAgentDisplayName(authorOrPath?: string): string {
  if (!authorOrPath) return "Assistant";
  const leaf = authorOrPath.split("/").pop() || authorOrPath;
  const clean = leaf.replace(/@\d+$/, "").replace(/[_-]/g, " ").trim();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}
