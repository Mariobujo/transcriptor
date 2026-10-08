import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

const LANGUAGES = new Set(["es", "en", "fr", "pt", "it", "de", "ca", "multi"]);

type DgSentence = { text: string; start: number; end: number };
type DgParagraph = { speaker?: number; start: number; end: number; sentences: DgSentence[] };

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Falta DEEPGRAM_API_KEY en el servidor." }, { status: 500 });
  }

  let url = "";
  let language = "es";
  try {
    const body = await req.json();
    url = String(body?.url ?? "");
    language = LANGUAGES.has(body?.language) ? body.language : "es";
  } catch {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  // Solo aceptamos URLs de nuestro propio Vercel Blob (evita usar el endpoint como proxy abierto).
  let host = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    if (parsed.protocol !== "https:") throw new Error("protocolo");
  } catch {
    return NextResponse.json({ error: "URL de audio no válida." }, { status: 400 });
  }
  if (!host.endsWith(".blob.vercel-storage.com")) {
    return NextResponse.json({ error: "El audio debe estar en Vercel Blob." }, { status: 400 });
  }

  const params = new URLSearchParams({
    model: "nova-3",
    language,
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    diarize: "true",
    utterances: "true",
  });

  try {
    const dg = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!dg.ok) {
      const detail = await dg.text().catch(() => "");
      return NextResponse.json(
        { error: `Deepgram respondió ${dg.status}. ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const json = await dg.json();
    const alt = json?.results?.channels?.[0]?.alternatives?.[0];
    if (!alt) {
      return NextResponse.json({ error: "Deepgram no devolvió transcripción." }, { status: 502 });
    }

    const rawParagraphs: DgParagraph[] = alt.paragraphs?.paragraphs ?? [];
    const paragraphs = rawParagraphs.map((p) => ({
      speaker: p.speaker ?? 0,
      start: p.start,
      end: p.end,
      text: p.sentences.map((s) => s.text).join(" "),
    }));
    const sentences = rawParagraphs.flatMap((p) =>
      p.sentences.map((s) => ({ speaker: p.speaker ?? 0, start: s.start, end: s.end, text: s.text })),
    );

    return NextResponse.json({
      text: alt.transcript as string,
      paragraphs,
      sentences,
      duration: json?.metadata?.duration ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: `Error al transcribir: ${(error as Error).message}` }, { status: 500 });
  } finally {
    // Privacidad y coste: el audio se borra siempre, haya ido bien o mal.
    await del(url).catch(() => {});
  }
}
