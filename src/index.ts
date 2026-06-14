/**
 * GraceCall service — the telephony tool the Copilot Studio agent invokes.
 *
 * Endpoints:
 *   POST /trigger-call      Copilot Studio custom connector calls this (X-GraceCall-Key auth).
 *                           Looks up the rental, runs the policy, places the outbound call, and
 *                           returns the decision so the reasoning shows up inside the agent.
 *   POST /acs/callbacks     ACS posts call lifecycle events here. On CallConnected we play the
 *                           AI disclosure (Day-0 mode) or let Voice Live drive (media-streaming mode).
 *   WS   /acs/media         ACS bidirectional media connects here; bridged to a VoiceLiveSession.
 *   GET  /calls             Recent call records (JSON, for the dashboard).
 *   GET  /dashboard         Live demo dashboard.
 *   GET  /healthz           Liveness.
 *
 * Calls can be triggered two ways: MANUALLY (this endpoint / `npm run trigger:demo` / Copilot Studio)
 * or AUTOMATICALLY (set AUTO_DIAL=1 — the scheduler dials overdue rentals itself). Same code path.
 */
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { assertConfig, config } from "./config.js";
import { getRental } from "./data/rentals.js";
import { decideObjective } from "./agent/policy.js";
import { placeOutboundCall, playText } from "./acs/callClient.js";
import { attachMediaBridge } from "./acs/mediaBridge.js";
import { startScheduler } from "./scheduler.js";
import { type CallRecord, recordCall, recentCalls, appendEvent } from "./log.js";
import { dashboardHtml } from "./dashboard.js";

assertConfig();

const app = express();
app.use(express.json());

// In-flight calls keyed by rentalId, so the ACS webhook + media socket can find the decision.
const inFlight = new Map<string, CallRecord>();

/**
 * The one trigger path, shared by the HTTP endpoint and the auto-dial scheduler.
 * Returns the JSON body to send back, or null if the rental is unknown.
 */
async function runTrigger(rentalId: string): Promise<Record<string, unknown> | null> {
  const rental = getRental(rentalId);
  if (!rental) return null;

  const now = new Date();
  const decision = decideObjective(rental, now);

  // Escalate objectives (do-not-call / attempt cap) are surfaced, never auto-dialed.
  if (decision.objective === "escalate") {
    recordCall({ rentalId, decision, placed: false, startedAt: now.toISOString() });
    return { rentalId, objective: decision.objective, rationale: decision.rationale, placed: false };
  }

  const result = await placeOutboundCall(rental.customer.phoneE164, rentalId);
  const callConnectionId = result.callConnectionProperties?.callConnectionId ?? "pending";
  const record = recordCall({ rentalId, decision, placed: true, callConnectionId, startedAt: now.toISOString() });
  inFlight.set(rentalId, record);

  // Return the reasoning so the Copilot Studio agent (and ops in M365 Copilot) can see WHY it called.
  return {
    rentalId,
    objective: decision.objective,
    rationale: decision.rationale,
    overageOwedUSD: decision.overageOwedUSD,
    placed: true,
    callConnectionId,
  };
}

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/calls", (_req, res) => res.json(recentCalls()));
app.get("/dashboard", (_req, res) => res.setHeader("Content-Type", "text/html").send(dashboardHtml()));

app.post("/trigger-call", async (req: Request, res: Response) => {
  if (req.header("X-GraceCall-Key") !== config.triggerApiKey) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const rentalId = String(req.body?.rentalId ?? "");
  const body = await runTrigger(rentalId);
  if (!body) return res.status(404).json({ error: `unknown rental ${rentalId}` });
  return res.json(body);
});

app.post("/acs/callbacks", async (req: Request, res: Response) => {
  const rentalId = String(req.query.rentalId ?? "");
  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const e of events) {
    const type = String(e?.type ?? "");
    appendEvent(rentalId, type);
    const callConnectionId = e?.data?.callConnectionId as string | undefined;
    if (type.endsWith("CallConnected") && callConnectionId) {
      const rec = inFlight.get(rentalId);
      if (rec) rec.callConnectionId = callConnectionId;
      // Day-0 mode (no media streaming): speak a fixed disclosure so the phone demonstrably talks.
      // Full mode: Voice Live drives the call and opens with the disclosure itself — don't double up.
      if (!config.enableMediaStreaming) {
        await playText(
          callConnectionId,
          "Hi, this is an automated assistant from Horizon Car Rental, and this call may be recorded for quality. Goodbye.",
        );
      }
    }
  }
  res.sendStatus(200);
});

const server = createServer(app);

// ACS media streaming WebSocket → Voice Live bridge.
const wss = new WebSocketServer({ server, path: "/acs/media" });
attachMediaBridge(wss, inFlight);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`GraceCall listening on :${config.port}  (callbacks → ${config.callbackBaseUrl})`);
  if (config.autoDial) {
    startScheduler((rentalId) => runTrigger(rentalId).then(() => undefined), {
      afterMinutes: config.autoDialAfterMin,
    });
    // eslint-disable-next-line no-console
    console.log(`Auto-dial ON — calling rentals overdue by ≥ ${config.autoDialAfterMin} min`);
  }
});
