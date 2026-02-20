import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const TEMP_DIR_RESOLVED = path.resolve(config.tempDir);

function isPathUnderTemp(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved === TEMP_DIR_RESOLVED || resolved.startsWith(TEMP_DIR_RESOLVED + path.sep);
}

interface FFprobeStream {
  codec_type?: string;
  sample_rate?: string;
}

interface FFprobeOutput {
  streams?: FFprobeStream[];
}

async function getSampleRate(inputPath: string): Promise<number> {
  if (!isPathUnderTemp(inputPath)) {
    throw new Error("Input path is outside allowed temp directory");
  }

  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      inputPath,
    ];
    const proc = spawn("ffprobe", args, { shell: false });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => { stdout += chunk; });
    proc.stderr?.on("data", (chunk) => { stderr += chunk; });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr || stdout || "unknown"}`));
        return;
      }
      try {
        const data = JSON.parse(stdout) as FFprobeOutput;
        const audioStream = data.streams?.find((s) => s.codec_type === "audio");
        const sr = audioStream?.sample_rate;
        if (!sr) {
          reject(new Error("No audio stream or sample_rate in file"));
          return;
        }
        const rate = Number(sr);
        if (!Number.isFinite(rate) || rate <= 0) {
          reject(new Error(`Invalid sample_rate: ${sr}`));
          return;
        }
        resolve(rate);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e instanceof Error ? e.message : String(e)}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

/**
 * Converts audio from 440 Hz to 432 Hz (pitch only, duration preserved).
 * Uses asetrate + aresample + atempo. Returns path to the output file.
 */
export async function convertTo432Hz(inputPath: string, outputPath: string): Promise<string> {
  if (!isPathUnderTemp(inputPath) || !isPathUnderTemp(outputPath)) {
    throw new Error("Input or output path is outside allowed temp directory");
  }

  const sampleRate = await getSampleRate(inputPath);
  const sr = Math.floor(sampleRate);
  const setrate = Math.round(sr * config.pitchRatio);
  // aformat=channel_layouts=stereo avoids "Unknown channel layouts" with asetrate
  // asetrate lowers pitch (and shortens duration), aresample restores rate, atempo restores duration
  const filter = `aformat=channel_layouts=stereo,asetrate=${setrate},aresample=${sr},atempo=${config.atempoRatio}`;

  const ext = path.extname(outputPath).toLowerCase();
  const isMp3 = ext === ".mp3";
  const args = [
    "-y",
    "-i", inputPath,
    "-af", filter,
    ...(isMp3 ? ["-acodec", "libmp3lame", "-q:a", "2"] : ["-acodec", "pcm_s16le"]),
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { shell: false });
    let stderr = "";

    proc.stderr?.on("data", (chunk) => { stderr += chunk; });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`FFmpeg timed out after ${config.ffmpegTimeoutMs / 1000}s`));
    }, config.ffmpegTimeoutMs);

    proc.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (signal === "SIGKILL") return;
      if (code !== 0) {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`));
        return;
      }
      resolve(outputPath);
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Ensure temp dir exists (idempotent).
 */
export async function ensureTempDir(): Promise<void> {
  await fs.mkdir(config.tempDir, { recursive: true });
}
