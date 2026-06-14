# GraceCall — Copilot Studio Architecture

Outbound AI voice agent for rental car overage recovery. The Node.js server owns
the telephony layer (ACS + Voice Live). Copilot Studio owns the agentic trigger
loop that decides when to call and passes control to the server.

---

## Data Flow

```
Dataverse (gr_rental rows)
        |
        | Agent polls / PA flow queries every 5 min
        v
Copilot Studio Autonomous Agent
        | POST /trigger-call  { rentalId }
        | Header: X-GraceCall-Key
        v
GraceCall Node server (ngrok tunnel)
        | decideObjective()  →  recover | extend | charge | escalate
        v
Azure Communication Services (Call Automation)
        | places outbound PSTN call
        v
Customer's phone  <-->  Vera (Voice Live / Groq realtime)
        |
        | Vera captures promisedReturnAt → server writes to rental store
        v
Re-check scheduler (setInterval 30 s)
        | promisedReturnAt passed AND returnedAt not set AND not yet escalated?
        | markEscalated()  →  re-runs runTrigger() → POST /trigger-call again
        v
Second call: callAttempts > 0 → systemPrompt marks it "follow-up call"
        |
        | Staff hits "Mark Returned" on dashboard → returnedAt set → loop exits
        v
Dashboard  (SSE live feed at /dashboard)
        shows: countdown timer, escalation badge, call log
```

---

## 1. Dataverse Schema

Create a custom table `gr_rental` (publisher prefix: `gr`).

| Display name          | Schema name               | Type          | Notes                                 |
|-----------------------|---------------------------|---------------|---------------------------------------|
| Rental ID             | gr_rentalid               | Text (PK)     | e.g. RNT-1001                         |
| Customer Name         | gr_customername           | Text          |                                       |
| Phone (E.164)         | gr_phonee164              | Text          | +1XXXXXXXXXX                          |
| Customer Tier         | gr_tier                   | Choice        | standard / gold / platinum            |
| Call Attempts         | gr_callattempts           | Whole Number  | Incremented by server after each call |
| Return Due At         | gr_returndueat            | Date and Time |                                       |
| Promised Return At    | gr_promisedreturnat       | Date and Time | Set after first call                  |
| Returned At           | gr_returnedat             | Date and Time | Set by staff via dashboard toggle     |
| Is Escalated          | gr_isescalated            | Yes/No        | Set by re-check scheduler             |
| Do Not Call           | gr_donotcall              | Yes/No        | Hard block — agent must respect this  |
| Next Booking Starts   | gr_nextbookingstartsAt    | Date and Time | Nullable                              |
| Overage Hourly Rate   | gr_overagehourlyratedollar| Currency      |                                       |

> For the hackathon demo the server uses its own in-memory store (`src/data/rentals.ts`).
> Dataverse is the production path — the agent would read from Dataverse and the server
> would write back via the Dataverse connector after each call.

---

## 2. Copilot Studio Autonomous Agent Setup

### 2a. Import the custom connector

1. Open [make.powerapps.com](https://make.powerapps.com) → **Custom connectors** → **New custom connector** → **Import an OpenAPI file**.
2. Upload `copilot-studio/openapi.yaml`.
3. On the **Security** tab: type = **API Key**, header name = `X-GraceCall-Key`. Save.
4. Create a connection: paste the value of `TRIGGER_API_KEY` from your `.env`.

### 2b. Create the autonomous agent

1. Go to [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com) → **Create** → **Autonomous agent**.
2. Name: `GraceCall Overage Agent`. Language: English.
3. **Knowledge** — skip for now (policy reasoning lives inside the Node server's `decideObjective()`).
4. **Actions** tab → **Add action** → **Custom connector** → select `GraceCall Telephony Tool` → select operation `TriggerOverdueCall`. Save.

### 2c. Write the agent's trigger instruction

In the **Instructions** box (plain English, not a topic):

```
You are an autonomous rental overage recovery agent.
Every time you run, query the gr_rental Dataverse table for rows where:
  - returnDueAt is in the past
  - returnedAt is null
  - doNotCall is false
  - callAttempts is less than 2

For each matching rental, call the TriggerOverdueCall action with its rentalId.
Do not call the same rentalId more than once per run.
After each successful call, record the result (objective, rationale) in your run log.
```

### 2d. Configure the trigger schedule

- **Trigger type**: Schedule
- **Recurrence**: Every 5 minutes (minimum supported interval)
- Leave **Time zone** set to UTC unless your lot operates in a fixed zone.

### 2e. Publish

**Publish** → confirm. The agent will begin firing on the recurrence.
Check **Activity** tab to see each run's reasoning trace and the connector responses.

---

## 3. Power Automate Alternative (simpler for the hackathon demo)

If Copilot Studio autonomous triggers are unavailable on your tenant license, use a
scheduled Power Automate cloud flow instead.

```
Recurrence (every 5 minutes)
  └─ List rows — Dataverse — gr_rental
       Filter: returnDueAt lt utcNow() AND returnedAt eq null AND doNotCall eq false AND callAttempts lt 2
  └─ Apply to each (rental row)
       └─ HTTP action
            Method:  POST
            URL:     https://<ngrok-host>/trigger-call
            Headers: { "X-GraceCall-Key": "<TRIGGER_API_KEY>", "Content-Type": "application/json" }
            Body:    { "rentalId": @{items('Apply_to_each')?['gr_rentalid']} }
```

This is functionally identical to the autonomous agent path — both POST to the same
`/trigger-call` endpoint. Use this for the demo if you need a faster setup path.

---

## 4. Second-Call Behavior

The server handles escalation entirely server-side — no Copilot Studio change needed.

1. During the first call, Vera captures a `promisedReturnAt` timestamp and stores it.
2. `startReCheckScheduler()` (30-second interval) calls `listPendingReChecks()`:
   - Condition: `promisedReturnAt <= now AND returnedAt == null AND isEscalated == false`
3. On match: `markEscalated(rentalId)` fires, then `runTrigger(rentalId)` places the second call.
4. `buildSystemPrompt()` detects `callAttempts > 0` and opens with:
   _"Hi, this is Vera calling back from [Location] — this is a follow-up regarding your rental."_
5. Staff marks the vehicle returned via the dashboard toggle (`POST /rentals/:id/returned`),
   which sets `returnedAt` and stops further re-check cycles.

---

## 5. Connector + Agent Wiring Checklist

- [ ] Custom connector imported from `copilot-studio/openapi.yaml`
- [ ] Connection created with correct `TRIGGER_API_KEY` value
- [ ] `TriggerOverdueCall` action added to the agent
- [ ] Agent instructions reference `gr_rental` table with correct filter columns
- [ ] Schedule trigger set to 5-minute recurrence
- [ ] ngrok tunnel URL in `openapi.yaml` `servers[0].url` matches running tunnel
- [ ] Agent published and first run visible in Activity tab
- [ ] `ENABLE_MEDIA_STREAMING=1` set in `.env` for live Voice Live conversation
- [ ] `AUTO_DIAL=0` in `.env` (Copilot Studio is the dialer — avoid double-calling)
