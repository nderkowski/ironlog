"use strict";
/* ============================ sparkline ============================ */
function spark(canvas,values,opts){
  opts=opts||{};
  var cs=getComputedStyle(document.documentElement);
  var accent=cs.getPropertyValue("--accent").trim()||"#C98A0E";
  var line=cs.getPropertyValue("--line").trim()||"#ccc";
  var dpr=window.devicePixelRatio||1;
  var w=canvas.clientWidth||78, h=canvas.clientHeight||32;
  canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
  var c=canvas.getContext("2d");
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,w,h);
  if(!values||values.length<2){ c.fillStyle=line; c.fillRect(0,h-1.5,w,1.5); return; }
  var pad=opts.pad||3;
  var mn=Math.min.apply(null,values), mx=Math.max.apply(null,values);
  if(mx-mn<1e-6){ mn-=1; mx+=1; }
  var X=function(i){ return pad+(w-pad*2)*(i/(values.length-1)); };
  var Y=function(v){ return h-pad-(h-pad*2)*((v-mn)/(mx-mn)); };
  if(opts.grid){
    c.strokeStyle=line; c.lineWidth=1; c.globalAlpha=.7;
    for(var g=0;g<=2;g++){
      var y=pad+(h-pad*2)*(g/2)+.5;
      c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke();
    }
    c.globalAlpha=1;
  }
  c.beginPath(); c.moveTo(X(0),Y(values[0]));
  for(var i=1;i<values.length;i++) c.lineTo(X(i),Y(values[i]));
  var grad=c.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,hexA(accent,.24)); grad.addColorStop(1,hexA(accent,0));
  c.lineTo(X(values.length-1),h); c.lineTo(X(0),h); c.closePath();
  c.fillStyle=grad; c.fill();
  c.beginPath(); c.moveTo(X(0),Y(values[0]));
  for(var j=1;j<values.length;j++) c.lineTo(X(j),Y(values[j]));
  c.strokeStyle=accent; c.lineWidth=opts.lw||1.8; c.lineJoin="round"; c.lineCap="round"; c.stroke();
  c.beginPath(); c.arc(X(values.length-1),Y(values[values.length-1]),opts.dot||2.6,0,Math.PI*2);
  c.fillStyle=accent; c.fill();
}
function hexA(hex,a){
  hex=hex.replace("#","");
  if(hex.length===3) hex=hex.split("").map(function(x){return x+x;}).join("");
  var n=parseInt(hex,16);
  return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
}

/* ============================ rest timer ============================
   The countdown was always wall-clock correct, but the alert never arrived:
   a backgrounded page gets its timers throttled to nothing and vibration is
   ignored outright, so with the phone in a pocket the timer silently did
   nothing. Android Chrome will not freeze a page that is *playing audio*, so
   a rest keeps a near-silent loop running purely to stay alive, and swaps
   that same already-unlocked element to an audible tone at zero.

   Two WAVs are synthesised rather than embedded: keeps the one-file rule and
   costs a few hundred bytes of code instead of a few KB of base64.
   ==================================================================== */
