// Host-side execution of the published package, not a replacement skill runtime.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
const source=path.resolve('submission');
const cwd=path.join(process.env.RUNNER_TEMP,'crm-clean-install');
fs.mkdirSync(cwd,{recursive:true});
const ref='kkebi50-svg/crm-cleanup@0.2.0';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const seed=privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64');
const publicBytes=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
const kid=`crm-ci-${process.env.GITHUB_RUN_ID}`;
const env={...process.env,RUNX_RECEIPT_SIGN_KID:kid,RUNX_RECEIPT_SIGN_ED25519_SEED_BASE64:seed,RUNX_RECEIPT_SIGN_ISSUER_TYPE:'ci'};
delete env.RUNX_PUBLIC_API_TOKEN;
const sourceRef='local://crm/dogfood';
env.RUNX_DATA_SOURCES=JSON.stringify({data_sources:{[sourceRef]:{adapter:'data.sqlite',database_path:'crm.sqlite',resources:{crm_records:{kind:'event_stream',partition_key:'aggregate_id'}}}}});
const receipts=path.join(cwd,'receipts');
const command=(label,args,extra={})=>{
  const r=spawnSync('runx',args,{cwd,env:{...env,...extra},encoding:'utf8',maxBuffer:16*1024*1024});
  if(r.error)throw r.error;
  let value;try{value=JSON.parse(r.stdout);}catch{throw new Error(`${label}: ${r.stderr||r.stdout}`);}
  console.log('EVIDENCE',JSON.stringify({label,command:['runx',...args],exit_code:r.status,value}));
  if(r.status!==0&&value.status!=='needs_agent')throw new Error(`${label} failed`);
  return value;
};
const write=(name,value)=>{const p=path.join(cwd,name);fs.writeFileSync(p,JSON.stringify(value));return name;};
command('published-metadata',['registry','read',ref,'--registry','https://api.runx.ai','--json']);
command('clean-install',['add',ref,'--registry','https://api.runx.ai','--json']);
const stream=`demo-${randomUUID()}`;
const seedInput={data_source_ref:sourceRef,resource:'crm_records',aggregate_id:stream,expected_version:0,idempotency_key:'seed',event:{type:'crm.snapshot',records:[{id:'northstar-demo',fields:{next_action:'await decision',stage:'discovery'}}]}};
const seeded=command('seed-synthetic-source',['skill',path.join(source,'skills/data-store'),'append_event','--inputs',write('seed.json',seedInput),'--receipts',receipts,'--json']);
if(seeded.outcome!=='completed')throw new Error('Source initialization failed');
const input={data_source_ref:sourceRef,resource:'crm_records',aggregate_id:stream,transcript:'Northstar demo account: the next action is schedule a technical review on Thursday. Keep the stage at discovery until that review.',crm_schema:{allowed_fields:['next_action','stage'],minimum_confidence:0.95},operation_key:`call-${stream}`};
const inputs=write('input.json',input);
const answer=write('answer.json',{answers:{'agent_task.crm-cleanup-reconcile.output':{update_draft:{takeaways:['Northstar agreed to a Thursday technical review.','The discovery stage remains unchanged.'],uncertainties:[],updates:[{record_id:'northstar-demo',field:'next_action',to:'schedule a technical review on Thursday',evidence_quote:'schedule a technical review on Thursday',rationale:'The transcript names the account and explicitly states this next action; the current source has await decision.',confidence:0.99,ambiguous:false}]}}}});
const run=label=>{
 const start=command(`${label}-start`,['skill',ref,'--registry','https://api.runx.ai','--inputs',inputs,'--receipts',receipts,'--diagnostics','--json']);
 if(start.status!=='needs_agent')throw new Error('Expected caller reconciliation');
 return command(label,['resume',start.run_id,answer,'--receipts',receipts,'--diagnostics','--json']);
};
const result=run('dogfood');
if(result.outcome!=='completed'||result.result?.crm_cleanup_result?.data?.status!=='verified')throw new Error('Dogfood did not verify a write');
const repeat=run('no-op');
if(repeat.result?.crm_cleanup_result?.data?.status!=='no_action')throw new Error('Repeat was not a no-op');
command('independent-final-read',['skill',path.join(source,'skills/data-store'),'read_events','--inputs',write('read.json',{data_source_ref:sourceRef,resource:'crm_records',aggregate_id:stream,limit:1}),'--receipts',receipts,'--json']);
console.log('EVIDENCE',JSON.stringify({label:'ci-public-verifier',kid,public_key_base64:publicBytes,issuer_type:'ci',github_run_url:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`}));
const verifyEnv={RUNX_RECEIPT_SIGN_KID:'',RUNX_RECEIPT_SIGN_ED25519_SEED_BASE64:'',RUNX_RECEIPT_SIGN_ISSUER_TYPE:'',RUNX_RECEIPT_VERIFY_KID:kid,RUNX_RECEIPT_VERIFY_ED25519_PUBLIC_KEY_BASE64:publicBytes};
for(const filename of fs.readdirSync(receipts).filter(n=>n.endsWith('.json'))){
 const p=path.join(receipts,filename);const receipt=JSON.parse(fs.readFileSync(p,'utf8'));
 console.log('RECEIPT',JSON.stringify({filename,receipt}));
 const verdict=command(`verify-${filename}`,['verify','--receipt',p,'--json'],verifyEnv);
 if(verdict.valid!==true)throw new Error('Production signature verification failed');
}
console.log('EVIDENCE',JSON.stringify({label:'completed',package:ref,input,receipt_id:result.receipt_id,source_revision:'7a5d77fdd2a33cab57f8b34843847295aa618b87',note:'Synthetic CRM, real native SQLite read/write/readback. CI Ed25519 issuer; no hosted identity or live customer data claimed.'}));
