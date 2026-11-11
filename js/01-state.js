"use strict";

/* Host may not supply a viewport tag (e.g. embedded); make sure one exists. */
if(!document.querySelector('meta[name="viewport"]')){
  var mv=document.createElement("meta");
  mv.name="viewport"; mv.content="width=device-width, initial-scale=1, viewport-fit=cover";
  document.head.appendChild(mv);
}

/* ============================ storage ============================ */
var BUILD="v2.0-a4i";                      // bump with CACHE in sw.js; shown in Plan
var KEY="ironlog.v1", V5_KEY="ironlog.v1.v5-backup", storageOK=true;
try{ localStorage.setItem("__t","1"); localStorage.removeItem("__t"); }catch(e){ storageOK=false; }
var mem=null;

function defaultState(){
  return {
    version:6,
    settings:{unit:"lb",rest:120,autoRest:true,buzz:true,inc:5,
              sound:true, notify:false, rpe:false, keepTone:false,
              autoBackup:true, shareMode:"",
              doubleDefault:true,repLow:8,repHigh:12,rangeFixHidden:false,
              bodyweight:0, deloadUntil:0, deloadSnooze:0,
              bar:45, plates:defaultPlates("lb"),
              targetFreq:null, excludedMuscles:[], blockRotations:6,
              lastBackup:0},
    routines:[
      newRoutine("A","Day A"),
      newRoutine("B","Day B"),
      newRoutine("C","Day C")
    ],
    sessions:[],
    active:null,
    block:{num:1, startSessId:null, startTs:0, rotation:0, history:[]},
    coach:{proposals:[], history:[], lastCheck:0}
  };
}
/* A training day holds one or more week variants. A single-variant day is the
   old behaviour exactly, which is what makes the migration a one-liner. */
function newRoutine(key,name){
  return {id:uid(), key:key, name:name, optional:false, variants:[newVariant("")]};
}
function newVariant(label,exercises){
  return {id:uid(), label:label||"", exercises:exercises||[]};
}

/* Every state that comes in from anywhere — storage, a backup file, a paste —
   goes through here, so an old export lands as a valid v5 state rather than
   half-migrating and crashing on the first read of r.variants. */
