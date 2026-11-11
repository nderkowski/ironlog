"use strict";
/* ============================ TODAY ============================ */
/* The day rotation runs over the main days only. An optional day (the pump
   day) is never "next" and never moves it: the last session that counts is the
   newest one of a main day, so a pump session in between changes nothing. A
   session of a day that no longer exists counts as a main one (it restarts at
   the first day), as it always did. Unlogged sessions have a routineId, so
   "Trained Day B, didn't log it" advances the rotation like a logged one. */
function nextRoutine(){
  var mains=mainRoutines();
  if(!mains.length) return null;
  var last=S.sessions.find(function(s){ return s.routineId&&!isOptional(s.routineId); });
  if(!last) return mains[0];
  var i=mains.findIndex(function(r){ return r.id===last.routineId; });
  if(i<0) return mains[0];
  return mains[(i+1)%mains.length];
}

function startSession(routine,vix){
  var ex=[];
  var v=routine?variantAt(routine,vix===undefined?nextVariantIx(routine):vix):null;
  if(v) v.exercises.forEach(function(re){ ex.push(makeSessionEx(re,re.id)); });
  S.active={
    id:uid(), ts:Date.now(), date:today(),
    routineId:routine?routine.id:null,
    key:routine?routine.key:"—",
    name:routine?routine.name:"Freestyle",
    /* The id is what the rotation reads; the label is a snapshot for history,
       like key and name already are, so deleting a variant later can't rewrite
       what a past session says it was. */
    variantId:v?v.id:null,
    variantName:routine&&v?variantLabel(routine,variantsOf(routine).indexOf(v)):"",
    deload:inDeloadWeek(),
    note:"", exercises:ex
  };
  save(); render();
}

/* Build an in-session exercise, prefilled with today's prescription.
   Warm-ups carry over from last time so you don't retype them. */
function makeSessionEx(planEx,planId){
  var p=prescribe(planEx.name,planEx);
  var last=lastPerf(planEx.name);
  /* A lift the coach swapped in that has been done before but not for 4+ weeks
     starts one step lighter. Here and not in prescribe(): it is a prefill, not
     a progression rule. */
  if(planEx.stepBack&&last&&p.w!==""&&p.kind!=="deload"&&bwMode(planEx)===0&&metricOf(planEx)===0&&Date.now()-last.ts>28*864e5){
    var lighter=lighterEx(num(p.w),planEx);
    if(lighter>0&&lighter!==num(p.w)){
      p.w=lighter; p.why=(p.why?p.why+" · ":"")+"back after "+Math.round((Date.now()-last.ts)/864e5/7)+" weeks — one step lighter";
      if(p.back) p.back={w:backOffW(p.w,planEx),r:p.r};      // back-offs follow the lighter top
    }
  }
  var raw=lastRawSets(planEx.name);
  var sets=[];
  /* Warm-ups the lifter built by hand carry over so they aren't retyped. The
     app's own (gen) ramp is not copied — it was shaped by last time's load —
     it is generated again from today's (2.0 S3). */
  if(raw) raw.forEach(function(s){ if(s.warm&&!s.gen) sets.push({w:String(s.w),r:String(s.r),warm:true,done:false}); });
  if(!sets.length&&p.w!==""&&p.kind!=="new") sets=c2WarmUps(planEx.name,planEx,num(p.w));   // not off a guessed first weight
  var n=Math.max(1,num(p.sets)||3);
  for(var i=0;i<n;i++){
    /* A top-set lift: the first working set is the top set, the rest are the
       planned back-offs (never judged, never "dropped"). */
    if(p.back) sets.push(i===0?{w:String(p.w),r:String(p.r),role:"top",done:false}
                              :{w:String(p.back.w),r:String(p.back.r),role:"back",done:false});
    else sets.push({w:p.w===""?"":String(p.w),r:String(p.r),done:false});
  }
  return {
    id:uid(), planId:planId||null, name:planEx.name,
    targetReps:p.r, reps:num(planEx.reps)||p.r, repTop:num(planEx.repTop)||0,
    inc:planEx.inc||null, bw:bwMode(planEx), bar:barOf(planEx), metric:metricOf(planEx),
    link:!!planEx.link,
    mg:planEx.mg||"", mg2:(planEx.mg2||[]).slice(),
    scheme:planEx.scheme==="topback"?"topback":"double",
    backPct:(num(planEx.backPct)>0&&num(planEx.backPct)<0.5)?num(planEx.backPct):0.12,
    pins:cleanPins(planEx.pins),
    supplemental:!planId, note:"",
    why:p.why, kind:p.kind,
    /* What the engine prescribed, after every adjustment above (the step-back
       included) and before any chip or edit: the override rate compares what
       was logged against this. */
    presc:{w:p.w,r:p.r},
    /* 2.0 §3b: "Usual: 65 × 10" — null unless the last session was a single
       self-chosen drop. Computed here so tapping the chip is only a fill. */
    usual:usualOf(planEx.name,planEx),
    lastW:last?num(last.sets[0].w):null, lastR:last?num(last.sets[0].r):null,
    sets:sets
  };
}

function viewToday(){
  $("#view").innerHTML=S.active?todayActive():todayIdle();
}

function todayIdle(){
  var nr=nextRoutine();
  var html='<div class="eyebrow">'+esc(new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})+blkEyebrow())+'</div>'+
           '<h1 class="view-title">Ready to lift</h1><div class="stack">';

  html+=gistPausedBanner();
  if(!storageOK){
    html+='<div class="banner warn"><div class="bt">This browser is blocking storage</div>'+
      '<div class="bd">Your log won\'t survive a refresh. Open this page in your normal browser, not a private window.</div></div>';
  }
  if(inDeloadWeek()){
    html+='<div class="banner info"><div class="bt">Deload week</div>'+
      '<div class="bd">Everything is prescribed light and short through '+esc(shortDate(S.settings.deloadUntil))+
      '. These sessions won\'t count against your trends.</div>'+
      '<div class="acts"><button class="btn sm ghost" data-act="end-deload">End it now</button></div></div>';
  }

  if(nr){
    var nvi=nextVariantIx(nr), nvs=variantsOf(nr);
    var nex=planExOf(nr,nvi), pumpOn=blkPumpNext();
    var names=nex.map(function(e){ return e.name; }).join(" · ")||"No exercises yet — add some in Plan";
    html+='<div class="card">'+
      '<div class="hero">'+
        '<div class="daymark"><div class="letter">'+esc(nr.key)+'</div><div class="sub">next</div></div>'+
        '<div class="body"><h2>'+esc(nr.name)+
          (nvs.length>1?' <span class="chip tag">'+esc(variantLabel(nr,nvi))+'</span>':"")+'</h2>'+
        '<div class="exlist">'+esc(names)+'</div></div>'+
      '</div>'+
      '<div style="margin-top:12px">'+
        (nex.length
          ? '<button class="btn primary big block" data-act="start" data-id="'+nr.id+'" data-vi="'+nvi+'">Start '+esc(nr.name)+'</button>'
          : '<button class="btn primary big block" data-act="tab" data-tab="plan">Set up '+esc(nr.name)+'</button>')+
      '</div>'+
      '<div class="daypicks">'+
        /* Every day and every week it has, minus the one already on the big
           button. Listing only each day's *next* week would leave the other
           one unreachable whenever that day isn't the one up next — and a
           skipped fortnight would mean editing the plan to get back on track.
           A single-variant day is one button, exactly as before. */
        S.routines.map(function(r){
          return variantsOf(r).map(function(v,vi){
            if(r.id===nr.id&&vi===nvi) return "";
            if(pumpOn&&r.id===pumpOn.r.id&&vi===pumpOn.vi) return "";     // it is the Pump day button below
            return '<button class="daypick" data-act="start" data-id="'+r.id+'" data-vi="'+vi+'">'+
              '<span class="k">'+esc(r.key)+'</span>'+esc(r.name)+
              (variantsOf(r).length>1?" · "+esc(variantLabel(r,vi)):"")+'</button>';
          }).join("");
        }).join("")+
        '<button class="daypick" data-act="start" data-id=""><span class="k">+</span>Freestyle</button>'+
      '</div>'+
      (nex.length?blkOffBookButton(nr,nvi):"")+
    '</div>'+
    blkPumpButton(pumpOn);
  } else {
    html+='<div class="card"><div class="empty">No training days yet.<br>Set up your split in <b>Plan</b>.</div>'+
      '<button class="btn primary block" data-act="tab" data-tab="plan">Build my split</button></div>';
  }

  /* Coach suggestions sit under the day card: they never stand between him and
     the Start button. */
  html+=blockCardHtml()+coachCard();

  /* The disaster-recovery moment. A new phone or a cleared browser lands on a
     stock split with empty days — not on "no routines" — so this keys off
     having no data anywhere. A backup file is no use if nothing offers to
     read it back. */
  var fresh=!S.sessions.length&&planIsEmpty();
  if(fresh){
    html+='<div class="card"><div class="eyebrow">Been here before?</div>'+
      '<div class="tiny muted" style="margin:6px 0 10px">'+
        'New phone, or cleared your browser? Your exported file goes straight back in.</div>'+
      '<button class="btn ghost block" data-act="import">Restore from a backup</button></div>';
  }

  /* One small row for the session he just finished: most edits are a typo
     fixed straight after the workout, and History is ~2000px down Progress.
     Opens the existing editor (editSession) directly. Hidden mid-workout
     because todayActive() renders instead of this view. */
  var last=S.sessions[0];
  if(last){
    /* Calendar days, not 24-hour blocks: last Sunday 09:00 seen on Sunday
       08:00 is six blocks ago and would print "Sun", which reads as today. */
    var d1=new Date(last.ts), lsets=0, lvol=0, ago=calDaysAgo(last.ts);
    last.exercises.forEach(function(e){ lsets+=working(e.sets).length; lvol+=exVolume(e); });
    /* A session he only marked as trained has no sets to edit: the row says so
       and opens the sheet (which can delete it) instead of the editor. */
    html+='<button class="lastsess" data-act="'+(last.unlogged?"open-session":"edit-last")+'" data-id="'+esc(last.id)+'">'+
      '<span class="ls-t"><span class="ls-k">Last</span> <b>'+esc(last.name||last.key||"Workout")+'</b> · '+
        esc(!isFinite(ago)?"":ago===0?"Today":ago===1?"Yesterday":ago>1&&ago<7?d1.toLocaleDateString(undefined,{weekday:"short"}):shortDate(last.ts))+
        ' · '+(last.unlogged?'not logged':plural(lsets,"set")+(lvol>0?' · '+kfmt(lvol)+' '+unit():''))+(last.deload?' · deload':'')+'</span>'+
      '<span class="ls-edit">'+(last.unlogged?"Open":"Edit")+'</span></button>';
  }

  var d=deloadCheck();
  if(d&&d.level==="high"){
    html+='<div class="banner warn"><div class="bt">Deload worth considering</div>'+
      '<div class="bd">'+d.stalled.length+' of '+d.judged+' tracked lifts have stopped climbing.</div>'+
      '<div class="acts"><button class="btn sm primary" data-act="start-deload">Start deload week</button>'+
      '<button class="btn sm ghost" data-act="snooze-deload">Not now</button></div></div>';
  }
  if(backupDue()){
    html+='<button class="banner info" style="width:100%" data-act="backup"><div class="bt">Back up your log</div>'+
      '<div class="bd">'+(S.settings.lastBackup?"Last copy "+relDate(S.settings.lastBackup)+". ":"")+
      'One tap sends a file to Drive, Files, or anywhere else.</div></button>';
  }
  return html+'</div>';
}

