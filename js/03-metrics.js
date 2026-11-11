"use strict";
/* ============================ metrics ============================
   0 = reps (the default, and what every calculation used to assume)
   1 = time     — `r` holds seconds
   2 = distance — `r` holds distance in whatever unit you already think in
   `r` is reused rather than adding a field, so every input, stepper and
   history record keeps working unchanged; only its meaning moves.
   ================================================================= */
function metricOf(ex){ return num(ex&&ex.metric)||0; }
function metricNoun(m){ return m===1?"seconds":m===2?"distance":"reps"; }
function metricShort(m){ return m===1?"secs":m===2?"dist":"reps"; }
function metricJoin(m){ return m===0?"×":"for"; }
function metricStep(m){ return m===0?1:5; }
function metricSuffix(m){ return m===1?"s":""; }
/* Reps get Epley. Time and distance have no 1RM, so the comparable number is
   the work itself, scaled by load so a heavier carry still counts as harder.
   max(load,1) keeps an unloaded plank on its own seconds. */
function setScore(s,m){
  if(m===1||m===2) return num(s.r)*Math.max(loadOf(s),1);
  return e1rm(loadOf(s),num(s.r));
}
function scoreLabel(m){ return m===1?"best hold":m===2?"best distance":"e1RM"; }

function bestScore(name){
  var best=0;
  exSessions(name).forEach(function(s){
    s.sets.forEach(function(x){ best=Math.max(best,setScore(x,s.metric)); });
  });
  return best;
}
function sessionTopScore(s){
  var b=0; s.sets.forEach(function(x){ b=Math.max(b,setScore(x,s.metric)); }); return b;
}
/* Volume is weight × reps, which is only defined for rep work. A plank or a
   carry contributes nothing to a pound total rather than a fabricated one. */
function sessionVolume(sets,m){
  if(num(m)) return 0;
  var v=0;
  (sets||[]).forEach(function(x){ if(x.done!==false&&!x.warm) v+=loadOf(x)*num(x.r); });
  return v;
}
function exVolume(e){ return sessionVolume(e.sets,metricOf(e)); }
/* ---- week variants ----
   A day holds variants[]; one variant is the old behaviour. Two rotations run
   independently: which *day* is next (nextRoutine) and which *week* that day
   is on (nextVariantIx). Finishing Day A week 1 must advance Day A to week 2
   while the day rotation moves on to B, so they are never collapsed into one
   modulo. Both are derived from history — there is no stored counter to drift. */
function variantsOf(r){ return (r&&r.variants)||[]; }
function variantAt(r,ix){
  var v=variantsOf(r); if(!v.length) return null;
  return v[Math.max(0,Math.min(num(ix)||0,v.length-1))];
}
function planExOf(r,ix){ var v=variantAt(r,ix); return v?v.exercises:[]; }
/* The variant the in-progress session was started from. Falls back to the
   first, so a session started before variants existed still has a home. */
function activeVariant(r){
  if(!S.active||!r) return null;
  return variantsOf(r).find(function(v){ return v.id===S.active.variantId; })||variantAt(r,0);
}
/* Label for display. Unlabelled variants are numbered, so a day that has just
   gained a second week reads "Week 1 / Week 2" without anyone naming them. */
function variantLabel(r,ix){
  var v=variantAt(r,ix); if(!v) return "";
  if(v.label) return v.label;
  return variantsOf(r).length>1?("Week "+(num(ix)+1)):"";
}
/* Which week of this day comes next. Reads the most recent session of this
   routine and flips; an unknown or deleted variant restarts at the first. */
function nextVariantIx(r){
  var vs=variantsOf(r);
  if(vs.length<2) return 0;
  for(var i=0;i<S.sessions.length;i++){
    var s=S.sessions[i];
    if(s.routineId!==r.id) continue;
    var ix=vs.findIndex(function(v){ return v.id===s.variantId; });
    return ix<0?0:(ix+1)%vs.length;
  }
  return 0;
}
/* Every plan exercise in the whole split, across every variant. Anything that
   asks "what lifts am I training" — muscle tags, tracked lifts, renames, the
   straight-sets count — has to span variants or it judges the block on half
   the plan. */
/* `opts.backup` also walks the plan kept by Settings → Workout plan
   (S.planBackup), for the edits that must reach it too — a rename or a unit
   conversion that skipped it made "Switch back" restore a lift cut off from
   its history, or a 45 kg bar. Everything that asks what is being trained
   now leaves it out, which is why it is opt-in. */
function eachPlanEx(fn,opts){
  var days=S.routines;
  if(opts&&opts.backup&&S.planBackup&&Array.isArray(S.planBackup.routines))
    days=days.concat(S.planBackup.routines);
  days.forEach(function(r){
    variantsOf(r).forEach(function(v,vi){
      (v.exercises||[]).forEach(function(e,ei){ fn(e,r,v,vi,ei); });
    });
  });
}
function planIsEmpty(){
  var any=false;
  eachPlanEx(function(){ any=true; });
  return !any;
}

function allExerciseNames(){
  var seen={},out=[];
  S.sessions.forEach(function(s){ s.exercises.forEach(function(e){
    var k=normName(e.name); if(!seen[k]){ seen[k]=1; out.push({name:e.name,ts:s.ts}); }
  });});
  eachPlanEx(function(e){
    var k=normName(e.name); if(!seen[k]){ seen[k]=1; out.push({name:e.name,ts:0}); }
  });
  return out.sort(function(a,b){ return b.ts-a.ts; });
}

/* Walk the whole history in order and re-flag PRs. Run after any edit,
   otherwise a corrected typo leaves a phantom record behind. */
