import dotenv from "dotenv";

dotenv.config();

const contractId = process.env.CONTRACT_ID ?? "";
const [contractAddress, contractName] = contractId.split(".");

export const config = {
  mockMode: process.env.MOCK_MODE === "true" || contractId.length === 0,
  stacksApiUrl: process.env.STACKS_API_URL ?? "https://api.testnet.hiro.so",
  network: process.env.STACKS_NETWORK ?? "testnet",
  contractId,
  contractAddress,
  contractName,
  readOnlyCaller:
    process.env.READ_ONLY_CALLER ??
    "ST000000000000000000002AMW42H",
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY ?? "",
  solverPrivateKey: process.env.SOLVER_PRIVATE_KEY ?? "",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10000),
  pageSize: Number(process.env.PAGE_SIZE ?? 10),
  maxPages: Number(process.env.MAX_PAGES ?? 20),
  port: Number(process.env.PORT ?? 8787),
};

if (!config.mockMode && (!config.contractAddress || !config.contractName)) {
  throw new Error(
    "CONTRACT_ID must be set as <address>.<contract-name> when MOCK_MODE is false.",
  );
}
