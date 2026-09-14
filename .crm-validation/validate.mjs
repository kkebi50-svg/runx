// Host orchestration for a candidate, not a skill runtime or alternative verifier.
import {execFileSync,spawnSync} from 'node:child_process';
const command = args => {
  const run=spawnSync('runx',args,{encoding:'utf8',maxBuffer:8*1024*1024});
  if(run.error) throw run.error;
  if(!run.stdout.trim()) throw new Error(run.stderr||'Runx returned no structured result');
  return JSON.parse(run.stdout);
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
