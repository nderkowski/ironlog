"use strict";
/* ============================ the coach (v26 rules, v27 Claude) ============================
   ONE suggestion system with two sources. The rules (v26) look at the log
   every 14 days; Claude (v27) is asked on demand. Both raise the same thing:
   a proposal in S.coach.proposals, shown as a card with a reason and choices.

   Three promises, because they are what Nick asked for:
   - It PROMPTS. Nothing here changes the plan until a button on a card is
     tapped (coachApply), and every accepted change is one tap to undo.
   - It NEVER sets a weight or a rep. The only actions are swap a lift, trim
     or add a set, remove a lift, pair two as a superset. Progression stays
     with prescribe()/shadowPrescribe(). The one number a swap does write is
     `startW` on the NEW row, read by prescribe()'s "new" branch only, so the
     first card for a lift with no history isn't blank.
   - At most COACH_OPEN_MAX proposals are open at once, and a lift+reason
     that was kept (or accepted) isn't raised again for weeks.

   S.coach = {proposals:[], history:[], lastCheck}
     proposal = {id, ts, source:"rules"|"claude", kind, key, lift, rid, title,
                 reason, evidence, options:[{act,label,lift,to?,n?,with?}],
                 status:"open"|"accepted"|"skipped", decided, chosen, undo?}
     history  = one entry per Claude check-in (ts, model, usage, summary,
                questions) — never the prompt.
   Everything reads it through coachState(); normalize() repairs it. */
var COACH_EVERY=14*864e5, COACH_OPEN_MAX=2, COACH_MIN_SESSIONS=6, COACH_EXPIRE=28*864e5;
/* Days before the same lift + reason may be raised again, after one, two, and
   three or more "Keep it"s. Kept once is a no for now; kept twice is a no. */
var COACH_COOL=[42,126,365];
var COACH_ACCEPT_COOL=42*864e5;
var COACH_LONG=90;          // active minutes; over this a day is "running long" (Nick: up to 1.5 h is fine)
var COACH_BUSY=80;          // a day already this long (active) doesn't get another set
var COACH_BUSY_SETS=21;     // ...nor one already planned at this many working sets
var COACH_MIN_WEEKLY=6;     // weekly sets per muscle under which the volume rule speaks
var COACH_UI={busy:false, err:""};

function coachShape(c){
  if(!c||typeof c!=="object"||Array.isArray(c)) c={};
  if(!Array.isArray(c.proposals)) c.proposals=[];
  c.proposals=c.proposals.filter(function(p){
    return p&&typeof p==="object"&&p.id&&Array.isArray(p.options)&&p.lift;
  });
  if(!Array.isArray(c.history)) c.history=[];
  c.lastCheck=num(c.lastCheck);
  return c;
}
function coachState(){ return (S.coach=coachShape(S.coach)); }
function coachOpen(){ return coachState().proposals.filter(function(p){ return p.status==="open"; }); }
function coachLastAi(){
  var h=coachState().history.filter(function(x){ return x.type==="claude"; });
  return h.length?h[0]:null;
}
function coachRefresh(){
  /* Never on the logging path (trap 1): only a screen with no workout under it. */
  if(S.active&&TAB==="today") return;
  if(TAB==="today"||TAB==="progress") render();
}

/* ---- similar exercises ----
   A curated table, each family listed in the order to offer it. The number
   after each name is a GUESS at its working load relative to the first member,
   as logged: a per-hand dumbbell number against a stack number against a
   barbell total. It is only used to suggest where to start a lift that has no
   history, always err light (COACH_LIGHT), and Nick finds the real weight in a
   set or two. 0 means "no sensible comparison" (bands, bodyweight, a different
   unit of effort), and no start weight is suggested. */
var COACH_LIGHT=0.85;
var COACH_FAMILIES=[
  [["Leg Press",1],["Hack Squat",.6],["Smith Machine Squat",.7],["Pendulum Squat",.5]],
  [["Back Squat",1],["Front Squat",.75],["Box Squat",.9],["Goblet Squat",.2]],
  [["Bulgarian Split Squat",1],["Reverse Lunge",1],["Walking Lunge",1],["Step-up",.8]],
  [["Leg Extension",1],["Single-leg Extension",.5],["Sissy Squat",0]],
  [["Hamstring Curls",1],["Seated Leg Curl",1],["Lying Leg Curl",.9],["Cable Leg Curl",.5]],
  [["RDL",1],["DB RDL",.5],["45° Back Extension",0],["Cable Pull-through",.4]],
  [["Deadlift",1],["Trap Bar Deadlift",1.1],["Rack Pull",.9],["Sumo Deadlift",1]],
  [["Hip Thrust",1],["Machine Hip Thrust",.9],["Smith Hip Thrust",1],["Glute Bridge",.8]],
  [["Incline DB Press",1],["Incline Machine Press",1.5],["Low-incline Smith Press",1.6],["Incline Bench Press",1.7]],
  [["Flat DB Press",1],["Machine Chest Press",1.5],["Smith Bench Press",1.7],["Bench Press",1.7]],
  [["Low to high cable fly",1],["Cable Crossover",1],["Pec Deck",2],["DB Fly",.6]],
  [["DB Overhead Press",1],["Seated DB Shoulder Press",1],["Machine Shoulder Press",1.6],["Arnold Press",.8],["Overhead Press",1.8]],
  [["Lateral Raise",1],["Cable Lateral Raise",.6],["Machine Lateral Raise",2.5],["Leaning Cable Lateral Raise",.5]],
  [["Rear Delt Fly",1],["Reverse Pec Deck",2],["Band Pull-apart",0],["Face Pull",3],["Cable Rear Delt Fly",1.2]],
  [["Cable Row",1],["Chest-supported Row",.9],["Machine Row",1],["DB Row",.5],["T-Bar Row",1.1],["Barbell Row",1.6]],
  [["Lat Pulldown",1],["Neutral-grip Pulldown",1],["Close-grip Pulldown",.95],["Machine Pulldown",1],["Single-arm Pulldown",.5]],
  [["Pull-up",0],["Chin-up",0],["Neutral-grip Pull-up",0]],
  [["Assisted Pull-up",0],["Assisted Chin-up",0]],
  [["DB Curl",1],["Incline DB Curl",.75],["Cable Curl",1.4],["Hammer Curl",1.1],["Preacher Curl",1.2],["EZ-bar Curl",1.6]],
  [["Tricep Pushdown",1],["Overhead Cable Extension",.7],["Rope Pushdown",.9],["Cross-body Tricep Extension",.5],["DB Skullcrusher",.4]],
  [["Calf Raise",1],["Seated Calf Raise",.6],["Leg Press Calf Raise",1.2],["Single-leg Calf Raise",.5]],
  [["DB Shrug",1],["Cable Shrug",.8],["Smith Shrug",1.8]],
  [["Cable Crunch",1],["Hanging Leg Raise",0],["Ab Wheel",0],["Decline Sit-up",0]]
];
var COACH_ALIAS={"squat":"Back Squat","barbell squat":"Back Squat","hamstring curl":"Hamstring Curls","leg curl":"Hamstring Curls",
  "romanian deadlift":"RDL","dumbbell rdl":"DB RDL","split squat":"Bulgarian Split Squat","dumbbell curl":"DB Curl",
  "tricep pushdowns":"Tricep Pushdown","triceps pushdown":"Tricep Pushdown","lateral raises":"Lateral Raise",
  "db lateral raise":"Lateral Raise","dumbbell lateral raise":"Lateral Raise","facepull":"Face Pull","face pulls":"Face Pull",
  "seated cable row":"Cable Row","db bench press":"Flat DB Press","dumbbell bench press":"Flat DB Press",
  "incline dumbbell press":"Incline DB Press","cable fly":"Low to high cable fly","cable flies":"Low to high cable fly",
  "dumbbell row":"DB Row","one-arm dumbbell row":"DB Row","rear delt flies":"Rear Delt Fly","rear delt flye":"Rear Delt Fly",
  "overhead dumbbell press":"DB Overhead Press","dumbbell shoulder press":"DB Overhead Press","calf raises":"Calf Raise",
  "pullup":"Pull-up","chinup":"Chin-up","shrugs":"DB Shrug"};
