"use strict";
/* ============================ GitHub backup ============================ */
/* The token and gist id live under their own key and never in S, so they
   can't reach the export file, the gist content or a backup. */
var GIST_KEY="ironlog.gist", GIST_FILE="ironlog.json", GIST_DELAY=30000;
var BEFORE_KEY="ironlog.v1.before-restore";
var gistMem=null, gistTimer=null, gistQueue=Promise.resolve();
var storageKept=null;                 // true/false as the browser reports it; null = not said

function gistLoad(){
  if(gistMem) return gistMem;
  var g=null;
  try{ g=JSON.parse(localStorage.getItem(GIST_KEY)||"null"); }
  catch(e){ /* unreadable or blocked storage: behave as if not set up */ }
  return (g&&typeof g==="object")?g:{};
}
/* Returns false when the browser refuses the write; the record then lives in
   memory for this visit only, and the caller says so where it matters. */
function gistStore(g){
  try{ localStorage.setItem(GIST_KEY,JSON.stringify(g)); gistMem=null; return true; }
  catch(e){ gistMem=g; return false; }
}
function gistPatch(fields){
  var g=gistLoad();
  Object.keys(fields).forEach(function(k){ g[k]=fields[k]; });
  gistStore(g);
  return g;
}

/* Called from writeNow(), so every save path is covered without each one
   knowing GitHub exists. Marks the gist stale now and sends it GIST_DELAY on.
   gistGen counts changes in memory: a push notes it when it reads the log, and
   clears `dirty` on success only if nothing changed while it was uploading. */
var gistGen=0;
function gistChanged(){
  gistGen++;
  var g=gistLoad();
  if(!g.token) return;
  if(!g.dirty) gistPatch({dirty:true});
  clearTimeout(gistTimer);
  gistTimer=setTimeout(gistBackupNow,GIST_DELAY);
}

/* Pushes are queued so two never race to create two gists, and each one
   reads the log when it starts, so the last one sent is the newest state. */
function gistBackupNow(opts){
  clearTimeout(gistTimer); gistTimer=null;
  if(!gistLoad().token) return Promise.resolve();
  gistQueue=gistQueue.then(function(){ return gistPush(opts); }).catch(function(err){
    gistPatch({dirty:true, lastError:"Backup failed: "+(err&&err.message||"unknown error")+"."});
    gistPaint();
  });
  return gistQueue;
}
function gistNewBody(files){
  return {description:"Iron Log backup", public:false, files:files};
}
/* No gist id in this browser does NOT mean no backup exists: a new phone, or
   a cleared browser, with the token pasted back in. Creating a gist there
   would put a near-empty log on top as the newest backup, and Restore — which
   picks the newest — would then offer the empty one. So look first. Adopt an
   existing backup only when this phone holds at least as many sessions;
   otherwise stop and ask for a restore. Nothing is ever lost (GitHub keeps
   every revision), but this keeps the obvious button pointing at the right
   log. */
function gistTarget(g,mine){
  if(g.gistId) return Promise.resolve(g.gistId);
  return gistFind().then(function(id){
    return gistReq("GET","/gists/"+encodeURIComponent(id)).then(function(gist){
      return gistFileText(gist).then(function(text){
        var n=0;
        try{ var p=JSON.parse(text); n=(p&&Array.isArray(p.sessions))?p.sessions.length:0; }
        catch(e){ n=0; }                  // unreadable: nothing in it worth protecting
        if(n>mine)
          throw gistFail("GitHub already has a backup with "+plural(n,"session")+
            ", more than this phone. Restore it first so it isn't buried.");
        gistPatch({gistId:id, pushedSessions:n});   // what it holds, until this push lands
        return id;
      });
    });
  },function(err){
    if(err&&err.none) return "";          // genuinely no backup yet: create one
    throw err;
  });
}
/* The log as saved, not this window's copy of it: after another window has
   saved (see otherWrote()), the stored log is the newest one there is. A save
   still waiting on its 120 ms debounce goes in first. */