function recomputePRs(){
  var best={};
  S.sessions.slice().sort(function(a,b){ return a.ts-b.ts; }).forEach(function(s){
    s.exercises.forEach(function(e){
      var k=normName(e.name);
      e.sets.forEach(function(x){
        if(x.warm||x.done===false){ x.pr=false; return; }
        var v=setScore(x,metricOf(e)), prev=best[k]||0;
        x.pr=prev>0&&v>prev+0.01;
        if(v>prev) best[k]=v;
      });
    });
  });
}

/* ---- trend / stall detection ---- */
/* How many sessions one double-progression cycle takes: climb from the bottom
   of the range to the top, then the load steps and reps reset. Straight sets
   have no cycle, so 1. Read from the plan first, then from history, so a lift
   that has been dropped from the plan still scores sensibly. */
function cycleOf(name){
  var k=normName(name), lo=0, top=0;
  eachPlanEx(function(e){
    if(top||normName(e.name)!==k) return;
    lo=num(e.reps); top=num(e.repTop);
  });
  if(!(top>lo)){
    lo=0; top=0;
    for(var i=0;i<S.sessions.length&&!(top>lo);i++){
      S.sessions[i].exercises.forEach(function(e){
        if(top>lo||normName(e.name)!==k) return;
        lo=num(e.reps); top=num(e.repTop);
      });
    }
  }
  return (top>lo&&lo>0)?(top-lo+1):1;
}

/* Is this lift moving.

   This used to be the mean of the last 3 sessions against the 3 before, and it
   was measuring the wrong thing. Under double progression e1RM *sawtooths* —
   reps climb from the bottom of the range to the top, then the load steps and
   reps reset, dropping the score back. A 3-vs-3 mean straddling that reset
   reads the phase of the sawtooth, not the trend.

   On a simulated flawless run — never a missed rep — it reported "down" at
   8–12 × 185 (−2.6%), 6–10 × 185 (−2.8%), 8–15 × 135 (−8.3%) and 8–20 × 100
   (−16.6%), and it got *worse the stronger you got*, because a fixed 5 lb step
   is a shrinking fraction of the load while the rep climb is not. "down" is
   what makes prescribe() cut 10% off the bar, so the engine could back off
   someone doing everything right, and deloadCheck() counts flat and down as
   stalled.

   A least-squares slope over a window guaranteed to contain a whole cycle has
   no phase to read. Scaled to "% per 3 sessions" so the ±1.5 / −2 thresholds
   keep the calibration they were tuned with. Verified against the same
   simulations: every false "down" above becomes flat or up, it survives ±1 rep
   of session-to-session noise, and a genuine 2%-per-session decline still
   reports −6.5% and a genuine stall −0.1%. */
/* What a session says about strength, for the trend only (PR board and
   charts keep sessionTopScore). A rep-out set is taken near failure, so its
   score is the honest one and it has no double-progression sawtooth. Without
   one, only sets at the working load count: a single test set at 170 between
   two at 150 held Lat Pulldown on "Already backed off" for two sessions. */
function trendScore(s){
  var w=workLoad(s.sets,s.bw), b=0;
  s.sets.forEach(function(x){ if(isAt(x,w,s.bw)) b=Math.max(b,setScore(x,s.metric)); });
  /* A real rep-out is the session's best set. One that isn't was not pushed
     — the flag is set by position at save, not by effort — and scoring it
     would read an easy last set as a decline (it cut a simulated lifter a
     third time, below his true 8RM). So take whichever says more. */
  var out=s.sets.filter(function(x){ return x.out; });
  if(out.length) b=Math.max(b,setScore(out[out.length-1],s.metric));
  return b||sessionTopScore(s);
}
/* A load drop the lifter chose — not one the app prescribed (kind "deload")
   — is a reset, not a decline. The trend starts after it, so going 65 → 55
   by choice doesn't read as "slipping" for the next nine sessions. Newest
   first in, newest first out.
   2.0: a drop is a reset only if the lifter stayed there. One light day
   followed by a session back at the old load (or heavier) is a bad day, not a
   new baseline, and no longer restarts the trend. */
function sinceChosenDrop(h){
  for(var i=0;i+1<h.length;i++){
    var a=workLoad(h[i].sets,h[i].bw), b=workLoad(h[i+1].sets,h[i+1].bw);
    /* Only when the session recorded what the app prescribed: a log without
       it (old, hand-built) can't tell a choice from a decline, so it keeps
       its whole history. */
    if(heavierLoad(b,a,h[i].bw)&&h[i].kind&&h[i].kind!=="deload"){
      var back=false;
      for(var j=0;j<i;j++) if(!heavierLoad(b,workLoad(h[j].sets,h[j].bw),h[j].bw)) back=true;   // newer, at b or heavier
      if(!back) return h.slice(0,i+1);
    }
  }
  return h;
}
function trendAt(name,win){
  var h=sinceChosenDrop(exWorkingP(name,planExByName(name)||{}));
  if(h.length<4) return {state:"new",n:h.length,pct:0};
  var vals=h.slice(0,win).map(trendScore).reverse();   // oldest first
  var n=vals.length;
  var ym=vals.reduce(function(x,y){ return x+y; },0)/n;
  if(!ym) return {state:"new",n:h.length,pct:0};
  var xm=(n-1)/2, sxy=0, sxx=0;
  for(var i=0;i<n;i++){ sxy+=(i-xm)*(vals[i]-ym); sxx+=(i-xm)*(i-xm); }
  if(!sxx) return {state:"new",n:h.length,pct:0};
  var pct=(sxy/sxx)/ym*100*3;
  return {state: pct>=1.5?"up":(pct<=-2?"down":"flat"), n:h.length, pct:pct};
}
/* How many sessions the card's verdict is computed from. Named because
   prescribe()'s back-off guard has to use the same window: a guard shorter
   than the signal it guards expires while the signal is still firing, which is
   how the app used to cut 10% off the bar again and again. */
