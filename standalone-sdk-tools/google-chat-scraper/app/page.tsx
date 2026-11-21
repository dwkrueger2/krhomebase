"use client";

import { useEffect, useState } from "react";

type GoogleSession = { authenticated: boolean; provider?: string; email?: string; expiresAt?: number };
type ApiReply<T> = { ok: true; data: T; requestId: string } | { ok: false; error: { code: string; message: string }; requestId: string };

const LAYOUT_STYLES = {
  page: "mx-auto gap-6 px-4 py-6 grid min-h-screen w-full max-w-4xl content-start md:px-7",
  stack: "grid gap-3",
  row: "flex flex-wrap items-center justify-between gap-3",
  actions: "flex flex-wrap gap-2",
  resetMargin: "m-0",
};

const STYLES = {
  title: "text-2xl font-semibold tracking-tight md:text-3xl",
  heading: "text-lg font-semibold",
  body: "max-w-[70ch] text-sm leading-6 text-[var(--kr-theme-muted,#a7afb8)]",
  panel: "grid gap-4 rounded-xl border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-surface,#1d232a)] p-4",
  status: "rounded-lg border border-[var(--kr-theme-border,#39414a)] px-3 py-2 text-sm",
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  error: "rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm leading-5 text-red-100",
  output: "min-h-48 w-full resize-y rounded-lg border border-[var(--kr-theme-border,#39414a)] bg-[var(--kr-theme-background,#14181d)] p-3 font-mono text-xs leading-5 text-[var(--kr-theme-foreground,#f3f4f6)]",
  button: "inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--kr-theme-orange,#f28c28)] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kr-theme-orange,#f28c28)] disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--kr-theme-border,#39414a)] px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kr-theme-orange,#f28c28)] disabled:cursor-not-allowed disabled:opacity-50",
  link: "text-sm font-medium text-[var(--kr-theme-orange,#f28c28)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kr-theme-orange,#f28c28)]",
  // b1: ' border-red-800 border-4 border-dashed',
  // b2: ' border-blue-800 border-4 border-dashed',
  // b3: ' border-green-800 border-4 border-dashed',
  // b4: ' border-purple-800 border-4 border-dashed',
};
// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Parses the Worker's standard response envelope without showing unauthenticated JSON. */
async function readReply<T>(response: Response): Promise<ApiReply<T>> {
  return await response.json() as ApiReply<T>;
}

/** Landing page for Google SSO and protected Worker connectivity checks. */
export default function HomePage() {
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [validated, setValidated] = useState(false);
  const [healthValidated, setHealthValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("Select a diagnostic after signing in to view its JSON response.");

  async function loadSession() {
    setCheckingSession(true);
    setError(null);
    const authResult = new URLSearchParams(window.location.search).get("auth");
    if (authResult === "not-approved") setError("This Google account is not approved for the tool.");
    else if (authResult === "failed") setError("Google sign-in could not be completed. Check the OAuth setup and try again.");
    try {
      const response = await fetch("/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) {
        setSession({ authenticated: false });
        return;
      }
      const result = await readReply<GoogleSession>(response);
      if (!result.ok) throw new Error(result.error.message);
      setSession(result.data);
      setValidated(false);
    } catch {
      setSession({ authenticated: false });
      setError("Could not check Google sign-in. Refresh the page and try again.");
    } finally {
      setCheckingSession(false);
    }
  }

  useEffect(() => { void loadSession(); }, []);

  async function runDiagnostic(path: "/api/health-check" | "/api/database-status") {
    setBusy(true);
    setError(null);
    setValidated(false);
    try {
      const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
      const result = await readReply<unknown>(response);
      if (!result.ok) {
        setHealthValidated(false);
        setSession({ authenticated: false });
        setError(result.error.message);
        setOutput("Sign in with an approved Google account before viewing diagnostic data.");
        return;
      }
      setOutput(JSON.stringify(result.data, null, 2));
      setValidated(true);
      if (path === "/api/health-check") setHealthValidated(true);
    } catch {
      if (path === "/api/health-check") setHealthValidated(false);
      setError("The diagnostic request could not reach the Worker. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Sign out failed.");
      setSession({ authenticated: false });
      setValidated(false);
      setHealthValidated(false);
      setOutput("Signed out. Sign in again to run diagnostics.");
    } catch {
      setError("Could not sign out. Refresh the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={LAYOUT_STYLES.page}>
      {/* Authentication header: show Google identity and the account entry action. */}
      <header className={LAYOUT_STYLES.stack}>
        <h1 className={`${LAYOUT_STYLES.resetMargin} ${STYLES.title}`}>Google Chat tool connectivity</h1>
        <p className={`${LAYOUT_STYLES.resetMargin} ${STYLES.body}`}>Sign in with the approved Google account, then check the isolated Worker and its D1 migration ledger. These checks do not read Google Chat messages.</p>
        <div className={LAYOUT_STYLES.row}>
          {checkingSession ? <span className={`${STYLES.status} ${STYLES.pending}`} role="status">Checking sign-in…</span> : session?.authenticated
            ? <span className={`${STYLES.status} ${STYLES.ok}`} role="status">Google signed in as {session.email}</span>
            : <span className={`${STYLES.status} ${STYLES.pending}`} role="status">Google sign-in required</span>}
          {session?.authenticated
            ? <button className={STYLES.secondary} type="button" onClick={() => void signOut()} disabled={busy}>Sign out</button>
            : <a className={STYLES.button} href="/auth/start" aria-disabled={checkingSession || busy}>Sign in with Google</a>}
        </div>
      </header>

      {error && <p className={`${LAYOUT_STYLES.resetMargin} ${STYLES.error}`} role="alert">{error}</p>}

      {/* Diagnostics workspace: authenticated buttons and their read-only JSON output. */}
      <section className={STYLES.panel} aria-labelledby="diagnostics-heading">
        <h2 id="diagnostics-heading" className={`${LAYOUT_STYLES.resetMargin} ${STYLES.heading}`}>Protected diagnostics</h2>
        <p className={`${LAYOUT_STYLES.resetMargin} ${STYLES.body}`}>Each request is checked again by the D1-owning Worker. Responses appear below only after Google identity validation.</p>
        <div className={LAYOUT_STYLES.actions}>
          <button className={STYLES.button} type="button" onClick={() => void runDiagnostic("/api/health-check")} disabled={!session?.authenticated || checkingSession || busy}>1 · Health check</button>
          <button className={STYLES.secondary} type="button" onClick={() => void runDiagnostic("/api/database-status")} disabled={!session?.authenticated || checkingSession || busy}>2 · Database status</button>
          <span className={`${STYLES.status} ${healthValidated ? STYLES.ok : STYLES.pending}`} role="status">Health check: {healthValidated ? "validated" : "not validated"}</span>
          {validated && <span className={`${STYLES.status} ${STYLES.ok}`} role="status">Response authenticated</span>}
        </div>
        <label className={`${LAYOUT_STYLES.stack} text-sm font-medium`} htmlFor="diagnostic-output">Worker JSON response
          <textarea id="diagnostic-output" className={STYLES.output} readOnly value={output} aria-live="polite" />
        </label>
      </section>

      {/* Tool boundary footer: link to review and state the disabled integrations. */}
      <footer className={LAYOUT_STYLES.row}>
        <p className={`${LAYOUT_STYLES.resetMargin} ${STYLES.body}`}>Google sign-in is separate from KR Homebase OAuth. Google Chat ingestion, Gemini processing, and message posting are disabled.</p>
        <a className={STYLES.link} href="/review">Open proposal review</a>
      </footer>
    </main>
  );
}
