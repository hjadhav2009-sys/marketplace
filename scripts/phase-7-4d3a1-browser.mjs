import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright-core';
import { start, stop, loadPrivateConfig, buildEnvironment, databaseUrl } from './staging/core.mjs';
const root=process.cwd(),base='http://127.0.0.1:3188',stage=path.join(root,'.codex-tmp','stage3-sanitized-staging'),output=path.join(root,'.codex-tmp','phase-7-4d3a1');
const config=await loadPrivateConfig();
const env=buildEnvironment(config),db=new PrismaClient({datasourceUrl:databaseUrl()});
const receipt=JSON.parse(await readFile(path.join(stage,'reports/current-build.json'),'utf8'));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),buildId=(await readFile('.next/BUILD_ID','utf8')).trim();
assert.equal(receipt.sourceSha,sha);assert.equal(receipt.buildId,buildId);
const creds=JSON.parse(await readFile(path.join(stage,'credentials/synthetic-users.json'),'utf8')).users.find(u=>u.scenario==='OWNER');
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(executablePath);await mkdir(output,{recursive:true});
function fixture(command,accountId){return JSON.parse(execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/phase-7-4d3a1-fixture.ts',command,accountId],{env,encoding:'utf8',windowsHide:true}).trim());}
const results=[];let browser;
try {
 await start();browser=await chromium.launch({executablePath,headless:true});
 for(const width of [390,1440]){
  const accountId=`d3a1-browser-${width}-${Date.now()}`;
  await db.account.create({data:{id:accountId,name:`Synthetic D3A1 ${width}`,code:accountId,marketplace:'AMAZON'}});
  const data=fixture('prepare',accountId),context=await browser.newContext({viewport:{width,height:width===390?844:900}}),page=await context.newPage();
  await page.goto(base+'/login');await page.locator('[name=username]').fill(creds.username);await page.locator('[name=password]').fill(creds.password);
  await Promise.all([page.waitForURL(u=>u.pathname!='/login'),page.locator('form').first().evaluate(f=>f.requestSubmit())]);
  await page.goto(base+'/accounts');await page.locator(`input[name=accountId][value="${accountId}"]`).check();await Promise.all([page.waitForURL(/dashboard/),page.getByRole('button',{name:'Select account',exact:true}).click()]);
  const errors={console:[],page:[],requests:[],http:[]};
  page.on('console',m=>{if(m.type()==='error')errors.console.push(m.text());});page.on('pageerror',e=>errors.page.push(e.message));page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')errors.requests.push(r.failure()?.errorText);});page.on('response',r=>{if(r.status()>=400)errors.http.push(r.status());});
  await page.goto(`${base}/owner/imports/${data.wideJobId}/mapping`);await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('select').count(),16);assert.equal(await page.locator('[name=map_sellerSku]').inputValue(),'');
  const labels=await page.locator('[name=map_otherImageUrl1] option').allTextContents();
  const repeated=labels.filter(label=>label.endsWith('Other Image URL'));assert.equal(repeated.length,8);assert.equal(new Set(repeated).size,8);assert.ok(repeated[0].includes('H'));assert.ok(repeated[7].includes('O'));
  const layout=await page.evaluate(()=>({overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-document.documentElement.clientWidth,small:[...document.querySelectorAll('#app-shell-main input:not([type=hidden]),#app-shell-main select,#app-shell-main button,#app-shell-main a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.disabled&&(r.width<44||r.height<44);}).map(e=>e.tagName)}));
  assert.equal(layout.overflow,0);assert.deepEqual(layout.small,[]);await page.screenshot({path:path.join(output,`mapping-${width}.png`),fullPage:true});
  await page.goto(`${base}/owner/imports/${data.jobId}/mapping`);await page.waitForLoadState('networkidle');
  const select=page.locator('[name=map_sellerSku]'),options=await select.locator('option').evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent})));
  const code=options.find(o=>o.label.endsWith('Owner Code'));assert.ok(code);
  // Tampered positional identity must leave the retained job and profiles untouched.
  const bad=JSON.parse(Buffer.from(code.value.slice(3),'base64url').toString());bad.columnIndex=99;bad.excelColumn='CV';const encoded='v2:'+Buffer.from(JSON.stringify(bad)).toString('base64url');
  await select.evaluate((el,value)=>{const option=new Option('Tampered',value);el.add(option);el.value=value;},encoded);
  await Promise.all([page.waitForURL(/error=column/),page.getByRole('button',{name:'Save Profile and Retry',exact:true}).click()]);
  assert.equal(await db.marketplaceFileProfile.count({where:{accountId}}),0);assert.equal((await db.importJob.findUniqueOrThrow({where:{id:data.jobId}})).status,'NEEDS_MAPPING');
  for(const [key,label] of [['sellerSku','Owner Code'],['title','Owner Title'],['asin','Owner ASIN']]){
   const locator=page.locator(`[name=map_${key}]`),value=await locator.locator('option').evaluateAll((opts,label)=>opts.find(o=>o.textContent.endsWith(label)).value,label);await locator.selectOption(value);
  }
  await Promise.all([page.waitForURL(/mapping=saved/),page.getByRole('button',{name:'Save Profile and Retry',exact:true}).click()]);
  let job;for(let i=0;i<100;i++){job=await db.importJob.findUniqueOrThrow({where:{id:data.jobId}});if(!['QUEUED','RUNNING'].includes(job.status))break;await new Promise(r=>setTimeout(r,200));}
  assert.match(job.status,/^COMPLETED/);assert.equal(job.filePath,data.filePath);
  assert.equal(await db.marketplaceListing.count({where:{accountId,sellerSkuId:data.sku}}),1);
  const reuse=fixture('reuse',accountId);assert.match(reuse.status,/^COMPLETED/);
  assert.equal(await db.marketplaceFileProfile.count({where:{accountId}}),1);
  // Expected denial runs separately from successful-page HTTP/console accounting.
  const denied=await context.newPage();await context.addCookies([{name:'mpp_stage3_account',value:'stage3-account-fk-01',url:base}]);
  const denial=await denied.goto(`${base}/owner/imports/${data.wideJobId}/mapping`);assert.equal(denial.status(),404);await denied.close();
  assert.ok(Object.values(errors).every(list=>list.length===0),JSON.stringify(errors));results.push({width,layout,errors,repeatedLabels:repeated,retainedRetry:job.status,profileReuse:reuse.status,crossAccountStatus:404,tamperRejected:true});await context.close();
 }
} finally {if(browser)await browser.close();await db.$disconnect();await stop();}
await writeFile(path.join(output,'browser-report.json'),JSON.stringify({sourceSha:sha,buildId,syntheticDatabase:databaseUrl(),results},null,2));
console.log(JSON.stringify({sourceSha:sha,buildId,viewports:results.length,passed:true}));