var COACH_FAM=null;
function coachFamIndex(){
  if(COACH_FAM) return COACH_FAM;
  COACH_FAM={};
  COACH_FAMILIES.forEach(function(f,fi){ f.forEach(function(m){ COACH_FAM[normName(m[0])]={fi:fi,f:m[1],name:m[0]}; }); });
  Object.keys(COACH_ALIAS).forEach(function(a){
    var t=COACH_FAM[normName(COACH_ALIAS[a])]; if(t) COACH_FAM[normName(a)]=t;
  });
  return COACH_FAM;
}
function coachFamOf(name){
  var ix=coachFamIndex(), k=normName(name);
  return ix[k]||ix[k.replace(/s$/,"")]||null;
}
function coachInPlan(name){
  var k=normName(name), found=false;
  eachPlanEx(function(e){ var n=normName(e.name); if(n===k||n===k+"s"||n===k.replace(/s$/,"")) found=true; });
  return found;
}
/* Up to `max` similar lifts to offer for `name`, minus anything already in the plan. */
/* Lifts Nick has ruled out: no face-pull variation ever felt right. They stay
   in their family so a plan that still has one can swap OUT of it. */
var COACH_NEVER=["face pull"];
function coachAlternatives(name,max){
  var me=coachFamOf(name); if(!me) return [];
  var out=[];
  COACH_FAMILIES[me.fi].forEach(function(m){
    if(normName(m[0])===normName(me.name)||coachInPlan(m[0])) return;
    if(COACH_NEVER.indexOf(normName(m[0]))>=0) return;   // looked up, never offered
    out.push(m[0]);
  });
  return out.slice(0,max||3);
}
function coachSwapOpts(name,max,not){
  return coachAlternatives(name,(max||3)+3).filter(function(n){ return normName(n)!==normName(not||""); })
    .slice(0,max||3).map(function(n){ return {act:"swap", lift:name, to:n, label:"Swap for "+n}; });
}
/* Where to start a lift that has no history: the old lift's working load, scaled
   by the guessed ratio between the two, times COACH_LIGHT, rounded DOWN to the
   increment. A guess by design — it only fills a blank, and he finds the real
   weight in a set or two. 0 = no suggestion. */
function coachStartW(oldName,newName,row){
  if(bwMode(row)||metricOf(row)) return 0;
  var fo=coachFamOf(oldName), fn=coachFamOf(newName);
  if(!fo||!fn||!fo.f||!fn.f) return 0;
  var h=lastPerf(oldName); if(!h||h.bw||h.metric) return 0;
  var w=workLoad(h.sets,h.bw); if(!(w>0)) return 0;
  var step=stepFor(row);
  var v=Math.floor(w*fn.f/fo.f*COACH_LIGHT/step+1e-9)*step;
  return v>0?round(v,1):0;
}
/* A swapped-in row takes the old slot's shape (sets, range, superset, increment,
   load type, muscles) and is built by newPlanEx() like every plan row (trap 13).
   Its history, if it has any, wins over the old lift's for bw/metric/bar. */
function coachNewRow(old,to){
  var ne=newPlanEx(to), known=exWorking(to).length>0;
  ne.sets=Math.max(1,num(old.sets)||3); ne.reps=old.reps; ne.repTop=old.repTop;
  ne.link=!!old.link; ne.inc=old.inc||null;
  if(!known){
    ne.bw=bwMode(old); ne.metric=metricOf(old);
    ne.bar=(num(old.bar)>0&&num(ne.bar)>0)?old.bar:ne.bar;
  }
  if(old.mg||(old.mg2&&old.mg2.length)){ ne.mg=old.mg||""; ne.mg2=(old.mg2||[]).slice(); }
  /* Never-done lift: guess a light start (coachStartW). A lift with history
     keeps it: the engine reads it, and makeSessionEx() starts a step lighter if
     the last exposure was over 28 days ago (ne.stepBack). */
  if(!known){ var sw=coachStartW(old.name,to,ne); if(sw) ne.startW=sw; }
  else ne.stepBack=true;
  return ne;
}

/* ---- what the rules read ---- */
function coachMedian(a){
  var s=a.slice().sort(function(x,y){ return x-y; }), n=s.length;
  return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0;
}
function coachDone(s,name){
  var k=normName(name);
  return s.exercises.some(function(e){
    return normName(e.name)===k&&working(e.sets).some(function(x){ return x.done!==false&&num(x.r)>0; });
  });
}
/* Timestamps of a session's logged working sets, sorted. */
function coachSetTimes(s){
  var ts=[];
  s.exercises.forEach(function(e){ working(e.sets).forEach(function(x){ if(x.done!==false&&num(x.ts)>0) ts.push(num(x.ts)); }); });
  return ts.sort(function(a,b){ return a-b; });
}
/* ACTIVE minutes: the sum of the gaps between consecutive logged sets that are
   15 minutes or less. First-to-last is wrong for this log — sets get ticked
   hours or days later (real sessions spanning 17 h and 4 days), so a span reads
   a 45-minute workout as a marathon. A longer gap is a break in the app, not in
   the lifting, and counts for nothing. Null when the log can't say (fewer than
   4 stamped sets). */
var COACH_GAP=15*60e3;
function coachActiveMin(s){
  var ts=coachSetTimes(s);
  if(ts.length<4) return null;
  var sum=0;
  for(var i=1;i<ts.length;i++) if(ts[i]-ts[i-1]<=COACH_GAP) sum+=ts[i]-ts[i-1];
  return sum/60000;
}
/* The raw first-to-last span, for the summary only (it is what the old rule used). */
function coachSpanMin(s){
  var ts=coachSetTimes(s);
  return ts.length<4?null:(ts[ts.length-1]-ts[0])/60000;
}
/* Median active minutes of a day's last 4 sessions; null unless 3 can be timed. */
function coachDayActive(r){
  var d=coachDaySessions(r).slice(0,4).map(coachActiveMin).filter(function(x){ return x!==null; });
  return d.length>=3?coachMedian(d):null;
}
/* A day's sessions, newest first, deloads left out (they are short on purpose).
   For a lift in only some of a day's weeks, only the weeks it is planned in. */
function coachDaySessions(r,name){
  var k=name?normName(name):"", vs=variantsOf(r);
  var ids=name?vs.filter(function(v){ return v.exercises.some(function(e){ return normName(e.name)===k; }); })
    .map(function(v){ return v.id; }):null;
  return S.sessions.filter(function(s){
    return s.routineId===r.id&&!s.deload&&(!ids||vs.length<2||ids.indexOf(s.variantId)>=0);
  }).sort(function(a,b){ return b.ts-a.ts; });
}
function coachMk(o){
  return {id:uid(), ts:Date.now(), source:o.source||"rules", kind:o.kind, key:o.key, lift:o.lift, rid:o.rid||"",
          title:o.title, reason:o.reason, evidence:o.evidence||"", options:o.options, status:"open"};
}

/* RULE 1 — skipped lift. A plan lift with no logged sets in ≥3 of the last 4
   sessions of its day. A row added to the plan after the oldest of those
   sessions is not judged (it hasn't had its four); a row from before rows
   carried a date is judged only if the lift was ever done, so a never-done lift
   isn't called "skipped" the day it was added. Face pulls: skipped every time
   for months. */
function coachRuleSkipped(){
  var out=[];
  S.routines.forEach(function(r){
    var seen={};
    variantsOf(r).forEach(function(v){ v.exercises.forEach(function(e){
      var k=normName(e.name); if(seen[k]) return; seen[k]=1;
      var all=coachDaySessions(r,e.name);
      if(all.length<4) return;
      var last4=all.slice(0,4);
      if(e.added){ if(num(e.added)>last4[3].ts) return; }
      else if(!exSessions(e.name).length) return;
      var skipped=last4.filter(function(s){ return !coachDone(s,e.name); }).length;
      if(skipped<3) return;
      var opts=[{act:"remove", lift:e.name, label:"Take it out of "+r.name}]
        .concat(coachSwapOpts(e.name,3).map(function(o){ o.label+=" in "+r.name; return o; }));
      out.push({n:skipped, p:coachMk({kind:"skipped", key:"skipped|"+k+"|"+r.id, lift:e.name, rid:r.id,
        title:e.name+" keeps getting skipped",
        reason:"Skipped in "+skipped+" of the last 4 "+r.name+" sessions — no sets logged.",
        evidence:"Coaching convention, not a trial result: a lift you keep skipping isn't adding volume, "+
          "and the time it would take is better spent on one you will do.",
        options:opts})});
    }); });
  });
  out.sort(function(a,b){ return b.n-a.n; });
  return out.map(function(x){ return x.p; });
}

/* RULE 2 — long sessions. Median ACTIVE time (coachActiveMin) of a day's last
   4 sessions over 90 minutes (needs 3 that can be timed); he has said up to
   1.5 hours is fine — there's no 45-minute target. Offers to trim one set
   from the lowest-priority accessory — the last lift after the main one with
   3+ sets; plan order is priority — or to pair two unpaired accessories as a
   superset. */
