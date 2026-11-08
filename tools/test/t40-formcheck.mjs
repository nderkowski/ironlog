/* Form check (v28): film a set, Claude looks at 8–12 still frames.

   Claude is mocked with page.route; nothing reaches Anthropic. The video is
   real: a moving shape drawn on a canvas and recorded to webm with
   MediaRecorder inside the browser, then handed to the file input. The frames
   are pulled out by the app's own <video> + canvas code, so the sizes asserted
   here are the ones that would be sent. Driven through the UI (trap 19). */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const KEY = 'sk-ant-TESTONLY-t40-do-not-leak';
const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{ w:45, n:4 }, { w:25, n:2 }, { w:10, n:2 }, { w:5, n:2 }, { w:2.5, n:2 }], lastBackup:0 };
const seed = () => ({ version:5, settings:Object.assign({}, SET), active:null, sessions:[],
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'p1', name:'Leg Press', sets:3, reps:8, repTop:12, mg:'quads' },
    { id:'p2', name:'DB Curl', sets:3, reps:8, repTop:12, mg:'biceps' } ] } ] } ] });

const REPLY = {
  verdict:'adjust',
  summary:'In these frames your torso stays upright and depth is good, but your knees drift inward at the bottom of the rep.',
  cues:[
    { cue:'Push your knees out over your toes at the bottom', why:'They collapse inward in frame 3.', frame:3 },
    { cue:'Keep your lower back flat against the pad', why:'It lifts off the pad at the deepest point.', frame:5 },
    { cue:'Pause for a beat before you drive up', why:'Frame 4 looks like a bounce out of the bottom.', frame:4 } ],
  film_tip:'Move the phone a bit lower, level with your hips.',
  safety:'' };

const { browser, errors } = await launch();
const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(String(e)));

/* ---- a mock Claude ---- */
const calls = [];
let mode = 'ok', reply = REPLY, delay = 0, usage = { input_tokens:9000, output_tokens:2000 };
const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'POST' };
await page.route('https://api.anthropic.com/**', async route => {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status:204, headers:CORS });
  const body = JSON.parse(r.postData() || '{}');
  calls.push({ url:r.url(), headers:r.headers(), body, bytes:(r.postData() || '').length });
  if (delay) await new Promise(res => setTimeout(res, delay));
  if (mode === 'abort') return route.abort('failed');
  if (mode === '401') return route.fulfill({ status:401, headers:Object.assign({ 'content-type':'application/json' }, CORS),
    body:JSON.stringify({ type:'error', error:{ type:'authentication_error', message:'invalid x-api-key' } }) });
  const stop = mode === 'refusal' ? 'refusal' : mode === 'cutoff' ? 'max_tokens' : 'end_turn';
  const content = mode === 'refusal' ? [] : [{ type:'text', text:mode === 'garbage' ? 'not json' : JSON.stringify(reply) }];
  return route.fulfill({ status:200, headers:Object.assign({ 'content-type':'application/json' }, CORS), body:JSON.stringify({
    id:'msg_t40', type:'message', role:'assistant', model:body.model, stop_reason:stop, content, usage }) });
});

