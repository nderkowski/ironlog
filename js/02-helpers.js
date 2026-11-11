"use strict";
/* ============================ helpers ============================ */
function $(sel,root){ return (root||document).querySelector(sel); }
function $$(sel,root){ return [].slice.call((root||document).querySelectorAll(sel)); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function num(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
function round(n,d){ var p=Math.pow(10,d||0); return Math.round(n*p)/p; }
function fmt(n){ n=round(n,1); return (n%1===0)?String(n):n.toFixed(1); }
function commas(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,","); }
function today(){ return localDay(Date.now()); }
function localDay(ts){
  var d=new Date(ts);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function shortDate(ts){
  var d=new Date(ts), n=new Date();
  var same=d.getFullYear()===n.getFullYear();
  return d.toLocaleDateString(undefined,same?{month:"short",day:"numeric"}:{month:"short",day:"numeric",year:"2-digit"});
}
/* Calendar days, not 24-hour blocks: 23:00 last night read at 08:00 is
   "yesterday", not "today" (sprint review; the Today row uses the same rule). */
function calDaysAgo(ts){
  var a=new Date(), b=new Date(ts);
  return Math.round((new Date(a.getFullYear(),a.getMonth(),a.getDate())-new Date(b.getFullYear(),b.getMonth(),b.getDate()))/864e5);
}
function relDate(ts){
  var days=calDaysAgo(ts);
  if(days<=0) return "today";
  if(days===1) return "yesterday";
  if(days<14) return days+"d ago";
  return shortDate(ts);
}
function dur(ms){
  var s=Math.max(0,Math.round(ms/1000)), m=Math.floor(s/60);
  if(m<60) return m+"m";
  return Math.floor(m/60)+"h "+(m%60)+"m";
}
function mmss(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); }
function e1rm(w,r){ if(!w||!r) return 0; return r===1?w:w*(1+r/30); }
function unit(){ return S.settings.unit; }
function buzz(ms){ if(S.settings.buzz&&navigator.vibrate){ try{navigator.vibrate(ms);}catch(e){} } }
function plural(n,word){ return n+" "+word+(n===1?"":"s"); }

var toastTimer=null;
function toast(msg){
  var old=$(".toast"); if(old) old.remove();
  var t=document.createElement("div");
  t.className="toast"; t.textContent=msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ t.remove(); },2200);
}

/* Destructive actions get a window to take it back rather than a confirm
   dialog in front of every one of them. The caller keeps the removed object
   alive in the closure; nothing is re-derived from the DOM. */
function toastUndo(msg,fn){
  var old=$(".toast"); if(old) old.remove();
  var t=document.createElement("div");
  t.className="toast act";
  var label=document.createElement("span");
  label.textContent=msg;
  var b=document.createElement("button");
  b.type="button"; b.textContent="Undo";
  b.onclick=function(){ clearTimeout(toastTimer); t.remove(); fn(); };
  t.appendChild(label); t.appendChild(b);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ t.remove(); },10000);
}

var ICON={
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>',
  prog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5.5-6 4 3.5L21 6"/><path d="M21 11V6h-5"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18.5" cy="6" r="1.6"/><circle cx="14.5" cy="18" r="1.6"/></svg>',
  /* A cog, not a sunburst: short rays around a circle read as a brightness
     control, which is what the first attempt looked like. */
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z"/></svg>'
};

/* ============================ load model ============================
   BW modes: 0 = weighted (the number is the weight on the bar)
             1 = bodyweight (the number is weight ADDED to you)
             2 = assisted   (the number is assistance SUBTRACTED)
   Every logged set stores the resolved `load` so history stays true even
   after your bodyweight setting changes.
   =================================================================== */
function bwMode(ex){ return num(ex&&ex.bw)||0; }
function effLoad(w,mode,bodyweight){
  var bw=bodyweight===undefined?num(S.settings.bodyweight):num(bodyweight);
  if(mode===1) return bw+num(w);
  if(mode===2) return Math.max(0,bw-num(w));
  return num(w);
}
function loadOf(s){ return (s&&s.load!==undefined&&s.load!==null)?num(s.load):num(s&&s.w); }
function working(sets){ return (sets||[]).filter(function(s){ return !s.warm; }); }
/* How a set reads on screen: 185, BW, BW+25, −40 */
function entryText(s,mode){
  var w=num(s.w);
  if(mode===1) return w?("BW+"+fmt(w)):"BW";
  if(mode===2) return w?("−"+fmt(w)):"BW";
  return fmt(w);
}
function loadLabel(mode){
  if(mode===1) return "added "+unit();
  if(mode===2) return "assist "+unit();
  return unit();
}

/* ============================ history queries ============================ */
function normName(n){ return String(n||"").trim().toLowerCase(); }

/* Completed working sets for an exercise, grouped by session, newest first. */
function exSessions(name){
  var k=normName(name), out=[];
  for(var i=0;i<S.sessions.length;i++){
    var s=S.sessions[i];
    for(var j=0;j<s.exercises.length;j++){
      var e=s.exercises[j];
      if(normName(e.name)!==k) continue;
      var sets=working(e.sets).filter(function(x){ return x.done!==false&&num(x.r)>0; });
      if(sets.length) out.push({ts:s.ts,sets:sets,sessionId:s.id,deload:!!s.deload,bw:bwMode(e),metric:metricOf(e),
                                kind:e.kind||"", lo:num(e.reps), top:num(e.repTop),
                                tgt:(e.shadow&&e.shadow.used)?num(e.shadow.r):num(e.targetReps)});
    }
  }
  return out;
}
/* Same, minus anything logged during a deliberate deload — those must never
   read as a decline, or the app would chase its own tail. */
function exWorking(name){ return exSessions(name).filter(function(x){ return !x.deload; }); }
function lastPerf(name){ var h=exWorking(name); return h.length?h[0]:null; }
/* Most recent session's raw sets, warm-ups included, for prefill. */
function lastRawSets(name){
  var k=normName(name);
  for(var i=0;i<S.sessions.length;i++){
    var s=S.sessions[i];
    for(var j=0;j<s.exercises.length;j++){
      if(normName(s.exercises[j].name)===k&&s.exercises[j].sets.length) return s.exercises[j].sets;
    }
  }
  return null;
}
self.__ilf=(self.__ilf||0)+1;
