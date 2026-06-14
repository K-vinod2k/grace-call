# GraceCall — Final Submission Checklist

**Live backend:** https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io  
**App registration:** `GraceCall-Graph-Client` (App ID: `668e0ee9-8e41-4008-b93f-e03156270cdf`)  
**Tenant:** `wdivinodgmail919.onmicrosoft.com` (ID: `c288ecc3-8887-4fe9-a243-2932e7959d5b`)

> **Read this file from top to bottom. Each step takes ~2-20 min.  
> Steps marked `(you)` require browser UI work. Steps marked `(script)` run in your terminal.**

---

## Step 1 — Azure Table Storage ✅ (already done!)

> **No action needed.** The backend now persists all rental data in Azure Table Storage
> (`gracecallstore0dad`, table `rentals`, resource group `gracecall-rg`).
> The Container App is running with `AZURE_TABLES_CONNECTION_STRING` wired as a secret.
> Two demo rentals (RNT-1001 Alex Rivera, RNT-1002 Jordan Lee) are already seeded.

**What was set up:**
- Storage account: `gracecallstore0dad` (Standard LRS, East US)
- Table: `rentals` (PartitionKey: `"rental"`, RowKey: rentalId)
- Container App running `v2-tables` image — startup log confirms `[rentals] Mode: Azure Table Storage`
- `AZURE_TABLES_CONNECTION_STRING` stored as secret `azure-tables-connection-string` on the Container App

**To re-seed or add rows locally:**
```bash
AZURE_TABLES_CONNECTION_STRING="<connection-string>" node scripts/seed-table.mjs
```

**To verify what's in the table:**
```bash
# Returns seeded data from Azure Table Storage (not in-memory)
curl https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io/rentals

# Confirm remarks write round-trip
curl -X POST https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io/debug/write-remarks \
  -H "Content-Type: application/json" \
  -H "X-GraceCall-Key: <TRIGGER_API_KEY>" \
  -d '{"rentalId":"RNT-1001","summary":"Verification test"}'
```

---

## Step 2 — Azure AI Foundry Agent `(you, ~5 min)`

1. Go to https://ai.azure.com → sign in with your Azure account
2. Open your project (or create one: **+ Create project** → name `gracecall-demo`)
3. Deploy a model if needed: **Models + endpoints → Deploy model → gpt-4o** (or gpt-4o-mini)
4. Go to **Agents → + New agent**
   - Name: `GraceCall Operations Assistant`
   - Model: your gpt-4o deployment
5. **Set the system prompt** — click the **Instructions** field and paste the full text from:  
   `azure-foundry/system-prompt.md` (the section after "## System Message")
6. **Add the OpenAPI tool** — click **Actions → + Add → OpenAPI 3.0 specified tool**
   - Name: `GraceCall`
   - Upload: `azure-foundry/openapi-foundry.yaml`
   - Auth type: **API Key (Custom)**
     - Header name: `X-GraceCall-Key`
     - Value: your `TRIGGER_API_KEY` from `.env`
7. **Test in the playground:**
   ```
   Call the customer on rental RNT-1001 — their SUV is overdue.
   ```
   Expected: Vera places the call, reports objective + rationale, and the `remarks` column in Azure Table Storage gets updated.

---

## Step 3 — Power Automate Auto-Trigger Flow `(you, ~15 min)`

Full instructions: `copilot-studio/POWER-AUTOMATE-SETUP.md`

**5 key actions to build in sequence:**
1. **Recurrence trigger** — every 5 minutes (Step 3 of the guide)
2. **Azure Tables "List entities"** — use the **Azure Table Storage** connector (not SharePoint).  
   Connect to storage account `gracecallstore0dad`, table `rentals`.  
   Filter: `returnDueAt lt datetime'@{utcNow()}'` (or leave unfiltered and check in the next step)
