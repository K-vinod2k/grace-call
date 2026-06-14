# GraceCall — Staff Chatbot Topics (Copilot Studio)

This document describes 5 conversational topics to add to the existing
**GraceCall Overage Agent** in Copilot Studio (already set up per
[`ARCHITECTURE.md`](ARCHITECTURE.md)).

Each topic is self-contained and does **not** interfere with the autonomous
trigger loop already configured. The trigger loop runs on a schedule; these
topics are user-initiated (staff types a question).

---

## How to Add Topics Without Breaking the Trigger Loop

The autonomous trigger loop lives in the agent's **Instructions** box and fires
on a **Schedule trigger** — it is completely separate from conversational topics.
Topics only activate when a staff member **messages** the agent.

To add a topic:

1. Go to [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com)
2. Open your **GraceCall Overage Agent**
3. Click **Topics** in the left sidebar
4. Click **+ New topic** → **From blank**
5. Give the topic a name, add trigger phrases, then build the nodes as described
   below for each topic
6. Click **Save** after each topic
7. **Publish** the agent (top right) after adding all topics

> The existing **Schedule trigger** and **Instructions** are unchanged — topics
> are an additive layer.

---

## Topic 1 — Call Count

### Trigger phrases

Add all of these in the Trigger Phrases node:

- How many calls did you make?
- How many calls today?
- Total calls placed
- Call count
- How many calls have been made?
- Number of calls today

### Topic logic

```
[Trigger Phrases node]
  → [HTTP Request node]
       Method: GET
       URL:    <CONTAINERAPP_URL>/calls
       Headers:
         X-GraceCall-Key: <TRIGGER_API_KEY>
  → [Parse JSON / Set Variable node]
       Variable: callCount
       Value (Power Fx):
         CountRows(ParseJSON(Topic.HttpResponse.Body))
  → [Message node]
       Text: "GraceCall has placed {Topic.callCount} calls so far today."
```

### Copilot Studio node-by-node setup

1. **Trigger Phrases** node — add the phrases above
2. **Call an action** → choose **Send HTTP request** (or **Call an HTTP endpoint**):
   - Method: `GET`
   - URL: `<CONTAINERAPP_URL>/calls`
   - Add header: `X-GraceCall-Key` = `<TRIGGER_API_KEY>`
   - Response body variable: name it `callsResponse`
3. **Set a variable**:
   - Variable: `callCount`
   - Value (Expression tab):
     ```
     CountRows(ParseJSON(callsResponse.Body))
     ```
4. **Message** node:
   ```
   GraceCall has placed {callCount} calls so far today.
   ```

### Response example

> GraceCall has placed 3 calls so far today.

---

## Topic 2 — Customer Status

### Trigger phrases

- What's the status of Alex?
- Status of RNT-1001
- Check on {name}
- Where is {name}'s car?
- Is {name} back yet?
- Look up rental {rentalId}

### Topic logic

This topic uses **slot filling** to extract either a customer name or rental ID
from the utterance before making the API call.

```
[Trigger Phrases node]
  → [Slot Filling — Question node]
       "What is the customer name or rental ID you want to check?"
       Save to variable: rentalQuery (type: Text)
  → [HTTP Request node]
       Method: GET
       URL:    <CONTAINERAPP_URL>/rentals
       Headers: X-GraceCall-Key: <TRIGGER_API_KEY>
  → [Parse and Filter]
       Find the rental where Title = rentalQuery OR CustomerName = rentalQuery
  → [Condition node]
       If match found → Message with rental details
       Else → "I couldn't find a rental matching '{rentalQuery}'."
```

### Copilot Studio node-by-node setup