function backupDue(){
  if(S.sessions.length<6) return false;
  var since=S.sessions.filter(function(s){ return s.ts>(S.settings.lastBackup||0); }).length;
  return since>=8||(Date.now()-(S.settings.lastBackup||0))>28*864e5;
}

function todayActive(){
  var a=S.active;
  var html='<div class="row"><div><div class="eyebrow">'+(a.deload?"Deload session":"In progress")+'</div>'+
    '<h1 class="view-title" style="margin-bottom:0">'+esc(a.name)+'</h1></div>'+
    '<div style="flex:1"></div>'+
    '<button class="btn sm ghost" data-act="finish">Finish</button></div>'+
    '<div class="row tiny muted" id="sess-summary" style="margin:6px 0 12px;gap:10px"></div>'+
    '<div class="stack">';
  html+=c2EaseBanner();
  a.exercises.forEach(function(ex,ei){ html+=exerciseCard(ex,ei); });
  html+='<button class="btn block ghost" data-act="add-ex">+ Add exercise</button>'+
    '<div class="card"><div class="eyebrow" style="margin-bottom:7px">Session note</div>'+
    '<textarea class="txt" data-act="snote" placeholder="Sleep, energy, aches, anything worth remembering">'+esc(a.note)+'</textarea></div>'+
    '<button class="btn primary big block" data-act="finish">Finish workout</button>'+
    '<button class="btn ghost block" data-act="discard">Discard session</button>'+
    '</div>';
  return html;
}

/* The newest note left on a lift, from any session — what he wrote about seat
   height, grip or a sore elbow is worth seeing the next time it comes up. */
function lastNote(name){
  var k=normName(name);
  for(var i=0;i<S.sessions.length;i++){
    var e=S.sessions[i].exercises.find(function(x){ return normName(x.name)===k&&String(x.note||"").trim(); });
    if(e) return {note:String(e.note).trim(), ts:S.sessions[i].ts};
  }
  return null;
}
function exNoteBox(ei,val){
  return '<textarea class="txt exnote-txt" data-act="exnote" data-ei="'+ei+'" rows="2" '+
    'placeholder="Seat height, grip, how it felt…">'+esc(val||"")+'</textarea>';
}

function exerciseCard(ex,ei){
  var best=bestScore(ex.name);
  var last=lastPerf(ex.name);
  var t=trend(ex.name);
  var mode=bwMode(ex);
  var met=metricOf(ex);
  var nWork=working(ex.sets).length;
  var gtag=groupTag(S.active.exercises,ei);

  var html='<section class="card ex" data-ei="'+ei+'">'+
    '<div class="ex-head"><div class="t">'+
      '<div class="ex-name">'+(gtag?'<span class="gtag">'+esc(gtag)+'</span>':"")+esc(ex.name)+'</div>'+
      '<div class="ex-meta">'+
        /* "target" and "range" were too alike to read as different modes of
           progression, which is exactly how an exercise stuck on straight sets
           went unnoticed for weeks. "straight" names what it does. */
        '<span>'+c2MetaText(ex)+'</span>'+
        (met?'<span class="chip tag">'+(met===1?"TIME":"DISTANCE")+'</span>':"")+
        (mode===1?'<span class="chip tag">BODYWEIGHT</span>':mode===2?'<span class="chip tag">ASSISTED</span>':"")+
        (ex.supplemental?'<span class="chip tag">EXTRA</span>':"")+
        (t.state==="down"?'<span class="chip bad tag">SLIPPING</span>':
         t.state==="flat"?'<span class="chip tag">FLAT</span>':
         t.state==="up"?'<span class="chip good tag">CLIMBING</span>':"")+
      '</div>'+
    '</div><button class="kebab" data-act="ex-menu" data-ei="'+ei+'" aria-label="Exercise options">⋯</button></div>';

  html+='<div class="callout">';
  if(last){
    var summary=last.sets.map(function(s){ return entryText(s,last.bw||mode)+metricJoin(met)+num(s.r)+metricSuffix(met); }).join("  ");
    var first=working(ex.sets)[0];
    var differs=ex.lastW!==null&&first&&(num(first.w)!==ex.lastW||num(first.r)!==ex.lastR);
    html+='<div class="lastrow"><span>'+esc(relDate(last.ts))+'</span>'+
      '<span class="num">'+esc(summary)+'</span>'+
      (c2UsualShown(ex)
        ? '<button class="revert usual" data-act="usual" data-ei="'+ei+'">Usual: '+esc(entryText({w:ex.usual.w},mode))+' '+metricJoin(met)+' '+esc(ex.usual.r)+metricSuffix(met)+'</button>'
        : differs?'<button class="revert" data-act="revert" data-ei="'+ei+'">Keep '+esc(entryText({w:ex.lastW},mode))+metricJoin(met)+ex.lastR+metricSuffix(met)+'</button>':"")+
    '</div>';
  } else {
    html+='<div class="lastrow"><span>First time logging this one.</span></div>';
  }
  var ln=lastNote(ex.name);
  if(ln) html+='<div class="outhint">Note from '+esc(relDate(ln.ts))+': '+esc(ln.note)+'</div>';
  if(ex.why){
    html+='<div class="why '+esc(ex.kind)+'"><span class="mark">'+c2WhyGlyph(ex.kind)+'</span><span>'+esc(ex.why)+'</span></div>';
  }
  var outSi=c2OutSet(ex).si;
  html+=c2HintsHtml(ex);
  html+='</div>';

  html+='<div class="sets">';
  ex.sets.forEach(function(s,si){
    html+='<div class="set'+(s.warm?" warm":"")+(s.done?" done":"")+(s.done&&s.pr?" pr":"")+(si===outSi?" out":"")+'" data-ei="'+ei+'" data-si="'+si+'">'+
      '<button class="idx" data-act="warm" aria-label="'+c2IdxAria(ex,si)+'">'+c2IdxText(ex,si)+'</button>'+
      '<div class="grp">'+
        '<button data-act="step" data-f="w" data-d="-1" aria-label="Less weight">−</button>'+
        '<input inputmode="decimal" enterkeyhint="done" type="number" step="any" data-f="w" value="'+esc(s.w)+'" placeholder="'+esc(mode===1?"+":mode===2?"−":unit())+'" aria-label="Weight">'+
        '<button data-act="step" data-f="w" data-d="1" aria-label="More weight">+</button>'+
      '</div>'+
      '<span class="times">'+metricJoin(met)+'</span>'+
      '<div class="grp">'+
        '<button data-act="step" data-f="r" data-d="-1" aria-label="Less">−</button>'+
        '<input inputmode="numeric" enterkeyhint="done" type="number" step="1" data-f="r" value="'+esc(s.r)+'" placeholder="'+esc(metricShort(met))+'" aria-label="'+esc(metricNoun(met))+'">'+
        '<button data-act="step" data-f="r" data-d="1" aria-label="More">+</button>'+
      '</div>'+
      (s.pr?'<span class="prtag">PR</span>':"")+
      '<button class="tick" data-act="toggle" aria-label="Log set">'+ICON.check+'</button>'+
      '<div class="plates">'+rowExtras(ex,s)+'</div>'+
    '</div>';
  });
  html+='</div>';

  html+='<div class="exnote" data-note="'+ei+'">'+(ex.note?exNoteBox(ei,ex.note):
    '<button class="exnote-add" data-act="ex-note" data-ei="'+ei+'">+ Note on this lift</button>')+'</div>';
  html+='<div class="ex-foot">'+
    '<button class="btn sm ghost" data-act="add-set" data-ei="'+ei+'">+ Set</button>'+
    (nWork>1?'<button class="btn sm ghost" data-act="del-set" data-ei="'+ei+'">− Set</button>':"")+
    (best?'<span class="chip mono" style="margin-left:auto">'+esc(scoreLabel(met))+' '+Math.round(best)+'</span>':"")+
  '</div></section>';
  return html;
}