function gistLog(){
  flush();
  if(storageOK){
    try{
      var p=JSON.parse(localStorage.getItem(KEY)||"null");
      if(p&&typeof p==="object"&&Array.isArray(p.sessions)) return p;
    }catch(e){ /* unreadable: fall back to what this window holds, below */ }
  }
  return S;
}
/* Never put a log holding fewer sessions than the last successful push over
   the backup without asking. Erase everything did exactly that 30 s after the
   wipe, and an empty log became the newest backup — the one Restore offers.
   Only "Back up now", confirmed (gistNowTap), passes {force:true}. */
function gistSessionsMoved(d){
  var g=gistLoad();
  if(g.pushedSessions===undefined||g.pushedSessions===null) return;
  gistPatch({pushedSessions:Math.max(0,num(g.pushedSessions)+d)});
}
/* Backups that have stopped are said where he looks, not only in Settings. */
function gistPausedBanner(){
  var g=gistLoad();
  if(!g.token||!g.dirty||!g.lastError) return "";
  return '<div class="banner warn"><div class="bt">GitHub backup paused</div>'+
    '<div class="bd">'+esc(g.lastError)+'</div>'+
    '<div class="acts"><button class="btn sm ghost" data-act="settings">Open Settings</button></div></div>';
}
function gistPush(opts){
  var g=gistLoad();
  if(!g.token) return Promise.resolve();
  var log=gistLog(), mine=log.sessions.length, theirs=num(g.pushedSessions);
  var gen=gistGen;                        // flush() above may have bumped it; this push covers that
  clearTimeout(gistTimer); gistTimer=null;
  if(mine<theirs&&!(opts&&opts.force)){
    gistPatch({dirty:true, lastError:"This log has fewer sessions than your GitHub backup ("+mine+" vs "+theirs+
      "). Restore it, or tap Back up now to replace it."});
    gistPaint();
    return Promise.resolve();
  }
  var files={}; files[GIST_FILE]={content:JSON.stringify(log,null,2)};
  var sent=gistTarget(g,mine).then(function(id){
    if(!id) return gistReq("POST","/gists",gistNewBody(files));
    return gistReq("PATCH","/gists/"+encodeURIComponent(id),{files:files}).catch(function(err){
      if(err.status!==404) throw err;
      /* Deleted on GitHub: start again, once. The old id is no longer useful. */
      gistPatch({gistId:""});
      return gistReq("POST","/gists",gistNewBody(files));
    });
  });
  return sent.then(function(res){
    /* A change made while this was uploading is not in it, so it is still
       waiting: keep dirty and make sure another push is coming. */
    var behind=gistGen!==gen;
    gistPatch({gistId:res.id, lastSync:Date.now(), lastError:"", dirty:behind, pushedSessions:mine});
    if(behind&&!gistTimer) gistTimer=setTimeout(gistBackupNow,GIST_DELAY);
    gistPaint();
  },function(err){
    gistPatch({dirty:true, lastError:gistErrText(err)});
    gistPaint();
  });
}

function gistReq(method,path,body){
  var g=gistLoad();
  var init={method:method, cache:"no-store", headers:{
    "Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "Authorization":"Bearer "+g.token}};
  if(body){ init.headers["Content-Type"]="application/json"; init.body=JSON.stringify(body); }
  return fetch("https://api.github.com"+path,init).then(function(res){
    return res.text().then(function(text){
      if(!res.ok){ var err=new Error("HTTP "+res.status); err.status=res.status; throw err; }
      if(!text) return null;
      try{ return JSON.parse(text); }
      catch(e){ throw gistFail("GitHub sent back something unreadable."); }
    });
  },function(){
    var err=new Error("network"); err.status=0; throw err;
  });
}
function gistFail(msg){ var e=new Error(msg); e.userMsg=msg; return e; }
function gistErrText(err){
  if(err&&err.userMsg) return err.userMsg;
  var s=err&&err.status;
  if(s===0) return "Couldn't reach GitHub. Will retry when you're back online.";
  if(s===401||s===403) return "GitHub rejected the token. It is invalid or lacks gist permission.";
  if(s===404) return "The backup gist was not found on GitHub.";
  if(s) return "GitHub returned an error ("+s+"). Will retry on the next change.";
  return "Backup failed: "+(err&&err.message||"unknown error")+".";
}

/* Status text is written into the node directly. A backup never re-renders
   the screen, so it can finish while you are still looking at it. */
function gistStatusText(){
  var g=gistLoad();
  if(!g.token) return "Not set up. Save a token to start.";
  if(g.lastError) return "Not backed up: "+g.lastError;
  if(g.dirty) return "Changes waiting to be backed up.";
  if(g.lastSync) return "Last backed up "+relDate(g.lastSync)+" at "+
    new Date(g.lastSync).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})+".";
  return "Token saved. Nothing backed up yet.";
}
function gistPaint(){ var el=document.getElementById("gist-status"); if(el) el.textContent=gistStatusText(); }
function paintStorage(){ var el=document.getElementById("storage-status"); if(el) el.textContent=storageLine(); }

