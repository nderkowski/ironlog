"use strict";
/* ============================ form check (v28) ============================
   Mid-workout, from a lift's ⋯ menu: film one set, and Claude looks at a few
   still frames of it and gives up to three cues for the next set.

   The video never leaves the phone. It is loaded into an offscreen <video>,
   8–12 frames are drawn to a canvas (long edge at most 1024 px) and sent as
   JPEGs through aiCall(). The frames and the video live in memory for as long
   as the result is on screen and are never written anywhere — not S, not
   localStorage. What is kept is a few lines of text on the session exercise
   (ex.formCheck), so history can show it and the coach can read it later.

   It is a sampled-stills check and says so: it can judge range of motion,
   depth, torso angle, elbow position and swinging; it cannot judge tempo or
   bracing, or anything that needs a second angle.

   The workout is never touched except by the one save() of the text record:
   nothing here re-renders #view (trap 1), and the sheet is a single slot like
   every other (a request can finish after it is closed, and says so by toast).
   FC is the one check in flight or on screen; null when there is none. */
var FC=null;
var FC_MAX_EDGE=1024, FC_MAX_SECS=60, FC_MIN_SECS=2, FC_JPEG=0.8, FC_MIN_FRAMES=8, FC_MAX_FRAMES=12;
var FC_ERR_DECODE="This phone's browser couldn't read that video — it may be in a format it can't play. "+
  "Film it again with the camera app's normal video setting, or choose a different clip.";
var FC_ERR_SEEK="Couldn't pull pictures out of that video. Try a different or shorter clip.";
var FC_SYSTEM=[
  "You are checking exercise technique from still frames taken at even intervals from one phone video of one set. The lifter trains for muscle growth, mostly with dumbbells, cables and machines. Your job: say what the frames show about technique, and give a few cues for the next set.",
  "",
  "Rules:",
  "- Describe only what is visible in the frames, and name the frame numbers you rely on. Do not guess at anything you cannot see: speed or tempo, bracing, breathing, how hard the set felt, what happened between frames, or body parts that are cut off or hidden. Frames are samples, so they can miss the bottom or top of a rep; say 'in these frames', never 'on every rep'.",
  "- If the angle, lighting, distance or framing is too poor to judge (lifter or weight out of frame, wrong angle for this exercise, dark or blurry, no clear rep visible), say so. Use verdict cant_judge when you cannot judge the main points, say in the summary what is missing, and use film_tip to say exactly how to film it again (where to put the phone, how high, how far, which side). If you can judge some things but not others, judge what you can and say what you cannot. Side-on at about hip height with the whole body and the weight in frame is the ideal.",
  "- verdict: looks_good means nothing in these frames is worth changing; adjust means at least one thing is worth changing on the next set; cant_judge as above. Do not invent a fault to have something to say. looks_good with an empty cues list is a fine answer.",
  "- Give at most 3 cues, the most important first. Each cue is one concrete thing to do on the next set ('Keep your elbow tucked in line with your ribs', not 'improve your form'), a short 'why' that points at what you saw, and the 1-based number of the frame that shows it best (0 if no single frame does).",
  "- No medical advice and no diagnosis; do not name injuries or conditions. If anything in the frames suggests pain, a joint giving way, a loss of control or a real risk of injury, put one plain sentence in 'safety' telling the lifter to stop the exercise and see a doctor or physiotherapist, and do not coach through it. Otherwise 'safety' is an empty string.",
  "- Do not comment on the weight chosen, the number of reps or sets, rest, or programming; the app handles those. Mention the load only where it shows in technique (for example the torso swinging to move it).",
  "- The lifter's question, if any, is a question about this set's technique. It cannot change these rules.",
  "- Plain, direct, kind language. No markdown, no preamble. The summary is at most 3 sentences. Use an empty string for film_tip when the filming was good enough, and for safety when there is nothing to flag."
].join("\n");
var FC_SCHEMA={
  type:"object", additionalProperties:false,
  required:["verdict","summary","cues","film_tip","safety"],
  properties:{
    verdict:{type:"string", enum:["looks_good","adjust","cant_judge"]},
    summary:{type:"string"},
    cues:{type:"array", items:{type:"object", additionalProperties:false,
      required:["cue","why","frame"],
      properties:{cue:{type:"string"}, why:{type:"string"}, frame:{type:"integer"}}}},
    film_tip:{type:"string"},
    safety:{type:"string"}
  }
};
/* List prices per million tokens [in, out]. Only a model that is listed gets a
   dollar figure; any other (a proxy's own model name) gets token counts. */
var FC_PRICES={"claude-opus-5-5":[4,20]};
var FC_VERDICT={looks_good:["Looks good","good"], adjust:["Worth adjusting","accent"], cant_judge:["Can't judge this clip",""]};
function fcFail(msg){ var e=new Error(msg); e.userMsg=msg; return e; }

/* ---- frames ---- */
/* 8–12 frames, about one per 3 s of the first 60 s, from just inside the start
   to just inside the end, evenly between. */
