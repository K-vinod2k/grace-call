# GraceCall — Live Hackathon Demo Script

**Total time: 10 minutes**. Pre-stage all rentals and test phone before stepping on stage.

---

## Setup (before you go live)

- [ ] Terminal 1: `npm run dev` — server running on `localhost:8080`
- [ ] Terminal 2: one unused test phone ready (Twilio/demo number or your own). Ringer ON. Speaker accessible.
- [ ] Pre-stage rentals: RNT-1001 (Alex Rivera, SFO SUV, booked next) and RNT-1002 (Jordan Lee, Austin econ, idle) already marked overdue in the rental DB via dashboard or direct seed.
- [ ] `.env`: `AUTO_DIAL=0` (you control the trigger manually), `ENABLE_MEDIA_STREAMING=1` (full Voice Live conversation), `CALLBACK_BASE_URL` pointing to your publicly reachable URL (ngrok/dev tunnel).
- [ ] Browser tab 1: `localhost:8080/dashboard` (live call log + rental status)
- [ ] Browser tab 2: backup: Copilot Studio agent definition (show reasoning if live call is laggy)

---

## 0:00–1:30 — Intro + Dashboard (show the problem)

**Talking points:**
- "Rental cars come back late constantly. A 50-car airport branch sees 3–5 overdue returns on a busy day."
- "Late cars = blocked next bookings or lost overage revenue. Nobody has time to call each one."
- "GraceCall: an autonomous AI agent that **calls the customer itself**, negotiates a return, and logs the outcome — all within policy."

**On screen:**
1. Navigate to `localhost:8080/dashboard`.
2. Point to the two overdue rentals in the list:
   - **RNT-1001** — Alex Rivera, Tesla Model 3 SUV at SFO, 90 minutes overdue. Next booking: 7pm (2.5 hrs from now).
   - **RNT-1002** — Jordan Lee, Toyota Corolla economy at Austin, 45 minutes overdue. Next booking: none. Low demand.
3. Read the call log at the bottom (empty so far).

**Key insight for judges:**
"Notice RNT-1001 has a **booked pickup at 7pm** — that's the high-stakes scenario. RNT-1002 is idle. The agent should decide differently for each, using the same brain."

---

## 1:30–3:00 — Live call (the showstopper)

**Action:**
1. Click **"Trigger Call"** button for RNT-1001 on the dashboard (or say `npm run trigger:demo RNT-1001` in terminal).
2. **Your phone rings in ~5 seconds.** Put it on speaker so the audience hears both sides.
3. **Do NOT speak.** Let the agent speak first.

**What Vera (the AI) says:**

**First message (opening + AI disclosure):**
- "Hi Alex, this is Vera, an AI voice assistant from Horizon Car Rental. I'm calling about your Tesla SUV pickup at San Francisco. This call may be recorded for quality purposes. How are you today?"

**Listen for Alex's response** (played from your phone or a recording).
- *Example:* "Hi Vera, yeah, I know I'm late. I'll be back in 2 hours."

**Vera confirms:**
- "Great, so you'll return the Tesla by 4:45 PM — that's 2 hours from now. We have another customer picking up at 7 PM, so this timing is important. We'll text you a reminder at 3:45. Thanks, Alex. Have a safe drive."
- **Hang up warmly.**

**Dashboard reaction (live):**
- Call log updates in real time: transcript bubbles appear as Vera speaks.
- RNT-1001 status changes to **"Awaiting Return"** with a **countdown timer: 2:00** (matches the promised 2 hours).

**Talking point:**
"Notice Vera **didn't offer an extension**. The policy says: if another booking is within 6 hours, recover — don't extend. She negotiated a firm commitment because the next customer is at 7 PM."

---

## 3:00–4:00 — Contrast + reasoning (judge criterion: multi-step reasoning)

**Action:**
1. Click **"Trigger Call"** for RNT-1002 (Jordan Lee, Austin economy car, no next booking).
2. **Your phone rings again.** Speaker on.

**What Vera says this time:**

**First message (same opening):**
- "Hi Jordan, this is Vera, an AI voice assistant from Horizon Car Rental. Your economy rental is 45 minutes overdue. This call may be recorded. How are you?"

**Listen for Jordan's response.**
- *Example:* "Oh, I'm sorry, I lost track of time. Can I keep it a bit longer?"

**Vera **offers an extension** (different decision):**
- "Absolutely. Since we have good availability, I can extend your rental until 6 PM today for an additional $35. Does that work?"
- *Jordan agrees.*
- "Perfect. You're all set until 6 PM. We'll text you a confirmation."

**Dashboard update:**
- RNT-1002 status: **"Extended"** (no countdown, because no next booking).

