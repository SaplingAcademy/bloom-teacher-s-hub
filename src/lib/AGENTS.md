# CRM inactivity

- Rule E calculations live in pure `lead-inactivity.ts`; Today and attention consume read-only `lead-inactivity-data.ts` candidates so both use persisted settings and the same contact reference.
- `inactive-lead-automation.ts` runs only at authenticated queue load/refresh boundaries, throttled in memory; durable activation/cycle ownership lives in the existing automation event ledger, never browser storage or settings defaults, avoiding retroactive backlog tasks and concurrent duplicates.
- Each settings revision gets a first-observed activation boundary; old inactive leads remain visible but only cycles becoming inactive after that boundary may create tasks. Event claims are insert-only or failed-status compare-and-set; do not steal processing events without an atomic database task constraint, because a paused tab may still own them.

# Lead conversion

- `lead-conversion.ts` copies the shared profile draft literally and supplies explicit NULL RPC arguments; shared catalog selectors change only teacher selections, never historical IDs or labels.
- Keep conversion writes inside the existing RPC and respect its already-converted guard before schedule recreation; conversion history reads union lead-targeted activity with conversion-only activity linked through the owner-scoped canonical lead event, deduplicating by activity ID without backfill.
- Manual history SQL patches only the installed RPC activity target, failing closed on an unfamiliar definition; never replace the live function with an older repository definition.