function gistSettingsHtml(){
  var g=gistLoad(), h='';
  h+='<div class="field-row" style="display:block"><div class="fl">Copy to a private GitHub gist'+
    '<div class="fh">Every change is copied to one private gist on your account, and GitHub keeps each earlier version. '+
    'Needs a classic token with only the gist scope, or a fine-grained token with Account permissions → Gists set to read and write.</div></div>';
  if(g.token){
    h+='<div class="row" style="gap:8px;margin-top:8px"><span class="tiny" style="flex:1">Token saved</span>'+
      '<button class="btn sm ghost" data-act="gist-remove">Remove</button></div>';
  } else {
    h+='<div class="row" style="gap:8px;margin-top:8px"><input class="txt" type="password" autocomplete="off" '+
      'autocapitalize="off" spellcheck="false" placeholder="Paste token" data-gist="token" style="flex:1">'+
      '<button class="btn sm primary" data-act="gist-save">Save</button></div>';
  }
  h+='<div class="tiny muted" id="gist-status" style="margin-top:8px">'+esc(gistStatusText())+'</div></div>';
  h+='<div class="row" style="gap:8px">'+
    '<button class="btn" style="flex:1" data-act="gist-now">Back up now</button>'+
    '<button class="btn" style="flex:1" data-act="gist-restore">Restore from GitHub</button></div>';
  if(beforeRestoreKept())
    h+='<button class="btn block" data-act="put-back">Put back the log from before the restore</button>';
  return h;
}

/* Returns true when a token was stored, so the caller re-renders the row. */
function gistSaveToken(){
  var el=$('[data-gist="token"]');
  var t=el?String(el.value||"").trim():"";
  if(!t){ toast("Paste a token first"); return false; }
  if(/\s/.test(t)){ toast("That doesn't look like a token"); return false; }
  var g=gistLoad();
  g.token=t; g.dirty=true; g.lastError="";        // nothing is in the gist yet
  gistStore(g);
  toast("Token saved");
  return true;
}
function gistRemoveToken(){
  var g=gistLoad();
  clearTimeout(gistTimer); gistTimer=null;
  /* Keep the gist id, and what it holds, so a re-added token resumes it. */
  gistStore(g.gistId?{gistId:g.gistId, pushedSessions:g.pushedSessions}:{});
  toast("Token removed from this browser");
}
/* Erase everything stops backing up to the gist instead of emptying it: the
   id, its session count and anything waiting are dropped, the token is kept.
   A later backup then has to find the gist again, and gistTarget() won't put
   a smaller log over it — Restore from GitHub is how the log comes back. */
function gistDetach(){
  clearTimeout(gistTimer); gistTimer=null;
  var g=gistLoad();
  gistStore(g.token?{token:g.token, dirty:false, lastError:""}:{});
}
/* The one way past gistPush()'s fewer-sessions guard: asked, by name, with
   both counts in front of you. */
function gistNowTap(){
  var g=gistLoad();
  if(!g.token){ toast("Save a token first"); return; }
  function run(opts){
    gistBackupNow(opts).then(function(){
      var g2=gistLoad();
      toast(g2.dirty?(g2.lastError||"Backup didn't finish"):"Backed up to GitHub");
    });
  }
  var mine=gistLog().sessions.length, theirs=num(g.pushedSessions);
  if(mine<theirs){
    confirmSheet("Replace your GitHub backup?",
      "This log has "+plural(mine,"session")+" and your GitHub backup has "+plural(theirs,"session")+
      ". Backing up now replaces the backup with this log. GitHub keeps the old one in the gist's revision history, "+
      "but Restore only offers the newest. To get the backup's sessions onto this phone instead, use Restore from GitHub.",
      "Replace backup",function(){ run({force:true}); },true);
    return;
  }
  run();
}

