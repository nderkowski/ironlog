"use strict";
/* ============================ TODAY ============================ */
function nextRoutine(){
  if(!S.routines.length) return null;
  var last=S.sessions.find(function(s){ return s.routineId; });
  if(!last) return S.routines[0];
  var i=S.routines.findIndex(function(r){ return r.id===last.routineId; });
  if(i<0) return S.routines[0];
  return S.routines[(i+1)%S.routines.length];
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
  var sp=shadowPrescribe(planEx.name,planEx);
  /* v25: once the rep-out method has earned it (repOutCard) and been made the
     default, it is the prescription wherever there is a rep-out to read, and
     still recorded as used so the scorecard keeps judging it. Lifts with no
     rep-out yet stay on the classic engine. */
  var auto=!!(S.settings.repOutDefault&&sp);
  if(auto) p={w:sp.w, r:sp.r, sets:sp.sets, why:"Rep-out method · "+sp.why,
              kind:sp.steps>0?"up":sp.steps<0?"deload":"reps"};
  var last=lastPerf(planEx.name);
  /* A lift the coach swapped in that has been done before but not for 4+ weeks
     starts one step lighter. Here and not in prescribe(): it is a prefill, not
     a progression rule. */
  if(planEx.stepBack&&last&&p.w!==""&&p.kind!=="deload"&&bwMode(planEx)===0&&metricOf(planEx)===0&&Date.now()-last.ts>28*864e5){
    var lighter=num(p.w)-stepFor(planEx);
    if(lighter>0){ p.w=lighter; p.why=(p.why?p.why+" · ":"")+"back after "+Math.round((Date.now()-last.ts)/864e5/7)+" weeks — one step lighter"; }
  }
  var raw=lastRawSets(planEx.name);
  var sets=[];
  if(raw) raw.forEach(function(s){ if(s.warm) sets.push({w:String(s.w),r:String(s.r),warm:true,done:false}); });
  var n=Math.max(1,num(p.sets)||3);
  for(var i=0;i<n;i++) sets.push({w:p.w===""?"":String(p.w),r:String(p.r),done:false});
  return {
    id:uid(), planId:planId||null, name:planEx.name,
    targetReps:p.r, reps:num(planEx.reps)||p.r, repTop:num(planEx.repTop)||0,
    inc:planEx.inc||null, bw:bwMode(planEx), bar:barOf(planEx), metric:metricOf(planEx),
    link:!!planEx.link,
    mg:planEx.mg||"", mg2:(planEx.mg2||[]).slice(),
    supplemental:!planId, note:"",
    why:p.why, kind:p.kind,
    shadow:sp?{w:sp.w,r:sp.r,why:sp.why,steps:sp.steps,stall:false,used:auto,auto:auto}:null,
    lastW:last?num(last.sets[0].w):null, lastR:last?num(last.sets[0].r):null,
    sets:sets
  };
}

function viewToday(){
  $("#view").innerHTML=S.active?todayActive():todayIdle();
}

