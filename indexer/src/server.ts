import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import {
  getIntent,
  listAllIntents,
  submitCancelIntent,
  submitCreateIntent,
} from "./chain-client.js";
import { getQuoteFromInternalPrice } from "./quote-engine.js";
import type { CreateIntentParams } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

const intentSchema = z.object({
  intentType: z.enum(["swap", "yield"]),
  tokenIn: z.string().min(3),
  tokenOut: z.string().min(3),
  amountIn: z.string().regex(/^\d+$/),
  minAmountOut: z.string().regex(/^\d+$/),
  deadline: z.number().int().positive(),
  solverFeeBps: z.number().int().min(0).max(10000),
  creator: z.string().optional(),
});

const cancelSchema = z.object({
  creator: z.string().min(3),
  tokenIn: z.string().min(3),
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: config.mockMode ? "mock" : "onchain",
  });
});

app.get("/api/intents", async (req, res) => {
  try {
    const creator =
      typeof req.query.creator === "string" ? req.query.creator : null;
    const status =
      typeof req.query.status === "string" ? req.query.status : null;

    const intents = await listAllIntents();

    const filtered = intents.filter((intent) => {
      const creatorOk = creator ? intent.creator === creator : true;
      const statusOk = status ? intent.status === status : true;
      return creatorOk && statusOk;
    });

    res.json({
      data: filtered,
      count: filtered.length,
    });
  } catch (error) {
    res.status(500).json({
      error: (error as Error).message,
    });
  }
});

app.get("/api/intents/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid intent id" });
    }

    const intent = await getIntent(id);
    if (!intent) {
      return res.status(404).json({ error: "Intent not found" });
    }

    return res.json({ data: intent });
  } catch (error) {
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
});

app.post("/api/intents/create", async (req, res) => {
  try {
    const parsed = intentSchema.parse(req.body);

    const payload: CreateIntentParams = {
      intentType: parsed.intentType,
      tokenIn: parsed.tokenIn,
      tokenOut: parsed.tokenOut,
      amountIn: parsed.amountIn,
      minAmountOut: parsed.minAmountOut,
      deadline: parsed.deadline,
      solverFeeBps: parsed.solverFeeBps,
    };

    const quote = getQuoteFromInternalPrice({
      id: 0,
      creator: parsed.creator ?? "STDEMOUSER",
      intentType: parsed.intentType,
      tokenIn: parsed.tokenIn,
      tokenOut: parsed.tokenOut,
      amountIn: parsed.amountIn,
      minAmountOut: parsed.minAmountOut,
      deadline: parsed.deadline,
      solverFeeBps: parsed.solverFeeBps,
      status: "open",
      amountOut: "0",
      solver: null,
      createdAt: Math.floor(Date.now() / 1000),
    });

    if (!quote.valid) {
      return res.status(400).json({
        error: quote.reason,
      });
    }

    const result = await submitCreateIntent(payload, parsed.creator);

    return res.json({
      data: {
        txid: result.txid,
        intent: result.intent,
      },
    });
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message,
    });
  }
});

app.post("/api/intents/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid intent id" });
    }

    const parsed = cancelSchema.parse(req.body);
    const result = await submitCancelIntent(id, parsed.tokenIn, parsed.creator);

    return res.json({
      data: {
        txid: result.txid,
        intent: result.intent,
      },
    });
  } catch (error) {
    return res.status(400).json({
      error: (error as Error).message,
    });
  }
});

app.get("/api/quote", async (req, res) => {
  try {
    const id = Number(req.query.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "id query param required" });
    }

    const intent = await getIntent(id);
    if (!intent) {
      return res.status(404).json({ error: "Intent not found" });
    }

    const quote = getQuoteFromInternalPrice(intent);
    return res.json({ data: quote });
  } catch (error) {
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
});

app.listen(config.port, () => {
  console.log(
    `[indexer] listening on :${config.port} in ${
      config.mockMode ? "mock" : "onchain"
    } mode`,
  );
});