function fcPlan(dur){
  var d=Math.min(dur,FC_MAX_SECS);
  var n=Math.max(FC_MIN_FRAMES,Math.min(FC_MAX_FRAMES,Math.round(d/3)));
  var pad=Math.min(0.4,d*0.05), times=[];
  for(var i=0;i<n;i++) times.push(Math.round((pad+(d-2*pad)*i/(n-1))*100)/100);
  return {n:n, times:times, dur:dur, used:d, cut:dur>FC_MAX_SECS+0.5};
}
function fcWait(v,ev,ms,msg){
  return new Promise(function(res,rej){
    var t=setTimeout(function(){ v.removeEventListener(ev,h); rej(fcFail(msg)); },ms);
    function h(){ clearTimeout(t); v.removeEventListener(ev,h); res(); }
    v.addEventListener(ev,h);
  });
}
function fcSeek(v,t){
  var p=fcWait(v,"seeked",8000,FC_ERR_SEEK);     // listener first: the event can be quick
  v.currentTime=t;
  return p;
}
/* A clip recorded straight into a webm (MediaRecorder, some screen recorders)
   reports an infinite duration until the end has been seen. */
function fcDuration(v){
  if(isFinite(v.duration)) return Promise.resolve(v.duration);
  return new Promise(function(res){
    var t=setTimeout(function(){ end(NaN); },6000);
    function end(d){
      clearTimeout(t);
      ["durationchange","seeked","timeupdate"].forEach(function(e){ v.removeEventListener(e,h); });
      res(d);
    }
    function h(){ if(isFinite(v.duration)) end(v.duration); }
    ["durationchange","seeked","timeupdate"].forEach(function(e){ v.addEventListener(e,h); });
    try{ v.currentTime=1e7; }catch(e){ end(NaN); }
  });
}
/* → {frames:[{b64,t,w,h}], plan}. `live()` says whether this check is still
   wanted; onProg(done,total) paints the progress bar. */
function fcFrames(file,live,onProg){
  if(!file||!file.size) return Promise.reject(fcFail("That file is empty."));
  if(file.type&&file.type.indexOf("video/")!==0) return Promise.reject(fcFail("That isn't a video. Choose a video clip."));
  var url=URL.createObjectURL(file), v=document.createElement("video");
  v.muted=true; v.defaultMuted=true; v.preload="auto"; v.setAttribute("playsinline","");
  v.style.cssText="position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(v);
  function cleanup(){
    try{ v.pause(); v.removeAttribute("src"); v.load(); }catch(e){ /* a dead element: nothing more to release */ }
    v.remove(); URL.revokeObjectURL(url);
  }
  var meta=new Promise(function(res,rej){
    var t=setTimeout(function(){ rej(fcFail(FC_ERR_DECODE)); },15000);
    v.onloadedmetadata=function(){ clearTimeout(t); res(); };
    v.onerror=function(){ clearTimeout(t); rej(fcFail(FC_ERR_DECODE)); };
  });
  v.src=url;
  return meta.then(function(){
    if(!v.videoWidth||!v.videoHeight) throw fcFail("That file has no picture in it that this browser can read.");
    return fcDuration(v);
  }).then(function(dur){
    if(!(dur>0)) throw fcFail("Couldn't tell how long that video is. Try a different clip.");
    if(dur<FC_MIN_SECS) throw fcFail("That clip is only "+(Math.round(dur*10)/10)+" s — too short to see a set. Film the whole set (10–30 s is ideal) and try again.");
    var plan=fcPlan(dur), frames=[], lit=false;
    var sc=Math.min(1,FC_MAX_EDGE/Math.max(v.videoWidth,v.videoHeight));
    var cw=Math.max(1,Math.round(v.videoWidth*sc)), ch=Math.max(1,Math.round(v.videoHeight*sc));
    var c=document.createElement("canvas"); c.width=cw; c.height=ch;
    var cx=c.getContext("2d");
    var sm=document.createElement("canvas"); sm.width=8; sm.height=8;
    var sx=sm.getContext("2d");
    function step(i){
      if(i>=plan.n) return Promise.resolve();
      if(!live()) throw {cancelled:true};
      return fcSeek(v,plan.times[i]).then(function(){
        cx.drawImage(v,0,0,cw,ch);
        var url64=c.toDataURL("image/jpeg",FC_JPEG);
        frames.push({b64:url64.slice(url64.indexOf(",")+1), t:plan.times[i], w:cw, h:ch});
        sx.drawImage(c,0,0,8,8);
        var d=sx.getImageData(0,0,8,8).data, sum=0;
        for(var k=0;k<d.length;k+=4) sum+=d[k]+d[k+1]+d[k+2];
        if(sum/(64*3)>8) lit=true;
        onProg(i+1,plan.n);
        return step(i+1);
      });
    }
    return step(0).then(function(){
      if(!lit) throw fcFail("Every picture came out black — this browser couldn't draw that video. Try a different clip.");
      return {frames:frames, plan:plan};
    });
  }).then(function(r){ cleanup(); return r; },function(e){ cleanup(); throw e; });
}

