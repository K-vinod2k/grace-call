/**
 * Quick CLI to fire a trigger-call request against the running GraceCall server.
 * Usage: npm run trigger:demo [rentalId]
 *   rentalId defaults to RNT-1001 (recover path — next booking in <4h at SFO)
 *   Use RNT-1002 for the extend path (Austin, low demand, no upcoming booking)
 */
import "dotenv/config";

const rentalId = process.argv[2] ?? "RNT-1001";
const base = (process.env.CALLBACK_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const key = process.env.TRIGGER_API_KEY ?? "";

if (!key) {
  console.error("TRIGGER_API_KEY is not set in .env — copy .env.example to .env and fill it in.");
  process.exit(1);
}

console.log(`Triggering call for ${rentalId} → ${base}/trigger-call`);

const res = await fetch(`${base}/trigger-call`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-GraceCall-Key": key,
  },
  body: JSON.stringify({ rentalId }),
});

const data: unknown = await res.json();
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(data, null, 2));

if (!res.ok) process.exit(1);
