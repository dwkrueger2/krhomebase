import { createServerClient, type ServerClient } from "@krhomebase/tool-sdk/server";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CERTIFICATES_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const OAUTH_TRANSACTION_COOKIE = "__Host-chat-tool-oauth";
const GOOGLE_SESSION_COOKIE = "__Host-chat-tool-session";
const OAUTH_TRANSACTION_MAX_AGE_SECONDS = 600;
const GOOGLE_SESSION_MAX_AGE_SECONDS = 3600;

export interface GoogleSsoConfig {
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  KR_EXTERNAL_API_URL?: string;
  KR_TOOL_CLIENT_ID?: string;
  KR_TOOL_CLIENT_SECRET?: string;
}

export interface GoogleIdentity {
  email: string;
  subject: string;
  expiresAt: number;
}

interface GoogleJwtHeader {
  alg?: string;
  kid?: string;
}

interface GoogleJwtClaims {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  exp?: number;
  iat?: number;
  nonce?: string;
}

interface GoogleJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface GoogleJwkResponse {
  keys?: GoogleJwk[];
}

interface OAuthTransaction {
  state: string;
  nonce: string;
  verifier: string;
  createdAt: number;
}

interface GoogleTokenResponse {
  id_token?: string;
}

interface GoogleCertificateCache {
  keys: GoogleJwk[];
  expiresAt: number;
}

let certificateCache: GoogleCertificateCache | null = null;
let registrationClient: ServerClient | null = null;

export class GoogleSsoError extends Error {
  constructor(readonly code: "GOOGLE_SSO_NOT_CONFIGURED" | "TOOL_ACCESS_UNAVAILABLE" | "GOOGLE_AUTH_REQUIRED" | "GOOGLE_SESSION_INVALID" | "GOOGLE_ACCOUNT_NOT_ALLOWED") {
    super(code);
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
}

function cookieValues(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!result.has(name)) result.set(name, value);
  }
  return result;
}

