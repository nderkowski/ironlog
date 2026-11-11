"use strict";
/* ============================ the progression engine ============================
   Read what you actually did last time, then decide today. All derived from
   history, so nothing can drift out of sync.

     double progression : hold the weight until every working set reaches the top
                          of the range, then add load and drop back to the bottom
     straight sets      : hit the target on every set, then add load
     step-back          : a load that cannot reach the bottom of the range is
                          given up for the one it came from, never by more than
                          MAX_CUT (the trend no longer cuts load: 2.0)
     deload week        : while one is running, everything goes light and short
   ============================================================================== */
function stepFor(ex){ return num(ex.inc)||num(S.settings.inc)||5; }

/* ---- 2.0: how a lift is loaded (scheme) and stack weights (pins) ----
   schemeOf(): the scheme that actually applies. "topback" is one top set and
   back-offs, and only means anything on plain loaded work.
   pins: a machine whose weights aren't evenly spaced. When a row has two or
   more, every notch (harder, easier, step-back, back-offs, the card's ± step)
   lands on one of them. Typed as the number the machine is set to, so on
   assisted work "harder" is the next pin DOWN. */
function schemeOf(ex){ return ex&&ex.scheme==="topback"&&bwMode(ex)===0&&metricOf(ex)===0?"topback":"double"; }
function pinsOf(ex){ return ex&&Array.isArray(ex.pins)&&ex.pins.length>=2?ex.pins:[]; }
function pinUp(w,p){ for(var i=0;i<p.length;i++) if(p[i]>w+1e-9) return p[i]; return null; }
function pinDown(w,p){ for(var i=p.length-1;i>=0;i--) if(p[i]<w-1e-9) return p[i]; return null; }
function nearestPin(x,c){                          // c is non-empty; a tie goes to the heavier
  var best=c[0];
  for(var i=1;i<c.length;i++){
    var d=Math.abs(c[i]-x), b=Math.abs(best-x);
    if(d<b-1e-9||(Math.abs(d-b)<=1e-9&&c[i]>best)) best=c[i];
  }
  return best;
}
function harderEx(w,ex){                           // one notch harder
  var m=bwMode(ex), p=pinsOf(ex);
  if(!p.length) return harder(w,stepFor(ex),m);
  var n=m===2?pinDown(w,p):pinUp(w,p);
  return n===null?w:n;                             // w back = the end of the stack
}
function lighterEx(w,ex){                          // one notch easier (step-back, coach stepBack)
  var m=bwMode(ex), p=pinsOf(ex), s=stepFor(ex);
  if(!p.length) return m===2?w+s:Math.max(0,w-s);
  var n=m===2?pinUp(w,p):pinDown(w,p);
  return n===null?w:n;
}
function easierEx(w,ex){                           // deload: about 10% off
  var m=bwMode(ex), p=pinsOf(ex);
  if(!p.length) return easier(w,stepFor(ex),m);
  if(m===2){ var u=pinUp(w,p); return u===null?w:u; }
  var c=p.filter(function(x){ return x<w-1e-9; });
  return c.length?nearestPin(w*0.9,c):w;
}
/* The planned back-off load under a top set. Never at or above the top, never
   under the bar, never at 0; when there is nothing lighter to go to (the bar,
   the lowest pin) it is the top itself and the card says so. */
function backOffW(top,ex){
  var T=num(top), t=T*(1-(num(ex.backPct)||0.12)), p=pinsOf(ex);
  if(p.length){
    var bar0=barOf(ex);                            // never below the bar either
    var c=p.filter(function(x){ return x<T-1e-9&&x>=bar0-1e-9; });
    return c.length?nearestPin(t,c):T;
  }
  var s=stepFor(ex), b=Math.round(t/s)*s;
  if(b>=T) b=T-s;
  if(b<=0) return T;
  var bar=barOf(ex);
  if(bar>0&&b<bar) b=bar;
  if(b>=T) return T;                               // the bar is the top: nothing lighter
  return round(b,2);
}
function harderPhraseEx(w,next,ex){
  return pinsOf(ex).length?(bwMode(ex)===2?"assist down to "+fmt(next):"up to "+fmt(next))
                          :harderPhrase(stepFor(ex),bwMode(ex));
}
/* The ± stepper on a set's weight: "+" is the bigger number whatever the load type. */
function stepWeight(cur,d,ex){
  var p=pinsOf(ex), w=num(cur);
  if(!p.length) return Math.max(0,round(w+d*stepFor(ex),2));
  var n=d>0?pinUp(w,p):pinDown(w,p);
  return n===null?w:n;
}

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
    if(s.role==="back") return;                 // a planned back-off is not a drop (forEach: return = continue)
    if(isAt(s,w,mode)) seen=true;
    else if(seen&&!blankW(s,mode)&&heavierLoad(w,num(s.w),mode)) n++;
  });
  return n;
}