/* ---- real test videos, recorded in a scratch page ---- */
async function record(w, h, secs, fps = 15) {
  const vp = await ctx.newPage();
  const b64 = await vp.evaluate(async ({ w, h, secs, fps }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(fps), { mimeType:'video/webm;codecs=vp8', videoBitsPerSecond:900000 });
    const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    const t0 = performance.now();
    await new Promise(res => {
      (function draw() {
        const t = (performance.now() - t0) / 1000;
        x.fillStyle = '#2a7a55'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#ffffff'; x.fillRect(w * 0.1 + (Math.sin(t * 3) + 1) * w * 0.35, h * 0.15, w * 0.1, h * 0.7);
        x.fillStyle = '#ffcc00'; x.font = (h / 8) + 'px sans-serif'; x.fillText(t.toFixed(1) + 's', 20, h / 6);
        if (t < secs) requestAnimationFrame(draw); else res();
      })();
    });
    rec.stop(); await stopped;
    const u8 = new Uint8Array(await new Blob(chunks, { type:'video/webm' }).arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, { w, h, secs, fps });
  await vp.close();
  return Buffer.from(b64, 'base64');
}
/* Two long clips are recorded in real time in the background while the first
   sections run: 31 s (10 frames) and 66 s (over the 60 s cap). */
const p31 = record(320, 240, 31, 6), p66 = record(320, 240, 66, 6);
const big = await record(1280, 720, 5);        // long edge 1280: must come down to 1024
const portrait = await record(360, 640, 5);    // already small: must not be scaled up
const tiny = await record(320, 240, 1);        // under the 2 s minimum
console.log('  videos: big ' + big.length + ' B, portrait ' + portrait.length + ' B, tiny ' + tiny.length + ' B');
const file = (buf, name = 'set.webm', mimeType = 'video/webm') => ({ name, mimeType, buffer:buf });

/* ---- helpers ---- */
const card = i => `.card.ex >> nth=${i}`;
/* save() is debounced 120 ms, so let it land before reading the log. */
const getS = async () => { await page.waitForTimeout(300); return getState(page); };
async function startWorkout() {
  await page.click('[data-tab="today"]');
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
}
async function logSet(ci, si, w, r) {
  await page.fill(`${card(ci)} >> .set >> nth=${si} >> input[data-f="w"]`, String(w));
  await page.fill(`${card(ci)} >> .set >> nth=${si} >> input[data-f="r"]`, String(r));
  await page.click(`${card(ci)} >> .set >> nth=${si} >> .tick`);
}
async function openFormCheck(ci = 0) {
  await page.click(`${card(ci)} >> [data-act="ex-menu"]`);
  await page.waitForSelector('.sheet [data-x="fcheck"]');
  await page.click('.sheet [data-x="fcheck"]');
  await page.waitForSelector('.sheet h3');
}
const sheetText = async () => (await page.textContent('.sheet')).replace(/\s+/g, ' ');
const hasSheet = async () => (await page.$('.backdrop')) !== null;
async function waitFor(fn, ms = 20000) {
  for (let i = 0; i < ms / 100; i++) { if (await fn()) return true; await page.waitForTimeout(100); }
  return false;
}
const resultUp = () => waitFor(async () => (await page.$('.sheet [data-fc="verdict"]')) !== null);
const errorUp = () => waitFor(async () => (await page.$('.sheet [data-fc="err"]')) !== null);
const noImage = async () => (await page.evaluate(() => {
  const all = []; for (let i = 0; i < localStorage.length; i++) all.push(localStorage.getItem(localStorage.key(i)));
  return all.join('\n');
}));
const LONG_EDGE = async b64 => page.evaluate(b => new Promise(res => {
  const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null);
  i.src = 'data:image/jpeg;base64,' + b;
}), b64);

await boot(page, seed());
await startWorkout();
await logSet(0, 0, 200, 8);
await logSet(0, 1, 205, 7);

/* ================= 1. no key: says it needs Claude, offers Settings ================= */
await page.click(`${card(0)} >> [data-act="ex-menu"]`);
has(await sheetText(), 'Form check (video)', 'the lift menu offers "Form check (video)"');
await page.click('.sheet [data-x="fcheck"]');
await page.waitForSelector('[data-fc="settings"]');
has(await sheetText(), 'needs Claude set up', 'no key: the sheet says it needs Claude set up');
ok(await page.$('input[type="file"]') === null, 'no key: no file picker is offered');
ok(calls.length === 0, 'no key: nothing was sent');
await page.click('[data-fc="close"]');
ok(!(await hasSheet()), '"Not now" closes the sheet and stays on the workout');
await openFormCheck();
await page.click('[data-fc="settings"]');
await page.waitForSelector('[data-set="unit"]');
let st = await getS();
ok(st.active && st.active.exercises[0].sets[0].w === '200', 'Open Settings: the workout in progress is still in the log');
await page.click('[data-tab="today"]');
await page.waitForSelector('.card.ex');
eq(await page.inputValue(`${card(0)} >> .set >> nth=0 >> input[data-f="w"]`), '200', 'coming back: the workout is on screen with what was logged');

