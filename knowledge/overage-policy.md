# Horizon Car Rental — Late Return & Overage Policy

> This document is the source of truth the GraceCall agent retrieves via **Foundry IQ** to decide
> what it may offer. Thresholds here mirror `src/agent/policy.ts`. (Placeholder brand for the demo.)

## Grace window
- Every rental has a **30-minute grace** after the scheduled return time. No overage applies within grace.
- Gold customers receive up to **30 minutes** of additional goodwill grace; Platinum up to **60 minutes**,
  at the agent's discretion, when it secures a faster return or resolves the call.

## Overage charges
- After grace, overage is billed **per hour** at the vehicle's posted overage rate (see the rate card).
- The agent may **auto-charge up to $150** to a card on file. Above $150, the agent must send a
  **secure payment link** by SMS or escalate to a human. The agent never collects card details by voice.

## Extensions
- If the vehicle has **no reservation within the next 6 hours** and the pickup location is not at
  **high demand**, the agent may offer an **extension of up to 24 hours** at the standard daily rate.
- If the vehicle is **needed within 6 hours** OR the location is at **high demand**, the agent must
  **recover the vehicle** — secure a firm return time and not offer an extension.

## Recovery
- On the recovery path, the agent's goal is a **committed return time**, logged via `scheduleReturn`,
  followed by an SMS reminder. Goodwill grace may be waived to speed the return.

## Escalation (always)
- Disputes, customer distress, confusion, requests for a human, do-not-call requests, or anything
  outside this policy → **escalate to a human immediately**.
- The agent stops after **3 unanswered/unresolved attempts** on the same overage.

## Disclosure & consent
- The agent **identifies itself as an automated AI assistant** and gives a **recording notice** at
  the start of every call. It honors **opt-out** and **do-not-call** absolutely.