/* ---- surgical updates: the logging path never rebuilds the page, so the
        soft keyboard and the browser's touch targets stay put ---- */
function refreshSetRow(ei,si){
  var row=$('.set[data-ei="'+ei+'"][data-si="'+si+'"]');
  if(!row) return;
  var st=S.active.exercises[ei].sets[si];
  row.classList.toggle("done",!!st.done);
  row.classList.toggle("pr",!!(st.done&&st.pr));
  var tag=$(".prtag",row);
  if(st.done&&st.pr&&!tag){
    var el=document.createElement("span");
    el.className="prtag"; el.textContent="PR";
    row.insertBefore(el,$(".tick",row));
  } else if((!st.done||!st.pr)&&tag){ tag.remove(); }
  refreshPlates(ei,si,row);
}
/* Weight changed, so the plate breakdown did too. Writes into the existing
   .plates node — the node itself is never replaced, and it can't take a tap. */
function refreshPlates(ei,si,row){
  row=row||$('.set[data-ei="'+ei+'"][data-si="'+si+'"]');
  if(!row) return;
  var el=$(".plates",row);
  if(!el) return;
  var ex=S.active.exercises[ei];
  el.innerHTML=rowExtras(ex,ex.sets[si]);
}
function refreshSummary(){
  var el=$("#sess-summary");
  if(!el||!S.active) return;
  var ds=0,vol=0;
  S.active.exercises.forEach(function(e){
    var mode=bwMode(e);
    e.sets.forEach(function(s){
      if(!s.done||s.warm) return;
      ds++; vol+=effLoad(s.w,mode)*num(s.r);
    });
  });
  el.innerHTML='<span class="num">'+plural(ds,"set")+'</span><span>·</span>'+
               '<span class="num">'+commas(vol)+' '+unit()+' volume</span>';
}

/* ---- the pieces of a card that depend on which rows are warm-ups, built in one
   place so a warm-up flip can rewrite them in place (trap 1) ---- */
function c2MetaText(ex){
  var range=(ex.repTop>ex.reps?(ex.reps+"–"+ex.repTop):String(ex.targetReps))+metricSuffix(metricOf(ex));
  var nWork=working(ex.sets).length;
  return schemeOf(ex)==="topback"?"top + "+Math.max(0,nWork-1)+" back-off"+(nWork===2?"":"s")+" · "+esc(range):
         nWork+' × '+esc(range)+(ex.repTop>ex.reps?" range":" straight");
}
function c2OutSet(ex){
  var si=-1, no=0;
  if(repOutApplies(ex)) ex.sets.forEach(function(s,i){ if(!s.warm){ si=i; no++; } });
  return {si:si,no:no};
}
function c2WorkNo(ex,si){ var n=0; for(var k=0;k<=si;k++) if(!ex.sets[k].warm) n++; return n; }
function c2IdxText(ex,si){ var s=ex.sets[si]; return s.warm?"W":s.role==="top"?"T":c2WorkNo(ex,si); }
function c2IdxAria(ex,si){
  var s=ex.sets[si];
  return s.warm?"Warm-up: make it a working set":(s.role==="top"?"Top set":"Set "+c2WorkNo(ex,si))+": make it a warm-up";
}
function c2HintsHtml(ex){
  var html="", o=c2OutSet(ex);
  if(o.si>=0)
    html+='<div class="outhint" data-c2="hint">Set '+o.no+' is a rep-out: as many as you can — '+esc(repOutHint(ex.name))+'.</div>';
  if(schemeOf(ex)==="topback"){
    var tw=working(ex.sets)[0];
    if(tw&&num(tw.w)>0&&backOffW(num(tw.w),ex)>=num(tw.w)&&working(ex.sets).length>1)
      html+='<div class="outhint" data-c2="hint">No lighter back-off here — the back-offs stay at the top weight.</div>';
  }
  return html;
}
/* A set flipped to or from a warm-up: the row's class, the numbers on every row
   of the card, the rep-out marker and hints, the meta line and the "− Set"
   button, all written into the nodes already there. No row is replaced. */
function c2RefreshCard(ei){
  var ex=S.active.exercises[ei], card=$('.card.ex[data-ei="'+ei+'"]');
  if(!card) return;
  var out=c2OutSet(ex).si;
  ex.sets.forEach(function(s,si){
    var row=$('.set[data-ei="'+ei+'"][data-si="'+si+'"]',card);
    if(!row) return;
    row.classList.toggle("warm",!!s.warm);
    row.classList.toggle("out",si===out);
    var ix=$(".idx",row);
    ix.textContent=c2IdxText(ex,si);
    ix.setAttribute("aria-label",c2IdxAria(ex,si));
    refreshPlates(ei,si,row);
  });
  var meta=$(".ex-meta span",card); if(meta) meta.innerHTML=c2MetaText(ex);
  var co=$(".callout",card);
  if(co){
    $$('[data-c2="hint"]',co).forEach(function(n){ n.remove(); });
    co.insertAdjacentHTML("beforeend",c2HintsHtml(ex));
  }
  var del=$('[data-act="del-set"]',card), add=$('[data-act="add-set"]',card);
  if(working(ex.sets).length>1){
    if(!del&&add) add.insertAdjacentHTML("afterend",'<button class="btn sm ghost" data-act="del-set" data-ei="'+ei+'">− Set</button>');
  } else if(del) del.remove();
}

/* ============ 2.0: fewer taps when you deviate (cascade, usual load, ease back) ============
   All of it writes into the rows already on screen: no render on the logging
   path (trap 1), so the keyboard, the scroll and every element a tap is about
   to land on stay where they are. */
