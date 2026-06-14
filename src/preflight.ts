/**
 * Pre-flight checks run once at startup. Fail fast with a clear message so
 * a misconfigured endpoint is caught before the first demo call, not during it.
 */
import { WebSocket } from "ws";
import { config } from "./config.js";

async function probeAcs(): Promise<void> {
  const match = config.acs.connectionString.match(/endpoint=(https:\/\/[^;]+)/i);
  const rawEndpoint = match?.[1];
  if (!rawEndpoint) throw new Error("ACS_CONNECTION_STRING is missing the 'endpoint' field");
  const endpoint = rawEndpoint.replace(/\/$/, "");
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) }).catch((err: Error) => {
    throw new Error(`ACS endpoint unreachable (${endpoint}): ${err.message}`);
  });
  // ACS returns 401/404 for unauthenticated requests — both mean the endpoint is live.
  if (res.status >= 500) throw new Error(`ACS endpoint returned HTTP ${res.status} — check your resource`);
}

async function probeVoiceLive(): Promise<void> {
  const url = `${config.voiceLive.endpoint}/openai/realtime?api-version=2024-10-01-preview&deployment=${config.voiceLive.model}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { "api-key": config.voiceLive.apiKey } });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Voice Live endpoint timed out (${config.voiceLive.endpoint})`));
    }, 4000);
    const done = (err?: Error): void => {
      clearTimeout(timer);
      ws.terminate();
      err ? reject(err) : resolve();
    };
    ws.once("open", () => done());
    ws.once("error", (err) => done(new Error(`Voice Live endpoint unreachable: ${err.message}`)));
    // 401 = reachable but wrong key; 400/426 = upgrade required — all mean the endpoint is live.
    ws.once("unexpected-response", (_req, res) => {
      (res.statusCode ?? 500) < 500 ? done() : done(new Error(`Voice Live returned HTTP ${res.statusCode}`));
    });
  });
}

export async function runPreflight(): Promise<void> {
  const mediaEnabled = process.env.ENABLE_MEDIA_STREAMING === "1";
  const groqEnabled = Boolean(process.env.GROQ_API_KEY);

  // When Groq is configured, skip the Voice Live probe — Groq replaces it entirely.
  const probes = mediaEnabled && !groqEnabled ? [probeAcs(), probeVoiceLive()] : [probeAcs()];
  const results = await Promise.allSettled(probes);
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason as Error).message);
  if (errors.length) {
    throw new Error(`Preflight failed:\n  ${errors.join("\n  ")}`);
  }
  let voiceNote: string;
  if (!mediaEnabled) {
    voiceNote = "ACS endpoint reachable (media streaming off — Day-0 TTS mode)";
  } else if (groqEnabled) {
    voiceNote = "ACS endpoint reachable (Groq conversation mode — Voice Live skipped)";
  } else {
    voiceNote = "ACS and Voice Live endpoints reachable";
  }
  // eslint-disable-next-line no-console
  console.log(`Preflight OK — ${voiceNote}`);
}
