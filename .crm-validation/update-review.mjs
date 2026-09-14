import fs from 'node:fs';
const p='docs/core-skill-review.md';
const s=fs.readFileSync(p,'utf8').replace(/^\| crm-cleanup \|.*$/m,'| crm-cleanup | operation | public/canonical | javascript, tool:data.append_event, tool:data.digest, tool:data.read_events; 1 agent act -> declared artifact | native source read/write/readback and six harness cases | keep | Reads an operator-selected snapshot, applies grounded allowlisted updates with a version check, and independently verifies persisted state. No-op and uncertain inputs perform no write. | none |');
fs.writeFileSync(p,s);
