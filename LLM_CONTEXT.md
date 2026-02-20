# Song-Toolkit – LLM-Readable Implementation Notes

This document summarizes what was built, how it works, issues encountered, and how to run and extend the project. It is intended for future maintainers and LLM context.

---

## 1. Project Overview

**Song-Toolkit** is a REST API that:

- Accepts uploaded MP3 or WAV files via `POST /convert`.
- Converts audio from standard tuning (A4 = 440 Hz) to 432 Hz using FFmpeg.
- Preserves original duration (no tempo change).
- Returns the converted file for download.

**Stack:** Node.js, TypeScript, Express, Multer (uploads), CORS, FFmpeg/ffprobe via `child_process.spawn`. No heavy Node audio libraries.

**Target:** Debian Linux home server (e.g. `192.168.31.10`), development over SSH, optional Docker.

---

## 2. Architecture

- **Single endpoint:** `POST /convert` with `multipart/form-data`, field name `file`.
- **Flow:** Client → Express → Multer (disk storage) → file-type validation → FFmpeg service (ffprobe for sample rate, then ffmpeg with pitch filter) → stream response → cleanup temp files.
- **Pitch math:** Ratio `432/440`; duration restored with `atempo=440/432`. Filter chain: `aformat=channel_layouts=stereo`, `asetrate`, `aresample`, `atempo`.
- **Security:** No shell for FFmpeg; spawn with array args only; input/output paths validated to stay under the temp dir; only `.mp3`/`.wav` and allowed MIME types accepted; file size limit (default 50MB).

---

## 3. Project Structure

```
Song-Toolkit/
├── src/
│   ├── index.ts           # Entry: ensure temp dir, start server on 0.0.0.0
│   ├── app.ts             # Express, CORS, request logging, routes, 404, error handler
│   ├── config.ts          # PORT, UPLOAD_MAX_BYTES, allowed MIMEs/extensions, tempDir, ffmpeg timeout
│   ├── routes/convert.ts  # POST / (mounted at /convert): upload → validate → convert → stream → cleanup
│   ├── services/ffmpeg.ts # getSampleRate (ffprobe), convertTo432Hz (ffmpeg), ensureTempDir
│   ├── middleware/upload.ts # Multer config + validateAudioFile (MIME + extension check)
│   └── utils/logger.ts    # Structured JSON logs (timestamp, level, message, meta)
├── temp/                  # Runtime temp files (gitignored)
├── dist/                  # Compiled JS (gitignored)
├── package.json           # type: "module", scripts: dev, build, start, clean
├── tsconfig.json          # ES2022, NodeNext, outDir dist, rootDir src
├── Dockerfile             # Multi-stage: build TS, then node:20-slim + ffmpeg, chown /app to node
├── .dockerignore
├── README.md              # User-facing setup, curl, deploy, Docker
└── LLM_CONTEXT.md         # This file
```

---

## 4. Key Implementation Details

### 4.1 Upload and validation

- **Multer:** `diskStorage` in `config.tempDir`, filename `upload-<16-byte-hex>.<ext>`. Extension from MIME or `path.extname(originalname)`; fallback `.bin` if unknown.
- **Validation (after Multer):** File is accepted only if:
  - Extension is `.mp3` or `.wav`, and
  - MIME is in `config.allowedMimes` **or** starts with `audio/` **or** is `application/octet-stream`.
- Invalid uploads: file is deleted and `400` with `{"error":"Invalid file type. Only MP3 and WAV are allowed."}`.
- **Allowed MIMEs in config:** `audio/mpeg`, `audio/mp3`, `audio/x-mpeg`, `audio/mpeg3`, `audio/wav`, `audio/wave`, `audio/x-wav`. Validation is intentionally lenient (any `audio/*` or octet-stream with correct extension) so curl and various clients work.

### 4.2 FFmpeg service

- **Path safety:** All input/output paths must resolve under `config.tempDir` (no path traversal).
- **ffprobe:** `spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", inputPath])`. Parse JSON for first stream with `codec_type === "audio"`, read `sample_rate`.
- **FFmpeg filter:** `aformat=channel_layouts=stereo,asetrate=<setrate>,aresample=<sr>,atempo=440/432` where `setrate = round(sr * 432/440)` and `sr` is the probed sample rate. Output format matches input (mp3 → libmp3lame, wav → pcm_s16le).
- **Execution:** `spawn("ffmpeg", [...args])`, no shell. Timeout 120s; on timeout or non-zero exit, process killed and Promise rejects with stderr in message.

### 4.3 Convert route and cleanup

- **Cleanup:** Both uploaded file and converted output are deleted: on stream `end`, on `res.on("close")` (client abort), and in error path. Uses `fs.unlink` in callback to avoid blocking.
- **Response:** On success, `Content-Disposition: attachment; filename="converted-432.<ext>"`, appropriate `Content-Type`, body is `fs.createReadStream(outputPath).pipe(res)`.

