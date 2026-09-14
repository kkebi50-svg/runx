---
name: crm-cleanup
description: Read current CRM records from an operator-selected source, reconcile a call transcript into grounded allowlisted field updates, execute the changes once, and verify independent readback. Return uncertainty or no-op without writing.
registry_owner: kkebi50-svg
---

# CRM Cleanup

Use CRM Cleanup after a call when the CRM should reflect a customer's explicit
statements and agreed next actions. It reads the current record set at execution
time, interprets the transcript, applies the supported changes through the
operator's selected data transport, and checks the resulting records independently.
It does not find new prospects or assign leads; those jobs belong to lead-enrichment
and lead-router. A transcript alone is not current CRM state, and a quoted sentence
alone does not prove that a proposed value follows from it.

## Source and authority

Select `data_source_ref`, `resource`, and `aggregate_id` for the exact record set.
The current stream head must be a complete `crm.snapshot` event with `records`:
each record has a unique stable `id` and a `fields` object of scalar CRM values.
This event-sourced CRM contract makes each committed state independently readable.
The source must already exist; the skill never seeds or fabricates a production
source. Missing, malformed, duplicate-identity, or oversized snapshots stop the run.

The canonical data-store capabilities own source bindings, scoped reads, appends,
version checks, idempotency, and their receipts. The operator chooses the adapter
outside this skill. Native SQLite behind an unbound `local://` source is useful as
an explicitly synthetic mock CRM. It is real durable transport execution, but it
is not evidence of a live Salesforce, HubSpot, or customer CRM update. To use another
CRM, bind a conforming adapter that exposes this snapshot contract and independently
reads its authoritative state; do not describe an unconnected event log as that CRM.

`runx:data:read` admits the source reads and `runx:data:append` admits the exact
mutation. `crm_schema.allowed_fields` further limits CRM field authority. It cannot
grant storage access. Set `minimum_confidence` between 0.9 and 1, provide the complete
transcript (at most 16,000 characters), and supply a stable `operation_key`. Never
use this workflow to infer permission from a customer sentence or to process private
data without the operator's authorization.

For a synthetic trial, initialize the source separately with data-store's
`append_event` operation: expected version 0, a unique seed idempotency key, and an
event such as `{"type":"crm.snapshot","records":[{"id":"acct-globex","fields":{"next_action":"none"}}]}`.
Then use the copy-valid invocation exposed by `runx skill inspect`. Harness setup
is isolated and synthetic; a separate dogfood run must read a persisted runtime
source rather than paste the fixture as current CRM evidence.

## Procedure and judgment

The default `reconcile` runner first reads the latest bounded source event and
binds the transcript through native digest evidence. The interpreting agent extracts
takeaways and candidate updates. Each candidate names the exact record and field,
target value, verbatim quote, confidence, rationale, and any ambiguity. Record
identity must be established by the transcript and the supplied records. Do not
match an unnamed person or company by guesswork.

Deterministic CRM policy rejects unknown records, forbidden fields, duplicate field
targets, absent quotes, empty values, and low confidence or ambiguous interpretations.
Any unresolved candidate prevents the entire mutation, preserving all findings for
review. A value already present is a no-op. The module checks relationships specific
to CRM policy; it does not access storage, make network calls, handle credentials,
compute receipt hashes, or substitute for the native runtime.

If every proposed change is admissible, the runner appends one complete snapshot
using the exact version it observed, then performs a separate source read. The
version, event identity, event digest and complete record set must match the native
write result and planned state before the result says `verified`. The native
transport owns concurrency and idempotency. A successful agent answer or a sealed
proposal is never proof that the write occurred.

## Results and recovery

`crm_cleanup_result` contains `takeaways`, `field_updates`, named `findings`, original
source identity and version, transcript digest, and `write_result` with before/after
records. Each field update preserves its prior value and transcript evidence.

- `verified`: the transport confirmed the event and independent readback matched.
- `no_action`: the records already match or no change was supported; no append ran.
- `needs_review`: uncertainty or invalid candidate evidence prevented all updates.
- `refused`: the required current CRM snapshot was not usable.
- `conflict`: the native transport rejected a stale version or inconsistent retry.
- `unverified`: the effect or its independent readback could not be confirmed.

`write_performed` describes a newly committed event in this invocation; an
`idempotent_replay` can be verified without another write. `after: null` means the
post-operation state is unknown. Never present the planned state as observed state.
A native transport or worker failure can terminate execution before a final result;
inspect the runtime's failure receipt and retain uncertainty about any earlier effect.

For a conflict, read the current source and reconcile again rather than forcing a
stale snapshot. After a lost response, inspect the source and retry the exact operation
identity; never invent a new key merely to make the write succeed. Resolve review
findings with additional evidence before another attempt. Large archives belong
upstream: this operation handles at most 50 current records, 50 fields per record,
and 50 candidate updates, not unbounded history.

When called downstream of call processing, reuse its transcript and field schema
without repeating transcription. Preserve the source identity, takeaways, evidence,
findings and actual effect status for the next operator. Publication is separate:
the canonical registry CLI publishes the exact validated package, and a clean install,
hosted harness, and separate source-read/write/readback run establish distribution
and execution evidence. A local fixture success is only harness evidence.

## Agent task contracts

### `crm-cleanup-reconcile`

Read `transcript`, `crm_records`, and `crm_schema`. Return the typed `update_draft`
with `takeaways`, `uncertainties`, and `updates`. Every update has `record_id`, `field`,
`to`, `evidence_quote`, `rationale`, `confidence`, and `ambiguous`.

If `source_ready` is false, return no updates and state that source records are
unavailable. Deterministic policy will refuse the run; do not fabricate a replacement.

Propose only changes actually supported by the transcript, bound to one current
record and an allowed field. Copy evidence verbatim. Explain why the quote entails
the value and identifies the record; do not turn vague sentiment into a definite
status or score. Report conflicts and missing identity as uncertainties. An empty
update array is correct when the call changes nothing. Never invent records, quotes,
values, approval, transport execution, or readback evidence.
