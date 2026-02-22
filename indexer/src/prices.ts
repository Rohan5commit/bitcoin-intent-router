export interface InternalPrice {
  numerator: bigint;
  denominator: bigint;
}

export type PriceTable = Record<string, InternalPrice>;

export const priceTable: PriceTable = {
  "STTEST.token-a::STTEST.token-b": { numerator: 98n, denominator: 100n },
  "STTEST.token-b::STTEST.token-a": { numerator: 101n, denominator: 100n },
};

export const pairKey = (tokenIn: string, tokenOut: string): string =>
  `${tokenIn}::${tokenOut}`;