function coachRuleLong(){
  var out=[];
  S.routines.forEach(function(r){
    var last4=coachDaySessions(r).slice(0,4);
    if(last4.length<4) return;
    var d=last4.map(coachActiveMin).filter(function(x){ return x!==null; });
    if(d.length<3) return;
    var med=coachMedian(d); if(med<=COACH_LONG) return;
    var v=variantsOf(r).filter(function(x){ return x.id===last4[0].variantId; })[0]||variantAt(r,0);
    var ex=v.exercises, trim=-1, pair=-1, i;
    for(i=ex.length-1;i>=1;i--) if(num(ex[i].sets)>=3){ trim=i; break; }
    for(i=ex.length-2;i>=1;i--)
      if(!ex[i].link&&!ex[i+1].link&&!(ex[i+2]&&ex[i+2].link)){ pair=i; break; }
    var opts=[];
    if(trim>=0) opts.push({act:"trim", lift:ex[trim].name, n:1, label:"Trim a set from "+ex[trim].name});
    if(pair>=0) opts.push({act:"pair", lift:ex[pair].name, with:ex[pair+1].name,
      label:"Superset "+ex[pair].name+" + "+ex[pair+1].name});
    if(!opts.length) return;
    out.push(coachMk({kind:"long", key:"long|"+r.id, lift:opts[0].lift, rid:r.id,
      title:r.name+" is running long",
      reason:"The last "+d.length+" timed "+r.name+" sessions had a median of "+Math.round(med)+" active minutes (time between sets; breaks over 15 minutes left out).",
      evidence:"Convention, not a trial result: there is no studied cutoff. You've said up to an hour and a half is fine; "+
        "past that, sessions tend to get cut short. Pairing two lifts as a superset saves their rest time; "+
        "trimming a set from the last accessory saves a few minutes and costs little.",
      options:opts}));
  });
  return out;
}

/* RULE 3 — too few weekly sets. RARE on purpose. Weekly sets per muscle
   (tagsOf(), a helper's sets at ½) averaged over the last 3 complete weeks,
   under COACH_MIN_WEEKLY (6), for a muscle the plan trains with a primary (mg)
   lift, while he trains ≥2 times a week. Under 10 would fire on nearly every
   muscle of the recommended plan at 2.5 sessions a week (chest and quads ≈ 7.5,
   biceps and triceps ≈ 8.75), so the bar is "thin", not "short of the review's
   10". Skipped when any of the three weeks had a deload or no session (volume
   was low on purpose or by absence), and never offered a set on a day that is
   already long (active median over COACH_BUSY minutes) or planned at
   COACH_BUSY_SETS working sets or more. Offers one more set on that muscle's
   isolation lift. */
function coachRuleVolume(){
  var wk=[1,2,3].map(weekBounds), tot={}, sess=0;
  if(!S.sessions.length||Math.min.apply(null,S.sessions.map(function(s){ return s.ts; }))>wk[2].start) return [];
  for(var i=0;i<3;i++){
    var inWk=S.sessions.filter(function(s){ return s.ts>=wk[i].start&&s.ts<wk[i].end; });
    if(!inWk.length||inWk.some(function(s){ return s.deload; })) return [];
    sess+=inWk.length;
    var by=setsByMuscle(wk[i].start,wk[i].end).by;
    MUSCLES.forEach(function(m){ tot[m.k]=(tot[m.k]||0)+by[m.k]; });
  }
  if(sess<6) return [];
  var idx=mgIndex(), rows={};
  eachPlanEx(function(e,r,v){
    var t=tagsOf(e,idx); if(!isMuscle(t.mg)) return;
    (rows[t.mg]=rows[t.mg]||[]).push({e:e,r:r,v:v});
  });
  var low=[];
  MUSCLES.forEach(function(m){
    var avg=tot[m.k]/3;
    if(rows[m.k]&&avg<COACH_MIN_WEEKLY&&avg>0) low.push({m:m,avg:avg});   // avg 0: a missed day, not a thin plan
  });
  low.sort(function(a,b){ return a.avg-b.avg; });
  for(var k=0;k<low.length;k++){
    var cand=rows[low[k].m.k].filter(function(x){
      if(num(x.e.sets)>=5) return false;
      var planned=x.v.exercises.reduce(function(a,e){ return a+num(e.sets); },0);
      if(planned>=COACH_BUSY_SETS) return false;
      var act=coachDayActive(x.r);
      return !(act!==null&&act>COACH_BUSY);
    });
    if(!cand.length) continue;
    cand.sort(function(a,b){
      var ia=movementClass(a.e.name)==="iso"?0:1, ib=movementClass(b.e.name)==="iso"?0:1;
      return ia-ib||num(a.e.sets)-num(b.e.sets);
    });
    var pick=cand[0], worst=low[k];
    return [coachMk({kind:"volume", key:"volume|"+worst.m.k, lift:pick.e.name, rid:pick.r.id,
      title:worst.m.n+" gets few sets",
      reason:worst.m.n+" averaged "+fmt(round(worst.avg,1))+" sets a week over the last 3 weeks (a set counts 1 for the main muscle, "+
        "½ for a helper), while you trained "+(sess/3).toFixed(1)+" times a week.",
      evidence:"More weekly sets grow more muscle, with diminishing returns (Schoenfeld 2017; Pelland 2026); about 10 or "+
        "more a week is the usual floor (ACSM 2026). This only speaks under "+COACH_MIN_WEEKLY+", well short of that, "+
        "and only on a day with room. Those are short trials, mostly 6–12 weeks, so a guide, not a target.",
      options:[{act:"add", lift:pick.e.name, n:1, label:"Add a set to "+pick.e.name+" ("+pick.r.name+")"}]})];
  }
  return [];
}

/* RULE 4 — stalled lift. Deliberately hard to trigger: a naive stall rule
   fired on ~35% of exposures while strength was rising (ROADMAP v25 F4), and
   no validated plateau rule exists (RESEARCH.md). Needs ≥6 exposures in a row
   at the SAME working load (workLoad()) — at least a whole progression cycle
   — spanning ≥4 weeks, the least-squares slope of the best set (rep-out if
   present) over that run not above zero, the range no wider than 8 sessions
   of climb (deloadCheck's limit), and trend() not "up".

   A LADDER, history first. A swap throws away a lift's history, so it is the
   second rung, not the first:
     1. on the same lift: +1 working set, or the range down 2 reps (heavier
        for the same reps), or out of its superset if it is paired;
     2. a swap for a close variation — only if it stalls AGAIN after a rung-1
        change was accepted (≥42 days and ≥4 exposures later), or at once when
        one of its last three notes mentions pain, soreness or a pinch. */
/* Least-squares slope of a run of scores (newest first in), as % per 3
   sessions — the same units and shape as trendAt(), over the run only. */
