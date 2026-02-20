import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { randomBytes } from "node:crypto";

function getExtension(mimetype: string): string {
  if (mimetype === "audio/mpeg" || mimetype === "audio/mp3" || mimetype === "audio/x-mpeg" || mimetype === "audio/mpeg3") return ".mp3";
  if (mimetype === "audio/wav" || mimetype === "audio/wave" || mimetype === "audio/x-wav") return ".wav";
  if (mimetype === "audio/flac") return ".flac";
  return "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(config.tempDir, { recursive: true }, (err) => cb(err, config.tempDir));
  },
  filename: (_req, file, cb) => {
    const ext = getExtension(file.mimetype) || path.extname(file.originalname).toLowerCase();
    const safeExt = config.allowedExtensions.includes(ext as ".mp3" | ".wav" | ".flac") ? ext : ".bin";
    const id = randomBytes(16).toString("hex");
    cb(null, `upload-${id}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxBytes },
});

/**
 * Validates that the uploaded file is an allowed type (mp3/wav).
 * Must run after Multer. Deletes the file and sends 400 if invalid.
 */
export function validateAudioFile(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded. Use field name 'file'." });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const extOk = config.allowedExtensions.includes(ext as ".mp3" | ".wav" | ".flac");
  const mimeOk =
    config.allowedMimes.includes(req.file.mimetype as (typeof config.allowedMimes)[number]) ||
    req.file.mimetype.startsWith("audio/") ||
    req.file.mimetype === "application/octet-stream";

  if (!extOk || !mimeOk) {
    fs.unlink(req.file.path, (unlinkErr) => {
      if (unlinkErr) logger.error("Failed to delete invalid upload", { path: req.file!.path, error: String(unlinkErr) });
    });
    res.status(400).json({
      error: "Invalid file type. Only MP3, WAV, and FLAC are allowed.",
    });
    return;
  }

  next();
}
