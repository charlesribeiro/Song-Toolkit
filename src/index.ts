import app from "./app.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { ensureTempDir } from "./services/ffmpeg.js";

async function main(): Promise<void> {
  await ensureTempDir();
  app.listen(config.port, "0.0.0.0", () => {
    logger.info(`Server listening on port ${config.port}`);
  });
}

main().catch((err) => {
  logger.error("Failed to start server", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
