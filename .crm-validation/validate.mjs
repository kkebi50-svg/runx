// Host orchestration for a candidate, not a skill runtime or alternative verifier.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const command = args => {
  const raw=execFileSync('runx',args,{encoding:'utf8',maxBuffer:8*1024*1024});
  return JSON.parse(raw);
};
console.log(execFileSync('runx',['--version'],{encoding:'utf8'}));
const start=command(['skill','./skills/skill-lab','build','-i','objective=Validate CRM cleanup source read, grounded updates, conditional write and independent readback.','-i','target_dir=skills/crm-cleanup','--json']);
if(start.status!=='needs_agent') throw new Error(JSON.stringify(start));
const plan=command(['resume',start.run_id,'.crm-validation/architecture.json','--json']);
if(plan.status!=='needs_agent') throw new Error(JSON.stringify(plan));
const applied=command(['resume',plan.run_id,'.crm-validation/author.json','--json']);
console.log('NATIVE_APPLY_RESULT',JSON.stringify(applied));
if(applied.outcome!=='completed') throw new Error(applied.closure?.summary??'Native candidate apply failed');
const inspected=command(['skill','inspect','./skills/crm-cleanup','--json']);
console.log('NATIVE_INSPECTION',JSON.stringify(inspected));
const harness=command(['harness','./skills/crm-cleanup','--json']);
console.log('NATIVE_HARNESS',JSON.stringify(harness));
if(harness.status!=='passed') throw new Error('Native harness did not pass');
console.log('APPLIED_FILES',execFileSync('git',['diff','--stat','--','skills/crm-cleanup'],{encoding:'utf8'}));
