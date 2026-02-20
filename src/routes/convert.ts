import { Router, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { upload, validateAudioFile } from "../middleware/upload.js";
import { convertTo432Hz } from "../services/ffmpeg.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const router = Router();

function safeUnlink(filePath: string): void {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") logger.warn("Failed to delete temp file", { path: filePath, error: String(err) });
  });
}

router.post(
  "/",
  upload.single("file"),
  validateAudioFile,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const inputPath = req.file!.path;
    const outputName = "converted-432.mp3";
    const outputPath = path.join(
      config.tempDir,
      `convert-${randomBytes(16).toString("hex")}.mp3`
    );

    const cleanup = (): void => {
      safeUnlink(inputPath);
      safeUnlink(outputPath);
    };

    const onAbort = (): void => {
      res.removeListener("close", onAbort);
      cleanup();
    };
    res.on("close", onAbort);

    try {
      await convertTo432Hz(inputPath, outputPath);
    } catch (err) {
      cleanup();
      res.removeListener("close", onAbort);
      logger.error("Conversion failed", { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) {
        res.status(500).json({
          error: "Conversion failed.",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (!fs.existsSync(outputPath)) {
      cleanup();
      res.removeListener("close", onAbort);
      res.status(500).json({ error: "Conversion produced no output." });
      return;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`);
    res.setHeader("Content-Type", "audio/mpeg");

    const stream = fs.createReadStream(outputPath);
    stream.on("error", (err) => {
      logger.error("Stream error", { error: String(err) });
      cleanup();
      if (!res.headersSent) res.status(500).json({ error: "Stream error." });
    });
    stream.on("end", () => {
      res.removeListener("close", onAbort);
      cleanup();
    });
    stream.pipe(res);
  }
);

export default router;