var MIGRATED=false, V5_FAIL=false;
function normalize(s){
  var from=num(s.version);
  if(from<6) MIGRATED=true;
  var rawSettings=(s.settings&&typeof s.settings==="object")?s.settings:{};   // before the assign below fills defaults
  s.settings=Object.assign(defaultState().settings,s.settings||{});
  if(!Array.isArray(s.settings.plates)||!s.settings.plates.length)
    s.settings.plates=defaultPlates(s.settings.unit);
  /* This is documented as the only door into the state, so it has to check the
     whole shape and not just the parts that have needed migrating. A state
     whose `sessions` key is missing — a truncated backup, a half-finished
     write — used to render a blank page and stay blank on every reload, with
     nothing but "clear your storage" to do about it. */
  if(!Array.isArray(s.sessions)){ s.sessions=[]; MIGRATED=true; }
  if(!Array.isArray(s.routines)){ s.routines=[]; MIGRATED=true; }
  s.sessions.forEach(function(x){
    if(!Array.isArray(x.exercises)){ x.exercises=[]; MIGRATED=true; }
    x.exercises.forEach(function(e){ if(!Array.isArray(e.sets)){ e.sets=[]; MIGRATED=true; } });
  });
  if(s.active&&!Array.isArray(s.active.exercises)){ s.active=null; MIGRATED=true; }
  (s.routines||[]).forEach(function(r){
    if(!Array.isArray(r.variants)||!r.variants.length)
      r.variants=[newVariant("",Array.isArray(r.exercises)?r.exercises:[])];
    /* One home for the list. Leaving r.exercises behind would let the two
       drift, and every read would have to guess which one is current. */
    delete r.exercises;
    r.variants.forEach(function(v){
      if(!v.id) v.id=uid();
      if(!Array.isArray(v.exercises)) v.exercises=[];
      if(typeof v.label!=="string") v.label="";
    });
  });
  s.coach=coachShape(s.coach);      // the coach's cards; absent in any log older than v26

  /* ---- v6 (2.0). Every step is idempotent and runs on every call, not only
     when version<6: an older tab can write a v5-shaped log back over a v6 one
     (it keeps the fields it doesn't know and sets version:5), and the next
     load has to converge on the same state. Sets are never touched. ---- */
  var st=s.settings;
  if(!Array.isArray(rawSettings.excludedMuscles)) st.excludedMuscles=from<6?["calves"]:[];
  st.excludedMuscles=uniqList(st.excludedMuscles.filter(function(k){ return k!=="delts"&&isMuscle(k); }));
  st.blockRotations=num(st.blockRotations)>=1?Math.round(num(st.blockRotations)):6;
  if(st.targetFreq!==null&&st.targetFreq!==undefined&&num(st.targetFreq)>=1&&num(st.targetFreq)<=7)
    st.targetFreq=Math.round(num(st.targetFreq)*2)/2;                    // steps of 0.5
  else st.targetFreq=null;
  var days=s.routines.slice();
  if(s.planBackup&&Array.isArray(s.planBackup.routines)) days=days.concat(s.planBackup.routines);
  days.forEach(function(r){
    if(!r||typeof r!=="object") return;
    if(typeof r.optional!=="boolean") r.optional=false;
    var lists=[];
    if(Array.isArray(r.variants)) r.variants.forEach(function(v){ if(v&&Array.isArray(v.exercises)) lists.push(v.exercises); });
    if(Array.isArray(r.exercises)) lists.push(r.exercises);     // a backed-up day from before variants
    lists.forEach(function(l){ l.forEach(function(e){ if(e&&typeof e==="object") migratePlanRow(e); }); });
  });
  /* History and the live session: only the muscle tags change. */
  s.sessions.forEach(function(x){ x.exercises.forEach(retagDelts); });
  if(s.active) s.active.exercises.forEach(retagDelts);
  if(!s.block||typeof s.block!=="object"){
    var a=s.sessions[0];                                       // newest
    s.block={num:1, startSessId:a?a.id:null, startTs:a?num(a.ts):0, rotation:0, history:[]};
  } else {
    s.block.num=Math.max(1,Math.round(num(s.block.num))||1);
    if(typeof s.block.startSessId!=="string") s.block.startSessId=null;
    s.block.startTs=num(s.block.startTs)||0;
    s.block.rotation=num(s.block.rotation)||0;
    if(!Array.isArray(s.block.history)) s.block.history=[];
  }
  if(s.block.history.length>40) s.block.history=s.block.history.slice(-40);   // newest last
  s.version=6;
  return s;
}
function uniqList(a){ return a.filter(function(k,i){ return a.indexOf(k)===i; }); }
function migratePlanRow(e){
  if(e.scheme!=="double"&&e.scheme!=="topback") e.scheme="double";
  if(!(num(e.backPct)>0&&num(e.backPct)<0.5)) e.backPct=0.12;
  e.pins=cleanPins(e.pins);
  retagDelts(e);
}
/* A stack of fewer than two pins is not a stack. */
function cleanPins(p){
  var a=(Array.isArray(p)?p:[]).map(function(x){ return round(num(x),2); }).filter(function(x){ return x>0; });
  a=uniqList(a).sort(function(x,y){ return x-y; });
  return a.length<2?[]:a;
}
/* "delts" became three heads in schema v6. A set that credited the delts family
   1.0 (mg) or 0.5 (mg2) before still credits exactly that, now to one head, so
   no muscle total is built from anything different. A helper never lands on a
   head the exercise already credits, and is never dropped. Idempotent: once no
   "delts" remains it returns at once. */
var DELT_HEADS=["front_delts","side_delts","rear_delts"];
/* Rear-delt tokens only. A bare /reverse/ or /face/ would also catch "Reverse
   Curl" and "Face-down ..." rows, which are not rear delts. */
