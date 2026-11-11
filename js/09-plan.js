"use strict";
/* ============================ PLAN ============================ */
var editingRoutine=null, editingVariant=0;

/* Which week the Plan tab is showing per day. Defaults to whatever is next, so
   opening Plan shows the session you are about to do rather than week 1
   forever. Reset on re-entering the tab, like the calendar's month. */
var PLANVAR={};
function shownVariant(r){
  var vs=variantsOf(r);
  var ix=PLANVAR[r.id];
  if(ix===undefined||ix>=vs.length) ix=nextVariantIx(r);
  return Math.max(0,Math.min(ix,vs.length-1));
}
/* Lifts that appear in this week only, and so come round fortnightly. */
function soloLifts(r,vi){
  var others={};
  variantsOf(r).forEach(function(v,i){
    if(i===vi) return;
    v.exercises.forEach(function(e){ others[normName(e.name)]=1; });
  });
  return planExOf(r,vi).filter(function(e){ return !others[normName(e.name)]; });
}
/* Adding a week to a day. A copy is the common case — an alternate week is
   usually a variation on the one you have — but starting empty is one tap
   away rather than a delete-everything chore. */
function addVariant(ri,copy){
  var r=S.routines[ri]; if(!r) return;
  var vs=variantsOf(r);
  if(!vs[0].label) vs[0].label="Week 1";
  var src=copy?planExOf(r,shownVariant(r)):[];
  var v=newVariant("Week "+(vs.length+1),src.map(function(e){
    return Object.assign({},e,{id:uid(),mg2:(e.mg2||[]).slice()});
  }));
  vs.push(v);
  PLANVAR[r.id]=vs.length-1;
  writeNow(); viewPlan();
  toastUndo(v.label+" added to "+r.name,function(){
    var i=vs.indexOf(v);
    if(i>=0) vs.splice(i,1);
    if(vs.length===1&&vs[0].label==="Week 1") vs[0].label="";
    delete PLANVAR[r.id];
    writeNow(); if(TAB==="plan") viewPlan();
    toast(v.label+" removed");
  });
}

/* Exercises that add weight the moment you hit the target, in a plan whose
   stated default is double progression. Almost always because they predate the
   feature: the switch has only ever set a default for *new* exercises, so a
   plan carried forward from an older version never got a range and nothing
   ever said so. */
function straightSetLifts(){
  var out=[];
  eachPlanEx(function(e,r){ if(!(num(e.repTop)>num(e.reps))) out.push({r:r,e:e}); });
  return out;
}
function rangeTiersHint(){
  if(!S.settings.doubleDefault) return "The rep target new exercises start at";
  var h=defaultRange("Barbell Bench Press",0), i=defaultRange("Cable Curl",0);
  return "For compounds. Heavy lifts start at "+h.low+"–"+h.top+
         ", isolation at "+i.low+"–"+i.top+", timed holds at 30–60s.";
}
/* Fit a range onto exercises that have none. The bottom is left exactly where
   it is — it is what you already train at, and moving it would silently change
   the programme — so only the reps-first room on top is added. */
function applyRanges(){
  var undo=[], n=0;
  function fit(e){
    undo.push({e:e, repTop:e.repTop});
    e.repTop=Math.max(1,num(e.reps))+rangeWidth(e.name,metricOf(e));
  }
  straightSetLifts().forEach(function(p){ fit(p.e); n++; });
  /* A workout already in progress holds its own copy of every exercise, and
     would otherwise keep showing the old mode until it was finished. */
  if(S.active) S.active.exercises.forEach(function(x){
    if(num(x.repTop)>num(x.reps)) return;
    var known=false;
    eachPlanEx(function(e){ if(normName(e.name)===normName(x.name)) known=true; });
    if(known) fit(x);
  });
  writeNow(); render();
  toastUndo(plural(n,"exercise")+" now climb reps first",function(){
    undo.forEach(function(u){ u.e.repTop=u.repTop; });
    writeNow(); render();
    toast("Rep ranges put back");
  });
}

/* ---- settings ----
   These lived at the foot of the Plan tab, below the split, where the list you
   scrolled past to reach them had nothing to do with them. Progression stayed
   behind with the split it shapes; everything else is here. */
function settingsSummary(){
  var bits=[unit(), S.settings.rest+"s rest"];
  if(S.settings.sound) bits.push("alarm on");
  if(S.settings.autoBackup) bits.push("auto-backup");
  return bits.join(" · ");
}
/* These rows live on the Settings screen but a few are still reachable from
   Plan, so anything that re-renders after changing one has to route rather
   than assume. */