function coachSlope(newestFirst){
  var v=newestFirst.slice().reverse(), n=v.length;
  var ym=v.reduce(function(a,b){ return a+b; },0)/n; if(!ym) return 0;
  var xm=(n-1)/2, sxy=0, sxx=0;
  for(var i=0;i<n;i++){ sxy+=(i-xm)*(v[i]-ym); sxx+=(i-xm)*(i-xm); }
  return sxx?(sxy/sxx)/ym*100*3:0;
}
var COACH_STALL_N=6;       // at least this many exposures in a row at one load...
var COACH_STALL_CYCLES=3;  // ...and this many progression cycles' worth of them (an 8–12 lift: 15)
var COACH_PAIN=/pain|hurt|ache|pinch|tweak|sore/i;
function coachNoteOf(x,name){
  var se=S.sessions.filter(function(s){ return s.id===x.sessionId; })[0];
  var ex=se&&se.exercises.filter(function(e){ return normName(e.name)===normName(name); })[0];
  return ex?String(ex.note||"").trim():"";
}
function coachRuleStall(){
  var out=[];
  trackedLifts().forEach(function(name){
    var h=exWorking(name); if(h.length<6) return;
    var mode=h[0].bw, W=workLoad(h[0].sets,mode); if(!(W>0)) return;
    var run=[];
    for(var i=0;i<h.length&&workLoad(h[i].sets,mode)===W;i++) run.push(h[i]);
    /* TWO whole double-progression cycles at one load. A lifter on double
       progression steps the load every cycle (an 8–12 lift: ~5 sessions); two
       cycles without a step is stuck, not slow. Measured: over 6 sessions a
       lifter getting stronger by 5–15% a year looks exactly like a stalled one
       (the rep noise is the size of the gain), and a 6-exposure rule raised
       ~26 cards a year on him. */
    if(cycleOf(name)>8) return;          // past this width no threshold separates slow progress from none (deloadCheck)
    if(run.length<Math.max(COACH_STALL_N,COACH_STALL_CYCLES*cycleOf(name))||run[0].ts-run[run.length-1].ts<28*864e5) return;
    var key="stall|"+normName(name), tg=coachTargets(name); if(!tg.length) return;
    var row=tg[0].e;
    /* A step over 8% of the load (5 lb on a 45 lb dumbbell) is a jump slow
       progress can't make: sitting at that load for months is ordinary there. */
    if(W>0&&mode===0&&stepFor(row)/W>0.08) return;
    /* Slope of the mean reps at the load over the run (the climbing set targets
       count, not only the rep-out) must not be positive. */
    var sc=run.slice(0,12).map(function(x){
      var at=x.sets.filter(function(y){ return isAt(y,W,mode); });
      return at.reduce(function(a,y){ return a+num(y.r); },0)/Math.max(1,at.length);
    });
    if(coachSlope(sc)>0) return;
    if(trend(name).state==="up") return;
    /* At the top of the range and not stepping up is the engine waiting out a
       failed jump (v25), which is its business, not a plateau. */
    if(num(row.repTop)>num(row.reps)&&sc[0]>=num(row.repTop)) return;
    var prior=coachState().proposals.filter(function(q){ return q.key===key&&q.status==="accepted"&&q.stage===1; })
      .sort(function(a,b){ return num(b.decided)-num(a.decided); })[0];
    var pain=h.slice(0,3).map(function(x){ return {ts:x.ts, n:coachNoteOf(x,name)}; }).filter(function(x){ return COACH_PAIN.test(x.n); })[0];
    var stage=2, why="";
    var rung1=[];
    if(!prior&&!pain){
      stage=1;
      var sets=num(row.sets)||3, lo=num(row.reps), top=num(row.repTop);
      if(sets<6) rung1.push({act:"add", lift:name, n:1, label:"Add a set to "+name});
      if(lo-2>=3) rung1.push({act:"shift_range", lift:name, n:2, label:"Lower "+name+"'s range by 2 reps ("+lo+(top>lo?"–"+top:"")+" → "+(lo-2)+
        (top>lo?"–"+Math.max(lo-1,top-2):"")+")"});
      if(row.link||(tg[0].v.exercises[tg[0].ei+1]&&tg[0].v.exercises[tg[0].ei+1].link))
        rung1.push({act:"unpair", lift:name, label:"Take "+name+" out of its superset"});
      if(!rung1.length) stage=2;
    }
    if(stage===2){
      if(prior){
        var since=h.filter(function(x){ return x.ts>num(prior.decided); }).length;
        if(since<4||Date.now()-num(prior.decided)<COACH_ACCEPT_COOL) return;
        why="It stalled again after the change you made on "+shortDate(prior.decided)+".";
      } else if(pain) why="Your note on "+shortDate(pain.ts)+" says: \""+pain.n.slice(0,120)+"\".";
    }
    var opts=stage===1?rung1:coachSwapOpts(name,3);
    if(!opts.length) return;
    var best=Math.max.apply(null,run.map(function(x){ return Math.max.apply(null,x.sets.map(function(s){ return num(s.r); })); }));
    var p=coachMk({kind:"stall", key:key, lift:name,
      title:name+(stage===1?" has stopped moving":" — time for a variation"),
      reason:run.length+" sessions in a row at "+entryText({w:W},mode)+" "+unit()+", over "+
        Math.round((run[0].ts-run[run.length-1].ts)/864e5/7)+" weeks, with the best set no better than before "+
        "(most reps in a set: "+best+")."+(why?" "+why:""),
      evidence:"Rule of thumb, not a validated test — no plateau rule has one (the nearest, Bell 2023, is coaches' consensus on deloading), "+
        "so this waits for six sessions at one load with nothing gained. "+
        (stage===1?"The lift's history stays with it: a small change first, a swap only if it stalls again. "
                  :"A swap starts the new lift's history from zero. ")+
        "A deload week or more food or sleep might help too.",
      options:opts});
    p.stage=stage;
    out.push(p);
  });
  return out;
}

/* ---- raising, cooling down, expiring ---- */
function coachBlocked(p){
  var c=coachState(), now=Date.now();
  if(c.proposals.some(function(q){ return q.status==="open"&&(q.key===p.key||normName(q.lift)===normName(p.lift)); })) return "open";
  var rel=c.proposals.filter(function(q){ return q.key===p.key&&q.status!=="open"; });
  if(!rel.length) return "";
  var skips=rel.filter(function(q){ return q.status==="skipped"; }).length;
  var cd=skips?COACH_COOL[Math.min(skips,COACH_COOL.length)-1]*864e5:0;
  if(rel.some(function(q){ return q.status==="accepted"; })) cd=Math.max(cd,COACH_ACCEPT_COOL);
  var last=Math.max.apply(null,rel.map(function(q){ return num(q.decided)||num(q.ts); }));
  return (now-last<cd)?"cooling":"";
}
function coachPrune(){
  var c=coachState(), now=Date.now();
  c.proposals.forEach(function(p){
    if(p.status==="accepted"&&p.undo&&now-num(p.decided)>30*864e5) delete p.undo;
  });
  var keep=c.proposals.filter(function(p){ return p.status==="open"||now-(num(p.decided)||num(p.ts))<400*864e5; });
  var done=keep.filter(function(p){ return p.status!=="open"; });
  if(done.length>80){
    done.sort(function(a,b){ return (num(a.decided)||a.ts)-(num(b.decided)||b.ts); });
    var drop=done.slice(0,done.length-80);
    keep=keep.filter(function(p){ return drop.indexOf(p)<0; });
  }
  c.proposals=keep;
  var nC=0, nA=0;                    // check-ins and measured suggestions are kept apart
  c.history=c.history.filter(function(h){ return h.type==="accepted"?(++nA<=60):(++nC<=12); });
}
/* An open card nobody answered in four weeks stops being a prompt and starts
   being furniture: it is closed as a "Keep it" (which also cools it down). */
function coachExpire(){
  var now=Date.now();
  coachState().proposals.forEach(function(p){
    if(p.status==="open"&&p.source==="rules"&&now-p.ts>COACH_EXPIRE){ p.status="skipped"; p.decided=now; p.expired=true; }
  });
}
function coachRaise(p){
  var c=coachState();
  if(coachOpen().length>=COACH_OPEN_MAX||coachBlocked(p)) return false;
  c.proposals.push(p);
  return true;
}
/* The rules, at most every 14 days and only with enough log to judge. Called
   after a workout is saved; never raises past the open cap. */
function coachRun(force){
  var c=coachState(), now=Date.now();
  if(S.sessions.length<COACH_MIN_SESSIONS) return 0;
  if(!force&&now-c.lastCheck<COACH_EVERY) return 0;
  c.lastCheck=now;
  coachExpire();
  var n=0;
  [].concat(coachRuleSkipped(),coachRuleLong(),coachRuleVolume(),coachRuleStall())
    .forEach(function(p){ if(coachRaise(p)) n++; });
  coachPrune();
  return n;
}

/* ---- applying, keeping, undoing ---- */
function coachTargets(lift,rid){
  var k=normName(lift), out=[];
  eachPlanEx(function(e,r,v,vi,ei){
    if(normName(e.name)===k&&(!rid||r.id===rid)) out.push({e:e,r:r,v:v,ei:ei});
  });
  return out;
}
function coachCopy(x){ return JSON.parse(JSON.stringify(x)); }
/* What changed in one week's list of lifts, in terms that can be put back:
   rows that appeared, rows that changed (as they were), rows that vanished (as
   they were, and what sat above them). */
