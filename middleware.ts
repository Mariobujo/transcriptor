import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, isValidSession } from "./lib/auth";

// /api/upload hace su propia comprobación (Vercel Blob le llama sin cookie al terminar la subida).
const PUBLIC_PATHS = ["/login", "/api/login", "/api/upload"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (await isValidSession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|ffmpeg/).*)"],
};