/* ================= 2. with a key: how-to, set, question ================= */
await page.evaluate(k => localStorage.setItem('ironlog.ai', JSON.stringify({ key:k, base:'', model:'' })), KEY);
const row = await page.$(`${card(0)} >> .set`);                       // proves nothing below rebuilds the rows (trap 1)
await page.evaluate(() => {
  window.__mut = 0;
  new MutationObserver(r => { window.__mut += r.length; }).observe(document.querySelector('#view'), { childList:true, subtree:true, characterData:true });
});
await openFormCheck();
let t = await sheetText();
has(t, 'side', 'how-to: film from the side');
has(t, 'hip height', 'how-to: at about hip height');
has(t, 'whole body and the weight', 'how-to: whole body and the weight in frame');
has(t, '30 s', 'how-to: one set, 30 s or less');
const inp = await page.$('input[type="file"]');
eq(await inp.getAttribute('accept'), 'video/*', 'the picker accepts video');
eq(await inp.getAttribute('capture'), 'environment', 'the picker records with the back camera');
eq(await page.$$eval('input[type="file"]', n => n.length), 1, 'exactly one file input');
eq(await page.$$eval('.fc-set', b => b.length), 3, 'one choice per logged set, plus "not logged yet"');
has(await page.textContent('.fc-set.on'), '205 lb × 7 reps', 'the last logged set is the default');
await page.click('.fc-set >> nth=0');
has(await page.textContent('.fc-set.on'), '200 lb × 8 reps', 'tapping a set picks it');
await page.fill('[data-fc="q"]', 'Is my lower back rounding?');

/* ================= 3. a real clip goes in; frames, not video, come out ================= */
await page.setInputFiles('input[data-fc="file"]', file(big));
ok(await resultUp(), 'a result sheet comes back');
eq(calls.length, 1, 'one request to Claude');
const body = calls[0].body, blocks = body.messages[0].content;
const imgs = blocks.filter(b => b.type === 'image'), texts = blocks.filter(b => b.type === 'text');
ok(imgs.length >= 8 && imgs.length <= 12, 'between 8 and 12 images are sent  [' + imgs.length + ']');
eq(imgs.length, 8, 'a 5 s clip gives the minimum, 8 frames');
ok(imgs.every(b => b.source.type === 'base64' && b.source.media_type === 'image/jpeg'), 'every image is a base64 JPEG');
ok(imgs.every(b => b.source.data.startsWith('/9j/')), 'every payload really is JPEG data (starts with the JPEG magic)');
const sizes = imgs.map(b => b.source.data.length);
ok(sizes.every(n => n > 1000 && n < 400000), 'each image is a sane size  [' + Math.min(...sizes) + '–' + Math.max(...sizes) + ' chars]');
eq(new Set(imgs.map(b => b.source.data)).size, imgs.length, 'the frames are all different (they come from across the clip)');
const dims = await Promise.all(imgs.map(b => LONG_EDGE(b.source.data)));
ok(dims.every(d => d && Math.max(d[0], d[1]) <= 1024), 'every frame decodes with its long edge at most 1024  [' + JSON.stringify(dims[0]) + ']');
eq(JSON.stringify(dims[0]), '[1024,576]', 'a 1280×720 clip comes down to 1024×576');
eq(blocks.indexOf(texts[0]), blocks.length - 1, 'the text block follows the images');
eq(texts.length, 1, 'one text block');
has(texts[0].text, 'Leg Press', 'the text names the exercise');
has(texts[0].text, 'set 1 of 3', 'the text says which set');
has(texts[0].text, '200 lb × 8 reps', 'the text gives the set\'s weight × reps');
has(texts[0].text, 'Is my lower back rounding?', 'the text carries the question');
has(texts[0].text, imgs.length + ' images', 'the text says how many frames there are');
ok(!JSON.stringify(body).includes('video/webm') && !JSON.stringify(body).includes('GkXf'), 'the video itself is not in the request (no webm media type or EBML header)');
ok(calls[0].bytes < 3.5e6, 'the whole request is a few MB at most  [' + (calls[0].bytes / 1e6).toFixed(2) + ' MB]');
console.log('  request: ' + imgs.length + ' frames, ' + (calls[0].bytes / 1e6).toFixed(2) + ' MB, avg frame ' + Math.round(sizes.reduce((a, b) => a + b) / sizes.length / 1024) + ' KB (base64)');
eq(body.output_config.effort, 'high', 'effort is high');
eq(body.max_tokens, 16000, 'max_tokens is generous');
const sch = body.output_config.format && body.output_config.format.schema;
eq(body.output_config.format.type, 'json_schema', 'a JSON schema is sent');
ok(sch && sch.additionalProperties === false && sch.required.length === Object.keys(sch.properties).length, 'schema: no extra fields, all fields required');
const item = sch.properties.cues.items;
ok(item.additionalProperties === false && item.required.length === Object.keys(item.properties).length, 'schema: cues are closed objects with every field required');
eq(JSON.stringify(sch.properties.verdict.enum), '["looks_good","adjust","cant_judge"]', 'schema: the three verdicts');
const sys = typeof body.system === 'string' ? body.system : JSON.stringify(body.system);
has(sys, 'visible in the frames', 'system prompt: only what is visible');
has(sys, 'at most 3 cues', 'system prompt: at most 3 cues');
has(sys, 'no diagnosis', 'system prompt: no diagnosis');
has(sys, 'stop the exercise and see a doctor', 'system prompt: stop and see a professional');
has(sys, 'weight chosen', 'system prompt: leave weight selection and programming to the app');
has(sys, 'film_tip', 'system prompt: says how to re-film');

