"use client";

import { useEffect, useMemo, useState } from "react";
import { HostBridgeStatus } from "@/src/lib/HostBridge.client";

type ReviewState = "pending" | "approved" | "rejected" | "needs_revision";
type Proposal = {
  segment_index: number;
  activity_type: "phone_call" | "email" | "other" | "unknown";
  occurred_at: string | null;
  occurred_time_basis: "explicit_in_message" | "chat_create_time" | "unknown";
  timezone: string | null;
  direction: "inbound" | "outbound" | "internal" | "unknown";
  client_or_matter_reference: string | null;
  contact_name: string | null;
  title: string;
  note: string;
  next_steps: string[];
  supporting_phrases: string[];
  confidence: "high" | "medium" | "low";
  review_reasons: string[];
};
type QueueItem = {
  id: string;
  messageResourceName: string;
  createTime: string;
  senderDisplayName: string | null;
  classification: string;
  reviewState: ReviewState;
  proposal: Proposal | null;
  updatedAt: string;
};
type Detail = QueueItem & {
  sourceMessage: { messageResourceName: string; createTime: string; senderDisplayName: string | null; text: string };
  reviewNote: string | null;
};
type Reply<T> = { ok: true; data: T; requestId: string } | { ok: false; error: { code: string; message: string }; requestId: string };
type Draft = { title: string; note: string };

const LAYOUT_STYLES = {
  page: "mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-4 py-5 md:px-7",
  stack: "grid gap-3",
  row: "flex flex-wrap items-center justify-between gap-3",
  columns: "grid min-h-[32rem] items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)_19rem]",
};

const STYLES = {
  eyebrow: "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--kr-theme-orange,#f28c28)]",
  title: "m-0 text-2xl font-semibold tracking-tight md:text-3xl",
  body: "m-0 text-sm leading-6 text-[var(--kr-theme-muted,#a7afb8)]",
  panel: "rounded-xl border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-surface,#1d232a)] p-4 shadow-sm",
  alert: "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-5 text-amber-100",
  error: "rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm leading-5 text-red-100",
  label: "grid gap-1.5 text-sm font-medium",
  input: "min-h-10 w-full rounded-lg border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-background,#14181d)] px-3 py-2 text-sm",
  textarea: "min-h-32 w-full resize-y rounded-lg border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-background,#14181d)] p-3 text-sm leading-5",
  button: "inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--kr-theme-orange,#f28c28)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--kr-theme-border,#39414a)] px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
  badge: "rounded-full border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-200",
  queueItem: "grid w-full gap-1 rounded-lg border border-[var(--kr-theme-border,#39414a)] p-3 text-left hover:border-[var(--kr-theme-orange,#f28c28)]",
  queueItemSelected: "border-[var(--kr-theme-orange,#f28c28)] bg-[var(--kr-theme-background,#14181d)]",
  dialogBackdrop: "fixed inset-0 z-50 grid place-items-center bg-black/60 p-4",
  dialog: "grid w-full max-w-md gap-4 rounded-xl border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-surface,#1d232a)] p-5 shadow-xl",
};