**Talking point for judges:**
"Same agent, opposite decisions. RNT-1001 recovered; RNT-1002 extended. **Same brain, different situation.** The policy lives in Foundry IQ; the code enforces it. The model didn't choose this based on a script — it reasoned from the rental state and the policy."

**(Optional: deep dive)** If you have bandwidth:
- Show the decision trace in the call log (click the RNT-1001 or RNT-1002 record).
- Read the `decideObjective()` output: "*Selected RECOVER because next_booking_hours < 6 and customer_tier = Gold.*"
- Contrast with RNT-1002: "*Selected EXTEND because no_upcoming_booking and low_demand.*"

---

## 4:00–5:30 — Guardrails + Responsible AI (mandatory for judges)

**Talking points + on-screen proof:**

1. **AI Disclosure + recording notice** (played in the opening). Vera says it upfront. No deception.

2. **Hard policy limits in code** (don't just trust the prompt):
   - Show the call log for RNT-1001. Vera decided RECOVER, not EXTEND.
   - If Vera ever tried to extend past the policy limit (e.g., 72 hours max extension), the tool would refuse and auto-escalate.
   - **Proof:** Click RNT-1001 > expand the tool calls section > show `extend(rental, hours: 2)` was accepted because `2 < MAX_EXTENSION`.

3. **Escalation on distress** (not demoed live, but show in code):
   - If a customer sounds angry or says "I need a human," Vera immediately stops and routes to escalate tool.
   - Link: `src/agent/tools.ts` — `escalate()` always succeeds, never refuses.

4. **No card capture by voice**:
   - If a customer offers to pay by voice, Vera declines and sends a secure payment link via SMS.
   - Reason: PCI-DSS. Voice = unencrypted.

5. **Auto-charge ceiling + 3-attempt cap**:
   - Max auto-charge without human review: $150.
   - If overage would exceed $150, send a pay link. Don't charge.
   - If a rental has been called 3 times and still not returned, escalate to a human.

**Show on-screen:**
- Open `/src/agent/tools.ts`.
- Highlight the `charge()` and `extend()` tool validators (lines ~80–120):
```
if (amount > CHARGE_CEILING) return { error: "exceeds_ceiling", send_link: true };
if (extension_hours > MAX_EXTENSION) return { error: "exceeds_limit", escalate: true };
```

**Judge talking point:**
"The policy isn't a suggestion in the prompt. It's enforced server-side. If the model tries to charge $200 and the ceiling is $150, the tool refuses and routes to a pay link. This is load-bearing for responsible AI."

---

## 5:30–7:00 — Auto-escalation demo (optional, if time + call isn't returned)

**Scenario:** If you didn't mark RNT-1001 as returned after the 2-hour countdown:
1. **Dashboard countdown hits zero** at 3:45 PM (simulated in the countdown logic).
2. **Dashboard auto-escalates:** RNT-1001 status changes to **"ESCALATED — Vehicle not returned. Manual follow-up required."**
3. A second call would be placed automatically (if `AUTO_RECHECK=1`), with a harsher tone:
   - "Alex, this is Vera calling again. Your return time has passed. We need your vehicle back now."
4. If this also fails, the case is flagged for a human agent in the call log.

**Talking point:**
"Autonomous loop: if the car isn't back after the promised time, the system re-checks automatically. No human babysitting needed. Escalation only kicks in if the customer misses the commitment."

---

## 7:00–8:00 — Architecture + tech stack (the credibility layer)

**Show the architecture diagram** (open `/docs/architecture.md` or render `architecture.svg` on screen):

```
Overdue rental (Power Automate trigger ~1h)
  → Copilot Studio agent (GraceCall brain + Foundry IQ policy)
  → TriggerOverdueCall action (custom connector)
  → Azure service (this repo)
    - ACS Call Automation (outbound PSTN call)
    - Voice Live API (gpt-realtime: barge-in + two-way conversation)
    - Policy enforcement layer (tools re-validate limits)
  → Customer's phone
  → Outcome + transcript → Dataverse
  → Microsoft 365 Copilot (ops query: "what happened on RNT-1001?")
```

**Tech stack breakdown (1 min):**
- **Copilot Studio** — the agent (authored here; submitted separately).
- **Foundry IQ** — grounds every decision in permission-trimmed policy (overage policy, rate card, agreement).
- **Microsoft 365 Copilot** — ops surface; agent is published there.
- **Azure Communication Services (Call Automation)** — outbound PSTN, media streaming to Voice Live.
- **Azure Voice Live API (gpt-realtime)** — speech-to-speech with barge-in, no round-trip latency.
- **Groq (free tier)** — Whisper STT (transcription) + LLaMA 3.3-70B LLM (fallback reasoning).
- **Node.js/Express/TypeScript** — orchestration, policy engine, tool dispatcher.

**Judge talking point:**
"Authored in Copilot Studio" satisfies the requirement. The agent is the brain. This service is the tool it invokes. The separation is clean and enterprise-grade."

---

## 8:00–9:00 — Prompt engineering + reasoning depth (optional, if judges dig deep)

**If a judge asks: "How does the model know to decide differently for RNT-1001 vs RNT-1002?"**

**Answer: 9 prompt engineering techniques from academic papers.**

Show the system prompt builder (`src/agent/systemPrompt.ts`):

1. **Role-play** — "You are Vera, an AI assistant for Horizon Car Rental..."
2. **Context injection** — rental, customer tier, demand, next_booking_hours all injected per-call.
3. **Policy injection** — overage policy, rate card, extension limits, charge ceiling all injected from Foundry IQ.
4. **Chain-of-thought** — prompt tells the model to "think step by step" about the decision.
5. **Tool use** — model calls `extend()`, `charge()`, `scheduleReturn()`, `escalate()` as tools (not instructions).
6. **Constraint embedding** — prompt says "DO NOT extend if next_booking_hours < 6."
7. **Outcome specification** — prompt ends with "Confirm the outcome by summarizing the commitment."
8. **Few-shot in-context examples** — (if time) show 1–2 decision trees in the prompt.
9. **Temperature control** — set to 0.3 for recoveries, 0.5 for extensions (deterministic + creative).

**Live proof:**
- Click a call record > expand "System Prompt" → judges see the exact prompt sent to gpt-realtime.
- Highlight the policy constraints.

**Judge takeaway:**
"Reasoning isn't magic. It's careful prompt design + tool constraints + real-time policy injection. The model can't exceed the policy even if it tries."

---

## 9:00–10:00 — Close + FAQ

**Final talking points:**

- **Autonomous** — no human in the loop until the agent asks for one.
- **Responsible** — AI disclosure, recording notice, no card capture, hard policy limits, escalation on distress.
- **Grounded** — every decision cited from Foundry IQ policy.
- **Enterprise-grade** — Copilot Studio + Foundry IQ + Microsoft 365 Copilot + ACS + Voice Live. Full Azure stack.
- **Scalable** — handles 50-car fleet in the same 90 seconds. Every overdue return, same approach.

**Expected judge questions + answers:**

| Question | Answer |
|----------|--------|
| Does this actually call real phones? | Yes. ACS Call Automation places a real PSTN call. The test number is Twilio/demo or a real cell phone. |
| What if the customer doesn't pick up? | The agent leaves a voicemail (default ACS behavior) or retries after 5 mins (configurable). |
| What if the customer disputes the overage? | "I need a human" → agent escalates immediately to the queue. No argument. |
| Can the model charge unlimited? | No. Tool ceiling is $150. Anything above that sends a link + escalates. |
| What's the latency? | Call connects in 3–5 seconds. Voice Live turnaround is ~200ms (gpt-realtime). Total conversation feels natural. |
| How many languages? | English in demo. Foundry IQ + Azure TTS support 150+ languages; prompt can switch dynamically. |
| What's the cost? | ACS: ~$0.06/min. Voice Live: ~$0.10/min. Total ~$0.16/min per call. For a 2-min recovery call: ~$0.32. |

**Close:**
"GraceCall turns every late return into a 90-second, policy-safe, AI-powered conversation — at the scale of a whole fleet. Authored in Copilot Studio, grounded in Foundry IQ, deployed on Azure. [GitHub repo URL]."

---

## Troubleshooting (if things break live)

| Issue | Fix |
|-------|-----|
| Phone doesn't ring | Check `CALLBACK_BASE_URL` is reachable. Check ngrok/tunnel is active. Check `ACS_CALLER_ID` is valid. |
| Voice Live isn't streaming | Check `ENABLE_MEDIA_STREAMING=1`. Check `VOICE_LIVE_ENDPOINT` + `VOICE_LIVE_API_KEY`. Check firewall. |
| Dashboard doesn't update | Refresh browser. Check `/calls` endpoint (curl `localhost:8080/calls`). |
| Call drops mid-conversation | ACS or Voice Live connection lost. Fall back to the decision trace in the call log. |
| Copilot Studio agent missing | Show the OpenAPI spec (`copilot-studio/openapi.yaml`) instead. Highlight the TriggerOverdueCall action. |

---

## Post-demo

- [ ] Save call logs (screenshot or JSON export from `/calls` endpoint) for your final submission.
- [ ] Note: dashboard and transcripts are in-memory; restarting the server clears them.
- [ ] For judges' replay, provide the `CLAUDE.md` file and a README with setup steps (`npm install`, `.env` copy, `npm run dev`).
