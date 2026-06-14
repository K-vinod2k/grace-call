/**
 * Azure Communication Services — Call Automation wrapper.
 *
 * NOTE: the @azure/communication-call-automation API surface moves between versions. This is the
 * 1.4.x shape; if `npm install` pulls a different major, check the README link and adjust the
 * call sites (the concepts — CreateCall, callbackUri, media streaming, Play — are stable).
 */
import {
  CallAutomationClient,
  type CallInvite,
  type CreateCallResult,
} from "@azure/communication-call-automation";
import { config } from "../config.js";

let client: CallAutomationClient | null = null;
function getClient(): CallAutomationClient {
  client ??= new CallAutomationClient(config.acs.connectionString);
  return client;
}

/**
 * Place an outbound PSTN call. ACS will POST lifecycle events (CallConnected, etc.) to
 * `${CALLBACK_BASE_URL}/acs/callbacks?rentalId=...` so we can correlate the call to the rental.
 */
/** ACS opens its bidirectional media socket here. Derive wss:// from the https callback base. */
function mediaWebSocketUrl(rentalId: string): string {
  const wssBase = config.callbackBaseUrl.replace(/^https:\/\//i, "wss://");
  return `${wssBase}/acs/media?rentalId=${encodeURIComponent(rentalId)}`;
}

export async function placeOutboundCall(toE164: string, rentalId: string): Promise<CreateCallResult> {
  const callInvite: CallInvite = {
    targetParticipant: { phoneNumber: toE164 },
    sourceCallIdNumber: { phoneNumber: config.acs.callerId },
  };
  const callbackUri = `${config.callbackBaseUrl}/acs/callbacks?rentalId=${encodeURIComponent(rentalId)}`;

  // Day-0 mode (ENABLE_MEDIA_STREAMING=0): just ring + play a TTS disclosure on CallConnected.
  if (!config.enableMediaStreaming) {
    return getClient().createCall(callInvite, callbackUri);
  }

  // Full mode: ACS streams 24kHz PCM both ways to /acs/media; Voice Live runs the conversation.
  // audioFormat pcm24KMono matches Azure Voice Live exactly — no resampling needed.
  return getClient().createCall(callInvite, callbackUri, {
    mediaStreamingOptions: {
      transportType: "websocket",
      transportUrl: mediaWebSocketUrl(rentalId),
      audioChannelType: "mixed",
      contentType: "audio",
      startMediaStreaming: true,
      enableBidirectional: true,
      audioFormat: "pcm24KMono",
    },
  });
}

/**
 * Play a TTS prompt into a connected call (used for the Day-0 milestone and for the recorded
 * disclosure line before handing audio to Voice Live).
 */
export async function playText(callConnectionId: string, text: string): Promise<void> {
  const callMedia = getClient().getCallConnection(callConnectionId).getCallMedia();
  await callMedia.playToAll([
    {
      kind: "textSource",
      text,
      voiceName: config.voiceLive.voice,
    } as never, // TextSource shape varies by SDK minor; see README note.
  ]);
}

export function getCallMedia(callConnectionId: string) {
  return getClient().getCallConnection(callConnectionId).getCallMedia();
}

export async function hangUpCall(callConnectionId: string): Promise<void> {
  await getClient().getCallConnection(callConnectionId).hangUp(true);
}