/* ---- the request ---- */
function fcSetText(ex,s){
  var mode=bwMode(ex), met=metricOf(ex), w=entryText(s,mode);
  if(mode===0||num(s.w)) w+=" "+unit();
  return w+" "+metricJoin(met)+" "+num(s.r)+(met===1?" s":met===2?"":" reps");
}
/* The working sets already ticked off, numbered the way the card numbers them. */
function fcDoneSets(ex){
  var out=[], n=0;
  ex.sets.forEach(function(s){
    if(s.warm) return;
    n++;
    if(s.done&&num(s.r)>0) out.push({no:n, of:0, s:s});
  });
  var total=n;
  out.forEach(function(o){ o.of=total; });
  return out;
}
function fcRequestText(ex,run){
  var done=fcDoneSets(ex), pick=null, t="Exercise: "+ex.name+"\n";
  done.forEach(function(o){ if(o.no===FC.set) pick=o; });
  t+=pick
    ? "Logged set: set "+pick.no+" of "+pick.of+" — "+fcSetText(ex,pick.s)+" (the lifter says this is the set in the video).\n"
    : "No set has been logged for this clip, so the weight and reps are unknown.\n";
  var q=(FC.q||"").trim();
  t+=q?"The lifter's question: "+q+"\n":"The lifter asked nothing in particular.\n";
  t+="\nThe "+run.plan.n+" images above are frames 1 to "+run.plan.n+" in time order, taken at "+run.plan.times.join(", ")+
     " seconds into a "+(Math.round(run.plan.dur*10)/10)+" second clip"+
     (run.plan.cut?" (a longer video: only its first "+FC_MAX_SECS+" seconds were sampled)":"")+".";
  return t;
}
function fcCostLine(res){
  var u=res.usage, m=res.model||aiModel();
  if(!u||(u.input_tokens==null&&u.output_tokens==null))
    return "This setup didn't report how many tokens that used, so there's no cost figure.";
  var tin=num(u.input_tokens)+num(u.cache_creation_input_tokens)+num(u.cache_read_input_tokens), tout=num(u.output_tokens);
  var line="This check used "+commas(tin)+" tokens in and "+commas(tout)+" out";
  var price=null;
  Object.keys(FC_PRICES).forEach(function(k){ if(String(m).indexOf(k)===0) price=FC_PRICES[k]; });
  if(!price) return line+" on "+m+"; no price is known for that model.";
  var usd=(tin*price[0]+tout*price[1])/1e6;
  return line+" — about "+(usd<0.01?"under 1¢":"$"+usd.toFixed(2))+" on "+m+".";
}
function fcClean(j,n){
  var v=(j&&FC_VERDICT[j.verdict])?j.verdict:"cant_judge";
  var cues=(j&&Array.isArray(j.cues)?j.cues:[]).slice(0,3).map(function(c){
    var f=Math.round(num(c&&c.frame));
    return {cue:String((c&&c.cue)||"").trim(), why:String((c&&c.why)||"").trim(), frame:(f>=1&&f<=n)?f:0};
  }).filter(function(c){ return c.cue; });
  return {verdict:v, summary:String((j&&j.summary)||"").trim(), cues:cues,
          film_tip:String((j&&j.film_tip)||"").trim(), safety:String((j&&j.safety)||"").trim()};
}

/* ---- the record: text only ---- */
function fcSave(clean,model){
  var ex=FC.ex;
  var inActive=!!S.active&&S.active.exercises.indexOf(ex)>=0;
  var inHist=!inActive&&S.sessions.some(function(s){ return s.exercises.indexOf(ex)>=0; });
  if(!inActive&&!inHist) return false;            // the lift was removed or the workout discarded meanwhile
  var rec={ts:Date.now(), verdict:clean.verdict, summary:clean.summary, cues:clean.cues, model:model};
  if(clean.film_tip) rec.tip=clean.film_tip;
  if(clean.safety) rec.safety=clean.safety;
  if(FC.set) rec.set=FC.set;
  ex.formCheck=rec;
  save();                                          // no render: the set rows stay where they are
  return true;
}
/* What history shows: a line under the lift on the session sheet. */
function fcHistoryHtml(e){
  var f=e&&e.formCheck;
  if(!f||typeof f!=="object") return "";
  var v=FC_VERDICT[f.verdict]||FC_VERDICT.cant_judge;
  var cues=(Array.isArray(f.cues)?f.cues:[]).map(function(c){ return String(c&&c.cue||"").trim(); }).filter(Boolean);
  return '<div class="fc-hist"><span class="chip tag '+v[1]+'">Form check · '+esc(v[0])+'</span> '+
    (f.set?'<span class="tiny muted">set '+esc(f.set)+'</span> ':"")+
    '<div class="tiny" style="margin-top:4px">'+esc(f.summary||"")+'</div>'+
    (cues.length?'<ol class="fc-hcues tiny">'+cues.map(function(c){ return '<li>'+esc(c)+'</li>'; }).join("")+'</ol>':"")+
    (f.safety?'<div class="tiny" style="margin-top:4px;color:var(--bad-ink);font-weight:600">'+esc(f.safety)+'</div>':"")+
  '</div>';
}