function c2AnyDone(ex){ return ex.sets.some(function(s){ return !s.warm&&s.done; }); }
function c2WhyGlyph(kind){ return kind==="up"?"↑":kind==="reps"?"+1":kind==="deload"?"↓":"="; }
function c2Paint(ei,j){
  var row=$('.set[data-ei="'+ei+'"][data-si="'+j+'"]');
  if(!row) return;
  var inp=$('input[data-f="w"]',row);
  if(inp) inp.value=S.active.exercises[ei].sets[j].w;
  refreshPlates(ei,j,row);
}
/* Set 1's weight changed (typed or stepped): every later undone working set
   still at what set 1 was just before follows it. A top-set lift's back-offs
   follow only while they are still the planned back-off, and take the new one.
   Reps never cascade; done sets and warm-ups never change. */
function c2Cascade(ei,si,old){
  var ex=S.active.exercises[ei], sets=ex.sets, first=-1;
  for(var k=0;k<sets.length;k++) if(!sets[k].warm){ first=k; break; }
  if(si!==first) return;
  var nw=sets[si].w, tb=schemeOf(ex)==="topback";
  var okN=String(nw).trim()!==""&&isFinite(num(nw));
  var ob=tb?String(backOffW(num(old),ex)):null, nb=tb&&okN?String(backOffW(num(nw),ex)):null;
  for(var j=si+1;j<sets.length;j++){
    var s=sets[j];
    if(s.warm||s.done||s.touched) continue;                      // a set you edited yourself is yours
    if(tb&&s.role==="back"){
      if(nb!==null&&String(s.w)===ob){ s.w=nb; c2Paint(ei,j); }
      continue;
    }
    if(String(s.w)===String(old)){ s.w=nw; c2Paint(ei,j); }
  }
}
/* Every undone working set takes w × r. Top-set lifts: the top gets w, the
   back-offs the planned back-off from it. */
function c2FillUndone(ei,w,r){
  var ex=S.active.exercises[ei], tb=schemeOf(ex)==="topback";
  ex.sets.forEach(function(s,j){
    if(s.done||s.warm) return;
    s.w=String(tb&&s.role==="back"?backOffW(num(w),ex):w);
    s.r=String(r);
    delete s.touched;
    var row=$('.set[data-ei="'+ei+'"][data-si="'+j+'"]');
    if(row){ var ri=$('input[data-f="r"]',row); if(ri) ri.value=s.r; }
    c2Paint(ei,j);
  });
}
/* The "why" strip under the last-time row: text, glyph and tone, in place. */
function c2PaintWhy(ei){
  var ex=S.active.exercises[ei], card=$('.card.ex[data-ei="'+ei+'"]'), co=card&&$(".callout",card);
  if(!co) return;
  var node=$(".why",co);
  if(!ex.why){ if(node) node.remove(); return; }
  if(!node){
    node=document.createElement("div");
    node.innerHTML='<span class="mark"></span><span></span>';
    co.appendChild(node);
  }
  node.className="why "+ex.kind;
  node.children[0].textContent=c2WhyGlyph(ex.kind);
  node.children[1].textContent=ex.why;
}
function c2UsualShown(ex){ return !!(ex.usual&&ex.usual.w!==""&&!c2AnyDone(ex)); }
function c2OnUsual(ei,chip){
  var ex=S.active.exercises[ei], u=ex.usual;
  if(!u) return;
  c2FillUndone(ei,u.w,u.r);
  ex.kind=u.kind; ex.why=u.why;
  c2PaintWhy(ei);
  ex.usual=null;                                  // applied: a re-render must not offer it again
  if(chip) chip.remove();
  save();
  toast("Back to "+entryText({w:u.w},bwMode(ex))+" × "+u.r);
}
/* Once a working set is done the chips have had their moment (amendment 9):
   they leave the page in place, from the tick, the steppers and the inputs. */
function c2SyncChips(){
  if(!S.active) return;
  var any=false;
  S.active.exercises.forEach(function(ex,ei){
    if(!c2AnyDone(ex)) return;
    any=true;
    var ch=$('.card.ex[data-ei="'+ei+'"] .usual'); if(ch) ch.remove();
  });
  if(any){
    var b=$('[data-act="easeback"]');
    if(b) (b.closest(".banner")||b).remove();
  }
}
/* "12 days since you last trained": the gap since the newest session of any
   kind, only at the start of a session and only until something is done. */
function c2EaseGap(){
  var a=S.active;
  if(!a||a.easeBack||!S.sessions.length||!a.exercises.length) return 0;
  if(a.exercises.some(c2AnyDone)) return 0;
  var newest=0;
  S.sessions.forEach(function(x){ if(x.ts>newest) newest=x.ts; });
  var d=calDaysAgo(newest);
  return d>=10?d:0;
}
function c2EaseBanner(){
  var d=c2EaseGap();
  if(!d) return "";
  return '<div class="banner calm easeback"><div class="bt">'+d+' days since you last trained</div>'+
    '<div class="acts"><button class="btn sm" data-act="easeback">Ease back ~10%</button></div></div>';
}
function c2OnEaseBack(){
  var d=c2EaseGap();
  if(!d) return;
  var undo=[], whys=[];
  S.active.exercises.forEach(function(ex,ei){
    var tb=schemeOf(ex)==="topback", topNew=null, changed=false;
    whys[ei]={why:ex.why,kind:ex.kind};
    ex.sets.forEach(function(s,j){
      if(s.done||s.warm||!(num(s.w)>0)) return;
      var nw;
      if(tb&&s.role==="back"&&topNew!==null) nw=backOffW(topNew,ex);
      else { nw=easierEx(num(s.w),ex); if(tb&&topNew===null) topNew=nw; }
      if(String(nw)===String(s.w)) return;
      undo.push([ei,j,s.w,String(nw)]);
      s.w=String(nw); changed=true; delete s.touched; c2Paint(ei,j);
    });
    if(changed){
      ex.why="Easing back after "+d+" days"+(ex.why?" — "+ex.why:"");
      c2PaintWhy(ei);
    }
  });
  S.active.easeBack=true;
  var b=$('[data-act="easeback"]'); if(b) (b.closest(".banner")||b).remove();
  save();
  toastUndo("Eased back for today",function(){
    if(!S.active||!S.active.easeBack) return;
    if(S.active.exercises.some(c2AnyDone)){ toast("Already started — change the loads by hand"); return; }
    undo.forEach(function(u){
      var s=S.active.exercises[u[0]]&&S.active.exercises[u[0]].sets[u[1]];
      if(s&&String(s.w)===u[3]) s.w=u[2];
    });
    S.active.exercises.forEach(function(ex,ei){ if(whys[ei]){ ex.why=whys[ei].why; ex.kind=whys[ei].kind; } });
    delete S.active.easeBack;
    save();
    if(TAB==="today"){ viewToday(); refreshSummary(); }       // the banner comes back
  });
}