3. **Condition** — skip if result is empty (Step 5)
4. **Apply to each** — loop over overdue entities (Step 6)
5. **HTTP POST** to `https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io/trigger-call` with body `{"rentalId": "@{item()?['RowKey']}"}` and header `X-GraceCall-Key: <your TRIGGER_API_KEY>` (Step 7)

**Azure Tables connector setup notes:**
- In Power Automate, search for **Azure Table Storage** connector
- Authentication: use the **Storage Account Name** (`gracecallstore0dad`) and **Storage Account Key**  
  (get the key with: `az storage account keys list --account-name gracecallstore0dad -o tsv`)
- Action: **Get entities** from table `rentals`
- The `RowKey` property is the rentalId (e.g., `RNT-1001`)

> After saving, click **Test → Manually** to run it once and verify the HTTP step returns 200.

---

## Step 4 — Copilot Studio Staff Chatbot `(you, ~20 min)`

Full instructions: `copilot-studio/STAFF-CHATBOT-TOPICS.md`

**5 topics to configure:**

| Topic | Trigger phrases | What it does |
|---|---|---|
| **Call Count** | "how many calls", "call attempts for RNT-…" | Reads `callAttempts` from the Container App `/rentals` endpoint |
| **Customer Status** | "status of RNT-…", "is RNT-1001 overdue" | Returns rental `returnDueAt` and `isEscalated` |
| **Call Transcript** | "show transcript", "what did we say to Alex" | Calls `/transcript/{rentalId}` on the Container App |
| **Overdue List** | "show overdue rentals", "who is late" | Calls `/rentals` and filters by returnDueAt < now |
| **Mark Returned** | "mark RNT-… as returned", "car is back" | Calls `PATCH /rentals/{id}/returned` on the Container App |

**Data source: use the Container App's REST API** (not a SharePoint connector):
- Connect Copilot Studio to GraceCall via the `openapi.yaml` in `copilot-studio/openapi.yaml`.
- The `/rentals` endpoint now returns data directly from Azure Table Storage — no SharePoint connector needed.

---

## Step 5 — Live Test Call `(you + script, ~5 min)`

Once Steps 2-4 are done, run a live end-to-end test:

```bash
# Trigger a call for RNT-1001
curl -X POST \
  https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io/trigger-call \
  -H "Content-Type: application/json" \
  -H "X-GraceCall-Key: $(grep TRIGGER_API_KEY .env | cut -d= -f2)" \
  -d '{"rentalId":"RNT-1001"}'
```

Expected response:
```json
{
  "placed": true,
  "rentalId": "RNT-1001",
  "objective": "recover",
  "rationale": "...",
  "amountOwed": 27
}
```

Then query Azure Table Storage to verify:
```bash
az storage entity show \
  --table-name rentals \
  --partition-key rental \
  --row-key RNT-1001 \
  --account-name gracecallstore0dad \
  --query "{callAttempts:callAttempts, remarks:remarks}"
```

Expected: `callAttempts` incremented to `1` and `remarks` contains the call outcome from Vera.

**That's your demo!** 🎉

---

## Quick Reference

| Item | Value |
|---|---|
| Backend URL | https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io |
| Resource group | `gracecall-rg` |
| Storage account | `gracecallstore0dad` |
| Table name | `rentals` |
| Storage secret name | `azure-tables-connection-string` (on the Container App) |
| App registration | `GraceCall-Graph-Client` |
| App (Client) ID | `668e0ee9-8e41-4008-b93f-e03156270cdf` |
| Tenant ID | `c288ecc3-8887-4fe9-a243-2932e7959d5b` |
| Tenant domain | `wdivinodgmail919.onmicrosoft.com` |
| Foundry setup guide | `azure-foundry/FOUNDRY_SETUP.md` |
| Power Automate guide | `copilot-studio/POWER-AUTOMATE-SETUP.md` |
| Copilot Studio guide | `copilot-studio/STAFF-CHATBOT-TOPICS.md` |