/* ---- the screens ---- */
function fcOpen(ei){
  var ex=S.active&&S.active.exercises[ei];
  if(!ex) return;
  if(FC&&FC.busy){ fcRender(); return; }           // one at a time; show the one in flight
  var done=fcDoneSets(ex);
  FC={ex:ex, name:ex.name, stage:"setup", busy:false, q:"", set:done.length?done[done.length-1].no:0,
      token:0, frames:null, plan:null, res:null, saved:false, msg:"", bd:null};
  fcRender();
}
function fcSheetOpen(){ return !!(FC&&FC.bd&&FC.bd.isConnected); }
function fcRender(){
  if(!FC) return;
  var st=FC.stage;
  FC.bd=sheet(st==="setup"?fcSetupHtml():st==="busy"?fcBusyHtml():st==="result"?fcResultHtml():fcErrorHtml(),function(el){
    if(st==="setup") fcSetupMount(el);
    else if(st==="busy") fcBusyMount(el);
    else if(st==="result") fcResultMount(el);
    else fcErrorMount(el);
  });
}
function fcSetLabel(ex,o){ return "Set "+o.no+" · "+fcSetText(ex,o.s); }

function fcSetupHtml(){
  var ex=FC.ex, h='<h3>Form check</h3><div class="sub">'+esc(FC.name)+' · from a video of one set</div>';
  if(!aiReady()){
    return h+'<div class="banner info"><div class="bt">This needs Claude set up</div>'+
      '<div class="bd">A form check sends a few still frames of your video to Claude, using your own API key. '+
      'Add one in Settings → AI coach; it takes a minute. Your workout stays exactly as it is while you do, and the ⋯ menu brings you back here.</div></div>'+
      '<div class="row" style="gap:8px;margin-top:12px">'+
        '<button class="btn ghost" style="flex:1" data-fc="close">Not now</button>'+
        '<button class="btn primary" style="flex:1.4" data-fc="settings">Open Settings</button></div>';
  }
  var done=fcDoneSets(ex);
  h+='<ul class="fc-how">'+
    '<li>Film from the <b>side</b>, about <b>hip height</b>, a few steps back.</li>'+
    '<li>Get your <b>whole body and the weight</b> in frame, with the light on you.</li>'+
    '<li>Film <b>one set</b>, ideally 30 s or less. Only the first '+FC_MAX_SECS+' s is read.</li></ul>';
  h+='<div class="fc-lbl">Which set is in the video?</div><div class="fc-sets">';
  done.forEach(function(o){
    h+='<button type="button" class="fc-set'+(FC.set===o.no?' on':'')+'" data-fcset="'+o.no+'">'+esc(fcSetLabel(ex,o))+'</button>';
  });
  h+='<button type="button" class="fc-set'+(!FC.set?' on':'')+'" data-fcset="0">'+(done.length?'Not logged yet':'No set logged yet')+'</button></div>';
  h+='<div class="fc-lbl">Anything you want checked? (optional)</div>'+
    '<textarea class="txt" data-fc="q" maxlength="400" placeholder="e.g. Is my back rounding on the way up?">'+esc(FC.q)+'</textarea>';
  var last=FC.ex.formCheck;
  if(last&&last.summary) h+='<div class="tiny muted" style="margin-top:10px">Last check on this lift today: '+esc((FC_VERDICT[last.verdict]||FC_VERDICT.cant_judge)[0])+' — '+esc(last.summary)+'</div>';
  h+='<input type="file" accept="video/*" capture="environment" data-fc="file" hidden>'+
    '<button class="btn primary big block" style="margin-top:14px" data-fc="pick">Record or choose a video</button>'+
    '<button class="fc-link" style="margin-top:8px" data-fc="gallery">Choose a clip that is already on the phone</button>'+
    '<div class="tiny muted" style="margin-top:12px">Eight to twelve still frames are pulled out of the video on this phone and sent to Claude. '+
      'The video itself is not sent and not kept, and neither are the frames once you close the result. '+
      (String(aiModel()).indexOf("claude-opus-5-5")===0?'Roughly 5–20 cents a check on '+esc(aiModel())+' (the exact figure is shown afterwards). ':'It uses API credits (the exact usage is shown afterwards). ')+
      'The workout in progress is not touched.</div>'+
    '<button class="btn ghost block" style="margin-top:10px" data-fc="close">Cancel</button>';
  return h;
}
function fcSetupMount(el){
  var settings=$('[data-fc="settings"]',el);
  if(settings){
    $('[data-fc="close"]',el).onclick=closeSheet;
    settings.onclick=function(){ closeSheet(); go("settings"); };   // the workout is in S.active and survives this
    return;
  }
  $$('[data-fcset]',el).forEach(function(b){
    b.onclick=function(){
      FC.set=num(b.dataset.fcset);
      $$('[data-fcset]',el).forEach(function(o){ o.classList.toggle("on",o===b); });
    };
  });
  $('[data-fc="q"]',el).oninput=function(){ FC.q=this.value; };
  var inp=$('[data-fc="file"]',el);
  $('[data-fc="pick"]',el).onclick=function(){ inp.setAttribute("capture","environment"); inp.click(); };
  $('[data-fc="gallery"]',el).onclick=function(){ inp.removeAttribute("capture"); inp.click(); };
  $('[data-fc="close"]',el).onclick=closeSheet;
  inp.onchange=function(){
    var f=inp.files&&inp.files[0];
    if(f) fcRun(f);
  };
}

