import packageMetadata from "../../package.json";
import { AccessError, requireReviewer, type Reviewer } from "./access.ts";
import { GoogleSsoError, handleGoogleSsoRoute, requireGoogleSession, type GoogleSsoConfig } from "./google-sso.ts";

type ReviewState = "pending" | "approved" | "rejected" | "needs_revision";

interface ActivityProposal {
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
}

interface Env {
  CHAT_IMPORT_DB: {
    prepare(sql: string): PreparedStatement;
  };
  CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
  LIVE_CHAT_SYNC_ENABLED?: string;
  REAL_MESSAGE_GEMINI_ENABLED?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  KR_EXTERNAL_API_URL?: string;
  KR_TOOL_CLIENT_ID?: string;
  KR_TOOL_CLIENT_SECRET?: string;
}


interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

interface ProposalRow extends ActivityProposal {
  id: string;
  message_resource_name: string;
  classification: string;
  proposal_json: string;
  review_state: ReviewState;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  create_time: string;
  sender_display_name: string | null;
  message_text?: string;
}

const REVIEW_STATES: readonly ReviewState[] = ["pending", "approved", "rejected", "needs_revision"];
const ACTIVITY_TYPES: readonly ActivityProposal["activity_type"][] = ["phone_call", "email", "other", "unknown"];
const TIME_BASES: readonly ActivityProposal["occurred_time_basis"][] = ["explicit_in_message", "chat_create_time", "unknown"];
const DIRECTIONS: readonly ActivityProposal["direction"][] = ["inbound", "outbound", "internal", "unknown"];
const CONFIDENCE: readonly ActivityProposal["confidence"][] = ["high", "medium", "low"];
const PROPOSAL_KEYS = [
  "segment_index", "activity_type", "occurred_at", "occurred_time_basis", "timezone", "direction",
  "client_or_matter_reference", "contact_name", "title", "note", "next_steps", "supporting_phrases",
  "confidence", "review_reasons",
] as const;

function reply<T>(requestId: string, data: T, status = 200): Response {
  return Response.json({ ok: true, data, requestId }, { status });
}

function fail(requestId: string, status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message }, requestId }, { status });
}

function isBoundedText(value: unknown, max: number, allowNull = false): value is string | null {
  return (allowNull && value === null) || (typeof value === "string" && value.length <= max);
}

function isTextList(value: unknown, maxItems: number, maxText: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string" && item.length <= maxText);
}

/** Accepts only the extraction prompt's editable proposal shape and bounded field values. */
function parseProposal(value: unknown): ActivityProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const proposal = value as Record<string, unknown>;
  if (Object.keys(proposal).some((key) => !(PROPOSAL_KEYS as readonly string[]).includes(key))) return null;
  if (!Number.isInteger(proposal.segment_index) || (proposal.segment_index as number) < 0) return null;
  if (!ACTIVITY_TYPES.includes(proposal.activity_type as ActivityProposal["activity_type"])) return null;
  if (!TIME_BASES.includes(proposal.occurred_time_basis as ActivityProposal["occurred_time_basis"])) return null;
  if (!DIRECTIONS.includes(proposal.direction as ActivityProposal["direction"])) return null;
  if (!CONFIDENCE.includes(proposal.confidence as ActivityProposal["confidence"])) return null;
  if (!isBoundedText(proposal.occurred_at, 100, true) || !isBoundedText(proposal.timezone, 100, true)) return null;
  if (!isBoundedText(proposal.client_or_matter_reference, 300, true) || !isBoundedText(proposal.contact_name, 200, true)) return null;
  if (!isBoundedText(proposal.title, 200) || !isBoundedText(proposal.note, 4000)) return null;
  if (!isTextList(proposal.next_steps, 20, 500) || !isTextList(proposal.supporting_phrases, 20, 500)) return null;
  if (!isTextList(proposal.review_reasons, 20, 500)) return null;
  return proposal as unknown as ActivityProposal;
}

function parseStoredProposal(row: ProposalRow): ActivityProposal | null {
  try {
    return parseProposal(JSON.parse(row.proposal_json));
  } catch {
    return null;
  }
}

function mapQueueRow(row: ProposalRow) {
  return {
    id: row.id,
    messageResourceName: row.message_resource_name,
    createTime: row.create_time,
    senderDisplayName: row.sender_display_name,
    classification: row.classification,
    reviewState: row.review_state,
    proposal: parseStoredProposal(row),
    updatedAt: row.updated_at,
  };
}

async function getProposal(env: Env, id: string): Promise<ProposalRow | null> {
  return env.CHAT_IMPORT_DB.prepare(`
    SELECT p.id, p.message_resource_name, p.segment_index, p.classification, p.proposal_json,
      p.review_state, p.reviewer_id, p.reviewed_at, p.review_note, p.created_at, p.updated_at,
      m.create_time, m.sender_display_name, m.message_text
    FROM activity_proposals p
    JOIN chat_messages m ON m.message_resource_name = p.message_resource_name
    WHERE p.id = ?
  `).bind(id).first<ProposalRow>();
}

