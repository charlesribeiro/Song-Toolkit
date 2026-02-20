import express, { Request, Response, NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import convertRouter from "./routes/convert.js";
import { logger } from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info("request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.use("/convert", convertRouter);

const frontendDir = path.resolve(__dirname, "..", "frontend", "dist", "frontend");
const browserDir = path.join(frontendDir, "browser");
const frontendPath = fs.existsSync(path.join(browserDir, "index.html"))
  ? browserDir
  : fs.existsSync(path.join(frontendDir, "index.html"))
    ? frontendDir
    : "";
const indexHtml = frontendPath ? path.join(frontendPath, "index.html") : "";
logger.info("Frontend path", { frontendPath: frontendPath || "(none)", exists: !!frontendPath && fs.existsSync(indexHtml) });
if (frontendPath && fs.existsSync(indexHtml)) {
  app.use(express.static(frontendPath));
  app.get("*", (_req, res, next: NextFunction) => {
    if (!fs.existsSync(indexHtml)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });
} else {
  app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not found" }));
}

app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", { error: err.message, code: err.code, stack: err.stack });
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large" });
    return;
  }
  if (err.code === "ENOENT") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
