/**
 * Central env loader + validation. Never logs secret VALUES — only which keys are missing.
 * Secrets come from the environment only; nothing is hardcoded.
 */
import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  acs: {
    connectionString: req("ACS_CONNECTION_STRING"),
    callerId: req("ACS_CALLER_ID"),
    smsFrom: opt("ACS_SMS_FROM"),
  },
  callbackBaseUrl: req("CALLBACK_BASE_URL"), // https; ACS posts events + connects media here
  voiceLive: {
    endpoint: req("VOICE_LIVE_ENDPOINT"),
    apiKey: req("VOICE_LIVE_API_KEY"),
    model: opt("VOICE_LIVE_MODEL", "gpt-realtime"),
    voice: opt("VOICE_LIVE_VOICE", "en-US-AvaNeural"),
  },
  triggerApiKey: req("TRIGGER_API_KEY"), // Copilot Studio connector sends this in X-GraceCall-Key
  port: Number(opt("PORT", "8080")),
  skipAcsSignatureCheck: opt("SKIP_ACS_SIGNATURE_CHECK") === "1",
  // Off (default): ring + play a fixed AI-disclosure line (Day-0, no Voice Live).
  // On: ACS streams 24kHz audio to /acs/media and Voice Live runs the full two-way call.
  enableMediaStreaming: opt("ENABLE_MEDIA_STREAMING") === "1",
  // Off (default): you trigger calls manually. On: a built-in scheduler auto-dials overdue rentals.
  autoDial: opt("AUTO_DIAL") === "1",
  autoDialAfterMin: Number(opt("AUTO_DIAL_AFTER_MIN", "60")),
};

/** Validate at startup so the server fails fast with a clear message (no secret values printed). */
export function assertConfig(): void {
  void config.acs.connectionString;
  void config.voiceLive.apiKey;
  void config.triggerApiKey;
  if (!config.callbackBaseUrl.startsWith("https://")) {
    throw new Error("CALLBACK_BASE_URL must be an https URL reachable by ACS (use a dev tunnel locally).");
  }
}
