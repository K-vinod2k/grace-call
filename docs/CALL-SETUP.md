# Make the call work — buy a number → ring → talk

Two test stages. **Stage 1** just proves the phone rings and speaks (no AI conversation, ~20 min of setup).
**Stage 2** turns on the full two-way Voice Live conversation. Do Stage 1 first.

---

## Step 1 — Buy an outbound ACS phone number  *(longest lead time — do this first)*
1. [Azure portal](https://portal.azure.com) → **Create a resource** → search **Communication Services** → **Create**. Pick any US region → Review + create.
2. Open the ACS resource → left menu **Phone numbers** → **+ Get**.
3. Country **United States** → Use case **Make calls** (outbound) → number type **Toll-free** or **Local** → capabilities: tick **Outbound calling** (and **SMS** if you want text confirmations) → **Search** → **Buy**.
4. Copy the number in E.164 (e.g. `+1425XXXXXXX`) → this is `ACS_CALLER_ID`.
5. ACS resource → **Keys** → copy **Connection string** → this is `ACS_CONNECTION_STRING`.

## Step 2 — Create the Voice Live resource  *(only needed for Stage 2)*
1. Portal → **Create a resource** → **Azure AI services** (multi-service) or an **Azure AI Foundry** project. Region **East US 2** (gpt-realtime is North-America hosted).
2. Open it → **Keys and Endpoint** → copy the **endpoint** and a **key** → `VOICE_LIVE_ENDPOINT` and `VOICE_LIVE_API_KEY`.
   - The code calls `${VOICE_LIVE_ENDPOINT}/voice-live/realtime`. Use the resource endpoint host; if Voice Live rejects it, check the current [Voice Live quickstart](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live) for the exact host + `api-version` and update `src/voicelive/session.ts`.

## Step 3 — Point the demo at YOUR phone
For testing, the agent should call *you*. Edit `src/data/rentals.ts` and set the `phoneE164` on **RNT-1001** to your own mobile in E.164 (`+1...`). (Revert before recording if you want the fictional number on screen.)

## Step 4 — Expose your laptop to ACS (dev tunnel)
ACS must reach your server over HTTPS. Pick one:
```bash
# Microsoft Dev Tunnels
devtunnel host -p 8080 --allow-anonymous
# …or ngrok
ngrok http 8080
```
Copy the **https://…** URL it prints → that's `CALLBACK_BASE_URL`. (The media socket uses `wss://` of the same host — the code derives it automatically.)

## Step 5 — Fill `.env` and start
```bash
cp .env.example .env
# edit .env: ACS_CONNECTION_STRING, ACS_CALLER_ID, CALLBACK_BASE_URL,
#            TRIGGER_API_KEY (run: openssl rand -hex 32)
#            for Stage 2 also: VOICE_LIVE_ENDPOINT, VOICE_LIVE_API_KEY, and set ENABLE_MEDIA_STREAMING=1
npm install
npm run dev          # starts on :8080, prints "GraceCall listening"
```

## Step 6 — Place the call

### Stage 1 — ring + AI disclosure  (keep `ENABLE_MEDIA_STREAMING=0`)
```bash
npm run trigger:demo            # RNT-1001
```
✅ **Your phone rings; you hear the AI-disclosure line, then it hangs up.** That's the Day-0 milestone — the call path works.

### Stage 2 — full conversation  (set `ENABLE_MEDIA_STREAMING=1`, restart `npm run dev`)
```bash
npm run trigger:demo
```
✅ Now Voice Live runs the conversation: it discloses, explains the SUV is overdue, and — because a booking is waiting — **recovers** the vehicle. Talk over it to test **barge-in**. Watch it live at **http://localhost:8080/dashboard**.

---

## How the call gets triggered — manual vs automatic
You do **not** have to babysit it. Three ways to fire a call, all the same code path:

| Mode | How | Use it for |
|---|---|---|
| **Manual — CLI** | `npm run trigger:demo [RNT-1001\|RNT-1002]` | quick tests |
| **Manual — from the agent** | In Copilot Studio / M365 Copilot: *"Call the customer for RNT-1001"* | the demo |
| **Automatic — scheduler** | Set `AUTO_DIAL=1`. The service checks every minute and calls any rental overdue by `AUTO_DIAL_AFTER_MIN` (default **60**) minutes — skipping do-not-call. | the real "calls them ~1h late by itself" behavior |

So: **you don't say "this is the time."** You set the rule once (`AUTO_DIAL_AFTER_MIN=60`) and the agent decides *when* — it watches the rentals and dials the moment one crosses 1 hour overdue. For the hackathon video, leave `AUTO_DIAL=0` and trigger manually so the call happens exactly when your camera is rolling; mention that `AUTO_DIAL=1` is the autonomous production mode. (In the full Enterprise setup, a Power Automate scheduled flow plays the scheduler's role.)

> Real numbers cost money per call/minute and dial actual phones. Keep `AUTO_DIAL=0` until you're deliberately testing it, and only put numbers you own in the seed data.