function todayIdle(){
  var nr=nextRoutine();
  var html='<div class="eyebrow">'+esc(new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}))+'</div>'+
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
    var nex=planExOf(nr,nvi);
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
            return '<button class="daypick" data-act="start" data-id="'+r.id+'" data-vi="'+vi+'">'+
              '<span class="k">'+esc(r.key)+'</span>'+esc(r.name)+
              (variantsOf(r).length>1?" · "+esc(variantLabel(r,vi)):"")+'</button>';
          }).join("");
        }).join("")+
        '<button class="daypick" data-act="start" data-id=""><span class="k">+</span>Freestyle</button>'+
      '</div>'+
    '</div>';
  } else {
    html+='<div class="card"><div class="empty">No training days yet.<br>Set up your split in <b>Plan</b>.</div>'+
      '<button class="btn primary block" data-act="tab" data-tab="plan">Build my split</button></div>';
  }

  /* Coach suggestions sit under the day card: they never stand between him and
     the Start button. */
  html+=coachCard();

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
    html+='<button class="lastsess" data-act="edit-last" data-id="'+esc(last.id)+'">'+
      '<span class="ls-t"><span class="ls-k">Last</span> <b>'+esc(last.name||last.key||"Workout")+'</b> · '+
        esc(!isFinite(ago)?"":ago===0?"Today":ago===1?"Yesterday":ago>1&&ago<7?d1.toLocaleDateString(undefined,{weekday:"short"}):shortDate(last.ts))+
        ' · '+plural(lsets,"set")+(lvol>0?' · '+kfmt(lvol)+' '+unit():'')+(last.deload?' · deload':'')+'</span>'+
      '<span class="ls-edit">Edit</span></button>';
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
  var range=(ex.repTop>ex.reps?(ex.reps+"–"+ex.repTop):String(ex.targetReps))+metricSuffix(met);
  var nWork=working(ex.sets).length;
  var gtag=groupTag(S.active.exercises,ei);

  var html='<section class="card ex" data-ei="'+ei+'">'+
    '<div class="ex-head"><div class="t">'+
      '<div class="ex-name">'+(gtag?'<span class="gtag">'+esc(gtag)+'</span>':"")+esc(ex.name)+'</div>'+
      '<div class="ex-meta">'+
        /* "target" and "range" were too alike to read as different modes of
           progression, which is exactly how an exercise stuck on straight sets
           went unnoticed for weeks. "straight" names what it does. */
        '<span>'+nWork+' × '+esc(range)+(ex.repTop>ex.reps?" range":" straight")+'</span>'+
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
      (differs?'<button class="revert" data-act="revert" data-ei="'+ei+'">Keep '+esc(entryText({w:ex.lastW},mode))+metricJoin(met)+ex.lastR+metricSuffix(met)+'</button>':"")+
    '</div>';
  } else {
    html+='<div class="lastrow"><span>First time logging this one.</span></div>';
  }
  var ln=lastNote(ex.name);
  if(ln) html+='<div class="outhint">Note from '+esc(relDate(ln.ts))+': '+esc(ln.note)+'</div>';
  if(ex.why){
    var glyph=ex.kind==="up"?"↑":ex.kind==="reps"?"+1":ex.kind==="deload"?"↓":"=";
    html+='<div class="why '+esc(ex.kind)+'"><span class="mark">'+glyph+'</span><span>'+esc(ex.why)+'</span></div>';
  }
  var outSi=-1, outNo=0;
  if(repOutApplies(ex)) ex.sets.forEach(function(s,si){ if(!s.warm){ outSi=si; outNo++; } });
  var sh=ex.shadow;
  if(sh&&!sh.auto){
    var same=String(sh.w)===String(working(ex.sets)[0]?working(ex.sets)[0].w:"")&&
             String(sh.r)===String(working(ex.sets)[0]?working(ex.sets)[0].r:"");
    html+='<div class="shadow" data-shadow="'+ei+'"><span>Rep-out method: '+esc(entryText({w:sh.w},mode))+' × '+sh.r+
      ' <span class="muted" style="font-weight:500">· '+esc(sh.why)+'</span></span>'+
      (sh.used?'<span class="tiny muted" style="margin-left:auto">using it</span>':
       same?'<span class="tiny muted" style="margin-left:auto">same</span>':
       '<button class="use" data-act="use-shadow" data-ei="'+ei+'">Use</button>')+'</div>';
  }
  if(outSi>=0)
    html+='<div class="outhint">Set '+outNo+' is a rep-out: as many as you can — '+esc(repOutHint(ex.name))+'.</div>';
  html+='</div>';

  html+='<div class="sets">';
  var wi=0;
  ex.sets.forEach(function(s,si){
    if(!s.warm) wi++;
    html+='<div class="set'+(s.warm?" warm":"")+(s.done?" done":"")+(s.done&&s.pr?" pr":"")+(si===outSi?" out":"")+'" data-ei="'+ei+'" data-si="'+si+'">'+
      '<button class="idx" data-act="warm" aria-label="'+(s.warm?"Warm-up: make it a working set":"Set "+wi+": make it a warm-up")+'">'+(s.warm?"W":wi)+'</button>'+
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
  if(t.closest('[data-act="repout-on"]')){
    confirmSheet("Make the rep-out method the default?",
      "Wherever a lift has a rep-out to read, its suggestion becomes the prescription. Lifts without one stay on the classic method. You can switch back here at any time.",
      "Make it the default",function(){ S.settings.repOutDefault=true; writeNow(); render(); toast("Rep-out method is the default"); });
    return;
  }
  if(t.closest('[data-act="repout-off"]')){
    S.settings.repOutDefault=false; writeNow(); render(); toast("Back to the classic method"); return;
  }

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
    var by=f==="w"?stepFor(ex):metricStep(metricOf(ex));
    st[f]=String(Math.max(0,round(num(st[f])+d*by,2)));
    $('input[data-f="'+f+'"]',row).value=st[f];
    if(st.done){ st.load=effLoad(st.w,bwMode(ex)); refreshSummary(); }
    if(f==="w") refreshPlates(+row.dataset.ei,+row.dataset.si,row);
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
    st5.warm=!st5.warm;
    if(st5.warm) st5.pr=false;
    save(); viewToday(); refreshSummary();
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
  var use=t.closest('[data-act="use-shadow"]');
  if(use){
    var ex6=S.active.exercises[+use.dataset.ei], sh6=ex6.shadow;
    if(!sh6) return;
    ex6.sets.forEach(function(s){ if(!s.done&&!s.warm){ s.w=String(sh6.w); s.r=String(sh6.r); } });
    sh6.used=true;
    /* The card and the record follow what is actually being lifted: a
       rep-out step-down taken this way is the app's decision ("deload"), not
       a drop he chose, so sinceChosenDrop() must not restart the trend on
       it (external review, Argon). */
    ex6.kind=num(sh6.steps)>0?"up":num(sh6.steps)<0?"deload":"reps";
    ex6.why="Rep-out method · "+sh6.why;
    save(); viewToday(); refreshSummary();
    toast("Using the rep-out method: "+entryText({w:sh6.w},bwMode(ex6))+" × "+sh6.r);
    return;
  }
  var rev=t.closest('[data-act="revert"]');
  if(rev){
    var ex2=S.active.exercises[+rev.dataset.ei];
    ex2.sets.forEach(function(s){ if(!s.done&&!s.warm){ s.w=String(ex2.lastW); s.r=String(ex2.lastR); } });
    save(); viewToday(); refreshSummary();
    toast("Back to "+entryText({w:ex2.lastW},bwMode(ex2))+" × "+ex2.lastR);
    return;
  }

  var addSet=t.closest('[data-act="add-set"]');
  if(addSet){
    var ex3=S.active.exercises[+addSet.dataset.ei];
    var w3=working(ex3.sets);
    var lastS=w3[w3.length-1]||{w:"",r:ex3.targetReps};
    ex3.sets.push({w:lastS.w,r:lastS.r,done:false});
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
    st[inp.dataset.f]=inp.value;
    if(st.done){ st.load=effLoad(st.w,bwMode(ex)); refreshSummary(); }
    if(inp.dataset.f==="w") refreshPlates(+row.dataset.ei,+row.dataset.si,row);
    save();
  } else if(inp.matches('[data-act="snote"]')){
    S.active.note=inp.value; save();
  } else if(inp.matches('[data-act="exnote"]')){
    S.active.exercises[+inp.dataset.ei].note=inp.value; save();
  }
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
  refreshSetRow(ei,si); refreshSummary();
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

self.__ilf=(self.__ilf||0)+1;
