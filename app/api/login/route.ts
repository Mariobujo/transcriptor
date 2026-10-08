import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, safeEqual, sessionToken } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.APP_PASSWORD;
  const token = await sessionToken();
  if (!expectedPassword || !token) {
    return NextResponse.json(
      { error: "El servidor no tiene configurada la contraseña (APP_PASSWORD / SESSION_SECRET)." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    /* body vacío */
  }

  // Pequeña pausa para frenar la fuerza bruta.
  await new Promise((r) => setTimeout(r, 600));

  if (!safeEqual(password, expectedPassword)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
