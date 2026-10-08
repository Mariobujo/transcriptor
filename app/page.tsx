"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { extractAudio } from "../lib/extract-audio";
import { buildSrt, buildText, downloadFile, TranscriptResult } from "../lib/format";

type Phase = "idle" | "extracting" | "uploading" | "transcribing" | "done" | "error";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "ca", label: "Catalán" },
  { value: "fr", label: "Francés" },
  { value: "pt", label: "Portugués" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Alemán" },
  { value: "multi", label: "Varios idiomas mezclados" },
];

const SMALL_AUDIO_LIMIT = 30 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("es");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const preparedRef = useRef<File | null>(null);

  const busy = phase === "extracting" || phase === "uploading" || phase === "transcribing";

  // Cronómetro mientras se transcribe.
  useEffect(() => {
    if (phase !== "transcribing") return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Avisar si intenta cerrar la pestaña a mitad de proceso.
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  const text = useMemo(
    () => (result ? buildText(result, { speakers: showSpeakers, timestamps: showTimestamps }) : ""),
    [result, showSpeakers, showTimestamps],
  );

  const hasSpeakers = useMemo(
    () => (result ? new Set(result.paragraphs.map((p) => p.speaker)).size > 1 : false),
    [result],
  );

  function pickFile(f: File | undefined | null) {
    if (!f || busy) return;
    preparedRef.current = null;
    setFile(f);
    setPhase("idle");
    setError("");
    setNotice("");
    setResult(null);
    setProgress(0);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function run() {
    if (!file) return;
    setError("");
    setNotice("");
    setResult(null);

    try {
      // 1) Extraer audio en el navegador (si hace falta)
      let toUpload = preparedRef.current;
      if (!toUpload) {
        const isSmallAudio = file.type.startsWith("audio/") && file.size < SMALL_AUDIO_LIMIT;
        if (isSmallAudio) {
          toUpload = file;
        } else {
          setPhase("extracting");
          setProgress(0);
          setStatus("Preparando…");
          try {
            toUpload = await extractAudio(file, setProgress, setStatus);
          } catch (e) {
            console.error("Fallo al extraer audio:", e);
            toUpload = file;
            setNotice(
              "No se pudo extraer el audio en este navegador; se subirá el archivo original (tardará más).",
            );
          }
        }
        preparedRef.current = toUpload;
      }

      // 2) Subida directa a Vercel Blob
      setPhase("uploading");
      setProgress(0);
      setStatus("Subiendo…");
      const blob = await upload(toUpload.name, toUpload, {
        access: "public",
        handleUploadUrl: "/api/upload",
        multipart: true,
        contentType: toUpload.type || "application/octet-stream",
        onUploadProgress: ({ percentage }) => setProgress(percentage / 100),
      });

      // 3) Transcripción
      setPhase("transcribing");
      setStatus("Transcribiendo…");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, language }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setResult(data as TranscriptResult);
      setPhase("done");
    } catch (e) {
      const message = (e as Error).message || "Error desconocido";
      setError(
        message.includes("No autorizado") || message.includes("401")
          ? "La sesión ha caducado. Recarga la página e inicia sesión de nuevo."
          : message,
      );
      setPhase("error");
    }
  }

  function reset() {
    preparedRef.current = null;
    setFile(null);
    setResult(null);
    setPhase("idle");
    setError("");
    setNotice("");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  const baseName = (file?.name ?? "transcripcion").replace(/\.[^.]+$/, "");

  const steps: { key: Phase; label: string }[] = [
    { key: "extracting", label: "1. Extraer audio" },
    { key: "uploading", label: "2. Subir" },
    { key: "transcribing", label: "3. Transcribir" },
  ];
  const order: Phase[] = ["extracting", "uploading", "transcribing"];

  return (
    <main className="page">
      <div className="container">
        <div className="header">
          <h1>Transcriptor</h1>
          <p>Sube un audio o vídeo y descarga el texto.</p>
        </div>

        <div className="card stack">
          {phase !== "done" && (
            <>
              {!file ? (
                <div
                  className={`dropzone${dragging ? " drag" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                >
                  <strong>Arrastra aquí tu archivo o haz clic para elegirlo</strong>
                  <span>Vídeo o audio (mp4, mov, mkv, mp3, m4a, wav…). Se aceptan archivos grandes.</span>
                </div>
              ) : (
                <div className="file-chip">
                  <span className="name">{file.name}</span>
                  <span className="size">{formatBytes(file.size)}</span>
                  {!busy && (
                    <button type="button" onClick={reset}>
                      Quitar
                    </button>
                  )}
                </div>
              )}

              <input
                ref={inputRef}
                type="file"
                accept="audio/*,video/*,.mkv,.m4a,.mp3,.wav,.ogg,.flac,.mp4,.mov,.webm,.avi"
                hidden
                onChange={(e) => pickFile(e.target.files?.[0])}
              />

              <label className="field">
                Idioma del audio
                <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="primary" type="button" onClick={run} disabled={!file || busy}>
                {phase === "error" ? "Reintentar" : "Transcribir"}
              </button>
            </>
          )}

          {busy && (
            <div className="stack">
              <div className="steps">
                {steps.map((s) => {
                  const idx = order.indexOf(s.key);
                  const cur = order.indexOf(phase);
                  const cls = idx < cur ? "done" : idx === cur ? "active" : "";
                  return (
                    <span key={s.key} className={`step ${cls}`}>
                      {s.label}
                    </span>
                  );
                })}
              </div>
              <div>
                <div className="progress-label">
                  <span>{status}</span>
                  <span className="muted">
                    {phase === "transcribing"
                      ? formatElapsed(elapsed)
                      : phase === "extracting" && progress === 0
                        ? ""
                        : `${Math.round(progress * 100)}%`}
                  </span>
                </div>
                <div
                  className={`bar${
                    phase === "transcribing" || (phase === "extracting" && progress === 0) ? " indeterminate" : ""
                  }`}
                >
                  <div style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
              <div className="notice">No cierres esta pestaña hasta que termine.</div>
            </div>
          )}

          {notice && <div className="notice">{notice}</div>}
          {error && <div className="error">{error}</div>}

          {phase === "done" && result && (
            <div className="stack">
              <div className="toggles">
                {hasSpeakers && (
                  <label>
                    <input
                      type="checkbox"
                      checked={showSpeakers}
                      onChange={(e) => setShowSpeakers(e.target.checked)}
                    />
                    Separar por hablantes
                  </label>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={showTimestamps}
                    onChange={(e) => setShowTimestamps(e.target.checked)}
                  />
                  Mostrar tiempos
                </label>
              </div>

              <div className="result-text">{text}</div>

              <div className="row">
                <button className="primary" type="button" onClick={() => downloadFile(`${baseName}.txt`, text)}>
                  Descargar .txt
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(`${baseName}.srt`, buildSrt(result, showSpeakers), "application/x-subrip")
                  }
                >
                  Descargar .srt
                </button>
                <button type="button" onClick={copy}>
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
                <button type="button" onClick={reset}>
                  Nueva transcripción
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="footer-note">
          El audio se procesa y se borra al terminar. No se guarda ninguna transcripción en el servidor.
        </p>
      </div>
    </main>
  );
}