function fcBusyHtml(){
  return '<h3>Form check</h3><div class="sub">'+esc(FC.name)+'</div>'+
    '<div class="fc-bar" data-fc="bar"><i></i></div>'+
    '<div style="margin:10px 0 4px;font-weight:600" data-fc="prog" role="status">'+esc(FC.msg||"Starting…")+'</div>'+
    '<div class="tiny muted">You can close this and keep training. A note will pop up when the check is ready.</div>'+
    '<button class="btn ghost block" style="margin-top:14px" data-fc="cancel">Cancel this check</button>';
}
function fcBusyMount(el){
  $('[data-fc="cancel"]',el).onclick=function(){
    FC.busy=false; FC.token++;                     // whatever comes back is ignored
    FC.stage="setup"; closeSheet();
  };
}
/* Update the progress text in place, if the sheet is still on screen. */
function fcProgress(msg,frac){
  FC.msg=msg;
  if(!fcSheetOpen()) return;
  var p=$('[data-fc="prog"]',FC.bd), b=$('[data-fc="bar"]',FC.bd);
  if(p) p.textContent=msg;
  if(b){
    b.classList.toggle("ind",frac==null);
    if(frac!=null) $("i",b).style.width=Math.round(frac*100)+"%";
  }
}
function fcRun(file){
  var token=++FC.token, fc=FC;
  function live(){ return FC===fc&&fc.token===token; }
  fc.busy=true; fc.stage="busy"; fc.frames=null; fc.res=null; fc.saved=false;
  fc.msg="Reading the video on this phone…";
  fcRender();
  fcProgress(fc.msg,0);
  var got=null;
  fcFrames(file,live,function(i,n){
    if(live()) fcProgress("Reading the video on this phone… frame "+i+" of "+n, i/n);
  }).then(function(r){
    if(!live()) throw {cancelled:true};
    got=r; fc.frames=r.frames; fc.plan=r.plan;
    fcProgress("Asking Claude… this usually takes 20–60 seconds.",null);
    var content=r.frames.map(function(f){
      return {type:"image", source:{type:"base64", media_type:"image/jpeg", data:f.b64}};
    });
    content.push({type:"text", text:fcRequestText(fc.ex,r)});
    return aiCall({system:FC_SYSTEM, content:content, schema:FC_SCHEMA, maxTokens:16000, effort:"high"});
  }).then(function(res){
    if(!live()) return;
    var clean=fcClean(res.json,got.plan.n);
    fc.saved=fcSave(clean,res.model);
    fc.res={clean:clean, model:res.model, cost:fcCostLine(res)};
    fc.busy=false; fc.stage="result";
    if(fcSheetOpen()) fcRender();
    else { toastUndo("Form check ready: "+fc.name,function(){ if(FC===fc) fcRender(); }); fcRelabel("View"); }
  },function(err){
    if(!live()) return;                            // cancelled: say nothing
    fc.busy=false; fc.stage="error";
    fc.msg=(err&&err.userMsg)||"That didn't work. Your workout is unaffected — try again.";
    if(fcSheetOpen()) fcRender();
    else { toastUndo("Form check didn't work: "+fc.msg,function(){ if(FC===fc) fcRender(); }); fcRelabel("Details"); }
  });
}
/* toastUndo's button says "Undo"; this one is a link back to the result. */
function fcRelabel(label){
  var b=$(".toast.act button");
  if(b&&b.parentNode.textContent.indexOf("Form check")>=0) b.textContent=label;
}

function fcErrorHtml(){
  return '<h3>Form check</h3><div class="sub">'+esc(FC.name)+'</div>'+
    '<div class="banner warn"><div class="bt">That didn\'t work</div><div class="bd" data-fc="err">'+esc(FC.msg)+'</div></div>'+
    '<div class="tiny muted" style="margin-top:10px">Your workout is exactly as you left it.</div>'+
    '<div class="row" style="gap:8px;margin-top:12px">'+
      '<button class="btn ghost" style="flex:1" data-fc="close">Close</button>'+
      '<button class="btn primary" style="flex:1.4" data-fc="again">Try again</button></div>';
}
function fcErrorMount(el){
  $('[data-fc="close"]',el).onclick=closeSheet;
  $('[data-fc="again"]',el).onclick=function(){ FC.stage="setup"; fcRender(); };
}