function viewPrefs(){ if(TAB==="settings") viewSettings(); else viewPlan(); }
function viewSettings(){
  var v=$("#view");
  /* "This device" rather than a restatement of the brand: settings and the log
     are both keyed to this origin on this phone, which is worth saying where
     someone is about to change one. */
  var html='<div class="eyebrow">This device</div><h1 class="view-title">Settings</h1><div class="stack">';
  html+='<div class="eyebrow">Session</div><div class="card">'+
    '<div class="field-row"><div class="fl">Units</div>'+
      '<select class="txt" style="width:96px" aria-label="Units" data-set="unit">'+
        '<option value="lb"'+(unit()==="lb"?" selected":"")+'>lb</option>'+
        '<option value="kg"'+(unit()==="kg"?" selected":"")+'>kg</option></select></div>'+
    '<div class="field-row"><div class="fl">Your bodyweight<div class="fh">Used to score pull-ups, dips and assisted work</div></div>'+
      '<input class="txt small" inputmode="decimal" type="number" step="any" aria-label="Your bodyweight" data-set="bodyweight" value="'+(S.settings.bodyweight||"")+'"></div>'+
    '<div class="field-row"><div class="fl">Rest timer<div class="fh">Seconds after each logged set</div></div>'+
      '<input class="txt small" inputmode="numeric" type="number" aria-label="Rest timer, seconds" data-set="rest" value="'+esc(S.settings.rest)+'"></div>'+
    '<div class="field-row"><div class="fl">Start rest automatically</div>'+
      '<button class="switch'+(S.settings.autoRest?" on":"")+'" role="switch" aria-checked="'+!!S.settings.autoRest+'" aria-label="Start rest automatically" data-set="autoRest"></button></div>'+
    '<div class="field-row"><div class="fl">Vibrate<div class="fh">On logging a set and when rest ends</div></div>'+
      '<button class="switch'+(S.settings.buzz?" on":"")+'" role="switch" aria-checked="'+!!S.settings.buzz+'" aria-label="Vibrate" data-set="buzz"></button></div>'+
    '<div class="field-row"><div class="fl">Alarm when rest ends'+
      '<div class="fh">Beeps out loud, and keeps the timer running with the screen off</div></div>'+
      '<button class="switch'+(S.settings.sound?" on":"")+'" role="switch" aria-checked="'+!!S.settings.sound+'" aria-label="Alarm when rest ends" data-set="sound"></button></div>'+
    '<div class="field-row"><div class="fl">Rate sets (RPE)'+
      '<div class="fh">Adds an optional tag after you log a set. A hard week then holds the weight instead of adding.</div></div>'+
      '<button class="switch'+(S.settings.rpe?" on":"")+'" role="switch" aria-checked="'+!!S.settings.rpe+'" aria-label="Rate sets (RPE)" data-set="rpe"></button></div>'+
    '<div class="field-row"><div class="fl">Keep-alive tone during rests'+
      '<div class="fh">'+(S.settings.keepTone
        ? '<span style="color:var(--bad-ink)">Guarantees the alarm, but Android mutes your music for the whole rest.</span>'
        : "Off — your music plays untouched. If an alarm ever arrives late, the app will offer to turn this on.")+'</div></div>'+
      '<button class="switch'+(S.settings.keepTone?" on":"")+'" role="switch" aria-checked="'+!!S.settings.keepTone+'" aria-label="Keep-alive tone during rests" data-set="keepTone"></button></div>'+
    '<div class="field-row"><div class="fl">Back up after every workout'+
      '<div class="fh">Writes a file to your downloads when you tap Save workout. No extra tap, and it is the only backup that can\'t be forgotten.</div></div>'+
      '<button class="switch'+(S.settings.autoBackup?" on":"")+'" role="switch" aria-checked="'+!!S.settings.autoBackup+'" aria-label="Back up after every workout" data-set="autoBackup"></button></div>'+
    '<div class="field-row"><div class="fl">Test the alarm with the screen off'+
      '<div class="fh">Runs a 20-second rest and reports whether the phone kept the timer alive</div></div>'+
      '<button class="btn sm ghost" data-act="bgtest">Test</button></div>'+
    '<div class="field-row"><div class="fl">Notify when rest ends'+
      '<div class="fh">'+(notifyState()==="denied"
        ? '<span style="color:var(--bad-ink)">Blocked in your browser settings for this site</span>'
        : notifyState()==="none"
          ? "This browser can't show notifications"
          : "Shows up on the lock screen. Needs permission.")+'</div></div>'+
      '<button class="switch'+(S.settings.notify?" on":"")+'" role="switch" aria-checked="'+!!S.settings.notify+'" aria-label="Notify when rest ends" data-act="toggle-notify"></button></div>'+
  '</div>';

  html+='<div class="eyebrow" style="margin:6px 0 0">Barbell</div><div class="card">'+
    '<div class="field-row"><div class="fl">Bar weight<div class="fh">Used for new barbell exercises. Set it per exercise in its ⋯ menu.</div></div>'+
      '<input class="txt small" inputmode="decimal" type="number" step="any" aria-label="Bar weight" data-set="bar" value="'+esc(S.settings.bar||"")+'"></div>'+
    '<div class="field-row" style="display:block">'+
      '<div class="fl">Plates you own<div class="fh">Counted in pairs — one for each side.</div></div>'+
      '<div class="plate-ed">'+
        (S.settings.plates||[]).map(function(p,i){
          return '<div class="pr-row">'+
            '<input class="txt" inputmode="decimal" type="number" step="any" aria-label="Plate weight" data-pw="'+i+'" value="'+esc(p.w)+'">'+
            '<span class="x">'+esc(unit())+' ×</span>'+
            '<input class="txt" style="width:60px" inputmode="numeric" type="number" aria-label="Plate pairs" data-pn="'+i+'" value="'+esc(p.n)+'">'+
            '<span class="x">pairs</span><span class="sp"></span>'+
            '<button class="rm" data-act="plate-rm" data-i="'+i+'" aria-label="Remove this plate">✕</button>'+
          '</div>';
        }).join("")+
      '</div>'+
      '<div class="row" style="gap:8px;margin-top:8px">'+
        '<button class="btn sm ghost" style="flex:1" data-act="plate-add">+ Add a size</button>'+
        '<button class="btn sm ghost" style="flex:1" data-act="plate-reset">Reset to '+esc(unit())+'</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  html+='<div class="eyebrow" style="margin:6px 0 0">Workout plan</div><div class="card"><div class="stack">'+
    planSettingsHtml()+'</div></div>';

  html+='<div class="eyebrow" style="margin:6px 0 0">Data</div><div class="card"><div class="stack">'+
    '<div class="tiny muted" id="storage-status">'+esc(storageLine())+'</div>'+
    '<div class="tiny muted">Your log lives in this browser on this device. It only leaves it when you back it up to GitHub below, or send a file out.'+
    (S.settings.lastBackup?' Last copy '+relDate(S.settings.lastBackup)+'.':' No copy yet.')+'</div>'+
    '<button class="btn primary block" data-act="backup">Save a file copy</button>'+
    '<div class="row" style="gap:8px">'+
      '<button class="btn" style="flex:1" data-act="export">Export file</button>'+
      '<button class="btn" style="flex:1" data-act="import">Import</button>'+
    '</div>'+
    '<button class="btn danger block" data-act="wipe">Erase everything</button>'+
  '</div></div>';


  html+='<div class="eyebrow" style="margin:6px 0 0">GitHub backup</div><div class="card"><div class="stack">'+
    gistSettingsHtml()+'</div></div>';

  html+='<div class="eyebrow" style="margin:6px 0 0">AI coach</div><div class="card"><div class="stack">'+
    aiSettingsHtml()+'</div></div>';

  html+='<div class="eyebrow" style="margin:6px 0 0">About</div><div class="card">'+
    '<div class="field-row"><div class="fl">Version<div class="fh">Also printed at the foot of the Plan tab — check it on the device before believing any bug report</div></div>'+
      '<span class="chip mono">'+esc(BUILD)+'</span></div>'+
    '<div class="field-row"><div class="fl">Logged<div class="fh">Everything lives in this browser, on this device</div></div>'+
      '<span class="chip mono">'+plural(S.sessions.length,"session")+'</span></div>'+
  '</div>';

  v.innerHTML=html+'</div>';
}

