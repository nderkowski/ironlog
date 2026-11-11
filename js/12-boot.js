"use strict";
/* Integrity gate (2.0-a1). Each of the eleven files before this one ends by
   counting itself in __ilf. If one failed to load or to run, nothing below may
   run: load() and the first render would work on a half-built app, and a
   half-built app must never write the log. Throwing here ends this script
   before S exists. The screen is the inline script at the end of index.html,
   which runs whether or not any js file did. This file counts itself below, so
   that script can also tell that this one never ran at all. */
if((self.__ilf||0)!==11) throw new Error("Iron Log: not all app files ran ("+(self.__ilf||0)+" of 11 before boot)");
self.__ilf=(self.__ilf||0)+1;
var S=load();
mineJSON=JSON.stringify(S);
/* The listeners that read S, moved here from 01-state.js and 05-shell.js (2.0-a1).
   Across files they used to be registered before S existed, so a storage or
   visibility event between two slow script loads threw "S is not defined". */
window.addEventListener("pagehide",flush);
window.addEventListener("blur",flush);
document.addEventListener("visibilitychange",function(){ if(document.hidden) flush(); });
window.addEventListener("storage",function(e){
  if(e.storageArea&&e.storageArea!==window.localStorage) return;
  if(e.key!==KEY&&e.key!==null) return;          // null: the whole store was cleared
  otherWrote();
});
setInterval(function(){
  if(rest.endsAt){
    diagTick();
    var left=(rest.endsAt-Date.now())/1000;
    if(left<=0&&!buzzed){
      buzzed=true;
      /* Late by more than a few seconds means the phone paused us. Record it:
         with the keep-alive tone off, a silently-missed alarm is the expected
         failure and the user deserves to be told rather than left guessing. */
      if(left<-4) restLate=-left;
      /* If the page was frozen and thawed minutes later, don't shout at
         someone who is already looking at the screen. */
      if(left>-90) restDone(); else audioStop();
    }
    renderHeader();
  } else if(S.active){ renderHeader(); }
},1000);
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ if(diag) diag.hid=Date.now(); return; }
  if(diag&&diag.hid){ diag.hidden=(diag.hidden||0)+(Date.now()-diag.hid)/1000; diag.hid=0; }
  clearRestNote();
  if(rest.endsAt||S.active) renderHeader();
  if(restLate>4&&!S.settings.keepTone){
    var by=Math.round(restLate); restLate=0;
    toastUndo("Alarm was "+by+"s late — phone paused the app",function(){
      S.settings.keepTone=true; writeNow();
      toast("Keep-alive tone on. It will mute your music during rests.");
    });
    var t=$(".toast.act button"); if(t) t.textContent="Fix it";
  } else restLate=0;
});
/* ============================ render ============================ */
function render(){
  renderTabs(); renderHeader();
  if(TAB==="today"){ viewToday(); refreshSummary(); }
  else if(TAB==="progress") viewProgress();
  else if(TAB==="settings") viewSettings();
  else viewPlan();
}

if(window.matchMedia){
  var mq=window.matchMedia("(prefers-color-scheme: dark)");
  if(mq.addEventListener) mq.addEventListener("change",render);
}
new MutationObserver(function(muts){
  for(var i=0;i<muts.length;i++) if(muts[i].attributeName==="data-theme"){ render(); return; }
}).observe(document.documentElement,{attributes:true});

if(S.active) TAB="today";
/* Persist the variant migration once, so there is a single shape on disk and
   the next backup file is already v5 rather than something the importer has to
   migrate again. Deferred to here rather than done inside load(), because
   writeNow() can toast and the DOM has to exist first. */
if(MIGRATED) writeNow();
render();

askPersist();
/* Anything that failed to reach GitHub is retried when the network returns,
   and once on each load. */
window.addEventListener("online",function(){ if(gistLoad().dirty) gistBackupNow(); });
/* Leaving the app is the last chance before the debounce would have fired —
   a plan edit followed by locking the phone shouldn't wait for the next
   launch. Best effort: the browser may suspend the request. */
document.addEventListener("visibilitychange",function(){
  if(document.hidden&&gistLoad().token&&gistLoad().dirty) gistBackupNow();
});
if(gistLoad().token&&gistLoad().dirty) setTimeout(gistBackupNow,2000);

/* Offline support, only when self-hosted (the manifest is the tell). */
if("serviceWorker" in navigator && $('link[rel="manifest"]') &&
   (location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){
  window.addEventListener("load",function(){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  });
}

