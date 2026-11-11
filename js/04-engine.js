"use strict";
/* ============================ the progression engine ============================
   Read what you actually did last time, then decide today. All derived from
   history, so nothing can drift out of sync.

     double progression : hold the weight until every working set reaches the top
                          of the range, then add load and drop back to the bottom
     straight sets      : hit the target on every set, then add load
     autoregulation     : a lift sliding for 3 sessions gets one 10% back-off —
                          once, not compounding, and never more than MAX_CUT
     deload week        : while one is running, everything goes light and short
   ============================================================================== */
function stepFor(ex){ return num(ex.inc)||num(S.settings.inc)||5; }

/* On assisted work the number is help, so progress means the number goes DOWN.
   Everywhere else harder means the number goes up. */
function harder(w,step,mode){ return mode===2?Math.max(0,w-step):w+step; }
function easier(w,step,mode){
  if(mode===2) return w+step;                 // more assistance
  var back=Math.round(w*0.9/step)*step;       // roughly 10% off, on the step grid
  if(back>=w) back=w-step;
  return Math.max(0,back);
}
function harderPhrase(step,mode){
  return mode===2 ? "take "+fmt(step)+" "+unit()+" off the assist"
                  : "add "+fmt(step)+" "+unit();
}
/* "12s" for twelve reps, "60s" for sixty seconds — both read naturally.
   Distance has no such suffix. */
function amtText(v,m){ return m===2?String(v):(v+"s"); }
function rpeMean(sets){
  var v=(sets||[]).filter(function(s){ return num(s.rpe)>0; });
  if(!v.length||v.length*2<sets.length) return 0;
  return v.reduce(function(a,s){ return a+num(s.rpe); },0)/v.length;
}

/* The load a session was trained at: the one most of its working sets were
   done at, ties going to the heavier (on assisted work, the less help). Not
   the first set — a ramp starts light and a top set with back-offs ends
   light, and reading the wrong end judged 225×8, 185×8, 135×8 as three
   eights at 225 and prescribed 135 after 130/150/170. Not the heaviest set
   either — one test set at 170 between two at 150 is not the working weight.
   A blank weight on plain loaded work is a set nobody retyped, not a set at
   zero; on bodyweight work blank genuinely means no added load. */
function blankW(s,mode){ return mode===0&&(s.w==null||String(s.w).trim()===""); }
function heavierLoad(a,b,mode){ return mode===2?a<b:a>b; }
function workLoad(sets,mode){
  var n={}, best=null;
  sets.forEach(function(s){
    if(blankW(s,mode)) return;
    var v=num(s.w); n[v]=(n[v]||0)+1;
    if(best===null||n[v]>n[best]||(n[v]===n[best]&&heavierLoad(v,best,mode))) best=v;
  });
  return best===null?0:best;
}
function isAt(s,w,mode){ return blankW(s,mode)||num(s.w)===w; }
/* Lighter sets BEFORE the first one at the working load are a ramp —
   warm-ups logged without the warm-up flag — and say nothing about it, the
   same way a session with fewer sets than planned is judged on the sets it
   has. Lighter sets AFTER it are back-offs or a weight dropped mid-exercise,
   and those are what prescribe() holds on. Counting the ramp too would hold
   anyone who pyramids up at the same weight for ever. Heavier sets anywhere
   are a bonus, not a verdict on the working load. */
function droppedSets(sets,w,mode){
  var seen=false, n=0;
  sets.forEach(function(s){
    if(isAt(s,w,mode)) seen=true;
    else if(seen&&!blankW(s,mode)&&heavierLoad(w,num(s.w),mode)) n++;
  });
  return n;
}

/* A 10% cut on the step grid is fine on a 185 lb bar and brutal on a 15 lb
   dumbbell, where the grid rounds it to a third (and a 5 lb one to zero).
   Past this the slide is answered with a set, not with load. */
var MAX_CUT=0.2;