function viewPlan(){
  var v=$("#view");
  var html='<div class="eyebrow">Your split</div><h1 class="view-title">Plan</h1><div class="stack">';

  S.routines.forEach(function(r,ri){
    var vs=variantsOf(r);
    var vi=shownVariant(r);
    var list=planExOf(r,vi);
    html+='<section class="card" style="padding:0">'+
      '<div class="ex-head" style="align-items:center">'+
        '<div class="daymark" style="width:40px;height:40px;flex:0 0 auto"><div class="letter" style="font-size:18px">'+esc(r.key)+'</div></div>'+
        '<div class="t" style="margin-left:2px"><div class="ex-name" style="font-size:15px">'+esc(r.name)+'</div>'+
        '<div class="ex-meta">'+plural(list.length,"exercise")+
          (vs.length>1?' · next up: '+esc(variantLabel(r,nextVariantIx(r))):"")+'</div></div>'+
        '<button class="kebab" data-act="day-menu" data-ri="'+ri+'" aria-label="Day options">⋯</button>'+
      '</div>';
    /* One segmented control per day, only once there is more than one week to
       choose between — a solitary "Week 1" tab is noise. */
    if(vs.length>1){
      html+='<div class="vseg">'+vs.map(function(v,i){
        return '<button'+(i===vi?' class="on"':"")+' data-act="pex-var" data-ri="'+ri+'" data-vi="'+i+'">'+
          esc(variantLabel(r,i))+'</button>';
      }).join("")+'</div>';
    }
    list.forEach(function(e,ei){
      /* Compact here on purpose. "straight" spells out the mode on the session
         card, where the confusion actually happened and there is room for it;
         in this row it costs more width than the muscle tag, and at 320px
         something has to give. The Progression banner above names every
         straight-sets exercise outright, which beats a word per row. */
      var range=e.repTop>e.reps?(e.reps+"–"+e.repTop):String(e.reps);
      var mode=bwMode(e);
      html+='<div class="pex">'+
        '<span class="pxn">'+(groupTag(list,ei)?'<span class="gtag">'+esc(groupTag(list,ei))+'</span>':"")+esc(e.name)+(mode?' <span class="chip tag">'+(mode===1?"BW":"ASST")+'</span>':"")+
          (!mode&&barOf(e)?' <span class="chip tag">BAR '+fmt(barOf(e))+'</span>':"")+'</span>'+
        '<span class="pxs">'+esc(muscleName(tagsOf(e).mg)||"?")+' · '+e.sets+'×'+esc(range)+'</span>'+
        '<button class="iconbtn" data-act="pex-up" data-ri="'+ri+'" data-vi="'+vi+'" data-ei="'+ei+'" aria-label="Move up">↑</button>'+
        '<button class="iconbtn" data-act="pex-edit" data-ri="'+ri+'" data-vi="'+vi+'" data-ei="'+ei+'" aria-label="Edit">⋯</button>'+
      '</div>';
    });
    if(!list.length) html+='<div class="empty" style="padding:14px">No exercises yet.</div>';
    /* Honest about the cost of splitting a day in two: a lift that appears in
       only one week is trained fortnightly, and trend() needs 4 sessions. */
    var solo=vs.length>1?soloLifts(r,vi).length:0;
    if(solo){
      html+='<div class="tiny muted" style="padding:0 14px 10px">'+
        (solo===1?"1 lift here runs":solo+" lifts here run")+
        ' only in this week — fortnightly rather than weekly, so trends take about twice as long to appear.</div>';
    }
    html+='<div class="ex-foot"><button class="btn sm ghost" data-act="pex-add" data-ri="'+ri+'" data-vi="'+vi+'">+ Add exercise</button>'+
      (vs.length>1?"":'<button class="btn sm ghost" data-act="var-add" data-ri="'+ri+'">+ Alternate week</button>')+
      '</div></section>';
  });

  html+='<div class="row" style="gap:8px">'+
    '<button class="btn ghost" style="flex:1" data-act="day-add">+ Training day</button>'+
    '<button class="btn ghost" style="flex:1" data-act="tpl">Start from a template</button>'+
  '</div>';

  html+='<hr class="sep"><div class="eyebrow" style="margin-bottom:8px">Progression</div><div class="card">';

  /* The switch below has only ever applied to exercises made *after* it was
     turned on, so a plan built before rep ranges existed keeps adding weight
     the moment you hit the target — and nothing said so. This offers the fix
     for the exercises already in the plan. */
  var ss=S.settings.doubleDefault?straightSetLifts():[];
  if(ss.length&&!S.settings.rangeFixHidden){
    var shown=ss.slice(0,3).map(function(p){ return p.e.name; }).join(", ");
    html+='<div class="banner warn" style="margin:0 0 10px">'+
      '<div class="bt">'+plural(ss.length,"exercise")+' still on straight sets</div>'+
      '<div class="bd">'+esc(shown)+(ss.length>3?" and "+(ss.length-3)+" more":"")+
        ' add weight as soon as you hit the target, instead of climbing reps first.'+
        ' The switch below only ever applied to new exercises, so anything in your'+
        ' plan from before it never got a range.</div>'+
      '<div class="acts"><button class="btn sm primary" data-act="fix-ranges">Give them rep ranges</button>'+
      '<button class="btn sm ghost" data-act="hide-fix">Leave them</button></div></div>';
  }

  html+='<div class="field-row"><div class="fl">Double progression by default<div class="fh">New exercises climb by reps first, then weight</div></div>'+
      '<button class="switch'+(S.settings.doubleDefault?" on":"")+'" role="switch" aria-checked="'+!!S.settings.doubleDefault+'" aria-label="Double progression by default" data-set="doubleDefault"></button></div>'+
    '<div class="field-row"><div class="fl">Default rep range'+
      '<div class="fh">'+esc(rangeTiersHint())+'</div></div>'+
      '<div class="row" style="gap:6px">'+
        '<input class="txt tiny-n" inputmode="numeric" type="number" aria-label="Default rep range, from" data-set="repLow" value="'+esc(S.settings.repLow)+'">'+
        '<span class="muted tiny">to</span>'+
        '<input class="txt tiny-n" inputmode="numeric" type="number" aria-label="Default rep range, to" data-set="repHigh" value="'+esc(S.settings.repHigh)+'">'+
      '</div></div>'+
    '<div class="field-row"><div class="fl">Default weight step<div class="fh">Used by ± and by the weight jumps</div></div>'+
      '<input class="txt small" inputmode="decimal" type="number" step="any" aria-label="Default weight step" data-set="inc" value="'+esc(S.settings.inc)+'"></div>'+
    '<div class="field-row"><div class="fl">Deload week'+
      '<div class="fh">'+(inDeloadWeek()
        ? "Running through "+esc(shortDate(S.settings.deloadUntil))+" — light prescriptions, excluded from trends"
        : "Light and short on purpose, and invisible to the trend maths")+'</div></div>'+
      (inDeloadWeek()
        ? '<button class="btn sm ghost" data-act="end-deload">End</button>'
        : '<button class="btn sm" data-act="start-deload">Start</button>')+'</div>'+
  '</div>';

  /* Progression stays here: rep ranges and the deload window shape the split
     they sit under, and separating cause from effect is what made the
     doubleDefault bug invisible. Everything else moved behind the gear. */
  html+='<button class="card" style="width:100%;text-align:left;margin:6px 0 0" data-act="settings">'+
    '<div class="row" style="align-items:center"><div>'+
      '<div class="ex-name" style="font-size:15px">Settings</div>'+
      '<div class="ex-meta"><span>'+esc(settingsSummary())+'</span></div></div>'+
    '<div style="flex:1"></div><span class="muted" style="font-size:20px">\u203A</span></div></button>';
  /* The build marker is here because a whole test round was wasted on a phone
     running an older deploy. Check this before believing any bug report. */
  html+='<div class="tiny muted" style="text-align:center;padding:6px 0">'+
    plural(S.sessions.length,"session")+' logged · Iron Log '+esc(BUILD)+'</div>';

  v.innerHTML=html+'</div>';
}

