/**
 * Mock rental store. In production this is Dataverse / Cosmos DB, and the records are
 * retrieved (permission-trimmed) via Foundry IQ. For the demo we keep it in-memory so the
 * whole flow runs without a database. The shape mirrors what the agent reasons over.
 */

export type CustomerTier = "standard" | "gold" | "platinum";
export type VehicleClass = "economy" | "suv" | "luxury";
export type DemandLevel = "low" | "normal" | "high";

export interface RentalRecord {
  rentalId: string;
  customer: {
    name: string;
    phoneE164: string;
    tier: CustomerTier;
    /** Honored absolutely — the agent must never call this customer. */
    doNotCall: boolean;
    /** How many outbound attempts already made on this overage. Caps at MAX_CALL_ATTEMPTS. */
    callAttempts: number;
  };
  vehicle: {
    class: VehicleClass;
    plate: string;
  };
  returnDueAt: string; // ISO 8601
  dailyRate: number; // USD
  overageHourlyRate: number; // USD per hour over the grace window
  graceMinutes: number; // free grace before overage applies
  /** The next reservation for THIS vehicle, if any. Drives the "recover" decision. */
  nextBookingStartsAt: string | null;
  location: { name: string; demandLevel: DemandLevel };
  paymentMethodOnFile: boolean;
}

/** Minutes the return is past due, relative to `now`. */
export function minutesOverdue(r: RentalRecord, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(r.returnDueAt).getTime()) / 60000));
}

/** Hours until the vehicle's next reservation, or Infinity if none. */
export function hoursUntilNextBooking(r: RentalRecord, now: Date): number {
  if (!r.nextBookingStartsAt) return Infinity;
  return (new Date(r.nextBookingStartsAt).getTime() - now.getTime()) / 3_600_000;
}

// Dates are relative to server start so the demo always shows live overage (never goes stale).
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

// --- Seed records for the demo. ---
// DEMO SETUP: Replace +15551234567 below (appears TWICE — one per rental) with your real test phone
// number before the demo. Both rentals call the same number by default for ease of testing.
const store = new Map<string, RentalRecord>([
  [
    "RNT-1001",
    {
      rentalId: "RNT-1001",
      customer: { name: "Alex Rivera", phoneE164: "+15551234567", tier: "gold", doNotCall: false, callAttempts: 0 },
      vehicle: { class: "suv", plate: "DEMO-101" },
      returnDueAt: hoursFromNow(-1.5),        // 90 min overdue when the server starts
      dailyRate: 89,
      overageHourlyRate: 18,
      graceMinutes: 30,
      // Another customer is booked on this SUV soon → bias toward RECOVER.
      nextBookingStartsAt: hoursFromNow(2.5), // next booking ~2.5h from now → inside recover window
      location: { name: "SFO Airport", demandLevel: "high" },
      paymentMethodOnFile: true,
    },
  ],
  [
    "RNT-1002",
    {
      rentalId: "RNT-1002",
      customer: { name: "Jordan Lee", phoneE164: "+15551234567", tier: "standard", doNotCall: false, callAttempts: 0 },
      vehicle: { class: "economy", plate: "DEMO-102" },
      returnDueAt: hoursFromNow(-1.2),        // 72 min overdue
      dailyRate: 45,
      overageHourlyRate: 9,
      graceMinutes: 30,
      // No upcoming booking, low demand → EXTEND is fine if the customer wants more time.
      nextBookingStartsAt: null,
      location: { name: "Austin Downtown", demandLevel: "low" },
      paymentMethodOnFile: true,
    },
  ],
]);

export function getRental(rentalId: string): RentalRecord | undefined {
  return store.get(rentalId);
}

export function listOverdueRentals(now: Date): RentalRecord[] {
  return [...store.values()].filter((r) => minutesOverdue(r, now) > r.graceMinutes);
}

/** Apply a mutation from a tool (extend / charge / etc.). Returns the updated record. */
export function updateRental(rentalId: string, patch: Partial<RentalRecord>): RentalRecord | undefined {
  const current = store.get(rentalId);
  if (!current) return undefined;
  const next = { ...current, ...patch } as RentalRecord;
  store.set(rentalId, next);
  return next;
}
