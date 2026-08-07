const DEMO_DISABLED_MESSAGE = "The live demo is not available yet. Please sign in with email or try again later.";
const DEMO_RATE_LIMIT_MESSAGE = "The live demo is busy right now. Please wait a moment and try again.";
const DEMO_FALLBACK_MESSAGE = "We could not start the live demo. Please try again.";

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isDemoSession(session) {
  return session?.user?.is_anonymous === true;
}

export function demoAuthErrorMessage(error) {
  const code = normalize(error?.code);
  const message = normalize(error?.message);

  if (
    code === "anonymous_provider_disabled"
    || code === "config_disabled"
    || code === "config-disabled"
    || message.includes("anonymous sign-ins are disabled")
    || message.includes("anonymous provider is disabled")
  ) {
    return DEMO_DISABLED_MESSAGE;
  }

  if (
    error?.status === 429
    || code === "over_request_rate_limit"
    || code === "over-request-rate-limit"
  ) {
    return DEMO_RATE_LIMIT_MESSAGE;
  }

  return DEMO_FALLBACK_MESSAGE;
}