$("#view").addEventListener("click",function(e){
  if(TAB==="progress"){
    var cal=e.target.closest("[data-cal]");
    if(cal){
      /* offset counts backwards, and there is no future to page into */
      calOffset=Math.max(0,calOffset-(+cal.dataset.cal));
      viewProgress(); return;
    }
    var cd=e.target.closest("[data-calday]");
    if(cd){ sessionSheet(cd.dataset.calday); return; }
    if(e.target.closest('[data-act="pr-all"]')){ prSheet(); return; }
    var lb=e.target.closest("[data-lift]");
    if(lb){ liftSheet(lb.dataset.lift); return; }
    var sb=e.target.closest("[data-sess]");
    if(sb){ sessionSheet(sb.dataset.sess); return; }
  }
  /* The settings rows moved to their own screen but kept their handlers, so
     this listener has to answer for both. Miss this and every switch in
     Settings silently does nothing. */
  if(TAB!=="plan"&&TAB!=="settings") return;

  var t=e.target;
  if(t.closest('[data-act="settings"]')){ go("settings"); return; }
  var dm=t.closest('[data-act="day-menu"]');
  if(dm){ dayMenu(+dm.dataset.ri); return; }
  if(t.closest('[data-act="tpl"]')){ templateSheet(); return; }
  if(t.closest('[data-act="day-add"]')){
    var k=String.fromCharCode(65+S.routines.length);
    S.routines.push(newRoutine(k,"Day "+k));
    save(); viewPlan(); return;
  }
  var pv=t.closest('[data-act="pex-var"]');
  if(pv){ PLANVAR[S.routines[+pv.dataset.ri].id]=+pv.dataset.vi; viewPlan(); return; }
  var va=t.closest('[data-act="var-add"]');
  if(va){ variantAddSheet(+va.dataset.ri); return; }
  var pa=t.closest('[data-act="pex-add"]');
  if(pa){ editingRoutine=+pa.dataset.ri; editingVariant=+pa.dataset.vi||0; pickExercise("plan"); return; }
  var pu=t.closest('[data-act="pex-up"]');
  if(pu){
    var list=planExOf(S.routines[+pu.dataset.ri],+pu.dataset.vi), i=+pu.dataset.ei;
    if(i>0){
      var tmp=list[i-1]; list[i-1]=list[i]; list[i]=tmp;
      if(i-1===0) list[0].link=false;          // nothing above to pair with
      save(); viewPlan();
    }
    return;
  }
  var pe=t.closest('[data-act="pex-edit"]');
  if(pe){ planExMenu(+pe.dataset.ri,+pe.dataset.vi,+pe.dataset.ei); return; }

  /* Notifications need a grant, so this switch can't be a plain toggle: it
     only goes on if the browser actually says yes. */
  if(t.closest('[data-act="toggle-notify"]')){
    if(S.settings.notify){ S.settings.notify=false; writeNow(); viewPrefs(); return; }
    askNotify(function(ok,why){
      S.settings.notify=ok; writeNow(); viewPrefs();
      toast(ok?"Rest alerts will show on your lock screen":(why||"Notifications weren't allowed."));
    });
    return;
  }
  if(t.closest('[data-act="bgtest"]')){ bgTestSheet(); return; }
  var pAdd=t.closest('[data-act="plate-add"]');
  if(pAdd){ S.settings.plates.push({w:0,n:1}); save(); viewPrefs(); return; }
  var pRm=t.closest('[data-act="plate-rm"]');
  if(pRm){ S.settings.plates.splice(+pRm.dataset.i,1); save(); viewPrefs(); return; }
  if(t.closest('[data-act="plate-reset"]')){
    S.settings.plates=defaultPlates(unit());
    S.settings.bar=defaultBar(unit());
    save(); viewPrefs(); toast("Back to the standard "+unit()+" set"); return;
  }

  if(t.closest('[data-act="fix-ranges"]')){ applyRanges(); return; }
  if(t.closest('[data-act="hide-fix"]')){ S.settings.rangeFixHidden=true; save(); viewPlan(); return; }

  var sw=t.closest('[data-set]');
  if(sw&&sw.classList.contains("switch")){
    var k2=sw.dataset.set; S.settings[k2]=!S.settings[k2];
    sw.classList.toggle("on",S.settings[k2]); sw.setAttribute("aria-checked",String(!!S.settings[k2])); save();
    if(k2==="sound"&&S.settings[k2]) playSrc(audioURLs().alarm,false);   // proves it works
    if(k2==="sound"&&!S.settings[k2]&&!S.settings.notify) audioStop();
    /* Turning it on has to mean something for the plan you already have, not
       just for whatever you add next — so re-offer the repair. */
    if(k2==="doubleDefault"){ S.settings.rangeFixHidden=false; save(); viewPlan(); }
    return;
  }
  var pw=t.closest("[data-pw],[data-pn]");
  if(pw) return;                                  // let the input handler have it
  if(t.closest('[data-act="plan-fixc"]')){
    if(S.active){ toast("Finish or discard the workout first"); return; }
    if(recFixDayC()){ viewSettings(); toast("Day C re-paired"); }
    return;
  }
  if(t.closest('[data-act="plan-rec"]')||t.closest('[data-act="plan-back"]')){
    var back=!!t.closest('[data-act="plan-back"]');
    if(S.active){ toast("Finish or discard the workout first"); return; }
    confirmSheet(back?"Switch back to your previous plan?":"Switch to the recommended plan?",
      back?"Your days go back to how they were before you switched, and rest goes back to "+S.planBackup.rest+" s. Logged sessions are not touched."
          :"Days A, B and C are replaced with the plan above and rest becomes "+REC_PLAN.rest+" s (now "+S.settings.rest+
           " s). Every logged session is kept, with Lateral Riase and the two face-pull spellings merged. You can switch back here at any time.",
      back?"Switch back":"Switch",
      function(){
        if(back) switchBackPlan(); else switchToRecPlan();
        viewSettings();
        var nx=nextRoutine();
        toast((back?"Previous plan restored":"Switched")+(nx?" — "+nx.name+" is next":""));
      });
    return;
  }
  if(t.closest('[data-act="gist-save"]')){ if(gistSaveToken()) viewPrefs(); return; }
  if(t.closest('[data-act="gist-remove"]')){ gistRemoveToken(); viewPrefs(); return; }
  if(t.closest('[data-act="gist-now"]')){ gistNowTap(); return; }
  if(t.closest('[data-act="ai-save"]')){ if(aiSaveTap()) viewSettings(); return; }
  if(t.closest('[data-act="ai-remove"]')){ aiStore({}); aiClientP=null; viewSettings(); toast("Key removed from this browser"); return; }
  if(t.closest('[data-act="ai-test"]')){ aiTestTap(); return; }
  if(t.closest('[data-act="gist-restore"]')){ gistRestore(); return; }
  if(t.closest('[data-act="put-back"]')){ putBackBeforeRestore(); return; }
  if(t.closest('[data-act="export"]')){ doExport(); return; }
  if(t.closest('[data-act="import"]')){ doImport(); return; }
  if(t.closest('[data-act="wipe"]')){
    /* Erase used to be followed, 30 s later, by a push of the empty log over
       the GitHub backup. Now it detaches from the gist first (gistDetach()):
       the backup is kept and never touched, and Restore brings it back. */
    var hasGist=!!gistLoad().token;
    confirmSheet("Erase everything?",
      "Every session, day and setting on this phone is deleted."+
      (hasGist?" Your GitHub backup is kept and not touched: this phone stops backing up to it, and Restore from GitHub brings it back."
              :" Back up first if you want a copy."),
      "Erase",function(){
        S=defaultState(); writeNow(); gistDetach(); go("today"); toast("Wiped clean");
      },true);
  }
});
$("#view").addEventListener("change",function(e){
  var el=e.target.closest("[data-set]");
  if(!el||el.classList.contains("switch")) return;
  var k=el.dataset.set;
  if(k==="unit"){
    var to=el.value;
    if(to===S.settings.unit) return;
    /* Nothing logged and nothing planned means nothing to convert or mislabel,
       so don't make an empty app ask a question it can answer itself. */
    if(!S.sessions.length&&planIsEmpty()&&!S.active){
      S.settings.unit=to;
      S.settings.bar=defaultBar(to); S.settings.plates=defaultPlates(to);
      S.settings.inc=defaultInc(to);
      writeNow(); viewPrefs(); return;
    }
    unitSheet(S.settings.unit,to);
    return;
  }
  S.settings[k]=num(el.value);
  if(k==="rest"&&S.settings.rest<5) S.settings.rest=5;
  if(k==="repLow") S.settings.repLow=Math.max(1,S.settings.repLow);
  if(k==="repHigh") S.settings.repHigh=Math.max(S.settings.repLow,S.settings.repHigh);
  if(k==="bar") S.settings.bar=Math.max(0,S.settings.bar);
  save();
});
/* Plate rows update on input rather than change, so editing the inventory
   never re-renders the list out from under the field you're typing in. */
