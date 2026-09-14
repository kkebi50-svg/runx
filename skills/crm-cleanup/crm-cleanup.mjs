// CRM policy only. Native data capabilities own storage, concurrency and receipts.
const scalar = value => value === null || ["string", "number", "boolean"].includes(typeof value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const finding = (code, message) => ({ code, message });

function snapshot(result) {
  const event = result?.events?.[0];
  const records = event?.event?.records;
  if (result?.status !== "read" || result.events.length !== 1 ||
      event.version !== result.after_version || event.event.type !== "crm.snapshot" ||
      !Array.isArray(records) || records.length < 1 || records.length > 50) {
    throw new Error("Source must contain one current crm.snapshot event with 1–50 records.");
  }
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || !record.id.trim() || seen.has(record.id) ||
        !record.fields || Array.isArray(record.fields) || typeof record.fields !== "object" ||
        Object.keys(record.fields).length > 50 || !Object.values(record.fields).every(scalar)) {
      throw new Error("CRM snapshot has an invalid or duplicate record identity or invalid field values.");
    }
    seen.add(record.id);
  }
  return { records, version: event.version, event_ref: event.event_ref, digest: event.event_digest };
}

export function prepareSource(inputs) {
  try {
    return { crm_source: { ready: true, ...snapshot(inputs.source_result), findings: [] } };
  } catch (error) {
    return { crm_source: { ready: false, records: [], version: 0, event_ref: "", digest: "",
      findings: [finding("source.invalid", error.message)] } };
  }
}

export function planUpdates(inputs) {
  const source = inputs.crm_source;
  const draft = inputs.update_draft;
  const before = source.records;
  const findings = [...source.findings];
  const takeaways = draft?.takeaways ?? [];
  const updates = [];
  const fields = inputs.crm_schema.allowed_fields;
  const byId = new Map(before.map(record => [record.id, record]));
  const targets = new Set();
  if (source.ready && !draft) findings.push(finding("draft.missing", "Reconciliation result is missing."));
  if (draft?.uncertainties?.length) {
    for (const reason of draft.uncertainties) findings.push(finding("evidence.uncertain", reason));
  }
  for (const update of draft?.updates ?? []) {
    const record = byId.get(update.record_id);
    const key = JSON.stringify([update.record_id, update.field]);
    const fail = (code, reason) => findings.push(finding(code, `${update.record_id}.${update.field}: ${reason}`));
    if (!record) { fail("record.unknown", "no record with this id was read from the source"); continue; }
    if (!fields.includes(update.field) || ["__proto__", "constructor", "prototype", "id"].includes(update.field)) {
      fail("field.forbidden", "field is outside the allowed CRM update authority"); continue;
    }
    if (targets.has(key)) { fail("field.duplicate", "multiple updates target the same field"); continue; }
    targets.add(key);
    if (!update.evidence_quote?.trim() || !inputs.transcript.includes(update.evidence_quote)) {
      fail("evidence.unsupported", "the exact evidence quote is absent from the transcript"); continue;
    }
    if (update.confidence < inputs.crm_schema.minimum_confidence || update.ambiguous || !update.rationale?.trim()) {
      fail("evidence.uncertain", "confidence, identity or interpretation requires review"); continue;
    }
    if (update.to === "" || update.to === null || !scalar(update.to)) {
      fail("value.empty", "a nonempty scalar target value is required"); continue;
    }
    const from = Object.hasOwn(record.fields, update.field) ? record.fields[update.field] : null;
    if (equal(from, update.to)) continue;
    updates.push({ ...update, from });
  }
  const decision = !source.ready ? "refused" : findings.length ? "needs_review" : updates.length ? "execute" : "no_action";
  const admitted = decision === "execute" ? updates : [];
  const after = before.map(record => ({ id: record.id, fields: { ...record.fields } }));
  for (const update of admitted) after.find(record => record.id === update.record_id).fields[update.field] = update.to;
  return { crm_plan: {
    decision, takeaways, field_updates: admitted, findings, before, after,
    expected_version: source.version,
    event: { type: "crm.snapshot", records: after, cleanup: {
      operation_key: inputs.operation_key, transcript_digest: inputs.transcript_digest,
      source_event_ref: source.event_ref, field_updates: admitted
    } },
    source_event_ref: source.event_ref, source_digest: source.digest
  } };
}

function sameRecords(left, right) {
  if (left.length !== right.length) return false;
  const indexed = new Map(right.map(record => [record.id, record.fields]));
  return left.every(record => {
    const fields = indexed.get(record.id);
    return fields && Object.keys(record.fields).length === Object.keys(fields).length &&
      Object.keys(record.fields).every(key => Object.hasOwn(fields, key) && equal(record.fields[key], fields[key]));
  });
}

export function finalizeCleanup(inputs) {
  const plan = inputs.crm_plan;
  const write = inputs.write_result;
  let status = plan.decision;
  let after = plan.before;
  let writePerformed = false;
  let verified = false;
  const findings = [...plan.findings];
  if (plan.decision === "execute") {
    status = "unverified";
    after = null;
    writePerformed = write?.status === "committed";
    if (write?.status === "conflict") {
      status = "conflict";
      findings.push(finding("write.conflict", "Source version or operation identity changed; re-read before retrying."));
    } else if (!["committed", "idempotent_replay"].includes(write?.status)) {
      findings.push(finding("write.unconfirmed", "Native transport did not confirm the requested append."));
    } else {
      try {
        const observed = snapshot(inputs.readback_result);
        after = observed.records;
        const expectedIdentity = inputs.readback_result.data_source_ref === inputs.data_source_ref &&
          inputs.readback_result.resource === inputs.resource && inputs.readback_result.aggregate_id === inputs.aggregate_id;
        verified = expectedIdentity && observed.version === write.after_version &&
          observed.event_ref === write.event_ref && observed.digest === write.event_digest &&
          sameRecords(plan.after, after);
        status = verified ? "verified" : "unverified";
        if (!verified) findings.push(finding("readback.mismatch", "Independent source readback does not match the exact executed CRM transition."));
      } catch (error) { findings.push(finding("readback.invalid", error.message)); }
    }
  }
  return { crm_cleanup_result: {
    status, takeaways: plan.takeaways, field_updates: plan.field_updates, findings,
    source: { data_source_ref: inputs.data_source_ref, resource: inputs.resource, aggregate_id: inputs.aggregate_id,
      event_ref: plan.source_event_ref, digest: plan.source_digest, version: plan.expected_version },
    transcript_digest: inputs.transcript_digest,
    write_result: { attempted: plan.decision === "execute", write_performed: writePerformed, verified,
      status: write?.status ?? "not_attempted", before: plan.before, after,
      event_ref: write?.event_ref ?? null, before_version: write?.before_version ?? plan.expected_version,
      after_version: write?.after_version ?? plan.expected_version }
  } };
}