/* ---- interactions ---- */
$("#view").addEventListener("click",function(e){
  var t=e.target;

  var tabBtn=t.closest('[data-act="tab"]');
  if(tabBtn){ go(tabBtn.dataset.tab); return; }
  if(t.closest('[data-act="backup"]')){ backupSheet(); return; }
  var coBtn=t.closest('[data-co]');
  if(coBtn){ coachTap(coBtn); return; }
  /* The paused-backup banner on Today (gistPausedBanner). */
  if(TAB==="today"&&t.closest('[data-act="settings"]')){ go("settings"); return; }
  /* Also reachable from Today's empty state — the Plan listener never sees it. */
  if(t.closest('[data-act="import"]')){ doImport(); return; }
  if(t.closest('[data-act="start-deload"]')){
    startDeloadWeek(7); render(); toast("Deload week started"); return;
  }
  if(t.closest('[data-act="snooze-deload"]')){
    S.settings.deloadSnooze=Date.now()+14*864e5; writeNow(); render(); toast("Muted for two weeks"); return;
  }
  if(t.closest('[data-act="end-deload"]')){ endDeloadWeek(); render(); toast("Back to normal"); return; }
  var editLast=t.closest('[data-act="edit-last"]');
  if(editLast){ editSession(editLast.dataset.id); return; }

  var startBtn=t.closest('[data-act="start"]');
  if(startBtn){
    var sr=S.routines.find(function(x){ return x.id===startBtn.dataset.id; })||null;
    startSession(sr,startBtn.dataset.vi===undefined?undefined:+startBtn.dataset.vi);
    return;
  }
  if(!S.active) return;

  var step=t.closest('[data-act="step"]');
  if(step){
    var row=step.closest(".set");
    var f=step.dataset.f, d=num(step.dataset.d);
    var ex=S.active.exercises[+row.dataset.ei], st=ex.sets[+row.dataset.si];
    var oldW=st.w;
    if(f==="w"){ delete $('input[data-f="w"]',row).dataset.c2old; st.touched=true; }
    if(f==="w") st[f]=String(stepWeight(st[f],d,ex));     // the next stack weight when the row has pins
    else st[f]=String(Math.max(0,round(num(st[f])+d*metricStep(metricOf(ex)),2)));
    $('input[data-f="'+f+'"]',row).value=st[f];
    if(st.done){ st.load=effLoad(st.w,bwMode(ex)); refreshSummary(); }
    if(f==="w"){ refreshPlates(+row.dataset.ei,+row.dataset.si,row); c2Cascade(+row.dataset.ei,+row.dataset.si,oldW); }
    c2SyncChips();
    buzz(8); save(); return;
  }

  var tick=t.closest('[data-act="toggle"]');
  if(tick){
    var r2=tick.closest(".set");
    toggleSet(+r2.dataset.ei,+r2.dataset.si);
    return;
  }

  var rp=t.closest('[data-act="rpe"]');
  if(rp){
    var rrow=rp.closest(".set");
    rpeSheet(+rrow.dataset.ei,+rrow.dataset.si);
    return;
  }
  var wm=t.closest('[data-act="warm"]');
  if(wm){
    var r3=wm.closest(".set");
    var ex5=S.active.exercises[+r3.dataset.ei], st5=ex5.sets[+r3.dataset.si];
    /* A ticked set is logged as what it is; flipping it would silently move it
       in or out of every count (S4). */
    if(st5.done){ toast("Untick the set first"); return; }
    st5.warm=!st5.warm;
    if(st5.warm) st5.pr=false;
    c2RefreshCard(+r3.dataset.ei);                                // in place: no re-render (trap 1)
    save(); refreshSummary();
    toast(st5.warm?"Marked as a warm-up":"Back to a working set");
    return;
  }

  var exn=t.closest('[data-act="ex-note"]');
  if(exn){
    /* Swapped in place, never a re-render mid-workout (trap 1). */
    var wrap=exn.parentNode, ein=exn.dataset.ei;
    wrap.innerHTML=exNoteBox(ein,"");
    $("textarea",wrap).focus();
    return;
  }
  var rev=t.closest('[data-act="revert"]');
  if(rev){
    var ex2=S.active.exercises[+rev.dataset.ei];
    c2FillUndone(+rev.dataset.ei,ex2.lastW,ex2.lastR);          // in place: no re-render (trap 1)
    rev.remove();
    save();
    toast("Back to "+entryText({w:ex2.lastW},bwMode(ex2))+" × "+ex2.lastR);
    return;
  }
  var usl=t.closest('[data-act="usual"]');
  if(usl){ c2OnUsual(+usl.dataset.ei,usl); return; }
  if(t.closest('[data-act="easeback"]')){ c2OnEaseBack(); return; }

  var addSet=t.closest('[data-act="add-set"]');
  if(addSet){
    var ex3=S.active.exercises[+addSet.dataset.ei];
    var w3=working(ex3.sets);
    var lastS=w3[w3.length-1]||{w:"",r:ex3.targetReps};
    var ns={w:lastS.w,r:lastS.r,done:false};
    if(schemeOf(ex3)==="topback") ns.role="back";                // + Set on a top-set lift is another back-off
    ex3.sets.push(ns);
    save(); viewToday(); refreshSummary(); return;
  }
  var delSet=t.closest('[data-act="del-set"]');
  if(delSet){
    var ex4=S.active.exercises[+delSet.dataset.ei];
    for(var i=ex4.sets.length-1;i>=0;i--){
      if(!ex4.sets[i].warm){ ex4.sets.splice(i,1); break; }
    }
    save(); viewToday(); refreshSummary(); return;
  }
  var exMenu=t.closest('[data-act="ex-menu"]');
  if(exMenu){ exerciseMenu(+exMenu.dataset.ei); return; }

  if(t.closest('[data-act="add-ex"]')){ pickExercise(); return; }
  if(t.closest('[data-act="finish"]')){ finishSheet(); return; }
  if(t.closest('[data-act="discard"]')){
    confirmSheet("Discard this session?","Nothing gets saved to your history.","Discard",function(){
      S.active=null; stopRest(); save(); render();
    },true);
  }
});

$("#view").addEventListener("input",function(e){
  var inp=e.target;
  if(inp.matches('.set input[data-f]')){
    var row=inp.closest(".set");
    var ex=S.active.exercises[+row.dataset.ei], st=ex.sets[+row.dataset.si];
    var oldV=st[inp.dataset.f];
    st[inp.dataset.f]=inp.value;
    if(st.done){ st.load=effLoad(st.w,bwMode(ex)); refreshSummary(); }
    if(inp.dataset.f==="w"){
      /* The value before this edit began, kept until the field is committed (blur
         or Enter): the followers move once, to a finished number, never to "1"
         on the way to "135". */
      if(inp.dataset.c2old===undefined) inp.dataset.c2old=oldV;
      st.touched=true;
      refreshPlates(+row.dataset.ei,+row.dataset.si,row);
    }
    c2SyncChips();
    save();
  } else if(inp.matches('[data-act="snote"]')){
    S.active.note=inp.value; save();
  } else if(inp.matches('[data-act="exnote"]')){
    S.active.exercises[+inp.dataset.ei].note=inp.value; save();
  }
});
$("#view").addEventListener("change",function(e){
  var inp=e.target;
  if(!S.active||!inp.matches||!inp.matches('.set input[data-f="w"]')) return;
  var old=inp.dataset.c2old;
  delete inp.dataset.c2old;
  if(old===undefined) return;
  var row=inp.closest(".set");
  /* A typed value reaches the other sets only if it could be a working load:
     "1" typed on the way to "135", or a slip of the thumb, stays in set 1 (the
     Keep chip is the way back). Judged against what the set held before the
     edit; with nothing before it there is nothing to compare, so it follows. */
  var nv=num(inp.value), ov=num(old);
  if(ov>0&&!(nv>0&&nv>=0.5*ov&&nv<=1.5*ov)){ save(); return; }
  c2Cascade(+row.dataset.ei,+row.dataset.si,old);
  save();
});
$("#view").addEventListener("keydown",function(e){
  if(e.key==="Enter"&&e.target.matches(".set input")){ e.preventDefault(); e.target.blur(); }
});

function toggleSet(ei,si){
  var ex=S.active.exercises[ei], st=ex.sets[si];
  if(st.done){
    st.done=false; st.pr=false; delete st.load;
    save(); refreshSetRow(ei,si); refreshSummary(); return;
  }
  if(!num(st.r)){ toast("Add reps first"); return; }
  st.done=true; st.ts=Date.now();
  st.load=effLoad(st.w,bwMode(ex));
  if(st.warm){ st.pr=false; }
  else {
    /* A PR has to beat the history and everything already done today. */
    var met=metricOf(ex);
    var histBest=bestScore(ex.name), bar=histBest;
    ex.sets.forEach(function(o,i){ if(o.done&&!o.warm&&i!==si) bar=Math.max(bar,setScore(o,met)); });
    st.pr=setScore(st,met)>0&&histBest>0&&setScore(st,met)>bar+0.01;
  }
  buzz(14);
  if(S.settings.autoRest&&lastInGroup(S.active.exercises,ei)) startRest(S.settings.rest);
  save();
  refreshSetRow(ei,si); refreshSummary(); c2SyncChips();
  if(st.pr) toast("New PR on "+ex.name);
}

/* Rated after the set, never before it — an extra field you must fill in to
   log a set would break the one-tap rule outright. Off by default. */