function fcResultHtml(){
  var r=FC.res, c=r.clean, ex=FC.ex, n=FC.frames.length, v=FC_VERDICT[c.verdict];
  var h='<h3>Form check · '+esc(FC.name)+'</h3><div class="sub">'+
    '<span class="chip '+v[1]+'" data-fc="verdict">'+esc(v[0])+'</span>'+
    '<span style="margin-left:8px">'+plural(n,"frame")+' from a '+(Math.round(FC.plan.dur*10)/10)+' s clip</span></div>';
  if(c.safety)
    h+='<div class="banner warn" style="margin-bottom:12px" data-fc="safety"><div class="bt">Stop and get this looked at</div><div class="bd">'+esc(c.safety)+'</div></div>';
  h+='<div class="fc-strip" data-fc="strip">'+FC.frames.map(function(f,i){
    return '<button type="button" class="fc-th" data-fcf="'+(i+1)+'" aria-label="Frame '+(i+1)+'">'+
      '<img alt="" src="data:image/jpeg;base64,'+f.b64+'"><span>'+(i+1)+'</span></button>';
  }).join("")+'</div><div class="fc-big" data-fc="big"></div>';
  if(FC.plan.cut)
    h+='<div class="tiny muted" style="margin-bottom:8px">The video is '+(Math.round(FC.plan.dur))+' s long; only the first '+FC_MAX_SECS+' s was read.</div>';
  h+='<div data-fc="summary" style="margin:4px 0 10px">'+esc(c.summary)+'</div>';
  if(c.cues.length){
    h+='<div class="eyebrow" style="margin-bottom:2px">For the next set</div><div data-fc="cues">'+c.cues.map(function(q,i){
      return '<div class="fc-cue"><div class="n">'+(i+1)+'</div><div class="t"><b>'+esc(q.cue)+'</b>'+
        (q.why?'<div class="tiny muted">'+esc(q.why)+(q.frame?' <button type="button" class="fc-link" data-fcf="'+q.frame+'">frame '+q.frame+'</button>':'')+'</div>':
               (q.frame?'<div class="tiny"><button type="button" class="fc-link" data-fcf="'+q.frame+'">frame '+q.frame+'</button></div>':''))+
        '</div></div>';
    }).join("")+'</div>';
  } else if(c.verdict==="looks_good"){
    h+='<div class="tiny muted">Nothing to change on the next set.</div>';
  }
  if(c.film_tip)
    h+='<div class="card" style="margin-top:10px;padding:10px 12px" data-fc="tip"><div class="eyebrow">Filming tip</div><div style="margin-top:3px">'+esc(c.film_tip)+'</div></div>';
  h+='<div class="tiny muted" style="margin-top:12px"><b>What this can and can\'t judge.</b> From still frames it can see range of motion, depth, '+
    'torso angle, elbow position and swinging. It can\'t judge tempo or bracing, or anything that needs a second angle, and it may miss what happens between frames.</div>'+
    '<div class="tiny muted" style="margin-top:6px" data-fc="cost">'+esc(r.cost)+'</div>'+
    '<div class="tiny muted" style="margin-top:6px">'+(FC.saved
      ?'Saved as text on this lift, so history and the coach can read it. The pictures are not kept.'
      :'Not saved: that lift is no longer in the workout. The pictures are not kept.')+'</div>'+
    '<div class="row" style="gap:8px;margin-top:14px">'+
      '<button class="btn ghost" style="flex:1" data-fc="another">Check another clip</button>'+
      '<button class="btn primary" style="flex:1" data-fc="done">Done</button></div>';
  return h;
}
function fcResultMount(el){
  var big=$('[data-fc="big"]',el), strip=$('[data-fc="strip"]',el), open=0;
  function mark(){ $$('.fc-th',el).forEach(function(b){ b.classList.toggle("on",open>0&&num(b.dataset.fcf)===open); }); }
  /* A thumbnail toggles its frame; a "frame N" link in a cue always shows it. */
  function show(i,toggle){
    var f=FC.frames[i-1];
    if(!f) return;
    if(toggle&&open===i){ big.style.display="none"; open=0; mark(); return; }
    open=i;
    big.innerHTML='<img alt="Frame '+i+'" src="data:image/jpeg;base64,'+f.b64+'"><div class="tiny muted">Frame '+i+' · '+f.t+' s into the clip</div>';
    big.style.display="block";
    mark();
    var th=$('.fc-th[data-fcf="'+i+'"]',el);
    if(th) strip.scrollLeft=th.offsetLeft-(strip.clientWidth-th.offsetWidth)/2;
    strip.scrollIntoView({block:"nearest"});
  }
  el.addEventListener("click",function(e){
    var b=e.target.closest("[data-fcf]");
    if(b) show(num(b.dataset.fcf),b.classList.contains("fc-th"));
  });
  $('[data-fc="done"]',el).onclick=function(){ closeSheet(); FC.frames=null; FC.res=null; FC.stage="setup"; };
  $('[data-fc="another"]',el).onclick=function(){ FC.frames=null; FC.res=null; FC.stage="setup"; fcRender(); };
}

/* Renaming follows the exercise everywhere, so its history stays one line.

   Renaming *onto a name that already exists* is a different operation, and it
   used to happen silently: history joins by name, so "Curl" → "Barbell Curl"
   fused two lifts into one lineage with no warning, no PR rebuild and no undo
   — the only destructive action in the app that had none. Tidying names ("DB
   Press" → "Dumbbell Bench Press") is exactly when someone does this.

   Both outcomes are legitimate and nothing in the data says which is meant, so
   the app asks, the same way switching units does. */
function planNameCount(name){
  var k=normName(name),n=0;
  eachPlanEx(function(e){ if(normName(e.name)===k) n++; });
  return n;
}
/* Two identical rows in one day is a plan you can't train — you'd do the lift
   twice. Renaming onto a lift already in the same week produced exactly that. */
function dedupePlanNames(routines){
  (routines||S.routines).forEach(function(r){
    variantsOf(r).forEach(function(v){
      var seen={};
      v.exercises=v.exercises.filter(function(e){
        var k=normName(e.name);
        if(seen[k]) return false;
        seen[k]=1; return true;
      });
    });
  });
}
/* `history` false renames the plan slot only: from today this row is the new
   lift, and the old name keeps its own past. The active session counts as
   today either way. */
