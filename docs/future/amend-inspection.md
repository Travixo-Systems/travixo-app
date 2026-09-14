# Amend an inspection

**Status:** not built. Design note, opened 2026-09-14 when the dead PATCH and
DELETE stubs were removed from `app/api/vgp/inspections/route.ts`.

Inspections are append-only today. Recording one works; correcting one is not
possible through the product. This records why that gap is deliberate and what
closing it properly requires, so the next person does not reach for PATCH and
DELETE again.

## Why the stubs were removed rather than implemented

Two handlers returned `501 "not implemented yet"`, with doc comments
advertising `/api/vgp/inspections/[id]`. No `[id]` route existed, so that URL
404s; the stubs answered only the collection URL, where "update the inspection"
has no referent. Nothing called them.

Implementing them as written would have been wrong regardless. An inspection is
not one row. Recording one writes three places:

1. `vgp_inspections` - the inspection itself
2. `vgp_schedules` - `next_due_date`, `last_inspection_date`, `status`
3. `assets.status` - `out_of_service`, but only on a `failed` result

A DELETE that removes only the first leaves the schedule advanced on the
strength of an inspection that no longer exists, and leaves a machine
`out_of_service` with nothing on record explaining why. A DELETE that undoes
all three has to reconstruct the *previous* state: which inspection was current
before this one, what the due date was derived from, and what the asset's
status had been. None of that is recoverable from the row being deleted.

The compliance consequence is the sharp one. A `failed` inspection is what
takes equipment out of service. Deleting it silently returns that machine to
bookable, and the checkout VGP gate will let it out to a customer. Under
art. L4741-1 a missed VGP is criminally sanctioned, so "the record was removed"
is not a defensible position.

## What a correct design looks like

**Supersede, never erase.** A correction adds a row that points at the one it
replaces. The original stays, marked superseded. History reads as a chain, and
anyone auditing sees both what was recorded and what it was corrected to.

Shape, roughly:

- `vgp_inspections.superseded_by uuid REFERENCES vgp_inspections(id)`, nullable
- `vgp_inspections.supersedes uuid REFERENCES vgp_inspections(id)`, nullable
- `vgp_inspections.correction_reason text` - mandatory on any superseding row,
  enforced by CHECK, not by the UI
- the current inspection for a schedule is the one with `superseded_by IS NULL`

**Recomputation must be transactional.** Superseding re-derives the schedule's
`next_due_date` and `status`, and the asset's `status`, from the new current
inspection - all of it or none, in one function, the same way
`record_inspection()` already does for the create path
(`supabase/migrations/20260903100000_record_inspection_rpc.sql`). Reuse that
shape; do not write a second, non-atomic path.

The asset-status rule needs care: superseding a `failed` inspection with a
`passed` one should return the asset to service, but only if no *other* failed
inspection still applies to it. That is a query, not an assumption.

**Audit trail.** Who corrected it, when, and why, retained independently of the
inspection rows. `vgp_schedules.edit_history` is the existing precedent for
recording a reason with a change; `admin_audit_log` is the precedent for
attributing an action to an actor.

**Certificates.** A superseded inspection's certificate must remain reachable.
The DREETS record is the certificate, not the row that points at it.

## Open questions for whoever picks this up

- Should a superseded inspection still appear in the history UI by default, or
  behind a toggle? Hiding it by default risks the dashboard looking like the
  correction was always the truth.
- Is there a time limit after which an inspection can no longer be amended?
- Does an amendment need to notify anyone - the original inspector, the org
  owner, the client whose rented equipment is affected?
- Does the export (`/api/vgp/inspections/export`) include superseded rows? A
  compliance export arguably must.

## Related

- `docs/working-agreements.md` - the three-table rule and the removal procedure
- `supabase/migrations/20260903100000_record_inspection_rpc.sql` - the atomic
  create path to mirror
- `docs/FEATURES-ACTUAL.md` - where this was first recorded as a STUB