/* Finds the most recently updated gist holding a backup, for when the token is
   known but the id isn't (a fresh install, or a second phone). */
function gistFind(){
  return gistReq("GET","/gists?per_page=100").then(function(list){
    var hits=(Array.isArray(list)?list:[]).filter(function(x){ return x&&x.files&&x.files[GIST_FILE]; });
    hits.sort(function(a,b){ return String(b.updated_at).localeCompare(String(a.updated_at)); });
    if(!hits.length){
      var e=gistFail("No Iron Log backup was found in this account's gists.");
      e.none=true; throw e;
    }
    return hits[0].id;
  });
}
function gistFileText(gist){
  var f=gist&&gist.files&&gist.files[GIST_FILE];
  if(!f) return Promise.reject(gistFail("That gist has no "+GIST_FILE+" in it."));
  if(!f.truncated) return Promise.resolve(String(f.content||""));
  /* Large files come back truncated. The raw URL is fetched without the token,
     so the token never goes to a second host. */
  return fetch(f.raw_url,{cache:"no-store"}).then(function(res){
    if(!res.ok) throw gistFail("Couldn't download the full backup (HTTP "+res.status+").");
    return res.text();
  },function(){ throw gistFail("Couldn't reach GitHub. Try again when you're online."); });
}
/* Restore and file import both replace S wholesale, S.active included, so
   mid-workout they would silently drop the sets logged so far. Same rule and
   words as the plan switch. */
function refuseMidWorkout(){
  if(!S.active) return false;
  toast("Finish or discard the workout first");
  return true;
}
function gistRestore(){
  var g=gistLoad();
  if(!g.token){ toast("Save a token first"); return; }
  if(refuseMidWorkout()) return;
  toast("Fetching your backup…");
  var have=g.gistId?Promise.resolve(g.gistId):gistFind();
  have.then(function(id){
    return gistReq("GET","/gists/"+encodeURIComponent(id)).then(function(gist){
      if(!g.gistId) gistPatch({gistId:id});
      return gistFileText(gist).then(function(text){ return {gist:gist, text:text}; });
    });
  }).then(function(r){
    var parsed;
    try{ parsed=JSON.parse(r.text); }
    catch(e){ throw gistFail("That backup isn't valid Iron Log JSON."); }
    if(!parsed||!Array.isArray(parsed.routines)||!Array.isArray(parsed.sessions))
      throw gistFail("That backup is missing routines or sessions.");
    confirmRestore(parsed,r.gist);
  }).catch(function(err){ toast(gistErrText(err)); });
}
function confirmRestore(parsed,gist){
  var when="", ts=gist?Date.parse(gist.updated_at):NaN;
  if(isFinite(ts)) when=" (saved "+shortDate(ts)+")";
  confirmSheet("Restore from GitHub?",
    "The backup"+when+" has "+plural(parsed.sessions.length,"session")+". This phone has "+
    plural(S.sessions.length,"session")+". Restoring replaces everything on this phone with the backup. "+
    "A copy of what's on this phone now is kept on the phone, in case you need it back.",
    "Restore",function(){ applyRestore(parsed); },true);
}
function applyRestore(parsed){
  if(refuseMidWorkout()) return;
  /* Keep what's there first. If that copy can't be made, nothing is replaced. */
  try{ localStorage.setItem(BEFORE_KEY,JSON.stringify(S)); }
  catch(e){ toast("Couldn't keep a copy of this log, so nothing was restored"); return; }
  try{ replaceLog(parsed); }
  catch(e){ toast("That backup couldn't be read, so nothing was restored"); return; }
  gistPatch({pushedSessions:parsed.sessions.length});   // the gist holds exactly this log
  go("today"); toast("Restored from GitHub");
}

