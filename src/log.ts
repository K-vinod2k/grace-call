/**
 * In-memory call log for the demo + dashboard. In production this is Dataverse (so outcomes are
 * queryable from M365 Copilot) plus App Insights traces. The shape is what the demo dashboard reads.
 */
import { type Decision } from "./agent/policy.js";

export interface CallRecord {
  rentalId: string;
  decision: Decision;
  placed: boolean;
  callConnectionId?: string;
  startedAt: string;
  events: string[];
  transcript: { role: "agent" | "customer"; text: string; at: string }[];
  toolActions: { name: string; detail?: Record<string, unknown>; at: string }[];
  outcome?: string;
}

const calls: CallRecord[] = [];

export function recordCall(init: Omit<CallRecord, "events" | "transcript" | "toolActions">): CallRecord {
  const rec: CallRecord = { events: [], transcript: [], toolActions: [], ...init };
  calls.unshift(rec);
  return rec;
}

function find(rentalId: string): CallRecord | undefined {
  return calls.find((c) => c.rentalId === rentalId);
}

export function appendEvent(rentalId: string, type: string): void {
  find(rentalId)?.events.push(type);
}

export function appendTranscript(rentalId: string, role: "agent" | "customer", text: string): void {
  find(rentalId)?.transcript.push({ role, text, at: new Date().toISOString() });
}

export function appendToolAction(rentalId: string, name: string, detail?: Record<string, unknown>): void {
  find(rentalId)?.toolActions.push({ name, detail, at: new Date().toISOString() });
}

export function recentCalls(limit = 20): CallRecord[] {
  return calls.slice(0, limit);
}
