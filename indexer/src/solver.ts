import { config } from "./config.js";
import {
  getCurrentBlockHeight,
  listAllIntents,
  submitFillIntent,
} from "./chain-client.js";
import { getQuoteFromInternalPrice } from "./quote-engine.js";

const routeId = "internal-amm-v1";
const seen = new Set<number>();

async function tick(): Promise<void> {
  const blockHeight = await getCurrentBlockHeight();
  const intents = await listAllIntents();

  const openIntents = intents.filter((intent) => intent.status === "open");

  for (const intent of openIntents) {
    if (seen.has(intent.id)) continue;
    if (intent.deadline <= blockHeight) continue;

    const quote = getQuoteFromInternalPrice(intent);
    if (!quote.valid) continue;

    try {
      const result = await submitFillIntent({
        id: intent.id,
        tokenIn: intent.tokenIn,
        tokenOut: intent.tokenOut,
        quotedAmountOut: quote.grossAmountOut,
        routeId,
      });

      seen.add(intent.id);

      console.log(
        `[solver] filled intent ${intent.id} with ${quote.grossAmountOut} (tx=${result.txid})`,
      );
    } catch (error) {
      console.error(
        `[solver] failed to fill intent ${intent.id}: ${(error as Error).message}`,
      );
    }
  }
}

async function run() {
  const once = process.argv.includes("--once");
  console.log(
    `[solver] running poll loop every ${config.pollIntervalMs}ms (${config.mockMode ? "mock" : "onchain"})`,
  );

  await tick();
  if (once) return;

  setInterval(() => {
    tick().catch((error) => {
      console.error(`[solver] tick failed: ${(error as Error).message}`);
    });
  }, config.pollIntervalMs);
}

run().catch((error) => {
  console.error(`[solver] fatal: ${(error as Error).message}`);
  process.exit(1);
});