var RPE_SCALE=[10,9.5,9,8.5,8,7.5,7,6.5,6];
function rpeHelp(v){
  if(v>=10) return "nothing left";
  if(v>=9.5) return "maybe half a rep left";
  var rir=Math.round((10-v)*2)/2;
  return fmt(rir)+" rep"+(rir===1?"":"s")+" in reserve";
}
function rpeSheet(ei,si){
  var ex=S.active.exercises[ei], st=ex.sets[si];
  sheet('<h3>How hard was that?</h3>'+
    '<div class="sub">'+esc(ex.name)+' · set '+(si+1)+'. Optional — it only changes what gets prescribed if you log it.</div>'+
    '<div class="picklist">'+RPE_SCALE.map(function(v){
      return '<button data-rpe="'+v+'"'+(num(st.rpe)===v?' style="background:var(--panel-2)"':"")+'>'+
        '<b>RPE '+fmt(v)+'</b><span class="h">'+esc(rpeHelp(v))+'</span></button>';
    }).join("")+'</div>'+
    '<button class="btn ghost block" style="margin-top:6px" data-x="clear">Clear</button>',
    function(el){
      $$("[data-rpe]",el).forEach(function(b){
        b.onclick=function(){
          st.rpe=num(b.dataset.rpe); save(); closeSheet(); refreshPlates(ei,si);
        };
      });
      $('[data-x="clear"]',el).onclick=function(){
        delete st.rpe; save(); closeSheet(); refreshPlates(ei,si);
      };
    });
}

/* The self-test for the one thing a desktop browser cannot check. */
function bgTestSheet(){
  var r=diagReport();
  var body;
  if(!r||!r.fired){
    body='<div class="sub">This starts a 20-second rest. Lock your phone straight away, '+
      'put it down, and wait for the alarm. Come back here afterwards and this will say what happened.</div>'+
      '<button class="btn primary block" data-x="go">Start the 20-second test</button>';
  } else {
    var frozen=r.maxGap>3;
    var late=Math.abs(r.fired-r.want)>2;
    var tone=S.settings.keepTone;
    var verdict = frozen
      ? ["FAILED — the page was frozen","var(--bad)",
         tone
          ? "Chrome stopped running the timer even with the keep-alive tone playing. The audio route is exhausted on this phone."
          : "Chrome paused the timer while the screen was off. Turn on the keep-alive tone under Plan — it will fix this, at the cost of muting your music during rests."]
      : late
        ? ["PARTIAL — ran late","var(--bad)",
           "The timer kept running but the alarm fired "+fmt(r.fired)+"s in instead of "+r.want+"s."]
        : ["PASSED — the timer stayed alive","var(--good)",
           r.hidden<3
             ? "But the screen was only off for "+fmt(r.hidden)+"s, so this did not really test a locked phone. Run it again and lock the phone properly."
             : "The alarm fired on time with the screen off for "+fmt(r.hidden)+"s"+
            (tone?" — with the keep-alive tone on."
                 :", and with the keep-alive tone OFF. Your phone doesn't need it, so your music stays untouched.")];
    body='<div class="banner '+(frozen||late?"warn":"calm")+'" style="margin-bottom:12px">'+
        '<div class="bt" style="color:'+verdict[1]+'">'+esc(verdict[0])+'</div>'+
        '<div class="bd">'+esc(verdict[2])+'</div></div>'+
      '<div class="card" style="padding:0;margin-bottom:12px">'+
        diagRow("Rest length",r.want+"s")+
        diagRow("Alarm fired at",r.fired?fmt(r.fired)+"s":"never")+
        diagRow("Timer ticks",r.ticks+" of ~"+r.expected)+
        diagRow("Longest gap between ticks",fmt(r.maxGap)+"s",r.maxGap>3)+
        diagRow("Screen off for",fmt(r.hidden)+"s",r.hidden<3)+
        diagRow("Keep-alive tone",S.settings.keepTone?"on (mutes your music)":"off")+
        diagRow("Audio at alarm time",r.audio||"—")+
        diagRow("Notifications",notifyState())+
      '</div>'+
      '<button class="btn primary block" data-x="go">Run it again</button>';
  }
  sheet('<h3>Background alarm test</h3>'+body+
    '<button class="btn ghost block" style="margin-top:8px" data-x="close">Close</button>',
    function(el){
      $('[data-x="go"]',el).onclick=function(){
        closeSheet();
        if(!S.settings.sound&&!S.settings.notify) S.settings.sound=true;
        startRest(20);
        toast("Lock your phone now");
      };
      $('[data-x="close"]',el).onclick=closeSheet;
    });
}
function diagRow(label,value,bad){
  return '<div class="field-row" style="padding:9px 12px;margin:0">'+
    '<div class="fl">'+esc(label)+'</div>'+
    '<div class="num tiny"'+(bad?' style="color:var(--bad-ink)"':"")+'>'+esc(String(value))+'</div></div>';
}

function loadTypeRow(mode,attr){
  return '<div class="field-row"><div class="fl">Load type<div class="fh">'+
      (mode===1?"The number is weight added to you":mode===2?"The number is assistance taken off":"The number is the weight you lift")+
    '</div></div></div>'+
    '<div class="seg" style="margin:0 0 4px">'+
      '<button data-'+attr+'="0"'+(mode===0?' class="on"':"")+'>Weighted</button>'+
      '<button data-'+attr+'="1"'+(mode===1?' class="on"':"")+'>Bodyweight</button>'+
      '<button data-'+attr+'="2"'+(mode===2?' class="on"':"")+'>Assisted</button>'+
    '</div>'+
    (mode!==0&&!num(S.settings.bodyweight)
      ? '<div class="tiny" style="color:var(--bad-ink);margin-bottom:8px">Set your bodyweight under Plan → Session so this can compute real loads.</div>':"");
}

/* Reps is the default and always will be; the other two exist so planks and
   carries stop being logged as a lie ("60 reps"). */
/* ============================ templates ============================
   Three empty days and a text box is a twenty-minute setup and the most
   predictable reason to give up before the first session. These are ordinary
   routines — nothing here is a special case afterwards; `bar` is left to
   guessBar() and muscles to guessMuscles(), so a template gets exactly the
   same treatment as anything you type yourself.
   =================================================================== */
var TEMPLATES=[
  {id:"ppl", name:"Push / Pull / Legs",
   note:"Three days, each hit once a week. The most common split there is.",
   days:[
     ["Push",["Bench Press","Overhead Press","Incline Dumbbell Press","Lateral Raise","Triceps Pushdown"]],
     ["Pull",["Barbell Row","Lat Pulldown","Face Pull","Barbell Curl","Hammer Curl"]],
     ["Legs",["Back Squat","Romanian Deadlift","Leg Press","Leg Curl","Standing Calf Raise"]]
   ]},
  {id:"ul", name:"Upper / Lower",
   note:"Two days, run twice a week if you can. Good if you train four times.",
   days:[
     ["Upper",["Bench Press","Barbell Row","Overhead Press","Lat Pulldown","Barbell Curl","Triceps Pushdown"]],
     ["Lower",["Back Squat","Romanian Deadlift","Leg Press","Leg Curl","Standing Calf Raise","Plank"]]
   ]},
  {id:"fb", name:"Full body, 3 days",
   note:"Everything every session. Best return if you only train three times.",
   days:[
     ["Day A",["Back Squat","Bench Press","Barbell Row","Overhead Press","Plank"]],
     ["Day B",["Deadlift","Overhead Press","Lat Pulldown","Leg Press","Hanging Leg Raise"]],
     ["Day C",["Front Squat","Incline Dumbbell Press","Barbell Row","Barbell Curl","Standing Calf Raise"]]
   ]}
];
function applyTemplate(t){
  S.routines=t.days.map(function(d,i){
    var r=newRoutine(String.fromCharCode(65+i),d[0]);
    /* Templates build ordinary exercises through the same constructor as
       anything you type by hand, so a template plank gets a hold range in
       seconds and a template curl gets an isolation range. Templates stay
       single-variant — doubling every one of them would be noise. */
    r.variants[0].exercises=d[1].map(function(n){ return newPlanEx(n); });
    return r;
  });
  PLANVAR={};
  writeNow();
}
/* Planks and carries in a template shouldn't arrive claiming "8 reps". */
function guessMetric(name){
  if(/plank|hold|dead ?hang|wall ?sit|\bl-?sit\b/i.test(name)) return 1;
  if(/carry|walk|sled|prowler|\brun\b|row erg|bike|treadmill/i.test(name)) return 2;
  return 0;
}
function templateSheet(){
  var used=!planIsEmpty();
  sheet('<h3>Start from a template</h3>'+
    '<div class="sub">'+(used
      ? "This replaces your training days. Sessions already logged stay in your history."
      : "Pick one and edit it — every exercise, rep range and set count is yours to change.")+'</div>'+
    '<div class="picklist">'+TEMPLATES.map(function(t){
      return '<button data-tpl="'+t.id+'" style="display:block">'+
        '<div style="font-weight:700">'+esc(t.name)+'</div>'+
        '<div class="tiny muted" style="margin-top:2px">'+esc(t.note)+'</div>'+
        '<div class="tiny muted" style="margin-top:3px;font-family:var(--mono)">'+
          esc(t.days.map(function(d){ return d[0]+" ("+d[1].length+")"; }).join(" · "))+'</div>'+
      '</button>';
    }).join("")+'</div>'+
    '<button class="btn ghost block" style="margin-top:6px" data-x="cancel">Cancel</button>',
    function(el){
      $$("[data-tpl]",el).forEach(function(b){
        b.onclick=function(){
          var t=TEMPLATES.filter(function(x){ return x.id===b.dataset.tpl; })[0];
          if(!t) return;
          var before=JSON.parse(JSON.stringify(S.routines));
          applyTemplate(t); closeSheet(); viewPlan();
          toastUndo(t.name+" loaded",function(){
            S.routines=before; writeNow(); if(TAB==="plan") viewPlan(); toast("Put your split back");
          });
        };
      });
      $('[data-x="cancel"]',el).onclick=closeSheet;
    });
}