/* The copy applyRestore() keeps, offered back from Settings while it exists. */
function beforeRestoreKept(){
  try{ return !!localStorage.getItem(BEFORE_KEY); }
  catch(e){ return false; }               // storage blocked: there is nothing to offer
}
function putBackBeforeRestore(){
  if(refuseMidWorkout()) return;
  var kept=null;
  try{ kept=JSON.parse(localStorage.getItem(BEFORE_KEY)||"null"); }
  catch(e){ kept=null; }
  if(!kept||typeof kept!=="object"||!Array.isArray(kept.sessions)){
    toast("The kept log couldn't be read, so nothing was changed"); return;
  }
  confirmSheet("Put back the log from before the restore?",
    "The log kept from before the restore has "+plural(kept.sessions.length,"session")+". This phone has "+
    plural(S.sessions.length,"session")+" now. Putting it back replaces everything on this phone with the kept log.",
    "Put it back",function(){
      if(refuseMidWorkout()) return;
      try{ replaceLog(kept); }
      catch(e){ toast("The kept log couldn't be read, so nothing was changed"); return; }
      try{ localStorage.removeItem(BEFORE_KEY); }
      catch(e){ toast("Put back, but the kept copy couldn't be removed"); go("today"); return; }
      go("today"); toast("The log from before the restore is back");
    },true);
}

/* ============================ AI (optional) ============================
   The one door to Claude, shared by the coach's check-in (v26/v27) and the
   form check (v28). Off until a key is saved. Talks the Messages API either
   to Anthropic directly or to any proxy that speaks it (LiteLLM's
   /v1/messages): the base URL is the only difference. A Claude.ai
   subscription can't be used from here — that needs API credits, directly
   or behind the proxy.

   The key, proxy URL and model live under their own key and never in S, so
   they can't reach a backup, an export or the gist (like the GitHub token).
   The official SDK is loaded only when an AI feature is used, pinned:
   1.3.0 (23 Oct 2026). The service worker only caches same-origin requests,
   so it never caches the SDK or a response.

   aiCall({system, content, schema, maxTokens, effort}) → {text, json, usage, model}
   rejects with an Error whose .userMsg is fit to show. With a schema, the
   reply is constrained to it (output_config.format) and parsed. */
