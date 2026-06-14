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
import { decideObjective } from "../agent/policy.js";
import { getRental } from "../data/rentals.js";
import { type CallRecord, appendTranscript, appendToolAction } from "../log.js";
import { getCallMedia, hangUpCall } from "./callClient.js";

const WS_OPEN = 1;

export function attachMediaBridge(wss: WebSocketServer, inFlight: Map<string, CallRecord>): void {
  wss.on("connection", (acsSocket: WebSocket, req) => {
    // ACS connects to /acs/media?rentalId=...  (set as transportUrl in the media-streaming options).
    const rentalId = new URL(req.url ?? "", "http://x").searchParams.get("rentalId") ?? "";
    const rental = getRental(rentalId);
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

    acsSocket.on("close", () => {
      record.outcome = summarize(record);
      session.close();
      inFlight.delete(rentalId);
    });
  });
}

function summarize(record: CallRecord): string {
  const last = record.toolActions.at(-1);
  return last ? `${record.decision.objective} → ${last.name}` : record.decision.objective;
}