var AU_RATE=8000;
function wavURL(rate,data){
  var n=data.length, buf=new ArrayBuffer(44+n*2), v=new DataView(buf), i;
  function tag(o,s){ for(var j=0;j<s.length;j++) v.setUint8(o+j,s.charCodeAt(j)); }
  tag(0,"RIFF"); v.setUint32(4,36+n*2,true); tag(8,"WAVEfmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,rate,true); v.setUint32(28,rate*2,true);
  v.setUint16(32,2,true); v.setUint16(34,16,true);
  tag(36,"data"); v.setUint32(40,n*2,true);
  for(i=0;i<n;i++) v.setInt16(44+i*2,Math.max(-1,Math.min(1,data[i]))*32767,true);
  return URL.createObjectURL(new Blob([buf],{type:"audio/wav"}));
}
var AU=null;
function audioURLs(){
  if(AU) return AU;
  var i,n=AU_RATE,quiet=new Float32Array(n);
  /* The keep-alive has to be INAUDIBLE TO YOU but AUDIBLE TO CHROME, and those
     are different tests. Chrome decides whether a tab is "playing audio" — and
     therefore whether it may be frozen — from actual signal power. The first
     version of this used ±1/32767 dither, about -90 dBFS, which Chrome scores
     as silence: the tab froze anyway and the alarm never fired.
     A 30 Hz tone at -24 dBFS has real power, but no phone speaker reproduces
     30 Hz, so nothing comes out. On headphones it may be a faint rumble; that
     is the deliberate trade for an alarm that actually arrives. */
  for(i=0;i<n;i++) quiet[i]=Math.sin(2*Math.PI*30*i/n)*0.06;
  var beeps=3,on=.18,off=.14,tot=Math.round(n*beeps*(on+off)),alarm=new Float32Array(tot);
  for(var b=0;b<beeps;b++){
    var st=Math.round(b*(on+off)*n), len=Math.round(on*n);
    for(i=0;i<len;i++){
      var env=Math.min(1,i/(n*.008),(len-i)/(n*.02));   // no clicks at the edges
      alarm[st+i]=Math.sin(2*Math.PI*880*i/n)*.9*env;
    }
  }
  AU={quiet:wavURL(AU_RATE,quiet),alarm:wavURL(AU_RATE,alarm)};
  return AU;
}
var restAudio=null;
function audioEl(){
  if(!restAudio){
    restAudio=document.createElement("audio");
    restAudio.setAttribute("playsinline","");
    restAudio.preload="auto";
    restAudio.volume=1;
    document.body.appendChild(restAudio);
  }
  return restAudio;
}
function playSrc(url,loop){
  try{
    var a=audioEl();
    a.loop=!!loop; a.src=url;
    var p=a.play();
    if(p&&p.catch) p.catch(function(){});   // autoplay refused; vibration still tries
  }catch(e){}
}
function audioStop(){ if(restAudio){ try{ restAudio.loop=false; restAudio.pause(); }catch(e){} } }
/* Only worth keeping the page alive if something is going to happen at zero. */
function wantsBgAlert(){ return !!(S.settings.sound||S.settings.notify); }

/* ---- why there is no MediaSession here ----
   There was one. It made things worse. Declaring a media session tells Android
   "this is a music player", which is precisely what makes the system duck
   whatever you are actually listening to — and it put a pointless transport
   control in the notification shade. Reported from a real gym session: the
   30 Hz keep-alive was audible through headphones AND Android attenuated the
   user's music for the whole rest period to prioritise it. A rest timer that
   fights your music is not a rest timer anyone will keep using. */

function notifyRestDone(){
  if(!S.settings.notify) return;
  if(!("Notification" in window)||Notification.permission!=="granted") return;
  var opts={body:"Next set.",tag:"ironlog-rest",renotify:true,
            icon:"icon-192.png",badge:"icon-192.png",vibrate:[90,70,90]};
  try{
    /* .ready never resolves when nothing is registered — the artifact build
       has no service worker — so test for a live controller, not for the API. */
    if(navigator.serviceWorker&&navigator.serviceWorker.controller){
      navigator.serviceWorker.ready
        .then(function(reg){ return reg.showNotification("Rest done",opts); })
        .catch(function(){ try{ new Notification("Rest done",opts); }catch(e){} });
    } else new Notification("Rest done",opts);
  }catch(e){}
}
function clearRestNote(){
  if(!navigator.serviceWorker||!navigator.serviceWorker.controller) return;
  navigator.serviceWorker.ready.then(function(reg){
    if(!reg.getNotifications) return;
    reg.getNotifications({tag:"ironlog-rest"}).then(function(ns){
      ns.forEach(function(x){ x.close(); });
    }).catch(function(){});
  }).catch(function(){});
}
function notifyState(){
  if(!("Notification" in window)) return "none";
  return Notification.permission;               // granted | denied | default
}
/* Asked only when the switch is tapped, never on load, and the refusal path
   is a visible message rather than a switch that silently won't stay on. */
function askNotify(cb){
  if(!("Notification" in window)) return cb(false,"This browser can't show notifications.");
  if(Notification.permission==="granted") return cb(true,"");
  if(Notification.permission==="denied")
    return cb(false,"Notifications are blocked for this site — turn them back on in your browser settings.");
  try{
    /* Chrome resolves a promise *and* fires the legacy callback, so guard. */
    var done=false;
    var fin=function(p){
      if(done) return; done=true;
      cb(p==="granted",p==="granted"?"":"Notifications weren't allowed.");
    };
    var r=Notification.requestPermission(fin);
    if(r&&r.then) r.then(fin,function(){ fin("denied"); });
  }catch(e){ cb(false,"Couldn't ask for permission."); }
}

/* Whether a locked phone keeps this page running is not answerable from a
   desktop browser, so the app records it. The tick gap is the whole story: a
   frozen page stops ticking, so a run of 1s gaps means the keep-alive held and
   any failure is downstream (output routing, volume), while a 20s gap means
   Chrome froze us and the audio trick did not work. */
var diag=null;
function diagStart(sec){ diag={want:sec,t0:Date.now(),ticks:[],fired:0,audio:""}; }
function diagTick(){ if(diag) diag.ticks.push(Date.now()); }
function diagReport(){
  if(!diag) return null;
  var gaps=[],i;
  var prev=diag.t0;
  for(i=0;i<diag.ticks.length;i++){ gaps.push(diag.ticks[i]-prev); prev=diag.ticks[i]; }
  return {
    want:diag.want,
    ticks:diag.ticks.length,
    expected:diag.want,
    maxGap:gaps.length?Math.max.apply(null,gaps)/1000:0,
    fired:diag.fired?(diag.fired-diag.t0)/1000:0,
    audio:diag.audio,
    hidden:diag.hidden||0
  };
}

var rest={endsAt:0,total:0}, buzzed=false, restLate=0;
function startRest(sec){
  rest.total=sec; rest.endsAt=Date.now()+sec*1000; buzzed=false; restLate=0;
  clearRestNote();
  diagStart(sec);
  /* The tone is now opt-in. It is the only thing that guarantees Chrome won't
     freeze the page, but it costs you your music — Android ducks everything
     else the whole time it plays. Chrome doesn't freeze a backgrounded page
     immediately, so a normal 2-3 minute rest may well survive without it.
     Whether it does on YOUR phone is what the self-test answers. */
  if(wantsBgAlert()&&S.settings.keepTone) playSrc(audioURLs().quiet,true);
  renderHeader();
}
function stopRest(){ rest.endsAt=0; buzzed=false; audioStop(); clearRestNote(); renderHeader(); }
function restDone(){
  if(S.settings.sound) playSrc(audioURLs().alarm,false);
  else audioStop();
  buzz([90,70,90,70,160]);
  notifyRestDone();
  if(diag){
    diag.fired=Date.now();
    var a=restAudio;
    diag.audio=!a?"no element"
      :(a.error?("error "+a.error.code)
      :(a.paused?"paused":"playing")+" vol="+a.volume+(a.muted?" MUTED":""));
  }
}

/* ============================ sheets ============================ */
function sheet(html,onMount){
  closeSheet();
  var b=document.createElement("div");
  b.className="backdrop";
  b.innerHTML='<div class="sheet"><div class="grab"></div>'+html+'</div>';
  b.addEventListener("click",function(ev){ if(ev.target===b) closeSheet(); });
  document.body.appendChild(b);
  if(onMount) onMount($(".sheet",b));
  return b;
}
function closeSheet(){ var b=$(".backdrop"); if(b) b.remove(); }
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeSheet(); });

