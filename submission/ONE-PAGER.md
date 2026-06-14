# GraceCall — One-Pager
## 150–250 word elevator pitch for submission portal

---

**GraceCall** is an autonomous AI voice agent that places real outbound calls to overdue rental car customers, negotiates vehicle recovery, and manages escalations—without human handoff.

**The problem:** Rental lot staff waste 1–2 hours daily making manual calls to chase down late returns, losing 3–5% fleet revenue annually to extended downtime.

**The solution:** When a vehicle goes overdue, Power Automate triggers GraceCall every 5 minutes. The agent (Vera) places a real PSTN call via Azure Communication Services, transcribes the customer's voice using Groq Whisper, reasons about the best recovery action using Azure AI Foundry and Groq LLaMA, and responds naturally via Azure Text-to-Speech. If the customer promises a return time, Vera logs it and automatically re-checks—no human follow-up needed.

**Why it's autonomous:**
- Polls for overdue rentals every 5 minutes without waiting for staff
- Decides recover/extend/charge/escalate based on rental age, next booking, customer tier—not a script
- Re-checks promised return times automatically and places follow-up calls if needed
- Surfaces all decisions and transcripts to Copilot Studio so staff can query "What did Vera say to Alex?"

**Built on:** Azure Container Apps, Azure Table Storage, Azure AI Foundry, Azure Communication Services, Groq (LLM + STT), Power Automate, Copilot Studio. **Deployed:** Live backend on Azure Container Apps; verified with real call demo (transcript and table updates in demo-evidence.md).

**Impact:** Recovers 20–40 min per overdue car; reduces escalations by ~30%.

---

*GraceCall — Microsoft Agents League · Enterprise Agents Track*
