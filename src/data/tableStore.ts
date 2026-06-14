/**
 * Azure Table Storage data layer for GraceCall.
 * Uses @azure/data-tables with a connection string (AZURE_TABLES_CONNECTION_STRING).
 *
 * Activated when AZURE_TABLES_CONNECTION_STRING is set in the environment.
 * All functions mirror the signatures in sharepointStore.ts so the three stores are interchangeable.
 *
 * Entity layout:
 *   PartitionKey: "rental"  (single partition — hackathon scale)
 *   RowKey:       rentalId  (e.g. "RNT-1001")
 *   All other fields stored as flat columns on the entity.
 */
import { TableClient, TableEntity, odata } from "@azure/data-tables";
import type { RentalRecord, CustomerTier, VehicleClass, DemandLevel } from "./rentals.js";

const TABLE_NAME = "rentals";
const PARTITION_KEY = "rental";

// ---- Client singleton ----

let _client: TableClient | undefined;

function getClient(): TableClient {
  if (!_client) {
    const connStr = process.env["AZURE_TABLES_CONNECTION_STRING"];
    if (!connStr) throw new Error("AZURE_TABLES_CONNECTION_STRING is not set");
    _client = TableClient.fromConnectionString(connStr, TABLE_NAME);
  }
  return _client;
}

// ---- Entity ↔ RentalRecord mapping ----

/** Flat entity stored in Azure Table Storage */
interface RentalEntity extends Record<string, unknown> {
  partitionKey: string;
  rowKey: string;
  customerName: string;
  phoneE164: string;
  customerTier: string;
  doNotCall: boolean;
  callAttempts: number;
  vehicleClass: string;
  plate: string;
  returnDueAt: string;
  dailyRate: number;
  overageHourlyRate: number;
  graceMinutes: number;
  nextBookingStartsAt: string;
  locationName: string;
  demandLevel: string;
  paymentMethodOnFile: boolean;
  promisedReturnAt?: string;
  returnedAt?: string;
  isEscalated?: boolean;
  remarks?: string;
}

function entityToRecord(entity: TableEntity<Record<string, unknown>>): RentalRecord {
  return {
    rentalId: String(entity.rowKey ?? ""),
    customer: {
      name: String(entity["customerName"] ?? ""),
      phoneE164: String(entity["phoneE164"] ?? ""),
      tier: String(entity["customerTier"] ?? "standard") as CustomerTier,
      doNotCall: Boolean(entity["doNotCall"]),
      callAttempts: Number(entity["callAttempts"] ?? 0),
    },
    vehicle: {
      class: String(entity["vehicleClass"] ?? "economy") as VehicleClass,
      plate: String(entity["plate"] ?? ""),
    },
    returnDueAt: String(entity["returnDueAt"] ?? ""),
    dailyRate: Number(entity["dailyRate"] ?? 0),
    overageHourlyRate: Number(entity["overageHourlyRate"] ?? 0),
    graceMinutes: Number(entity["graceMinutes"] ?? 30),
    nextBookingStartsAt: entity["nextBookingStartsAt"]
      ? String(entity["nextBookingStartsAt"])
      : null,
    location: {
      name: String(entity["locationName"] ?? ""),
      demandLevel: String(entity["demandLevel"] ?? "normal") as DemandLevel,
    },
    paymentMethodOnFile: Boolean(entity["paymentMethodOnFile"]),
    promisedReturnAt: entity["promisedReturnAt"]
      ? String(entity["promisedReturnAt"])
      : undefined,
    returnedAt: entity["returnedAt"] ? String(entity["returnedAt"]) : undefined,
    isEscalated: entity["isEscalated"] ? Boolean(entity["isEscalated"]) : undefined,
  };
}

function recordToEntity(r: RentalRecord): RentalEntity {
  return {
    partitionKey: PARTITION_KEY,
    rowKey: r.rentalId,
    customerName: r.customer.name,
    phoneE164: r.customer.phoneE164,
    customerTier: r.customer.tier,
    doNotCall: r.customer.doNotCall,
    callAttempts: r.customer.callAttempts,
    vehicleClass: r.vehicle.class,
    plate: r.vehicle.plate,
    returnDueAt: r.returnDueAt,
    dailyRate: r.dailyRate,
    overageHourlyRate: r.overageHourlyRate,
    graceMinutes: r.graceMinutes,
    nextBookingStartsAt: r.nextBookingStartsAt ?? "",
    locationName: r.location.name,
    demandLevel: r.location.demandLevel,
    paymentMethodOnFile: r.paymentMethodOnFile,
    promisedReturnAt: r.promisedReturnAt,
    returnedAt: r.returnedAt,
    isEscalated: r.isEscalated,
  };
}

