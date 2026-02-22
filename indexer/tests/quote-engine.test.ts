import { describe, expect, it } from "vitest";
import { getQuoteFromInternalPrice } from "../src/quote-engine.js";

describe("quote engine", () => {
  it("returns valid quote when min-out is met", () => {
    const quote = getQuoteFromInternalPrice({
      id: 1,
      creator: "STTEST",
      intentType: "swap",
      tokenIn: "STTEST.token-a",
      tokenOut: "STTEST.token-b",
      amountIn: "100000",
      minAmountOut: "97000",
      deadline: 9999999999,
      solverFeeBps: 30,
      status: "open",
      amountOut: "0",
      solver: null,
      createdAt: 1,
    });

    expect(quote.valid).toBe(true);
    expect(quote.grossAmountOut).toBe("98000");
    expect(quote.solverFee).toBe("294");
    expect(quote.creatorAmountOut).toBe("97706");
  });

  it("returns invalid quote when below min-out", () => {
    const quote = getQuoteFromInternalPrice({
      id: 1,
      creator: "STTEST",
      intentType: "swap",
      tokenIn: "STTEST.token-a",
      tokenOut: "STTEST.token-b",
      amountIn: "100000",
      minAmountOut: "100000",
      deadline: 9999999999,
      solverFeeBps: 30,
      status: "open",
      amountOut: "0",
      solver: null,
      createdAt: 1,
    });

    expect(quote.valid).toBe(false);
    expect(quote.reason).toBe("Quote below min-amount-out");
  });
});