function trendWin(name){ return Math.max(6,cycleOf(name)+3); }
function trend(name){ return trendAt(name,trendWin(name)); }

/* The deload question needs a longer horizon than the card chip, and the
   reason is worth understanding before anyone "simplifies" this back to one
   function.

   Over a short window the slope still depends a little on where in the rep
   cycle you happen to be. Simulated across every plausible range and load, a
   flawless run dips as low as −0.37% at its worst phase — while a genuine
   stall reads exactly 0.00%. The two overlap, so no threshold on the short
   window can separate "progressing slowly" from "not progressing". Over
   2 cycles the phase washes out: flawless never drops below +0.35%, a stall is
   still 0.00%, and `pct <= 0` splits them cleanly.

   The short window is right for the card, where the question is "what is this
   lift doing lately". The long one is right here, where the answer starts
   nagging you to take a week off. */
function trendLong(name){ return trendAt(name,Math.max(10,2*cycleOf(name)+3)); }
/* The plan's own entry for a lift, whichever day or week it lives in. What
   prescribe() needs to answer "and what happens next time" anywhere the name
   is all you have. */
function planExByName(name){
  var k=normName(name), found=null;
  eachPlanEx(function(e){ if(!found&&normName(e.name)===k) found=e; });
  return found;
}
/* Spans every variant: judging the block on half the plan because the other
   week's lifts weren't counted would make deloadCheck() nonsense. */
function trackedLifts(){
  var seen={},out=[];
  eachPlanEx(function(e){
    var k=normName(e.name); if(!seen[k]){ seen[k]=1; out.push(e.name); }
  });
  return out;
}
/* Past this width the long window stops washing the cycle phase out, and no
   threshold can separate "progressing slowly" from "not progressing". Measured
   on flawless runs at 185/225/315/405, worst phase: cycle 7 reads +0.27%,
   cycle 8 +0.15%, cycle 9 +0.02%, cycle 10 −0.05%. A stall reads exactly 0.00,
   so from cycle 9 the two classes touch. Every default tier (5–8, 8–12, 12–16)
   is far inside this; it only bites a range widened by hand. */
var DELOAD_MAX_CYCLE=8;
/* Everything deloadCheck() looked at and what it concluded, so the Progress
   tab can say what it is watching instead of going silent. */
function deloadStatus(){
  var judged=[], stalled=[], waiting=0, wide=[];
  trackedLifts().forEach(function(n){
    if(cycleOf(n)>DELOAD_MAX_CYCLE){ wide.push(n); return; }
    var t=trendLong(n);
    /* Six sessions before this gets an opinion. Below that the long horizon
       collapses to the short one and the phase problem comes back. */
    if(t.state==="new"||t.n<6){ waiting++; return; }
    judged.push(n);
    /* Not the "up" label — that band includes real but slow progress, and
       counting it as stalled is how a working plan gets told to deload. */
    if(t.pct<=0) stalled.push({name:n,t:t});
  });
  return {judged:judged,stalled:stalled,waiting:waiting,wide:wide,
          tracked:judged.length+waiting+wide.length};
}
function deloadCheck(){
  if(inDeloadWeek()) return null;
  if(Date.now()<(S.settings.deloadSnooze||0)) return null;
  var st=deloadStatus();
  if(st.judged.length<3) return null;
  var ratio=st.stalled.length/st.judged.length;
  if(ratio>=0.6) return {level:"high",stalled:st.stalled,judged:st.judged.length};
  if(ratio>=0.4) return {level:"watch",stalled:st.stalled,judged:st.judged.length};
  return null;
}

/* ---- deliberate deload ---- */
function inDeloadWeek(){ return Date.now()<(S.settings.deloadUntil||0); }
/* Deload sessions are left out of every trend (exWorking), so the moment a
   deload week ends deloadStatus() sees exactly the data that asked for it and
   asks again — simulated after an illness, 10.8 deload weeks in a year, 8.8 of
   them back to back. Stay quiet for three weeks after one, so there are new
   working sessions to judge. */
var DELOAD_QUIET=21*864e5;
function startDeloadWeek(days){
  S.settings.deloadUntil=Date.now()+(days||7)*864e5;
  S.settings.deloadSnooze=S.settings.deloadUntil+DELOAD_QUIET;
  writeNow();
}
function endDeloadWeek(){
  S.settings.deloadUntil=0;
  S.settings.deloadSnooze=Date.now()+DELOAD_QUIET;
  writeNow();
}

/* ============================ plates ============================
   `bar` on an exercise is the weight of the empty bar, and 0 means the
   exercise isn't a loaded barbell at all — that's the whole flag. The
   inventory is counted in PAIRS, because you load a bar symmetrically and
   thinking in pairs is what you actually do on the gym floor.
   ================================================================ */
function defaultPlates(u){
  return u==="kg"
    ? [{w:25,n:4},{w:20,n:1},{w:15,n:1},{w:10,n:2},{w:5,n:2},{w:2.5,n:2},{w:1.25,n:2}]
    : [{w:45,n:4},{w:35,n:1},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}];
}
function defaultBar(u){ return u==="kg"?20:45; }