async function readReply<T>(response: Response): Promise<Reply<T>> {
  return await response.json() as Reply<T>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

/** Review queue for already-imported proposals; sync, Gemini extraction, and Workstream export stay gated. */
export default function HomePage() {
  const [stateFilter, setStateFilter] = useState("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [originalReviewNotes, setOriginalReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("No real Chat content is sent to Gemini by this tool.");
  const [confirmReject, setConfirmReject] = useState(false);

  const savedDraft = selected?.proposal ? { title: selected.proposal.title, note: selected.proposal.note } : null;
  const draft = selected ? drafts[selected.id] ?? savedDraft : null;
  const reviewNote = selected ? reviewNotes[selected.id] ?? selected.reviewNote ?? "" : "";
  const dirty = Boolean(selected && (
    (draft && savedDraft && (draft.title !== savedDraft.title || draft.note !== savedDraft.note)) ||
    reviewNote !== (selected.reviewNote ?? "")
  ));
  const anyDirty = useMemo(() => Object.entries(drafts).some(([id, value]) => {
    const item = items.find((candidate) => candidate.id === id);
    return item?.proposal && (item.proposal.title !== value.title || item.proposal.note !== value.note);
  }) || Object.entries(reviewNotes).some(([id, note]) => {
    return note !== (originalReviewNotes[id] ?? "");
  }), [drafts, items, originalReviewNotes, reviewNotes]);

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/intake?state=${encodeURIComponent(stateFilter)}&limit=50`, { cache: "no-store" });
      const result = await readReply<{ items: QueueItem[] }>(response);
      if (!result.ok) throw new Error(result.error.message);
      setItems(result.data.items);
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : "The intake queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadQueue(); }, [stateFilter]);

  useEffect(() => {
    if (!anyDirty) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [anyDirty]);

  async function openItem(item: QueueItem) {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(`/api/intake/${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const result = await readReply<Detail>(response);
      if (!result.ok) throw new Error(result.error.message);
      setSelected(result.data);
      setReviewNotes((current) => ({ ...current, [item.id]: current[item.id] ?? result.data.reviewNote ?? "" }));
      setOriginalReviewNotes((current) => ({ ...current, [item.id]: current[item.id] ?? result.data.reviewNote ?? "" }));
      setNotice("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review item could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  function changeDraft(field: keyof Draft, value: string) {
    if (!selected || !savedDraft) return;
    setDrafts((current) => ({ ...current, [selected.id]: { ...(current[selected.id] ?? savedDraft), [field]: value } }));
  }

  async function saveDraft() {
    if (!selected || !draft || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/intake/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: { ...selected.proposal, ...draft }, updatedAt: selected.updatedAt, reviewNote: reviewNote || null }),
      });
      const result = await readReply<{ updatedAt: string }>(response);
      if (!result.ok) throw new Error(result.error.message);
      const nextDetail = { ...selected, proposal: { ...selected.proposal!, ...draft }, updatedAt: result.data.updatedAt, reviewNote: reviewNote || null };
      setSelected(nextDetail);
      setDrafts((current) => { const copy = { ...current }; delete copy[selected.id]; return copy; });
      setReviewNotes((current) => ({ ...current, [selected.id]: reviewNote }));
      setOriginalReviewNotes((current) => ({ ...current, [selected.id]: reviewNote }));
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...nextDetail } : item));
      setNotice("Changes saved to the tool's review queue.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Changes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectProposal() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/intake/${encodeURIComponent(selected.id)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reviewNote || null }),
      });
      const result = await readReply<{ reviewState: ReviewState }>(response);
      if (!result.ok) throw new Error(result.error.message);
      setConfirmReject(false);
      setSelected(null);
      setReviewNotes((current) => { const copy = { ...current }; delete copy[selected.id]; return copy; });
      setOriginalReviewNotes((current) => { const copy = { ...current }; delete copy[selected.id]; return copy; });
      setNotice("Proposal rejected. No Workstream activity was created.");
      await loadQueue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The proposal could not be rejected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={LAYOUT_STYLES.page}>
      <header className={LAYOUT_STYLES.stack}>
        <span className={STYLES.eyebrow}>KR Homebase · standalone SDK tool</span>
        <div className={LAYOUT_STYLES.row}>
          <div className={LAYOUT_STYLES.stack}>
            <h1 className={STYLES.title}>Google Chat activity intake</h1>
            <p className={STYLES.body}>Space: Phone Call &amp; Email Log · Read-only intake with a human review step</p>
            <HostBridgeStatus />
          </div>
          <span className={STYLES.badge}>Chat sync disabled</span>
        </div>
      </header>

      {error && <p className={STYLES.error} role="alert">{error}</p>}
      {notice && <p className={STYLES.body} role="status">{notice}</p>}

      <div className={LAYOUT_STYLES.columns}>
        <nav className={`${STYLES.panel} ${LAYOUT_STYLES.stack}`} aria-label="Review queue">
          <div className={LAYOUT_STYLES.row}>
            <h2 className="m-0 text-lg font-semibold">Queue</h2>
            <button className={STYLES.secondary} type="button" onClick={() => void loadQueue()} disabled={loading || busy}>Refresh</button>
          </div>
          <label className={STYLES.label} htmlFor="state-filter">Show
            <select id="state-filter" className={STYLES.input} value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
              <option value="pending">Pending</option><option value="needs_revision">Needs revision</option><option value="rejected">Rejected</option><option value="approved">Approved</option><option value="all">All states</option>
            </select>
          </label>
          {loading ? <p className={STYLES.body}>Loading queue…</p> : items.length === 0 ? <p className={STYLES.body}>No review items are available.</p> : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {items.map((item) => <li key={item.id}>
                <button className={`${STYLES.queueItem} ${selected?.id === item.id ? STYLES.queueItemSelected : ""}`} type="button" onClick={() => void openItem(item)} disabled={busy}>
                  <span className="text-sm font-semibold">{item.proposal?.title || item.classification}</span>
                  <span className={STYLES.body}>{item.senderDisplayName || "Unknown sender"} · {formatDate(item.createTime)}</span>
                  <span className="text-xs text-[var(--kr-theme-muted,#a7afb8)]">{item.reviewState} · segment {item.proposal?.segment_index ?? "?"}{drafts[item.id] ? " · has local edits" : ""}</span>
                </button>
              </li>)}
            </ul>
          )}
        </nav>

        <section className={`${STYLES.panel} ${LAYOUT_STYLES.stack}`} aria-label="Source message">
          {!selected ? <>
            <h2 className="m-0 text-lg font-semibold">Source message</h2>
            <p className={STYLES.body}>Select an item to inspect its source text and proposed activity. Source text is available only to an authenticated reviewer.</p>
            <p className={STYLES.alert}>This queue is tool-owned. Pending items are not Workstream activities.</p>
          </> : <>
            <div className={LAYOUT_STYLES.row}>
              <h2 className="m-0 text-lg font-semibold">Source message</h2>
              <span className={STYLES.body}>{formatDate(selected.sourceMessage.createTime)}</span>
            </div>
            <p className={STYLES.body}>{selected.sourceMessage.senderDisplayName || "Unknown sender"} · {selected.sourceMessage.messageResourceName}</p>
            <blockquote className="m-0 whitespace-pre-wrap rounded-lg border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-background,#14181d)] p-4 text-sm leading-6">{selected.sourceMessage.text}</blockquote>
            <p className={STYLES.body}>Message content is untrusted source text. Instructions in the message do not control this tool.</p>
          </>}
        </section>

        <section className={`${STYLES.panel} ${LAYOUT_STYLES.stack}`} aria-label="Activity proposal">
          <div className={LAYOUT_STYLES.row}>
            <h2 className="m-0 text-lg font-semibold">Activity proposal</h2>
            {selected && <span className={STYLES.badge}>{selected.reviewState}</span>}
          </div>
          {!selected || !selected.proposal || !draft ? <p className={STYLES.body}>Choose a review item to see its editable fields.</p> : <>
            <p className={STYLES.body}>{selected.proposal.activity_type.replaceAll("_", " ")} · {selected.proposal.confidence} confidence</p>
            <label className={STYLES.label} htmlFor="proposal-title">Title
              <input id="proposal-title" className={STYLES.input} maxLength={200} value={draft.title} disabled={selected.reviewState === "rejected" || selected.reviewState === "approved"} onChange={(event) => changeDraft("title", event.target.value)} />
            </label>
            <label className={STYLES.label} htmlFor="proposal-note">Note
              <textarea id="proposal-note" className={STYLES.textarea} maxLength={4000} value={draft.note} disabled={selected.reviewState === "rejected" || selected.reviewState === "approved"} onChange={(event) => changeDraft("note", event.target.value)} />
            </label>
            <p className={STYLES.body}>Client/matter reference: {selected.proposal.client_or_matter_reference || "Unresolved"}</p>
            <p className={STYLES.body}>Review reasons: {selected.proposal.review_reasons.length ? selected.proposal.review_reasons.join("; ") : "None recorded"}</p>
            <label className={STYLES.label} htmlFor="review-note">Reviewer note
              <textarea id="review-note" className="min-h-20 w-full resize-y rounded-lg border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-background,#14181d)] p-3 text-sm" maxLength={1000} value={reviewNote} disabled={selected.reviewState === "rejected" || selected.reviewState === "approved"} onChange={(event) => setReviewNotes((current) => ({ ...current, [selected.id]: event.target.value }))} />
            </label>
            <button className={`${STYLES.button} ${dirty ? "visible" : "invisible"}`} type="button" onClick={() => void saveDraft()} disabled={!dirty || busy}>Save Changes</button>
            <div className={LAYOUT_STYLES.row}>
              <button className={STYLES.secondary} type="button" disabled aria-disabled="true">Approve to Workstream unavailable</button>
              <button className={STYLES.secondary} type="button" onClick={() => setConfirmReject(true)} disabled={busy || dirty || selected.reviewState === "rejected" || selected.reviewState === "approved"}>Reject</button>
            </div>
          </>}
          <p className={STYLES.alert}>Gemini extraction and Workstream creation remain disabled. Use synthetic or redacted samples only for prompt development.</p>
        </section>
      </div>

      {confirmReject && <div className={STYLES.dialogBackdrop}>
        <section className={STYLES.dialog} role="dialog" aria-modal="true" aria-labelledby="reject-title" aria-describedby="reject-description">
          <h2 id="reject-title" className="m-0 text-lg font-semibold">Reject this proposal?</h2>
          <p id="reject-description" className={STYLES.body}>The proposal will remain in the tool queue as rejected. This will not create a Workstream activity.</p>
          {error && <p className={STYLES.error} role="alert">{error}</p>}
          <div className={LAYOUT_STYLES.row}>
            <button className={STYLES.secondary} type="button" onClick={() => setConfirmReject(false)} disabled={busy}>Cancel</button>
            <button className={STYLES.button} type="button" onClick={() => void rejectProposal()} disabled={busy}>Reject proposal</button>
          </div>
        </section>
      </div>}
    </main>
  );
}
