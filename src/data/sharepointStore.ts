/**
 * SharePoint List data layer for GraceCall.
 * Uses Microsoft Graph API with client credential auth (Sites.ReadWrite.All permission).
 *
 * Activated when SHAREPOINT_SITE_ID is set in the environment.
 * All functions mirror the signatures in rentals.ts so the two stores are interchangeable.
 */
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import type { RentalRecord, CustomerTier, VehicleClass, DemandLevel } from "./rentals.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const MISSING_VARS_MSG =
  "GRAPH_TENANT_ID (and other GRAPH_* / SHAREPOINT_* vars) must be set to use SharePoint mode.";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(MISSING_VARS_MSG);
  return v.trim();
}

/** Inline copy of minutesOverdue to avoid circular imports with rentals.ts. */
function minutesOverdue(r: RentalRecord, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(r.returnDueAt).getTime()) / 60000));
}

// ---- Graph client ----

function buildClient(): Client {
  const tenantId = requireEnv("GRAPH_TENANT_ID");
  const clientId = requireEnv("GRAPH_CLIENT_ID");
  const clientSecret = requireEnv("GRAPH_CLIENT_SECRET");

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  return Client.init({
    authProvider: (done) => {
      credential
        .getToken(GRAPH_SCOPE)
        .then((token) => {
          if (!token) {
            done(new Error("Unable to obtain access token from Azure AD"), null);
          } else {
            done(null, token.token);
          }
        })
        .catch((err: Error) => done(err, null));
    },
  });
}

/** Lazy singleton — credentials are validated on first use, not at module load time. */
let _client: Client | undefined;
function getClient(): Client {
  if (!_client) _client = buildClient();
  return _client;
}

function getSiteId(): string { return requireEnv("SHAREPOINT_SITE_ID"); }
function getListId(): string { return requireEnv("SHAREPOINT_LIST_ID"); }

// ---- Field mapping: SharePoint fields ↔ RentalRecord ----

function fieldsToRecord(fields: Record<string, unknown>): RentalRecord {
  return {
    rentalId: String(fields["Title"] ?? ""),
    customer: {
      name: String(fields["CustomerName"] ?? ""),
      phoneE164: String(fields["PhoneE164"] ?? ""),
      tier: String(fields["CustomerTier"] ?? "standard") as CustomerTier,
      doNotCall: Boolean(fields["DoNotCall"]),
      callAttempts: Number(fields["CallAttempts"] ?? 0),
    },
    vehicle: {
      class: String(fields["VehicleClass"] ?? "economy") as VehicleClass,
      plate: String(fields["PlateNumber"] ?? ""),
    },
    returnDueAt: String(fields["OutTime"] ?? ""),
    dailyRate: Number(fields["DailyRateUSD"] ?? 0),
    overageHourlyRate: Number(fields["OverageHourlyRate"] ?? 0),
    graceMinutes: Number(fields["GraceMinutes"] ?? 30),
    nextBookingStartsAt: fields["NextBookingStartsAt"]
      ? String(fields["NextBookingStartsAt"])
      : null,
    location: {
      name: String(fields["LocationName"] ?? ""),
      demandLevel: String(fields["DemandLevel"] ?? "normal") as DemandLevel,
    },
    paymentMethodOnFile: Boolean(fields["PaymentMethodOnFile"]),
    promisedReturnAt: fields["PromisedReturnAt"]
      ? String(fields["PromisedReturnAt"])
      : undefined,
    returnedAt: fields["ReturnedAt"] ? String(fields["ReturnedAt"]) : undefined,
    isEscalated: fields["IsEscalated"] ? Boolean(fields["IsEscalated"]) : undefined,
  };
}

