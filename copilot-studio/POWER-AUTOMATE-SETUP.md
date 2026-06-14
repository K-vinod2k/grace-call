# GraceCall — Power Automate Auto-Trigger Setup

This guide walks you through creating a scheduled Power Automate cloud flow that
automatically calls GraceCall's `/trigger-call` endpoint every 5 minutes for any
rental that is overdue and hasn't been reached yet.

This is the **Phase 3** implementation described in
[`copilot-studio/ARCHITECTURE.md`](ARCHITECTURE.md) (section 3), now using
SharePoint instead of Dataverse. It replaces both `npm run trigger:demo` and the
laptop-resident scheduler.

---

## Prerequisites

| Item | Where to get it |
|---|---|
| Microsoft 365 account with Power Automate (Standard or Premium) | Your M365 tenant |
| SharePoint list `GraceCallRentals` created | See the V2 Architecture plan — Phase 2 |
| `TRIGGER_API_KEY` from your `.env` | Copy from `.env` → `TRIGGER_API_KEY=...` |
| `<CONTAINERAPP_URL>` from running `deploy-azure.sh` | The `https://grace-call.xxx.eastus.azurecontainerapps.io` URL printed at the end |

---

## Step 1 — Open Power Automate

1. Navigate to **[https://make.powerautomate.com](https://make.powerautomate.com)**
2. Sign in with your Microsoft 365 account (same tenant that has SharePoint)
3. In the left sidebar, confirm you are in the correct **Environment** (top-right
   environment picker — usually "Default environment" or your org's environment)

> **Screenshot guidance:** The home page shows "Start from blank", "Start from a
> template", and "Start from a connector". You will use "Start from blank".

---

## Step 2 — Create a New Automated Cloud Flow

1. Click **+ Create** in the left sidebar
2. Select **Automated cloud flow**
3. In the "Build an automated cloud flow" dialog:
   - **Flow name**: `GraceCall — 5-min overdue trigger`
   - **Choose your flow's trigger**: search for **Recurrence** and select it
4. Click **Create**

> You will land in the flow designer canvas with a single "Recurrence" trigger box.

---

## Step 3 — Configure the Recurrence Trigger

Click the **Recurrence** trigger card to expand its settings:

| Field | Value |
|---|---|
| **Interval** | `5` |
| **Frequency** | `Minute` |
| **Time zone** | Select your rental lot's local time zone (or leave UTC) |
| **Start time** | Leave blank (starts immediately on first save) |

> **Screenshot guidance:** You should see "Every 5 Minute(s)" summarised below the
> trigger title once configured.

---

## Step 4 — Add "Get items" from SharePoint

1. Click **+ New step**
2. Search for **SharePoint** and select the SharePoint connector
3. Choose action: **Get items**
4. Configure the action:

| Field | Value |
|---|---|
| **Site Address** | Select your SharePoint site (e.g. `https://contoso.sharepoint.com/sites/GraceCall`) |
| **List Name** | `GraceCallRentals` |
| **Filter Query** | (see below) |
| **Top Count** | `20` (safety cap — prevents accidental mass-dialing) |

**Filter Query** (paste exactly, then replace nothing — Power Automate will evaluate the dynamic expression):

```
fields/OutTime le '@{utcNow()}' and fields/ReturnedAt eq null and fields/DoNotCall eq false and fields/CallAttempts lt 2
```

> **Important:** The single quotes around `@{utcNow()}` are required by the
> SharePoint OData filter syntax. Power Automate evaluates `@{utcNow()}` at
> runtime and inserts the current UTC ISO 8601 timestamp.

> **Screenshot guidance:** The "Filter Query" field is under "Show advanced
> options". The filter should appear as a single line of text. Do NOT use the
> GUI field builder for this — paste the string directly.

---

## Step 5 — Add a Condition (Guard against empty result)

1. Click **+ New step**
2. Choose **Condition**
3. Configure:
   - **Left value**: Click inside the field → Dynamic content → search for
     `value` → select **value** from the "Get items" step
   - This will auto-wrap to: `length(body('Get_items')?['value'])`
   - **Operator**: `is greater than`
   - **Right value**: `0`

> **Power Fx equivalent:**
> ```
> greater(length(body('Get_items')?['value']), 0)
> ```

This guards against running the loop when no rentals are overdue.

---

## Step 6 — Add "Apply to each" in the YES Branch

Inside the **If yes** branch of the Condition:

1. Click **Add an action** (inside the Yes branch)
2. Search for **Apply to each** (in the Control connector)
3. In the **Select an output from previous steps** field:
   - Click the field → Dynamic content → select **value** from "Get items"

> This will iterate over each overdue rental item returned by SharePoint.

---

## Step 7 — Add the HTTP POST to /trigger-call

Inside the **Apply to each** loop:

1. Click **Add an action**
2. Search for **HTTP** and select **HTTP** (the premium HTTP action)
3. Configure:

| Field | Value |
|---|---|
| **Method** | `POST` |
| **URI** | `<CONTAINERAPP_URL>/trigger-call` |

**Headers** — click **Add new parameter** → **Headers**, then add:

| Header Name | Header Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-GraceCall-Key` | `<your TRIGGER_API_KEY value from .env>` |

> **Critical:** Do NOT put the `X-GraceCall-Key` value in the flow body — always
> use a header. If your tenant has a premium HTTP connector, store the key as a
> flow environment variable: Settings → Environment variables → create
> `GraceCallTriggerKey` of type Secret. Then reference it as
> `@{parameters('GraceCallTriggerKey')}` in the header value field.

**Body** — click **Add new parameter** → **Body**, then paste:

```json
{
  "rentalId": @{items('Apply_to_each')?['fields']?['Title']}
}
```

> The `Title` column holds the Rental ID (e.g. RNT-1001) — it is SharePoint's
> built-in primary text column, mapped to "Rental ID" in the list setup.

> **Screenshot guidance:** The HTTP action should show Method = POST, URI filled,
> and two rows in the Headers table. The Body should show the JSON with the
> dynamic `rentalId` token highlighted in a blue pill.

---

## Step 8 — Increment CallAttempts (Update item)

Still inside **Apply to each**, after the HTTP action:

1. Click **Add an action**
2. Search for **SharePoint** → **Update item**
3. Configure:

| Field | Value |
|---|---|
| **Site Address** | Same site as Step 4 |
| **List Name** | `GraceCallRentals` |
| **Id** | Dynamic content → **ID** from "Apply to each" (the SharePoint item integer ID) |

**Expand the "Columns" section** and find the `CallAttempts` field:

| Column | Value |
|---|---|
| `CallAttempts` | `@{add(items('Apply_to_each')?['fields']?['CallAttempts'], 1)}` |

> This uses Power Automate's `add()` expression to increment the current value
> by 1. This prevents the flow from calling the same rental more than twice
> (the Get items filter blocks anything with `CallAttempts >= 2`).

> **Expression syntax:** Click the `CallAttempts` value field → switch to the
> **Expression** tab (not Dynamic content) → type:
> ```
> add(items('Apply_to_each')?['fields']?['CallAttempts'], 1)
> ```

---

## Step 9 — Save and Test

### Save the flow

Click **Save** (top right). Power Automate will validate and save. Any red
validation errors will appear on the affected action cards.

### Manual test run

1. Click **Test** (top right) → **Manually** → **Test**
2. Power Automate will run the flow immediately (bypassing the 5-minute wait)
3. Watch the run animate in real time — each action turns green (success) or
   red (failure)
4. If the HTTP action fails with **401**, check that the `X-GraceCall-Key` header
   value matches `TRIGGER_API_KEY` in your `.env` exactly

### Check run history

1. In the flow detail page, scroll down to **28 day run history**
2. Click any past run to see the full execution trace including:
   - How many items were returned by "Get items"
   - The HTTP response body from `/trigger-call`
   - Whether the SharePoint "Update item" succeeded

### Check the GraceCall dashboard

After a successful run, open `<CONTAINERAPP_URL>/dashboard` to see:
- A new entry in the call log
- The live transcript appearing (if `ENABLE_MEDIA_STREAMING=1`)

---

## Completed Flow Structure (visual summary)

```
┌─────────────────────────────────────────────────────┐
│ 🔁 Recurrence                                       │
│    Every 5 minutes                                   │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│ 📋 Get items — SharePoint                           │
│    List: GraceCallRentals                            │
│    Filter: OutTime ≤ now, ReturnedAt = null,         │
│            DoNotCall = false, CallAttempts < 2       │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│ 🔀 Condition                                        │
│    length(value) > 0                                 │
└──── YES ───────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│ 🔄 Apply to each (rental item)                      │
│                                                     │
│   ┌─────────────────────────────────────────────┐  │
│   │ 🌐 HTTP POST                                │  │
│   │    URL: <CONTAINERAPP_URL>/trigger-call     │  │
│   │    X-GraceCall-Key: <TRIGGER_API_KEY>       │  │
│   │    Body: { "rentalId": <Title> }            │  │
│   └─────────────────────────────────────────────┘  │
│                                                     │
│   ┌─────────────────────────────────────────────┐  │
│   │ ✏️  Update item — SharePoint                │  │
│   │    CallAttempts = current + 1               │  │
│   └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| HTTP action returns 401 | Wrong `X-GraceCall-Key` | Copy the exact value from `.env` `TRIGGER_API_KEY` |
| HTTP action returns 404 | Wrong URL | Confirm `<CONTAINERAPP_URL>` ends with no trailing slash and Container App is running |
| HTTP action returns 503 | Container App is cold (0 replicas) | Set `--min-replicas 1` — see `deploy-azure.sh` (already set) |
| Get items returns 0 rows but rentals exist | Filter syntax error | Remove the outer single quotes from the OData filter; confirm SharePoint column internal names match |
| Update item fails | SharePoint item ID not found | Confirm the `Id` field is mapped to the dynamic SP item integer ID, not the `Title` field |
| Flow not triggering on schedule | Flow is turned off | Flow detail page → confirm the toggle at the top is **On** |

---

## Related files

- [`copilot-studio/openapi.yaml`](openapi.yaml) — Custom connector spec for the
  Copilot Studio path (uses the same `/trigger-call` endpoint)
- [`copilot-studio/ARCHITECTURE.md`](ARCHITECTURE.md) — Section 3 has the
  Dataverse variant of this flow (for orgs using Dataverse instead of SharePoint)
- [`copilot-studio/STAFF-CHATBOT-TOPICS.md`](STAFF-CHATBOT-TOPICS.md) — Staff
  chatbot topics that query the same SharePoint list and the Container App API
