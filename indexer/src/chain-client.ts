import {
  PostConditionMode,
  broadcastTransaction,
  contractPrincipalCV,
  cvToHex,
  cvToJSON,
  hexToCV,
  makeContractCall,
  stringAsciiCV,
  tupleCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET, createNetwork } from "@stacks/network";
import {
  cancelMockIntent,
  createMockIntent,
  fillMockIntent,
  getCurrentMockHeight,
  getMockIntent,
  listMockIntents,
  setMockIntentTx,
} from "./mock-store.js";
import { config } from "./config.js";
import type {
  CreateIntentParams,
  FillIntentParams,
  Intent,
  IntentStatus,
  IntentType,
} from "./types.js";

const STATUS_MAP: Record<number, IntentStatus> = {
  0: "open",
  1: "filled",
  2: "canceled",
  3: "expired",
};

const TYPE_MAP: Record<number, IntentType> = {
  0: "swap",
  1: "yield",
};

const TYPE_TO_CHAIN: Record<IntentType, bigint> = {
  swap: 0n,
  yield: 1n,
};

const parseContractIdentifier = (
  contractId: string,
): { address: string; name: string } => {
  const [address, name] = contractId.split(".");
  if (!address || !name) {
    throw new Error(`Invalid contract identifier: ${contractId}`);
  }
  return { address, name };
};

const asPrimitive = (value: any): any => {
  if (!value || typeof value !== "object") return value;

  switch (value.type) {
    case "uint":
    case "int":
      return BigInt(value.value);
    case "bool_true":
      return true;
    case "bool_false":
      return false;
    case "none":
    case "optional_none":
      return null;
    case "some":
    case "optional_some":
      return asPrimitive(value.value);
    case "principal_standard":
    case "principal_contract":
      return value.value;
    case "string_ascii":
    case "string_utf8":
      return value.value;
    case "tuple": {
      const out: Record<string, any> = {};
      Object.entries(value.value).forEach(([k, v]) => {
        out[k] = asPrimitive(v);
      });
      return out;
    }
    case "list":
      return value.value.map((item: any) => asPrimitive(item));
    case "response_ok":
    case "response_err":
      return asPrimitive(value.value);
    default:
      return value.value ?? value;
  }
};

const parseIntentTuple = (value: any): Intent => {
  const raw = asPrimitive(value);
  return {
    id: Number(raw.id),
    creator: String(raw.creator),
    intentType: TYPE_MAP[Number(raw["intent-type"])] ?? "swap",
    tokenIn: String(raw["token-in"]),
    tokenOut: String(raw["token-out"]),
    amountIn: String(raw["amount-in"]),
    minAmountOut: String(raw["min-amount-out"]),
    deadline: Number(raw.deadline),
    solverFeeBps: Number(raw["solver-fee-bps"]),
    status: STATUS_MAP[Number(raw.status)] ?? "open",
    amountOut: String(raw["amount-out"]),
    solver: raw.solver ? String(raw.solver) : null,
    createdAt: Number(raw["created-at"]),
    lastTxId: raw["last-tx-id"] ? String(raw["last-tx-id"]) : null,
  };
};

async function callReadOnly(functionName: string, args: string[]): Promise<any> {
  const endpoint = `${config.stacksApiUrl}/v2/contracts/call-read/${config.contractAddress}/${config.contractName}/${functionName}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: config.readOnlyCaller,
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`Read-only call failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    okay: boolean;
    cause?: string;
    result: string;
  };

  if (!payload.okay) {
    throw new Error(payload.cause ?? "Read-only contract call failed");
  }

  const clarityValue = hexToCV(payload.result);
  return cvToJSON(clarityValue);
}

function getNetwork() {
  const base = config.network === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
  return createNetwork({
    network: base,
    client: {
      baseUrl: config.stacksApiUrl,
    },
  });
}

export async function getCurrentBlockHeight(): Promise<number> {
  if (config.mockMode) {
    return getCurrentMockHeight();
  }

  const response = await fetch(`${config.stacksApiUrl}/v2/info`);
  if (!response.ok) {
    throw new Error(`Failed to fetch chain info (${response.status})`);
  }
  const payload = (await response.json()) as { stacks_tip_height: number };
  return payload.stacks_tip_height;
}

export async function getIntent(id: number): Promise<Intent | null> {
  if (config.mockMode) {
    return getMockIntent(id);
  }

  const json = await callReadOnly("get-intent", [cvToHex(uintCV(BigInt(id)))]);
  const parsed = asPrimitive(json);

  if (!parsed) {
    return null;
  }

  return parseIntentTuple(parsed);
}