/* ---- changing units ----
   Flipping lb → kg used to relabel and nothing else, so a 225 lb squat became
   a "225 kg" squat: every number in the log silently changed meaning, and the
   bar and plate inventory were left stranded in the old unit. Both readings of
   the switch are legitimate — "convert my log" and "the numbers were already
   kg, the label was wrong" — and the app cannot tell them apart, so it asks
   instead of guessing. Either way the bar and plates end up in the new unit,
   which is the half that was simply broken. */
var LB_PER_KG=0.45359237;

/* Reps, seconds and distance are not weights and are never touched. `load` is
   converted alongside `w` so the pair stays coherent — it is a resolved weight,
   not a derived-on-read value. */
function convertUnits(to){
  var f=(to==="kg")?LB_PER_KG:(1/LB_PER_KG);
  var oldBar=num(S.settings.bar);
  function cv(v){ var n=num(v); return n?round(n*f,1):n; }
  /* A bar that was the standard one snaps to the new standard: converting it
     gives a 20.4 kg bar, and plate maths against 20.4 with real kg plates is
     inexact on every single lift. A genuinely custom bar — a trap bar, a
     safety squat bar — is converted, because there is no standard to snap to. */
  function cvBar(v){
    var n=num(v);
    if(!n) return n;
    return (n===oldBar||n===defaultBar(to==="kg"?"lb":"kg"))?defaultBar(to):cv(n);
  }
  /* A session exercise also carries weights that aren't sets: last time's
     first set (behind "Keep") and what was prescribed (presc, and the old
     shadow of a log from before 2.0). Left behind, a mid-workout switch to kg
     made Keep fill 65 kg where 65 lb was meant. Stack weights are weights too. */
  function cvEx(e){
    e.inc=e.inc?cv(e.inc):e.inc; e.bar=cvBar(e.bar);
    if(e.startW) e.startW=cv(e.startW);          // the coach's suggested first weight is a weight too
    if(e.shadow&&num(e.shadow.w)) e.shadow.w=cv(e.shadow.w);
    if(e.presc&&num(e.presc.w)) e.presc.w=cv(e.presc.w);
    if(e.usual&&num(e.usual.w)) e.usual.w=cv(e.usual.w);
    if(Array.isArray(e.pins)&&e.pins.length) e.pins=cleanPins(e.pins.map(cv));
    if(e.lastW) e.lastW=cv(e.lastW);
  }
  function cvSets(sets){
    (sets||[]).forEach(function(s){
      if(s.w!==""&&s.w!==null&&s.w!==undefined) s.w=String(cv(s.w));
      if(s.load!==undefined&&s.load!==null) s.load=cv(s.load);
    });
  }
  S.sessions.forEach(function(sess){
    sess.bw=cv(sess.bw);
    sess.exercises.forEach(function(e){ cvEx(e); cvSets(e.sets); });
  });
  if(S.active){
    S.active.bw=cv(S.active.bw);
    S.active.exercises.forEach(function(e){ cvEx(e); cvSets(e.sets); });
  }
  eachPlanEx(cvEx,{backup:true});                 // the kept plan too, or Switch back brings a 45 kg bar
  coachState().proposals.forEach(function(p){ delete p.undo; });   // saved rows are in the old unit
  S.settings.bodyweight=cv(S.settings.bodyweight);
  S.settings.inc=cv(S.settings.inc)||defaultInc(to);
}
function defaultInc(u){ return u==="kg"?2.5:5; }

function setUnit(to,convert){
  /* A full snapshot, because this rewrites every weight in the log and an undo
     that re-derives would be a second chance to get the maths wrong. */
  var before=JSON.parse(JSON.stringify(S));
  if(convert) convertUnits(to);
  S.settings.unit=to;
  /* Both paths land the bar and plates in the new unit: converting gives you
     20.4 kg plates, which don't exist, and relabelling means the numbers were
     already in the new unit so a 45 "kg" bar was never right either. */
  S.settings.bar=defaultBar(to);
  S.settings.plates=defaultPlates(to);
  recomputePRs();
  writeNow(); viewPrefs();
  toastUndo(convert?("Log converted to "+to):("Now labelled "+to),function(){
    S=before; recomputePRs(); writeNow(); render();
    toast("Units put back");
  });
}

function unitSheet(from,to){
  var n=S.sessions.length;
  sheet('<h3>Switch to '+esc(to)+'?</h3>'+
    '<div class="sub">'+(n
      ? "You have "+plural(n,"session")+" logged in "+esc(from)+"."
      : "Your plan is set up in "+esc(from)+".")+
      ' The app can\'t tell which of these you mean, so it won\'t guess.</div>'+
    '<div class="menu">'+
      '<button data-x="conv"><b>Convert my log to '+esc(to)+'</b>'+
        '<span class="h">every weight ×'+(to==="kg"?"0.45":"2.2")+'</span></button>'+
      '<button data-x="label"><b>Just change the label</b>'+
        '<span class="h">numbers stay as they are</span></button>'+
    '</div>'+
    '<div class="tiny muted" style="margin:10px 0 0">Converting multiplies every logged weight, '+
      'so a '+(from==="lb"?"225 lb":"100 kg")+' lift reads '+(from==="lb"?"102.1 kg":"220.5 lb")+
      ' afterwards. Relabelling leaves the numbers alone — use it only if they were already in '+esc(to)+
      '. Either way your bar and plates are reset to the standard '+esc(to)+' set, and a backup file is '+
      'saved first. Ten seconds to undo.</div>'+
    '<button class="btn ghost block" style="margin-top:10px" data-x="cancel">Cancel</button>',
    function(el){
      function go(convert){
        /* Still inside the tap, which is what a download needs. */
        try{ downloadBackup(payload(),true); }catch(e){}
        closeSheet(); setUnit(to,convert);
      }
      $('[data-x="conv"]',el).onclick=function(){ go(true); };
      $('[data-x="label"]',el).onclick=function(){ go(false); };
      $('[data-x="cancel"]',el).onclick=function(){ closeSheet(); viewPrefs(); };
    });
}
function barOf(ex){ var b=num(ex&&ex.bar); return b>0?b:0; }
function plateInv(){
  return (S.settings.plates||[])
    .filter(function(p){ return num(p.w)>0&&num(p.n)>0; })
    .sort(function(a,b){ return num(b.w)-num(a.w); });
}