function confirmSheet(title,body,label,fn,danger){
  sheet('<h3>'+esc(title)+'</h3><div class="sub">'+esc(body)+'</div>'+
    '<div class="row" style="gap:8px">'+
      '<button class="btn ghost" style="flex:1" data-x="cancel">Cancel</button>'+
      '<button class="btn '+(danger?"danger":"primary")+'" style="flex:1" data-x="ok">'+esc(label)+'</button>'+
    '</div>',
    function(el){
      $('[data-x="cancel"]',el).onclick=closeSheet;
      $('[data-x="ok"]',el).onclick=function(){ closeSheet(); fn(); };
    });
}

/* ============================ navigation ============================ */
var TAB="today";
/* PLANVAR resets with the tab, like the calendar's month, so Plan always opens
   on the week you are actually about to train. */
function go(t){ TAB=t; calOffset=0; PLANVAR={}; closeSheet(); render(); window.scrollTo(0,0); }
/* Settings is deliberately NOT a fourth tab. The bottom bar is the gym-floor
   surface and a settings tab would be dead weight in every session; it opens
   from the header instead, and any tab tap leaves it. */
function renderTabs(){
  var tabs=[["today","Today",ICON.today],["progress","Progress",ICON.prog],["plan","Plan",ICON.plan]];
  var on=(TAB==="settings")?"plan":TAB;
  $("#tabs").innerHTML=tabs.map(function(t){
    return '<button class="t'+(on===t[0]?" on":"")+'" data-tab="'+t[0]+'">'+t[2]+'<span>'+t[1]+'</span></button>';
  }).join("");
}
$("#tabs").addEventListener("click",function(e){
  var b=e.target.closest("[data-tab]"); if(b) go(b.dataset.tab);
});