/* ---- the result sheet ---- */
t = await sheetText();
has(await page.textContent('[data-fc="verdict"]'), 'Worth adjusting', 'result: the verdict');
has(t, 'torso stays upright', 'result: the summary');
eq(await page.$$eval('.fc-cue', c => c.length), 3, 'result: three cues');
has(t, 'Push your knees out over your toes', 'result: the first cue, most important first');
has(await page.textContent('[data-fc="tip"]'), 'level with your hips', 'result: the filming tip');
ok(await page.$('[data-fc="safety"]') === null, 'result: no safety banner when there is nothing to flag');
eq(await page.$$eval('.fc-th', n => n.length), imgs.length, 'result: a thumbnail per frame');
has(t, 'range of motion', 'result: says what it can judge');
has(t, "can't judge tempo or bracing", 'result: says what it can\'t judge');
has(t, 'second angle', 'result: ...including needing another angle');
has(await page.textContent('[data-fc="cost"]'), 'This check used 9,000 tokens in and 2,000 out — about $0.08 on claude-opus-5-5.', 'result: the cost line is worked out from the reported usage ($4/$20 per M)');
has(t, 'Saved as text on this lift', 'result: says only text is kept');
await page.click('.fc-cue >> nth=0 >> [data-fcf]');
const bigSrc = await page.getAttribute('[data-fc="big"] img', 'src');
eq(bigSrc, 'data:image/jpeg;base64,' + imgs[2].source.data, 'a cue\'s "frame 3" link shows frame 3 enlarged');
ok((await page.getAttribute('.fc-th >> nth=2', 'class')).includes('on'), '...and marks its thumbnail');
await page.click('.fc-th >> nth=2');
ok(!(await page.isVisible('[data-fc="big"]')), 'tapping the open thumbnail closes the preview');

/* ---- saved as text, no pictures anywhere, workout untouched ---- */
st = await getS();
const fcRec = st.active.exercises[0].formCheck;
ok(fcRec && fcRec.verdict === 'adjust' && fcRec.summary.includes('torso') && fcRec.cues.length === 3 && fcRec.model === 'claude-opus-5-5' && fcRec.ts > 0 && fcRec.set === 1,
  'ex.formCheck saved: verdict, summary, cues, model, ts, set');
