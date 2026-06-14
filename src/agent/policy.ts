/**
 * GraceCall decision policy — the agent's reasoning core.
 *
 * Given a rental record and the current time, decide the call OBJECTIVE and the hard
 * constraints the agent must stay within. The voice model conducts the conversation, but
 * it may only act within the bounds this function returns. This is where "multi-step
 * reasoning" lives, and it is also a responsible-AI guardrail: the model cannot invent
 * discounts, over-charge, or extend beyond what policy allows.
 *
 * In production the thresholds and policy text come from Foundry IQ (the overage policy +
 * the customer's specific agreement). Here they are explicit so the logic is auditable.
 */

import {
  type RentalRecord,
  hoursUntilNextBooking,
  minutesOverdue,
} from "../data/rentals.js";

export type Objective = "recover" | "extend" | "charge" | "escalate";

export interface Decision {
  objective: Objective;
  /** Human-readable chain of reasoning — logged and shown in the demo dashboard. */
  rationale: string;
  constraints: {
    /** Max hours the agent may auto-extend without human approval. */
    maxAutoExtensionHours: number;
    /** Max overage the agent may auto-charge; above this, send a secure pay link / escalate. */
    maxAutoChargeUSD: number;
    /** Goodwill grace the agent may waive (minutes), by tier. */
    goodwillWaiveMinutes: number;
    /** If true, the agent must push for immediate return (a booking/demand needs the car). */
    mustRecoverVehicle: boolean;
  };
  /** Overage owed right now, per the rate card (hours over grace × hourly rate). */
  overageOwedUSD: number;
}

export const MAX_CALL_ATTEMPTS = 3;

const GOODWILL_BY_TIER: Record<RentalRecord["customer"]["tier"], number> = {
  standard: 0,
  gold: 30,
  platinum: 60,
};

/** Hours-until-next-booking under which we must get the car back rather than extend. */
const RECOVER_WINDOW_HOURS = 6;

export function computeOverageOwed(r: RentalRecord, now: Date): number {
  const overMin = minutesOverdue(r, now);
  const billableMin = Math.max(0, overMin - r.graceMinutes);
  return Math.round((billableMin / 60) * r.overageHourlyRate * 100) / 100;
}

export function decideObjective(r: RentalRecord, now: Date): Decision {
  const overMin = minutesOverdue(r, now);
  const nextBookingHrs = hoursUntilNextBooking(r, now);
  const overageOwedUSD = computeOverageOwed(r, now);
  const goodwillWaiveMinutes = GOODWILL_BY_TIER[r.customer.tier];

  const constraints: Decision["constraints"] = {
    maxAutoExtensionHours: 24,
    maxAutoChargeUSD: 150,
    goodwillWaiveMinutes,
    mustRecoverVehicle: false,
  };

  // 1. Do-not-call / attempt cap → never reach the customer; hand to a human.
  if (r.customer.doNotCall) {
    return {
      objective: "escalate",
      rationale: `Customer ${r.customer.name} is on the do-not-call list. No outbound call permitted; route to a human via email/portal.`,
      constraints,
      overageOwedUSD,
    };
  }
  if (r.customer.callAttempts >= MAX_CALL_ATTEMPTS) {
    return {
      objective: "escalate",
      rationale: `Reached ${r.customer.callAttempts}/${MAX_CALL_ATTEMPTS} call attempts with no resolution. Stop auto-dialing; escalate to a human agent.`,
      constraints,
      overageOwedUSD,
    };
  }

  // 2. The vehicle is needed soon (next booking close, or high-demand location) → RECOVER.
  if (nextBookingHrs <= RECOVER_WINDOW_HOURS || r.location.demandLevel === "high") {
    constraints.mustRecoverVehicle = true;
    return {
      objective: "recover",
      rationale:
        `Vehicle (${r.vehicle.class}, ${r.vehicle.plate}) is needed soon — ` +
        (Number.isFinite(nextBookingHrs)
          ? `next booking in ${nextBookingHrs.toFixed(1)}h`
          : `high demand at ${r.location.name}`) +
        `. Goal: secure a firm return time ASAP. Do NOT offer an extension. May waive up to ` +
        `${goodwillWaiveMinutes} min goodwill for a ${r.customer.tier} customer if it speeds return.`,
      constraints,
      overageOwedUSD,
    };
  }

  // 3. Vehicle is free and demand is calm → EXTEND if the customer wants more time, else remind+charge.
  if (nextBookingHrs > constraints.maxAutoExtensionHours) {
    return {
      objective: "extend",
      rationale:
        `No upcoming booking for ${r.vehicle.plate} and ${r.location.demandLevel} demand at ` +
        `${r.location.name}. If the customer wants more time, offer an extension up to ` +
        `${constraints.maxAutoExtensionHours}h at the daily rate ($${r.dailyRate}/day). ` +
        `Otherwise remind and settle the $${overageOwedUSD} overage. ${overMin} min overdue.`,
      constraints,
      overageOwedUSD,
    };
  }

  // 4. Default: a modest overage with no recovery pressure → remind and CHARGE per the rate card.
  return {
    objective: "charge",
    rationale:
      `${overMin} min overdue, $${overageOwedUSD} owed at $${r.overageHourlyRate}/h after ` +
      `${r.graceMinutes} min grace. Remind the customer and settle the overage. Auto-charge only up ` +
      `to $${constraints.maxAutoChargeUSD}${r.paymentMethodOnFile ? " on the card on file" : "; no card on file → send a secure pay link"}.`,
    constraints,
    overageOwedUSD,
  };
}