/* Greedy from the heaviest plate down, bounded by how many pairs you own.
   Greedy is optimal for every real plate set (each denomination divides the
   ones above it), and where it isn't we say so instead of pretending. */
function platesFor(target,bar){
  var per=(num(target)-num(bar))/2, out=[], got=0;
  if(!(per>0)) return {list:[],per:per,got:num(bar),exact:per===0};
  plateInv().forEach(function(p){
    var w=num(p.w), n=Math.min(num(p.n),Math.floor((per-got+1e-9)/w));
    if(n>0){ out.push({w:w,n:n}); got+=n*w; }
  });
  return {list:out,per:per,got:num(bar)+got*2,exact:Math.abs(got-per)<1e-9};
}

/* Everything on the set row's second line. Returns inner HTML only — the
   .plates node itself is never replaced, so nothing on the logging path loses
   DOM identity. The RPE chip re-enables pointer events on itself; the rest of
   the line stays inert so it can't steal a tap meant for the tick. */
function rowExtras(ex,s){
  var pl=plateHint(ex,s), rp="";
  if(S.settings.rpe&&s.done)
    rp='<button class="rpe'+(num(s.rpe)?" set":"")+'" data-act="rpe" aria-label="Rate how hard that set was">'+
      (num(s.rpe)?"RPE "+fmt(s.rpe):"RPE")+'</button>';
  if(!pl&&!rp) return "";              // keeps .plates:empty hiding the row
  return '<span class="ptext">'+pl+'</span>'+rp;
}

/* The plate line. Returns inner HTML only. */
function plateHint(ex,s){
  var bar=barOf(ex);
  if(!bar||bwMode(ex)!==0) return "";
  var w=num(s.w);
  if(!w) return "";
  if(w<bar) return '<span class="off">under the '+fmt(bar)+' bar</span>';
  var r=platesFor(w,bar);
  if(!r.list.length) return '<span class="lb">SIDE</span>bar only';
  return '<span class="lb">SIDE</span>'+
    r.list.map(function(p){ return fmt(p.w)+(p.n>1?'<i>×'+p.n+'</i>':""); }).join("  ")+
    (r.exact?"":' <span class="off">= '+fmt(r.got)+'</span>');
}

/* ============================ muscle groups ============================
   `mg` is the main muscle (one, or "") and `mg2` is a list of helpers.
   A working set counts 1.0 toward the main muscle and 0.5 toward each helper.
   Full credit for everything is how volume trackers lie to you: three sets of
   bench would read as three chest AND three triceps AND three shoulders, and
   suddenly you're "doing" 40 triceps sets a week.
   ====================================================================== */
var MUSCLES=[
  {k:"chest",   n:"Chest"},
  {k:"back",    n:"Back"},
  {k:"traps",   n:"Traps"},
  {k:"front_delts",n:"Front delts"},
  {k:"side_delts", n:"Side delts"},
  {k:"rear_delts", n:"Rear delts"},
  {k:"biceps",  n:"Biceps"},
  {k:"triceps", n:"Triceps"},
  {k:"forearms",n:"Forearms"},
  {k:"quads",   n:"Quads"},
  {k:"hams",    n:"Hamstrings"},
  {k:"glutes",  n:"Glutes"},
  {k:"calves",  n:"Calves"},
  {k:"core",    n:"Abs"}
];
function muscleName(k){
  for(var i=0;i<MUSCLES.length;i++) if(MUSCLES[i].k===k) return MUSCLES[i].n;
  return "";
}
function isMuscle(k){ return !!muscleName(k); }

/* First match wins, so the order is the specification: "leg curl" has to be
   caught before "curl", "upright row" before "row". */
