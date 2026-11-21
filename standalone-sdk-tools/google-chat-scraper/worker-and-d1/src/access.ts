export interface Reviewer {
  email: string;
  subject: string;
}

interface AccessClaims {
  aud?: string | string[];
  iss?: string;
  sub?: string;
  email?: string;
  exp?: number;
  nbf?: number;
}

interface AccessKey extends JsonWebKey {
  kid?: string;
}

interface AccessCertificateSet {
  keys?: AccessKey[];
}

interface AccessConfig {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

interface CachedKeys {
  expiresAt: number;
  keys: AccessKey[];
}

let cachedKeys: CachedKeys | null = null;

export class AccessError extends Error {
  constructor(readonly code: "ACCESS_NOT_CONFIGURED" | "AUTH_REQUIRED" | "ACCESS_TOKEN_INVALID") {
    super(code);
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseTokenPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function getAccessKeys(teamDomain: string): Promise<AccessKey[]> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.keys;

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new AccessError("ACCESS_TOKEN_INVALID");
  const document = await response.json() as AccessCertificateSet;
  if (!Array.isArray(document.keys) || document.keys.length === 0) throw new AccessError("ACCESS_TOKEN_INVALID");
  cachedKeys = { keys: document.keys, expiresAt: now + 5 * 60 * 1000 };
  return document.keys;
}

/** Verifies the Cloudflare Access JWT and its configured audience before source or review data is returned. */
export async function requireReviewer(request: Request, config: AccessConfig): Promise<Reviewer> {
  const teamDomain = config.ACCESS_TEAM_DOMAIN?.trim();
  const audience = config.ACCESS_AUD?.trim();
  if (!teamDomain || !audience || teamDomain.includes("NOT_SET") || audience.includes("NOT_SET")) {
    throw new AccessError("ACCESS_NOT_CONFIGURED");
  }
  if (!/^[a-z0-9.-]+$/i.test(teamDomain)) throw new AccessError("ACCESS_NOT_CONFIGURED");

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16_384) throw new AccessError("AUTH_REQUIRED");

  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed token");
    const header = parseTokenPart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = parseTokenPart<AccessClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token");
    const expectedIssuer = `https://${teamDomain}`;
    const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== expectedIssuer ||
      !tokenAudiences.includes(audience) ||
      typeof claims.exp !== "number" || claims.exp <= nowSeconds ||
      (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 30) ||
      typeof claims.sub !== "string" || !claims.sub ||
      typeof claims.email !== "string" || !claims.email
    ) throw new Error("Invalid claims");

    const signingKey = (await getAccessKeys(teamDomain)).find((key) => key.kid === header.kid);
    if (!signingKey) throw new Error("Unknown signing key");
    const key = await crypto.subtle.importKey(
      "jwk",
      signingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!verified) throw new Error("Invalid signature");
    return { email: claims.email, subject: claims.sub };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError("ACCESS_TOKEN_INVALID");
  }
}
