import { test } from "node:test";
import assert from "node:assert/strict";
import { decideObjective, MAX_CALL_ATTEMPTS } from "../policy.js";
import type { RentalRecord } from "../../data/rentals.js";

const NOW = new Date("2026-01-01T10:00:00Z");

function makeRental(overrides: Partial<RentalRecord> = {}): RentalRecord {
  return {
    rentalId: "TEST-001",
    customer: { name: "Test User", phoneE164: "+10000000000", tier: "standard", doNotCall: false, callAttempts: 0 },
    vehicle: { class: "economy", plate: "TEST-01" },
    returnDueAt: new Date(NOW.getTime() - 90 * 60_000).toISOString(), // 90 min overdue
    dailyRate: 50,
    overageHourlyRate: 10,
    graceMinutes: 30,
    nextBookingStartsAt: null,
    location: { name: "Test City", demandLevel: "low" },
    paymentMethodOnFile: true,
    ...overrides,
  };
}

// RNT-1001 scenario: next booking in 2.5h at high demand → RECOVER
test("recover: next booking within 6h window", () => {
  const r = makeRental({
    nextBookingStartsAt: new Date(NOW.getTime() + 2.5 * 3_600_000).toISOString(),
    location: { name: "SFO Airport", demandLevel: "high" },
  });
  const d = decideObjective(r, NOW);
  assert.equal(d.objective, "recover");
  assert.ok(d.constraints.mustRecoverVehicle, "mustRecoverVehicle should be true");
});

// RNT-1002 scenario: no upcoming booking, low demand → EXTEND
test("extend: no upcoming booking, low demand", () => {
  const r = makeRental({ nextBookingStartsAt: null, location: { name: "Austin", demandLevel: "low" } });
  const d = decideObjective(r, NOW);
  assert.equal(d.objective, "extend");
  assert.ok(!d.constraints.mustRecoverVehicle);
});

// Responsible AI: do-not-call → ESCALATE immediately
test("escalate: doNotCall customer", () => {
  const r = makeRental({
    customer: { name: "DNC User", phoneE164: "+1", tier: "standard", doNotCall: true, callAttempts: 0 },
  });
  const d = decideObjective(r, NOW);
  assert.equal(d.objective, "escalate");
  assert.match(d.rationale, /do-not-call/i);
});

// Responsible AI: attempt cap → ESCALATE
test("escalate: callAttempts at cap", () => {
  const r = makeRental({
    customer: { name: "Capped User", phoneE164: "+1", tier: "standard", doNotCall: false, callAttempts: MAX_CALL_ATTEMPTS },
  });
  const d = decideObjective(r, NOW);
  assert.equal(d.objective, "escalate");
});

// 6–24h dead zone: booking exists but outside recovery + extension windows → CHARGE
// Rationale must NOT falsely claim "no upcoming booking".
test("charge: 6-24h dead zone — rationale does not say 'no upcoming booking'", () => {
  const r = makeRental({
    nextBookingStartsAt: new Date(NOW.getTime() + 12 * 3_600_000).toISOString(),
    location: { name: "Dallas", demandLevel: "normal" },
  });
  const d = decideObjective(r, NOW);
  assert.equal(d.objective, "charge");
  assert.ok(
    !d.rationale.toLowerCase().includes("no upcoming booking"),
    `Rationale incorrectly says 'no upcoming booking' when booking is in 12h: "${d.rationale}"`,
  );
});