var MG_GUESS=[
  [/leg\s*curl|lying\s*curl|nordic|ham(string)?\s*curl/i, "hams",   []],
  [/rdl|romanian|good\s?morning|stiff.?leg/i,             "hams",   ["glutes","back"]],
  [/deadlift|dead\s*lift/i,                               "back",   ["hams","glutes","traps"]],
  [/hip\s*thrust|glute\s*(bridge|kick)|hyperextension|back\s*extension/i,"glutes",["hams"]],
  [/leg\s*extension|knee\s*extension/i,                   "quads",  []],
  [/squat|leg\s*press|lunge|step.?up|hack|sissy/i,        "quads",  ["glutes","hams"]],
  [/calf|calve|toe\s*press/i,                             "calves", []],
  [/shrug/i,                                              "traps",  []],
  [/front\s*raise/i,                                      "front_delts",[]],
  [/upright\s*row|lateral\s*raise|side\s*raise/i,         "side_delts",[]],
  [/rear\s*delt|face\s*pull|reverse\s*(fly|flye|pec)/i,   "rear_delts",["back","traps"]],
  [/overhead\s*press|\bohp\b|shoulder\s*press|military|arnold/i,"front_delts",["triceps"]],
  /* A fly is shoulder horizontal adduction with the elbow fixed: chest, with
     front delts helping, and no triceps. It shared the press row and handed
     triceps half a set per set of flies (external review, Argon). After the
     rear-delt row, so a reverse fly is still a rear delt. */
  [/\bfly\b|flye|pec\s*deck|\bpec\b/i,                 "chest",  ["front_delts"]],
  [/bench|chest\s*press|push.?up|\bdips?\b/i,           "chest",  ["triceps","front_delts"]],
  /* Generic presses, but only after the overhead and leg variants above have
     had their turn — and only when the word "press" is actually there, so
     "incline dumbbell curl" still falls through to biceps. */
  [/(incline|decline|floor|dumbbell|\bdb\b)[\w\s-]*press/i,"chest",["triceps","front_delts"]],
  [/pull.?up|chin.?up|pull.?down|lat\s*pull|pullover|\brow\b|rows/i,"back",["biceps"]],
  [/tricep|skull\s?crusher|push.?down|press.?down|kick.?back|jm\s*press|close.?grip/i,"triceps",[]],
  [/wrist\s*curl/i,                                       "forearms",[]],
  [/curl/i,                                               "biceps", ["forearms"]],
  [/wrist|\bgrip\b|farmer|hang(ing)?\s*hold/i,            "forearms",[]],
  [/plank|crunch|sit.?up|leg\s*raise|ab\s*(wheel|roll)|russian\s*twist|woodchop|pallof|\bcore\b|\babs?\b/i,"core",[]]
];
function guessMuscles(name){
  var n=String(name||"");
  for(var i=0;i<MG_GUESS.length;i++)
    if(MG_GUESS[i][0].test(n)) return {mg:MG_GUESS[i][1], mg2:MG_GUESS[i][2].slice()};
  return {mg:"", mg2:[]};
}

/* ---- how a movement wants to be programmed ----
   A cable curl and a deadlift do not want the same rep range, and everything
   used to arrive at the one global default. Ordered like MG_GUESS: first match
   wins, so specific patterns come before general ones. */
var MOVE_CLASS=[
  [/upright\s*row|leg\s*curl|leg\s*extension|knee\s*extension/i,          "iso"],
  [/calf|calve|toe\s*press|shrug/i,                                       "iso"],
  [/raise|\bfly\b|flye|pec\s*deck|rear\s*delt|face\s*pull|reverse\s*(fly|flye|pec)/i,"iso"],
  [/curl|push.?down|press.?down|kick.?back|skull|pullover|wrist|\bgrip\b/i,"iso"],
  [/crunch|sit.?up|ab\s*(wheel|roll)|russian\s*twist|woodchop|pallof/i,    "iso"],
  [/squat|deadlift|dead\s*lift|rdl|romanian|good\s?morning|stiff.?leg/i,  "heavy"],
  [/bench|chest\s*press|overhead\s*press|\bohp\b|shoulder\s*press|military/i,"heavy"],
  [/\brow\b|rows|pendlay|pull.?up|chin.?up|\bdips?\b/i,                   "heavy"]
];
/* Anything loaded by hand or off a stack is not a heavy barbell lift whatever
   the movement is called: a dumbbell bench press belongs in the middle tier. */
var MOVE_LIGHT=/dumbbell|\bdb\b|machine|cable|smith|hammer\s*strength|band|kettlebell|\bkb\b/i;

function movementClass(name){
  var n=String(name||"");
  for(var i=0;i<MOVE_CLASS.length;i++){
    if(!MOVE_CLASS[i][0].test(n)) continue;
    var c=MOVE_CLASS[i][1];
    return (c==="heavy"&&MOVE_LIGHT.test(n))?"compound":c;
  }
  return "compound";
}

/* The rep range a new exercise starts at.

   settings.repLow/repHigh stays the spec for an ordinary compound and the
   other tiers are derived from it, so one setting still steers the whole plan
   rather than the app growing three of them. Timed work is the exception: a
   plank measured in seconds has nothing to do with a rep count, and arriving
   as "8–12 seconds" was nonsense.

   Every one of these is a default, not a rule — the range is two taps away in
   the exercise's own menu. */
function defaultRange(name,met){
  var s=S.settings;
  var low=Math.max(1,num(s.repLow)||8);
  var top=Math.max(low+1,num(s.repHigh)||12);
  if(num(met)===1){ low=30; top=60; }
  else{
    var c=movementClass(name);
    if(c==="heavy"){ low=Math.max(1,low-3); top=Math.max(low+1,top-4); }
    else if(c==="iso"){ low=low+4; top=top+4; }
  }
  if(!s.doubleDefault) top=0;
  return {low:low, top:top, cls:num(met)===1?"time":movementClass(name)};
}
/* How much reps-first room a range gives. Used when fitting a range onto an
   exercise that already has a bottom you train at, where moving that bottom
   would quietly change the programme. */
function rangeWidth(name,met){
  var r=defaultRange(name,met);
  return Math.max(1,(r.top||r.low+4)-r.low);
}

/* Which of the two progressions an exercise is actually on, in words. The only
   signal used to be "range" versus "target" on the card, which is not a signal
   — an exercise silently running straight sets looks exactly like one that is
   climbing reps. */
function modeHint(ex){
  var met=metricOf(ex), n=metricNoun(met);
  var lo=Math.max(1,num(ex.reps)), tp=num(ex.repTop)||0;
  if(tp>lo)
    return "Climbing "+n+" from "+lo+" to "+tp+" before the weight goes up.";
  return "Straight sets — the weight goes up as soon as you hit "+lo+" "+n+
         " on every set. Fill the second box to climb "+n+" first.";
}