var AI_KEY="ironlog.ai", AI_SDK="https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";
var AI_DEFAULT_MODEL="claude-opus-5-5";
var aiClientP=null, aiClientFor="";
function aiLoad(){
  var g=null;
  try{ g=JSON.parse(localStorage.getItem(AI_KEY)||"null"); }
  catch(e){ /* unreadable or blocked storage: behave as if not set up */ }
  return (g&&typeof g==="object")?g:{};
}
function aiStore(c){
  try{ localStorage.setItem(AI_KEY,JSON.stringify(c)); return true; }
  catch(e){ toast("Couldn't save the AI settings in this browser"); return false; }
}
function aiReady(){ return !!aiLoad().key; }
function aiModel(){ return aiLoad().model||AI_DEFAULT_MODEL; }
function aiFail(msg){ var e=new Error(msg); e.userMsg=msg; return e; }
function aiErr(err){
  if(err&&err.userMsg) return err;
  var st=err&&err.status;
  if(st===401||st===403) return aiFail("The key was rejected — check it in Settings → AI coach.");
  if(st===429) return aiFail("Too many requests, or the account is out of credit. Try again later.");
  if(st===404) return aiFail("The model or address wasn't found — check the model name and proxy URL.");
  if(st) return aiFail("Claude's service returned an error ("+st+"). Try again later.");
  return aiFail("Couldn't reach "+(aiLoad().base?"your proxy":"Claude")+". Check the connection"+(aiLoad().base?" and that the proxy allows this site (CORS).":"."));
}
function aiClient(){
  var c=aiLoad(), sig=(c.base||"")+"|"+(c.key||"");
  if(aiClientP&&aiClientFor===sig) return aiClientP;
  aiClientFor=sig;
  aiClientP=import(AI_SDK).then(function(m){
    var Anthropic=m.default||m.Anthropic;
    /* The key sits on this phone and is visible to it — acceptable for an app
       with one user, and exactly what the SDK's browser flag acknowledges. */
    var o={apiKey:c.key, dangerouslyAllowBrowser:true, maxRetries:1};
    if(c.base) o.baseURL=String(c.base).replace(/\/+$/,"");
    return new Anthropic(o);
  },function(){ aiClientP=null; throw aiFail("Couldn't load the Claude library — check the connection."); });
  return aiClientP;
}
function aiCall(o){
  var c=aiLoad();
  if(!c.key) return Promise.reject(aiFail("Add an API key in Settings → AI coach first."));
  var req={model:aiModel(), max_tokens:o.maxTokens||16000, messages:[{role:"user", content:o.content}],
           output_config:{effort:o.effort||"medium"}};
  if(o.system) req.system=o.system;
  if(o.schema) req.output_config.format={type:"json_schema", schema:o.schema};
  return aiClient().then(function(cl){
    /* Straight to Anthropic: server-side refusal fallback, so a request a
       safety classifier declines is retried on a suitable model in the same
       call. A proxy may not pass beta parameters through, so not there. */
    if(!c.base) return cl.beta.messages.create(Object.assign({betas:["server-side-fallback-2026-07-01"], fallbacks:"default"},req));
    return cl.messages.create(req);
  }).then(function(r){
    if(r.stop_reason==="refusal") throw aiFail("Claude declined that request.");
    if(r.stop_reason==="max_tokens") throw aiFail("The answer was cut off — try again.");
    var text=(r.content||[]).filter(function(b){ return b.type==="text"; }).map(function(b){ return b.text; }).join("");
    var json=null;
    if(o.schema){
      try{ json=JSON.parse(text); }
      catch(e){ throw aiFail("The answer didn't come back in the expected shape — try again."); }
    }
    return {text:text, json:json, usage:r.usage||null, model:r.model||aiModel()};
  },function(err){ throw aiErr(err); });
}
function aiSettingsHtml(){
  var c=aiLoad(), h='<div class="field-row" style="display:block"><div class="fl">Claude, for the coach\'s check-in and form checks'+
    '<div class="fh">Optional, and off until a key is saved. Uses an Anthropic API key (API credits — a Claude.ai subscription can\'t be used here), '+
    'either straight to Anthropic or through your own proxy such as LiteLLM; a proxy must allow this site (CORS). '+
    'The key stays on this phone and is never in a backup or export.</div></div>';
  if(c.key){
    h+='<div class="row" style="gap:8px;margin-top:8px"><span class="tiny" style="flex:1">Key saved · '+esc(c.base?"via "+c.base:"Anthropic direct")+
      ' · '+esc(aiModel())+'</span><button class="btn sm ghost" data-act="ai-remove">Remove</button></div>'+
      '<div class="row" style="gap:8px;margin-top:8px"><button class="btn sm" data-act="ai-test">Test the connection</button></div>';
  } else {
    h+='<input class="txt" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="API key (or proxy key)" data-ai="key" style="width:100%;margin-top:8px">'+
      '<input class="txt" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Proxy URL (blank = Anthropic)" data-ai="base" style="width:100%;margin-top:8px">'+
      '<input class="txt" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Model ('+AI_DEFAULT_MODEL+')" data-ai="model" style="width:100%;margin-top:8px">'+
      '<div class="row" style="gap:8px;margin-top:8px"><button class="btn sm primary" data-act="ai-save">Save</button></div>';
  }
  h+='<div class="tiny muted" id="ai-status" style="margin-top:8px"></div></div>';
  return h;
}
function aiSaveTap(){
  var k=($('[data-ai="key"]')||{}).value||"", b=($('[data-ai="base"]')||{}).value||"", m=($('[data-ai="model"]')||{}).value||"";
  k=k.trim(); b=b.trim(); m=m.trim();
  if(!k){ toast("Paste a key first"); return false; }
  if(b&&!/^https:\/\//i.test(b)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(b)){ toast("The proxy URL should start with https://"); return false; }
  if(!aiStore({key:k, base:b, model:m})) return false;
  aiClientP=null;
  toast("Saved");
  return true;
}
function aiTestTap(){
  var el=document.getElementById("ai-status");
  if(el) el.textContent="Testing…";
  aiCall({content:"Reply with the word OK.", maxTokens:2000, effort:"low"}).then(function(r){
    if(el) el.textContent="Connected — "+r.model+" answered.";
  },function(err){ if(el) el.textContent=err.userMsg||"That didn't work."; });
}

/* ============================ storage ============================ */
function storageLine(){
  if(storageKept===true) return "Storage: kept by the browser";
  if(storageKept===false) return "Storage: the browser may clear this if space runs low";
  return "Storage: this browser doesn't say whether it keeps the log";
}
/* Asked once per load. A missing API or a refusal is reported on the line,
   never thrown at the user. */
function askPersist(){
  if(!(navigator.storage&&navigator.storage.persisted)) return;
  Promise.resolve()
    .then(function(){ return navigator.storage.persisted(); })
    .then(function(kept){ return kept?true:navigator.storage.persist(); })
    .then(function(kept){ storageKept=!!kept; },function(){ storageKept=null; })
    .then(paintStorage);
}

/* ============================ recommended plan ============================
   Nick's own lifts, repacked to fit the ~45 minutes his logs show a session
   really lasts. As written, Day A was 21 straight sets at 180 s rest, about
   80 min; he stopped after three exercises on three of the four times he ran
   it as written, and the lifts at the end of each day were the ones that
   never got done. So:
   one main lift, then three supersets (`link`), 120 s rest. Lateral Raise is
   12–20 everywhere so its slots agree. Face Pull is out — no variation ever
   felt right, and it was skipped every time after 9 Aug — and Rear Delt Fly
   takes the slot; rows on all three days cover the upper back regardless.

   Switching keeps every logged session and keeps the plan it replaces in
   S.planBackup (so it travels in backups and the gist), which makes
   "Switch back" one tap. Plan rows go through newPlanEx() (trap 13), and
   carry over the old row's increment, bar, load type and muscle tags. */
var REC_PLAN={
  name:"3-day full body, about 45 min",
  rest:120,
  days:{
    A:[["Leg Press",8,12],["Incline DB Press",8,12],["Cable Row",8,12,1],
       ["Hamstring Curls",8,12],["Lateral Raise",12,20,1],["DB Curl",8,12],["Tricep Pushdown",10,15,1]],
    B:[["Bulgarian Split Squat",8,11],["DB Overhead Press",8,12],["Lat Pulldown",8,12,1],
       ["Leg Extension",10,15],["Lateral Raise",12,20,1],["DB Curl",8,12],["Tricep Pushdown",10,15,1]],
    /* Day C pairs hams with side delts and the chest fly with the rear delt
       fly (opposite movements). It used to superset Lateral Raise straight
       into Rear Delt Fly — two shoulder lifts back to back (external review,
       Argon). recFixDayC() offers the same order to a plan already switched. */
    C:[["RDL",6,10],["Flat DB Press",8,12],["DB Row",8,12,1],
       ["Hamstring Curls",8,12],["Lateral Raise",12,20,1],["Low to high cable fly",12,16],["Rear Delt Fly",12,20,1]]
  }
};
/* Fixed in the history on switching, so the plan's lifts join what was
   already logged under a typo or a second spelling. */
var REC_RENAME={"lateral riase":"Lateral Raise","facepull":"Face Pull","face pull":"Face Pull"};

function renameHistory(map){
  var n=0;
  function fix(e){ var k=normName(e.name); if(map[k]&&e.name!==map[k]){ e.name=map[k]; n++; } }
  S.sessions.forEach(function(x){ x.exercises.forEach(fix); });
  eachPlanEx(fix);
  return n;
}
function recPlanEx(spec,old){
  var e=newPlanEx(spec[0]), o=old[normName(spec[0])];
  if(o) ["inc","bar","bw","metric","mg","mg2"].forEach(function(k){
    if(o[k]!==undefined) e[k]=Array.isArray(o[k])?o[k].slice():o[k];
  });
  e.sets=3; e.reps=spec[1]; e.repTop=spec[2]; e.link=!!spec[3];
  return e;
}
/* A plan switched before the Day C fix still has Lateral Raise superset into
   Rear Delt Fly. Offer the new order once, by reordering the rows he already
   has (ids, increments and history untouched) and setting the links. */
function recDayCRows(){
  var r=S.routines.find(function(x){ return x.key==="C"; });
  var v=r&&variantsOf(r)[0];
  return v?v.exercises:null;
}
function recDayCNeedsFix(){
  var ex=recDayCRows(); if(!ex) return false;
  var i=ex.findIndex(function(e){ return normName(e.name)==="lateral raise"; });
  return i>=0&&ex[i+1]&&normName(ex[i+1].name)==="rear delt fly"&&!!ex[i+1].link;
}
function recFixDayC(){
  var ex=recDayCRows(); if(!ex) return false;
  var spec=REC_PLAN.days.C, out=[], used={};
  spec.forEach(function(sp){
    var j=ex.findIndex(function(e,k){ return !used[k]&&normName(e.name)===normName(sp[0]); });
    if(j<0) return;
    used[j]=1; ex[j].link=!!sp[3]; out.push(ex[j]);
  });
  ex.forEach(function(e,k){ if(!used[k]){ e.link=false; out.push(e); } });
  if(out.length) out[0].link=false;
  var r=S.routines.find(function(x){ return x.key==="C"; });
  variantsOf(r)[0].exercises=out;
  writeNow();
  return true;
}

function recDayText(key){
  var out=[];
  REC_PLAN.days[key].forEach(function(sp){
    if(sp[3]&&out.length) out[out.length-1]+=" + "+sp[0]; else out.push(sp[0]);
  });
  return out.join(" · ");
}
function switchToRecPlan(){
  var before={ts:Date.now(), rest:S.settings.rest, routines:JSON.parse(JSON.stringify(S.routines))};
  renameHistory(REC_RENAME);
  var old={};
  eachPlanEx(function(e){ var k=normName(e.name); if(!old[k]) old[k]=e; });
  Object.keys(REC_PLAN.days).forEach(function(key){
    var ex=REC_PLAN.days[key].map(function(sp){ return recPlanEx(sp,old); });
    var r=S.routines.find(function(x){ return x.key===key; });
    var v=newVariant("",ex);
    if(r){
      /* Keep the routine and its first week's id, so the A → B → C rotation
         carries on from the last session rather than restarting. */
      var v0=variantsOf(r)[0]; if(v0) v.id=v0.id;
      r.variants=[v];
    } else S.routines.push({id:uid(), key:key, name:"Day "+key, variants:[v]});
  });
  S.settings.rest=REC_PLAN.rest;
  S.planBackup=before;
  recomputePRs();                                 // names changed (trap 8)
  writeNow();                                     // a plan change lands now, not on the debounce
}
function switchBackPlan(){
  var b=S.planBackup; if(!b) return;
  S.routines=b.routines;
  S.settings.rest=b.rest;
  delete S.planBackup;
  renameHistory(REC_RENAME);                      // the restored rows use the fixed names too
  recomputePRs();
  writeNow();
}
function planSettingsHtml(){
  var b=S.planBackup, h='<div class="field-row" style="display:block">';
  if(b){
    h+='<div class="fl">On the recommended plan<div class="fh">Switched '+esc(shortDate(b.ts))+
      '. Your previous plan is kept: switching back restores it and its '+esc(String(b.rest))+
      ' s rest. Logged sessions are never touched either way.</div></div></div>'+
      (recDayCNeedsFix()?'<div class="tiny" style="margin:8px 0">Day C supersets Lateral Raise straight into Rear Delt Fly — two shoulder lifts back to back. '+
        'The fix pairs Hamstring Curls with Lateral Raise, and the cable fly with Rear Delt Fly.</div>'+
        '<button class="btn primary block" data-act="plan-fixc" style="margin-bottom:8px">Re-pair Day C</button>':"")+
      '<button class="btn block" data-act="plan-back">Switch back to my previous plan</button>';
  } else {
    h+='<div class="fl">Recommended: '+esc(REC_PLAN.name)+
      '<div class="fh">Your own lifts, repacked to fit about 45 minutes: one main lift, then three supersets, '+
      REC_PLAN.rest+' s rest. Face pulls are swapped for rear delt flies. Every logged session is kept.</div></div>';
    Object.keys(REC_PLAN.days).forEach(function(k){
      h+='<div class="tiny" style="margin-top:6px"><b>'+k+'</b> '+esc(recDayText(k))+'</div>';
    });
    h+='</div><button class="btn primary block" data-act="plan-rec">Switch to it</button>';
  }
  return h;
}

self.__ilf=(self.__ilf||0)+1;