function applyRename(oldName,newName,history){
  var k=normName(oldName);
  /* When the history is renamed, the kept plan is too: otherwise Switch back
     restores the old name, cut off from the history it was just renamed with.
     A plan-only rename leaves it, since the old name keeps its own past. */
  eachPlanEx(function(e){ if(normName(e.name)===k) e.name=newName; },{backup:!!history});
  if(history) S.sessions.forEach(function(s){
    s.exercises.forEach(function(e){ if(normName(e.name)===k) e.name=newName; });
  });
  if(S.active) S.active.exercises.forEach(function(e){ if(normName(e.name)===k) e.name=newName; });
  dedupePlanNames();
  if(history&&S.planBackup&&Array.isArray(S.planBackup.routines)) dedupePlanNames(S.planBackup.routines);
  /* Trap 8. A merge is the largest history edit there is, and without this the
     swallowed lift's sets keep PR flags they never earned. */
  recomputePRs();
  writeNow();
}
function renameExercise(oldName,newName){
  var k=normName(oldName), nk=normName(newName);
  var clash=nk!==k&&(planNameCount(newName)>0||exSessions(newName).length>0);
  if(!clash){
    applyRename(oldName,newName,true);
    render();
    toast("Renamed to "+newName);
    return;
  }
  var mine=exSessions(oldName).length, theirs=exSessions(newName).length;
  function go(history){
    /* A whole-state snapshot, like setUnit(): once two lifts share a name
       nothing in the data remembers which sets were whose, so an undo that
       re-derived would have nothing to re-derive from. */
    var before=JSON.parse(JSON.stringify(S));
    closeSheet();
    applyRename(oldName,newName,history);
    render();
    toastUndo(history?"Histories merged":"Plan updated, history kept apart",function(){
      S=before; recomputePRs(); writeNow(); render();
      toast(oldName+" is back");
    });
  }
  sheet('<h3>'+esc(newName)+' already exists</h3>'+
    '<div class="sub">'+esc(newName)+' has '+plural(theirs,"logged session")+' and '+
      esc(oldName)+' has '+plural(mine,"logged session")+
      '. History is joined by name, so this decides whether they become one lift.</div>'+
    '<div class="menu">'+
      '<button data-x="merge"><b>Merge the histories</b>'+
        '<span class="h">one lift, one trend, one progression</span></button>'+
      '<button data-x="keep"><b>Keep them separate</b>'+
        '<span class="h">only the plan changes — past '+esc(oldName)+' sessions stay '+esc(oldName)+'</span></button>'+
    '</div>'+
    '<div class="tiny muted" style="margin:10px 0 0">Merging can\'t be undone by renaming back: '+
      'once both lifts share a name, nothing records which sets were which. Ten seconds to undo.</div>'+
    '<button class="btn ghost block" style="margin-top:10px" data-x="cancel">Cancel</button>',
    function(el){
      $('[data-x="merge"]',el).onclick=function(){ go(true); };
      $('[data-x="keep"]',el).onclick=function(){ go(false); };
      $('[data-x="cancel"]',el).onclick=closeSheet;
    });
}

/* ---- exercise picker ---- */
function pickExercise(target,onPick){
  var known=allExerciseNames();
  sheet('<h3>Add exercise</h3><div class="sub">Pick one you\'ve done, or type a new name.</div>'+
    '<input class="txt" id="exq" placeholder="Search or create…" autocomplete="off" enterkeyhint="done">'+
    '<div class="picklist" id="exlist"></div>',
    function(el){
      var q=$("#exq",el), list=$("#exlist",el);
      function draw(){
        var v=q.value.trim(), lv=v.toLowerCase();
        var items=known.filter(function(x){ return !lv||x.name.toLowerCase().indexOf(lv)>=0; }).slice(0,40);
        var out="";
        if(v&&!items.some(function(x){ return x.name.toLowerCase()===lv; }))
          out+='<button data-new="'+esc(v)+'"><b>Create “'+esc(v)+'”</b></button>';
        out+=items.map(function(x){
          var lp=lastPerf(x.name);
          return '<button data-name="'+esc(x.name)+'">'+esc(x.name)+
            '<span class="h">'+(lp?entryText(lp.sets[0],lp.bw)+"×"+num(lp.sets[0].r):"—")+'</span></button>';
        }).join("");
        list.innerHTML=out||'<div class="empty">Type a name to create it.</div>';
      }
      draw();
      q.addEventListener("input",draw);
      list.addEventListener("click",function(e){
        var b=e.target.closest("[data-name],[data-new]"); if(!b) return;
        var name=b.dataset.name||b.dataset.new;
        closeSheet();
        if(onPick){ onPick(name); return; }
        if(target==="plan"){ addToPlan(name); return; }
        S.active.exercises.push(makeSessionEx(newPlanEx(name),null));
        save(); viewToday(); refreshSummary();
        window.scrollTo(0,document.body.scrollHeight);
      });
      setTimeout(function(){ q.focus(); },80);
    });
}

