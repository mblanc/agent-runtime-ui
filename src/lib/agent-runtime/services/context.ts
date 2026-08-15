import { GoogleAuth } from "google-auth-library";

/**
 * `location` and the engine id arrive from client-controlled query params, JSON
 * bodies and headers, and are interpolated into the *hostname* of the upstream
 * URL (`https://${loc}-aiplatform.googleapis.com/...`). An unvalidated value
 * such as `attacker.example.com/x#` therefore redirects the request to an
 * arbitrary host — and `fetchWithAuth` would attach a cloud-platform-scoped
 * access token to it. Both are validated here, at the single boundary they
 * share, and `fetchWithAuth` asserts the resolved host independently.
 */
const LOCATION_RE = /^[a-z]+(-[a-z]+\d+)?$/;

/**
 * A bare id/display name, or a full resource path. Display names are permitted
 * because `resolveEngineId` legitimately accepts them, so this constrains the
 * character set rather than the shape: no `/` traversal, no `?#%:@` that could
 * escape the path segment, and the `locations/` segment of a full path is held
 * to LOCATION_RE because `getSessionEndpoint` re-derives the host from it.
 */
const ENGINE_RE =
  /^([A-Za-z0-9_-]+|projects\/[a-z0-9][a-z0-9-]*\/locations\/[a-z]+(-[a-z]+\d+)?\/reasoningEngines\/[A-Za-z0-9_-]+)$/;

const ALLOWED_HOST_SUFFIX = ".googleapis.com";

/**
 * Upper bound on any non-streaming upstream call. Without it a hung Vertex
 * request has no ceiling at all and holds a Cloud Run request slot until the
 * platform kills it.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * `AbortSignal.any` composes the caller's signal with our timeout so either can
 * abort the request. It is available on Node 20+; fall back to whichever signal
 * exists on older runtimes rather than dropping the caller's.
 */
function composeSignals(
  caller: AbortSignal | null | undefined,
  timeout: AbortSignal
): AbortSignal {
  if (!caller) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([caller, timeout]);
  }
  return caller;
}

export class InvalidRoutingParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoutingParameterError";
  }
}

/** Accepts `global`, `us-central1`, `northamerica-northeast1`. */
export function assertValidLocation(location: string): string {
  if (!LOCATION_RE.test(location)) {
    throw new InvalidRoutingParameterError(`Invalid location: ${location}`);
  }
  return location;
}

/** Accepts a bare numeric id or a full `projects/.../reasoningEngines/<id>` path. */
export function assertValidEngineResource(engine: string): string {
  if (!ENGINE_RE.test(engine)) {
    throw new InvalidRoutingParameterError(`Invalid reasoning engine id: ${engine}`);
  }
  return engine;
}

export class VertexAiContext {
  public auth: GoogleAuth;
  public projectId: string;
  public location: string;
  public reasoningEngineId: string;
  public tokenGetter?: () => Promise<string>;
  public static engineDisplayNameMap = new Map<string, string>();

  constructor(
    overrideEngineId?: string,
    overrideLocation?: string,
    tokenGetter?: () => Promise<string>
  ) {
    this.tokenGetter = tokenGetter;
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
    // Only the override is client-controlled; env values are trusted config.
    this.location = overrideLocation
      ? assertValidLocation(overrideLocation)
      : process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    this.reasoningEngineId =
      overrideEngineId || process.env.GOOGLE_REASONING_ENGINE_ID || "";

    if (this.reasoningEngineId.startsWith("projects/")) {
      const match = this.reasoningEngineId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)$/
      );
      if (match) {
        if (match[1]) this.projectId = match[1];
        if (match[2]) this.location = match[2];
      }
    }

    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenGetter) {
      return this.tokenGetter();
    }
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to obtain Google Cloud IAM access token");
    }
    return tokenResponse.token;
  }

  /**
   * @param init  Standard fetch init. An explicit `signal` is respected and
   *              composed with the default timeout.
   * @param opts.streaming
   *   Opt out of the default request timeout. Streaming responses are long by
   *   design, and `AbortSignal.timeout` covers the whole exchange including
   *   body consumption, so applying it to `:streamQuery` would truncate a
   *   legitimately long generation mid-answer. Streaming calls are bounded by
   *   the caller's signal (client disconnect) instead.
   */
  async fetchWithAuth(
    url: string,
    init?: RequestInit,
    opts?: { streaming?: boolean }
  ): Promise<Response> {
    // Defence in depth: never attach the access token to a host we don't own,
    // regardless of how the caller built the URL.
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new InvalidRoutingParameterError(`Invalid upstream URL: ${url}`);
    }
    if (host !== "googleapis.com" && !host.endsWith(ALLOWED_HOST_SUFFIX)) {
      throw new InvalidRoutingParameterError(`Refusing to send credentials to ${host}`);
    }

    const token = await this.getAccessToken();
    const signal = opts?.streaming
      ? init?.signal
      : composeSignals(init?.signal, AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS));

    return fetch(url, {
      ...init,
      ...(signal ? { signal } : {}),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }

  resolveEngineId(engineId?: string): string {
    const id = engineId || this.reasoningEngineId;
    if (!id) return "";
    if (id.startsWith("projects/") || /^\d+$/.test(id)) {
      return id;
    }
    const mapped =
      VertexAiContext.engineDisplayNameMap.get(id.toLowerCase()) ||
      VertexAiContext.engineDisplayNameMap.get(id);
    return mapped || id;
  }

  /**
   * The single place a client-supplied location becomes part of an upstream
   * hostname. Every URL builder must route its `customLocation` through here.
   */
  resolveLocation(customLocation?: string): string {
    if (!customLocation) return this.location;
    return assertValidLocation(customLocation);
  }

  getNormalizedEngineResource(customEngineId?: string, customLocation?: string): string {
    const targetEngine = this.resolveEngineId(customEngineId) || this.reasoningEngineId;
    if (targetEngine) assertValidEngineResource(targetEngine);
    if (targetEngine.startsWith("projects/")) {
      return targetEngine;
    }
    const loc = this.resolveLocation(customLocation);
    return `projects/${this.projectId}/locations/${loc}/reasoningEngines/${targetEngine}`;
  }
}
