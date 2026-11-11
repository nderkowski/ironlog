/* Which prescriptions did a change make? Compares two replay.json files (replay.mjs, run once on the
   old build and once on the new) exposure by exposure and writes replay-diff.txt next to them: the
   date, lift, what changed (load, reps, kind) and the old and new why-text. With --no-weights the
   numbers are blanked (aggregates and kinds only, for anything that leaves the machine).
   Usage: node tools/review/replay-diff.mjs <old.json> <new.json> [--no-weights]  */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const [oldF, newF] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const NOW = process.argv.includes('--no-weights');
const A = JSON.parse(readFileSync(oldF, 'utf8')), B = JSON.parse(readFileSync(newF, 'utf8'));
const key = r => r.sid + '|' + r.ei;
const old = new Map(A.map(r => [key(r), r]));
const lines = [], kinds = {};
let n = 0, changed = 0;
for (const r of B) {
  const o = old.get(key(r)); if (!o) continue; n++;
  const a = o.now.p, b = r.now.p;
  const dw = String(a.w) !== String(b.w), dr = String(a.r) !== String(b.r), dk = a.kind !== b.kind, dwhy = a.why !== b.why;
  if (!(dw || dr || dk)) continue;
  changed++;
  const tag = a.kind + ' -> ' + b.kind;
  kinds[tag] = (kinds[tag] || 0) + 1;
  const num = x => NOW ? '' : ' ' + x;
  lines.push(r.date + '  ' + r.lift + '  [' + [dw ? 'load' : '', dr ? 'reps' : '', dk ? 'kind' : ''].filter(Boolean).join('+') + ']  ' + tag + (r.scheme === 'topback' ? '  (topback)' : '') +
    '\n    old' + num(a.w + 'x' + a.r) + ': ' + (a.why || '(no text)') + '\n    new' + num(b.w + 'x' + b.r) + ': ' + (b.why || '(no text)') +
    (NOW ? '' : '\n    he did ' + r.done.W + ' x ' + r.done.sets.map(s => s.r).join(',')));
}
const head = n + ' exposures compared, ' + changed + ' changed\n' + Object.entries(kinds).map(([k, c]) => '  ' + c + '  ' + k).join('\n') + '\n\n';
writeFileSync(join(dirname(newF), 'replay-diff.txt'), head + lines.join('\n') + '\n');
console.log(head + (NOW ? '' : ''));
