# CRM cleanup 0.2.0 execution evidence

This is evidence for the already-published **0.2.0** package at source commit `7a5d77fdd2a33cab57f8b34843847295aa618b87`. It is not the final 0.2.1 delivery and does not establish payment or acceptance.

- Package: `kkebi50-svg/crm-cleanup@0.2.0`.
- Native CLI: `runx-cli 0.9.1`.
- Execution: https://github.com/kkebi50-svg/runx/actions/runs/34902422180 .
- Registry: https://runx.ai/x/kkebi50-svg/crm-cleanup@0.2.0 . The hosted harness reports six passed cases.
- Source: https://github.com/kkebi50-svg/runx/tree/7a5d77fdd2a33cab57f8b34843847295aa618b87/skills/crm-cleanup .
- Dogfood root receipt: `sha256:325e4b2c53cf8a3384b2051ec2ea5921eec7e36a9029e2b7af0f4258ca053eb1`.
- A fresh install read an initialized synthetic CRM stream at runtime, changed its next action, independently read the persisted state, and performed no additional write on the second invocation. This is real durable SQLite transport on synthetic records; it is not a live customer CRM integration.
- All 20 native receipts passed production-mode Ed25519 verification against the CI public key. The root was also verified separately on Windows. The public key is CI-issued, not a Runx-hosted identity or an independent human review.
- Runx hosted receipt notarization returned HTTP 502 on two attempts. No hosted notary seal is claimed. The unmodified receipts and public verifier key are supplied directly here.

## Reproduce signature verification

With released Runx CLI 0.9.1 or a compatible newer CLI, download the receipt and public key files from this evidence directory. The verification key must be trusted based on the identified CI run; an embedded key is not itself proof of external authority.

```sh
export RUNX_RECEIPT_VERIFY_KID=crm-ci-34902422180
export RUNX_RECEIPT_VERIFY_ED25519_PUBLIC_KEY_BASE64=e75s8rV1lf+eVTiu5QyZ8VUK7J5U3haJt2cmPzzMuf4=
runx verify --receipt sha256-325e4b2c53cf8a3384b2051ec2ea5921eec7e36a9029e2b7af0f4258ca053eb1.json --json
```

`observations.json` records actual commands, outputs, field changes, source reads and per-receipt verdicts. `local-verification.json` is the independent Windows process result. Single-receipt verification reports lineage separately; it does not establish the whole tree or external authority merely because the signature is valid. `notary-publication.json` records the failed hosted notarization attempt rather than a fabricated success.