function coachDiff(before,after){
  var bi={}, ai={}, d={added:[], changed:[], removed:[]};
  before.forEach(function(e){ bi[e.id]=e; });
  after.forEach(function(e){ ai[e.id]=e; });
  after.forEach(function(e){
    if(!bi[e.id]) d.added.push(e.id);
    else if(JSON.stringify(bi[e.id])!==JSON.stringify(e)) d.changed.push(coachCopy(bi[e.id]));
  });
  before.forEach(function(e,i){
    if(!ai[e.id]) d.removed.push({row:coachCopy(e), prev:i?before[i-1].id:null, idx:i});
  });
  return d;
}
function coachUndoOps(ops){
  ops.forEach(function(o){
    var r=S.routines.filter(function(x){ return x.id===o.rid; })[0];
    var v=r&&variantsOf(r).filter(function(x){ return x.id===o.vid; })[0];
    if(!v) return;
    var ex=v.exercises;
    o.d.added.forEach(function(id){
      var i=ex.findIndex(function(e){ return e.id===id; }); if(i>=0) ex.splice(i,1);
    });
    o.d.changed.forEach(function(row){
      var i=ex.findIndex(function(e){ return e.id===row.id; }); if(i>=0) ex[i]=coachCopy(row);
    });
    o.d.removed.slice().sort(function(a,b){ return a.idx-b.idx; }).forEach(function(x){
      var at=0;
      if(x.prev){
        at=ex.findIndex(function(e){ return e.id===x.prev; })+1;
        if(!at) at=Math.min(x.idx,ex.length);
      }
      ex.splice(at,0,coachCopy(x.row));
    });
  });
}
function coachActWord(o){
  return o.act==="swap"?"Swapped "+o.lift+" for "+o.to:o.act==="remove"?"Took "+o.lift+" out":
         o.act==="trim"?"Trimmed a set from "+o.lift:o.act==="add"?"Added a set to "+o.lift:
         o.act==="shift_range"?"Lowered "+o.lift+"'s range by "+(o.n||2):
         o.act==="unpair"?"Took "+o.lift+" out of its superset":
         "Paired "+o.lift+" + "+o.with;
}

/* ---- does it help? (v26 measurement) ----
   Every accepted suggestion leaves an entry in S.coach.history with a baseline,
   and after FOUR further exposures of its slot is marked helped or not:
   - swap / add a set / lower the range: progression earned — for a swap, a
     later one of the four sessions beat the first; for the others, one of the
     four beat the lift's best set before (trendScore, so the rep-out counts);
   - trim / pair / unpair / remove: the day got shorter (≥3 active minutes off
     the median) or fewer of its lifts were missed.
   The Coach section shows the tally in one line, so "is this coach any use?"
   has an answer a year from now. */
function coachDayMiss(r,sessions){
  var tot=0, miss=0;
  (sessions||coachDaySessions(r).slice(0,4)).forEach(function(s){
    var v=variantsOf(r).filter(function(x){ return x.id===s.variantId; })[0]||variantAt(r,0);
    v.exercises.forEach(function(e){ tot++; if(!coachDone(s,e.name)) miss++; });
  });
  return tot?miss/tot:0;
}
function coachBaseline(p,o,r){
  var lift=o.lift||p.lift, b={act:o.act, from:lift, rid:r?r.id:"", skip:0, score:0, min:null};
  if(o.act==="swap"||o.act==="add"||o.act==="shift_range"){
    var last=lastPerf(lift);
    b.mode="exposure"; b.lift=o.act==="swap"?o.to:lift; b.score=last?Math.round(trendScore(last)*10)/10:0;
    if(r){ var ss=coachDaySessions(r,lift).slice(0,4); b.skip=ss.length?ss.filter(function(x){ return !coachDone(x,lift); }).length/ss.length:0; }
  } else {
    b.mode="day"; b.lift=lift;
    if(r){ b.min=coachDayActive(r); b.skip=coachDayMiss(r); }
  }
  return b;
}
function coachMeasure(){
  var c=coachState(), changed=false;
  c.history.forEach(function(h){
    if(h.type!=="accepted"||h.result) return;
    var res=null;
    if(h.mode==="exposure"){
      var ex=exWorking(h.lift).filter(function(x){ return x.ts>h.ts; }).reverse();
      if(ex.length<4) return;
      var sc=ex.slice(0,4).map(trendScore);
      res=(h.act==="swap"?Math.max.apply(null,sc.slice(1))>sc[0]:Math.max.apply(null,sc)>num(h.baseline.score));
    } else {
      var r=S.routines.filter(function(x){ return x.id===h.rid; })[0];
      var after=S.sessions.filter(function(s){ return s.routineId===h.rid&&!s.deload&&s.ts>h.ts; })
        .sort(function(a,b){ return a.ts-b.ts; }).slice(0,4);
      if(!r||after.length<4) return;
      var d=after.map(coachActiveMin).filter(function(x){ return x!==null; });
      var med=d.length>=3?coachMedian(d):null;
      res=coachDayMiss(r,after)<num(h.baseline.skip)-1e-9||(med!==null&&h.baseline.min!==null&&med<h.baseline.min-3);
    }
    h.result=res?"helped":"not"; h.checked=Date.now(); changed=true;
  });
  return changed;
}
function coachTally(){
  var acc=coachState().history.filter(function(h){ return h.type==="accepted"; });
  if(!acc.length) return "";
  var done=acc.filter(function(h){ return h.result; }), good=done.filter(function(h){ return h.result==="helped"; }).length;
  return plural(acc.length,"suggestion")+" accepted · "+good+" led to progress within 4 sessions"+
    (acc.length>done.length?" ("+(acc.length-done.length)+" still being measured)":"");
}
function coachApply(id,oi){
  if(S.active){ toast("Finish or discard the workout first"); return false; }
  var c=coachState();
  var p=c.proposals.filter(function(x){ return x.id===id&&x.status==="open"; })[0];
  var o=p&&p.options[oi]; if(!o) return false;
  var lift=o.lift||p.lift, tg=coachTargets(lift,p.rid);
  if(!tg.length){
    c.proposals=c.proposals.filter(function(x){ return x!==p; });
    writeNow(); coachRefresh(); toast(lift+" isn't in your plan any more"); return false;
  }
  var base=coachBaseline(p,o,tg[0].r);
  var vs=[];
  tg.forEach(function(t){
    if(!vs.some(function(x){ return x.v===t.v; })) vs.push({r:t.r, v:t.v, before:coachCopy(t.v.exercises)});
  });
  var k=normName(lift);
  if(o.act==="swap"&&vs.some(function(x){ return x.v.exercises.some(function(e){ return normName(e.name)===normName(o.to); }); })){
    toast(o.to+" is already on that day"); return false;
  }
  vs.forEach(function(x){
    var ex=x.v.exercises, i;
    if(o.act==="swap"){
      for(i=0;i<ex.length;i++) if(normName(ex[i].name)===k) ex[i]=coachNewRow(ex[i],o.to);
    } else if(o.act==="remove"){
      for(i=ex.length-1;i>=0;i--) if(normName(ex[i].name)===k){
        var gone=ex.splice(i,1)[0];
        /* Adjacency is the superset: whatever was paired to the row below
           must not silently pair to whatever is above now. */
        if(ex[i]&&ex[i].link&&!gone.link) ex[i].link=false;
        if(ex[0]&&ex[0].link) ex[0].link=false;
      }
    } else if(o.act==="trim"){
      ex.forEach(function(e){ if(normName(e.name)===k) e.sets=Math.max(1,num(e.sets)-(o.n||1)); });
    } else if(o.act==="add"){
      ex.forEach(function(e){ if(normName(e.name)===k) e.sets=Math.min(8,num(e.sets)+(o.n||1)); });
    } else if(o.act==="pair"){
      for(i=0;i+1<ex.length;i++)
        if(normName(ex[i].name)===k&&normName(ex[i+1].name)===normName(o.with)&&!ex[i+1].link) ex[i+1].link=true;
    } else if(o.act==="shift_range"){
      ex.forEach(function(e){
        if(normName(e.name)!==k) return;
        var nr=Math.max(1,num(e.reps)-(o.n||2));
        if(num(e.repTop)>0) e.repTop=Math.max(nr+1,num(e.repTop)-(o.n||2));
        e.reps=nr;
      });
    } else if(o.act==="unpair"){
      for(i=0;i<ex.length;i++) if(normName(ex[i].name)===k){
        if(ex[i].link) ex[i].link=false; else if(ex[i+1]&&ex[i+1].link) ex[i+1].link=false;
      }
    }
  });
  var ops=vs.map(function(x){ return {rid:x.r.id, vid:x.v.id, d:coachDiff(x.before,x.v.exercises)}; })
    .filter(function(x){ return x.d.added.length||x.d.changed.length||x.d.removed.length; });
  if(!ops.length){ toast("Nothing to change — the plan already matches"); return false; }
  p.status="accepted"; p.decided=Date.now(); p.chosen=o.label; p.undo={ops:ops};
  c.history.unshift({type:"accepted", ts:p.decided, pid:p.id, kind:p.kind, act:o.act, lift:base.lift, from:base.from,
    rid:base.rid, mode:base.mode, baseline:{score:base.score, skip:base.skip, min:base.min}, result:"", checked:0});
  writeNow(); coachRefresh();
  toastUndo(coachActWord(o),function(){ coachUndo(id); });
  return true;
}
function coachUndo(id){
  if(S.active){ toast("Finish or discard the workout first"); return false; }
  var p=coachState().proposals.filter(function(x){ return x.id===id&&x.status==="accepted"&&x.undo; })[0];
  if(!p) return false;
  coachUndoOps(p.undo.ops);
  p.status="skipped"; p.undone=true; delete p.undo;
  coachState().history=coachState().history.filter(function(h){ return h.pid!==id; });   // an undone change is not a result
  writeNow(); coachRefresh(); toast("Put back how it was");
  return true;
}
function coachKeep(id){
  var p=coachState().proposals.filter(function(x){ return x.id===id&&x.status==="open"; })[0];
  if(!p) return;
  p.status="skipped"; p.decided=Date.now();
  writeNow(); coachRefresh(); toast("Kept as it is");
}

