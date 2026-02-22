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

export interface CreateIntentParams {
  intentType: IntentType;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadline: number;
  solverFeeBps: number;
}

export interface FillIntentParams {
  id: number;
  tokenIn: string;
  tokenOut: string;
  quotedAmountOut: string;
  routeId: string;
}

export interface Quote {
  grossAmountOut: string;
  solverFee: string;
  creatorAmountOut: string;
  valid: boolean;
  reason?: string;
}
