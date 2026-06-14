# Copilot Studio setup — GraceCall (Enterprise Agents track)

This wires the three mandatory Enterprise-track pieces: **authored in Copilot Studio**, **a Microsoft
IQ layer** (Foundry IQ), and **published to Microsoft 365 Copilot**. The live phone call is performed
by the Azure service in this repo, invoked as a custom-connector action.

> Path note. **E2 (recommended, no Dynamics 365):** Copilot Studio agent + the `TriggerOverdueCall`
> action below. **E1 (only if you have Dynamics 365 Contact Center):** skip the connector and instead
> build a Copilot Studio *real-time voice agent* on the D365 outbound voice channel; keep the same
> Foundry IQ knowledge and instructions.

## 0. Prerequisites
- Copilot Studio access (free trial is fine for the demo).
- The GraceCall Azure service from this repo deployed to a public HTTPS URL (see ../README.md).
  You need its base URL and the `TRIGGER_API_KEY` value.
- An Azure AI Foundry project for the Foundry IQ knowledge source.

## 1. Create the agent
1. Copilot Studio → **Create** → **New agent** → name it **GraceCall**.
2. Paste `agent-instructions.md` into **Instructions**.
3. Add the four conversation starters from that file.

## 2. Connect Foundry IQ (the mandatory IQ layer)
1. In Azure AI Foundry, create a knowledge index over the three files in `../knowledge/`
   (`overage-policy.md`, `rate-card.md`, `sample-agreement.md`).
2. In the agent → **Knowledge** → add the **Foundry IQ** source pointing at that index.
3. Test: ask the agent "What's the grace window and the auto-charge ceiling?" — it must answer
   **30 minutes** and **$150**, citing the policy. This proves the IQ integration for judging.

## 3. Import the custom connector (the call action)
1. Power Apps / Copilot Studio → **Custom connectors** → **Import an OpenAPI file** → upload
   `openapi.yaml`.
2. Set the host to your deployed GraceCall URL.
3. Security: **API key**, header name `X-GraceCall-Key`. Create a connection and paste your
   `TRIGGER_API_KEY` value (store it as an environment variable / secret, never in source).
4. In the agent → **Actions** → **Add an action** → select **TriggerOverdueCall**.

## 4. Add the autonomous trigger (~1 hour after overage)
- **E2:** create a **Power Automate** scheduled flow (e.g. every 15 min) that reads overdue rentals
  (your Dataverse/Cosmos table; the demo uses the in-memory seed) and, for each that crossed the
  1-hour mark, calls the agent / the `TriggerOverdueCall` action. Or trigger the agent on a Dataverse
  row update. This is what makes it *proactive* rather than chat-only.
- Keep the human-facing chat path too, so an ops user can say "Call the customer for RNT-1001."

## 5. Publish to Microsoft 365 Copilot
1. Agent → **Channels** → enable **Microsoft 365 Copilot** (and Teams).
2. Publish. Confirm the agent appears in M365 Copilot and that ops can ask
   "What happened on the call for RNT-1001?" and get the logged outcome.

## 6. Responsible AI
- The voice script self-discloses as AI + gives a recording notice (enforced in the Azure service).
- In Copilot Studio, enable content moderation; document do-not-call + escalation in your submission.

## What to capture for the submission
- Screenshot: Foundry IQ answering a policy question with a citation.
- Screen recording: the agent calling `TriggerOverdueCall` and summarizing the outcome.
- The architecture diagram in `../docs/architecture.md`.