/* Every plan exercise is built here. This object literal used to be written
   out in five places and two of them quietly dropped bar, metric and the
   muscle tags — so an exercise promoted from a session lost its plate maths
   and stopped counting toward the right muscle. One constructor means the next
   field added to the model can't be forgotten in one of them. */
function newPlanEx(name){
  var last=lastPerf(name), mgN=tagsOf({name:name});
  var met=last?metricOf(last):guessMetric(name);
  var rng=defaultRange(name,met);
  /* With double progression off there is no range to sit in, so the single
     target follows what you last did rather than a setting. */
  var low=rng.top?rng.low:(last?num(last.sets[0].r)||rng.low:rng.low);
  return {
    id:uid(), name:name,
    sets:last?last.sets.length:3,
    reps:Math.max(1,low), repTop:rng.top,
    inc:null,
    bw:last?bwMode(last):0,
    bar:(last&&last.bar!==undefined)?barOf(last):guessBar(name),
    metric:met,
    link:false,
    mg:mgN.mg, mg2:(mgN.mg2||[]).slice(),
    scheme:"double", backPct:0.12, pins:[],     // schema v6: how the engine loads it; nothing reads them yet
    added:Date.now()          // when the row joined the plan; the coach's skipped-lift rule won't judge a row younger than its window
  };
}

/* Promoting an exercise you added mid-session into the plan. Carries every
   field the session copy holds, which is the half that kept getting missed. */
function planExFromSession(ex){
  return {
    id:uid(), name:ex.name,
    sets:Math.max(1,working(ex.sets).length),
    reps:Math.max(1,num(ex.reps)||num(ex.targetReps)||8),
    repTop:num(ex.repTop)||0,
    inc:ex.inc||null,
    bw:bwMode(ex), bar:barOf(ex), metric:metricOf(ex), link:!!ex.link,
    mg:ex.mg||"", mg2:(ex.mg2||[]).slice(),
    scheme:ex.scheme==="topback"?"topback":"double",
    backPct:(num(ex.backPct)>0&&num(ex.backPct)<0.5)?num(ex.backPct):0.12,
    pins:cleanPins(ex.pins),
    added:Date.now()
  };
}

/* Tags live on the exercise, but history logged before this feature has none —
   and a report that says "0 sets, ever" would be worse than useless. So an
   untagged exercise falls back to however that lift is tagged in the plan
   today, and failing that to the name guess. */
function mgIndex(){
  var idx={};
  eachPlanEx(function(e){
    if(e.mg||(e.mg2&&e.mg2.length)) idx[normName(e.name)]={mg:e.mg||"",mg2:e.mg2||[]};
  });
  return idx;
}
function tagsOf(ex,idx){
  if(ex.mg||(ex.mg2&&ex.mg2.length)) return {mg:ex.mg||"",mg2:ex.mg2||[]};
  var t=(idx||mgIndex())[normName(ex.name)];
  return t?t:guessMuscles(ex.name);
}
function tagLabel(t){
  if(!t.mg&&!t.mg2.length) return "";
  var s=t.mg?muscleName(t.mg):"—";
  if(t.mg2.length) s+=" + "+t.mg2.map(muscleName).filter(Boolean).join(", ");
  return s;
}

/* Sets per muscle over any list of sessions, the headline hypertrophy number.
   A set counts 1 for the main muscle and ½ for a helper. Deload sessions
   count here (you still did the sets); a caller that wants them out filters
   first. Contract for the coach and the block scorecard:
   setsByMuscleIn(sessions) returns {by, untagged}. */
function setsByMuscleIn(sessions){
  var idx=mgIndex(), out={}, untagged=0;
  MUSCLES.forEach(function(m){ out[m.k]=0; });
  (sessions||[]).forEach(function(s){
    s.exercises.forEach(function(e){
      var n=working(e.sets).filter(function(x){ return x.done!==false; }).length;
      if(!n) return;
      var t=tagsOf(e,idx);
      var main=isMuscle(t.mg)?t.mg:"";
      var sec=(t.mg2||[]).filter(isMuscle);
      if(!main&&!sec.length){ untagged+=n; return; }
      if(main) out[main]+=n;
      sec.forEach(function(k){ out[k]+=n*0.5; });
    });
  });
  return {by:out, untagged:untagged};
}
function setsByMuscle(a,b){
  return setsByMuscleIn(S.sessions.filter(function(s){ return s.ts>=a&&s.ts<b; }));
}

/* ---- targets and bands (2.0) ----
   `balIsMainRoutine` is local on purpose: the day-rotation helpers belong to
   another package. An optional day (the pump day) is extra, never a slot in
   the rotation, the frequency or the balance card. A session of a routine that
   no longer exists counts as a main one, as nextRoutine() does. */
function balIsMainRoutine(r){ return !r.optional; }
function balMainSessionFn(){
  var opt={};
  S.routines.forEach(function(r){ if(r.optional) opt[r.id]=1; });
  return function(s){ return !!s.routineId&&!opt[s.routineId]; };
}
/* Sessions a week the plan is built for: the setting if set; else the mean
   count of main-routine sessions (unlogged and deload included) per full Monday
   week over the last 8 full weeks that start on or after the first session's
   week, to the nearest half, 1 to 7; three with no full week to read. */