/* The set a top-set-and-back-offs lift is judged on: the one tagged "top";
   failing that (history from before 2.0, hand-logged) the heaviest set, most
   reps among equals, the first among exact ties. */
function topSetOf(sets,mode){
  var t=sets.filter(function(s){ return s.role==="top"; }); if(t.length) return t[0];
  var best=null;
  sets.forEach(function(s){
    if(blankW(s,mode)) return;
    if(!best||heavierLoad(num(s.w),num(best.w),mode)||(num(s.w)===num(best.w)&&num(s.r)>num(best.r))) best=s;
  });
  return best;
}
function projectTop(h){ var t=topSetOf(h.sets,h.bw); return t?Object.assign({},h,{sets:[t]}):h; }
/* The history the engine reads for one plan row: for a top-set lift every
   exposure is its top set alone, so every rule in prescribe() runs unchanged. */
function exWorkingP(name,ex,withEased){
  var h=exWorking(name,withEased);
  return schemeOf(ex)==="topback"?h.map(projectTop):h.map(dropBackSets);
}
/* A row switched back to "double" still reads sessions logged as top + back-offs:
   the planned back-offs (role "back") are not working sets of that lift. The
   entry is marked roleTagged so prescribe() can start the switch gently. */
function dropBackSets(h){
  if(!h.sets.some(function(s){ return s.role; })) return h;
  var k=h.sets.filter(function(s){ return s.role!=="back"; });
  return Object.assign({},h,{sets:k.length?k:h.sets,roleTagged:true});
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
/* What to do today for one plan row. A top-set lift (schemeOf) is judged on its
   top set alone (exWorkingP) and also says where the back-offs go: `back`. */
function prescribe(name,ex,opts){
  var r=prescribeRow(name,ex,opts);
  if(schemeOf(ex)==="topback"&&r.w!==""&&num(r.w)>0) r.back={w:backOffW(r.w,ex),r:r.r};
  return r;
}
function prescribeRow(name,ex,opts){
  var met=metricOf(ex);
  var rstep=metricStep(met);
  var low=Math.max(1,num(ex.reps)||num(S.settings.repLow)||8);
  var top=num(ex.repTop)||0;
  var mode=bwMode(ex);
  var nsets=Math.max(1,num(ex.sets)||3);
  var hist=rangeHist(exWorkingP(name,ex),name,ex);
  if(opts&&opts.skip) hist=hist.filter(function(h){ return h.sessionId!==opts.skip; });   // "what would it say without that one"
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
    return {w:easierEx(w,ex),r:low,sets:Math.max(1,Math.round(nsets*0.6)),
            why:"Deload week — light and short on purpose",kind:"deload"};
  }

  /* A row just switched from top set + back-offs to straight sets: the newest
     session carries role tags. One top set of 8 is not evidence for three sets of
     9, so the first prescription is every set at the top load, bottom of the
     range; from the next session (no tags) it is ordinary double progression. */
  if(last.roleTagged&&schemeOf(ex)!=="topback"&&met===0&&mode===0){
    var ts=topSetOf(last.sets,mode), tw=ts?num(ts.w):0;
    if(tw>0)
      return {w:tw,r:low,sets:nsets,why:"Switched to straight sets — all sets at "+fmt(tw)+", aim for "+low+"s",kind:"reps"};
  }

  /* No trend back-off here any more (2.0). The slope of the last few sessions
     used to cut 10% off the bar when it read "down"; the simulated lifter and
     the real log both said the cut cost more sessions than it saved (the
     verdict is a badge now: trend() still feeds the card, Progress and the
     coach). A load that genuinely can't be met is handled by the step-back
     below, and a jump that failed is remembered (jumpAwayFrom). */

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

  /* Out of reach for now — so step back, rather than "run it back" for
     months. Judged on the BEST set at the load, not the worst: replayed on
     the real log, judging by the worst set cut an incline press after
     65×8,6,4 (fatigue, not failure — next session was 65×8×3) and halved a
     cable fly after 20×10,14,16. Right after a jump, go back to the load
     it came from whatever the percentage, since that load was being made.
     At an established load, only after two sessions in a row and never by
     more than MAX_CUT; a 10 lb step on a 20 lb fly holds instead. Plain
     shortfalls only. Double progression and straight sets share it: with the
     trend cut gone it is the only way a load that can't be met comes down. */
  function stepBackCall(){
    if(noLoad||!hist[1]||!(repsAt(last,w,mode,true)<low)) return null;
    var w1=workLoad(hist[1].sets,mode), bk=0;
    if(heavierLoad(w,w1,mode)) bk=w1;
    else if(w1===w&&repsAt(hist[1],w,mode,true)<low&&last.lo===hist[1].lo){
      bk=lighterEx(w,ex);
      if(mode!==2&&w-bk>w*MAX_CUT) bk=0;
    }
    if(bk&&bk!==w) return {w:bk,r:low,sets:nsets,
      why:"Couldn't reach "+amtText(low,met)+" at "+fmt(w)+" — back to "+fmt(bk)+" and build up",kind:"deload"};
    return null;
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
      var nx=harderEx(w,ex);
      /* The end of a stack: nothing heavier to go to, so reps are the only way up. */
      if(nx===w&&pinsOf(ex).length){
        var tr=Math.max(minR,nmR)+rstep;
        return {w:w,r:tr,sets:nsets,why:"Top of the stack — go for "+tr,kind:"reps"};
      }
      return {w:nx,r:low,sets:nsets,
              why:(minR>=top?"Hit "+amtText(top,met)+" on every set":
                     "Hit "+top+", "+(at[at.length-1].out?"rep-out ":"last set ")+nmR)+" — "+harderPhraseEx(w,nx,ex),kind:"up"};
    }
    /* At the end of a stack there is no heavier weight to earn: when every set but
       the last has reached the top, the next target is the top itself, so the last
       set is asked to join them rather than a rep above its own. */
    if(minR>=low&&!noLoad&&pinsOf(ex).length&&harderEx(w,ex)===w&&at.length>=2&&at.slice(0,-1).every(function(s){ return num(s.r)>=top; }))
      return {w:w,r:top,sets:nsets,why:"Same weight — go for "+top+" this time",kind:"reps"};
    if(minR>=low)
      return {w:w,r:nextR,sets:nsets,
              why:(noLoad?"Same as last time":"Same weight")+" — go for "+nextR+" this time",kind:"reps"};
    var sb=stepBackCall();
    if(sb) return sb;
    return {w:w,r:low,sets:nsets,why:"Fell short of "+amtText(low,met)+" — run it back",kind:"hold"};
  }

  if(minR>=low){                                      // straight sets
    if(noLoad) return {w:w,r:minR+rstep,sets:nsets,
            why:"Hit all "+amtText(low,met)+" — go for "+(minR+rstep),kind:"up"};
    var nx2=harderEx(w,ex);
    if(nx2===w&&pinsOf(ex).length)
      return {w:w,r:minR+rstep,sets:nsets,why:"Top of the stack — go for "+(minR+rstep),kind:"reps"};
    return {w:nx2,r:low,sets:nsets,
            why:"Hit all "+amtText(low,met)+" — "+harderPhraseEx(w,nx2,ex),kind:"up"};
  }
  var sb2=stepBackCall();
  if(sb2) return sb2;
  return {w:w,r:low,sets:nsets,why:"Missed "+amtText(low,met)+" last time — run it back",kind:"hold"};
}

/* ============================ the rep-out label ============================
   The last working set of a ranged rep exercise is a rep-out: as many as you
   can (compounds stop one short of form breaking, isolation goes to failure).
   commitSession() flags it (`out`), the card labels it, and trendScore() reads
   it as the best evidence of capacity in the session. (The v24 "rep-out
   shadow" that prescribed from it alone, and its "Use" button, were retired in
   2.0: it never beat double progression on the simulator or the real log.
   `shadow` on an old logged exercise is inert data now.)
   A top-set lift's last set is a back-off, not a rep-out.
   =============================================================================== */
function repOutApplies(ex){ return schemeOf(ex)!=="topback"&&metricOf(ex)===0&&num(ex.repTop)>num(ex.reps); }
function repOutHint(name){
  return movementClass(name)==="iso"?"take it to failure":"stop 1 short of form breaking";
}
self.__ilf=(self.__ilf||0)+1;