var REAR_TOKEN=/rear\s*delt|face\s*pull|facepull|reverse\s*(fly|flye|pec)|rear\s*fly/i;
function deltFallback(name,role){
  var n=String(name||"");
  if(REAR_TOKEN.test(n)) return "rear_delts";
  if(/front/i.test(n)) return "front_delts";
  if(/press|arnold|ohp|military|push|dip|fly|pec/i.test(n)) return "front_delts";
  return role==="main"?"side_delts":"front_delts";
}
function retagDelts(ex){
  var hasMg=ex.mg==="delts";
  var i2=Array.isArray(ex.mg2)?ex.mg2.indexOf("delts"):-1;
  if(!hasMg&&i2<0) return;
  var g=guessMuscles(ex.name);
  var name=String(ex.name||"");
  if(hasMg){
    if(DELT_HEADS.indexOf(g.mg)>=0) ex.mg=g.mg;
    /* Guessed as a known non-delt muscle ("Reverse Curl" -> biceps): the row was
       explicitly tagged delts, so it keeps a delt head, and front is the neutral one. */
    else if(g.mg&&!REAR_TOKEN.test(name)) ex.mg="front_delts";
    else ex.mg=deltFallback(name,"main");
  }
  while(i2>=0){
    var want=g.mg2.filter(function(k){ return DELT_HEADS.indexOf(k)>=0; })[0]||deltFallback(name,"helper");
    var order=[want].concat(DELT_HEADS.filter(function(h){ return h!==want; })), pick=null;
    for(var j=0;j<order.length&&!pick;j++)
      if(order[j]!==ex.mg&&ex.mg2.indexOf(order[j])<0) pick=order[j];
    ex.mg2[i2]=pick||want;                    // all three heads taken: double up rather than lose the credit
    i2=ex.mg2.indexOf("delts");
  }
  /* Last, on every delt row: no duplicates, and nothing that repeats the main head. */
  if(Array.isArray(ex.mg2)) ex.mg2=uniqList(ex.mg2).filter(function(k){ return k!==ex.mg; });
}
function load(){
  if(!storageOK) return mem||(mem=defaultState());
  try{
    var raw=localStorage.getItem(KEY);
    if(!raw) return defaultState();
    var s=JSON.parse(raw);
    if(!s||typeof s!=="object") return defaultState();
    /* The raw v5 text, kept once before the first v6 load rewrites anything. Never
       overwritten, and never written by an import (replaceLog). */
    if(num(s.version)<6&&!localStorage.getItem(V5_KEY)){
      try{ localStorage.setItem(V5_KEY,raw); }catch(e){ V5_FAIL=true; }
    }
    /* Nothing recognisable at all — take the stock split. But a log with a
       damaged `routines` key is still a log, and handing back defaultState()
       there would silently discard every session in it. */
    if(!s.routines&&!Array.isArray(s.sessions)) return defaultState();
    return normalize(s);
  }catch(e){ return defaultState(); }
}
var saveTimer=null;
/* STALE: another window saved this log after this one last read it, and this
   window can't take the new copy without losing something (see otherWrote()).
   Nothing more is written from here until the user reloads. mineJSON is the
   log as this window last wrote or read it, so "unsaved edits" is a compare. */
var STALE=false, mineJSON=null;
function writeNow(){
  clearTimeout(saveTimer); saveTimer=null;
  if(STALE){ staleVeil(); return; }   // writing now would put a stale log over a newer one
  var out=JSON.stringify(S);
  try{ localStorage.setItem(KEY,out); mineJSON=out; }
  catch(e){ toast("Couldn't save — storage is full"); }
  gistChanged();                      // GitHub backup, debounced; see below
}
function save(){
  if(!storageOK){ mem=S; gistChanged(); return; }
  clearTimeout(saveTimer);
  saveTimer=setTimeout(writeNow,120);
}
/* Never let a pending write die with the tab. */
function flush(){ if(storageOK&&saveTimer) writeNow(); }

function uid(){ return Math.random().toString(36).slice(2,10); }

/* ---- a second window ----
   The installed app and a browser tab share this log. Each used to write its
   own in-memory copy wholesale, so a tab opened before a workout was saved
   elsewhere put the old log back with its next change of any kind. Now a write
   from another window is taken in at once: S is reloaded through load() and
   normalize(), and the screen is redrawn.
   Except mid-workout. Re-rendering on the set-logging path is trap 1, and a
   session with edits this window hasn't saved can't be merged with someone
   else's. Then a blocking veil asks for a reload, and writeNow() refuses until
   it is given, so the stale copy can never land. */
function otherWrote(){
  if(STALE||typeof S==="undefined") return;   // already waiting for the reload, or the page is still loading (it reads storage when it boots)
  var unsaved=JSON.stringify(S)!==mineJSON;
  var logging=TAB==="today"&&!document.hidden;   // the session screen is in front of someone
  if(S.active&&(unsaved||logging)){
    STALE=true; clearTimeout(saveTimer); saveTimer=null;
    staleVeil();
    return;
  }
  reloadLog();
}
function reloadLog(){
  STALE=false;
  S=load(); mineJSON=JSON.stringify(S);
  var veil=document.querySelector(".stale-veil"); if(veil) veil.remove();
  if(!S.active) stopRest();
  closeSheet(); render();
}
function staleVeil(){
  if(document.querySelector(".stale-veil")) return;
  var d=document.createElement("div");
  d.className="stale-veil";
  d.innerHTML='<div class="banner calm" role="alertdialog" aria-labelledby="stale-t">'+
    '<div class="bt" id="stale-t">This log changed in another window — reload</div>'+
    '<div class="bd">It was saved in another tab or in the installed app. Nothing more is saved from this window until you reload it, '+
      'so the newer log can\'t be overwritten. Anything entered here since that save is not kept.</div>'+
    '<div class="acts"><button class="btn primary" data-act="stale-reload">Reload</button></div></div>';
  d.querySelector('[data-act="stale-reload"]').onclick=reloadLog;
  document.body.appendChild(d);
}

self.__ilf=(self.__ilf||0)+1;
