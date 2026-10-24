import { randomInt } from "node:crypto";

// No look-alike characters: no 0/O, 1/I/L.
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export const CODE_TTL_DAYS = 7;

/** e.g. "LGT-4827". The prefix is a hint for humans only; access comes from the database row. */
export function generateCode(hint?: string): string {
  const fromHint = (hint ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .split("")
    .filter((c) => LETTERS.includes(c));
  let prefix = fromHint.slice(0, 3).join("");
  while (prefix.length < 3) prefix += LETTERS[randomInt(LETTERS.length)];
  let digits = "";
  for (let i = 0; i < 4; i++) digits += DIGITS[randomInt(DIGITS.length)];
  return `${prefix}-${digits}`;
}

/** Accepts "lgt 4827", "LGT4827", "lgt-4827". */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === 7) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return input.toUpperCase().trim();
}

export function codeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