$("#view").addEventListener("input",function(e){
  if(TAB!=="plan"&&TAB!=="settings") return;
  var el=e.target, p;
  if(el.dataset.pw!==undefined){
    p=S.settings.plates[+el.dataset.pw];
    if(p){ p.w=Math.max(0,num(el.value)); save(); }
  } else if(el.dataset.pn!==undefined){
    p=S.settings.plates[+el.dataset.pn];
    if(p){ p.n=Math.max(0,Math.round(num(el.value))); save(); }
  }
});

function addToPlan(name){
  var r=S.routines[editingRoutine];
  if(!r) return;
  planExOf(r,editingVariant).push(newPlanEx(name));
  save(); viewPlan();
}

function variantAddSheet(ri){
  var r=S.routines[ri]; if(!r) return;
  sheet('<h3>An alternate week for '+esc(r.name)+'</h3>'+
    '<div class="sub">'+esc(r.name)+' will alternate between two versions each time it comes round. '+
      'A lift in both weeks keeps one history and one progression.</div>'+
    '<div class="menu">'+
      '<button data-x="copy">Start from a copy of this week</button>'+
      '<button data-x="empty">Start empty</button>'+
    '</div>'+
    '<button class="btn ghost block" style="margin-top:6px" data-x="cancel">Cancel</button>',
    function(el){
      $('[data-x="copy"]',el).onclick=function(){ closeSheet(); addVariant(ri,true); };
      $('[data-x="empty"]',el).onclick=function(){ closeSheet(); addVariant(ri,false); };
      $('[data-x="cancel"]',el).onclick=closeSheet;
    });
}

/* Renaming and removing a week. Kept in its own sheet rather than the day menu
   so the day menu doesn't grow a row per variant. */
function variantMenu(ri,vi){
  var r=S.routines[ri], v=variantAt(r,vi);
  if(!v) return;
  var vs=variantsOf(r);
  sheet('<h3>'+esc(variantLabel(r,vi))+'</h3><div class="sub">In '+esc(r.name)+' · '+
      plural(v.exercises.length,"exercise")+'</div>'+
    '<div class="field-row"><div class="fl">Name<div class="fh">Anything you like — "Week 2", "Heavy", "Deload"</div></div>'+
      '<input class="txt" style="max-width:180px" data-x="label" value="'+esc(v.label)+'"></div>'+
    '<div class="menu" style="margin-top:10px">'+
      (vs.length>1?'<button data-x="del" class="dang">Remove this week</button>':"")+
    '</div>'+
    '<button class="btn primary block" style="margin-top:6px" data-x="done">Done</button>',
    function(el){
      $('[data-x="label"]',el).oninput=function(){ v.label=this.value; save(); };
      var d=$('[data-x="del"]',el);
      if(d) d.onclick=function(){
        confirmSheet("Remove "+variantLabel(r,vi)+"?",
          plural(v.exercises.length,"exercise")+" in it are removed from the plan. Sessions already logged stay in your history.",
          "Remove",function(){
            var gone=vs.splice(vi,1)[0];
            if(vs.length===1&&vs[0].label==="Week 1") vs[0].label="";
            delete PLANVAR[r.id];
            writeNow(); viewPlan();
            toastUndo("Removed "+(gone.label||"that week"),function(){
              vs.splice(Math.min(vi,vs.length),0,gone);
              writeNow(); if(TAB==="plan") viewPlan();
              toast((gone.label||"That week")+" is back");
            });
          },true);
      };
      $('[data-x="done"]',el).onclick=function(){ closeSheet(); viewPlan(); };
    });
}

function dayMenu(ri){
  var r=S.routines[ri];
  sheet('<h3>'+esc(r.name)+'</h3><div class="sub">Shown as “'+esc(r.key)+'” in the rotation.</div>'+
    '<div class="field-row"><div class="fl">Label</div><input class="txt small" data-x="key" maxlength="3" value="'+esc(r.key)+'"></div>'+
    '<div class="field-row"><div class="fl">Name</div><input class="txt" style="max-width:200px" data-x="name" aria-label="Day name" value="'+esc(r.name)+'"></div>'+
    '<div class="menu" style="margin-top:10px">'+
      variantsOf(r).map(function(v,vi){
        return '<button data-vx="'+vi+'">'+esc(variantLabel(r,vi)||"Exercises")+
          '<span class="h">'+plural(v.exercises.length,"exercise")+'</span></button>';
      }).join("")+
      '<button data-x="addvar">+ Add another week</button>'+
      (S.routines.length>1?'<button data-x="del" class="dang">Delete this day</button>':"")+
    '</div>'+
    '<button class="btn primary block" style="margin-top:6px" data-x="done">Done</button>',
    function(el){
      $('[data-x="key"]',el).oninput=function(){ r.key=this.value.toUpperCase(); save(); };
      $('[data-x="name"]',el).oninput=function(){ r.name=this.value; save(); };
      $$('[data-vx]',el).forEach(function(b){
        b.onclick=function(){ closeSheet(); variantMenu(ri,+b.dataset.vx); };
      });
      $('[data-x="addvar"]',el).onclick=function(){ closeSheet(); variantAddSheet(ri); };
      var d=$('[data-x="del"]',el);
      if(d) d.onclick=function(){
        confirmSheet("Delete "+r.name+"?","Past sessions stay in your history.","Delete",function(){
          var gone=S.routines.splice(ri,1)[0];
          save(); viewPlan();
          toastUndo("Deleted "+gone.name,function(){
            S.routines.splice(Math.min(ri,S.routines.length),0,gone);
            save(); if(TAB==="plan") viewPlan();
            toast(gone.name+" is back");
          });
        },true);
      };
      $('[data-x="done"]',el).onclick=function(){ closeSheet(); viewPlan(); };
    });
}