### 4.4 Express app

- **CORS:** `cors()` (allow all; suitable for local intranet).
- **Request logging:** Logs `method`, `path`, `statusCode`, `durationMs` on `res.on("finish")`.
- **Errors:** 413 for Multer `LIMIT_FILE_SIZE`; 500 for unhandled errors; 404 for unknown routes.

---

## 5. Issues Encountered and Fixes

### 5.1 400 Bad Request on upload (MIME type)

- **Symptom:** `curl -F "file=@audio.mp3"` returned 400 with body length 60 (invalid file type).
- **Cause:** Validation required exact MIME match. Some clients (e.g. curl on macOS) send MIME types like `audio/mp3`, `audio/x-mpeg`, or `application/octet-stream` for MP3s.
- **Fix:** (1) Added more MIMEs in `config.allowedMimes`: `audio/mp3`, `audio/x-mpeg`, `audio/mpeg3`. (2) Relaxed validation: accept file if extension is `.mp3` or `.wav` and MIME is in list **or** starts with `audio/` **or** is `application/octet-stream`. See `src/middleware/upload.ts` and `src/config.ts`.

### 5.2 Docker: permission denied mkdir '/app/temp'

- **Symptom:** Container failed to start with `EACCES: permission denied, mkdir '/app/temp'`.
- **Cause:** Dockerfile switched to `USER node` but `/app` was owned by root; node user could not create `temp`.
- **Fix:** In Dockerfile run stage, added `RUN mkdir -p /app/temp && chown -R node:node /app` before `USER node`. See `Dockerfile`.

### 5.3 Port already allocated (3000, 3005, etc.)

- **Symptom:** `docker run -p 3005:3000 ...` failed with "Bind for 0.0.0.0:3005 failed: port is already allocated."
- **Cause:** Another process or an existing container was already bound to that host port.
- **Resolution (no code change):** (1) Use a different host port, e.g. `-p 3010:3000`. (2) Or find and stop the process: `sudo lsof -i :3005` or `sudo ss -tlnp | grep 3005`. If it’s Docker: `sudo docker ps` then `sudo docker stop <id>`. One-liner to stop container on 3005: `sudo docker ps -q --filter "publish=3005" | xargs -r sudo docker stop`.

---

## 6. Running and Testing

### 6.1 Local / server (Node)

```bash
npm ci
npm run build
npm start
# or for dev: npm run dev
```

Server listens on `0.0.0.0:PORT` (default 3000) so it’s reachable on LAN at `http://192.168.31.10:3000`.

### 6.2 Docker

```bash
docker build -t song-toolkit .
docker run -p 3005:3000 --rm -d song-toolkit
# API at http://192.168.31.10:3005/convert
```

To replace a running container on the same port: stop the existing container first (see 5.3).

### 6.3 Curl (from another machine, e.g. Mac)

```bash
# MP3
curl -v -F "file=@/path/to/audio.mp3" -o converted.mp3 http://192.168.31.10:3005/convert

# WAV
curl -v -F "file=@/path/to/audio.wav" -o converted.wav http://192.168.31.10:3005/convert
```

Success: `HTTP/1.1 200 OK`, `Content-Disposition: attachment; filename="converted-432.mp3"` (or `.wav`), body is the converted file. No file or wrong type: 400. File too large: 413. Conversion/FFmpeg error: 500.

---

## 7. Environment

| Variable            | Default     | Description              |
|---------------------|------------|--------------------------|
| `PORT`              | 3000       | HTTP listen port         |
| `UPLOAD_MAX_BYTES`  | 52428800   | Max upload size (50 MB)  |

---

## 8. Optional Future Improvements

- **Rubberband filter:** Use FFmpeg’s `rubberband` filter when available (`rubberband=pitch=432/440`) for higher quality; fall back to asetrate/aresample/atempo.
- **Mono support:** FFmpeg filter currently uses `aformat=channel_layouts=stereo`; could derive layout from ffprobe for mono inputs.
- **Health endpoint:** e.g. `GET /health` for load balancers or monitoring.

---

## 9. File Reference (for edits)

| Purpose                    | File |
|----------------------------|------|
| Allowed MIMEs / extensions | `src/config.ts` |
| Upload + validation logic  | `src/middleware/upload.ts` |
| FFmpeg/ffprobe, path checks| `src/services/ffmpeg.ts` |
| Convert route, cleanup     | `src/routes/convert.ts` |
| Express app, CORS, errors  | `src/app.ts` |
| Docker permissions         | `Dockerfile` |
| User-facing docs           | `README.md` |

This file (`LLM_CONTEXT.md`) is the single place that documents the above findings and design for LLM or maintainer context.
