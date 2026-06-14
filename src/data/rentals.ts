/**
 * Rental data layer.
 *
 * Three modes (evaluated in priority order):
 *  1. Azure Table Storage (AZURE_TABLES_CONNECTION_STRING set): all reads/writes go to
 *     Azure Table Storage via tableStore.ts.  ← NEW, preferred for hackathon demo.
 *  2. SharePoint mode (GRAPH_TENANT_ID + SHAREPOINT_SITE_ID set): delegates to
 *     sharepointStore.ts which calls the Microsoft Graph API.  ← kept for tenants with SP.
 *  3. Demo / local (default): in-memory Map seeded with two sample rentals. No database needed.
 *
 * All exported CRUD functions return Promise<…> so the same callers work in all three modes.
 * The shape mirrors what the agent reasons over.
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
  /** ISO — return time the customer committed to during the first call. */
  promisedReturnAt?: string;
  /** ISO — when the vehicle was actually returned (set by staff / dashboard toggle). */
  returnedAt?: string;
  /** true after the re-check fires and the vehicle still isn't back — second call triggered. */
  isEscalated?: boolean;
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

// ---- Mode detection ----

export type StoreMode = "azure-tables" | "sharepoint" | "in-memory";

function detectMode(): StoreMode {
  if (process.env["AZURE_TABLES_CONNECTION_STRING"]) return "azure-tables";
  if (process.env["GRAPH_TENANT_ID"] && process.env["SHAREPOINT_SITE_ID"]) return "sharepoint";
  return "in-memory";
}

/** True when SHAREPOINT_SITE_ID is set (legacy helper kept for backward compat). */
export function isSharePointMode(): boolean {
  return detectMode() === "sharepoint";
}

/** True when AZURE_TABLES_CONNECTION_STRING is set. */
export function isTableStorageMode(): boolean {
  return detectMode() === "azure-tables";
}

// Log active mode exactly once at startup.
const _mode = detectMode();
console.log(`[rentals] Mode: ${_mode === "azure-tables" ? "Azure Table Storage" : _mode === "sharepoint" ? "SharePoint (Graph API)" : "In-Memory Demo"}`);

// Dates are relative to server start so the demo always shows live overage (never goes stale).
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

// --- Seed records for the demo (in-memory mode only). ---
// DEMO SETUP: Replace +15551234567 below (appears TWICE — one per rental) with your real test phone
// number before the demo. Both rentals call the same number by default for ease of testing.
const store = new Map<string, RentalRecord>([
  [
    "RNT-1001",
    {
      rentalId: "RNT-1001",
      customer: { name: "Alex Rivera", phoneE164: "+19299337827", tier: "gold", doNotCall: false, callAttempts: 0 },
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
      customer: { name: "Jordan Lee", phoneE164: "+19299337827", tier: "standard", doNotCall: false, callAttempts: 0 },
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

// ---- CRUD ----

export async function getRental(rentalId: string): Promise<RentalRecord | undefined> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { getRental: tGet } = await import("./tableStore.js");
    return tGet(rentalId);
  }
  if (mode === "sharepoint") {
    const { getRental: spGet } = await import("./sharepointStore.js");
    return spGet(rentalId);
  }
  return store.get(rentalId);
}

export async function listAllRentals(): Promise<RentalRecord[]> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { listAllRentals: tList } = await import("./tableStore.js");
    return tList();
  }
  if (mode === "sharepoint") {
    const { listAllRentals: spList } = await import("./sharepointStore.js");
    return spList();
  }
  return [...store.values()];
}

export async function listOverdueRentals(now: Date): Promise<RentalRecord[]> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { listOverdueRentals: tOverdue } = await import("./tableStore.js");
    return tOverdue(now);
  }
  if (mode === "sharepoint") {
    const { listOverdueRentals: spOverdue } = await import("./sharepointStore.js");
    return spOverdue(now);
  }
  return [...store.values()].filter((r) => minutesOverdue(r, now) > r.graceMinutes);
}

/** Rentals where the promised return time has passed but the vehicle hasn't come back yet. */
export async function listPendingReChecks(now: Date): Promise<RentalRecord[]> {
  // Always reads from the active store so re-check state survives restarts in persistent modes.
  const all = await listAllRentals();
  return all.filter(
    (r) =>
      r.promisedReturnAt &&
      new Date(r.promisedReturnAt) <= now &&
      !r.returnedAt &&
      !r.isEscalated,
  );
}

/** Apply a mutation from a tool (extend / charge / etc.). Returns the updated record. */
export async function updateRental(rentalId: string, patch: Partial<RentalRecord>): Promise<RentalRecord | undefined> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { updateRental: tUpdate } = await import("./tableStore.js");
    return tUpdate(rentalId, patch);
  }
  if (mode === "sharepoint") {
    const { updateRental: spUpdate } = await import("./sharepointStore.js");
    return spUpdate(rentalId, patch);
  }
  const current = store.get(rentalId);
  if (!current) return undefined;
  const next = { ...current, ...patch } as RentalRecord;
  store.set(rentalId, next);
  return next;
}

export async function setPromisedReturn(rentalId: string, isoTime: string): Promise<RentalRecord | undefined> {
  return updateRental(rentalId, { promisedReturnAt: isoTime });
}

export async function markReturned(rentalId: string): Promise<RentalRecord | undefined> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { markReturned: tReturn } = await import("./tableStore.js");
    return tReturn(rentalId);
  }
  if (mode === "sharepoint") {
    const { markReturned: spReturn } = await import("./sharepointStore.js");
    return spReturn(rentalId);
  }
  const r = store.get(rentalId);
  if (!r) return undefined;
  const returnedAt = r.returnedAt ? undefined : new Date().toISOString();
  return updateRental(rentalId, { returnedAt });
}

export async function markEscalated(rentalId: string): Promise<RentalRecord | undefined> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { markEscalated: tEscalate } = await import("./tableStore.js");
    return tEscalate(rentalId);
  }
  if (mode === "sharepoint") {
    const { markEscalated: spEscalate } = await import("./sharepointStore.js");
    return spEscalate(rentalId);
  }
  return updateRental(rentalId, { isEscalated: true });
}

export async function writeRemarks(rentalId: string, summary: string): Promise<void> {
  const mode = detectMode();
  if (mode === "azure-tables") {
    const { writeRemarks: tRemarks } = await import("./tableStore.js");
    return tRemarks(rentalId, summary);
  }
  if (mode === "sharepoint") {
    const { writeRemarks: spRemarks } = await import("./sharepointStore.js");
    return spRemarks(rentalId, summary);
  }
  // In-memory: just log — demo mode doesn't persist remarks
  console.log(`[rentals:in-memory] writeRemarks(${rentalId}): ${summary}`);
}
