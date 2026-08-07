/**
 * Cryptographic helpers for stateless session tokens and PKCE OAuth state.
 * Uses standard Web Crypto API (crypto.subtle) supported natively in Node.js, Bun, and Edge runtime.
 */

export function getJwtSecret(overrideSecret?: string): string {
  const secret =
    overrideSecret || process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET or BETTER_AUTH_SECRET environment variable is missing. Authentication requires a secret key."
    );
  }
  return secret;
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Signs a payload into a secure HMAC-SHA256 JWT string.
 */
export async function signSessionToken(
  payload: Record<string, unknown>,
  secret?: string,
  expiresInSeconds: number = 30 * 24 * 60 * 60 // 30 days
): Promise<string> {
  const effectiveSecret = getJwtSecret(secret);
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const enc = new TextEncoder();
  const headerPart = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)));
  const data = enc.encode(`${headerPart}.${payloadPart}`);

  const key = await getCryptoKey(effectiveSecret);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const signaturePart = base64UrlEncode(signature);

  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

/**
 * Verifies a JWT token signature and expiration, returning the payload if valid.
 */
export async function verifySessionToken<T extends Record<string, unknown>>(
  token: string,
  secret?: string
): Promise<T | null> {
  try {
    const effectiveSecret = getJwtSecret(secret);
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerPart, payloadPart, signaturePart] = parts;
    const enc = new TextEncoder();
    const data = enc.encode(`${headerPart}.${payloadPart}`);
    const signature = base64UrlDecode(signaturePart);

    const key = await getCryptoKey(effectiveSecret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature as BufferSource,
      data
    );

    if (!isValid) return null;

    const dec = new TextDecoder();
    const payload = JSON.parse(dec.decode(base64UrlDecode(payloadPart))) as T & {
      exp?: number;
    };

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generates a cryptographically random URL-safe string.
 */
export function generateRandomString(bytesCount = 32): string {
  const bytes = new Uint8Array(bytesCount);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generates a PKCE code challenge from a code verifier (SHA-256 base64url).
 */
export async function createPkceChallenge(verifier: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(verifier));
  return base64UrlEncode(hash);
}
