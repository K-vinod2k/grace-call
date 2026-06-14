/**
 * Azure Voice Live session client.
 *
 * Voice Live speaks the Azure OpenAI Realtime event protocol over a WebSocket: you send
 * `session.update` to configure the model/voice/tools, stream caller audio with
 * `input_audio_buffer.append`, and receive `response.audio.delta` (agent speech) plus
 * `response.function_call_arguments.done` (tool calls). We handle the control plane here —
 * session config + tool dispatch + transcript — and expose hooks for the audio bytes, which
 * the ACS media bridge (src/acs/mediaBridge.ts) pumps in and out.
 *
 * Audio is 24kHz/16-bit/mono PCM end-to-end (ACS streams pcm24KMono, which Voice Live expects),
 * so no resampling is needed. The frame format is handled in src/acs/mediaBridge.ts.
 */
import { WebSocket } from "ws";
import { config } from "../config.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";
import { dispatchTool, toolDefinitions, type ToolContext } from "../agent/tools.js";
import { type RentalRecord } from "../data/rentals.js";
import { type Decision } from "../agent/policy.js";

export interface SessionHooks {
  /** Agent audio chunk (base64 PCM) to play back into the call. */
  onAgentAudio?: (base64Pcm: string) => void;
  /** Transcript line for logging / the dashboard. */
  onTranscript?: (role: "agent" | "customer", text: string) => void;
  /** A tool was executed; surface the structured result. */
  onToolResult?: (name: string, detail: Record<string, unknown> | undefined) => void;
  /** Server VAD detected the caller starting to talk → barge-in (stop the agent's current audio). */
  onUserSpeechStarted?: () => void;
}

export class VoiceLiveSession {
  private ws: WebSocket | null = null;
  private readonly ctx: ToolContext;

  constructor(
    private readonly rental: RentalRecord,
    private readonly decision: Decision,
    private readonly now: Date,
    private readonly hooks: SessionHooks = {},
  ) {
    this.ctx = { rental, decision, now };
  }

  async connect(): Promise<void> {
    const url = `${config.voiceLive.endpoint}/voice-live/realtime?api-version=2026-06-01-preview&model=${config.voiceLive.model}`;
    this.ws = new WebSocket(url, { headers: { "api-key": config.voiceLive.apiKey } });

    await new Promise<void>((resolve, reject) => {
      this.ws!.once("open", resolve);
      this.ws!.once("error", reject);
    });

    this.ws.on("message", (data) => this.onMessage(data.toString()));
    this.configureSession();
  }

  /** Configure model, voice, and tools, then ask the agent to open with the disclosure line. */
  private configureSession(): void {
    this.send({
      type: "session.update",
      session: {
        instructions: buildSystemPrompt(this.rental, this.decision, this.now),
        voice: config.voiceLive.voice,
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        turn_detection: { type: "server_vad" }, // enables barge-in
        tools: toolDefinitions,
      },
    });
    // Kick off the agent's first turn (greeting + AI disclosure).
    this.send({ type: "response.create" });
  }

  /** Caller audio from ACS → Voice Live. */
  appendCallerAudio(base64Pcm: string): void {
    this.send({ type: "input_audio_buffer.append", audio: base64Pcm });
  }

  private onMessage(raw: string): void {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    switch (evt.type) {
      case "response.audio.delta":
        if (typeof evt.delta === "string") this.hooks.onAgentAudio?.(evt.delta);
        break;
      case "response.audio_transcript.done":
        if (typeof evt.transcript === "string") this.hooks.onTranscript?.("agent", evt.transcript);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof evt.transcript === "string") this.hooks.onTranscript?.("customer", evt.transcript);
        break;
      case "input_audio_buffer.speech_started":
        // Caller started talking — interrupt the agent (barge-in).
        this.hooks.onUserSpeechStarted?.();
        break;
      case "response.function_call_arguments.done":
        void this.handleToolCall(evt);
        break;
    }
  }

  private async handleToolCall(evt: Record<string, unknown>): Promise<void> {
    const name = String(evt.name ?? "");
    const callId = String(evt.call_id ?? "");
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(String(evt.arguments ?? "{}"));
    } catch {
      /* leave empty */
    }
    const result = await dispatchTool(name, args, this.ctx);
    this.hooks.onToolResult?.(name, result.detail);

    // Return the tool result to the model and let it speak the follow-up.
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.send({ type: "response.create" });
  }

  private send(obj: unknown): void {
    this.ws?.send(JSON.stringify(obj));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
