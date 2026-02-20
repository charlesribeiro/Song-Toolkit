import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import convertRouter from "./routes/convert.js";
import { logger } from "./utils/logger.js";

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

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", { error: err.message, code: err.code, stack: err.stack });
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
