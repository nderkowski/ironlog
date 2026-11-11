"use strict";
/* ============================ updates ============================
   How a new version reaches the phone. A new service worker installs in the
   background and WAITS (sw.js has no skipWaiting on install); it is allowed to
   take over, and the page to reload once into it, only at the moment the app
   is opened: a page load, or coming back to the foreground. And then only if
   no workout is active, nothing is open on screen and nothing has been touched
   since opening. At any other moment this script does nothing, so an update can
   never land while a set is being logged, a plan is being edited or a saved
   workout is being read.
   "Nothing is open" is checked on the page itself (idle() below), every time,
   and does not rest on `touched`, which a return to the foreground resets: no
   sheet or backdrop in the DOM (the session editor, whose draft lives only in
   its sheet, is one), no stale-log veil, no text field focused. `touched` is set
   by any tap or key, so a save made in this visible period (which needs one)
   also rules a reload out.
   A worker that is not ready when the app opens (it finishes installing after
   the window, or while something is open) just stays waiting in the
   registration, and the next open finds it there. A switch that happens when a
   reload is not allowed is remembered (`stale`) and the reload is taken at the
   next open; the next navigation would load the new version anyway.
   Opens are: a page load, visibilitychange to visible, and pageshow from the
   back/forward cache (a restored page runs no script of its own). */
(function(){
  if(!("serviceWorker" in navigator)) return;
  var sw=navigator.serviceWorker;
  var WINDOW=5000;                    // ms after opening during which an update may be taken
  var openedAt=0, touched=false, askedAt=0, stale=false, reloaded=false, watched=null;
  var hadController=!!sw.controller;

  /* True only if nothing the user is in the middle of would be lost. Unknown
     (S not defined, the DOM unreadable) counts as busy. */
  function idle(){
    try{
      if(!S||S.active) return false;
      if(document.querySelector(".backdrop,.stale-veil")) return false;
      var a=document.activeElement;
      if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
      return true;
    }catch(e){ return false; }
  }
  function justOpened(){ return !touched && !document.hidden && Date.now()-openedAt<WINDOW; }
  ["pointerdown","touchstart","keydown","input","click"].forEach(function(t){
    document.addEventListener(t,function(){ touched=true; },true);
  });

  /* A worker is waiting and this is the moment: ask it to take over. */
  function take(reg){
    if((askedAt&&Date.now()-askedAt<15000)||!reg.waiting||!justOpened()||!idle()) return;
    askedAt=Date.now();
    reg.waiting.postMessage({type:"skip-waiting"});
  }
  /* A worker that finishes installing a moment after the app opened. */
  function watch(reg){
    if(watched===reg) return;
    watched=reg;
    reg.addEventListener("updatefound",function(){
      var w=reg.installing;
      if(!w) return;
      w.addEventListener("statechange",function(){ if(w.state==="installed") take(reg); });
    });
  }
  function begin(){
    openedAt=Date.now(); touched=false;
    sw.getRegistration().then(function(reg){
      if(!reg) return;
      watch(reg);
      if(stale&&!reloaded&&justOpened()&&idle()){ reloaded=true; location.reload(); return; }
      take(reg);
      reg.update().catch(function(){});
    }).catch(function(){});
  }

  sw.addEventListener("controllerchange",function(){
    /* The first worker ever claiming an uncontrolled page is an install, not
       an update; there is nothing to reload into. */
    if(!hadController){ hadController=true; return; }
    if(reloaded) return;
    if(askedAt&&Date.now()-askedAt<15000&&!touched&&!document.hidden&&idle()){
      reloaded=true; location.reload(); return;
    }
    stale=true;
  });
  document.addEventListener("visibilitychange",function(){ if(!document.hidden) begin(); });
  window.addEventListener("pageshow",function(e){ if(e.persisted&&!document.hidden) begin(); });
  begin();
})();