/* ---- the cards ---- */
function coachDays(p,o){
  var seen={}, out=[];
  coachTargets((o&&o.lift)||p.lift,p.rid).forEach(function(t){ if(!seen[t.r.id]){ seen[t.r.id]=1; out.push(t.r.name); } });
  return out;
}
function coachCardHtml(p,compact){
  var days=compact?[]:coachDays(p,p.options[0]);
  return '<div class="co-p">'+
    '<div class="row" style="gap:8px;align-items:flex-start"><div class="co-t">'+esc(p.title)+'</div>'+
      '<span class="chip tag" style="margin-left:auto">'+(p.source==="claude"?"Claude":"Rules")+'</span></div>'+
    '<div class="co-r">'+esc(p.reason)+'</div>'+
    (compact||!p.evidence?"":'<div class="co-e">'+esc(p.evidence)+'</div>')+
    (days.length>1&&p.source==="claude"?'<div class="co-e">In your plan: '+esc(days.join(" · "))+'.</div>':"")+
    '<div class="co-o">'+
      p.options.map(function(o,oi){
        return '<button class="btn sm" data-co="opt" data-id="'+esc(p.id)+'" data-oi="'+oi+'">'+esc(o.label)+'</button>';
      }).join("")+
      '<button class="btn sm ghost" data-co="keep" data-id="'+esc(p.id)+'">Keep it</button>'+
    '</div></div>';
}
function coachCard(){
  var open=coachOpen();
  if(!open.length) return "";
  return '<div class="card co"><div class="eyebrow" style="margin-bottom:8px">Coach</div>'+
    open.map(function(p){ return coachCardHtml(p,true); }).join("")+'</div>';
}
function coachSection(){
  var c=coachState(), open=coachOpen(), ready=aiReady(), ai=coachLastAi(), now=Date.now();
  var recent=c.proposals.filter(function(p){ return p.status!=="open"&&now-(num(p.decided)||p.ts)<60*864e5; })
    .sort(function(a,b){ return (num(b.decided)||b.ts)-(num(a.decided)||a.ts); }).slice(0,5);
  var html='<div class="row" style="margin-bottom:7px"><div class="eyebrow">Coach</div>'+
    '<span class="tiny muted" style="margin-left:auto">'+(c.lastCheck?"rules checked "+esc(relDate(c.lastCheck)):"rules not run yet")+'</span></div>';
  if(!open.length&&!recent.length&&!ready&&!ai&&!coachTally()){
    return html+'<div class="tiny muted" style="margin:-2px 0 12px">Nothing to suggest right now. '+
      (S.sessions.length<COACH_MIN_SESSIONS?"The coach starts after "+COACH_MIN_SESSIONS+" sessions.":
        "It looks at the log every two weeks and suggests, never changes, your plan.")+'</div>';
  }
  html+='<div class="card co" style="margin-bottom:12px">';
  if(open.length) html+=open.map(function(p){ return coachCardHtml(p,false); }).join("");
  else html+='<div class="tiny muted">Nothing to suggest right now. The coach suggests; it never changes your plan by itself.</div>';
  if(ready){
    var due=!ai||now-ai.ts>=COACH_EVERY;
    html+='<div class="co-p"><div class="co-t">Check-in with Claude</div>';
    if(ai){
      html+='<div class="co-r">'+esc(ai.summary||"")+'</div>';
      if(ai.questions&&ai.questions.length)
        html+='<div class="co-r"><b>Claude asks</b><ul class="co-q">'+ai.questions.map(function(q){ return '<li>'+esc(q)+'</li>'; }).join("")+'</ul></div>';
      if(ai.extra) html+='<div class="co-e">Claude suggested '+(ai.raised+ai.extra)+' changes; the coach shows '+COACH_OPEN_MAX+' at a time.</div>';
      html+='<div class="co-e">'+(ai.raised?plural(ai.raised,"suggestion")+" above. ":"Nothing to change. ")+esc(ai.model||"")+
        ' · '+esc(relDate(ai.ts))+'</div>';
    } else html+='<div class="co-r">Claude reads your plan, sessions and notes and suggests up to three changes. It never sets weights or reps.</div>';
    if(due&&ai) html+='<div class="co-e">It has been '+Math.floor((now-ai.ts)/864e5)+' days since the last one — a check-in is due.</div>';
    if(COACH_UI.err) html+='<div class="co-r" style="color:var(--bad-ink)">'+esc(COACH_UI.err)+'</div>';
    html+='<div class="co-o"><button class="btn sm '+(due?"primary":"")+'" data-co="ask"'+(COACH_UI.busy?' disabled':"")+'>'+
      (COACH_UI.busy?"Asking Claude…":"Ask Claude for a check-in")+'</button></div></div>';
  }
  var tally=coachTally();
  if(tally) html+='<div class="co-p"><div class="co-r" data-coach-tally>'+esc(tally)+'</div>'+
    '<div class="co-e">Swaps, extra sets and lower ranges count when a lift progressed; trims and supersets when the day got shorter or fewer lifts were missed.</div></div>';
  if(recent.length){
    html+='<div class="co-p"><div class="eyebrow" style="margin-bottom:6px">Recent decisions</div>'+
      recent.map(function(p){
        var undo=p.status==="accepted"&&p.undo;
        return '<div class="co-d"><span>'+(p.status==="accepted"?"Did: "+esc(p.chosen||p.title):
          (p.undone?"Undone: ":p.expired?"Let go: ":"Kept: ")+esc(p.title))+
          ' <span class="muted">· '+esc(relDate(num(p.decided)||p.ts))+'</span></span>'+
          (undo?'<button class="btn sm ghost" data-co="undo" data-id="'+esc(p.id)+'">Undo</button>':"")+'</div>';
      }).join("")+'</div>';
  }
  return html+'</div>';
}
function coachTap(el){
  var a=el.dataset.co, id=el.dataset.id;
  if(a==="opt") coachApply(id,+el.dataset.oi);
  else if(a==="keep") coachKeep(id);
  else if(a==="undo") coachUndo(id);
  else if(a==="ask") coachAsk();
}

/* ============================ v27: the check-in with Claude ============================
   On demand from the Coach section, and offered (never run) once 14 days have
   passed. A compact summary of the log goes to aiCall(); the answer is checked
   against the CURRENT plan and anything that doesn't hold is dropped, so a
   hallucinated lift can't become a button. Nothing is ever applied by itself:
   what survives becomes ordinary proposals with the same cards, choices and
   undo as the rules'. The summary is built from S only — the AI key and the
   GitHub token live under their own storage keys and never get near it. */
