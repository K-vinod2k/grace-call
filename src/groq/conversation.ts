/**
 * Groq-based realtime conversation loop (free tier alternative to Azure OpenAI Realtime).
 *
 * Pipeline per turn:
 *   ACS audio chunks → VAD buffer → Groq Whisper (STT) → Groq LLaMA (LLM) → ACS playToAll (TTS)
 *
 * Audio format: 24kHz / 16-bit / mono PCM (matches ACS pcm24KMono — no resampling needed).
 * Latency per turn: ~1-2 seconds (STT + LLM + ACS TTS queuing).
 */
import Groq from "groq-sdk";
import { config } from "../config.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";
import { type RentalRecord } from "../data/rentals.js";
import { type Decision } from "../agent/policy.js";
import { playText } from "../acs/callClient.js";

const SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;

// VAD: flush when 700ms of silence follows at least 800ms of speech.
// MIN_SPEECH_BYTES raised from 300ms → 800ms: short filler words ("alright", "okay", "so")
// no longer trigger a full LLM turn and cause Vera to repeat the same question.
const SILENCE_THRESHOLD_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 0.7; // 33600
const MIN_SPEECH_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 0.8;        // 38400
const MAX_BUFFER_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 15;         // 15s hard cap
const RMS_SILENCE = 300; // RMS below this = silence frame

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ConversationHooks {
  onTranscript?: (role: "agent" | "customer", text: string) => void;
  onError?: (err: Error) => void;
}

export class GroqConversation {
  private readonly groq: Groq;
  private readonly history: ChatMessage[] = [];
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  private silentBytes = 0;
  private processing = false;
  private opened = false;
  private muted = false;
  private pendingHangup = false;

  constructor(
    rental: RentalRecord,
    decision: Decision,
    private readonly getCallConnectionId: () => string,
    private readonly hooks: ConversationHooks = {},
    private readonly onBeforePlay?: () => void,
  ) {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
    this.history.push({ role: "system", content: buildSystemPrompt(rental, decision, new Date()) });
  }

  /** Call once after ACS confirms the call connected — plays the AI opening greeting. */
  async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    const reply = await this.llmChat(
      "[The call just connected. Follow the conversation steps EXACTLY. Say only steps 1 and 2, then immediately ask step 3. No extra sentences, no offers to help, no 'I'm here for you' — just the greeting and the question. Maximum 3 sentences total.]",
    );
    if (reply) {
      console.log(`\n[VERA]   ${reply}`);
      this.hooks.onTranscript?.("agent", reply);
      this.mute();
      this.onBeforePlay?.();
      await playText(this.getCallConnectionId(), reply).catch((e: Error) => {
        console.error("[GroqConversation] playText error:", e.message);
        this.unmute(); // unmute immediately if playText itself fails
      });
    }
  }

  /** Mute audio input while ACS TTS is playing — prevents the AI from hearing its own voice. */
  mute(): void { this.muted = true; this.chunks = []; this.totalBytes = 0; this.silentBytes = 0; }
  unmute(): void {
    if (this.pendingHangup) {
      // Farewell was spoken — now hang up instead of waiting for more input.
      void import("../acs/callClient.js").then(({ hangUpCall }) =>
        hangUpCall(this.getCallConnectionId()).catch(() => undefined),
      );
      return;
    }
    // Brief delay so the caller's first words after TTS ends aren't clipped.
    setTimeout(() => { this.muted = false; }, 300);
  }

  /** Feed a base64 PCM chunk from ACS. VAD decides when to flush and process. */
  pushChunk(base64Pcm: string): void {
    if (this.processing || this.muted) return;
    const chunk = Buffer.from(base64Pcm, "base64");
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;

    if (rmsOf(chunk) < RMS_SILENCE) {
      this.silentBytes += chunk.length;
    } else {
      this.silentBytes = 0;
    }

    if (
      (this.silentBytes >= SILENCE_THRESHOLD_BYTES && this.totalBytes >= MIN_SPEECH_BYTES) ||
      this.totalBytes >= MAX_BUFFER_BYTES
    ) {
      void this.runTurn();
    }
  }

  close(): void {
    this.chunks = [];
    this.totalBytes = 0;
    this.silentBytes = 0;
  }

  private async runTurn(): Promise<void> {
    if (this.processing || this.totalBytes === 0) return;
    this.processing = true;

    const pcm = Buffer.concat(this.chunks);
    this.chunks = [];
    this.totalBytes = 0;
    this.silentBytes = 0;

    try {
      const transcript = await this.transcribe(pcm);
      if (!transcript.trim()) return;
      console.log(`\n[CALLER] ${transcript}`);
      this.hooks.onTranscript?.("customer", transcript);

      const reply = await this.llmChat(transcript);
      if (!reply) return;
      console.log(`[VERA]   ${reply}`);
      this.hooks.onTranscript?.("agent", reply);
      if (isFarewell(reply)) this.pendingHangup = true;
      this.mute();
      this.onBeforePlay?.();
      await playText(this.getCallConnectionId(), reply).catch((e: Error) => {
        console.error("[GroqConversation] playText error:", e.message);
        this.unmute();
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[GroqConversation] turn error:", e.message);
      this.hooks.onError?.(e);
    } finally {
      this.processing = false;
    }
  }

  private async transcribe(pcm: Buffer): Promise<string> {
    const wav = buildWav(pcm);
    const file = new File([wav], "audio.wav", { type: "audio/wav" });
    const result = await this.groq.audio.transcriptions.create({
      model: "whisper-large-v3",
      file,
      language: "en",
    });
    return result.text ?? "";
  }

  private async llmChat(userText: string): Promise<string> {
    this.history.push({ role: "user", content: userText });
    const completion = await this.groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: this.history,
      temperature: 0.7,
      max_tokens: 80,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (text) this.history.push({ role: "assistant", content: text });
    return text;
  }
}

function buildWav(pcm: Buffer): Buffer {
  const hdr = Buffer.allocUnsafe(44);
  hdr.write("RIFF", 0, "ascii");
  hdr.writeUInt32LE(36 + pcm.length, 4);
  hdr.write("WAVE", 8, "ascii");
  hdr.write("fmt ", 12, "ascii");
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);                                  // PCM
  hdr.writeUInt16LE(1, 22);                                  // mono
  hdr.writeUInt32LE(SAMPLE_RATE, 24);
  hdr.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);    // byte rate
  hdr.writeUInt16LE(BYTES_PER_SAMPLE, 32);                   // block align
  hdr.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);              // bits per sample
  hdr.write("data", 36, "ascii");
  hdr.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([hdr, pcm]);
}

const FAREWELL_PATTERNS = /\b(goodbye|good-bye|have a great day|take care|thank you for your time|end of call|farewell|talk to you soon|bye)\b/i;

function isFarewell(text: string): boolean {
  return FAREWELL_PATTERNS.test(text);
}

function rmsOf(buf: Buffer): number {
  const n = Math.floor(buf.length / 2);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2);
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}
