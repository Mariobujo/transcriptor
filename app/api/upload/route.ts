import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { COOKIE_NAME, isValidSession } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  // Solo la petición que genera el token necesita sesión; el aviso de "subida completada"
  // lo envía Vercel Blob sin cookie.
  if (body.type === "blob.generate-client-token") {
    const ok = await isValidSession(req.cookies.get(COOKIE_NAME)?.value);
    if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["audio/*", "video/*", "application/octet-stream"],
        maximumSizeInBytes: 3 * 1024 * 1024 * 1024, // 3 GB (por si falla la extracción en el navegador)
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Nada que hacer: el cliente continúa solo con /api/transcribe.
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