/* ============================ supersets ============================
   A group is defined by ADJACENCY, not by a shared id: `link: true` means
   "this exercise belongs with the one above it". Ids would need repairing
   every time you reorder or delete; adjacency just re-derives, so moving an
   exercise out of a pair simply ends the pair.
   =================================================================== */
function groupsOf(list){
  var out=[], cur=[];
  (list||[]).forEach(function(e,i){
    if(i>0&&e.link) cur.push(i);
    else { if(cur.length) out.push(cur); cur=[i]; }
  });
  if(cur.length) out.push(cur);
  return out;
}
/* "A1" / "A2" for a superset member, "" for anything on its own. */
function groupTag(list,i){
  var gs=groupsOf(list);
  for(var g=0;g<gs.length;g++){
    var pos=gs[g].indexOf(i);
    if(pos<0) continue;
    if(gs[g].length<2) return "";
    return String.fromCharCode(65+g)+(pos+1);
  }
  return "";
}
/* Rest belongs after the last exercise of a superset, not between its parts —
   walking straight to the next station is the whole point. */
function lastInGroup(list,i){
  var next=list[i+1];
  return !next||!next.link;
}

function rangeLabel(m){ return m===1?"Hold range (secs)":m===2?"Distance range":"Rep range"; }
function metricRow(met,attr){
  return '<div class="field-row"><div class="fl">Measured in<div class="fh">'+
      (met===1?"Sets are held for a number of seconds"
       :met===2?"Sets cover a distance — in whatever unit you already use"
       :"Sets are counted in reps")+
    '</div></div></div>'+
    '<div class="seg" style="margin:0 0 4px">'+
      '<button data-'+attr+'="0"'+(met===0?' class="on"':"")+'>Reps</button>'+
      '<button data-'+attr+'="1"'+(met===1?' class="on"':"")+'>Time</button>'+
      '<button data-'+attr+'="2"'+(met===2?' class="on"':"")+'>Distance</button>'+
    '</div>'+
    (met?'<div class="tiny muted" style="margin-bottom:8px">No pound volume is counted for '+
      metricNoun(met)+' work — weight × reps isn\'t defined for it.</div>':"");
}

/* A summary row that opens the picker, rather than 24 chips inline — the
   exercise menu is already long and this is set once per exercise, not per set. */
function muscleRow(ex){
  var t=tagsOf(ex), lab=tagLabel(t);
  var own=!!(ex.mg||(ex.mg2&&ex.mg2.length));
  return '<button class="navrow" data-x="mg"><span class="fl">Muscles'+
    (own?"":'<div class="fh">'+(lab?"Guessed from the name — tap to confirm":"Not set, so its sets go uncounted")+'</div>')+
    '</span><span class="fv">'+esc(lab||"None")+'</span><span class="ch">›</span></button>';
}

/* Main muscle and helpers are separate controls on purpose. A single tri-state
   chip would be smaller but you'd have to already know the rule to use it. */
function musclesSheet(ex,after){
  /* Materialise the guess on open. Otherwise the summary row reads through
     tagsOf() and shows "Quads + Glutes" while the picker shows nothing
     selected — same exercise, two answers. */
  if(!ex.mg&&!(ex.mg2||[]).length){
    var g=tagsOf(ex);
    ex.mg=g.mg; ex.mg2=g.mg2.slice();
    if(ex.mg||ex.mg2.length) save();
  }
  function draw(){
    var t={mg:ex.mg||"", mg2:(ex.mg2||[]).slice()};
    sheet('<h3>Muscles</h3><div class="sub">'+esc(ex.name)+'</div>'+
      '<div class="eyebrow">Main muscle</div>'+
      '<div class="mgrid">'+MUSCLES.map(function(m){
        return '<button class="mchip'+(t.mg===m.k?" on":"")+'" data-m="'+m.k+'">'+esc(m.n)+'</button>';
      }).join("")+'</div>'+
      '<div class="tiny muted" style="margin-bottom:12px">Each working set counts 1 toward this.</div>'+
      '<div class="eyebrow">Also works</div>'+
      '<div class="mgrid">'+MUSCLES.map(function(m){
        var on=t.mg2.indexOf(m.k)>=0;
        return '<button class="mchip'+(on?" on2":"")+(t.mg===m.k?" off":"")+'" data-m2="'+m.k+'"'+
          (t.mg===m.k?" disabled":"")+'>'+esc(m.n)+'</button>';
      }).join("")+'</div>'+
      '<div class="tiny muted" style="margin-bottom:12px">Half a set each, so pressing doesn\'t inflate your triceps count.'+
        '<br>Clearing falls back to a guess from the name.</div>'+
      '<div class="row" style="gap:8px">'+
        '<button class="btn ghost" style="flex:1" data-x="clear">Clear</button>'+
        '<button class="btn primary" style="flex:1" data-x="done">Done</button>'+
      '</div>',
      function(el){
        $$('[data-m]',el).forEach(function(b){
          b.onclick=function(){
            var k=b.dataset.m;
            ex.mg=(ex.mg===k)?"":k;
            /* A muscle can't be its own helper. */
            if(ex.mg) ex.mg2=(ex.mg2||[]).filter(function(x){ return x!==ex.mg; });
            save(); draw();
          };
        });
        $$('[data-m2]',el).forEach(function(b){
          b.onclick=function(){
            var k=b.dataset.m2, a=(ex.mg2||[]).slice(), i=a.indexOf(k);
            if(i>=0) a.splice(i,1); else a.push(k);
            ex.mg2=a; save(); draw();
          };
        });
        $('[data-x="clear"]',el).onclick=function(){ ex.mg=""; ex.mg2=[]; save(); draw(); };
        $('[data-x="done"]',el).onclick=function(){ writeNow(); closeSheet(); if(after) after(); };
      });
  }
  draw();
}

/* One number does the whole job: the empty bar's weight, or blank for
   anything that isn't a loaded barbell. */
function barRow(ex,attr){
  var bar=barOf(ex);
  return '<div class="field-row"><div class="fl">Barbell<div class="fh">'+
      (bwMode(ex)!==0
        ? "Plate maths is only shown for weighted lifts"
        : bar?"Showing plates per side over a "+fmt(bar)+" "+unit()+" bar"
             :"Bar weight — leave blank for dumbbells, machines and cables")+
    '</div></div>'+
    '<input class="txt small" inputmode="decimal" type="number" step="any" placeholder="—" data-'+attr+'="1" value="'+(bar||"")+'"></div>';
}

/* Generated warm-up ramp for this lift: on by default for compounds, off for
   isolation work, and a choice that sticks per lift. */
function warmRow(ex){
  if(bwMode(ex)!==0||metricOf(ex)!==0) return "";
  var on=c2WarmOn(ex.name,ex);
  return '<div class="field-row"><div class="fl">Warm-up sets<div class="fh">'+
      (on?"A short ramp before the work sets, built from today's load":"None for this lift")+
    '</div></div><button class="switch'+(on?" on":"")+'" role="switch" aria-checked="'+on+
    '" aria-label="Generated warm-up sets" data-x="warmgen"></button></div>';
}

