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
import { getRental, listAllRentals, updateRental, markReturned, markEscalated, minutesOverdue, writeRemarks } from "./data/rentals.js";
import { decideObjective } from "./agent/policy.js";
import { placeOutboundCall, playText, hangUpCall } from "./acs/callClient.js";
import { attachMediaBridge } from "./acs/mediaBridge.js";
import { startScheduler, startReCheckScheduler } from "./scheduler.js";
import { type CallRecord, recordCall, recentCalls, appendEvent } from "./log.js";
import { dashboardHtml } from "./dashboard.js";
import { runPreflight } from "./preflight.js";

assertConfig();

function buildDay0Script(rental: import("./data/rentals.js").RentalRecord, decision: import("./agent/policy.js").Decision): string {
  const firstName = rental.customer.name.split(" ")[0];
  const overMin = minutesOverdue(rental, new Date());
  const overHours = (overMin / 60).toFixed(1);
  const obj = decision.objective;

  const opener = `Hi ${firstName}, this is GraceCall, an automated AI assistant from Horizon Car Rental — this call may be recorded for quality and compliance.`;

  const situation = `I'm reaching out about your ${rental.vehicle.class} rental, number ${rental.rentalId.replace("-", " ")}, picked up at ${rental.location.name}. Your return was due ${overHours} hours ago, and your current overage balance is $${decision.overageOwedUSD}.`;

  let resolution = "";
  if (obj === "recover") {
    resolution = `We have another customer booked on this vehicle very soon, so we do need it back as quickly as possible. As a ${rental.customer.tier} member, we've already applied your grace period. Please return the vehicle to ${rental.location.name} at your earliest convenience. We'll send a text confirmation to this number with the return details.`;
  } else if (obj === "extend") {
    resolution = `Good news — there's no immediate booking on this vehicle, so we can offer you an extension if you need more time. We'll apply the standard overage rate of $${rental.overageHourlyRate} per hour, charged to your card on file. A text message with your updated rental agreement is on its way.`;
  } else if (obj === "charge") {
    resolution = `We've gone ahead and applied the overage charge of $${decision.overageOwedUSD} to your payment method on file. You'll receive a receipt by text shortly. No further action is needed — just return the vehicle when you're ready.`;
  } else {
    resolution = `Please call our customer service team at your earliest convenience so we can resolve this together.`;
  }

  const closing = `Thank you for being a Horizon ${rental.customer.tier} member, ${firstName}. We appreciate your business and look forward to seeing you soon. Goodbye.`;

  return `${opener} ${situation} ${resolution} ${closing}`;
}

const app = express();
app.use(express.json());

// In-flight calls keyed by rentalId, so the ACS webhook + media socket can find the decision.
const inFlight = new Map<string, CallRecord>();

/**
 * The one trigger path, shared by the HTTP endpoint and the auto-dial scheduler.
 * Returns the JSON body to send back, or null if the rental is unknown.
 */