/* ---- v25: a jump that was tried and failed is remembered, read from the log ----
   A fixed 5 lb step is 33% of a 15 lb raise and 50% of a 10 lb fly. Simulated
   over a year, prescribe() took the raise to 20 and then said "fell short — run
   it back" for a median 34 weeks, and the rep-out shadow flipped load up and
   down 198 times. Both now (a) step back when a jump observably fails and
   (b) don't retry it until the reps at the lighter load have recovered what
   that jump cost — measured from what happened, not predicted from Epley,
   which is what made the v22 jump check wrong on the real log. */
function repsAt(h,w,mode,best){
  var v=h.sets.filter(function(s){ return isAt(s,w,mode); }).map(function(s){ return num(s.r); });
  if(!v.length) return 0;
  return best?Math.max.apply(null,v):Math.min.apply(null,v);
}
/* True when the lifter stepped up to W and has met the bottom of the range at
   every session since — the case where a "down" trend is the double-progression
   reset, not a decline. */
function steppedUpAndMaking(hist,W,mode,low){
  for(var i=0;i<hist.length;i++){
    var wi=workLoad(hist[i].sets,mode);
    if(wi!==W) return i>0&&heavierLoad(W,wi,mode);
    if(repsAt(hist[i],W,mode)<low) return false;
  }
  return false;
}
/* Newest exposure (index ≥ 1) heavier than W whose previous one was at W. */
function jumpAwayFrom(hist,W,mode){
  for(var i=1;i+1<hist.length;i++){
    var Wi=workLoad(hist[i].sets,mode);
    if(heavierLoad(Wi,W,mode)&&workLoad(hist[i+1].sets,mode)===W) return {i:i,w:Wi};
  }
  return null;
}

/* v26.1 (independent review, tools/review): one lift, two ranges. The plan can
   hold the same lift at different ranges on different days — Nick's lateral
   raise is 4×12–20 on Day A and 3×8–12 on Day B — and both rows read one
   history. Topping out the 12–20 day stepped the 8–12 day up; the 12–20 day
   then missed its bottom at the new load and was cut back. Simulated over a
   year, that was 9.9 load cuts per lifter-year on the raise and a cut-fail-cut
   spiral in 96% of lifter-years; the real log bounces 10/15/20. When the plan
   holds a lift at more than one range, each row reads the exposures done at
   its own range, falling back to all of them until there is one. A range
   changed for good (one range in the plan) keeps its whole history. */
function rangeHist(hist,name,ex){
  var k=normName(name), seen={}, n=0;
  eachPlanEx(function(e){
    if(normName(e.name)!==k) return;
    var key=num(e.reps)+"-"+num(e.repTop); if(!seen[key]){ seen[key]=1; n++; }
  });
  if(n<2) return hist;
  var lo=num(ex.reps), top=num(ex.repTop);
  var same=hist.filter(function(h){ return h.lo===lo&&h.top===top; });
  return same.length?same:hist;
}

