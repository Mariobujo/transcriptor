// Autenticación mínima por contraseña compartida. Funciona en Edge (middleware) y Node.

export const COOKIE_NAME = "tx_session";

export async function sessionToken(): Promise<string> {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) return "";
  const data = new TextEncoder().encode(`${password}::${secret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await sessionToken();
  if (!expected) return false; // sin variables configuradas, todo queda cerrado
  return safeEqual(cookieValue, expected);
}
