/**
 * Generates a 2-sentence call summary for the Remarks column using the Groq LLM.
 * Uses the same Groq client already wired up in config.ts.
 */
import Groq from "groq-sdk";
import { config } from "../config.js";

/**
 * Summarize a completed call transcript into 2 sentences suitable for the Remarks column.
 *
 * @param rentalId - The rental ID (used in fallback text only).
 * @param transcript - Array of turn objects with role ("agent" | "customer") and text.
 * @returns A 2-sentence string summary.
 */
export async function summarizeCall(
  rentalId: string,
  transcript: { role: "agent" | "customer"; text: string }[],
): Promise<string> {
  if (transcript.length === 0) {
    return `Call placed for rental ${rentalId}. No transcript recorded.`;
  }

  const formattedTranscript = transcript
    .map((t) => `${t.role === "agent" ? "Vera" : "Customer"}: ${t.text}`)
    .join("\n");

  const groq = new Groq({ apiKey: config.groq.apiKey });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You are a rental fleet manager's assistant. Summarize this call in exactly 2 sentences for the remarks column. Be factual and concise.",
      },
      {
        role: "user",
        content: formattedTranscript,
      },
    ],
    temperature: 0.3,
    max_tokens: 120,
  });

  return (
    completion.choices[0]?.message?.content?.trim() ??
    `Call completed for rental ${rentalId}.`
  );
}