var NEAR_SLACK=2;                                     // reps the rep-out may fall short of the top
function prescribe(name,ex){
  var step=stepFor(ex);
  var met=metricOf(ex);
  var rstep=metricStep(met);
  var low=Math.max(1,num(ex.reps)||num(S.settings.repLow)||8);
  var top=num(ex.repTop)||0;
  var mode=bwMode(ex);
  var nsets=Math.max(1,num(ex.sets)||3);
  var hist=rangeHist(exWorking(name),name,ex);
  var last=hist[0];
  if(!last){
    /* v26: a lift the coach swapped in has no history to read, so the plan row
       carries a conservative starting weight (coachStartW). This branch only. */
    var sw=num(ex.startW);
    if(sw>0&&mode===0&&met===0)
      return {w:sw,r:low,sets:nsets,why:"First time — start around "+fmt(sw)+" and find your "+low,kind:"new"};
    return {w:"",r:low,sets:nsets,why:"",kind:"new"};
  }

  var w=workLoad(last.sets,mode);
  var at=last.sets.filter(function(s){ return isAt(s,w,mode); });
  /* Only the sets at the working load say anything about it. A back-off set
     of 8 at 185 is not an 8 at 225, and a dropped set of 6 at 185 is not a
     miss at 225 either. */
  var minR=Math.min.apply(null,at.map(function(s){ return num(s.r); }));
  /* Reps keep climbing while held — never pinned to the bottom (trap 17b). */
  var climb=(top>low&&minR>=low)?Math.min(top,minR+rstep):low;

  if(inDeloadWeek()){
    return {w:easier(w,step,mode),r:low,sets:Math.max(1,Math.round(nsets*0.6)),
            why:"Deload week — light and short on purpose",kind:"deload"};
  }

  /* Not straight after a step up that is being made. The trend is read from
     sets stopped at their target, so after a long climb the reset that
     follows a load step reads as a decline: since at least v23 a lifter
     getting stronger every session, who made 190×8 and 190×9 at the new
     load, was cut to 170 (t28). A same-weight slide still gets its back-off. */
  if(trend(name).state==="down"&&!steppedUpAndMaking(hist,w,mode,low)){
    /* One cut, then hold and rebuild — and the two halves of that have to be
       measured over the SAME window, or they fight each other.

       The guard used to look at the last 3 sessions while the verdict it
       guards is a slope over cycle+3 (≈9). Three obedient sessions at the cut
       weight pushed every heavier one out of the lookback, so "already backed
       off" went false while the slope still contained the pre-cut scores and
       stayed down — a second cut, then a third, every 4 sessions. Simulated
       closed-loop, that walked a lifter whose true 1RM was *rising* from
       190 lb to 115. The guard window must be at least the trend window:
       never cut again while today's load is still below the best working
       load anywhere the "down" verdict was computed from. */
    var recent=hist.slice(1,1+trendWin(name)).map(function(h){ return workLoad(h.sets,mode); });
    /* On assisted work the best session is the one with the LEAST help, so
       "peak" inverts with the load direction like harder()/easier() do. */
    var peak=recent.length?(mode===2?Math.min.apply(null,recent):Math.max.apply(null,recent)):w;
    var alreadyDown=mode===2?(w>peak):(w<peak);
    if(alreadyDown)
      /* Hold the load, but let the reps keep climbing. Pinning them to the
         bottom of the range every session meant an obedient lifter could never
         produce a rising e1RM — the hold suppressed exactly the evidence that
         would clear the verdict, so the verdict never cleared. */
      /* Same hold either way; say who backed off. When the heavier sessions
         in the window all predate a drop he chose (sinceChosenDrop), "already
         backed off" credits the app with his decision. External review
         (Argon) proposed reading the guard from sinceChosenDrop() instead —
         on the real log that turns this hold into a 10% cut (55 → 50) off a
         four-session dip after a 25-day gap, so only the words change. */
      return {w:w,r:climb,sets:nsets,
              why:sinceChosenDrop(hist).slice(1).some(function(h){ return heavierLoad(workLoad(h.sets,mode),w,mode); })||
                  sinceChosenDrop(hist).length===hist.length?
                  "Already backed off — beat this before adding":
                  "You dropped to "+fmt(w)+" — build reps here before adding",kind:"hold"};
    if(mode===1&&w<=0)
      return {w:0,r:climb,sets:Math.max(1,nsets-1),
              why:"Sliding 3 sessions — drop a set rather than adding load",kind:"deload"};
    var back=easier(w,step,mode);
    /* On a light dumbbell the step grid turns 10% into a third, or into
       nothing at all (5 lb "backed off to 0"). Take a set instead, and keep
       the reps free to climb so a recovered lifter can clear the verdict —
       the same reason the hold above doesn't pin them. */
    if(back===w||(mode!==2&&w-back>w*MAX_CUT))
      return {w:w,r:climb,sets:Math.max(1,nsets-1),why:"Sliding 3 sessions — drop a set this week",kind:"deload"};
    return {w:back,r:low,sets:nsets,why:"Sliding 3 sessions — back off to "+fmt(back),kind:"deload"};
  }

  /* If last time was already a grind, adding load buys a stall. Only fires
     when RPE was actually recorded on at least half the working sets, so it is
     invisible to anyone not using the feature. */
  var rp=rpeMean(last.sets);
  if(rp>=9.5)
    return {w:w,r:Math.max(low,minR),sets:nsets,
            why:"Averaged RPE "+fmt(rp)+" last time — repeat it before adding",kind:"hold"};

  /* A plank or an unloaded carry has nothing to add weight to, so the metric
     itself is the progression axis and the range top is a floor, not a cap. */
  var noLoad=met!==0&&mode===0&&!(w>0);
  var nextR=Math.min(top||1e9,minR+rstep);

  /* Some sets after the first at the working load were lighter: a top set
     and back-offs, or dropping the weight mid-exercise. Adding reps or load on the strength
     of one set would ask for three at a weight that has only ever been done
     once. Get them all there first. */
  var dropped=droppedSets(last.sets,w,mode);
  if(dropped>0&&!noLoad)
    return {w:w,r:(top>low)?Math.max(low,Math.min(top,minR)):low,sets:nsets,
            why:"Only "+at.length+" of "+(at.length+dropped)+" sets at "+entryText({w:w},mode)+" — get them all there first",
            kind:"hold"};

  /* v26.2: a rep-out one or two reps under the top still earns the jump.
     The last working set of a ranged lift is a rep-out, taken as far as the
     lifter can, so it ends under the earlier sets from fatigue alone: 12, 12,
     11 at 8–12 is a top-of-range session. The strict rule (every set at the
     top) held it, and the next target was then built from the 11 — the target
     slid 12 → 10 off one tired set and the load lagged. In the 20-seed
     simulated year, prescriptions were >=1 step lighter than the heaviest
     load that still gives mid-range reps in 37.3% of exposures (mean |steps
     off| 0.82). Letting the last set be NEAR_SLACK short, with every earlier
     set at the top: SLACK 1 -> 33.7% / 0.72, SLACK 2 -> 31.9% / 0.68 (paired
     over seeds -5.5 +/- 0.5 points), with over-loading (5.9 -> 5.4%), unmeetable
     loads (7.65 -> 7.6 a year) and direction flips (14.4 -> 14.85) all inside
     one paired se. SLACK 2 was kept. Two things are deliberately NOT here:
       - A relative-step gate (strict rule on big jumps like 15 -> 20). It was
         measured: gating at step <= 10% of the load drops the gain on light
         lifts and raises over-loading (+0.13 +/- 0.06 points); gating at 20%
         raises unmeetable loads and flips by about 2 paired se, from 10-20%
         steps on pushdowns and split squats — while the lateral raise (+33%)
         got *better* (42 -> 22 unmeetable exposures over 20 years; the failed-
         jump memory below and the step-back catch a jump that doesn't hold).
         So the gain and the harm do not track step size.
       - Any change to the target. After 12, 12, 9 it still says "go for 10"
         (measured: moving it buys no load accuracy).
     Needs two sets at the load (one earlier set is not a pattern), a loaded
     lift (a bodyweight jump from nothing to +5 lb is not a step), and the
     near-miss still clears the bottom of the range; dropped sets, RPE, deload
     and trend back-off have already returned above. Real lifters stop at the
     target (trap 17c), so real logs rarely show this; a replay of the
     owner's log changed 1 of 102 prescriptions (25x12,12,11 on a curl). */
  /* Sprint review: only rep-counted lifts (a timed or distance lift has no
     rep-out, and 2 s is not a fatigue margin); every planned set logged at the
     load (12, 11 and a skipped third set is a short session, not a rep-out);
     and the slack shrinks on narrow ranges, so 10, 10, 8 at 8–10 — a last
     set on the floor — does not count (slack is at most half the range). */
  var nm=false, nmR=0, nmSlack=Math.min(NEAR_SLACK,Math.floor((top-low)/2));
  if(top>low&&met===0&&!noLoad&&at.length>=Math.max(2,nsets)&&w>0){
    nmR=num(at[at.length-1].r);
    nm=nmR>=Math.max(low,top-nmSlack)&&at.slice(0,-1).every(function(s){ return num(s.r)>=top; });
  }

  if(top>low){                                        // double progression
    if(minR>=top||nm){
      if(noLoad) return {w:w,r:minR+rstep,sets:nsets,
              why:"Held "+amtText(top,met)+" on every set — go for "+(minR+rstep),kind:"up"};
      /* The last jump from here failed? Not again until the reps here have
         recovered what it cost, and let them run past the top meanwhile. */
      var jf=jumpAwayFrom(hist,w,mode);
      if(jf&&repsAt(hist[jf.i],jf.w,mode)<low-1){
        var cost=repsAt(hist[jf.i+1],w,mode,true)-repsAt(hist[jf.i],jf.w,mode,true);
        if(repsAt(last,w,mode,true)<low+cost)
          return {w:w,r:minR+rstep,sets:nsets,
                  why:"Building reps before "+fmt(jf.w)+" again (it cost "+cost+" reps last time) — go for "+(minR+rstep),kind:"reps"};
      }
      return {w:harder(w,step,mode),r:low,sets:nsets,
              why:(minR>=top?"Hit "+amtText(top,met)+" on every set":
                     "Hit "+top+", "+(at[at.length-1].out?"rep-out ":"last set ")+nmR)+" — "+harderPhrase(step,mode),kind:"up"};
    }
    if(minR>=low)
      return {w:w,r:nextR,sets:nsets,
              why:(noLoad?"Same as last time":"Same weight")+" — go for "+nextR+" this time",kind:"reps"};
    /* Out of reach for now — so step back, rather than "run it back" for
       months. Judged on the BEST set at the load, not the worst: replayed on
       the real log, judging by the worst set cut an incline press after
       65×8,6,4 (fatigue, not failure — next session was 65×8×3) and halved a
       cable fly after 20×10,14,16. Right after a jump, go back to the load
       it came from whatever the percentage, since that load was being made.
       At an established load, only after two sessions in a row and never by
       more than MAX_CUT; a 10 lb step on a 20 lb fly holds instead. Plain
       shortfalls only — never on top of the trend back-off above (17b). */
    if(!noLoad&&hist[1]&&repsAt(last,w,mode,true)<low){
      var w1=workLoad(hist[1].sets,mode), bk=0;
      if(heavierLoad(w,w1,mode)) bk=w1;
      else if(w1===w&&repsAt(hist[1],w,mode,true)<low&&last.lo===hist[1].lo){
        bk=mode===2?w+step:Math.max(0,w-step);
        if(mode!==2&&w-bk>w*MAX_CUT) bk=0;
      }
      if(bk&&bk!==w) return {w:bk,r:low,sets:nsets,
        why:"Couldn't reach "+amtText(low,met)+" at "+fmt(w)+" — back to "+fmt(bk)+" and build up",kind:"deload"};
    }
    return {w:w,r:low,sets:nsets,why:"Fell short of "+amtText(low,met)+" — run it back",kind:"hold"};
  }

  if(minR>=low){                                      // straight sets
    if(noLoad) return {w:w,r:minR+rstep,sets:nsets,
            why:"Hit all "+amtText(low,met)+" — go for "+(minR+rstep),kind:"up"};
    return {w:harder(w,step,mode),r:low,sets:nsets,
            why:"Hit all "+amtText(low,met)+" — "+harderPhrase(step,mode),kind:"up"};
  }
  return {w:w,r:low,sets:nsets,why:"Missed "+amtText(low,met)+" last time — run it back",kind:"hold"};
}