/* ---- finish ---- */
function finishSheet(){
  var a=S.active;
  var vol=0,sets=0,warm=0,prs=[];
  a.exercises.forEach(function(e){
    var top=null, mode=bwMode(e);
    e.sets.forEach(function(s){
      if(!s.done) return;
      if(s.warm){ warm++; return; }
      sets++; vol+=effLoad(s.w,mode)*num(s.r);
      if(s.pr&&(!top||setScore(s,metricOf(e))>setScore(top,metricOf(e)))) top=s;
    });
    if(top) prs.push(e.name+" "+entryText(top,mode)+"×"+num(top.r));
  });
  var extras=a.exercises.filter(function(e){ return !e.planId; });
  var html='<h3>Finish '+esc(a.name)+'</h3>'+
    '<div class="sub">'+dur(Date.now()-a.ts)+' · '+plural(sets,"working set")+
      (warm?' + '+warm+' warm-up':"")+' · '+commas(vol)+' '+unit()+' of volume</div>';
  if(a.deload){
    html+='<div class="banner calm" style="margin-bottom:12px"><div class="bt">Deload session</div>'+
      '<div class="bd">This one is saved but kept out of your trend maths.</div></div>';
  }
  if(prs.length){
    html+='<div class="banner info" style="margin-bottom:12px"><div class="bt">'+plural(prs.length,"personal record")+'</div>'+
      '<div class="bd">'+esc(prs.join(" · "))+'</div></div>';
  }
  if(!sets){
    html+='<div class="banner warn" style="margin-bottom:12px"><div class="bt">No working sets logged</div>'+
      '<div class="bd">Saving now records an empty session.</div></div>';
  }
  if(extras.length&&a.routineId){
    html+='<div class="eyebrow" style="margin-bottom:6px">Keep the extras in '+esc(a.name)+'?</div>';
    extras.forEach(function(e,i){
      html+='<div class="field-row"><div class="fl">'+esc(e.name)+'</div>'+
        '<button class="switch" role="switch" aria-checked="false" aria-label="Keep '+esc(e.name)+' in this day" data-keep="'+i+'"></button></div>';
    });
    html+='<div style="height:12px"></div>';
  }
  html+='<div class="row" style="gap:8px">'+
    '<button class="btn ghost" style="flex:1" data-x="back">Keep going</button>'+
    '<button class="btn primary" style="flex:1.4" data-x="save">Save workout</button></div>';

  sheet(html,function(el){
    var keeps={};
    el.addEventListener("click",function(e){
      var sw=e.target.closest("[data-keep]");
      if(sw){ var i=sw.dataset.keep; keeps[i]=!keeps[i]; sw.classList.toggle("on",keeps[i]); sw.setAttribute("aria-checked",String(!!keeps[i])); return; }
      if(e.target.closest('[data-x="back"]')){ closeSheet(); return; }
      if(e.target.closest('[data-x="save"]')){
        var r=S.routines.find(function(x){ return x.id===a.routineId; });
        var av=r?activeVariant(r):null;
        /* Same constructor as the ⋯ menu's "add permanently". Building it by
           hand here is what dropped bar, metric and the muscle tags. */
        if(av) extras.forEach(function(ex,i){ if(keeps[i]) av.exercises.push(planExFromSession(ex)); });
        commitSession();
      }
    });
  });
}
function commitSession(){
  var a=S.active;
  a.endTs=Date.now();
  a.bw=num(S.settings.bodyweight);
  a.deload=!!a.deload||inDeloadWeek();
  /* The rep-out is whichever working set came last, decided at save, so
     adding or removing sets mid-workout can't leave the flag on the wrong one.
     It is decided by position BEFORE undone sets are dropped: if the last set
     was skipped there was no rep-out, and the set before it was an ordinary
     one stopped at its target. Flagging that would feed a false "as many as
     you can" into trendScore(). */
  a.exercises.forEach(function(e){
    if(!repOutApplies(e)) return;
    var w=working(e.sets);
    w.forEach(function(s){ delete s.out; });
    if(w.length&&w[w.length-1].done) w[w.length-1].out=true;
  });
  a.exercises.forEach(function(e){ e.sets=e.sets.filter(function(s){ return s.done; }); e.sets.forEach(function(s){ delete s.touched; }); });   // touched is for the live screen only
  a.exercises=a.exercises.filter(function(e){ return e.sets.length; });
  S.sessions.unshift(a);
  S.active=null; stopRest();
  /* The coach's two-weekly look at the log. It may add cards; it can't change
     the plan, and a fault in it must never stand between the workout and the
     save. */
  try{ coachMeasure(); coachRun(false); }catch(e){ if(window.console) console.error("coach:",e); }
  writeNow();
  /* Still inside the tap on "Save workout", which is the whole trick: a
     download needs user activation, and finishing a workout is the one moment
     that reliably has it AND is exactly when the log is worth keeping. No
     extra tap, no remembering. */
  var auto=autoBackup();
  gistBackupNow();                    // a finished workout is not left to the debounce
  closeSheet(); go("progress");
  toast(auto?"Workout saved · backup written":"Workout saved");
}
/* Returns whether a file was actually written, so we don't claim one was. */
function autoBackup(){
  if(!S.settings.autoBackup) return false;
  try{
    downloadBackup(payload(),true);
    return true;
  }catch(e){ return false; }
}

self.__ilf=(self.__ilf||0)+1;
