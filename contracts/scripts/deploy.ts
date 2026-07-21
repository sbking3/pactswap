/**
 * Deploy PactSwapEscrow v2 to BSC Mainnet.
 *
 * Run:
 *   DEPLOYER_PRIVATE_KEY=0x... pnpm --filter @workspace/contracts run deploy:bsc
 *
 * After deploy, update CONTRACT_ADDRESS in:
 *   - artifacts/pactswap/src/lib/contract.ts
 *   - artifacts/api-server/src/lib/contract.ts
 */
import { ethers } from "hardhat";

const USDT_BSC    = "0x55d398326f99059fF775485246999027B3197955";
// The deployer wallet becomes the arbiter. Make sure you use the same wallet
// that was the arbiter on the old contract: 0xF71C8E88aA5e433603FB76afCea62D02b9751338
// feeRecipient is the same wallet here, but can be any address.

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer / new arbiter:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("BNB balance:", ethers.formatEther(balance), "BNB");
  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Insufficient BNB — need at least 0.01 BNB for gas");
  }

  console.log("\nDeploying PactSwapEscrow v2...");
  const Factory = await ethers.getContractFactory("PactSwapEscrow");
  const contract = await Factory.deploy(
    USDT_BSC,
    deployer.address, // feeRecipient = deployer (same as old contract)
  );
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("\n✅ PactSwapEscrow v2 deployed!");
  console.log("   Address:", addr);
  console.log("   Arbiter:", deployer.address);
  console.log("   BSCScan:", `https://bscscan.com/address/${addr}`);
  console.log("\n⚡ Next step — update CONTRACT_ADDRESS in:");
  console.log("   artifacts/pactswap/src/lib/contract.ts");
  console.log("   artifacts/api-server/src/lib/contract.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
