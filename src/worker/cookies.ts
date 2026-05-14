import type { Context } from "hono";

/**
 * Minimal cookie helpers. We don't pull in `hono/cookie` because the API
 * surface is tiny and these defaults (HttpOnly, Secure, Lax, 30d) are
 * exactly what we need for the workspace-identity cookies.
 */

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function setCookie(c: Context, name: string, value: string): void {
  const cookie = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ].join("; ");
  c.header("Set-Cookie", cookie, { append: true });
}

export function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v ? decodeURIComponent(v) : "";
  }
  return undefined;
}
