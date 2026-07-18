import app from "./app";
import { logger } from "./lib/logger";
import { startCronJobs } from "./lib/cron";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "PACTSWAP API Server listening");

  // Start background cron jobs (expired escrow processor etc.)
  if (process.env.PRIVATE_KEY) {
    startCronJobs();
  } else {
    logger.warn("PRIVATE_KEY not set — cron jobs disabled");
  }
});