function readCookie(request: Request, name: string): string | null {
  const value = cookieValues(request).get(name);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, maxAge)}; Secure; HttpOnly; SameSite=Lax`;
}

function noStoreHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

function safeConfig(config: GoogleSsoConfig): { clientId: string; redirectUri: URL } {
  const clientId = config.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const redirectUriText = config.GOOGLE_OAUTH_REDIRECT_URI?.trim();

  if (!clientId || clientId.includes("NOT_SET") || !redirectUriText || redirectUriText.includes("NOT_SET")) {
    throw new GoogleSsoError("GOOGLE_SSO_NOT_CONFIGURED");
  }

  try {
    const redirectUri = new URL(redirectUriText);
    if (redirectUri.protocol !== "https:" || redirectUri.pathname !== "/auth" || redirectUri.search || redirectUri.hash) {
      throw new Error("Invalid OAuth redirect URI");
    }
    return { clientId, redirectUri };
  } catch {
    throw new GoogleSsoError("GOOGLE_SSO_NOT_CONFIGURED");
  }
}

function requireClientSecret(config: GoogleSsoConfig): string {
  const secret = config.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!secret || secret.includes("NOT_SET")) throw new GoogleSsoError("GOOGLE_SSO_NOT_CONFIGURED");
  return secret;
}

/** Reads this tool registration's current permitted users; errors fail closed and the list is never cached. */
async function permittedUsers(config: GoogleSsoConfig): Promise<Set<string>> {
  if (!registrationClient) {
    const baseUrl = config.KR_EXTERNAL_API_URL?.trim();
    const clientId = config.KR_TOOL_CLIENT_ID?.trim();
    const clientSecret = config.KR_TOOL_CLIENT_SECRET?.trim();
    if (!baseUrl || baseUrl.includes("NOT_SET") || !clientId || clientId.includes("NOT_SET") || !clientSecret || clientSecret.includes("NOT_SET")) {
      throw new GoogleSsoError("TOOL_ACCESS_UNAVAILABLE");
    }
    registrationClient = createServerClient({ baseUrl, clientId, clientSecret, scopes: ["tool-registration:read"] });
  }
  try {
    const reply = await registrationClient.getPermittedUsers();
    if (!reply.ok || !Array.isArray(reply.data.emails)) throw new Error("No permitted-user list");
    return new Set(reply.data.emails.map((email) => email.trim().toLowerCase()));
  } catch {
    throw new GoogleSsoError("TOOL_ACCESS_UNAVAILABLE");
  }
}

function newRandomValue(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function encodeTransaction(transaction: OAuthTransaction): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(transaction)));
}

function decodeTransaction(value: string): OAuthTransaction | null {
  try {
    const transaction = JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as Partial<OAuthTransaction>;
    if (
      typeof transaction.state !== "string" || typeof transaction.nonce !== "string" ||
      typeof transaction.verifier !== "string" || typeof transaction.createdAt !== "number"
    ) return null;
    return transaction as OAuthTransaction;
  } catch {
    return null;
  }
}

async function getGoogleCertificates(): Promise<GoogleJwk[]> {
  const now = Date.now();
  if (certificateCache && certificateCache.expiresAt > now) return certificateCache.keys;

  const response = await fetch(GOOGLE_CERTIFICATES_ENDPOINT, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new GoogleSsoError("GOOGLE_SESSION_INVALID");
  const document = await response.json() as GoogleJwkResponse;
  if (!Array.isArray(document.keys) || document.keys.length === 0) throw new GoogleSsoError("GOOGLE_SESSION_INVALID");

  const maxAge = Number(/max-age=(\d+)/i.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 300);
  certificateCache = { keys: document.keys, expiresAt: now + Math.max(60, Math.min(maxAge, 3600)) * 1000 };
  return certificateCache.keys;
}

async function verifyGoogleIdToken(
  token: string,
  config: GoogleSsoConfig,
  expectedNonce?: string,
): Promise<GoogleIdentity> {
  if (token.length > 12_000) throw new GoogleSsoError("GOOGLE_SESSION_INVALID");
  const { clientId } = safeConfig(config);

  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed token");
    const header = parseJwtPart<GoogleJwtHeader>(parts[0]);
    const claims = parseJwtPart<GoogleJwtClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token");

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const verifiedEmail = claims.email_verified === true || claims.email_verified === "true";
    if (
      (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") ||
      !audiences.includes(clientId) || (claims.azp && claims.azp !== clientId) ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      typeof claims.iat !== "number" || claims.iat > now + 60 ||
      typeof claims.sub !== "string" || !claims.sub ||
      typeof claims.email !== "string" || !verifiedEmail ||
      (expectedNonce !== undefined && claims.nonce !== expectedNonce)
    ) throw new Error("Invalid Google identity token");

    const signingKey = (await getGoogleCertificates()).find((key) => key.kid === header.kid);
    if (!signingKey) throw new Error("Unknown signing key");
    const key = await crypto.subtle.importKey(
      "jwk",
      signingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new Error("Invalid signature");

    const email = claims.email.trim().toLowerCase();
    if (!(await permittedUsers(config)).has(email)) throw new GoogleSsoError("GOOGLE_ACCOUNT_NOT_ALLOWED");

    return { email, subject: claims.sub, expiresAt: claims.exp };
  } catch (error) {
    if (error instanceof GoogleSsoError) throw error;
    throw new GoogleSsoError("GOOGLE_SESSION_INVALID");
  }
}

function jsonResponse(body: unknown, status = 200, headers = new Headers()): Response {
  const responseHeaders = noStoreHeaders();
  for (const [name, value] of headers) responseHeaders.append(name, value);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(body, { status, headers: responseHeaders });
}

function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = noStoreHeaders();
  headers.set("Location", location);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function authErrorResponse(error: GoogleSsoError, requestId: string): Response {
  const status = error.code === "GOOGLE_SSO_NOT_CONFIGURED" || error.code === "TOOL_ACCESS_UNAVAILABLE" ? 503
    : error.code === "GOOGLE_AUTH_REQUIRED" ? 401
      : error.code === "GOOGLE_ACCOUNT_NOT_ALLOWED" ? 403 : 401;
  const message = error.code === "GOOGLE_SSO_NOT_CONFIGURED" ? "Google sign-in is not configured."
    : error.code === "TOOL_ACCESS_UNAVAILABLE" ? "Tool access could not be verified. Try again later."
    : error.code === "GOOGLE_AUTH_REQUIRED" ? "Sign in with the approved Google account to continue."
      : error.code === "GOOGLE_ACCOUNT_NOT_ALLOWED" ? "This Google account is not approved for the tool."
        : "The Google sign-in session could not be verified.";
  return jsonResponse({ ok: false, error: { code: error.code, message }, requestId }, status);
}

/** Starts a Google OpenID Connect authorization-code flow with state, nonce, and PKCE. */
async function startGoogleSignInWithPkce(config: GoogleSsoConfig, requestId: string): Promise<Response> {
  try {
    const { clientId, redirectUri } = safeConfig(config);
    const transaction: OAuthTransaction = {
      state: newRandomValue(),
      nonce: newRandomValue(),
      verifier: newRandomValue(48),
      createdAt: Date.now(),
    };
    const challenge = await createCodeChallenge(transaction.verifier);
    const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri.toString(),
      response_type: "code",
      scope: "openid email",
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
      access_type: "online",
    }).toString();
    const headers = noStoreHeaders();
    headers.set("Location", authorizationUrl.toString());
    headers.append("Set-Cookie", cookieHeader(OAUTH_TRANSACTION_COOKIE, encodeTransaction(transaction), OAUTH_TRANSACTION_MAX_AGE_SECONDS));
    headers.set("X-Request-Id", requestId);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return authErrorResponse(error instanceof GoogleSsoError ? error : new GoogleSsoError("GOOGLE_SSO_NOT_CONFIGURED"), requestId);
  }
}

/** Exchanges the callback code, validates Google's ID token, and sets a short-lived HttpOnly session cookie. */
async function finishGoogleSignIn(request: Request, config: GoogleSsoConfig, url: URL, requestId: string): Promise<Response> {
  const transactionText = readCookie(request, OAUTH_TRANSACTION_COOKIE);
  const transaction = transactionText ? decodeTransaction(transactionText) : null;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const clearTransaction = cookieHeader(OAUTH_TRANSACTION_COOKIE, "", 0);

  if (url.searchParams.has("error") || !transaction || !state || !code || state !== transaction.state ||
    Date.now() - transaction.createdAt > OAUTH_TRANSACTION_MAX_AGE_SECONDS * 1000) {
    return redirectResponse("/?auth=failed", [clearTransaction, cookieHeader(GOOGLE_SESSION_COOKIE, "", 0)]);
  }

  try {
    const { clientId, redirectUri } = safeConfig(config);
    const clientSecret = requireClientSecret(config);
    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri.toString(),
        grant_type: "authorization_code",
        code_verifier: transaction.verifier,
      }),
    });
    if (!tokenResponse.ok) throw new GoogleSsoError("GOOGLE_SESSION_INVALID");
    const tokenResult = await tokenResponse.json() as GoogleTokenResponse;
    if (typeof tokenResult.id_token !== "string") throw new GoogleSsoError("GOOGLE_SESSION_INVALID");

    const identity = await verifyGoogleIdToken(tokenResult.id_token, config, transaction.nonce);
    const maxAge = Math.min(GOOGLE_SESSION_MAX_AGE_SECONDS, identity.expiresAt - Math.floor(Date.now() / 1000));
    return redirectResponse("/", [
      clearTransaction,
      cookieHeader(GOOGLE_SESSION_COOKIE, tokenResult.id_token, maxAge),
    ]);
  } catch (error) {
    const safeError = error instanceof GoogleSsoError ? error : new GoogleSsoError("GOOGLE_SESSION_INVALID");
    return redirectResponse(`/?auth=${safeError.code === "GOOGLE_ACCOUNT_NOT_ALLOWED" ? "not-approved" : "failed"}`,
      [clearTransaction, cookieHeader(GOOGLE_SESSION_COOKIE, "", 0)]);
  }
}

/** Verifies the signed Google session cookie and enforces the configured exact-email allowlist. */
export async function requireGoogleSession(request: Request, config: GoogleSsoConfig): Promise<GoogleIdentity> {
  const token = readCookie(request, GOOGLE_SESSION_COOKIE);
  if (!token) throw new GoogleSsoError("GOOGLE_AUTH_REQUIRED");
  return verifyGoogleIdToken(token, config);
}

/** Handles standalone Google sign-in routes before any protected Worker API route runs. */
export async function handleGoogleSsoRoute(
  request: Request,
  config: GoogleSsoConfig,
  url: URL,
  requestId: string,
): Promise<Response | null> {
  try {
    const { redirectUri } = safeConfig(config);
    if (url.origin !== redirectUri.origin) {
      return authErrorResponse(new GoogleSsoError("GOOGLE_SSO_NOT_CONFIGURED"), requestId);
    }
  } catch (error) {
    if (url.pathname.startsWith("/auth/") || url.pathname === "/auth") {
      return authErrorResponse(error instanceof GoogleSsoError ? error : new GoogleSsoError("GOOGLE_SSO_NOT_CONFIGURED"), requestId);
    }
  }

  if (url.pathname === "/auth/start" && request.method === "GET") return startGoogleSignInWithPkce(config, requestId);
  if (url.pathname === "/auth" && request.method === "GET") return finishGoogleSignIn(request, config, url, requestId);

  if (url.pathname === "/auth/session" && request.method === "GET") {
    try {
      const identity = await requireGoogleSession(request, config);
      return jsonResponse({ ok: true, data: { authenticated: true, provider: "Google", email: identity.email, expiresAt: identity.expiresAt }, requestId });
    } catch (error) {
      return authErrorResponse(error instanceof GoogleSsoError ? error : new GoogleSsoError("GOOGLE_SESSION_INVALID"), requestId);
    }
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== url.origin) return jsonResponse({ ok: false, error: { code: "ORIGIN_INVALID", message: "The sign-out request origin could not be verified." }, requestId }, 403);
    const headers = noStoreHeaders();
    headers.append("Set-Cookie", cookieHeader(GOOGLE_SESSION_COOKIE, "", 0));
    return jsonResponse({ ok: true, data: { signedOut: true }, requestId }, 200, headers);
  }

  return null;
}

