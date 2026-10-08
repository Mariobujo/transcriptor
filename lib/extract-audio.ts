// Extrae el audio de un vídeo/audio EN EL NAVEGADOR con ffmpeg.wasm (versión de un solo hilo,
// no necesita cabeceras especiales). Los ficheros de la librería están en /public/ffmpeg y el
// núcleo (~32 MB) se descarga de un CDN la primera vez.

/* eslint-disable @typescript-eslint/no-explicit-any */

const CORE_VERSION = "0.12.10";
const CORE_BASES = [
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
];

let scriptPromise: Promise<any> | null = null;
let ffmpegInstance: any = null;

function loadScript(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Solo en el navegador"));
  if ((window as any).FFmpegWASM) return Promise.resolve((window as any).FFmpegWASM);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/ffmpeg/ffmpeg.js";
    s.onload = () => resolve((window as any).FFmpegWASM);
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar ffmpeg"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function toBlobURL(url: string, mime: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mime }));
}

async function getFFmpeg(onStatus?: (msg: string) => void): Promise<any> {
  if (ffmpegInstance) return ffmpegInstance;
  const lib = await loadScript();
  const ffmpeg = new lib.FFmpeg();

  let lastError: unknown = null;
  for (const base of CORE_BASES) {
    try {
      onStatus?.("Descargando el conversor (solo la primera vez)…");
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("No se pudo cargar el conversor");
}

export async function extractAudio(
  file: File,
  onProgress: (ratio: number) => void,
  onStatus?: (msg: string) => void,
): Promise<File> {
  const ffmpeg = await getFFmpeg(onStatus);
  onStatus?.("Extrayendo el audio…");

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const inputName = `input.${ext}`;
  // Se renombra con un nombre seguro; File(Blob) no copia los datos.
  const safeFile = new File([file], inputName, { type: file.type });

  const mountDir = "/mnt";
  await ffmpeg.createDir(mountDir).catch(() => {});
  await ffmpeg.mount("WORKERFS", { files: [safeFile] }, mountDir);

  const handler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on("progress", handler);

  try {
    const code = await ffmpeg.exec([
      "-i",
      `${mountDir}/${inputName}`,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      "output.mp3",
    ]);
    if (code !== 0) throw new Error(`ffmpeg terminó con código ${code}`);

    const data = (await ffmpeg.readFile("output.mp3")) as Uint8Array;
    if (!data || data.length < 1024) throw new Error("El audio extraído está vacío");

    const baseName = file.name.replace(/\.[^.]+$/, "") || "audio";
    // Copia a un ArrayBuffer propio para no retener memoria del worker.
    return new File([new Uint8Array(data)], `${baseName}.mp3`, { type: "audio/mpeg" });
  } finally {
    ffmpeg.off("progress", handler);
    await ffmpeg.deleteFile("output.mp3").catch(() => {});
    await ffmpeg.unmount(mountDir).catch(() => {});
  }
}
