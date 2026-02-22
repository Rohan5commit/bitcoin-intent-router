import type { CreateIntentParams, Intent } from "./types.js";

const nowHeight = (): number => Math.floor(Date.now() / 1000);

let nextId = 3;

const intents = new Map<number, Intent>([
  [
    1,
    {
      id: 1,
      creator: "ST2J8EVYHPJ5F36W7P5N4A5M4EXAMPLE1",
      intentType: "swap",
      tokenIn: "STTEST.token-a",
      tokenOut: "STTEST.token-b",
      amountIn: "100000",
      minAmountOut: "97000",
      deadline: nowHeight() + 1800,
      solverFeeBps: 30,
      status: "open",
      amountOut: "0",
      solver: null,
      createdAt: nowHeight() - 120,
      lastTxId: "mock-seed-open-1",
    },
  ],
  [
    2,
    {
      id: 2,
      creator: "ST2J8EVYHPJ5F36W7P5N4A5M4EXAMPLE2",
      intentType: "yield",
      tokenIn: "STTEST.token-b",
      tokenOut: "STTEST.token-a",
      amountIn: "250000",
      minAmountOut: "240000",
      deadline: nowHeight() - 60,
      solverFeeBps: 15,
      status: "expired",
      amountOut: "0",
      solver: null,
      createdAt: nowHeight() - 3600,
      lastTxId: "mock-seed-expired-2",
    },
  ],
]);

function withDerivedStatus(intent: Intent): Intent {
  if (intent.status !== "open") return intent;
  if (intent.deadline < nowHeight()) {
    return {
      ...intent,
      status: "expired",
    };
  }
  return intent;
}

export function listMockIntents(offset: number, limit: number): Intent[] {
  const all = Array.from(intents.values())
    .sort((a, b) => a.id - b.id)
    .map(withDerivedStatus);
  return all.slice(offset, offset + limit);
}

export function getMockIntent(id: number): Intent | null {
  const intent = intents.get(id);
  return intent ? withDerivedStatus(intent) : null;
}

export function createMockIntent(
  creator: string,
  payload: CreateIntentParams,
  lastTxId?: string,
): Intent {
  const intent: Intent = {
    id: nextId,
    creator,
    intentType: payload.intentType,
    tokenIn: payload.tokenIn,
    tokenOut: payload.tokenOut,
    amountIn: payload.amountIn,
    minAmountOut: payload.minAmountOut,
    deadline: payload.deadline,
    solverFeeBps: payload.solverFeeBps,
    status: "open",
    amountOut: "0",
    solver: null,
    createdAt: nowHeight(),
    lastTxId: lastTxId ?? null,
  };
  intents.set(nextId, intent);
  nextId += 1;
  return intent;
}

export function cancelMockIntent(id: number, creator: string): Intent {
  const intent = intents.get(id);
  if (!intent) throw new Error("Intent not found");
  if (intent.creator !== creator) throw new Error("Only creator can cancel");
  const derived = withDerivedStatus(intent);
  if (derived.status !== "open") throw new Error("Intent is not open");
  const updated: Intent = { ...intent, status: "canceled" };
  intents.set(id, updated);
  return updated;
}

export function fillMockIntent(
  id: number,
  solver: string,
  quotedAmountOut: string,
  lastTxId?: string,
): Intent {
  const intent = intents.get(id);
  if (!intent) throw new Error("Intent not found");
  const derived = withDerivedStatus(intent);
  if (derived.status !== "open") throw new Error("Intent is not open");
  if (BigInt(quotedAmountOut) < BigInt(intent.minAmountOut)) {
    throw new Error("Quote below min-amount-out");
  }

  const updated: Intent = {
    ...intent,
    status: "filled",
    amountOut: quotedAmountOut,
    solver,
    lastTxId: lastTxId ?? intent.lastTxId ?? null,
  };
  intents.set(id, updated);
  return updated;
}

export function setMockIntentTx(id: number, txid: string): Intent {
  const intent = intents.get(id);
  if (!intent) throw new Error("Intent not found");
  const updated: Intent = {
    ...intent,
    lastTxId: txid,
  };
  intents.set(id, updated);
  return updated;
}

export function getCurrentMockHeight(): number {
  return nowHeight();
}