/* ============================ v24: rep-out shadow ============================
   The last working set of a ranged rep exercise is a rep-out: as many as you
   can (compounds stop one short of form breaking, isolation goes to failure).
   That is the one number in the log that measures capacity rather than echoing
   the target, and shadowPrescribe() decides the next session from it alone.

   It is a SHADOW: shown beside prescribe()'s answer, applied only when you
   tap Use, recorded either way, so whether it should replace double
   progression is decided from evidence (ROADMAP v24/v25), not assumed.

   APRE-style (Mann 2010), relative to the range and counted in equipment
   steps. No e1RM anywhere, so it is valid at 12–20 reps where rep-to-1RM
   formulas aren't (Reynolds 2006):
     A < low−1        one step lighter       working sets at low
     low−1 ≤ A < low  hold                   working sets at low
     low ≤ A < top    hold                   working sets at A
     top ≤ A < top+4  one step heavier       working sets at low
     A ≥ top+4        two steps heavier      working sets at low
   The step comes when the rep-out REACHES the top, not when it passes it.
   The rep-out is the last set, already tired by the ones before it, so it
   reads about three reps under fresh capacity; waiting for top+1 asked for
   more reserve than double progression ever does, and in the closed loop
   (t32) a lifter with reserve parked at 195 while v23's engine reached 200.
   Working sets match the rep-out's count for the same reason: sets 1–2 are
   fresher than the set that produced A, so A reps leaves them 2–3 short of
   failure — inside the 1–3 the evidence supports. A−2 left about five.
   =============================================================================== */