async function handleApi(request: Request, env: Env, url: URL, requestId: string): Promise<Response> {
  if ((url.pathname === "/api/health-check" || url.pathname === "/api/database-status") && request.method === "GET") {
    let identity: Awaited<ReturnType<typeof requireGoogleSession>>;
    try {
      identity = await requireGoogleSession(request, env);
    } catch (error) {
      if (error instanceof GoogleSsoError) {
        const status = error.code === "GOOGLE_SSO_NOT_CONFIGURED" || error.code === "TOOL_ACCESS_UNAVAILABLE" ? 503
          : error.code === "GOOGLE_ACCOUNT_NOT_ALLOWED" ? 403 : 401;
        const message = error.code === "GOOGLE_SSO_NOT_CONFIGURED" ? "Google sign-in is not configured."
          : error.code === "TOOL_ACCESS_UNAVAILABLE" ? "Tool access could not be verified. Try again later."
          : error.code === "GOOGLE_ACCOUNT_NOT_ALLOWED" ? "This Google account is not approved for the tool."
            : "Sign in with the approved Google account to continue.";
        return fail(requestId, status, error.code, message);
      }
      return fail(requestId, 401, "GOOGLE_SESSION_INVALID", "The Google sign-in session could not be verified.");
    }

    if (url.pathname === "/api/health-check") {
      return reply(requestId, {
        ...healthData(env),
        authentication: { status: "validated", provider: "Google", email: identity.email },
      });
    }

    try {
      const result = await env.CHAT_IMPORT_DB.prepare(
        "SELECT id, file_name, applied_at FROM chat_schema_migration ORDER BY id",
      ).all<{ id: string; file_name: string; applied_at: string }>();
      const migrations = result.results ?? [];
      return reply(requestId, {
        database: { status: "connected", binding: "CHAT_IMPORT_DB" },
        schema: {
          initialMigrationApplied: migrations.some((migration) => migration.file_name === "0001_initial_sql_d1_start.sql"),
          migrations,
        },
        authentication: { status: "validated", provider: "Google", email: identity.email },
      });
    } catch {
      return fail(requestId, 503, "DATABASE_STATUS_UNAVAILABLE", "The D1 migration status could not be read.");
    }
  }

  if (url.pathname === "/api/status" && request.method === "GET") {
    return reply(requestId, {
      liveSync: "disabled",
      realMessageGemini: "disabled",
      accessSettingsPresent: Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && !env.ACCESS_TEAM_DOMAIN.includes("NOT_SET") && !env.ACCESS_AUD.includes("NOT_SET")),
      readiness: "unverified",
    });
  }

  let reviewer: Reviewer;
  try {
    reviewer = await requireReviewer(request, env);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "ACCESS_NOT_CONFIGURED") return fail(requestId, 503, error.code, "Reviewer access is not configured.");
      if (error.code === "AUTH_REQUIRED") return fail(requestId, 401, error.code, "A valid Cloudflare Access session is required.");
      return fail(requestId, 401, error.code, "The Cloudflare Access session could not be verified.");
    }
    return fail(requestId, 401, "ACCESS_TOKEN_INVALID", "The Cloudflare Access session could not be verified.");
  }

  if (url.pathname === "/api/sync" && request.method === "POST") {
    return fail(requestId, 501, "SYNC_NOT_READY", "Google Chat sync is not implemented. No messages were requested or imported.");
  }

  if (url.pathname === "/api/intake" && request.method === "GET") {
    const state = url.searchParams.get("state") ?? "pending";
    if (state !== "all" && !REVIEW_STATES.includes(state as ReviewState)) {
      return fail(requestId, 400, "INVALID_REVIEW_STATE", "Choose a supported queue state.");
    }
    const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const cursor = url.searchParams.get("cursor");
    const [beforeTime, beforeId] = cursor ? cursor.split("|", 2) : [null, null];
    const query = `
      SELECT p.id, p.message_resource_name, p.segment_index, p.classification, p.proposal_json,
        p.review_state, p.reviewer_id, p.reviewed_at, p.review_note, p.created_at, p.updated_at,
        m.create_time, m.sender_display_name
      FROM activity_proposals p
      JOIN chat_messages m ON m.message_resource_name = p.message_resource_name
      WHERE (? = 'all' OR p.review_state = ?)
        AND (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))
      ORDER BY p.created_at DESC, p.id DESC LIMIT ?
    `;
    try {
      const result = await env.CHAT_IMPORT_DB.prepare(query)
        .bind(state, state, beforeTime, beforeTime, beforeTime, beforeId, limit + 1)
        .all<ProposalRow>();
      const rows = result.results ?? [];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      return reply(requestId, {
        items: page.map(mapQueueRow),
        nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null,
        reviewer: reviewer.email,
      });
    } catch {
      return fail(requestId, 503, "INTAKE_UNAVAILABLE", "The intake queue is not ready.");
    }
  }

  const match = /^\/api\/intake\/([0-9a-f-]{36})(?:\/(approve|reject))?$/.exec(url.pathname);
  if (!match) return fail(requestId, 404, "NOT_FOUND", "The requested tool route was not found.");
  const [, id, action] = match;

  if (action === "approve" && request.method === "POST") {
    return fail(requestId, 501, "HOMEBASE_APPROVAL_NOT_READY", "Workstream approval is disabled until Homebase provides an authorized idempotent route.");
  }
  if (!action && request.method === "GET") {
    try {
      const row = await getProposal(env, id);
      if (!row) return fail(requestId, 404, "PROPOSAL_NOT_FOUND", "The proposal was not found.");
      const proposal = parseStoredProposal(row);
      if (!proposal) return fail(requestId, 500, "PROPOSAL_INVALID", "The saved proposal needs administrator review.");
      return reply(requestId, {
        ...mapQueueRow(row),
        sourceMessage: {
          messageResourceName: row.message_resource_name,
          createTime: row.create_time,
          senderDisplayName: row.sender_display_name,
          text: row.message_text,
        },
        proposal,
        reviewNote: row.review_note,
      });
    } catch {
      return fail(requestId, 503, "INTAKE_UNAVAILABLE", "The intake queue is not ready.");
    }
  }
  if (!action && request.method === "PATCH") {
    const body = await request.json().catch(() => null) as { proposal?: unknown; updatedAt?: unknown; reviewNote?: unknown } | null;
    const proposal = parseProposal(body?.proposal);
    if (!proposal || !isBoundedText(body?.updatedAt, 100) || !isBoundedText(body?.reviewNote, 1000, true)) {
      return fail(requestId, 400, "INVALID_PROPOSAL", "The edited proposal or saved version is invalid.");
    }
    const now = new Date().toISOString();
    try {
      const current = await getProposal(env, id);
      if (!current) return fail(requestId, 404, "PROPOSAL_NOT_FOUND", "The proposal was not found.");
      if (proposal.segment_index !== current.segment_index) return fail(requestId, 400, "SEGMENT_INDEX_IMMUTABLE", "A proposal's source segment cannot be changed.");
      const result = await env.CHAT_IMPORT_DB.prepare(`
        UPDATE activity_proposals SET proposal_json = ?, reviewer_id = ?, review_note = ?, updated_at = ?
        WHERE id = ? AND updated_at = ? AND review_state IN ('pending', 'needs_revision')
      `).bind(JSON.stringify(proposal), reviewer.email, body.reviewNote, now, id, body.updatedAt).run();
      if (!result.meta?.changes) return fail(requestId, 409, "PROPOSAL_CHANGED", "The proposal changed or is no longer editable. Refresh the review item.");
      return reply(requestId, { id, updatedAt: now, savedBy: reviewer.email });
    } catch {
      return fail(requestId, 503, "INTAKE_UNAVAILABLE", "The intake queue is not ready.");
    }
  }
  if (action === "reject" && request.method === "POST") {
    const body = await request.json().catch(() => ({})) as { note?: unknown };
    if (!isBoundedText(body.note ?? null, 1000, true)) return fail(requestId, 400, "INVALID_REVIEW_NOTE", "The review note is too long.");
    const now = new Date().toISOString();
    try {
      const result = await env.CHAT_IMPORT_DB.prepare(`
        UPDATE activity_proposals SET review_state = 'rejected', reviewer_id = ?, reviewed_at = ?,
          review_note = ?, updated_at = ?
        WHERE id = ? AND review_state IN ('pending', 'needs_revision')
      `).bind(reviewer.email, now, body.note ?? null, now, id).run();
      if (!result.meta?.changes) return fail(requestId, 409, "PROPOSAL_NOT_REJECTABLE", "The proposal was already reviewed or was not found.");
      return reply(requestId, { id, reviewState: "rejected", reviewedAt: now });
    } catch {
      return fail(requestId, 503, "INTAKE_UNAVAILABLE", "The intake queue is not ready.");
    }
  }

  return fail(requestId, 405, "METHOD_NOT_ALLOWED", "That method is not available for this route.");
}

/** Returns deployment health metadata without exposing binding values or credentials. */
function healthData(env: Env) {
  return {
    status: "ok",
    version: packageMetadata.version,
    protocol: 1,
    deployment: env.CF_VERSION_METADATA ?? null,
    liveChatSyncEnabled: false,
    realMessageGeminiEnabled: false,
  };
}

/** Returns the public liveness document without D1 state or identity information. */
function health(env: Env): Response {
  return Response.json(healthData(env));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const authResponse = await handleGoogleSsoRoute(request, env as GoogleSsoConfig, url, requestId);
    if (authResponse) return authResponse;
    if (url.pathname === "/health-check") return health(env);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url, requestId);
      } catch {
        return fail(requestId, 500, "INTERNAL_ERROR", "The request could not be completed.");
      }
    }
    return fail(requestId, 404, "NOT_FOUND", "The requested tool route was not found.");
  },
  async scheduled(_controller: { scheduledTime: number; cron: string }, _env: Env): Promise<void> {
    // Google Chat ingestion stays unimplemented until its external access and data-use gates are complete.
  },
};
