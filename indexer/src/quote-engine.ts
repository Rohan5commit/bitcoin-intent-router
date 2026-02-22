import type { Intent, Quote } from "./types.js";
import { pairKey, priceTable } from "./prices.js";

const BPS_DENOMINATOR = 10_000n;

export function getQuoteFromInternalPrice(intent: Intent): Quote {
  const key = pairKey(intent.tokenIn, intent.tokenOut);
  const price = priceTable[key];

  if (!price) {
    return {
      grossAmountOut: "0",
      solverFee: "0",
      creatorAmountOut: "0",
      valid: false,
      reason: "No internal price configured for pair",
    };
  }

  const amountIn = BigInt(intent.amountIn);
  const grossAmountOut =
    (amountIn * price.numerator) / price.denominator;

  const minAmountOut = BigInt(intent.minAmountOut);
  if (grossAmountOut < minAmountOut) {
    return {
      grossAmountOut: grossAmountOut.toString(),
      solverFee: "0",
      creatorAmountOut: grossAmountOut.toString(),
      valid: false,
      reason: "Quote below min-amount-out",
    };
  }

  const solverFee =
    (grossAmountOut * BigInt(intent.solverFeeBps)) / BPS_DENOMINATOR;
  const creatorAmountOut = grossAmountOut - solverFee;

  return {
    grossAmountOut: grossAmountOut.toString(),
    solverFee: solverFee.toString(),
    creatorAmountOut: creatorAmountOut.toString(),
    valid: true,
  };
}