ok(st.active.exercises[1].formCheck === undefined, 'the other lift has none');
const store = await noImage();
ok(!store.includes('/9j/') && !store.includes('data:image') && !/base64/i.test(store), 'nothing image-like is anywhere in localStorage');
ok(store.length < 200000, 'and the log stayed small  [' + store.length + ' chars]');
ok(JSON.stringify(fcRec).length < 1500, 'the record is a few hundred bytes of text  [' + JSON.stringify(fcRec).length + ']');
ok(await row.evaluate(el => el.isConnected), 'the set rows were not rebuilt (trap 1)');
eq(await page.inputValue(`${card(0)} >> .set >> nth=0 >> input[data-f="w"]`), '200', 'what was logged is still in the boxes');
await page.click('[data-fc="done"]');
eq(await page.evaluate(() => window.__mut), 0, '#view was not touched at any point of the flow (menu, sheet, request, save)');
ok(!(await hasSheet()), 'Done closes the sheet');

/* ---- again: the last result is mentioned, and "another clip" works ---- */
await openFormCheck();
has(await sheetText(), 'Last check on this lift today: Worth adjusting', 'reopening mentions the check already made');
await page.click('[data-fcset="0"]');
reply = { verdict:'looks_good', summary:'Smooth and controlled in these frames.', cues:[], film_tip:'', safety:'' };
await page.setInputFiles('input[data-fc="file"]', file(portrait));
ok(await resultUp(), 'second check completes');
const c2 = calls[1].body.messages[0].content, i2 = c2.filter(b => b.type === 'image');
const d2 = await LONG_EDGE(i2[0].source.data);
eq(JSON.stringify(d2), '[360,640]', 'a clip already under 1024 px is not scaled up');
has(c2[c2.length - 1].text, 'No set has been logged', 'a clip with no set picked says so');
has(await page.textContent('[data-fc="verdict"]'), 'Looks good', 'looks_good verdict shown');
has(await sheetText(), 'Nothing to change', 'looks_good with no cues says nothing to change');
ok(await page.$('[data-fc="tip"]') === null, 'empty filming tip is not shown');
st = await getS();
ok(st.active.exercises[0].formCheck.verdict === 'looks_good' && st.active.exercises[0].formCheck.cues.length === 0 && !st.active.exercises[0].formCheck.set,
  'the newest check replaces the old one on the lift');
await page.click('[data-fc="another"]');
await page.waitForSelector('input[data-fc="file"]', { state:'attached' });
ok(true, '"Check another clip" goes back to the picker');
await page.click('[data-fc="close"]');

/* ================= 4. safety is prominent ================= */
reply = { verdict:'adjust', summary:'Your left knee gives way sideways in frame 4.',
  cues:[{ cue:'Stop the set and rest', why:'The knee buckles.', frame:4 }], film_tip:'',
  safety:'If that knee hurts, stop and see a doctor or physiotherapist before you load it again.' };
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(portrait));
ok(await resultUp(), 'safety check completes');
const sb = await page.$('[data-fc="safety"]');
ok(sb !== null, 'a safety note gets its own banner');
const order = await page.evaluate(() => {
  const s = document.querySelector('[data-fc="safety"]'), f = document.querySelector('[data-fc="strip"]'), u = document.querySelector('[data-fc="summary"]');
  return [s.compareDocumentPosition(f) & 4, s.compareDocumentPosition(u) & 4];
});
ok(order[0] && order[1], 'the safety banner sits above the pictures and the summary');
has(await page.textContent('[data-fc="safety"]'), 'see a doctor or physiotherapist', 'its text is shown');
// 320 px, full result
await page.setViewportSize({ width:320, height:740 });
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: the result sheet has no sideways page scroll');
ok(await page.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth <= s.clientWidth; }), '320 px: nothing in the result sheet overflows it');
await page.setViewportSize({ width:390, height:844 });
await page.click('[data-fc="done"]');

