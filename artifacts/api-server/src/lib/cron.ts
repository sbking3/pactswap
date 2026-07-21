/**
 * Cron jobs — server is read-only, so expired escrow processing is handled
 * by the contract's AUTO_RELEASE_TIME mechanism on-chain, not by a server
 * wallet. This file is kept as a stub for future read-only monitoring jobs.
 */
export function startCronJobs(): void {
  // No server-side signing jobs. The smart contract handles auto-release.
}
