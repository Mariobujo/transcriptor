# Transcriptor

Web para transcribir audios o vídeos largos. El navegador extrae el audio (ffmpeg.wasm), lo sube directo a Vercel Blob, Deepgram (Nova-3) lo transcribe en ~1 minuto y se descarga en .txt o .srt. El audio se borra al terminar.

## Desplegar en Vercel (5 pasos)

1. Descomprime el zip y abre una terminal en la carpeta.
2. `npm i -g vercel` y luego `vercel login`.
3. `vercel link` (crea el proyecto, acepta los valores por defecto).
4. Crea el almacenamiento: en vercel.com → tu proyecto → **Storage → Create → Blob → acceso Public** y conéctalo al proyecto. Esto añade solo `BLOB_READ_WRITE_TOKEN`.
5. Añade las variables (Settings → Environment Variables, entorno Production) o por CLI:
   ```
   vercel env add DEEPGRAM_API_KEY production
   vercel env add APP_PASSWORD production
   vercel env add SESSION_SECRET production
   ```
   - `DEEPGRAM_API_KEY`: de console.deepgram.com → API Keys.
   - `APP_PASSWORD`: la contraseña que le darás a tu amiga.
   - `SESSION_SECRET`: genera una con `openssl rand -hex 32`.

Despliega con `vercel --prod`. Si más tarde cambias variables, vuelve a desplegar.

## Dominio propio

Vercel → proyecto → Settings → Domains → añade p. ej. `transcribir.tudominio.com` y crea en tu DNS el CNAME que te indica.

## Local

```
cp .env.example .env.local   # rellena los valores
npm install
npm run dev
```

## Notas

- Límite de la función de transcripción: 300 s (sobra para audios de varias horas con Deepgram).
- Si el navegador no puede extraer el audio, sube el archivo original (más lento).
- Si alguien cierra la pestaña tras subir pero antes de transcribir, el audio queda en Blob; bórralo desde Storage si quieres.
