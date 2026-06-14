/**
 * Seed script — inserts the two demo rentals into Azure Table Storage.
 * Usage:  AZURE_TABLES_CONNECTION_STRING="..." node scripts/seed-table.mjs
 *
 * The outTime values are set relative to "now" at run time:
 *   RNT-1001 Alex Rivera — 30 min overdue
 *   RNT-1002 Jordan Lee  — returning in 1 hr (not overdue yet)
 */

import { TableClient } from "@azure/data-tables";

const CONN_STR = process.env.AZURE_TABLES_CONNECTION_STRING;
if (!CONN_STR) {
  console.error("ERROR: AZURE_TABLES_CONNECTION_STRING env var is not set.");
  process.exit(1);
}

const TABLE_NAME = "rentals";
const PARTITION_KEY = "rental";

const client = TableClient.fromConnectionString(CONN_STR, TABLE_NAME);

const now = Date.now();
const hoursFromNow = (h) => new Date(now + h * 3_600_000).toISOString();

const rentals = [
  {
    partitionKey: PARTITION_KEY,
    rowKey: "RNT-1001",
    customerName: "Alex Rivera",
    phoneE164: "+19299337827",
    customerTier: "gold",
    doNotCall: false,
    callAttempts: 0,
    vehicleClass: "suv",
    plate: "DEMO-101",
    returnDueAt: hoursFromNow(-0.5),        // 30 min overdue
    dailyRate: 89,
    overageHourlyRate: 18,
    graceMinutes: 30,
    nextBookingStartsAt: hoursFromNow(2.5), // next booking in 2.5h
    locationName: "SFO Airport",
    demandLevel: "high",
    paymentMethodOnFile: true,
    isEscalated: false,
    remarks: "",
  },
  {
    partitionKey: PARTITION_KEY,
    rowKey: "RNT-1002",
    customerName: "Jordan Lee",
    phoneE164: "+19299337827",
    customerTier: "standard",
    doNotCall: false,
    callAttempts: 0,
    vehicleClass: "economy",
    plate: "DEMO-102",
    returnDueAt: hoursFromNow(1),           // returning in 1 hr (not overdue)
    dailyRate: 45,
    overageHourlyRate: 9,
    graceMinutes: 30,
    nextBookingStartsAt: "",
    locationName: "Austin Downtown",
    demandLevel: "low",
    paymentMethodOnFile: true,
    isEscalated: false,
    remarks: "",
  },
];

console.log(`Seeding ${rentals.length} rentals into table '${TABLE_NAME}'...`);

for (const rental of rentals) {
  try {
    await client.upsertEntity(rental, "Replace");
    console.log(`  ✓ Upserted ${rental.rowKey} (${rental.customerName})`);
  } catch (err) {
    console.error(`  ✗ Failed to upsert ${rental.rowKey}:`, err.message);
    process.exit(1);
  }
}

console.log("\nVerifying seeded rows...");
let count = 0;
for await (const entity of client.listEntities()) {
  console.log(`  - ${entity.rowKey}: ${entity.customerName}, returnDueAt=${entity.returnDueAt}`);
  count++;
}
console.log(`\nDone. ${count} entities found in table.`);