/* ============================ header ============================ */
function renderHeader(){
  var h=$("#hdr-right"), out="";
  out+=(TAB==="settings")
    ? '<button class="iconbtn" data-act="settings-back" aria-label="Back to Plan">\u2190</button>'
    : '<button class="iconbtn" data-act="settings" aria-label="Settings">'+ICON.gear+'</button>';
  if(rest.endsAt){
    var left=(rest.endsAt-Date.now())/1000;
    out+='<button class="rest'+(left<=0?" over":"")+'" data-act="rest-tap">'+
         (left<=0?"REST DONE":mmss(left))+'</button>';
  }
  if(S.active) out+='<span class="chip mono">'+dur(Date.now()-S.active.ts)+'</span>';
  h.innerHTML=out;
}
$("#hdr-right").addEventListener("click",function(e){
  if(e.target.closest('[data-act="rest-tap"]')){ restMenu(); return; }
  if(e.target.closest('[data-act="settings"]')){ go("settings"); return; }
  if(e.target.closest('[data-act="settings-back"]')) go("plan");
});
function restMenu(){
  sheet('<h3>Rest timer</h3><div class="sub">Auto-starts after each set.</div>'+
    '<div class="menu">'+
      '<button data-r="+30">+30 seconds</button>'+
      '<button data-r="-30">&minus;30 seconds</button>'+
      '<button data-r="restart">Restart ('+mmss(rest.total)+')</button>'+
      '<button data-r="skip" class="dang">Skip rest</button>'+
    '</div>',
    function(el){
      el.addEventListener("click",function(e){
        var b=e.target.closest("[data-r]"); if(!b) return;
        var r=b.dataset.r;
        if(r==="+30") rest.endsAt+=30000;
        else if(r==="-30") rest.endsAt-=30000;
        else if(r==="restart") rest.endsAt=Date.now()+rest.total*1000;
        else stopRest();
        closeSheet(); renderHeader();
      });
    });
}
window.addEventListener("scroll",function(){
  $("header.top").classList.toggle("stuck",window.scrollY>4);
},{passive:true});

self.__ilf=(self.__ilf||0)+1;
