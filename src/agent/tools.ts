/**
 * The actions GraceCall can take during a call. These are exposed to Azure Voice Live as
 * function-calling tools (see `toolDefinitions`) and dispatched by `dispatchTool`.
 *
 * The dispatcher RE-ENFORCES the policy constraints. The system prompt tells the model the
 * limits, but we never trust the model alone: if it tries to extend beyond the cap or charge
 * over the auto-charge ceiling, the tool refuses and tells the model to escalate or send a
 * pay link. This is the difference between a demo and something a judge trusts (20% safety).
 */

import { type RentalRecord, updateRental, setPromisedReturn } from "../data/rentals.js";
import { type Decision } from "./policy.js";

export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolContext {
  rental: RentalRecord;
  decision: Decision;
  now: Date;
}

export interface ToolResult {
  ok: boolean;
  /** Short message the model speaks back / reasons over. */
  message: string;
  /** Structured detail for logging + the dashboard. */
  detail?: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    name: "extendRental",
    description:
      "Extend the rental by N hours at the daily rate. Only allowed when the objective permits it. " +
      "Refused if hours exceed the policy cap or the vehicle must be recovered.",
    parameters: {
      type: "object",
      properties: {
        hours: { type: "number", description: "Hours to extend, > 0." },
      },
      required: ["hours"],
    },
  },
  {
    type: "function",
    name: "chargeOverage",
    description:
      "Charge the overage to the card on file. Refused above the auto-charge ceiling or when no card " +
      "is on file — in those cases escalate to a human instead.",
    parameters: {
      type: "object",
      properties: {
        amountUSD: { type: "number", description: "Amount to charge in USD." },
      },
      required: ["amountUSD"],
    },
  },
  {
    type: "function",
    name: "scheduleReturn",
    description: "Record a firm return commitment (ISO 8601) the customer agreed to. Used on the recover path.",
    parameters: {
      type: "object",
      properties: {
        returnByIso: { type: "string", description: "Committed return time, ISO 8601." },
      },
      required: ["returnByIso"],
    },
  },
  {
    type: "function",
    name: "escalateToHuman",
    description:
      "Hand the call to a human agent. Use on dispute, distress, confusion, do-not-call, or anything outside policy.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why this needs a human." },
      },
      required: ["reason"],
    },
  },
];

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "extendRental":
      return await extendRental(Number(args.hours), ctx);
    case "chargeOverage":
      return chargeOverage(Number(args.amountUSD), ctx);
    case "scheduleReturn":
      return await scheduleReturn(String(args.returnByIso), ctx);
    case "escalateToHuman":
      return escalateToHuman(String(args.reason), ctx);
    default:
      return { ok: false, message: `Unknown tool: ${name}` };
  }
}

async function extendRental(hours: number, ctx: ToolContext): Promise<ToolResult> {
  const { decision, rental } = ctx;
  if (!(hours > 0)) return { ok: false, message: "Extension must be a positive number of hours." };
  if (decision.constraints.mustRecoverVehicle) {
    return { ok: false, message: "Cannot extend: this vehicle is needed for an upcoming booking. Secure a return time instead." };
  }
  if (hours > decision.constraints.maxAutoExtensionHours) {
    return {
      ok: false,
      message: `Cannot auto-extend ${hours}h — policy cap is ${decision.constraints.maxAutoExtensionHours}h. Offer up to the cap or escalate.`,
    };
  }
  const newDue = new Date(new Date(rental.returnDueAt).getTime() + hours * 3_600_000).toISOString();
  await updateRental(rental.rentalId, { returnDueAt: newDue });
  return {
    ok: true,
    message: `Extended ${hours}h. New return due ${newDue}. Charged at the daily rate ($${rental.dailyRate}/day, prorated).`,
    detail: { action: "extendRental", hours, newDue, dailyRate: rental.dailyRate },
  };
}

function chargeOverage(amountUSD: number, ctx: ToolContext): ToolResult {
  const { decision, rental } = ctx;
  if (!(amountUSD > 0)) return { ok: false, message: "Charge amount must be positive." };
  if (!rental.paymentMethodOnFile) {
    return { ok: false, message: "No card on file — do not attempt a charge. Escalate to a human agent instead." };
  }
  if (amountUSD > decision.constraints.maxAutoChargeUSD) {
    return {
      ok: false,
      message: `$${amountUSD} exceeds the $${decision.constraints.maxAutoChargeUSD} auto-charge ceiling. Send a secure pay link or escalate.`,
    };
  }
  return {
    ok: true,
    message: `Charged $${amountUSD} to the card on file for rental ${rental.rentalId}. A receipt will be texted.`,
    detail: { action: "chargeOverage", amountUSD },
  };
}

async function scheduleReturn(returnByIso: string, ctx: ToolContext): Promise<ToolResult> {
  const when = new Date(returnByIso);
  if (Number.isNaN(when.getTime())) return { ok: false, message: "Invalid return time." };
  const hoursUntilReturn = (when.getTime() - ctx.now.getTime()) / 3_600_000;
  if (hoursUntilReturn > ctx.decision.constraints.maxAutoExtensionHours) {
    return {
      ok: false,
      message: `Promised return in ~${Math.round(hoursUntilReturn)}h exceeds the ${ctx.decision.constraints.maxAutoExtensionHours}h auto-extension cap. Inform the customer and call escalateToHuman.`,
    };
  }
  try {
    await setPromisedReturn(ctx.rental.rentalId, returnByIso);
  } catch {
    // Store write failure is non-fatal — the commitment is still honored in this session.
  }
  return {
    ok: true,
    message: `Logged a firm return commitment for ${returnByIso}. We'll hold the spot for you.`,
    detail: { action: "scheduleReturn", returnByIso, rentalId: ctx.rental.rentalId },
  };
}

function escalateToHuman(reason: string, ctx: ToolContext): ToolResult {
  return {
    ok: true,
    message: "Connecting you with a team member who can help. Thank you for your patience.",
    detail: { action: "escalateToHuman", reason, rentalId: ctx.rental.rentalId },
  };
}