async function runTrigger(rentalId: string): Promise<Record<string, unknown> | null> {
  const rental = await getRental(rentalId);
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
  // Increment so the attempt cap in decideObjective() fires correctly on subsequent triggers.
  await updateRental(rentalId, { customer: { ...rental.customer, callAttempts: rental.customer.callAttempts + 1 } });

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
app.get("/config-public", (_req, res) => res.json({ COPILOT_BOT_URL: process.env["COPILOT_BOT_URL"] ?? "" }));
app.get("/calls", (_req, res) => res.json(recentCalls()));
app.get("/dashboard", (_req, res) => res.setHeader("Content-Type", "text/html").send(dashboardHtml()));

// Rental state endpoints for the live dashboard.
app.get("/rentals", async (_req, res) => {
  const rentals = (await listAllRentals()).map((r) => ({
    rentalId: r.rentalId,
    name: r.customer.name,
    tier: r.customer.tier,
    vehicle: r.vehicle,
    location: r.location,
    returnDueAt: r.returnDueAt,
    callAttempts: r.customer.callAttempts,
    promisedReturnAt: r.promisedReturnAt,
    returnedAt: r.returnedAt,
    isEscalated: r.isEscalated,
  }));
  res.json(rentals);
});

app.get("/transcript/:rentalId", (_req: Request, res: Response) => {
  const id = String(_req.params.rentalId);
  const call = recentCalls().find(c => c.rentalId === id);
  if (!call) return res.json({ transcript: [], active: false });
  const active = call.placed && !call.outcome;
  return res.json({ transcript: call.transcript, active, rentalId: id });
});

// Toggle vehicle returned status (dashboard "Mark Returned" button).
app.patch("/rentals/:rentalId/returned", async (req: Request, res: Response) => {
  const id = String(req.params.rentalId);
  const r = await markReturned(id);
  if (!r) return res.status(404).json({ error: "not found" });
  return res.json({ rentalId: r.rentalId, returnedAt: r.returnedAt ?? null });
});

/**
 * Debug endpoint: write remarks and read them back to verify round-trip.
 * Gated behind TRIGGER_API_KEY so it is not publicly accessible.
 *
 * POST /debug/write-remarks
 *   Headers: X-GraceCall-Key: <TRIGGER_API_KEY>
 *   Body:    { "rentalId": "RNT-1001", "summary": "Test summary" }
 *   Returns: { rentalId, remarks, ok }
 */
app.post("/debug/write-remarks", async (req: Request, res: Response) => {
  if (req.header("X-GraceCall-Key") !== config.triggerApiKey) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const rentalId = String(req.body?.rentalId ?? "");
  const summary = String(req.body?.summary ?? "");
  if (!rentalId || !summary) {
    return res.status(400).json({ error: "rentalId and summary are required" });
  }
  try {
    await writeRemarks(rentalId, summary);
    const rental = await getRental(rentalId);
    if (!rental) return res.status(404).json({ error: `rental ${rentalId} not found` });
    return res.json({ rentalId, ok: true, message: "writeRemarks succeeded" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// Immediately trigger the re-check for a rental (demo "Force Re-check" button).
app.post("/rentals/:rentalId/recheck", async (req: Request, res: Response) => {
  const id = String(req.params.rentalId);
  const r = await getRental(id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.returnedAt) return res.json({ status: "returned", message: "Vehicle already returned — no action." });
  await markEscalated(id);
  console.log(`[RECHECK] Manual trigger for ${id} — placing second call.`);
  const body = await runTrigger(id);
  return res.json({ status: "escalated", call: body });
});

// MCP GET — Foundry opens this as an SSE stream for server-to-client notifications.
// GraceCall has no server-initiated events; we open the stream and keep it alive with pings.
app.get("/mcp", (req: Request, res: Response) => {
  if (req.header("X-GraceCall-Key") !== config.triggerApiKey) return res.status(401).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const hb = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => clearInterval(hb));
});

// Minimal MCP server (2024-11-05 spec) — stateless JSON-RPC over HTTP.
// Avoids the SDK's newer spec fields (e.g. execution.taskSupport) that Foundry can't parse.
app.post("/mcp", async (req: Request, res: Response) => {
  if (req.header("X-GraceCall-Key") !== config.triggerApiKey) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const msg = req.body as { method?: string; id?: unknown; params?: Record<string, unknown> };
  const id = msg?.id ?? null;
  const ok = (result: unknown) => res.json({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) =>
    res.status(400).json({ jsonrpc: "2.0", id, error: { code, message } });

  switch (msg?.method) {
    case "initialize":
      return ok({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "gracecall", version: "1.0.0" },
      });
    case "notifications/initialized":
      return res.sendStatus(200);
    case "tools/list":
      return ok({
        tools: [{
          name: "triggerOverdueCall",
          description: "Place an outbound AI voice call for an overdue rental car. Returns the agent's decision (recover/extend/charge/escalate) and call status.",
          inputSchema: {
            type: "object",
            properties: { rentalId: { type: "string", description: "Rental ID, e.g. RNT-1001" } },
            required: ["rentalId"],
          },
        }],
      });
    case "tools/call": {
      if (msg.params?.name !== "triggerOverdueCall") return err(-32601, `Unknown tool: ${msg.params?.name}`);
      const rentalId = String((msg.params?.arguments as Record<string, unknown>)?.rentalId ?? "");
      const result = await runTrigger(rentalId);
      if (!result) return ok({ content: [{ type: "text", text: `Unknown rental: ${rentalId}` }], isError: true });
      return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    }
    default:
      return err(-32601, `Method not found: ${msg?.method}`);
  }
});

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
    if (type.endsWith("PlayCompleted") || type.endsWith("PlayFailed")) {
      const rec = inFlight.get(rentalId);
      if (!config.enableMediaStreaming && callConnectionId) {
        // Day-0: one-shot script → hang up when done.
        try { await hangUpCall(callConnectionId); } catch (err) {
          console.error(`hangUp failed for ${rentalId}:`, (err as Error)?.message);
        }
      } else {
        // Groq/VoiceLive: TTS turn finished → unmute audio input so the caller can speak.
        rec?.onPlayCompleted?.();
      }
    }
    if (type.endsWith("CallConnected") && callConnectionId) {
      const rec = inFlight.get(rentalId);
      if (rec) rec.callConnectionId = callConnectionId;
      // Day-0 mode (no media streaming): speak a full AI-agent script so the demo is compelling.
      // Full mode: Voice Live drives the call and opens with the disclosure itself — don't double up.
      if (!config.enableMediaStreaming) {
        try {
          const rental = await getRental(rentalId);
          const decision = rec?.decision;
          const script = rental && decision
            ? buildDay0Script(rental, decision)
            : "Hi, this is an automated assistant from Horizon Car Rental. This call may be recorded for quality. Goodbye.";
          await playText(callConnectionId, script);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`playText failed for ${rentalId} (call may have dropped):`, (err as Error)?.message);
        }
      }
    }
  }
  res.sendStatus(200);
});

const server = createServer(app);

// ACS media streaming WebSocket → Voice Live bridge.
const wss = new WebSocketServer({ server, path: "/acs/media" });
attachMediaBridge(wss, inFlight);

await runPreflight().catch((err: Error) => {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
});

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
  // Re-check scheduler always runs: after the promised return time passes, it places a second call
  // if the vehicle hasn't been marked as returned. Check every 30s; fires once per rental.
  startReCheckScheduler((rentalId) => runTrigger(rentalId).then(() => undefined));
  // eslint-disable-next-line no-console
  console.log(`Re-check scheduler ON — second call fires ${config.recheckAfterMin} min after first call (RECHECK_AFTER_MIN)`);
});
