# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run typecheck          # tsc --noEmit; run before every commit
npm test                   # node built-in test runner; 5 policy unit tests
npm run dev                # tsx watch — hot-reload dev server on :8080
npm run trigger:demo       # fire RNT-1001 (recover scenario)
npm run trigger:demo RNT-1002  # extend scenario
```

`typecheck` and `npm test` are the two verification gates. The app runs a credential preflight at startup (`src/preflight.ts`) and exits fast if ACS or Voice Live endpoints are unreachable. `assertConfig()` in `src/config.ts` catches missing env vars before that.

## Environment setup

Copy `.env.example` to `.env` and fill in:
- `ACS_CONNECTION_STRING` + `ACS_CALLER_ID` — Azure Communication Services
- `CALLBACK_BASE_URL` — must be an `https://` URL reachable by ACS; use a dev tunnel / ngrok locally
- `VOICE_LIVE_ENDPOINT` + `VOICE_LIVE_API_KEY` — Azure Voice Live (North-America region)
- `TRIGGER_API_KEY` — shared secret sent by Copilot Studio in `X-GraceCall-Key`

Two staging flags:
- `ENABLE_MEDIA_STREAMING=0` (default): phone rings + plays a fixed TTS disclosure line. No Voice Live needed — use this for the first test.
- `ENABLE_MEDIA_STREAMING=1`: ACS streams 24kHz PCM to `/acs/media` and Voice Live drives the full two-way conversation.
- `AUTO_DIAL=1`: the scheduler auto-calls any rental overdue by `AUTO_DIAL_AFTER_MIN` minutes. Keep `0` unless you intend to call real numbers.

## Architecture

GraceCall is split into two conceptual layers:

**Copilot Studio agent (brain)** — authored outside this repo. It reasons over Foundry IQ knowledge (`knowledge/` — overage policy, rate card, sample agreement) and invokes the `TriggerOverdueCall` custom connector (defined in `copilot-studio/openapi.yaml`) when a rental goes overdue.

**Azure service (telephony tool, this repo)** — a Node/Express/TypeScript server that:
1. Receives `POST /trigger-call` from Copilot Studio (auth: `X-GraceCall-Key`)
2. Runs `decideObjective()` (`src/agent/policy.ts`) → picks **recover | extend | charge | escalate** with hard policy constraints
3. Places an outbound PSTN call via ACS Call Automation (`src/acs/callClient.ts`)
4. On `CallConnected`: either plays a fixed TTS line (Day-0) or hands off to a `VoiceLiveSession` (`src/voicelive/session.ts`)
5. `VoiceLiveSession` speaks the Azure OpenAI Realtime protocol over WebSocket — sends `session.update` with the dynamic system prompt + tool definitions, then streams caller audio in (`input_audio_buffer.append`) and receives agent audio + tool calls out
6. `src/acs/mediaBridge.ts` bridges the ACS `/acs/media` WebSocket to a `VoiceLiveSession`; audio is 24kHz/16-bit/mono PCM end-to-end with **no resampling**

## Key design invariants

**ACS media frame casing is asymmetric.** Incoming frames from ACS use camelCase (`audioData.data`); outgoing frames to ACS use PascalCase (`AudioData.Data`, `StopAudio`). Mixing these is the classic bug — see the comment in `src/acs/mediaBridge.ts`.

**Tools re-enforce policy in code, not just prompt.** `src/agent/tools.ts` `dispatchTool()` re-validates every tool call against `Decision.constraints` (charge ceiling, extension cap, `mustRecoverVehicle`). The model cannot exceed these limits even if prompted to. This is intentional and load-bearing for the hackathon's Responsible AI criterion.

**`inFlight` map is the call registry.** `src/index.ts` maintains `Map<rentalId, CallRecord>` for calls in progress. The ACS callback webhook and the media WebSocket both look up their call context from this map using `rentalId` passed in the query string / callback URL.

**`decideObjective()` is the single source of truth for policy.** Both the trigger path (`/trigger-call`) and the media bridge re-run `decideObjective()` independently. If the rental state changes between the two calls, the media bridge gets the fresher decision — this is by design.

## Module map

| Path | Role |
|---|---|
| `src/index.ts` | Express + WebSocket server; all HTTP/WS routes; `runTrigger()` shared by endpoint and scheduler |
| `src/agent/policy.ts` | `decideObjective()` — pure decision function; no I/O |
| `src/agent/tools.ts` | Tool definitions (JSON Schema) + `dispatchTool()` with hard policy guards |
| `src/agent/systemPrompt.ts` | Builds the per-call Voice Live system prompt from rental + decision |
| `src/voicelive/session.ts` | Azure Voice Live WebSocket client; handles Realtime protocol events |
| `src/acs/callClient.ts` | ACS Call Automation wrapper — place call, play TTS, hang up |
| `src/acs/mediaBridge.ts` | Bridges ACS media WS ↔ `VoiceLiveSession`; barge-in + escalation side-effects |
| `src/preflight.ts` | Startup credential probes — HTTP to ACS, WebSocket to Voice Live; exits on failure |
| `src/data/rentals.ts` | In-memory rental seed; prod would use Dataverse/Cosmos via Foundry IQ |
| `src/config.ts` | Env loader + `assertConfig()` |
| `src/log.ts` | In-memory call log; `recentCalls()` feeds the dashboard and `/calls` endpoint |
| `src/scheduler.ts` | Optional auto-dialer — polls every minute when `AUTO_DIAL=1` |
| `src/dashboard.ts` | SSE/polling live dashboard HTML at `/dashboard` |
| `src/agent/__tests__/policy.test.ts` | Unit tests for `decideObjective()` — 5 cases via `node:test` |
| `copilot-studio/openapi.yaml` | Custom connector spec for the `TriggerOverdueCall` action |
| `knowledge/` | Foundry IQ knowledge source documents |

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
