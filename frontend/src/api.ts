import type { CreateIntentInput, Intent } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = (await response.json()) as any;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload as T;
}

export async function getIntents(query?: {
  creator?: string;
  status?: string;
}): Promise<Intent[]> {
  const params = new URLSearchParams();
  if (query?.creator) params.set("creator", query.creator);
  if (query?.status) params.set("status", query.status);

  const queryString = params.toString();
  const data = await fetchJson<{ data: Intent[] }>(
    `${API_BASE}/intents${queryString ? `?${queryString}` : ""}`,
  );

  return data.data;
}

export async function createIntent(input: CreateIntentInput): Promise<{
  txid: string;
  intent?: Intent;
}> {
  const payload = await fetchJson<{ data: { txid: string; intent?: Intent } }>(
    `${API_BASE}/intents/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  return payload.data;
}

export async function cancelIntent(input: {
  id: number;
  tokenIn: string;
  creator: string;
}): Promise<{ txid: string; intent?: Intent }> {
  const payload = await fetchJson<{ data: { txid: string; intent?: Intent } }>(
    `${API_BASE}/intents/${input.id}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tokenIn: input.tokenIn,
        creator: input.creator,
      }),
    },
  );

  return payload.data;
}
