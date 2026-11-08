/* The AI door (Settings → AI coach, aiCall): off until a key is saved, then
   the Messages API to Anthropic directly or through a proxy (LiteLLM).

   Claude is mocked with page.route; the official SDK itself is the real one,
   loaded from the pinned CDN URL the app uses. Nothing reaches Anthropic. */
import { launch, boot, getState, openSettings, ok, eq, has, report } from './harness.mjs';

const KEY = 'sk-ant-TESTONLY-t38-do-not-leak';
const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };
const seed = () => ({ version:5, settings:Object.assign({}, SET), active:null, sessions:[],
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[] } ] } ] });

const { browser, errors } = await launch();
const page = await (await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));

const calls = [];
let mode = 'ok';
const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'POST' };
async function claude(route) {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status:204, headers:CORS });
  calls.push({ url:r.url(), headers:r.headers(), body:JSON.parse(r.postData() || '{}') });
  if (mode === 'abort') return route.abort('failed');
  if (mode === '401') return route.fulfill({ status:401, headers:Object.assign({ 'content-type':'application/json' }, CORS),
    body:JSON.stringify({ type:'error', error:{ type:'authentication_error', message:'invalid x-api-key' } }) });
  const body = JSON.parse(r.postData());
  return route.fulfill({ status:200, headers:Object.assign({ 'content-type':'application/json' }, CORS), body:JSON.stringify({
    id:'msg_t38', type:'message', role:'assistant', model:body.model,
    stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn',
    content: mode === 'refusal' ? [] : [{ type:'text', text:'OK' }], usage:{ input_tokens:12, output_tokens:1 } }) });
}
await page.route('https://api.anthropic.com/**', claude);
await page.route('https://proxy.example.test/**', claude);

const status = async () => (await page.textContent('#ai-status')).trim();
async function waitStatus(re) {
  for (let i = 0; i < 100; i++) { const s = await status(); if (re.test(s)) return s; await page.waitForTimeout(100); }
  return await status();
}

/* ---- 1. off until a key is saved ---- */
await boot(page, seed());
await openSettings(page);
has(await page.textContent('#view'), 'AI coach', 'Settings has an AI coach card');
eq(await page.getAttribute('[data-ai="key"]', 'type'), 'password', 'the key box is a password field');
has(await page.textContent('#view'), 'subscription can', 'the card says a Claude.ai subscription cannot be used here');

/* ---- 2. straight to Anthropic ---- */
await page.fill('[data-ai="key"]', KEY);
await page.click('[data-act="ai-save"]');
await page.waitForSelector('[data-act="ai-test"]');
has(await page.textContent('#view'), 'Anthropic direct', 'saved: says it talks to Anthropic directly');
await page.click('[data-act="ai-test"]');
has(await waitStatus(/Connected|n't|declined|rejected/), 'Connected — claude-opus-5-5 answered', 'Test: connects with the default model');
eq(calls[0].url, 'https://api.anthropic.com/v1/messages', 'direct: posts to Anthropic\'s Messages API');
eq(calls[0].body.model, 'claude-opus-5-5', 'direct: default model claude-opus-5-5');
eq(calls[0].body.fallbacks, 'default', 'direct: server-side refusal fallback is on');
has(calls[0].headers['anthropic-beta'] || '', 'server-side-fallback-2026-07-01', 'direct: ...with its beta header');
eq(calls[0].body.output_config && calls[0].body.output_config.effort, 'low', 'direct: the test call asks for low effort');

/* ---- 3. the key never leaves the phone except to the service ---- */
const st = await getState(page);
ok(!JSON.stringify(st).includes(KEY), 'the key is not in the log (so not in backups, exports or the gist)');
ok(!(await page.content()).includes(KEY), 'the key is not in the page');
ok(!calls.some(c => JSON.stringify(c.body).includes(KEY)), 'the key is never in a request body');

/* ---- 4. failures say what to do ---- */
mode = '401';
await page.click('[data-act="ai-test"]');
has(await waitStatus(/rejected|reach|error/), 'key was rejected', '401: says the key was rejected');
mode = 'refusal';
await page.click('[data-act="ai-test"]');
has(await waitStatus(/declined|rejected|reach/), 'declined', 'refusal: says Claude declined');

/* ---- 5. through a proxy (LiteLLM) ---- */
mode = 'ok';
await page.click('[data-act="ai-remove"]');
await page.waitForSelector('[data-ai="key"]');
await page.fill('[data-ai="key"]', 'sk-litellm-proxy-key');
await page.fill('[data-ai="base"]', 'https://proxy.example.test/');
await page.fill('[data-ai="model"]', 'coach-sonnet');
await page.click('[data-act="ai-save"]');
await page.waitForSelector('[data-act="ai-test"]');
has(await page.textContent('#view'), 'via https://proxy.example.test/', 'saved: names the proxy');
const n = calls.length;
await page.click('[data-act="ai-test"]');
has(await waitStatus(/Connected|n't|declined|rejected/), 'Connected — coach-sonnet answered', 'proxy: connects with the model it names');
eq(calls[n].url, 'https://proxy.example.test/v1/messages', 'proxy: posts to the proxy\'s /v1/messages');
ok(calls[n].body.fallbacks === undefined, 'proxy: no beta parameters a proxy may not pass through');
mode = 'abort';
await page.click('[data-act="ai-test"]');
has(await waitStatus(/reach|rejected|error/), 'your proxy', 'proxy unreachable: says so, and mentions CORS');

/* ---- 6. plain-http proxy refused (except localhost) ---- */
await page.click('[data-act="ai-remove"]');
await page.waitForSelector('[data-ai="key"]');
await page.fill('[data-ai="key"]', 'x'); await page.fill('[data-ai="base"]', 'http://192.168.1.5:4000');
await page.click('[data-act="ai-save"]');
await page.waitForTimeout(300);
ok(await page.$('[data-ai="key"]') !== null, 'a plain-http proxy on the network is refused');

/* ---- 7. 320 px ---- */
await page.setViewportSize({ width:320, height:740 });
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Settings with the AI card: no sideways scroll at 320 px');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t38 ai');
await browser.close();