var COACH_SYSTEM=
"You are a measured strength-and-hypertrophy coach reviewing the training log of one lifter, Nick. "+
"He trains for muscle size, mostly with dumbbells, cables and machines, on a 3-day full-body A/B/C rotation: "+
"sessions of 45 to 90 minutes, usually 2 to 3 a week. He is fine with sessions up to 1.5 hours; do not push him to shorten a day that stays under that. The app (Iron Log) already progresses his weights and reps by itself.\n\n"+
"What you may and may not do:\n"+
"- You never set, change or suggest weights, rep targets, percentages or progression. The app's engine owns all of that. The one exception is the fixed action shift_range below, which only moves a lift's whole rep range down.\n"+
"- You may only propose changes from this fixed list: swap (replace a lift with a close variation), trim_sets (drop 1 or 2 sets from a lift), "+
"remove (take a lift out of its day), add_set (add 1 or 2 sets to a lift), pair (make two adjacent, currently unpaired lifts on the same day a superset), "+
"unpair (take a lift out of its superset), shift_range (move a lift's rep range down by 1 to 3 reps, which makes the same reps heavier; use it, or add_set, before swap for a lift that has stalled). "+
"Nothing else: no new training days, no schedule, diet or supplement advice. Never suggest face pulls in any form: he has tried every variation and none feels right.\n"+
"- Propose at most 3 changes, and usually fewer. Quality over quantity. Nick confirms each one by hand; nothing is applied automatically.\n"+
"- When you suggest trimming sets or removing a lift, also name a similar exercise in `replacement` that he could swap in instead: "+
"a close variation that trains the same muscle with similar equipment. For swap, `replacement` is the new exercise. "+
"For pair, `replacement` is the partner lift's exact name from the plan. Otherwise leave it empty.\n"+
"- Use lift names exactly as they appear in the plan. `sets` is the number of sets to drop (trim_sets) or add (add_set), 1 or 2, or the number of reps to shift down (shift_range), 1 to 3; use 0 for the other kinds.\n\n"+
"How to judge:\n"+
"- Cite the evidence from the summary in every `reason`: dates, counts, minutes, sets per week, his own notes. Never invent data that is not in the summary.\n"+
"- Weekly sets per muscle: the summary counts a set as 1 for the main muscle and 0.5 for a helper. Roughly 10 to 20 hard sets a week is the usual range associated with growth, "+
"with diminishing returns. That evidence comes from short trials, so call it guidance, not a target. At 2 to 3 sessions a week his plan gives most muscles about 7 to 9 sets, and that is by design: only flag a muscle he trains directly that is under about 6.\n"+
"- Be sceptical about stalls. Each lift is trained about once every 9 days and moves slowly in 8-12 or 12-20 rep ranges, so a few flat sessions are normal, and a long gap is not a plateau. "+
"No validated plateau rule exists; say so if you lean on one. A swap throws away a lift's history, so for a stall try add_set or shift_range first, and swap only when it has stalled again after that or a note mentions pain.\n"+
"- Read his per-lift and session notes closely. Pain, setup problems, equipment, boredom or \"hated this\" matter more than any number.\n"+
"- Do not repeat anything he already declined or that the rules already have open; both are listed in the summary.\n"+
"- Where you rely on coaching convention rather than trial evidence, say that plainly.\n"+
"- If nothing is worth changing, say so plainly: return no proposals and make the summary say that nothing needs changing.\n"+
"- You may ask him 1 or 2 short questions in `questions` if an answer would change your advice; otherwise return an empty list.\n"+
"- `summary` is 2 to 5 plain sentences about how training looks overall. No hype, no markdown.";
var COACH_KINDS=["swap","trim_sets","remove","add_set","pair","shift_range","unpair"];
var COACH_SCHEMA={
  type:"object", additionalProperties:false, required:["summary","proposals","questions"],
  properties:{
    summary:{type:"string"},
    proposals:{type:"array", items:{type:"object", additionalProperties:false,
      required:["kind","lift","replacement","sets","reason"],
      properties:{
        kind:{type:"string", enum:COACH_KINDS},
        lift:{type:"string"}, replacement:{type:"string"}, sets:{type:"integer"}, reason:{type:"string"}}}},
    questions:{type:"array", items:{type:"string"}}
  }
};

function coachYmd(ts){ return localDay(ts); }
function coachRepsText(sets,mode){
  var ws=working(sets).filter(function(x){ return x.done!==false; });
  if(!ws.length) return "";
  var same=ws.every(function(x){ return num(x.w)===num(ws[0].w); });
  return (same?(entryText(ws[0],mode)+": "):"")+ws.map(function(x){
    return (same?"":entryText(x,mode)+"x")+num(x.r)+(x.out?"*":"");
  }).join("/");
}
/* Everything Claude sees, as compact text. Notes are trimmed; the lift history
   drops to 4 exposures if the whole thing runs past ~24k characters (~6k tokens). */
function coachSummary(){
  var per=6, text="";
  for(var pass=0;pass<2;pass++){
    text=coachSummaryText(pass?4:per);
    if(text.length<=24000) break;
  }
  return text;
}
function coachSummaryText(per){
  var now=Date.now(), L=[], byId={};
  S.sessions.forEach(function(s){ byId[s.id]=s; });
  function cut(s,n){ s=String(s||"").replace(/\s+/g," ").trim(); return s.length>n?s.slice(0,n)+"…":s; }
  var first=S.sessions.length?S.sessions[S.sessions.length-1].ts:now;
  var last4w=S.sessions.filter(function(s){ return now-s.ts<28*864e5; }).length;
  L.push("TODAY "+coachYmd(now)+". Unit "+unit()+". "+S.sessions.length+" sessions logged since "+coachYmd(first)+
    "; "+last4w+" in the last 4 weeks ("+(last4w/4).toFixed(1)+" a week).");
  L.push("");
  L.push("PLAN (sets x rep range; \"+\" = superset with the lift above):");
  S.routines.forEach(function(r){
    variantsOf(r).forEach(function(v,vi){
      L.push(r.name+(variantsOf(r).length>1?" / "+variantLabel(r,vi):"")+": "+v.exercises.map(function(e){
        return (e.link?"+ ":"")+e.name+" "+num(e.sets)+"x"+num(e.reps)+(num(e.repTop)>num(e.reps)?"-"+num(e.repTop):"");
      }).join(" | "));
    });
  });
  var ss=[];
  S.routines.forEach(function(r){ variantsOf(r).forEach(function(v){
    var cur=null;
    v.exercises.forEach(function(e){
      if(e.link&&cur) cur.push(e.name); else { if(cur&&cur.length>1) ss.push(r.name+": "+cur.join(" + ")); cur=[e.name]; }
    });
    if(cur&&cur.length>1) ss.push(r.name+": "+cur.join(" + "));
  }); });
  L.push("SUPERSETS NOW: "+(ss.length?ss.join("; "):"none"));
  L.push("");
  L.push("LIFTS (last "+per+" exposures, newest first; format date load: reps per set, * = the last-set rep-out; then his note):");
  trackedLifts().forEach(function(name){
    var h=exSessions(name).slice(0,per), t=trend(name), days=[], k=normName(name);
    S.routines.forEach(function(r){ if(variantsOf(r).some(function(v){ return v.exercises.some(function(e){ return normName(e.name)===k; }); })) days.push(r.key); });
    var sk=[];
    S.routines.forEach(function(r){
      if(days.indexOf(r.key)<0) return;
      var l4=coachDaySessions(r,name).slice(0,4);
      if(l4.length===4){ var n=l4.filter(function(s){ return !coachDone(s,name); }).length; if(n) sk.push(r.name+" "+n+"/4"); }
    });
    var all=exSessions(name), gaps=[];
    for(var gi=0;gi+1<all.length&&gi<14;gi++) gaps.push({d:(all[gi].ts-all[gi+1].ts)/864e5, a:all[gi+1].ts, b:all[gi].ts});
    var longGaps=gaps.filter(function(g){ return g.d>14; }).slice(0,2)
      .map(function(g){ return coachYmd(g.a)+" to "+coachYmd(g.b)+" ("+Math.round(g.d)+" d)"; });
    var cadence=gaps.length?"every ~"+Math.round(coachMedian(gaps.map(function(g){ return g.d; })))+" d"+
      (longGaps.length?", GAP over 14 d: "+longGaps.join(", "):""):"";
    L.push(name+" ["+days.join(",")+"] "+cadence+"; trend "+(t.state==="new"?"too new":t.state+" "+(t.pct>=0?"+":"")+t.pct.toFixed(1)+"%")+
      (sk.length?"; SKIPPED in last 4 sessions of the day: "+sk.join(", "):"")+(h.length?"":"; no history"));
    h.forEach(function(x){
      var se=byId[x.sessionId], ex=se&&se.exercises.filter(function(e){ return normName(e.name)===k; })[0];
      var note=ex&&String(ex.note||"").trim();
      L.push("  "+coachYmd(x.ts)+(x.deload?" (deload)":"")+" "+coachRepsText(x.sets,x.bw)+(note?"  NOTE: "+cut(note,240):""));
    });
  });
  L.push("");
  L.push("WEEKLY SETS PER MUSCLE (a helper counts 0.5; last 4 complete weeks, oldest first, then this week so far):");
  var wk=[4,3,2,1,0].map(weekBounds), cols=wk.map(function(b){ return setsByMuscle(b.start,b.end).by; });
  MUSCLES.forEach(function(m){
    var v=cols.map(function(c){ return fmt(c[m.k]); });
    if(cols.every(function(c){ return !c[m.k]; })) return;
    L.push("  "+m.n+": "+v.slice(0,4).join(", ")+"  (this week "+v[4]+")");
  });
  L.push("");
  L.push("SESSIONS (newest first; active = minutes between logged sets with breaks over 15 min left out, the reliable one; first-to-last-set is often inflated because he ticks sets later; ? if unknown):");
  S.sessions.slice(0,8).forEach(function(s){
    var d=coachActiveMin(s), sp=coachSpanMin(s), n=0;
    s.exercises.forEach(function(e){ n+=working(e.sets).length; });
    L.push("  "+coachYmd(s.ts)+" "+s.name+(s.deload?" (deload)":"")+": "+(d===null?"?":Math.round(d))+" min active, "+
      (sp===null?"?":Math.round(sp))+" min first-to-last-set, "+n+" working sets");
  });
  var notes=S.sessions.filter(function(s){ return now-s.ts<21*864e5&&String(s.note||"").trim(); });
  if(notes.length){
    L.push("");
    L.push("SESSION NOTES (last 3 weeks):");
    notes.forEach(function(s){ L.push("  "+coachYmd(s.ts)+" "+s.name+": "+cut(s.note,300)); });
  }
  var pr=coachState().proposals.filter(function(p){ return now-(num(p.decided)||p.ts)<60*864e5; });
  if(pr.length){
    L.push("");
    L.push("THE APP'S OWN RULE SUGGESTIONS (open or decided in the last 60 days; do not repeat the ones he kept):");
    pr.forEach(function(p){
      L.push("  ["+(p.status==="skipped"?(p.undone?"undone":p.expired?"ignored":"he kept it as it is"):p.status)+"] "+p.source+" "+p.kind+": "+
        p.lift+" — "+cut(p.reason,200));
    });
  }
  return L.join("\n");
}

