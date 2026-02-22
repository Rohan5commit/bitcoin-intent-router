export type IntentType = "swap" | "yield";
export type IntentStatus = "open" | "filled" | "canceled" | "expired";

export interface Intent {
  id: number;
  creator: string;
  intentType: IntentType;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadline: number;
  solverFeeBps: number;
  status: IntentStatus;
  amountOut: string;
  solver: string | null;
  createdAt: number;
  lastTxId?: string | null;
}

export interface CreateIntentInput {
  intentType: IntentType;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadline: number;
  solverFeeBps: number;
  creator?: string;
}