function planExMenu(ri,vi,ei){
  var r=S.routines[ri], list=planExOf(r,vi), ex=list[ei];
  if(!ex) return;
  var p=prescribe(ex.name,ex);
  sheet('<h3>'+esc(ex.name)+'</h3><div class="sub">In '+esc(r.name)+
      (variantsOf(r).length>1?' · '+esc(variantLabel(r,vi)):"")+
      (p.why?' · next time: '+esc(p.why.toLowerCase()):"")+'</div>'+
    '<div class="field-row"><div class="fl">Name</div>'+
      '<input class="txt" style="max-width:210px" data-x="name" aria-label="Exercise name" value="'+esc(ex.name)+'"></div>'+
    '<div class="field-row"><div class="fl">Sets</div>'+
      '<input class="txt small" inputmode="numeric" type="number" data-x="sets" value="'+ex.sets+'"></div>'+
    '<div class="field-row"><div class="fl">'+esc(rangeLabel(metricOf(ex)))+
      '<div class="fh">'+esc(modeHint(ex))+'</div></div>'+
      '<div class="row" style="gap:6px">'+
        '<input class="txt tiny-n" inputmode="numeric" type="number" data-x="low" aria-label="Rep range bottom" value="'+esc(ex.reps)+'">'+
        '<span class="muted tiny">to</span>'+
        '<input class="txt tiny-n" inputmode="numeric" type="number" data-x="top" aria-label="Rep range top" value="'+(ex.repTop||"")+'">'+
      '</div></div>'+
    /* One tap out of straight sets, because the fix was otherwise "know that
       the empty second box is a progression mode and type a number in it". */
    (num(ex.repTop)>num(ex.reps)?"":
      '<button class="btn sm block" style="margin:0 0 8px" data-x="userange">Climb reps to '+
        esc(num(ex.reps)+rangeWidth(ex.name,metricOf(ex)))+' first</button>')+
    '<div class="field-row"><div class="fl">Weight step<div class="fh">Blank uses the default ('+esc(S.settings.inc)+')</div></div>'+
      '<input class="txt small" inputmode="decimal" type="number" step="any" data-x="inc" aria-label="Weight step" value="'+(ex.inc||"")+'"></div>'+
    loadTypeRow(bwMode(ex),"pbw")+
    metricRow(metricOf(ex),"pmet")+
    barRow(ex,"pbar")+
    /* Top set + back-offs: one heavy set that decides the next weight, then
       lighter sets that are never judged. Plain loaded work only. */
    (bwMode(ex)===0&&metricOf(ex)===0?
      '<div class="field-row"><div class="fl">Top set + back-offs'+
        '<div class="fh">One top set, then back-offs about 12% lighter. Only the top set decides the next weight.</div></div>'+
        '<button class="switch'+(ex.scheme==="topback"?" on":"")+'" role="switch" aria-checked="'+(ex.scheme==="topback")+
          '" aria-label="Top set and back-offs" data-x="topback"></button></div>':"")+
    '<div class="field-row"><div class="fl">Stack weights'+
      '<div class="fh">Only for a machine whose weights aren\'t evenly spaced. The next weight up or down comes from this list.</div></div>'+
      '<input class="txt" style="max-width:150px" data-x="pins" inputmode="decimal" aria-label="Stack weights" placeholder="20, 27.5, 35" value="'+esc(cleanPins(ex.pins).join(", "))+'"></div>'+
    muscleRow(ex)+
    '<div class="menu" style="margin-top:10px">'+
      (ei>0?'<button data-x="link">'+(ex.link?"Break the superset":"Superset with the one above")+'</button>':"")+
      (ei>0?'<button data-x="up">Move up</button>':"")+
      (ei<list.length-1?'<button data-x="down">Move down</button>':"")+
      '<button data-x="hist">See history &amp; chart</button>'+
      '<button data-x="del" class="dang">Remove from '+esc(r.name)+'</button>'+
    '</div>'+
    '<button class="btn primary block" style="margin-top:6px" data-x="done">Done</button>',
    function(el){
      var nameEl=$('[data-x="name"]',el);
      $('[data-x="sets"]',el).oninput=function(){ ex.sets=Math.max(1,num(this.value)); save(); };
      $('[data-x="low"]',el).oninput=function(){ ex.reps=Math.max(1,num(this.value)); save(); };
      $('[data-x="top"]',el).oninput=function(){ ex.repTop=num(this.value)||0; save(); };
      $('[data-x="inc"]',el).oninput=function(){ ex.inc=num(this.value)||null; save(); };
      var ur=$('[data-x="userange"]',el);
      if(ur) ur.onclick=function(){
        /* Keep the bottom you already train at and add the reps-first room on
           top — moving the bottom would quietly change the programme. */
        ex.repTop=Math.max(1,num(ex.reps))+rangeWidth(ex.name,metricOf(ex));
        save(); closeSheet(); viewPlan(); planExMenu(ri,vi,ei);
        toast(ex.name+" now climbs to "+ex.repTop+" first");
      };
      $$('[data-pbw]',el).forEach(function(b){
        b.onclick=function(){ ex.bw=num(b.dataset.pbw); save(); closeSheet(); viewPlan(); planExMenu(ri,vi,ei); };
      });
      $('[data-pbar]',el).oninput=function(){ ex.bar=Math.max(0,num(this.value)); save(); };
      var tbs=$('[data-x="topback"]',el);
      if(tbs) tbs.onclick=function(){
        ex.scheme=ex.scheme==="topback"?"double":"topback"; save();
        closeSheet(); viewPlan(); planExMenu(ri,vi,ei);
      };
      /* Typed once per plan row; fewer than two numbers is no stack. The field
         is left as typed so a half-typed list isn't rewritten under the cursor. */
      $('[data-x="pins"]',el).oninput=function(){ ex.pins=cleanPins(this.value.split(/[,\s;]+/)); save(); };
      $('[data-x="pins"]',el).onchange=function(){ this.value=cleanPins(ex.pins).join(", "); };
      $$('[data-pmet]',el).forEach(function(b){
        b.onclick=function(){ ex.metric=num(b.dataset.pmet); save(); closeSheet(); viewPlan(); planExMenu(ri,vi,ei); };
      });
      $('[data-x="mg"]',el).onclick=function(){
        musclesSheet(ex,function(){ viewPlan(); planExMenu(ri,vi,ei); });
      };
      var plk=$('[data-x="link"]',el);
      if(plk) plk.onclick=function(){ ex.link=!ex.link; save(); closeSheet(); viewPlan(); };
      var up=$('[data-x="up"]',el), dn=$('[data-x="down"]',el);
      if(up) up.onclick=function(){ var t=list[ei-1]; list[ei-1]=ex; list[ei]=t;
        if(ei-1===0) ex.link=false; save(); closeSheet(); viewPlan(); };
      if(dn) dn.onclick=function(){ var t=list[ei+1]; list[ei+1]=ex; list[ei]=t; save(); closeSheet(); viewPlan(); };
      $('[data-x="hist"]',el).onclick=function(){ closeSheet(); liftSheet(ex.name); };
      $('[data-x="del"]',el).onclick=function(){
        var gone=list.splice(ei,1)[0];
        save(); closeSheet(); viewPlan();
        toastUndo("Removed "+gone.name,function(){
          if(S.routines.indexOf(r)<0) return;      // the whole day went too
          list.splice(Math.min(ei,list.length),0,gone);
          save(); if(TAB==="plan") viewPlan();
          toast(gone.name+" is back");
        });
      };
      $('[data-x="done"]',el).onclick=function(){
        var newName=nameEl.value.trim();
        closeSheet(); viewPlan();                    // see the note in the session menu
        if(newName&&newName!==ex.name) renameExercise(ex.name,newName);
      };
    });
}

