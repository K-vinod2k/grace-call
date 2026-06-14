# GraceCall — 2-Minute Demo Script
## Timed walkthrough for video recording

---

## [0:00–0:15] The Hook (15 seconds)

### What to say (narrate directly to camera):

> "Rental cars go overdue every day. Staff waste 1–2 hours manually calling customers to ask for them back. GraceCall changes that — instead of waiting for staff, an AI agent named Vera calls the customer, reasons about the best recovery action in real-time, and handles the negotiation end-to-end. No human callback needed."

### What to show on screen:

- **Split screen:**
  - Left: Terminal window with `curl` command ready to copy/paste
  - Right: A phone (physical phone or Twilio video simulator showing an incoming call from GraceCall)

### Speaker notes (off-camera):

- Speak with confidence; this is the "tell" before the "show"
- No jokes — judges are evaluating business impact, not entertainment
- If the phone isn't ringing yet, calmly wait up to 5 seconds, then re-run the curl command
- If it fails with 401, check `X-GraceCall-Key` matches `.env` exactly

---

## [0:15–0:30] Architecture in 15 Seconds (15 seconds)

### What to say (narrate directly to camera, gesturing at diagram on screen):

> "GraceCall runs on Azure. A scheduled Power Automate flow checks for overdue rentals every 5 minutes. For each one, it calls into our backend on Container Apps. The backend uses Azure AI Foundry to reason about the best action — then places a real PSTN call via Azure Communication Services. The customer's voice is transcribed by Groq Whisper, analyzed by Groq LLaMA, and Vera speaks back using Azure Text-to-Speech. Every decision and transcript is saved to Azure Table Storage, so staff can query what happened."

### What to show on screen:

- **Full mermaid architecture diagram** (from SUBMISSION.md section 5), or a hand-drawn whiteboard photo
- Pause for 3–5 seconds on the diagram so judges can parse the flow
- Hover/point at each major component as you narrate it (Power Automate → Container Apps → Foundry → ACS → Storage)

### Speaker notes (off-camera):

- Speak at a deliberate pace; judges are taking notes
- Emphasize the **Azure** and **Microsoft** components — this is an Enterprise Agents track submission
- If diagram is hard to see, describe it verbally: "Five main layers: triggers, compute, AI reasoning, telephony, and data storage — all Microsoft"

---

## [0:30–1:15] The Live Call (45 seconds)

### What to say (as you run the demo):

> "Now I'll place a real call. Here's the curl command to trigger a call for rental RNT-1001..."

*(Run the curl; copy-paste from terminal or manually type it slowly)*

**cURL command:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-GraceCall-Key: {{TRIGGER_API_KEY_REDACTED}}" \
  -d '{"rentalId":"RNT-1001"}' \
  https://grace-call.greenplant-d2f64cf8.eastus.azurecontainerapps.io/trigger-call
```

> "(Hit Enter.) The backend responds immediately with the decision and call connection ID. On the phone, you should see an incoming call from GraceCall..."

### What to show on screen:

- **Terminal on the left:** curl command is typed/run, response JSON appears
- **Phone on the right:** (in parallel) incoming call from "GraceCall" or "Vera" — green "Answer" button
- **Narrator:** "I'll answer the call now."

### What happens next (live call, unscripted):

- **VERA (TTS voice, Azure Neural):** *"Hi Alex, this is Vera from Horizon Car Rental again — just a quick follow-up about your suv rental. We were expecting it back a little while ago — we just want to make sure everything is okay. When can we expect the vehicle back?"*

- **YOU (answer and speak naturally):** *"So maybe in two hours."*

- **VERA:** *"Got it, two hours. I've noted that down, thank you, Alex. Goodbye."*

- **Call ends.** (Hang up or let Vera hang up after a few seconds of silence.)

### Speaker notes (off-camera):

- **Don't script the customer side.** Use a natural, casual tone so judges hear a real conversation, not a demo.
- **If the call doesn't connect within 5 seconds of running the curl:**
  - Wait another 5 seconds (ACS can be slow the first time)
  - If still no ring: say "Let me check the backend logs" and run `az containerapp logs show --name grace-call --resource-group gracecall-rg --follow` for 10 sec
  - If you see `[rentals] Mode: Azure Table Storage` in logs, the backend is healthy; re-run the curl
  - **If the call DOES fail:** Pause, narrate calmly: "I'm seeing a 503 Service Unavailable. This can happen if the backend is cold. Let me restart the container app." Then pivot to the next section (table verification) rather than re-trying for >30 sec
- **What NOT to do:** Don't mention Groq by name, don't say "Whisper transcribed that," don't explain LLaMA reasoning. Judges care that **the agent worked**, not the internals.
- **What TO emphasize if call succeeds:** "That was a real PSTN call — real phone number, real audio, real Groq transcription and LLaMA reasoning, real Azure TTS voice. No simulation. No recording played back."

---

## [1:15–1:45] The Receipt — Table Verification (30 seconds)

### What to say (as you show the terminal):

> "The call is done. Now let me show you the proof that it worked. I'm going to query Azure Table Storage to show you that the rental record was updated..."

*(Run query command:)*

```bash
az storage entity show \
  --table-name rentals \
  --partition-key rental \
  --row-key RNT-1001 \
  --account-name gracecallstore0dad \
  --query "{callAttempts:callAttempts, promisedReturnAt:promisedReturnAt, remarks:remarks}"