var OUT_JUMP2=4;
function repOutApplies(ex){ return metricOf(ex)===0&&num(ex.repTop)>num(ex.reps); }
function repOutHint(name){
  return movementClass(name)==="iso"?"take it to failure":"stop 1 short of form breaking";
}
function repOutOf(h){
  var o=h.sets.filter(function(x){ return x.out; });
  return o.length?o[o.length-1]:null;
}
function shadowPrescribe(name,ex){
  if(inDeloadWeek()||!repOutApplies(ex)) return null;
  var low=Math.max(1,num(ex.reps)), top=num(ex.repTop), mode=bwMode(ex);
  var step=stepFor(ex), nsets=Math.max(1,num(ex.sets)||3);
  var hist=rangeHist(exWorking(name),name,ex), last=hist[0];   // v26.1: own range's exposures (rangeHist)
  var o=last&&repOutOf(last);
  if(!o) return null;
  /* The rep-out has to be AT the working load to say anything about it.
     External review (Argon), confirmed on the real log: after RDL
     225×8, 185×8, 135×8 the shadow read the last set and suggested 135×8;
     after Cable Row 75×8, 75×8, 65×10 it suggested 65. A set dropped after
     the working load is a back-off, not a measurement — hold there exactly
     as prescribe() does, and let the next real rep-out decide. */
  var wl=workLoad(last.sets,mode);
  var W=blankW(o,mode)?wl:num(o.w), A=num(o.r);
  if(W!==wl||droppedSets(last.sets,wl,mode)>0){
    var atW=last.sets.filter(function(x){ return isAt(x,wl,mode); });
    var mr=atW.length?Math.min.apply(null,atW.map(function(x){ return num(x.r); })):low;
    return {w:wl, r:Math.max(low,Math.min(top,mr)), sets:nsets, steps:0, stall:false,
            why:"last set was lighter than "+fmt(wl)+" — hold there and get every set to it"};
  }
  var k=A<low-1?-1:A<top?0:A<top+OUT_JUMP2?1:2;
  var held="";
  /* (b) Two steps only when two steps are a small jump: the +2 rule fired 142
     times in 20 simulated years and every one was over 10% (10 → 20 on a fly).
     Measured on the load actually moved — on assisted work that is bodyweight
     minus the help, not the help. */
  if(k===2&&2*step>0.10*effLoad(W,mode,num(S.settings.bodyweight))) k=1;
  /* (a) The last jump from W failed: don't retry it until the mean of the
     newest two rep-outs at W has recovered what it cost. The cost is smoothed
     over up to three rep-outs before the jump — one noisy pair blocked a
     curl for good in simulation. */
  if(k>0){
    for(var i=1;i+1<hist.length;i++){
      var oh=repOutOf(hist[i]), op=repOutOf(hist[i+1]);
      if(!oh||!op) continue;
      if(heavierLoad(num(oh.w),W,mode)&&num(op.w)===W){
        if(num(oh.r)<low-1){
          var pre=[];
          for(var y=i+1;y<hist.length&&pre.length<3;y++){
            var q=repOutOf(hist[y]); if(!q||num(q.w)!==W) break; pre.push(num(q.r));
          }
          var cost=pre.reduce(function(a,b){ return a+b; },0)/pre.length-num(oh.r);
          var o2=hist[1]&&repOutOf(hist[1]);
          var now2=(o2&&num(o2.w)===W)?(A+num(o2.r))/2:A;
          if(now2<low-1+cost){ k=0; held=num(oh.w); }
        }
        break;
      }
    }
  }
  /* (c) One low rep-out at an established load is a bad day, not a reason to
     cut: step down only straight after a jump, or when the rep-out before
     this one, at this load, was short too. 9.3 → 2.6 false compound cuts a
     year in simulation. */
  var bad=false;
  if(k<0&&hist[1]){
    var pw=workLoad(hist[1].sets,mode), po=repOutOf(hist[1]);
    if(!heavierLoad(W,pw,mode)&&!(po&&num(po.w)===W&&num(po.r)<low)){ k=0; bad=true; }
  }
  var w=W;
  if(k<0) w=mode===2?W+step:Math.max(0,W-step);
  for(var j=0;j<k;j++) w=harder(w,step,mode);
  if(k<0&&w===W) k=0;                        // nothing lighter to go to
  /* While a jump is being earned the working sets follow the rep-out past
     the top — rep progression grows muscle about as well as load (Plotkin
     2022), and it is what earns the jump back. */
  var r=k===0?(held!==""&&A>=top?A:Math.max(low,Math.min(top,A))):low;
  /* A last set that reads exactly the prefilled target says "I ticked it",
     not "that was all I had" — and half of Nick's logged exercises sit
     exactly on target. Taken at face value the method then repeats the same
     number for ever. If every set at the load made that target, ask for one
     more, as double progression would. External review (Argon); simulated
     year: sessions progressing 38% → 55%, and for a lifter who ticks the
     prefill half the time 25% → 58%, with unreachable loads, flips and the
     85% gate unchanged. (Its other two ideas — step compounds at top−1 twice,
     and never lower the target on one low day — were simulated too: the first
     changed nothing, the second made progress slower.) */
  if(k===0&&held===""&&!bad&&A>=low&&last.tgt&&A===last.tgt&&last.tgt<top&&repsAt(last,W,mode)>=last.tgt)
    r=Math.min(top,last.tgt+1);
  var why=held!==""?"last set "+A+" — building reps before "+fmt(held)+" again":
          bad?"last set "+A+", one low day — repeat it":
          k===2?"last set "+A+", well past "+top+" — two steps up":
          k===1?"last set "+A+", at the top — one step up":
          k<0?"last set "+A+", under "+low+" — one step down":
          A<low?"last set "+A+" — repeat it":"last set "+A+" — same weight";
  /* No stall flag (v25). Simulated, the v24 rule fired on ~35% of exposures
     while strength was rising, and a stricter slope rule caught only 47% of
     real plateaus. It comes back with v26's coach, with a rule that can tell
     slow progress from none. */
  return {w:w,r:r,sets:nsets,why:why,steps:k,stall:false};
}

self.__ilf=(self.__ilf||0)+1;
