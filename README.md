# Song Toolkit – 432 Hz Audio Conversion API

REST API that converts uploaded MP3 or WAV audio from standard tuning (A4 = 440 Hz) to 432 Hz, preserving duration. Runs on Node.js with TypeScript and FFmpeg.

## Requirements

- **Node.js** >= 18
- **FFmpeg** (with ffprobe) on the server

## Debian setup

### Install Node.js (Node 20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should show v20.x
```

### Install FFmpeg

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
ffmpeg -version
```

### Clone and run the app

```bash
git clone <your-repo-url> Song-Toolkit
cd Song-Toolkit
npm ci
npm run build
npm start
```

Server listens on port 3000. To be reachable on your LAN (e.g. `http://192.168.31.10:3000`), it binds to `0.0.0.0`.

### Optional: PM2 for production

```bash
sudo npm i -g pm2
pm2 start dist/index.js --name song-toolkit
pm2 save
pm2 startup   # follow the printed command to enable startup on boot
```

Restart after code changes:

```bash
pm2 restart song-toolkit
```

### Optional: Firewall

If you use UFW and need to allow port 3000:

```bash
sudo ufw allow 3000
sudo ufw enable
```

## Development

```bash
npm run dev
```

Uses `ts-node-dev` with auto-restart on file changes.

## API

### POST /convert

- **Content-Type:** `multipart/form-data`
- **Field name:** `file`
- **Accepted types:** MP3 (`.mp3`), WAV (`.wav`)
- **Limit:** 50 MB (configurable via `UPLOAD_MAX_BYTES`)

Response: converted file as download (same format as input). On error: JSON body with `error` (and optional `detail`).

## Test with curl

Upload an MP3 and save the converted file:

```bash
curl -v -X POST -F "file=@/path/to/audio.mp3" -o converted.mp3 http://192.168.31.10:3000/convert
```

WAV:

```bash
curl -v -X POST -F "file=@/path/to/audio.wav" -o converted.wav http://192.168.31.10:3000/convert
```

Invalid file type (expect 400):

```bash
curl -v -X POST -F "file=@/etc/passwd" http://192.168.31.10:3000/convert
```

## Deploy via SSH

1. SSH into the server: `ssh user@192.168.31.10`
2. Go to the app: `cd Song-Toolkit` (or your path)
3. Pull and rebuild: `git pull && npm ci && npm run build`
4. Restart: `pm2 restart song-toolkit` (or restart `node dist/index.js` if not using PM2)

Optional deploy script (e.g. `scripts/deploy.sh`):

```bash
#!/bin/bash
set -e
cd /path/to/Song-Toolkit
git pull
npm ci
npm run build
pm2 restart song-toolkit
```

## Environment

| Variable            | Default | Description                |
|---------------------|--------|----------------------------|
| `PORT`              | 3000   | HTTP port                  |
| `UPLOAD_MAX_BYTES`  | 52428800 (50MB) | Max upload size (bytes) |

## Optional: Docker

Build and run with Docker (includes FFmpeg):

```bash
docker build -t song-toolkit .
docker run -p 3000:3000 --rm song-toolkit
```

Test:

```bash
curl -v -X POST -F "file=@./sample.mp3" -o converted.mp3 http://localhost:3000/convert
```

## Project layout

```
src/
  index.ts       # Entry, ensure temp dir, start server
  app.ts         # Express app, CORS, routes, error handler
  config.ts      # Port, limits, paths
  routes/convert.ts
  services/ffmpeg.ts   # ffprobe + ffmpeg (safe spawn)
  middleware/upload.ts # Multer + file type validation
  utils/logger.ts      # Structured JSON logging
temp/            # Runtime temp files (gitignored)
dist/            # Compiled output (gitignored)
```

## License

MIT