/* ---- data in / out ---- */
function payload(){ return JSON.stringify(S,null,2); }
function backupName(){ return "ironlog-"+today()+".json"; }
function markBackedUp(){ S.settings.lastBackup=Date.now(); writeNow(); }

/* Android's share sheet refuses some file types outright, and which ones is not
   something to guess at. Offer the tidy name first, fall back to .txt — which
   every share target accepts — and let canShare() pick. The contents are the
   same JSON either way, and the importer takes both. */
function shareableFile(data){
  var opts=shareVariants(data);
  /* A mode proven to work on this device wins over the default order. */
  for(var i=0;i<opts.length;i++){
    if(opts[i].k===S.settings.shareMode&&opts[i].file) return opts[i].file;
  }
  for(i=0;i<opts.length;i++){
    if(opts[i].file&&opts[i].can) return opts[i].file;
  }
  return null;
}
var lastShareErr="";

/* ---- why sharing fails, answered on the device instead of guessed ----
   navigator.share() rejects with NotAllowedError in two unrelated cases: the
   call had no transient user activation, or Chrome refused the file's type.
   No permission prompt is involved in either, which is why "Permission denied"
   is such a misleading string. The fixes are opposite, so the app tries the
   variants one tap at a time and remembers which one worked. */
function shareVariants(data){
  function f(name,type){ try{ return new File([data],name,{type:type}); }catch(e){ return null; } }
  var base=backupName();
  var list=[
    {k:"txt",   label:"File as .txt",        file:f(base.replace(/\.json$/,".txt"),"text/plain")},
    {k:"json",  label:"File as .json",       file:f(base,"application/json")},
    {k:"titled",label:"File plus a title",   file:f(base,"application/json"), title:true},
    {k:"text",  label:"Plain text, no file", file:null, text:true}
  ];
  list.forEach(function(v){
    try{
      v.can = v.text ? !!navigator.share
            : !!(v.file&&navigator.canShare&&navigator.canShare({files:[v.file]}));
    }catch(e){ v.can=false; }
  });
  return list;
}
function sharePayload(v,data){
  if(v.text) return {title:"Iron Log backup",text:data.slice(0,1500)};
  return v.title ? {files:[v.file],title:"Iron Log backup"} : {files:[v.file]};
}
var shareResults={};
function shareTestSheet(){
  var data=payload();
  var vs=shareVariants(data);
  function draw(){
    var anyOk=Object.keys(shareResults).some(function(k){ return shareResults[k]==="worked"; });
    sheet('<h3>Why sharing fails</h3>'+
      '<div class="sub">Tap each one. The share sheet should open — back out of it and the result lands here. '+
      'If <b>every</b> line fails the same way, the problem is this browser blocking sharing outright, not the file type.</div>'+
      '<div class="card" style="padding:0;margin-bottom:12px">'+
        vs.map(function(v){
          var r=shareResults[v.k];
          return '<div class="field-row" style="padding:10px 12px;margin:0">'+
            '<div class="fl">'+esc(v.label)+
              '<div class="fh">'+(v.can?"allowed by canShare()":"canShare() says no")+'</div></div>'+
            (r?'<div class="num tiny" style="color:'+(r==="worked"?"var(--good)":"var(--bad)")+'">'+esc(r)+'</div>'
              :'<button class="btn sm ghost" data-try="'+v.k+'">Try</button>')+
          '</div>';
        }).join("")+
      '</div>'+
      (anyOk?'<div class="banner calm" style="margin-bottom:12px"><div class="bt">Found one that works</div>'+
        '<div class="bd">"Send a copy" will use it from now on.</div></div>':"")+
      '<button class="btn ghost block" data-x="close">Close</button>',
      function(el){
        $$("[data-try]",el).forEach(function(btn){
          btn.onclick=function(){
            var v=vs.filter(function(x){ return x.k===btn.dataset.try; })[0];
            var p;
            try{ p=navigator.share(sharePayload(v,data)); }
            catch(err){ shareResults[v.k]=(err&&err.name)||"threw"; draw(); return; }
            if(!p||!p.then){ shareResults[v.k]="no promise"; draw(); return; }
            p.then(function(){
              shareResults[v.k]="worked";
              if(!v.text){ S.settings.shareMode=v.k; writeNow(); lastShareErr=""; }
              draw();
            }).catch(function(err){
              /* Backing out of a sheet that opened still proves it opened. */
              shareResults[v.k]=(err&&err.name==="AbortError")?"worked":((err&&err.name)||"failed");
              if(shareResults[v.k]==="worked"&&!v.text){ S.settings.shareMode=v.k; writeNow(); lastShareErr=""; }
              draw();
            });
          };
        });
        $('[data-x="close"]',el).onclick=function(){ closeSheet(); render(); };
      });
  }
  draw();
}