export async function listIntents(
  offset: number,
  limit: number,
): Promise<Intent[]> {
  if (config.mockMode) {
    return listMockIntents(offset, limit);
  }

  const json = await callReadOnly("list-intents", [
    cvToHex(uintCV(BigInt(offset))),
    cvToHex(uintCV(BigInt(limit))),
  ]);

  const parsed = asPrimitive(json);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(Boolean)
    .map((entry: any) => parseIntentTuple(entry));
}

export async function listAllIntents(): Promise<Intent[]> {
  const items: Intent[] = [];
  for (let page = 0; page < config.maxPages; page += 1) {
    const offset = page * config.pageSize;
    const pageData = await listIntents(offset, config.pageSize);
    if (pageData.length === 0) break;
    items.push(...pageData);
    if (pageData.length < config.pageSize) break;
  }
  return items;
}

export async function submitCreateIntent(
  params: CreateIntentParams,
  creatorHint = "STDEMOUSER",
): Promise<{ txid: string; intent?: Intent }> {
  if (config.mockMode) {
    const txid = `mock-create-${Date.now()}`;
    const intent = createMockIntent(creatorHint, params, txid);
    return {
      txid,
      intent,
    };
  }

  if (!config.relayerPrivateKey) {
    throw new Error("RELAYER_PRIVATE_KEY not set");
  }

  const network = getNetwork();
  const tokenIn = parseContractIdentifier(params.tokenIn);
  const tokenOut = parseContractIdentifier(params.tokenOut);

  const tx = await makeContractCall({
    contractAddress: config.contractAddress,
    contractName: config.contractName,
    functionName: "create-intent",
    functionArgs: [
      uintCV(TYPE_TO_CHAIN[params.intentType]),
      contractPrincipalCV(tokenIn.address, tokenIn.name),
      contractPrincipalCV(tokenOut.address, tokenOut.name),
      uintCV(BigInt(params.amountIn)),
      uintCV(BigInt(params.minAmountOut)),
      uintCV(BigInt(params.deadline)),
      uintCV(BigInt(params.solverFeeBps)),
    ],
    senderKey: config.relayerPrivateKey,
    postConditionMode: PostConditionMode.Allow,
    network,
  });

  const result = await broadcastTransaction({
    transaction: tx,
    network,
  });

  return {
    txid: typeof result === "string" ? result : (result as any).txid,
  };
}

export async function submitCancelIntent(
  id: number,
  tokenIn: string,
  creatorHint = "STDEMOUSER",
): Promise<{ txid: string; intent?: Intent }> {
  if (config.mockMode) {
    const txid = `mock-cancel-${id}-${Date.now()}`;
    const intent = setMockIntentTx(cancelMockIntent(id, creatorHint).id, txid);
    return {
      txid,
      intent,
    };
  }

  if (!config.relayerPrivateKey) {
    throw new Error("RELAYER_PRIVATE_KEY not set");
  }

  const network = getNetwork();
  const token = parseContractIdentifier(tokenIn);

  const tx = await makeContractCall({
    contractAddress: config.contractAddress,
    contractName: config.contractName,
    functionName: "cancel-intent",
    functionArgs: [
      uintCV(BigInt(id)),
      contractPrincipalCV(token.address, token.name),
    ],
    senderKey: config.relayerPrivateKey,
    postConditionMode: PostConditionMode.Allow,
    network,
  });

  const result = await broadcastTransaction({
    transaction: tx,
    network,
  });

  return {
    txid: typeof result === "string" ? result : (result as any).txid,
  };
}

export async function submitFillIntent(
  params: FillIntentParams,
): Promise<{ txid: string; intent?: Intent }> {
  if (config.mockMode) {
    const txid = `mock-fill-${params.id}-${Date.now()}`;
    const intent = fillMockIntent(
      params.id,
      "STSOLVERMOCK0000000000000000000000000",
      params.quotedAmountOut,
      txid,
    );
    return {
      txid,
      intent,
    };
  }

  if (!config.solverPrivateKey) {
    throw new Error("SOLVER_PRIVATE_KEY not set");
  }

  const network = getNetwork();
  const tokenIn = parseContractIdentifier(params.tokenIn);
  const tokenOut = parseContractIdentifier(params.tokenOut);

  const tx = await makeContractCall({
    contractAddress: config.contractAddress,
    contractName: config.contractName,
    functionName: "fill-intent",
    functionArgs: [
      uintCV(BigInt(params.id)),
      tupleCV({
        "quoted-amount-out": uintCV(BigInt(params.quotedAmountOut)),
        "route-id": stringAsciiCV(params.routeId),
      }),
      contractPrincipalCV(tokenIn.address, tokenIn.name),
      contractPrincipalCV(tokenOut.address, tokenOut.name),
    ],
    senderKey: config.solverPrivateKey,
    postConditionMode: PostConditionMode.Allow,
    network,
  });

  const result = await broadcastTransaction({
    transaction: tx,
    network,
  });

  return {
    txid: typeof result === "string" ? result : (result as any).txid,
  };
}
