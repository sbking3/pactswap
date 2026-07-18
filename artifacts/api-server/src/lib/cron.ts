import cron from "node-cron";
import { processExpiredEscrows } from "./contract";
import { logger } from "./logger";

export function startCronJobs(): void {
  // Every hour: process expired escrows on-chain
  cron.schedule("0 * * * *", async () => {
    logger.info("Cron: running processExpiredEscrows");
    const txHash = await processExpiredEscrows();
    if (txHash) {
      logger.info({ txHash }, "Cron: processExpiredEscrows completed");
    }
  });
  logger.info("Cron jobs started");
}