/* ================= 5. things going wrong ================= */
const before = JSON.stringify((await getS()).active.exercises.map(e => e.sets));
async function failWith(m, wantText, label, f = portrait) {
  mode = m;
  const n = calls.length;
  await openFormCheck();
  await page.setInputFiles('input[data-fc="file"]', file(f));
  ok(await errorUp(), label + ': an error screen appears');
  has(await page.textContent('[data-fc="err"]'), wantText, label + ': says so');
  return n;
}
let n = await failWith('refusal', 'declined', 'refusal');
await page.click('[data-fc="again"]');
await page.waitForSelector('input[data-fc="file"]', { state:'attached' });
ok(true, '"Try again" returns to the picker');
await page.click('[data-fc="close"]');
await failWith('abort', 'reach', 'network down'); await page.click('[data-fc="close"]');
await failWith('401', 'key was rejected', '401'); await page.click('[data-fc="close"]');
await failWith('cutoff', 'cut off', 'cut-off answer'); await page.click('[data-fc="close"]');
await failWith('garbage', "didn't come back in the expected shape", 'unparseable answer'); await page.click('[data-fc="close"]');
mode = 'ok';
// undecodable video: no request at all
n = calls.length;
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(Buffer.from('this is not really an mp4 file, just text '.repeat(200)), 'broken.mp4', 'video/mp4'));
ok(await errorUp(), 'an undecodable video: an error screen appears');
has(await page.textContent('[data-fc="err"]'), "couldn't read that video", 'undecodable: says the browser couldn\'t read it');
has(await page.textContent('[data-fc="err"]'), 'format', 'undecodable: hints at the format');
eq(calls.length, n, 'undecodable: nothing was sent');
await page.click('[data-fc="again"]');
await page.setInputFiles('input[data-fc="file"]', file(Buffer.from('hello'), 'notes.txt', 'text/plain'));
ok(await errorUp(), 'a non-video file: an error screen appears');
has(await page.textContent('[data-fc="err"]'), "isn't a video", 'non-video: says so');
await page.click('[data-fc="again"]');
await page.setInputFiles('input[data-fc="file"]', file(tiny));
ok(await errorUp(), 'a 1 s clip: an error screen appears');
has(await page.textContent('[data-fc="err"]'), 'too short', 'too short: says so');
eq(calls.length, n, 'too short: nothing was sent');
await page.click('[data-fc="close"]');
const after = JSON.stringify((await getS()).active.exercises.map(e => e.sets));
eq(after, before, 'through all of that, the sets of the workout in progress are untouched');
eq((await getS()).active.exercises[0].formCheck.verdict, 'adjust', '...and failures did not overwrite the last good check');

/* ================= 6. a long video is capped, and says so ================= */
reply = REPLY;
const times = c => c[c.length - 1].text.match(/taken at ([\d., ]+) seconds/)[1].split(',').map(Number);
const last = () => calls[calls.length - 1].body.messages[0].content;
// 31 s: one frame about every 3 s, 10 of them
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(await p31));
ok(await resultUp(), 'a 31 s clip works');
let cl = last();
eq(cl.filter(b => b.type === 'image').length, 10, 'a 31 s clip gives 10 frames');
let tt = times(cl);
ok(tt[0] > 0 && tt[0] < 1 && tt[9] > 29.5 && tt[9] < 31 && tt.every((v, i) => i === 0 || v > tt[i - 1]), 'frames run from just after the start to just before the end, in order  [' + tt[0] + ' … ' + tt[9] + ']');
ok(!(await sheetText()).includes('only the first'), 'a clip under the cap is not reported as cut');
await page.click('[data-fc="done"]');
// 66 s: over the 60 s cap
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(await p66));
ok(await resultUp(), 'a 66 s clip still works');
cl = last();
eq(cl.filter(b => b.type === 'image').length, 12, 'a long clip gives the maximum, 12 frames');
has(cl[cl.length - 1].text, 'only its first 60 seconds were sampled', 'the request says the clip was cut');
has(await sheetText(), 'only the first 60 s was read', 'the result sheet says so too');
tt = times(cl);
ok(tt[0] < 1 && tt[11] > 58 && tt[11] <= 60, 'frames are spread over the first 60 s  [' + tt[0] + ' … ' + tt[11] + ']');
await page.click('[data-fc="done"]');