1. **Trigger Phrases** node — add the phrases above
2. **Question** node (slot filling):
   - Question text: `Which customer or rental ID should I look up?`
   - Save response as variable: `rentalQuery` (Text entity)
   - Skip this question if the utterance already contains a name/ID (Copilot
     Studio's NLU will attempt to pre-fill from the trigger phrase)
3. **Send HTTP request**:
   - Method: `GET`
   - URL: `<CONTAINERAPP_URL>/rentals`
   - Header: `X-GraceCall-Key` = `<TRIGGER_API_KEY>`
   - Response variable: `rentalsResponse`
4. **Set a variable** — find the matching rental:
   ```
   // Power Fx — find first rental matching name or ID
   First(
     Filter(
       ParseJSON(rentalsResponse.Body),
       ThisRecord.id = rentalQuery || ThisRecord.customerName = rentalQuery
     )
   )
   ```
   Save as variable: `rental`
5. **Condition** node: `IsBlank(rental)` → Yes / No branches
6. **No branch — Message** node:
   ```
   📋 Rental {rental.id}
   Customer : {rental.customerName}
   Car type : {rental.carType}
   Overdue  : {rental.minutesOverdue} minutes
   Calls    : {rental.callAttempts}
   Objective: {rental.objective}
   Returned : {If(IsBlank(rental.returnedAt), "Not yet", rental.returnedAt)}
   ```
7. **Yes branch — Message** node:
   ```
   I couldn't find a rental matching "{rentalQuery}". Try the rental ID (e.g. RNT-1001) or the customer's full name.
   ```

### Response example

> 📋 Rental RNT-1001
> Customer : Alex Rivera
> Car type : SUV
> Overdue  : 92 minutes
> Calls    : 1
> Objective: recover
> Returned : Not yet

---

## Topic 3 — Call Transcript

### Trigger phrases

- What did Alex say?
- Show me the transcript for RNT-1001
- Call transcript {name}
- What did {name} say on the call?
- Transcript for {rentalId}
- Read me the last call

### Topic logic

```
[Trigger Phrases node]
  → [Question node — slot fill rentalId or name]
  → [HTTP GET <CONTAINERAPP_URL>/transcript/{rentalId}]
  → [Format last 5 transcript entries]
  → [Message node with formatted dialogue]
```

### Copilot Studio node-by-node setup

1. **Trigger Phrases** node
2. **Question** node:
   - Text: `Which rental or customer's transcript would you like to see?`
   - Variable: `rentalQuery` (Text)
3. *(Optional)* If the input is a name, resolve it to a rental ID first using
   the same GET `/rentals` approach from Topic 2, then extract `rental.id`.
   Store the resolved ID in `resolvedRentalId`.
4. **Send HTTP request**:
   - Method: `GET`
   - URL: `<CONTAINERAPP_URL>/transcript/{resolvedRentalId}`
   - Header: `X-GraceCall-Key` = `<TRIGGER_API_KEY>`
   - Response variable: `transcriptResponse`
5. **Set a variable** — take last 5 entries:
   ```
   // Power Fx
   LastN(ParseJSON(transcriptResponse.Body), 5)
   ```
   Variable: `lastFive`
6. **Message** node (use a loop or format the 5 entries inline):
   ```
   📞 Last transcript entries for {resolvedRentalId}:

   {Concat(lastFive, "[" & role & "] " & content & Char(10))}

   (Full transcript: {Count(ParseJSON(transcriptResponse.Body))} turns)
   ```

### Response example

> 📞 Last transcript entries for RNT-1001:
>
> [assistant] Hi Alex, this is Vera from Grace Rentals. Your car was due back 92 minutes ago...
> [user] Yeah sorry I got stuck in traffic.
> [assistant] No problem — would you like a 2-hour extension for $18?
> [user] Yeah that works.
> [assistant] Perfect, I've noted the extension. We'll see you by 4pm. Drive safe!
>
> (Full transcript: 12 turns)

---

## Topic 4 — Overdue List

### Trigger phrases

- Which cars are still overdue?
- Show me all overdue rentals
- Who hasn't returned yet?
- Overdue list
- What's outstanding?
- List overdue cars

### Topic logic

```
[Trigger Phrases node]
  → [HTTP GET <CONTAINERAPP_URL>/rentals]
  → [Filter: returnedAt is null AND returnDueAt < now]
  → [Condition: any results?]
       Yes → Message with list of overdue rentals
       No  → "All cars are back! No overdue rentals. 🎉"
```

### Copilot Studio node-by-node setup

1. **Trigger Phrases** node
2. **Send HTTP request**:
   - Method: `GET`
   - URL: `<CONTAINERAPP_URL>/rentals`
   - Header: `X-GraceCall-Key` = `<TRIGGER_API_KEY>`
   - Response variable: `rentalsResponse`
3. **Set a variable** — filter overdue:
   ```
   // Power Fx
   Filter(
     ParseJSON(rentalsResponse.Body),
     IsBlank(ThisRecord.returnedAt) && ThisRecord.minutesOverdue > 0
   )
   ```
   Variable: `overdueList`
4. **Condition**: `CountRows(overdueList) > 0`
5. **Yes — Message** node:
   ```
   🚗 Overdue rentals ({CountRows(overdueList)} total):

   {Concat(
     overdueList,
     "• " & id & " (" & customerName & ", " & carType & ") — " & minutesOverdue & " min overdue" & Char(10)
   )}
   ```
6. **No — Message** node:
   ```
   All cars are back! No overdue rentals right now. 🎉
   ```

### Response example

> 🚗 Overdue rentals (2 total):
>
> • RNT-1001 (Alex Rivera, SUV) — 92 min overdue
> • RNT-1003 (Maria Santos, Economy) — 15 min overdue

---

## Topic 5 — Mark Returned

### Trigger phrases

- Mark RNT-1002 as returned
- Alex returned his car
- {name} is back
- {rentalId} returned
- Car returned for {name}
- Close out {rentalId}

### Topic logic

```
[Trigger Phrases node]
  → [Question node — slot fill rentalId or name]
  → [Resolve name to rentalId if needed]
  → [Confirmation question: "Mark RNT-1002 as returned?"]
  → [HTTP PATCH <CONTAINERAPP_URL>/rentals/{rentalId}/returned]
  → [Message: "RNT-1002 marked as returned. Loop closed."]
```

### Copilot Studio node-by-node setup

1. **Trigger Phrases** node
2. **Question** node:
   - Text: `Which rental should I mark as returned? (Use rental ID or customer name)`
   - Variable: `rentalQuery` (Text)
3. *(Optional)* Resolve name to ID via GET `/rentals` as in Topics 2–3.
   Store in `resolvedRentalId`.
4. **Question** node (confirmation):
   - Text: `Confirm: mark rental {resolvedRentalId} as returned?`
   - Response type: **Boolean** (Yes / No)
   - Variable: `confirmed`
5. **Condition**: `confirmed = true`
6. **Yes — Send HTTP request**:
   - Method: `PATCH`
   - URL: `<CONTAINERAPP_URL>/rentals/{resolvedRentalId}/returned`
   - Header: `X-GraceCall-Key` = `<TRIGGER_API_KEY>`
   - Body: `{}` (empty JSON body — the endpoint reads the ID from the URL)
   - Response variable: `patchResponse`
7. **Yes — Message** node:
   ```
   ✅ {resolvedRentalId} marked as returned. Loop closed — the re-check scheduler will stop for this rental.
   ```
8. **No — Message** node:
   ```
   OK, no changes made. Let me know if you need anything else.
   ```

### Response example

> ✅ RNT-1002 marked as returned. Loop closed — the re-check scheduler will stop for this rental.

---

## Quick Reference — API Endpoints Used

All requests must include header `X-GraceCall-Key: <TRIGGER_API_KEY>`.

| Topic | Method | Endpoint | Notes |
|---|---|---|---|
| Call Count | GET | `/calls` | Returns array of call log entries |
| Customer Status | GET | `/rentals` | Returns all rentals; filter client-side |
| Call Transcript | GET | `/transcript/{rentalId}` | Returns array of `{role, content}` objects |
| Overdue List | GET | `/rentals` | Same endpoint — filter `returnedAt=null` & `minutesOverdue>0` |
| Mark Returned | PATCH | `/rentals/{rentalId}/returned` | Sets `returnedAt` to now; stops re-check loop |

Replace `<CONTAINERAPP_URL>` with the URL output by `deploy-azure.sh` (e.g.
`https://grace-call.xxxxx.eastus.azurecontainerapps.io`).

---

## Testing Topics in Copilot Studio

1. After saving each topic, click **Test your agent** (bottom left panel)
2. Type one of the trigger phrases — the topic should activate
3. If it falls through to the default system topic instead, check:
   - The trigger phrases are saved (green checkmark on the Trigger node)
   - The agent has been **Published** (topics are only active after publish)
4. Check the **Topic details** panel on the right during a test to see which
   topic matched and where the conversation is in the flow

---

## Related Files

- [`copilot-studio/openapi.yaml`](openapi.yaml) — OpenAPI spec for the custom
  connector (for the autonomous trigger loop path via Copilot Studio)
- [`copilot-studio/ARCHITECTURE.md`](ARCHITECTURE.md) — Autonomous agent setup,
  Dataverse schema, and Copilot Studio wiring overview
- [`copilot-studio/POWER-AUTOMATE-SETUP.md`](POWER-AUTOMATE-SETUP.md) — Step-by-step
  Power Automate flow that auto-triggers calls every 5 minutes
- [`scripts/deploy-azure.sh`](../scripts/deploy-azure.sh) — Script to deploy the
  Node.js backend (get the `<CONTAINERAPP_URL>` from here)