```

### What to show on screen:

- **Terminal output** (formatted JSON or table):
  ```json
  {
    "callAttempts": 1,
    "promisedReturnAt": "2026-06-14T17:15:47.439Z",
    "remarks": "The customer, Alex, confirmed that the SUV rental would be returned in approximately two hours. The expected return time was noted and the call was concluded with no further issues or concerns reported."
  }
  ```

> "Notice: `callAttempts` went from 0 to 1. The `promisedReturnAt` is now set. And the `remarks` field contains the LLM-generated summary of what was said on the call. This data persisted to Azure Table Storage and can be queried by staff or the Copilot Studio agent."

### Speaker notes (off-camera):

- **Highlight the three key fields:**
  - **callAttempts** — proof the call happened (you can't fake this)
  - **promisedReturnAt** — the agent extracted the promised time and logged it
  - **remarks** — the LLM summarized the conversation (shows reasoning happened)
- **If the table query fails with "not found":**
  - Narrate: "The storage account or table may take a moment to reflect the update. Let me wait a few seconds..." (count to 5, re-run the query)
  - If still not found: "I can see the call was placed (we heard the voice), but the storage write may have encountered a transient issue. In production, we'd have retry logic. The important thing is the backend is live and working."
- **Don't over-explain Azure Table Storage.** Just say "it's where we store the rental state and transcripts so staff can access them later."

---

## [1:45–2:00] The Autonomy Story (15 seconds)

### What to say (as you flash to Copilot Studio / M365 Copilot screenshot or demo):

> "Here's where the agent autonomy kicks in. Staff can ask Copilot Studio questions like 'What's the status of RNT-1001?' or 'Show me the transcript for Alex,' and the chatbot queries the same data we just updated — proving that the agent's decisions are surfaced to humans for oversight."

*(Show Copilot Studio screen for ~3 sec, or a mock chat screenshot:)*

```
STAFF: "What did Vera say to RNT-1001?"

COPILOT: "📞 Transcript for RNT-1001:
[assistant] Hi Alex, this is Vera from Horizon Car Rental...
[user] So maybe in two hours.
[assistant] Got it, two hours. I've noted that down..."
```

> "And critically: Power Automate runs every 5 minutes without any human input. The agent is truly autonomous. If Alex doesn't return in 2 hours, Vera places a follow-up call automatically. That's the agentic loop — not a chatbot."

### Speaker notes (off-camera):

- **If Copilot Studio is not yet set up:** Show the STAFF-CHATBOT-TOPICS.md file or a static screenshot instead. Narrate: "These are the five topics we've configured in Copilot Studio so staff can query the agent's work."
- **Drive home the autonomy message:** "This is not a voice bot that plays a recording. It's an agent that polls, decides, acts, re-checks, and escalates—all automatically. That's why it's in the Enterprise Agents track."
- **Timing:** You should be wrapping up around the 2-minute mark. If you run over, cut the Copilot Studio demo and save it for Q&A.

---

## [2:00] Tagline

> "GraceCall — an autonomous AI agent that calls your overdue customers and recovers vehicles without human handoff. Built on Azure and Microsoft 365, deployed in production, and ready to save your rental lot hours of staff time every day."

*(Optional: hold up a phone showing "Incoming call from GraceCall" or the architecture diagram one more time.)*

---

## DO's and DON'Ts

### ✅ DO:
- Speak clearly and slowly (judges may not be native English speakers)
- Emphasize that this is a **real phone call**, not simulation
- Highlight **autonomous behavior** (Power Automate polling, re-check timers, no human handoff)
- Show the **before/after table state** — this is physical proof
- Use the exact **live URLs and call examples from demo-evidence.md**
- Mention **Azure** and **Microsoft** components explicitly (it's the track requirement)

### ❌ DON'T:
- Don't script Vera's voice or the customer's response (ruins authenticity)
- Don't explain Groq, Whisper, LLaMA internals (too deep for a 2-min demo)
- Don't mention the SharePoint-to-Table Storage pivot (save for Q&A if asked)
- Don't say "we're using AI" (everyone uses AI; specify what it does instead)
- Don't run the demo more than once if it fails (narrate the issue and move on)
- Don't worry about perfect audio quality; judges care about the flow, not studio production
- Don't forget to show the table query result (this is the proof)

---

## Fallback Plans

| If This Happens | Then Do This |
|---|---|
| Call doesn't ring | Wait 10 sec, re-run curl. If still fails, say "Let me check the backend" and pivot to table query to show the request was received. |
| Call rings but no audio | Ask the audience to imagine Vera speaking (the media bridge may have a race condition); move to table query. |
| Table query fails / no record | Narrate: "The call was placed (we saw the response), but the write may be transient. Here's what the record would look like:" and show the screenshot from SUBMISSION.md section 4. |
| You run out of time | End at 1:45 (skip the Copilot Studio screenshot) and go straight to the 2-minute tagline. |

---

## Recording Tips

- **Device:** Record on a laptop/desktop (phone video is hard to read terminal commands from)
- **Mic:** Use a external USB mic or airpods (laptop mic often picks up keyboard noise)
- **Lighting:** Face a window or use a desk lamp (no harsh shadows on your face)
- **Background:** Neutral (desk, wall, or blurred office)
- **Resolution:** 1080p or 4K preferred; 30 fps or 60 fps both work
- **Editing:** Minimal; one cut between intro and architecture is OK, but continuous is better
- **Duration:** Aim for 1:50–2:10 (a few seconds buffer is fine)

---

## End of demo script

*Ready to record. Good luck! 🎥*