/* ================= 7. closing the sheet mid-request, and cancelling ================= */
delay = 1500;
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(portrait));
await page.waitForSelector('[data-fc="prog"]');
ok(await waitFor(async () => (await page.textContent('[data-fc="prog"]')).includes('Asking Claude')), 'while waiting it says it is asking Claude');
await page.mouse.click(195, 30);                                   // the backdrop above the sheet
ok(!(await hasSheet()), 'the sheet can be closed while the request runs');
await page.fill(`${card(1)} >> .set >> nth=0 >> input[data-f="w"]`, '35');   // keep training meanwhile
ok(await waitFor(async () => (await page.$('.toast.act')) !== null), 'when it finishes, a note says the check is ready');
has(await page.textContent('.toast.act'), 'Form check ready: Leg Press', 'the note names the lift');
eq((await page.textContent('.toast.act button')).trim(), 'View', 'with a View button');
await page.click('.toast.act button');
ok(await resultUp(), 'View opens the result');
await page.click('[data-fc="done"]');
eq(await page.inputValue(`${card(1)} >> .set >> nth=0 >> input[data-f="w"]`), '35', 'what was typed meanwhile is still there');
// cancel
const nBefore = (await getS()).active.exercises[0].formCheck.ts;
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(portrait));
await page.waitForSelector('[data-fc="cancel"]');
await page.click('[data-fc="cancel"]');
ok(!(await hasSheet()), 'Cancel closes the sheet');
await page.waitForTimeout(2600);
eq((await getS()).active.exercises[0].formCheck.ts, nBefore, 'a cancelled check saves nothing when its answer arrives');
ok(await page.$('.toast.act') === null, '...and shows no note');
delay = 0;
// a second tap on the menu while one is in flight shows that one
delay = 1200;
await openFormCheck();
await page.setInputFiles('input[data-fc="file"]', file(portrait));
await page.waitForSelector('[data-fc="prog"]');
await page.mouse.click(195, 30);
await openFormCheck();
ok(await page.$('[data-fc="prog"]') !== null, 'opening Form check again while one runs shows the one in flight, not a second');
await resultUp();
await page.click('[data-fc="done"]');
delay = 0;

/* ================= 8. history shows it; the pictures are gone ================= */
await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
await page.click('[data-tab="progress"]');
await page.click('#view .sess >> nth=0');
await page.waitForSelector('.sheet');
const hs = await sheetText();
has(hs, 'Form check', 'history: the session shows the form check');
has(hs, 'Worth adjusting', 'history: with its verdict');
has(hs, 'knees drift inward', 'history: and the summary');
has(hs, 'Push your knees out over your toes', 'history: and the cues');
eq(await page.$$eval('.sheet .fc-hist', n => n.length), 1, 'history: only on the lift that was checked');
st = await getS();
ok(st.sessions[0].exercises[0].formCheck && st.sessions[0].exercises[0].formCheck.cues.length === 3, 'the saved session keeps ex.formCheck');
ok(!(await noImage()).includes('/9j/'), 'still no image data in localStorage after the session is saved');
await page.click('.sheet [data-x="edit"]');                        // editing a session must not drop the record
await page.waitForSelector('.sheet [data-x="save"]');
await page.click('.sheet [data-x="save"]');
await page.waitForTimeout(300);
ok((await getS()).sessions[0].exercises[0].formCheck !== undefined, 'editing the session keeps the form check');

/* ================= 9. 320 px: setup sheet with many long set labels ================= */
await page.setViewportSize({ width:320, height:740 });
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
for (let i = 0; i < 3; i++) await logSet(0, i, 1000 + i, 12);
await openFormCheck();
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: the picker sheet has no sideways page scroll');
ok(await page.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth <= s.clientWidth; }), '320 px: nothing in the picker overflows the sheet');
await page.click('[data-fc="close"]');
await page.evaluate(() => localStorage.removeItem('ironlog.ai'));
await openFormCheck();
ok(await page.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth <= s.clientWidth && document.documentElement.scrollWidth <= innerWidth; }), '320 px: the "needs Claude" sheet fits');
await page.click('[data-fc="close"]');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t40 form check');
await browser.close();
