"use strict";

/* Host may not supply a viewport tag (e.g. embedded); make sure one exists. */
if(!document.querySelector('meta[name="viewport"]')){
  var mv=document.createElement("meta");
  mv.name="viewport"; mv.content="width=device-width, initial-scale=1, viewport-fit=cover";
  document.head.appendChild(mv);
}

/* ============================ storage ============================ */
var BUILD="v2.0-a1";                      // bump with BUILD in sw.js; shown in Plan
var KEY="ironlog.v1", storageOK=true;
try{ localStorage.setItem("__t","1"); localStorage.removeItem("__t"); }catch(e){ storageOK=false; }
var mem=null;

function defaultState(){
  return {
    version:5,
    settings:{unit:"lb",rest:120,autoRest:true,buzz:true,inc:5,
              sound:true, notify:false, rpe:false, keepTone:false,
              autoBackup:true, shareMode:"",
              doubleDefault:true,repLow:8,repHigh:12,rangeFixHidden:false,
              bodyweight:0, deloadUntil:0, deloadSnooze:0, repOutDefault:false,
              bar:45, plates:defaultPlates("lb"),
              lastBackup:0},
    routines:[
      newRoutine("A","Day A"),
      newRoutine("B","Day B"),
      newRoutine("C","Day C")
    ],
    sessions:[],
    active:null,
    coach:{proposals:[], history:[], lastCheck:0}
  };
}
/* A training day holds one or more week variants. A single-variant day is the
   old behaviour exactly, which is what makes the migration a one-liner. */
function newRoutine(key,name){
  return {id:uid(), key:key, name:name, variants:[newVariant("")]};
}
function newVariant(label,exercises){
  return {id:uid(), label:label||"", exercises:exercises||[]};
}

/* Every state that comes in from anywhere — storage, a backup file, a paste —
   goes through here, so an old export lands as a valid v5 state rather than
   half-migrating and crashing on the first read of r.variants. */
var MIGRATED=false;
function normalize(s){
  if(num(s.version)<5) MIGRATED=true;
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
  s.version=5;
  return s;
}
function load(){
  if(!storageOK) return mem||(mem=defaultState());
  try{
    var raw=localStorage.getItem(KEY);
    if(!raw) return defaultState();
    var s=JSON.parse(raw);
    if(!s||typeof s!=="object") return defaultState();
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
  if(STALE) return;                              // already waiting for the reload
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