function exerciseMenu(ei){
  var ex=S.active.exercises[ei];
  sheet('<h3>'+esc(ex.name)+'</h3><div class="sub">'+plural(working(ex.sets).length,"working set")+
      ' today · tap a set number to flag it a warm-up</div>'+
    '<div class="field-row"><div class="fl">Name</div>'+
      '<input class="txt" style="max-width:210px" data-x="name" aria-label="Exercise name" value="'+esc(ex.name)+'"></div>'+
    '<div class="field-row"><div class="fl">'+esc(rangeLabel(metricOf(ex)))+
      '<div class="fh">'+esc(modeHint(ex))+'</div></div>'+
      '<div class="row" style="gap:6px">'+
        '<input class="txt tiny-n" inputmode="numeric" type="number" data-x="low" aria-label="Rep range bottom" value="'+esc(ex.reps)+'">'+
        '<span class="muted tiny">to</span>'+
        '<input class="txt tiny-n" inputmode="numeric" type="number" data-x="top" aria-label="Rep range top" value="'+(ex.repTop||"")+'">'+
      '</div></div>'+
    '<div class="field-row"><div class="fl">Weight step</div>'+
      '<input class="txt small" inputmode="decimal" type="number" step="any" data-x="inc" aria-label="Weight step" value="'+esc(ex.inc||S.settings.inc)+'"></div>'+
    loadTypeRow(bwMode(ex),"bw")+
    metricRow(metricOf(ex),"met")+
    barRow(ex,"bar")+
    warmRow(ex)+
    muscleRow(ex)+
    '<div class="menu" style="margin-top:10px">'+
      '<button data-x="warmup">+ Add a warm-up set</button>'+
      /* NB: not data-x="top"/"up" — this sheet already uses data-x="top" for
         the rep-range field, and the collision silently binds the handler to
         the wrong element. */
      (ei>0?'<button data-x="link">'+(ex.link?"Break the superset":"Superset with the one above")+'</button>':"")+
      (ei>0?'<button data-x="mvtop">Move to the top</button>':"")+
      (ei>0?'<button data-x="mvup">Move up</button>':"")+
      (ei<S.active.exercises.length-1?'<button data-x="mvdn">Move down</button>':"")+
      (!ex.planId&&S.active.routineId?'<button data-x="keep">Add permanently to '+esc(S.active.name)+'</button>':"")+
      '<button data-x="fcheck">Form check (video)</button>'+
      '<button data-x="hist">See history &amp; chart</button>'+
      '<button data-x="rm" class="dang">Remove from this session</button>'+
    '</div>'+
    '<button class="btn primary block" style="margin-top:6px" data-x="done">Done</button>',
    function(el){
      var nameEl=$('[data-x="name"]',el);
      $('[data-x="low"]',el).oninput=function(){ ex.reps=Math.max(1,num(this.value)); save(); };
      $('[data-x="top"]',el).oninput=function(){ ex.repTop=num(this.value)||0; save(); };
      $('[data-x="inc"]',el).oninput=function(){ ex.inc=num(this.value)||null; save(); };
      $$('[data-bw]',el).forEach(function(b){
        b.onclick=function(){
          ex.bw=num(b.dataset.bw);
          ex.sets.forEach(function(s){ if(s.done) s.load=effLoad(s.w,ex.bw); });
          save(); closeSheet(); viewToday(); refreshSummary(); exerciseMenu(ei);
        };
      });
      $('[data-bar]',el).oninput=function(){
        ex.bar=Math.max(0,num(this.value));
        save(); viewToday(); refreshSummary();
      };
      var wg=$('[data-x="warmgen"]',el);
      if(wg) wg.onclick=function(){
        var on=!c2WarmOn(ex.name,ex);
        if(!S.settings.warmups||typeof S.settings.warmups!=="object") S.settings.warmups={};
        S.settings.warmups[normName(ex.name)]=on;
        if(!on) ex.sets=ex.sets.filter(function(s){ return !(s.warm&&s.gen&&!s.done); });
        else if(!ex.sets.some(function(s){ return s.warm; })){
          var fw=working(ex.sets)[0];
          ex.sets=(fw?c2WarmUps(ex.name,ex,num(fw.w)):[]).concat(ex.sets);
        }
        save(); closeSheet(); viewToday(); refreshSummary(); exerciseMenu(ei);
      };
      $('[data-x="mg"]',el).onclick=function(){
        musclesSheet(ex,function(){ exerciseMenu(ei); });
      };
      $$('[data-met]',el).forEach(function(b){
        b.onclick=function(){
          ex.metric=num(b.dataset.met); save(); closeSheet(); viewToday(); refreshSummary(); exerciseMenu(ei);
        };
      });
      $('[data-x="warmup"]',el).onclick=function(){
        ex.sets.unshift({w:ex.sets[0]?ex.sets[0].w:"",r:"5",warm:true,done:false});
        save(); closeSheet(); viewToday(); refreshSummary();
      };
      /* Reordering is structural, not the between-sets path, so a full
         viewToday() re-render is fine here. */
      function moveTo(to){
        var moved=S.active.exercises.splice(ei,1)[0];
        if(to===0) moved.link=false;      // nothing above to pair with
        S.active.exercises.splice(to,0,moved);
        save(); closeSheet(); viewToday(); refreshSummary();
        var card=$('.card.ex[data-ei="'+to+'"]');
        if(card&&card.scrollIntoView) card.scrollIntoView({block:"start"});
        toast(moved.name+(to===0?" moved to the top":" moved"));
      }
      var lk=$('[data-x="link"]',el);
      if(lk) lk.onclick=function(){
        ex.link=!ex.link; save(); closeSheet(); viewToday(); refreshSummary();
        toast(ex.link?"Supersetted — no rest until the next one is done":"Superset broken");
      };
      var mt=$('[data-x="mvtop"]',el), mu=$('[data-x="mvup"]',el), md=$('[data-x="mvdn"]',el);
      if(mt) mt.onclick=function(){ moveTo(0); };
      if(mu) mu.onclick=function(){ moveTo(ei-1); };
      if(md) md.onclick=function(){ moveTo(ei+1); };
      var keep=$('[data-x="keep"]',el);
      if(keep) keep.onclick=function(){
        var r=S.routines.find(function(x){ return x.id===S.active.routineId; });
        if(!r) return;
        /* Into the week you are actually training, not into week 1. */
        var av=activeVariant(r);
        if(!av) return;
        var ne=planExFromSession(ex);
        av.exercises.push(ne); ex.planId=ne.id; ex.supplemental=false;
        save(); closeSheet(); viewToday(); refreshSummary();
        toast("Added to "+r.name+(variantsOf(r).length>1?" · "+esc(av.label||"this week"):""));
      };
      $('[data-x="fcheck"]',el).onclick=function(){ closeSheet(); fcOpen(ei); };
      $('[data-x="hist"]',el).onclick=function(){ closeSheet(); liftSheet(ex.name); };
      $('[data-x="rm"]',el).onclick=function(){
        var gone=S.active.exercises.splice(ei,1)[0];
        save(); closeSheet(); viewToday(); refreshSummary();
        toastUndo("Removed "+gone.name,function(){
          if(!S.active) return;                    // finished or discarded meanwhile
          S.active.exercises.splice(Math.min(ei,S.active.exercises.length),0,gone);
          save(); if(TAB==="today"){ viewToday(); refreshSummary(); }
          toast(gone.name+" is back");
        });
      };
      $('[data-x="done"]',el).onclick=function(){
        var newName=nameEl.value.trim();
        /* Close this menu BEFORE renaming: a rename onto an existing name
           opens a sheet of its own, and sheets are a single slot. */
        closeSheet(); viewToday(); refreshSummary();
        if(newName&&newName!==ex.name) renameExercise(ex.name,newName);
      };
    });
}


/* ============================ Today idle: its own taps (2.0, package D) ============================
   A listener of its own, not a branch of the one above: it handles only what
   Today idle renders for off-book sessions, the pump day and the block
   scorecard, and does nothing mid-workout. The functions it calls live in
   11-coach.js, which loads after this file and is also what the Node
   simulator loads, so no listener can go there. */
$("#view").addEventListener("click",function(e){
  if(TAB!=="today"||S.active) return;
  var t=e.target, b;
  if((b=t.closest('[data-act="offbook"]'))){ offBook(b.dataset.id,b.dataset.vi===undefined?undefined:+b.dataset.vi); return; }
  if(t.closest('[data-act="pump"]')){ blkPump(); return; }
  if((b=t.closest('[data-act="open-session"]'))){ sessionSheet(b.dataset.id); return; }
  if(t.closest('[data-act="block-next"]')){ blkChoose("next"); return; }
  if(t.closest('[data-act="block-deload"]')){ blkChoose("deload"); return; }
});

self.__ilf=(self.__ilf||0)+1;
