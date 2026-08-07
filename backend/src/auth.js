import { createClient } from "@supabase/supabase-js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BEARER_TOKEN_LENGTH = 16_384;

export class SupabaseConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function extractBearerToken(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^Bearer\s+(\S+)$/i);
  if (!match || match[1].length > MAX_BEARER_TOKEN_LENGTH) return null;
  return match[1];
}

function sendAuthError(res, code, message) {
  return res.status(401).json({ error: message, code });
}

function clientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
}

export function createSupabaseAuth({
  supabaseUrl,
  publishableKey,
  createClientImpl = createClient,
} = {}) {
  if (!supabaseUrl || !publishableKey) {
    throw new SupabaseConfigurationError(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required",
    );
  }

  const verifier = createClientImpl(supabaseUrl, publishableKey, clientOptions());

  return async function requireSupabaseAuth(req, res, next) {
    const token = extractBearerToken(req.get("authorization"));
    if (!token) {
      return sendAuthError(res, "AUTH_REQUIRED", "Authentication required");
    }

    try {
      const { data, error } = await verifier.auth.getClaims(token);
      const userId = data?.claims?.sub;
      if (error || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
        return sendAuthError(res, "AUTH_INVALID", "Invalid or expired access token");
      }

      // The accessToken callback is request-local. It lets PostgREST evaluate
      // every query with this user's JWT and therefore preserves RLS semantics.
      const supabase = createClientImpl(supabaseUrl, publishableKey, {
        ...clientOptions(),
        accessToken: async () => token,
      });

      req.auth = Object.freeze({ token, userId, claims: data.claims });
      req.supabase = supabase;
      return next();
    } catch {
      return sendAuthError(res, "AUTH_INVALID", "Invalid or expired access token");
    }
  };
}

export function createSupabaseAuthFromEnv(env = process.env, options = {}) {
  return createSupabaseAuth({
    supabaseUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    ...options,
  });
}
