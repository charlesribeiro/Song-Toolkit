import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT) || 3000,
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES) || 50 * 1024 * 1024, // 50MB
  allowedMimes: [
    "audio/mpeg",
    "audio/mp3",
    "audio/x-mpeg",
    "audio/mpeg3",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/flac",
  ] as const,
  allowedExtensions: [".mp3", ".wav", ".flac"] as const,
  /** 432 / 440 - pitch ratio for conversion */
  pitchRatio: 432 / 440,
  /** atempo value to restore original duration */
  atempoRatio: 440 / 432,
  tempDir: path.join(projectRoot, "temp"),
  ffmpegTimeoutMs: 120_000,
} as const;

export type Config = typeof config;