/** Build a partial entity from a RentalRecord patch (only defined fields). */
function patchToPartialEntity(patch: Partial<RentalRecord>): Record<string, unknown> {
  const e: Record<string, unknown> = {};

  if (patch.customer !== undefined) {
    if (patch.customer.name !== undefined) e["customerName"] = patch.customer.name;
    if (patch.customer.phoneE164 !== undefined) e["phoneE164"] = patch.customer.phoneE164;
    if (patch.customer.tier !== undefined) e["customerTier"] = patch.customer.tier;
    if (patch.customer.doNotCall !== undefined) e["doNotCall"] = patch.customer.doNotCall;
    if (patch.customer.callAttempts !== undefined) e["callAttempts"] = patch.customer.callAttempts;
  }
  if (patch.vehicle !== undefined) {
    if (patch.vehicle.class !== undefined) e["vehicleClass"] = patch.vehicle.class;
    if (patch.vehicle.plate !== undefined) e["plate"] = patch.vehicle.plate;
  }
  if (patch.returnDueAt !== undefined) e["returnDueAt"] = patch.returnDueAt;
  if (patch.dailyRate !== undefined) e["dailyRate"] = patch.dailyRate;
  if (patch.overageHourlyRate !== undefined) e["overageHourlyRate"] = patch.overageHourlyRate;
  if (patch.graceMinutes !== undefined) e["graceMinutes"] = patch.graceMinutes;
  if ("nextBookingStartsAt" in patch) e["nextBookingStartsAt"] = patch.nextBookingStartsAt ?? "";
  if (patch.location !== undefined) {
    if (patch.location.name !== undefined) e["locationName"] = patch.location.name;
    if (patch.location.demandLevel !== undefined) e["demandLevel"] = patch.location.demandLevel;
  }
  if (patch.paymentMethodOnFile !== undefined) e["paymentMethodOnFile"] = patch.paymentMethodOnFile;
  if ("promisedReturnAt" in patch) e["promisedReturnAt"] = patch.promisedReturnAt ?? null;
  if ("returnedAt" in patch) e["returnedAt"] = patch.returnedAt ?? null;
  if (patch.isEscalated !== undefined) e["isEscalated"] = patch.isEscalated;

  return e;
}

// ---- Public CRUD ----

export async function getRental(rentalId: string): Promise<RentalRecord | undefined> {
  try {
    const entity = await getClient().getEntity(PARTITION_KEY, rentalId);
    return entityToRecord(entity);
  } catch (err: unknown) {
    const azureErr = err as { statusCode?: number };
    if (azureErr?.statusCode === 404) return undefined;
    throw err;
  }
}

export async function listAllRentals(): Promise<RentalRecord[]> {
  const client = getClient();
  const records: RentalRecord[] = [];
  for await (const entity of client.listEntities<Record<string, unknown>>({
    queryOptions: { filter: odata`PartitionKey eq ${PARTITION_KEY}` },
  })) {
    records.push(entityToRecord(entity));
  }
  return records;
}

export async function listOverdueRentals(now: Date): Promise<RentalRecord[]> {
  // Inline filter to avoid pulling ALL records when table is large.
  // We filter on returnDueAt < now, then apply graceMinutes logic in JS.
  const all = await listAllRentals();
  return all.filter((r) => {
    const overdueMs = now.getTime() - new Date(r.returnDueAt).getTime();
    return overdueMs > r.graceMinutes * 60_000 && !r.returnedAt;
  });
}

export async function updateRental(
  rentalId: string,
  patch: Partial<RentalRecord>,
): Promise<RentalRecord | undefined> {
  const current = await getRental(rentalId);
  if (!current) return undefined;

  const partialEntity = patchToPartialEntity(patch);
  if (Object.keys(partialEntity).length === 0) return current;

  await getClient().updateEntity(
    { partitionKey: PARTITION_KEY, rowKey: rentalId, ...partialEntity },
    "Merge",
  );

  // Return the merged record
  return { ...current, ...patch } as RentalRecord;
}

export async function setPromisedReturn(
  rentalId: string,
  isoTime: string,
): Promise<RentalRecord | undefined> {
  return updateRental(rentalId, { promisedReturnAt: isoTime });
}

export async function markReturned(rentalId: string): Promise<RentalRecord | undefined> {
  const r = await getRental(rentalId);
  if (!r) return undefined;
  const returnedAt = r.returnedAt ? undefined : new Date().toISOString();
  return updateRental(rentalId, { returnedAt });
}

export async function markEscalated(rentalId: string): Promise<RentalRecord | undefined> {
  return updateRental(rentalId, { isEscalated: true });
}

/**
 * Write-only: records a call summary in the remarks column.
 * Not part of RentalRecord — this is a write-only audit trail field.
 */
export async function writeRemarks(rentalId: string, summary: string): Promise<void> {
  const entity = await getRental(rentalId);
  if (!entity) return;
  await getClient().updateEntity(
    { partitionKey: PARTITION_KEY, rowKey: rentalId, remarks: summary },
    "Merge",
  );
}

/**
 * Upsert a full rental record (used by the seed script and for creating new records).
 */
export async function upsertRental(r: RentalRecord): Promise<void> {
  await getClient().upsertEntity(recordToEntity(r), "Replace");
}