function targetFreqOf(){
  var tf=S.settings.targetFreq;
  if(typeof tf==="number"&&tf>=1&&tf<=7) return tf;
  return autoFreqOf();
}
/* What the log says, whatever the setting is (the "Auto" row of the picker). */
function autoFreqOf(){
  if(!S.sessions.length) return 3;
  var isMain=balMainSessionFn();
  var first=S.sessions.reduce(function(m,s){ return Math.min(m,s.ts); },Infinity);
  var d0=new Date(first); d0.setHours(0,0,0,0);
  var firstWk=new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()-((d0.getDay()+6)%7)).getTime();
  var starts=weekStarts(9).slice(0,8);              // the 8 full weeks before this one, oldest first
  var counts=[];
  starts.forEach(function(a){
    if(a<firstWk) return;
    var d=new Date(a), b=new Date(d.getFullYear(),d.getMonth(),d.getDate()+7).getTime();
    counts.push(S.sessions.filter(function(s){ return s.ts>=a&&s.ts<b&&isMain(s); }).length);
  });
  if(!counts.length) return 3;
  var mean=counts.reduce(function(a,b){ return a+b; },0)/counts.length;
  return Math.max(1,Math.min(7,Math.round(mean*2)/2));
}
/* Small muscles are judged against a lower band: 6–12 sets a week, the rest 9–16.
   The indirect ones (front delts, glutes, traps, forearms) get all the work they need
   from the big lifts: 3+ a week, no upper flag, never "low" at 3 or more. */
var BAND_SMALL=["core","rear_delts"];
var B2_INDIRECT=["front_delts","glutes","traps","forearms"];
function b2IsIndirect(k){ return B2_INDIRECT.indexOf(k)>=0; }
function bandOf(k){ return b2IsIndirect(k)?[3,Infinity]:BAND_SMALL.indexOf(k)>=0?[6,12]:[9,16]; }
/* The top of a band for scaling a bar: an open-ended band has none, so its floor. */
function b2BandCap(k){ var b=bandOf(k); return isFinite(b[1])?b[1]:b[0]; }
function b2BandText(k){ var b=bandOf(k); return isFinite(b[1])?b[0]+"–"+b[1]:b[0]+"+"; }

/* Only guessed for brand-new exercises, and always editable afterwards. */
var BAR_YES=/barbell|squat|bench|deadlift|dead lift|romanian|rdl|overhead press|ohp|military|hip thrust|clean|snatch|good ?morning|pendlay|jm press|floor press/i;
var BAR_NO=/dumbbell|\bdb\b|machine|cable|smith|kettlebell|\bkb\b|band|goblet|hack|leg press|pendulum|belt squat|bodyweight|assisted|landmine/i;
function guessBar(name){
  var n=String(name||"");
  if(BAR_NO.test(n)) return 0;
  return BAR_YES.test(n)?(num(S.settings.bar)||defaultBar(unit())):0;
}

function weekBounds(offset){
  var d=new Date(); d.setHours(0,0,0,0);
  var dow=(d.getDay()+6)%7;                 // Monday = 0
  d.setDate(d.getDate()-dow-7*(offset||0));
  var start=d.getTime();
  return {start:start,end:start+7*864e5};
}
function volumeInRange(a,b){
  var v=0,n=0;
  S.sessions.forEach(function(s){
    if(s.ts>=a&&s.ts<b){ n++; s.exercises.forEach(function(e){ v+=exVolume(e); }); }
  });
  return {v:v,n:n};
}

/* Every lift's best set by estimated 1RM, newest record first — the screen
   you actually want to look at after a good session. */
function prBoard(){
  var out=[];
  allExerciseNames().forEach(function(x){
    var best=null, bestV=0, bestTs=0, bestBw=0, bestMet=0;
    exSessions(x.name).forEach(function(s){
      s.sets.forEach(function(st){
        var v=setScore(st,s.metric);
        if(v>bestV){ bestV=v; best=st; bestTs=s.ts; bestBw=s.bw; bestMet=s.metric; }
      });
    });
    if(best) out.push({name:x.name,set:best,e:bestV,ts:bestTs,bw:bestBw,metric:bestMet});
  });
  return out.sort(function(a,b){ return b.ts-a.ts||b.e-a.e; });
}

/* Month grid, Monday-first to match weekBounds(). Returns 7-wide rows of
   {day, ts, sessions[]} with nulls for the leading and trailing padding. */
function monthGrid(offset){
  var now=new Date();
  var m=new Date(now.getFullYear(),now.getMonth()-(offset||0),1);
  var year=m.getFullYear(), mon=m.getMonth();
  var first=(new Date(year,mon,1).getDay()+6)%7;         // Monday = 0
  var days=new Date(year,mon+1,0).getDate();
  var byDay={};
  S.sessions.forEach(function(s){
    var d=new Date(s.ts);
    if(d.getFullYear()===year&&d.getMonth()===mon){
      (byDay[d.getDate()]=byDay[d.getDate()]||[]).push(s);
    }
  });
  var cells=[],i;
  for(i=0;i<first;i++) cells.push(null);
  for(i=1;i<=days;i++) cells.push({day:i,ts:new Date(year,mon,i).getTime(),sessions:byDay[i]||[]});
  while(cells.length%7) cells.push(null);
  var rows=[];
  for(i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7));
  var trained=Object.keys(byDay).length;
  var n=0; Object.keys(byDay).forEach(function(k){ n+=byDay[k].length; });
  return {rows:rows, label:m.toLocaleDateString(undefined,{month:"long",year:"numeric"}),
          trained:trained, sessions:n, days:days, year:year, mon:mon,
          isCurrent:(offset||0)===0};
}

self.__ilf=(self.__ilf||0)+1;
