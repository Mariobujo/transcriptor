export type Paragraph = { speaker: number; start: number; end: number; text: string };
export type Sentence = Paragraph;

export type TranscriptResult = {
  text: string;
  paragraphs: Paragraph[];
  sentences: Sentence[];
  duration: number | null;
};

function pad(n: number, size = 2) {
  return String(n).padStart(size, "0");
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

export function buildText(
  r: TranscriptResult,
  opts: { speakers: boolean; timestamps: boolean },
): string {
  if (!r.paragraphs.length) return r.text;

  const multiSpeaker = new Set(r.paragraphs.map((p) => p.speaker)).size > 1;

  if (!opts.speakers || !multiSpeaker) {
    return r.paragraphs
      .map((p) => (opts.timestamps ? `[${clock(p.start)}] ${p.text}` : p.text))
      .join("\n\n");
  }

  return r.paragraphs
    .map((p) => {
      const stamp = opts.timestamps ? `[${clock(p.start)}] ` : "";
      return `${stamp}Hablante ${p.speaker + 1}: ${p.text}`;
    })
    .join("\n\n");
}

export function buildSrt(r: TranscriptResult, speakers: boolean): string {
  const multiSpeaker = new Set(r.sentences.map((s) => s.speaker)).size > 1;
  return r.sentences
    .map((s, i) => {
      const label = speakers && multiSpeaker ? `Hablante ${s.speaker + 1}: ` : "";
      return `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${label}${s.text}\n`;
    })
    .join("\n");
}

export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob(["﻿" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