/* One tap into whatever the phone can share to — Drive, Files, email, iCloud. */
function backupSheet(){
  var data=payload();
  var file=shareableFile(data);

  sheet('<h3>Back up your log</h3>'+
    '<div class="sub">'+plural(S.sessions.length,"session")+' · '+Math.round(data.length/1024)+' KB. '+
      'Send yourself a copy anywhere that syncs — Drive, Files, email. Importing it later restores everything exactly.</div>'+
    (lastShareErr?'<div class="banner warn" style="margin-bottom:10px"><div class="bt">Sharing failed last time</div>'+
      '<div class="bd">'+esc(lastShareErr)+' — "Save file" below always works. That error does not mean you '+
      'refused a prompt; there isn\'t one. It means the browser blocked the call.</div>'+
      '</div>':"")+
    (file&&!lastShareErr?'<button class="btn primary big block" data-x="share" style="margin-bottom:8px">Send a copy…</button>':
      file?'<button class="btn block" data-x="share" style="margin-bottom:8px">Try sharing again</button>':
      '<div class="tiny muted" style="margin-bottom:8px">This browser won\'t share files, so save one instead.</div>')+
    '<button class="btn '+(file&&!lastShareErr?"":"primary big ")+'block" data-x="dl">Save file to this device</button>'+
    '<button class="btn ghost block" style="margin-top:8px" data-x="copy">Copy as text</button>'+
    (file?'<button class="tiny muted block" style="width:100%;padding:10px 0" data-x="why">Sharing not working? Test it ›</button>':"")+
    (S.settings.lastBackup?'<div class="tiny muted" style="text-align:center;margin-top:12px">Last copy '+relDate(S.settings.lastBackup)+'</div>':""),
    function(el){
      var sh=$('[data-x="share"]',el);
      if(sh) sh.onclick=function(){
        /* Nothing async before share() — Chrome needs the tap's user
           activation still live when it is called. */
        var p, settled=false;
        /* No title unless a titled variant is what proved to work — a bare
           files payload is the most widely accepted shape. */
        var body=S.settings.shareMode==="titled"
          ? {files:[file],title:"Iron Log backup"} : {files:[file]};
        try{ p=navigator.share(body); }
        catch(err){ shareFailed(err,data); return; }
        if(!p||!p.then){ shareFailed(new Error("share() returned nothing"),data); return; }
        /* A share() that neither resolves nor rejects looks exactly like a dead
           button. If the sheet had opened it would have taken focus, so still
           being focused after three seconds means it never appeared. */
        var watchdog=setTimeout(function(){
          if(settled||document.hidden||!document.hasFocus()) return;
          settled=true;
          shareFailed(new Error("the share sheet never opened"),data);
        },3000);
        p.then(function(){
          if(settled) return;
          settled=true; clearTimeout(watchdog); lastShareErr="";
          markBackedUp(); closeSheet(); render(); toast("Copy sent");
        }).catch(function(err){
          if(settled) return;
          settled=true; clearTimeout(watchdog);
          shareFailed(err,data);
        });
      };
      var why=$('[data-x="why"]',el);
      if(why) why.onclick=function(){ shareTestSheet(); };
      $('[data-x="dl"]',el).onclick=function(){ downloadBackup(data); closeSheet(); render(); };
      $('[data-x="copy"]',el).onclick=function(){
        if(navigator.clipboard){
          navigator.clipboard.writeText(data).then(function(){ markBackedUp(); toast("Copied"); closeSheet(); render(); })
            .catch(function(){ doExport(); });
        } else doExport();
      };
    });
}
/* The old version swallowed every rejection as "user backed out", which made a
   genuinely broken share indistinguishable from a cancelled one — the reported
   symptom was a button that did nothing at all. Cancelling is silent; anything
   else says so and still leaves you holding a file. */
function shareFailed(err,data){
  var name=(err&&err.name)||"Error";
  if(name==="AbortError"){ return; }            // you closed the share sheet
  lastShareErr=name+(err&&err.message?": "+err.message:"");
  downloadBackup(data,true);        // one message, not two fighting
  closeSheet(); render();
  toast("Share didn't work — saved to your files instead");
}
function downloadBackup(data,quiet){
  try{
    var blob=new Blob([data],{type:"application/json"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");
    a.href=url; a.download=backupName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },2000);
    markBackedUp();
    if(!quiet) toast("Saved to your downloads");
  }catch(e){ toast("Couldn't save the file — try Copy as text"); }
}
function doExport(){
  var data=payload();
  downloadBackup(data);
  sheet('<h3>Export</h3><div class="sub">Saved as '+esc(backupName())+'. You can also copy the raw log and paste it somewhere safe.</div>'+
      '<textarea class="txt" style="min-height:120px;font-family:var(--mono);font-size:12px" readonly>'+esc(data)+'</textarea>'+
      '<div class="row" style="gap:8px;margin-top:10px">'+
      '<button class="btn ghost" style="flex:1" data-x="close">Close</button>'+
      '<button class="btn primary" style="flex:1" data-x="copy">Copy</button></div>',
    function(el){
      $('[data-x="close"]',el).onclick=function(){ closeSheet(); render(); };
      $('[data-x="copy"]',el).onclick=function(){
        var ta=$("textarea",el);
        ta.select(); ta.setSelectionRange(0,999999);
        if(navigator.clipboard) navigator.clipboard.writeText(data).then(function(){ toast("Copied"); });
        else { try{ document.execCommand("copy"); toast("Copied"); }catch(e){ toast("Select the text and copy"); } }
      };
    });
}
function doImport(){
  if(refuseMidWorkout()) return;
  sheet('<h3>Import</h3><div class="sub">Replaces everything currently in the app. Pick a file you backed up, or paste the JSON.</div>'+
    '<input type="file" accept="application/json,.json,text/plain,.txt" data-x="file" style="margin-bottom:12px">'+
    '<textarea class="txt" style="min-height:110px;font-family:var(--mono);font-size:12px" placeholder="…or paste here" data-x="paste"></textarea>'+
    '<div class="row" style="gap:8px;margin-top:10px">'+
    '<button class="btn ghost" style="flex:1" data-x="close">Cancel</button>'+
    '<button class="btn primary" style="flex:1" data-x="go">Import</button></div>',
    function(el){
      var pending=null;
      $('[data-x="file"]',el).onchange=function(){
        var f=this.files&&this.files[0]; if(!f) return;
        var fr=new FileReader();
        fr.onload=function(){ pending=String(fr.result); toast("File ready — tap Import"); };
        fr.readAsText(f);
      };
      $('[data-x="close"]',el).onclick=closeSheet;
      $('[data-x="go"]',el).onclick=function(){
        var raw=pending||$('[data-x="paste"]',el).value;
        if(!raw){ toast("Nothing to import"); return; }
        var parsed;
        try{ parsed=JSON.parse(raw); }catch(e){ toast("That isn't valid Iron Log JSON"); return; }
        if(!parsed||!parsed.routines||!parsed.sessions){ toast("That file is missing routines or sessions"); return; }
        if(refuseMidWorkout()) return;
        replaceLog(parsed);
        closeSheet(); go("today"); toast("Log imported");
      };
    });
}

/* The one way a whole log comes in, from a file or from GitHub. */
function replaceLog(parsed){
  S=normalize(parsed);
  recomputePRs();
  writeNow();
}

self.__ilf=(self.__ilf||0)+1;
