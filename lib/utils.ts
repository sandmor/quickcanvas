import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { hash as ohash } from "ohash";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function stableHash(payload: any): Promise<string> {
  // ohash already canonicalizes (stable stringify). Returns short hex-like hash.
  return ohash(payload);
}

