# GraceCall — Project Description (submission copy)

> Paste-ready text for the hackathon submission form. The 150-word version is at the bottom for tight fields. All figures are illustrative (the brand "Horizon Car Rental" and all records are fictional).

## One-liner
**GraceCall is an enterprise voice agent that notices a rental car is overdue and calls the customer — recovering the vehicle, extending the rental, settling the overage, or escalating to a human, all within policy.**

## The problem
Rental fleets bleed money on late returns. Every overdue car is either lost overage revenue or — worse — a blocked next booking when the vehicle is already promised to someone else. Chasing each late return by hand doesn't scale: a single airport branch can have dozens open at once, and the highest-value cases (a booked SUV that won't be back for the 7 p.m. pickup) are exactly the ones a busy desk misses.

## The solution
GraceCall is an autonomous agent **authored in Copilot Studio**, grounded by **Foundry IQ**, and surfaced in **Microsoft 365 Copilot**. About an hour after a return goes overdue, it places a **real outbound phone call** through **Azure Communication Services + Azure Voice Live** and holds a natural, barge-in conversation — then takes the right action: secure a firm return, offer an extension, settle the overage, or hand off to a human.

It doesn't read a script. It **decides**. Using the live situation (how late, who's waiting for the car, demand, customer tier) and the policy retrieved from Foundry IQ, it picks one of four objectives and negotiates strictly inside the limits.

## How it works
```
Overdue rental (Power Automate fires ~1h after overage)
  → Copilot Studio agent "GraceCall"  +  Foundry IQ (overage policy · rate card · agreement)
  → decides: recover | extend | charge | escalate
  → TriggerOverdueCall action → Azure: ACS Call Automation (outbound PSTN) ⇄ Voice Live (gpt-realtime)
  → 📞 the customer's phone — a live, policy-safe conversation
  → outcome + transcript → Microsoft 365 Copilot (ops just ask "what happened on RNT-1001?")
```

## Microsoft technologies used
- **Copilot Studio** — the agent (the brain: instructions, knowledge, orchestration).
- **Foundry IQ** — the mandatory IQ layer; grounds every decision in retrieved, permission-trimmed policy.
- **Microsoft 365 Copilot** — the ops surface; the agent and its outcomes are queryable in Teams.
- **Azure Communication Services (Call Automation)** — the outbound PSTN call.
- **Azure Voice Live API (gpt-realtime)** — speech-to-speech with barge-in.
- **Power Automate** — the ~1-hour scheduled trigger. **Dataverse** — call records.

## Multi-step reasoning (the part judges should watch)
Same agent, two rentals, opposite calls — driven only by the data and the Foundry IQ policy:
- **RNT-1001** — Gold customer, SUV at SFO, **another booking in ~2.5h**. The policy's 6-hour recovery window applies → the agent chooses **RECOVER**: it does *not* offer an extension; it secures a firm return time and texts a reminder.
- **RNT-1002** — Standard customer, economy car in Austin, **no upcoming booking, low demand** → the same agent chooses **EXTEND**: it offers more time or settles the small overage.

The tools that take action **re-enforce the limits** server-side: if the model ever tries to extend past the cap or charge over the ceiling, the tool refuses and routes to a pay link or a human. The policy isn't a suggestion in the prompt — it's enforced in code.

## Responsible AI (built in, not bolted on)
Discloses it's an AI assistant and that the call may be recorded **in the first sentence**; honors do-not-call absolutely; escalates to a human on dispute, confusion, or distress; **never takes card numbers by voice** (sends a secure pay link); caps auto-charges and extensions; stops after 3 attempts.

## Business impact (illustrative)
- **Recovers vehicles in time** for the next booking — the highest-cost failure a fleet has.
- **Captures overage revenue** that desks let slide.
- **Scales to the whole fleet** — every overdue return becomes a 90-second, on-brand, policy-safe call, with zero agent time.

## What's next
Real payment + SMS providers, Dataverse-backed fleet data via Foundry IQ, multi-language, and inbound handling.

---

## Short version (≈150 words)
GraceCall is an enterprise voice agent that calls rental customers when their car is overdue — and resolves it. Authored in **Copilot Studio**, grounded by **Foundry IQ**, and surfaced in **Microsoft 365 Copilot**, it places a real outbound call via **Azure Communication Services + Voice Live** about an hour after a return goes late. It doesn't follow a script: using how late the car is, whether another booking is waiting, demand, and the customer's tier — plus policy retrieved from Foundry IQ — it chooses to **recover**, **extend**, **charge**, or **escalate**, and negotiates inside hard limits that its tools re-enforce in code. It discloses it's an AI, honors do-not-call, never takes card numbers by voice, escalates to a human on distress, and caps every charge and extension. The same agent recovers a booked SUV but offers an idle economy car more time — reasoning, not a recording. Every overdue return, handled in 90 seconds, at fleet scale.
