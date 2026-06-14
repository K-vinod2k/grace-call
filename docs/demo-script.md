# GraceCall — 5-minute demo video script

Target: ≤5:00. The call is the showstopper — get to it fast, let it breathe, then prove the depth.
Pre-stage everything (RNT-1001 overdue, your test phone ready) so nothing is provisioned on camera.

## 0:00–0:30 — The problem (hook)
"Rental cars come back late constantly. Every late return is either lost revenue or a blocked next
booking — and nobody has time to chase each one. Meet GraceCall: an AI agent that notices an overdue
rental and *calls the customer itself*." Show the overdue rental on the dashboard / in Copilot Studio.

## 0:30–2:15 — The live call (the moment)
Trigger it: in M365 Copilot/Teams say **"Call the customer for RNT-1001"** (or let the scheduled flow fire).
Your phone rings on camera. Put it on speaker. The agent:
- opens with the **AI disclosure + recording notice** (point this out — judges score safety),
- explains the SUV is 90 minutes overdue and another customer is booked at 7pm,
- because a booking is waiting, it **recovers** (does NOT offer an extension) and secures a return time,
- texts a confirmation. Hang up.
Let the real conversation play — barge-in and natural voice sell themselves.

## 2:15–3:15 — The reasoning (the depth, 20% of score)
Cut to the dashboard / Copilot Studio. Show the **decision trace** for that call:
"It chose *recover* over *extend* because the next booking was inside the 6-hour window — straight from
the overage policy in **Foundry IQ**." Ask Copilot the policy question live; show the **cited** answer.
Then contrast RNT-1002 (no booking, low demand) → the same agent chooses **extend**. Same brain, different
situation. That's reasoning, not a script.

## 3:15–4:00 — Enterprise + responsible AI
- "Authored in **Copilot Studio**, grounded by **Foundry IQ**, published to **Microsoft 365 Copilot** —
  ops just ask 'what happened on RNT-1001?' and get the logged outcome."
- Safety: disclosure, do-not-call, escalate-to-human on distress, no card numbers by voice, auto-charge
  ceiling, 3-attempt cap. Show one guardrail firing (e.g., it refuses to over-charge and sends a pay link).

## 4:00–4:45 — Architecture (the required diagram)
Show the diagram (`architecture.md`): Trigger → Copilot Studio agent + Foundry IQ → TriggerOverdueCall →
ACS Call Automation + Voice Live → customer → outcome back to M365 Copilot. 20 seconds, no jargon dump.

## 4:45–5:00 — Close
"GraceCall turns every overdue return into a 90-second, on-brand, policy-safe conversation — at the scale
of an entire fleet. Built on Copilot Studio, Foundry IQ, and Azure." End on the repo URL.

## Shot checklist
- [ ] Real phone ringing + two-way audio captured clearly
- [ ] Foundry IQ cited answer on screen
- [ ] recover-vs-extend contrast (RNT-1001 vs RNT-1002)
- [ ] one guardrail visibly firing
- [ ] architecture diagram
- [ ] repo URL on the final frame
