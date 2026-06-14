/**
 * Bridges the ACS bidirectional media WebSocket to a Voice Live session.
 *
 * Frame protocol (verified against Azure-Samples/call-center-voice-agent-accelerator):
 *  - Audio is 24kHz / 16-bit / mono PCM, base64 — same as Azure Voice Live, so NO resampling.
 *  - ACS → us (caller audio) is **camelCase**:  {"kind":"AudioData","audioData":{"data":"…","silent":false}}
 *  - us → ACS (agent audio / control) is **PascalCase**:
 *        play:     {"Kind":"AudioData","AudioData":{"Data":"…"},"StopAudio":null}
 *        barge-in: {"Kind":"StopAudio","AudioData":null,"StopAudio":{}}
 *  The casing is asymmetric on purpose — mixing it up is the classic bug here.
 */
import { type WebSocket, type WebSocketServer } from "ws";
import { VoiceLiveSession } from "../voicelive/session.js";
import { GroqConversation } from "../groq/conversation.js";
import { decideObjective } from "../agent/policy.js";
import { getRental, setPromisedReturn } from "../data/rentals.js";
import { type CallRecord, appendTranscript, appendToolAction } from "../log.js";
import { config } from "../config.js";
import { getCallMedia, hangUpCall } from "./callClient.js";

const WS_OPEN = 1;

export function attachMediaBridge(wss: WebSocketServer, inFlight: Map<string, CallRecord>): void {
  wss.on("connection", async (acsSocket: WebSocket, req) => {
    // ACS connects to /acs/media?rentalId=...  (set as transportUrl in the media-streaming options).
    const rentalId = new URL(req.url ?? "", "http://x").searchParams.get("rentalId") ?? "";
    const rental = await getRental(rentalId);
    const record = inFlight.get(rentalId);
    if (!rental || !record) {
      acsSocket.close();
      return;
    }

    const sendToAcs = (obj: unknown): void => {
      if (acsSocket.readyState === WS_OPEN) acsSocket.send(JSON.stringify(obj));
    };

    const now = new Date();
    const decision = decideObjective(rental, now);

    // Groq path (free): Whisper STT + LLaMA LLM + ACS TTS — activated when GROQ_API_KEY is set.
    // Voice Live path: Azure OpenAI Realtime (requires quota; falls back to Groq automatically).
    if (config.groq.apiKey) {
      const convo = new GroqConversation(
        rental,
        decision,
        () => record.callConnectionId ?? "",
        {
          onTranscript: (role, text) => appendTranscript(rentalId, role, text),
          onError: (err) => console.error(`[GroqConversation] ${rentalId}:`, err.message),
        },
        () => { record.onPlayCompleted = () => convo.unmute(); },
      );

      void convo.open().catch((err: Error) =>
        console.error("[GroqConversation] open failed:", err.message),
      );

      acsSocket.on("message", (data) => {
        let frame: { kind?: string; audioData?: { data?: string; silent?: boolean } };
        try { frame = JSON.parse(data.toString()); } catch { return; }
        if (frame.kind === "AudioData" && frame.audioData?.data && frame.audioData.silent !== true) {
          convo.pushChunk(frame.audioData.data);
        }
      });

      acsSocket.on("close", async () => {
        record.outcome = summarize(record);
        convo.close();
        inFlight.delete(rentalId);
        // Auto-set re-check deadline: RECHECK_AFTER_MIN minutes from now.
        // If the call had a real conversation, this kicks off the follow-up check.
        if (record.transcript.length > 0) {
          const deadline = new Date(Date.now() + config.recheckAfterMin * 60_000).toISOString();
          await setPromisedReturn(rentalId, deadline);
          console.log(`[RECHECK] ${rentalId} — re-check scheduled for ${deadline}`);
        }

        // Generate a 2-sentence call summary and write to Remarks (all store modes).
        try {
          const { summarizeCall } = await import("../utils/summarize.js");
          const summary = await summarizeCall(rentalId, record.transcript);
          console.log(`[Summary ${rentalId}] ${summary}`);
          const { writeRemarks } = await import("../data/rentals.js");
          await writeRemarks(rentalId, summary);
        } catch (err) {
          console.error(`[Summary] Failed for ${rentalId}:`, (err as Error)?.message);
        }
      });

      return;
    }

    // Voice Live path (requires Azure OpenAI Realtime quota).
    const session = new VoiceLiveSession(rental, decision, now, {
      onAgentAudio: (base64Pcm) => {
        // Agent speech → ACS (PascalCase play frame).
        sendToAcs({ Kind: "AudioData", AudioData: { Data: base64Pcm }, StopAudio: null });
      },
      onUserSpeechStarted: () => {
        // Caller interrupted → tell ACS to drop the agent audio it has buffered (barge-in).
        sendToAcs({ Kind: "StopAudio", AudioData: null, StopAudio: {} });
      },
      onTranscript: (role, text) => appendTranscript(rentalId, role, text),
      onToolResult: (name, detail) => {
        appendToolAction(rentalId, name, detail);
        if (name === "escalateToHuman" && record.callConnectionId) {
          // Play a hold message then hang up — in prod, transfer to a human queue via ACS.
          const connId = record.callConnectionId;
          void (async () => {
            try {
              const media = getCallMedia(connId);
              await media.playToAll([
                { kind: "textSource", text: "Connecting you to a team member now. Please hold.", voiceName: "en-US-AvaNeural" } as never,
              ]);
              await new Promise((r) => setTimeout(r, 4000));
              await hangUpCall(connId);
            } catch { /* call may already be gone */ }
          })();
        }
      },
    });

    session.connect().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Voice Live connect failed:", err?.message);
      acsSocket.close();
      // Hang up so the customer isn't left in silence — Voice Live failure is silent otherwise.
      if (record.callConnectionId) {
        void hangUpCall(record.callConnectionId).catch(() => { /* call may already be gone */ });
      }
    });

    acsSocket.on("message", (data) => {
      let frame: { kind?: string; audioData?: { data?: string; silent?: boolean } };
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return;
      }
      // Caller audio → Voice Live. Skip the AudioMetadata first frame and silent frames.
      if (frame.kind === "AudioData" && frame.audioData?.data && frame.audioData.silent !== true) {
        session.appendCallerAudio(frame.audioData.data);
      }
    });

    acsSocket.on("close", async () => {
      record.outcome = summarize(record);
      session.close();
      inFlight.delete(rentalId);

      // Generate a 2-sentence call summary and write to Remarks (all store modes).
      try {
        const { summarizeCall } = await import("../utils/summarize.js");
        const summary = await summarizeCall(rentalId, record.transcript);
        console.log(`[Summary ${rentalId}] ${summary}`);
        const { writeRemarks } = await import("../data/rentals.js");
        await writeRemarks(rentalId, summary);
      } catch (err) {
        console.error(`[Summary] Failed for ${rentalId}:`, (err as Error)?.message);
      }
    });
  });
}

function summarize(record: CallRecord): string {
  const last = record.toolActions.at(-1);
  return last ? `${record.decision.objective} → ${last.name}` : record.decision.objective;
}
