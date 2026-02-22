import { FormEvent, useEffect, useMemo, useState } from "react";
import { cancelIntent, createIntent, getIntents } from "./api";
import type { CreateIntentInput, Intent, IntentStatus, IntentType } from "./types";

type Tab = "create" | "mine" | "explorer";

interface IntentFormState {
  creator: string;
  intentType: IntentType;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadlineMinutes: string;
  solverFeeBps: string;
}

const TOKENS = ["STTEST.token-a", "STTEST.token-b"];
const EXPLORER_BASE =
  import.meta.env.VITE_EXPLORER_BASE_URL ?? "https://explorer.hiro.so/txid";

const statusClass: Record<IntentStatus, string> = {
  open: "badge badge-open",
  filled: "badge badge-filled",
  canceled: "badge badge-canceled",
  expired: "badge badge-expired",
};

const defaultDeadlineMinutes = 30;

function toDateLabel(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleString();
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const [allIntents, setAllIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentTxid, setRecentTxid] = useState<string | null>(null);

  const [creatorFilter, setCreatorFilter] = useState(
    "ST2J8EVYHPJ5F36W7P5N4A5M4EXAMPLE1",
  );

  const [form, setForm] = useState<IntentFormState>({
    creator: "ST2J8EVYHPJ5F36W7P5N4A5M4EXAMPLE1",
    intentType: "swap",
    tokenIn: TOKENS[0],
    tokenOut: TOKENS[1],
    amountIn: "100000",
    minAmountOut: "97000",
    deadlineMinutes: String(defaultDeadlineMinutes),
    solverFeeBps: "30",
  });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const intents = await getIntents();
      setAllIntents(intents.sort((a, b) => b.id - a.id));
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);

  const openIntents = useMemo(
    () => allIntents.filter((intent) => intent.status === "open"),
    [allIntents],
  );

  const myIntents = useMemo(() => {
    if (!creatorFilter.trim()) return [];
    return allIntents.filter((intent) => intent.creator === creatorFilter.trim());
  }, [allIntents, creatorFilter]);

  const slippageWarning = useMemo(() => {
    const amountIn = Number(form.amountIn);
    const minOut = Number(form.minAmountOut);

    if (!Number.isFinite(amountIn) || amountIn <= 0) return "";
    if (!Number.isFinite(minOut) || minOut <= 0) return "";

    const gap = amountIn - minOut;
    const slippagePct = (gap / amountIn) * 100;

    if (slippagePct <= 0) return "No slippage buffer: strict minimum output.";
    if (slippagePct > 5) {
      return `Large slippage tolerance (${slippagePct.toFixed(2)}%). Tighten min-out if possible.`;
    }
    return `Estimated max slippage tolerance: ${slippagePct.toFixed(2)}%.`;
  }, [form.amountIn, form.minAmountOut]);

  const onCreateIntent = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setRecentTxid(null);

    const deadlineMinutes = Number(form.deadlineMinutes);
    const solverFeeBps = Number(form.solverFeeBps);

    if (!Number.isFinite(deadlineMinutes) || deadlineMinutes <= 0) {
      setError("Deadline minutes must be a positive number.");
      return;
    }

    if (!Number.isFinite(solverFeeBps) || solverFeeBps < 0 || solverFeeBps > 10000) {
      setError("Solver fee must be between 0 and 10000 bps.");
      return;
    }

    const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

    const payload: CreateIntentInput = {
      creator: form.creator,
      intentType: form.intentType,
      tokenIn: form.tokenIn,
      tokenOut: form.tokenOut,
      amountIn: form.amountIn,
      minAmountOut: form.minAmountOut,
      deadline,
      solverFeeBps,
    };

    try {
      const result = await createIntent(payload);
      setRecentTxid(result.txid);
      await refresh();
      setActiveTab("mine");
    } catch (submitError) {
      setError((submitError as Error).message);
    }
  };

  const onCancelIntent = async (intent: Intent) => {
    try {
      const result = await cancelIntent({
        id: intent.id,
        tokenIn: intent.tokenIn,
        creator: creatorFilter,
      });
      setRecentTxid(result.txid);
      await refresh();
    } catch (cancelError) {
      setError((cancelError as Error).message);
    }
  };

  return (
    <div className="page-shell">
      <header className="hero">
        <p className="eyebrow">SatsStream v1</p>
        <h1>Tell Bitcoin what you want, not how to do it.</h1>
        <p className="subhead">
          Intent-based swaps and yield actions with solver execution, on-chain guarantees,
          and transparent status tracking.
        </p>

        <nav className="tabs">
          <button
            className={activeTab === "create" ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab("create")}
          >
            Create Intent
          </button>
          <button
            className={activeTab === "mine" ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab("mine")}
          >
            My Intents
          </button>
          <button
            className={activeTab === "explorer" ? "tab tab-active" : "tab"}
            onClick={() => setActiveTab("explorer")}
          >
            Intent Explorer
          </button>
        </nav>
      </header>

      <main className="content-grid">
        {activeTab === "create" && (
          <section className="panel">
            <h2>Create Intent</h2>
            <form onSubmit={onCreateIntent} className="form-grid">
              <label>
                Creator Principal
                <input
                  value={form.creator}
                  onChange={(e) => setForm({ ...form, creator: e.target.value })}
                  required
                />
              </label>

              <label>
                Intent Type
                <select
                  value={form.intentType}
                  onChange={(e) =>
                    setForm({ ...form, intentType: e.target.value as IntentType })
                  }
                >
                  <option value="swap">Swap</option>
                  <option value="yield">Yield</option>
                </select>
              </label>

              <label>
                Asset In
                <select
                  value={form.tokenIn}
                  onChange={(e) => setForm({ ...form, tokenIn: e.target.value })}
                >
                  {TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Asset Out
                <select
                  value={form.tokenOut}
                  onChange={(e) => setForm({ ...form, tokenOut: e.target.value })}
                >
                  {TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount In
                <input
                  value={form.amountIn}
                  onChange={(e) => setForm({ ...form, amountIn: e.target.value })}
                  inputMode="numeric"
                  required
                />
              </label>

              <label>
                Min Amount Out
                <span className="tooltip" title="Hard guarantee: fill is rejected if output is below this value.">
                  ?
                </span>
                <input
                  value={form.minAmountOut}
                  onChange={(e) => setForm({ ...form, minAmountOut: e.target.value })}
                  inputMode="numeric"
                  required
                />
              </label>

              <label>
                Deadline (minutes)
                <span className="tooltip" title="Intent expires after this duration and cannot be filled.">
                  ?
                </span>
                <input
                  value={form.deadlineMinutes}
                  onChange={(e) => setForm({ ...form, deadlineMinutes: e.target.value })}
                  inputMode="numeric"
                  required
                />
              </label>

              <label>
                Solver Fee (bps)
                <span className="tooltip" title="Fee paid to the solver only if your intent is filled.">
                  ?
                </span>
                <input
                  value={form.solverFeeBps}
                  onChange={(e) => setForm({ ...form, solverFeeBps: e.target.value })}
                  inputMode="numeric"
                  required
                />
              </label>

              <div className="notice">
                <p>{slippageWarning}</p>
                <p>
                  Guarantee text: you will receive at least <strong>{form.minAmountOut}</strong>
                  &nbsp;{form.tokenOut} or the fill fails.
                </p>
              </div>

              <button type="submit" className="cta">
                Create Intent
              </button>
            </form>
          </section>
        )}

        {activeTab === "mine" && (
          <section className="panel">
            <h2>My Intents</h2>
            <label className="inline-label">
              Creator Principal
              <input
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
              />
            </label>

            <div className="intent-grid">
              {myIntents.map((intent) => (
                <article key={intent.id} className="intent-card">
                  <div className="intent-head">
                    <h3>#{intent.id}</h3>
                    <span className={statusClass[intent.status]}>{intent.status}</span>
                  </div>
                  <p>
                    {intent.intentType.toUpperCase()} {intent.amountIn} {intent.tokenIn} → {intent.tokenOut}
                  </p>
                  <p>Min Out: {intent.minAmountOut}</p>
                  <p>Deadline: {toDateLabel(intent.deadline)}</p>
                  <p>Solver Fee: {intent.solverFeeBps} bps</p>
                  {intent.lastTxId && (
                    <a href={`${EXPLORER_BASE}/${intent.lastTxId}?chain=testnet`} target="_blank" rel="noreferrer">
                      Explorer Tx
                    </a>
                  )}
                  {intent.status === "open" && (
                    <button
                      className="secondary"
                      onClick={() => onCancelIntent(intent)}
                    >
                      Cancel Intent
                    </button>
                  )}
                </article>
              ))}
              {!myIntents.length && <p>No intents for this principal yet.</p>}
            </div>
          </section>
        )}

        {activeTab === "explorer" && (
          <section className="panel">
            <h2>Intent Explorer</h2>
            <p className="subtle">Open intents visible to all solvers for transparent fills.</p>
            <div className="intent-grid">
              {openIntents.map((intent) => (
                <article key={intent.id} className="intent-card intent-card-open">
                  <div className="intent-head">
                    <h3>#{intent.id}</h3>
                    <span className={statusClass[intent.status]}>{intent.status}</span>
                  </div>
                  <p>
                    {intent.amountIn} {intent.tokenIn} → {intent.tokenOut}
                  </p>
                  <p>Creator: {intent.creator}</p>
                  <p>Min Out: {intent.minAmountOut}</p>
                  <p>Deadline: {toDateLabel(intent.deadline)}</p>
                  <p>Fee: {intent.solverFeeBps} bps</p>
                  {intent.lastTxId && (
                    <a href={`${EXPLORER_BASE}/${intent.lastTxId}?chain=testnet`} target="_blank" rel="noreferrer">
                      Explorer Tx
                    </a>
                  )}
                </article>
              ))}
              {!openIntents.length && <p>No open intents right now.</p>}
            </div>
          </section>
        )}
      </main>

      <footer className="status-strip">
        {loading ? "Refreshing intents..." : "Live intent feed active (10s polling)."}
        {recentTxid && (
          <a href={`${EXPLORER_BASE}/${recentTxid}?chain=testnet`} target="_blank" rel="noreferrer">
            Latest Tx: {recentTxid}
          </a>
        )}
        {error && <span className="error">Error: {error}</span>}
      </footer>
    </div>
  );
}

export default App;
