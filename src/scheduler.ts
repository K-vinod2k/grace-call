/**
 * Built-in autonomous dialer (the "agent decides WHEN to call" behavior).
 *
 * When AUTO_DIAL=1, this checks every minute and triggers a call for any rental that has been overdue
 * by `afterMinutes` (the "~1 hour after the return time was exceeded" rule), skipping do-not-call and
 * anything already attempted this run. It calls the SAME trigger path as the manual endpoint.
 *
 * In the full Enterprise story a Power Automate scheduled flow plays this role instead — this scheduler
 * lets the service be autonomous on its own, and makes the behavior demoable without Power Automate.
 */
import { listOverdueRentals, minutesOverdue } from "./data/rentals.js";

export interface SchedulerOptions {
  /** Call once a rental has been overdue by at least this many minutes. */
  afterMinutes: number;
  /** How often to check. Default 60s. */
  intervalMs?: number;
}

export function startScheduler(
  trigger: (rentalId: string) => Promise<void>,
  opts: SchedulerOptions,
): () => void {
  const attempted = new Set<string>();
  const intervalMs = opts.intervalMs ?? 60_000;

  const tick = async (): Promise<void> => {
    const now = new Date();
    for (const r of listOverdueRentals(now)) {
      if (attempted.has(r.rentalId) || r.customer.doNotCall) continue;
      if (minutesOverdue(r, now) >= opts.afterMinutes) {
        attempted.add(r.rentalId);
        try {
          await trigger(r.rentalId);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`auto-dial failed for ${r.rentalId}:`, (err as Error)?.message);
        }
      }
    }
  };

  const handle = setInterval(() => void tick(), intervalMs);
  void tick(); // run once at startup so an already-overdue rental is picked up promptly
  return () => clearInterval(handle);
}