/* Keep only what holds against the plan as it is now. Returns {ok:[proposal],
   dropped:[why]}; at most 3 survive. */
function coachValidate(list){
  var ok=[], dropped=[];
  (Array.isArray(list)?list:[]).forEach(function(x){
    function no(why){ dropped.push(why+" ("+(x&&x.kind)+" "+(x&&x.lift)+")"); }
    if(!x||typeof x!=="object") return no("not an object");
    var kind=String(x.kind||""), lift=String(x.lift||"").trim(), rep=String(x.replacement||"").trim();
    var n=Math.round(num(x.sets)), reason=String(x.reason||"").trim();
    if(COACH_KINDS.indexOf(kind)<0) return no("unknown kind");
    if(!lift) return no("no lift");
    if(ok.length>=3) return no("over the limit of 3");
    if(ok.some(function(q){ return normName(q.lift)===normName(lift); })) return no("second change to the same lift");
    var tg=coachTargets(lift);
    if(!tg.length) return no("lift not in the plan");
    lift=tg[0].e.name;
    var opts=[], title="";
    if(kind==="swap"){
      if(!rep||normName(rep)===normName(lift)) return no("no replacement");
      if(coachInPlan(rep)) return no("replacement already in the plan");
      opts=[{act:"swap", lift:lift, to:rep, label:"Swap for "+rep}]
        .concat(coachSwapOpts(lift,2,rep));
      title="Swap "+lift;
    } else if(kind==="trim_sets"){
      if(n<1||n>2) return no("bad number of sets");
      if(tg.some(function(t){ return num(t.e.sets)-n<2; })) return no("would leave fewer than 2 sets");
      opts=[{act:"trim", lift:lift, n:n, label:"Trim "+plural(n,"set")+" from "+lift}];
      if(rep&&normName(rep)!==normName(lift)&&!coachInPlan(rep)) opts.push({act:"swap", lift:lift, to:rep, label:"Swap for "+rep});
      else opts=opts.concat(coachSwapOpts(lift,2));
      title="Trim "+plural(n,"set")+" from "+lift;
    } else if(kind==="remove"){
      if(tg.some(function(t){ return t.v.exercises.length<2; })) return no("would empty a day");
      opts=[{act:"remove", lift:lift, label:"Take "+lift+" out"}];
      if(rep&&normName(rep)!==normName(lift)&&!coachInPlan(rep)) opts.push({act:"swap", lift:lift, to:rep, label:"Swap for "+rep});
      else opts=opts.concat(coachSwapOpts(lift,2));
      title="Take "+lift+" out";
    } else if(kind==="shift_range"){
      if(n<1||n>3) return no("bad shift");
      if(tg.some(function(t){ return num(t.e.reps)-n<3; })) return no("range would go below 3 reps");
      opts=[{act:"shift_range", lift:lift, n:n, label:"Lower "+lift+"'s range by "+plural(n,"rep")}];
      title="Lower "+lift+"'s rep range by "+n;
    } else if(kind==="unpair"){
      if(!tg.some(function(t){ var ex=t.v.exercises; return ex[t.ei].link||(ex[t.ei+1]&&ex[t.ei+1].link); })) return no("not in a superset");
      opts=[{act:"unpair", lift:lift, label:"Take "+lift+" out of its superset"}];
      title="Take "+lift+" out of its superset";
    } else if(kind==="add_set"){
      if(n<1||n>2) return no("bad number of sets");
      if(tg.some(function(t){ return num(t.e.sets)+n>6; })) return no("too many sets");
      opts=[{act:"add", lift:lift, n:n, label:"Add "+plural(n,"set")+" to "+lift}];
      title="Add "+plural(n,"set")+" to "+lift;
    } else {
      var adj=false;
      tg.forEach(function(t){
        var ex=t.v.exercises, i=t.ei;
        if(ex[i+1]&&normName(ex[i+1].name)===normName(rep)&&!ex[i].link&&!ex[i+1].link&&!(ex[i+2]&&ex[i+2].link)) adj=true;
      });
      if(!rep||!adj) return no("not two adjacent unpaired lifts");
      var partner=coachTargets(rep)[0].e.name;
      opts=[{act:"pair", lift:lift, with:partner, label:"Superset "+lift+" + "+partner}];
      title="Superset "+lift+" + "+partner;
    }
    if(!reason) return no("no reason");
    var p=coachMk({source:"claude", kind:kind, key:"ai|"+kind+"|"+normName(lift), lift:lift,
      title:title, reason:reason, options:opts});
    if(coachBlocked(p)==="cooling") return no("kept recently");
    ok.push(p);
  });
  return {ok:ok, dropped:dropped};
}
/* Take Claude's answer: validate, make room (his own request outranks the
   rules'), record the check-in, save. */
function coachTake(r){
  var j=r.json||{}, c=coachState(), now=Date.now();
  var v=coachValidate(j.proposals);
  v.dropped.forEach(function(d){ if(window.console) console.log("coach: dropped a Claude proposal — "+d); });
  var shown=v.ok.slice(0,COACH_OPEN_MAX), extra=v.ok.length-shown.length;
  /* Last time's open Claude cards are replaced by this answer, and a rules card
     on a lift Claude has now spoken about would only say the same thing twice. */
  c.proposals=c.proposals.filter(function(p){
    return !(p.status==="open"&&(p.source==="claude"||shown.some(function(q){ return normName(q.lift)===normName(p.lift); })));
  });
  var open=c.proposals.filter(function(p){ return p.status==="open"; });
  while(open.length+shown.length>COACH_OPEN_MAX&&open.length){
    var gone=open.shift();                       // the oldest rule card makes way
    c.proposals=c.proposals.filter(function(p){ return p!==gone; });
  }
  shown.forEach(function(p){ c.proposals.push(p); });
  var u=r.usage||{};
  c.history.unshift({type:"claude", ts:now, model:String(r.model||""),
    usage:{input:num(u.input_tokens), output:num(u.output_tokens)},
    summary:String(j.summary||"").slice(0,1800),
    questions:(Array.isArray(j.questions)?j.questions:[]).slice(0,2).map(function(q){ return String(q).slice(0,300); }),
    raised:shown.length, extra:Math.max(0,extra), dropped:v.dropped.length});
  coachPrune();
  writeNow();
  return shown.length;
}
function coachAsk(){
  if(COACH_UI.busy) return;
  if(!aiReady()){ toast("Add an API key in Settings → AI coach first"); return; }
  COACH_UI.busy=true; COACH_UI.err="";
  coachRefresh();
  var content;
  try{ content=coachSummary(); }
  catch(e){ COACH_UI.busy=false; if(window.console) console.error("coach summary:",e); toast("Couldn't put the summary together"); coachRefresh(); return; }
  aiCall({system:COACH_SYSTEM, content:content, schema:COACH_SCHEMA, maxTokens:16000, effort:"high"})
    .then(function(r){
      COACH_UI.busy=false;
      var n=coachTake(r);
      coachRefresh();
      toast(n?plural(n,"suggestion")+" from Claude":"Claude has nothing to change");
    })
    .then(null,function(err){
      COACH_UI.busy=false;
      if(!err||!err.userMsg){ if(window.console) console.error("coach:",err); }
      COACH_UI.err=(err&&err.userMsg)||"Couldn't read Claude's answer — try again.";
      coachRefresh(); toast(COACH_UI.err);
    });
}

self.__ilf=(self.__ilf||0)+1;