/** Build a SharePoint fields object from a partial RentalRecord patch. */
function patchToFields(patch: Partial<RentalRecord>): Record<string, unknown> {
  const f: Record<string, unknown> = {};

  if (patch.customer !== undefined) {
    if (patch.customer.name !== undefined) f["CustomerName"] = patch.customer.name;
    if (patch.customer.phoneE164 !== undefined) f["PhoneE164"] = patch.customer.phoneE164;
    if (patch.customer.tier !== undefined) f["CustomerTier"] = patch.customer.tier;
    if (patch.customer.doNotCall !== undefined) f["DoNotCall"] = patch.customer.doNotCall;
    if (patch.customer.callAttempts !== undefined) f["CallAttempts"] = patch.customer.callAttempts;
  }
  if (patch.vehicle !== undefined) {
    if (patch.vehicle.class !== undefined) f["VehicleClass"] = patch.vehicle.class;
    if (patch.vehicle.plate !== undefined) f["PlateNumber"] = patch.vehicle.plate;
  }
  if (patch.returnDueAt !== undefined) f["OutTime"] = patch.returnDueAt;
  if (patch.dailyRate !== undefined) f["DailyRateUSD"] = patch.dailyRate;
  if (patch.overageHourlyRate !== undefined) f["OverageHourlyRate"] = patch.overageHourlyRate;
  if (patch.graceMinutes !== undefined) f["GraceMinutes"] = patch.graceMinutes;
  if ("nextBookingStartsAt" in patch) f["NextBookingStartsAt"] = patch.nextBookingStartsAt;
  if (patch.location !== undefined) {
    if (patch.location.name !== undefined) f["LocationName"] = patch.location.name;
    if (patch.location.demandLevel !== undefined) f["DemandLevel"] = patch.location.demandLevel;
  }
  if (patch.paymentMethodOnFile !== undefined) f["PaymentMethodOnFile"] = patch.paymentMethodOnFile;
  if ("promisedReturnAt" in patch) f["PromisedReturnAt"] = patch.promisedReturnAt ?? null;
  if ("returnedAt" in patch) f["ReturnedAt"] = patch.returnedAt ?? null;
  if (patch.isEscalated !== undefined) f["IsEscalated"] = patch.isEscalated;

  return f;
}

// ---- Graph API helpers ----

interface SpListItem {
  id: string;
  fields: Record<string, unknown>;
}

interface SpListResponse {
  value: SpListItem[];
}

async function getItemByRentalId(rentalId: string): Promise<SpListItem | undefined> {
  const client = getClient();
  // OData single-quote escaping
  const safe = rentalId.replace(/'/g, "''");
  const url =
    `/sites/${getSiteId()}/lists/${getListId()}/items` +
    `?$expand=fields&$filter=fields/Title eq '${safe}'`;
  const res = (await client.api(url).get()) as SpListResponse;
  return res.value[0];
}

async function getAllItems(): Promise<SpListItem[]> {
  const client = getClient();
  const url =
    `/sites/${getSiteId()}/lists/${getListId()}/items` +
    `?$expand=fields&$top=200`;
  const res = (await client.api(url).get()) as SpListResponse;
  return res.value;
}

async function patchItem(
  itemId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = getClient();
  const url = `/sites/${getSiteId()}/lists/${getListId()}/items/${itemId}/fields`;
  return (await client.api(url).patch(body)) as Record<string, unknown>;
}

// ---- Public CRUD ----

export async function getRental(rentalId: string): Promise<RentalRecord | undefined> {
  const item = await getItemByRentalId(rentalId);
  return item ? fieldsToRecord(item.fields) : undefined;
}

export async function listAllRentals(): Promise<RentalRecord[]> {
  const items = await getAllItems();
  return items.map((item) => fieldsToRecord(item.fields));
}

export async function listOverdueRentals(now: Date): Promise<RentalRecord[]> {
  const all = await listAllRentals();
  return all.filter((r) => minutesOverdue(r, now) > r.graceMinutes);
}

export async function updateRental(
  rentalId: string,
  patch: Partial<RentalRecord>,
): Promise<RentalRecord | undefined> {
  const item = await getItemByRentalId(rentalId);
  if (!item) return undefined;
  const fields = patchToFields(patch);
  if (Object.keys(fields).length === 0) return fieldsToRecord(item.fields);
  const updated = await patchItem(item.id, fields);
  return fieldsToRecord({ ...item.fields, ...updated });
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
 * Write-only: records a call summary in the Remarks column.
 * Not part of RentalRecord — this is a write-only audit trail field.
 */
export async function writeRemarks(rentalId: string, summary: string): Promise<void> {
  const item = await getItemByRentalId(rentalId);
  if (!item) return;
  await patchItem(item.id, { Remarks: summary });
}
