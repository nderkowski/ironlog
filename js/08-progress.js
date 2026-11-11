"use strict";
/* ============================ PROGRESS ============================ */
function viewProgress(){
  var v=$("#view");
  var tw=weekBounds(0), lw=weekBounds(1);
  var a=volumeInRange(tw.start,tw.end), b=volumeInRange(lw.start,lw.end);
  var delta=b.v?((a.v-b.v)/b.v*100):0;
  var html='<div class="eyebrow">Trends</div><h1 class="view-title">Progress</h1>';

  if(!S.sessions.length){
    v.innerHTML=html+'<div class="card"><div class="empty">Nothing logged yet.<br>Finish a session and the numbers show up here.</div></div>';
    return;
  }

  if(inDeloadWeek()){
    html+='<div class="banner info" style="margin-bottom:12px"><div class="bt">Deload week running</div>'+
      '<div class="bd">Through '+esc(shortDate(S.settings.deloadUntil))+'. Sessions logged now are excluded from every trend below.</div>'+
      '<div class="acts"><button class="btn sm ghost" data-act="end-deload">End it now</button></div></div>';
  }
  var d=deloadCheck();
  if(d){
    html+='<div class="banner '+(d.level==="high"?"warn":"info")+'" style="margin-bottom:12px">'+
      '<div class="bt">'+(d.level==="high"?"Time to deload":"Keep an eye on this")+'</div>'+
      '<div class="bd">'+d.stalled.length+' of '+d.judged+' tracked lifts aren\'t climbing: '+
      esc(d.stalled.slice(0,4).map(function(x){return x.name;}).join(", "))+
      (d.level==="high"?'. A week at ~60% volume usually clears it.':'. Not urgent yet.')+'</div>'+
      (d.level==="high"?'<div class="acts"><button class="btn sm primary" data-act="start-deload">Start deload week</button>'+
        '<button class="btn sm ghost" data-act="snooze-deload">Not now</button></div>':"")+
    '</div>';
  } else if(!inDeloadWeek()){
    /* Silence is indistinguishable from "nothing to report", and this check
       needs six sessions of a lift before it has an opinion — a fortnightly
       week-variant lift can take a quarter of a year to qualify. Say what is
       being watched rather than saying nothing (trap 14's lesson, applied to
       a feature with no switch at all). */
    var ds=deloadStatus();
    if(ds.tracked){
      html+='<div class="tiny muted" style="margin:-4px 0 12px">Deload check: watching '+
        ds.judged.length+' of '+plural(ds.tracked,"tracked lift")+
        (ds.waiting?', '+ds.waiting+' still short of 6 sessions':"")+
        (ds.wide.length?', '+plural(ds.wide.length,"rep range")+' too wide to judge':"")+
        (Date.now()<(S.settings.deloadSnooze||0)?' · snoozed':"")+'.</div>';
    }
  }

  html+='<div class="statgrid" style="margin-bottom:12px">'+
    '<div class="stat"><div class="v">'+a.n+'</div><div class="l">Sessions wk</div></div>'+
    '<div class="stat"><div class="v">'+kfmt(a.v)+'</div><div class="l">Volume '+unit()+'</div></div>'+
    '<div class="stat"><div class="v" style="color:'+(delta>=0?"var(--good)":"var(--bad)")+'">'+
      (b.v?(delta>=0?"+":"")+Math.round(delta)+"%":"—")+'</div><div class="l">vs last wk</div></div>'+
  '</div>';

  html+=coachSection();
  html+=weeklySetsCard();
  html+=sinceStartCard();

  var names=trackedLifts();
  allExerciseNames().forEach(function(x){ if(names.indexOf(x.name)<0) names.push(x.name); });
  var withData=names.filter(function(n){ return exSessions(n).length>0; });

  html+='<div class="card" style="padding:0;margin-bottom:12px">';
  if(!withData.length) html+='<div class="empty">No lift history yet.</div>';
  else withData.forEach(function(n,i){
    var h=exSessions(n), t=trend(n);
    var top=h[0].sets.reduce(function(x,y){ return setScore(y,h[0].metric)>setScore(x,h[0].metric)?y:x; });
    html+='<button class="plift" data-lift="'+esc(n)+'">'+
      '<div class="pt"><div class="pn">'+esc(n)+'</div>'+
      '<div class="ps">'+entryText(top,h[0].bw)+' '+metricJoin(h[0].metric)+' '+num(top.r)+metricSuffix(h[0].metric)+' · '+relDate(h[0].ts)+'</div></div>'+
      '<canvas data-spark="'+i+'"></canvas>'+
      '<span class="chip '+(t.state==="up"?"good":t.state==="down"?"bad":"")+' mono" style="font-size:11px">'+
        (t.state==="new"?(t.n+"/4"):(t.pct>=0?"+":"")+t.pct.toFixed(1)+"%")+'</span>'+
    '</button>';
  });
  html+='</div>';

  html+=prCard();
  html+=calendarCard();

  html+='<div class="eyebrow" style="margin-bottom:7px">History</div>'+
    '<div class="tiny muted" style="margin-bottom:7px">Tap any session to fix or add sets.</div>'+
    '<div class="card" style="padding:0">';
  S.sessions.slice(0,25).forEach(function(s){
    var vol=0,sets=0;
    s.exercises.forEach(function(e){ vol+=exVolume(e); sets+=working(e.sets).length; });
    html+='<button class="sess" data-sess="'+s.id+'">'+
      '<span class="sd">'+esc(shortDate(s.ts))+'</span>'+
      '<span class="sn">'+esc(s.name)+(s.deload?' <span class="chip tag">DELOAD</span>':"")+'</span>'+
      '<span class="sv">'+(s.unlogged?'not logged':plural(sets,"set")+' · '+kfmt(vol))+'</span></button>';
  });
  html+='</div>';

  v.innerHTML=html;
  withData.forEach(function(n,i){
    var c=v.querySelector('canvas[data-spark="'+i+'"]');
    if(c) spark(c,exSessions(n).map(sessionTopScore).reverse().slice(-12));
  });
}
/* ---- sets per rotation (2.0) ----
   The log is rotation-native: Iron Log trains a day at a time (A, B, C), not
   by the calendar, so "this week" split one rotation in two whenever it
   straddled a Monday. One rotation is the last N main days you actually logged
   (N = main days with at least one lift). Pump and freestyle sets inside that
   window count; deload and unlogged sessions don't, and an unlogged day does
   not use up one of the N. */
function rotationWindows(){
  var mains=S.routines.filter(balIsMainRoutine).filter(function(r){
    return variantsOf(r).some(function(v){ return v.exercises.length>0; });
  });
  var N=mains.length, isMain=balMainSessionFn();
  var sorted=S.sessions.slice().sort(function(a,b){ return b.ts-a.ts; });
  var M=sorted.filter(function(s){ return isMain(s)&&!s.unlogged&&!s.deload&&s.exercises.length>0; });
  var live=sorted.filter(function(s){ return !s.unlogged&&!s.deload; });
  var n=Math.max(1,N), full=M.length>=n;
  if(!M.length)                       // no main day logged: nothing counts as a rotation, so the empty state shows
    return {N:N, n:n, full:false, cur:[], prev:[], havePrev:false, keys:mains.map(function(r){ return r.key; })};
  var lo=M[Math.min(n,M.length)-1].ts;
  var cur=live.filter(function(s){ return s.ts>=lo; });
  var prev=[];
  if(M.length>=2*n){
    var plo=M[2*n-1].ts;
    prev=live.filter(function(s){ return s.ts>=plo&&s.ts<lo; });
  }
  return {N:N, n:n, full:full, cur:cur, prev:prev, havePrev:M.length>=2*n,
          keys:mains.map(function(r){ return r.key; })};
}
/* One muscle row: name, a bar on a track with the band shaded and ticked, the
   value. `state` is low/high/ok; a low or high value says so in words for
   screen readers and in an arrow for everyone else, not by colour alone. */
function bandRow(name,val,lo,hi,scale,o){
  o=o||{};
  var pct=function(x){ return (Math.max(0,Math.min(x,scale))/scale*100).toFixed(1); };
  var open=!isFinite(hi), hiE=open?scale:hi;
  var mark=o.state==="low"?'<span aria-hidden="true">↓</span><span class="vh"> low</span>'
          :o.state==="high"?'<span aria-hidden="true">↑</span><span class="vh"> high</span>':"";
  return '<div class="mrow'+(val?"":" zero")+(o.state==="indirect"?" ind":"")+(o.state==="low"||o.state==="high"?" off":"")+'">'+
    '<div class="mn">'+esc(name)+'</div>'+
    '<div class="track">'+
      (hiE>lo?'<div class="band" style="left:'+pct(lo)+'%;width:'+(pct(hiE)-pct(lo)).toFixed(1)+'%"></div>':"")+
      '<div class="now" style="width:'+pct(val)+'%"></div>'+
      (hiE>lo?'<div class="tick" style="left:'+pct(lo)+'%"></div>'+(open?"":'<div class="tick" style="left:'+pct(hi)+'%"></div>'):"")+
      (o.prev>0?'<div class="prev" style="left:'+pct(o.prev)+'%" title="previous rotation"></div>':"")+
    '</div>'+
    '<div class="mv">'+fmt(val)+mark+'</div>'+
  '</div>';
}
/* The hypertrophy number. The solid bar is this rotation, the dark line is the
   one before it, and the shaded stripe is the band for that muscle at the
   sessions a week the plan is built for. */
function weeklySetsCard(){
  var w=rotationWindows(), f=targetFreqOf(), ex=S.settings.excludedMuscles||[];
  var now=setsByMuscleIn(w.cur), prev=setsByMuscleIn(w.prev);
  var tracked=MUSCLES.filter(function(m){ return ex.indexOf(m.k)<0; });
  var shown=tracked.filter(function(m){ return now.by[m.k]>0||prev.by[m.k]>0; });
  var zero=tracked.filter(function(m){ return !(now.by[m.k]>0||prev.by[m.k]>0); });
  var skipped=MUSCLES.filter(function(m){ return ex.indexOf(m.k)>=0; });

  var html='<div class="row" style="margin-bottom:7px"><div class="eyebrow">Sets per rotation</div>'+
    '<span class="tiny muted" style="margin-left:auto">'+(w.havePrev?"this one vs the last":"this one")+'</span></div>';

  /* Lines every version of the card ends with, empty state included. */
  var skippedLine=skipped.length
    ? '<div class="tiny muted" style="padding:0 var(--pad) 4px">'+
      esc(skipped.map(function(m){ return m.n; }).join(", "))+': not tracked, by choice.</div>':"";
  var untaggedLine=now.untagged
    ? '<div class="tiny" style="padding:2px var(--pad) 4px;color:var(--bad-ink)">'+
      plural(now.untagged,"set")+' in this rotation aren\'t counted — those exercises have no muscles set.</div>':"";

  if(!shown.length){
    return html+'<div class="card" style="margin-bottom:12px"><div class="empty">'+
      (now.untagged||prev.untagged
        ? 'Nothing is tagged yet.<br>Open an exercise in Plan and set its muscles.'
        : 'No sets logged in your last rotation.')+'</div>'+skippedLine+untaggedLine+'</div>';
  }

  var unitsOf=function(x){ return x*w.n/f; };               // a weekly figure in rotation units
  var max=0;
  shown.forEach(function(m){ max=Math.max(max,now.by[m.k],prev.by[m.k],unitsOf(b2BandCap(m.k))); });
  var scale=Math.max(max,1);
  shown.sort(function(a,b){ return now.by[b.k]-now.by[a.k]; });

  html+='<div class="card" style="padding:9px 0;margin-bottom:12px">';
  if(!w.full) html+='<div class="tiny" style="padding:0 var(--pad) 6px;color:var(--ink-2)"><b>Not a full rotation yet.</b> '+
    'Showing the sets you have so far.</div>';
  shown.forEach(function(m){
    var b=bandOf(m.k);
    html+=bandRow(m.n,now.by[m.k],unitsOf(b[0]),unitsOf(b[1]),scale,{prev:prev.by[m.k],state:b2IsIndirect(m.k)?"indirect":""});
  });
  html+='<div class="tiny muted" style="padding:6px var(--pad) 2px">'+
    'One rotation = your last '+plural(w.n,"day")+(w.keys.length?' ('+esc(w.keys.join(", "))+')':"")+'. '+
    'The shaded stripe is the band: 9–16 sets a week, 6–12 for abs and rear delts, indirect: 3+ (front delts, glutes, traps, forearms), '+
    'at '+fmt(f)+' sessions a week. '+(w.havePrev?'The dark line is the rotation before. ':"")+
    'A set counts 1 for the main muscle, ½ for a helper.</div>';
  if(zero.length)
    html+='<div class="tiny muted" style="padding:0 var(--pad) 4px">Nothing for '+
      esc(zero.map(function(m){ return m.n.toLowerCase(); }).join(", "))+'.</div>';
  html+=skippedLine+untaggedLine+'</div>';
  return html;
}

/* ============================ v25: the scorecard and the look back ============================ */
/* The screen that has to answer "did it work?" a year from now: per lift in
   the current plan, the first four weeks of its history against the latest
   four, by best working weight and best trend score (e1RM, or the rep-out
   when there is one). Lifts with under three weeks of history are left out
   rather than shown as noise. */
var LOOKBACK=28*864e5;
function sinceStartCard(){
  if(S.sessions.length<2) return "";
  var t0=S.sessions[S.sessions.length-1].ts, t1=S.sessions[0].ts;
  if(t1-t0<LOOKBACK) return "";
  var rows=[];
  trackedLifts().forEach(function(n){
    var h=exWorking(n);
    if(h.length<2||h[0].ts-h[h.length-1].ts<21*864e5) return;
    var a=h[h.length-1].ts, z=h[0].ts;
    var early=h.filter(function(x){ return x.ts<=a+LOOKBACK; }), late=h.filter(function(x){ return x.ts>=z-LOOKBACK; });
    function best(list,f,lowWins){ var v=list.map(f); return lowWins?Math.min.apply(null,v):Math.max.apply(null,v); }
    var mode=h[0].bw;
    var w0=best(early,function(x){ return workLoad(x.sets,x.bw); },mode===2);
    var w1=best(late,function(x){ return workLoad(x.sets,x.bw); },mode===2);
    var e0=best(early,trendScore), e1=best(late,trendScore);
    if(!e0) return;
    rows.push({n:n, w0:w0, w1:w1, mode:mode, pct:(e1/e0-1)*100});
  });
  if(!rows.length) return "";
  rows.sort(function(x,y){ return y.pct-x.pct; });
  var weeks=Math.max(1,(t1-t0)/(7*864e5));
  var months={};
  S.sessions.forEach(function(x){ var d=new Date(x.ts), k=d.getFullYear()*12+d.getMonth(); months[k]=(months[k]||0)+1; });
  var mk=Object.keys(months).map(Number).sort(function(x,y){ return x-y; });
  var mline=mk.map(function(k){
    return new Date(Math.floor(k/12),k%12,1).toLocaleDateString(undefined,{month:"short"})+" "+months[k];
  }).join(" · ");
  return '<div class="eyebrow" style="margin-bottom:7px">Since you started</div>'+
    '<div class="card" style="padding:0;margin-bottom:12px">'+
      '<div class="tiny" style="padding:10px var(--pad) 4px">Since '+esc(shortDate(t0))+': '+plural(S.sessions.length,"session")+
        ' in '+Math.round(weeks)+' weeks, '+(S.sessions.length/weeks).toFixed(1)+' a week.</div>'+
      '<div class="tiny muted" style="padding:0 var(--pad) 8px">'+esc(mline)+'</div>'+
      rows.map(function(r){
        var up=r.pct>=0.5, dn=r.pct<=-0.5;
        return '<button class="prrow" data-lift="'+esc(r.n)+'">'+
          '<span class="prn">'+esc(r.n)+'</span>'+
          '<span class="prs">'+esc(entryText({w:r.w0},r.mode))+' → '+esc(entryText({w:r.w1},r.mode))+'</span>'+
          '<span class="prd" style="color:'+(up?"var(--good)":dn?"var(--bad)":"var(--ink-2)")+'">'+
            (r.pct>=0?"+":"")+Math.round(r.pct)+'%</span></button>';
      }).join("")+
      '<div class="tiny muted" style="padding:8px var(--pad) 10px">First four weeks of each lift against the latest four: best working weight, and change in estimated max.</div>'+
    '</div>';
}

function prCard(){
  var board=prBoard();
  if(!board.length) return "";
  var top=board.slice(0,5);
  var html='<div class="row" style="margin-bottom:7px"><div class="eyebrow">Records</div>'+
    (board.length>5?'<button class="tiny muted" style="margin-left:auto" data-act="pr-all">See all '+board.length+' ›</button>':"")+
    '</div><div class="card" style="padding:0;margin-bottom:12px">'+top.map(prRowHTML).join("")+'</div>';
  return html;
}
function prRowHTML(p){
  return '<button class="prrow" data-lift="'+esc(p.name)+'">'+
    '<span class="prn">'+esc(p.name)+'</span>'+
    '<span class="prs">'+entryText(p.set,p.bw)+' '+metricJoin(p.metric)+' '+num(p.set.r)+metricSuffix(p.metric)+'</span>'+
    '<span class="prd">'+esc(shortDate(p.ts))+'</span></button>';
}
function prSheet(){
  var board=prBoard();
  sheet('<h3>Records</h3><div class="sub">Best estimated 1RM for every lift, newest first.</div>'+
    '<div class="card" style="padding:0">'+board.map(prRowHTML).join("")+'</div>',
    function(el){
      $$("[data-lift]",el).forEach(function(b){
        b.onclick=function(){ closeSheet(); liftSheet(b.dataset.lift); };
      });
    });
}

var calOffset=0;
function calendarCard(){
  var g=monthGrid(calOffset);
  var todayTs=new Date(); todayTs.setHours(0,0,0,0); todayTs=todayTs.getTime();
  var html='<div class="calhead">'+
      '<div class="eyebrow">Consistency</div>'+
      '<div style="flex:1"></div>'+
      '<button class="iconbtn" data-cal="-1" aria-label="Earlier month">‹</button>'+
      '<button class="iconbtn" data-cal="1" aria-label="Later month"'+(calOffset<=0?" disabled":"")+'>›</button>'+
    '</div>'+
    '<div class="card" style="margin-bottom:12px">'+
      '<div class="row" style="margin-bottom:9px"><div style="font-size:14px;font-weight:700">'+esc(g.label)+'</div>'+
        '<div class="tiny muted" style="margin-left:auto">'+
          (g.sessions?plural(g.sessions,"session")+' · '+plural(g.trained,"day"):"nothing logged")+'</div></div>'+
      '<div class="cal">'+
      ["M","T","W","T","F","S","S"].map(function(d){ return '<div class="dow">'+d+'</div>'; }).join("");
  g.rows.forEach(function(row){
    row.forEach(function(c){
      if(!c){ html+='<div class="cell pad"></div>'; return; }
      var hit=c.sessions.length;
      html+='<'+(hit?'button':'div')+' class="cell'+(hit?" hit":"")+(c.ts===todayTs?" today":"")+'"'+
        (hit?' data-calday="'+c.sessions[0].id+'"':"")+'>'+c.day+
        (hit?'<span class="k">'+esc(hit>1?hit+"×":c.sessions[0].key||"·")+'</span>':"")+
      '</'+(hit?'button':'div')+'>';
    });
  });
  html+='</div>'+weeklyFreqHtml()+'</div>';
  return html;
}

/* Sessions per week. The independent review's largest lever was frequency,
   not the engine: about 1.4 sessions a week vs 2–3. Shown as a fact, with no
   target and no nagging. Calendar weeks start Monday and are built with
   setDate, not +7×864e5, so a DST change can't shift a boundary by an hour. */
function weekStarts(n){
  var d=new Date(); d.setHours(0,0,0,0);
  var dow=(d.getDay()+6)%7, out=[];
  for(var i=n-1;i>=0;i--) out.push(new Date(d.getFullYear(),d.getMonth(),d.getDate()-dow-7*i).getTime());
  return out;
}
function sessionsPerWeek(n){
  return weekStarts(n).map(function(a){
    var d=new Date(a), b=new Date(d.getFullYear(),d.getMonth(),d.getDate()+7).getTime();
    return S.sessions.filter(function(s){ return s.ts>=a&&s.ts<b; }).length;
  });                                          // n weeks, oldest first, last = this week
}
function weeklyFreqHtml(){
  if(!S.sessions.length) return "";
  var c=sessionsPerWeek(8), st=weekStarts(8);
  /* Average only over full weeks since the first session: two weeks in at
     three a week is "3", not "1.5" (review). No full week yet: say so. */
  var first=S.sessions.reduce(function(m,s){ return Math.min(m,s.ts); },Infinity);
  var full=[3,4,5,6].filter(function(i){ return st[i+1]>first; });
  var avg=full.length?full.reduce(function(a,i){ return a+c[i]; },0)/full.length:null;
  var mx=Math.max(3,Math.max.apply(null,c));
  var html='<div class="wkhead"><div style="font-size:14px;font-weight:700">'+
      (avg===null?plural(c[7],"session")+' this week':fmt(round(avg,1))+' sessions a week')+'</div>'+
    '<div class="tiny muted">'+(avg===null?'no full week yet':'last '+(full.length>1?full.length+' full weeks':'full week'))+'</div></div>'+
    '<div class="wkbars" role="img" aria-label="Sessions per week, last 8 weeks, oldest first: '+c.join(", ")+'">';
  c.forEach(function(k,i){
    html+='<div class="wb'+(i===c.length-1?" now":"")+'"><span class="n">'+k+'</span>'+
      '<div class="bar'+(k?"":" z")+'" style="height:'+(k?Math.round(36*k/mx):2)+'px"></div></div>';
  });
  return html+'</div><div class="wkaxis tiny muted"><span>7 weeks ago</span><span>this week</span></div>';
}

function kfmt(v){
  if(v>=1e6) return (v/1e6).toFixed(1)+"M";
  if(v>=1e4) return Math.round(v/1e3)+"k";
  if(v>=1e3) return (v/1e3).toFixed(1)+"k";
  return String(Math.round(v));
}

function liftSheet(name){
  var h=exSessions(name), t=trend(name), best=bestScore(name), met=h.length?h[0].metric:0;
  var html='<h3>'+esc(name)+'</h3>'+
    '<div class="sub">'+plural(h.length,"session")+(best?' · '+scoreLabel(met)+' '+Math.round(best)+(met?"":" "+unit()):"")+'</div>';
  if(h.length>=2){
    html+='<div class="card" style="margin-bottom:12px">'+
      '<div class="row"><div class="eyebrow">'+(met===1?"Best hold":met===2?"Best distance":"Estimated 1RM")+'</div>'+
      '<span class="chip '+(t.state==="up"?"good":t.state==="down"?"bad":"")+' mono" style="margin-left:auto;font-size:11px">'+
        (t.state==="new"?"needs "+(4-t.n)+" more":(t.pct>=0?"+":"")+t.pct.toFixed(1)+"% trend")+'</span></div>'+
      '<canvas id="bigchart" style="width:100%;height:130px;display:block;margin-top:8px"></canvas></div>';
  }
  /* Both of these used to describe things that weren't true. "Three sessions
     below the three before" is the algorithm v16 deleted, and "the app has
     already dropped your next prescription 10%" was often wrong — the next
     prescription may be a hold. Say what the maths actually measured, and ask
     prescribe() what happens next rather than asserting it. */
  var pe=planExByName(name);
  if(t.state==="down"){
    var nxt=pe?prescribe(name,pe):null;
    html+='<div class="banner warn" style="margin-bottom:12px"><div class="bt">Trending down</div>'+
      '<div class="bd">Falling about '+Math.abs(t.pct).toFixed(1)+'% per three sessions across the last '+
      plural(Math.min(t.n,trendWin(name)),"session")+'.'+
      (nxt&&nxt.why?' Next time: '+esc(nxt.why.toLowerCase())+'.':"")+'</div></div>';
  } else if(t.state==="flat"){
    html+='<div class="banner info" style="margin-bottom:12px"><div class="bt">Holding flat</div>'+
      /* Telling someone to set a rep range they already have is noise, and a
         wide range legitimately reads flat — the Plan tab says so out loud, so
         this should too rather than implying something is wrong. */
      '<div class="bd">'+(cycleOf(name)>1
        ? "A range this wide gains its weight step slowly, so flat here can still be progress."
        : "Set a rep range on this lift so it climbs by reps before it climbs by weight.")+
      '</div></div>';
  }
  html+='<div class="scrollx"><table class="hist"><thead><tr>'+
    '<th>Date</th><th>Sets</th><th>Top</th><th>'+(met?"Score":"Est 1RM")+'</th><th>Vol</th></tr></thead><tbody>';
  h.slice(0,20).forEach(function(s){
    var top=s.sets.reduce(function(a,b){ return setScore(b,s.metric)>setScore(a,s.metric)?b:a; });
    html+='<tr'+(s.deload?' class="dl"':"")+'><td>'+esc(shortDate(s.ts))+(s.deload?" ·":"")+'</td><td>'+s.sets.length+'</td>'+
      '<td>'+entryText(top,s.bw)+metricJoin(s.metric)+num(top.r)+metricSuffix(s.metric)+
        (num(top.rpe)?'<span class="muted"> @'+fmt(top.rpe)+'</span>':"")+'</td>'+
      '<td>'+Math.round(sessionTopScore(s))+'</td>'+
      '<td>'+(s.metric?"—":kfmt(sessionVolume(s.sets,s.metric)))+'</td></tr>';
  });
  html+='</tbody></table>'+
    (h.some(function(x){return x.deload;})?'<div class="tiny muted" style="margin-top:6px">· deload session, excluded from trends</div>':"")+
    '</div>';
  sheet(html,function(el){
    var c=$("#bigchart",el);
    if(c) spark(c,h.map(sessionTopScore).reverse().slice(-20),{grid:true,pad:8,lw:2.2,dot:3.4});
  });
}

/* ============================ EDIT A PAST SESSION ============================
   Edits run on a clone; nothing lands until Save. PRs are recomputed across
   the whole history afterwards so a corrected typo can't leave a ghost record.
   ========================================================================== */
var draft=null;

function sessionSheet(id){
  var s=S.sessions.find(function(x){ return x.id===id; });
  if(!s) return;
  var vol=0; s.exercises.forEach(function(e){ vol+=exVolume(e); });
  var html='<h3>'+esc(s.name)+'</h3><div class="sub">'+
    esc(new Date(s.ts).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}))+
    (s.unlogged?' · Trained, not logged.':(s.endTs?' · '+dur(s.endTs-s.ts):"")+' · '+commas(vol)+' '+unit())+
    (s.variantName?' · '+esc(s.variantName):"")+
    (s.deload?' · deload':"")+'</div>';
  s.exercises.forEach(function(e){
    var mode=bwMode(e), smet=metricOf(e);
    html+='<div class="card" style="margin-bottom:8px"><div class="ex-name" style="font-size:14px">'+esc(e.name)+
      (e.supplemental?' <span class="chip tag">EXTRA</span>':"")+'</div>'+
      '<div class="num tiny" style="margin-top:4px;color:var(--ink-2)">'+
      e.sets.map(function(x){
        return (x.warm?"w ":"")+entryText(x,mode)+metricJoin(smet)+num(x.r)+metricSuffix(smet)+(x.pr?" ★":"");
      }).join("   ")+'</div>'+
      (String(e.note||"").trim()?'<div class="tiny" style="margin-top:5px">'+esc(String(e.note).trim())+'</div>':"")+
      fcHistoryHtml(e)+'</div>';
  });
  if(s.note) html+='<div class="card" style="margin-bottom:12px"><div class="eyebrow">Note</div><div style="margin-top:4px">'+esc(s.note)+'</div></div>';
  /* A session he only marked as trained has no sets to edit; it can be closed
     or deleted. */
  html+='<div class="row" style="gap:8px;margin-top:8px">'+
    '<button class="btn ghost" style="flex:1" data-x="close">Close</button>'+
    (s.unlogged?'':'<button class="btn primary" style="flex:1" data-x="edit">Edit</button>')+'</div>'+
    '<button class="btn danger block" style="margin-top:8px" data-x="del">Delete session</button>';
  sheet(html,function(el){
    $('[data-x="close"]',el).onclick=closeSheet;
    if(!s.unlogged) $('[data-x="edit"]',el).onclick=function(){ editSession(id); };
    $('[data-x="del"]',el).onclick=function(){
      confirmSheet("Delete this session?","It's removed from your history and stats.","Delete",function(){
        var i=S.sessions.findIndex(function(x){ return x.id===id; });
        if(i<0) return;
        var gone=S.sessions[i];
        S.sessions.splice(i,1);
        /* A delete he confirmed is not data loss, so the backup guard (no push
           with fewer sessions than the last) must not then refuse every
           automatic backup in silence — it moves its count with him. */
        gistSessionsMoved(-1);
        /* PRs are derived from the whole history, so both directions have to
           rebuild them or a deleted record leaves a ghost behind. */
        recomputePRs(); writeNow(); render();
        toastUndo("Session deleted",function(){
          S.sessions.splice(Math.min(i,S.sessions.length),0,gone);
          gistSessionsMoved(1);
          recomputePRs(); writeNow(); render(); toast("Session restored");
        });
      },true);
    };
  });
}

function editSession(id){
  var orig=S.sessions.find(function(x){ return x.id===id; });
  if(!orig) return;
  draft=JSON.parse(JSON.stringify(orig));
  /* Remember what each weight was when the editor opened, so committing can
     tell an edited set from an untouched one. Stripped again in commitEdit —
     it must never reach storage. */
  draft.exercises.forEach(function(e){ e.sets.forEach(function(s){ s.w0=s.w; }); });
  drawEditor();
}

var editorToEnd=false;
function drawEditor(){
  var d=draft;
  var html='<h3>Edit session</h3><div class="sub">Fix a typo, add the set you forgot, drop one you didn\'t do.</div>'+
    '<div class="field-row"><div class="fl">Date</div>'+
      '<input class="txt" style="max-width:190px" type="date" data-x="date" aria-label="Session date" value="'+esc(localDay(d.ts))+'"></div>'+
    '<div class="field-row"><div class="fl">Name</div>'+
      '<input class="txt" style="max-width:190px" data-x="name" aria-label="Session name" value="'+esc(d.name)+'"></div>'+
    '<div class="field-row"><div class="fl">Deload session<div class="fh">Kept out of trend maths</div></div>'+
      '<button class="switch'+(d.deload?" on":"")+'" role="switch" aria-checked="'+!!d.deload+'" aria-label="Deload session" data-x="deload"></button></div>';

  d.exercises.forEach(function(e,ei){
    var mode=bwMode(e), emet=metricOf(e);
    html+='<div class="card" style="margin:10px 0 0;padding:10px 12px">'+
      '<div class="row"><div class="ex-name" style="font-size:14px;flex:1">'+esc(e.name)+'</div>'+
        '<span class="tiny muted">'+esc(loadLabel(mode))+'</span>'+
        '<button class="iconbtn" data-rmex="'+ei+'" aria-label="Remove exercise">✕</button></div>';
    var wi=0;
    e.sets.forEach(function(s,si){
      if(!s.warm) wi++;
      html+='<div class="erow'+(s.warm?" warm":"")+'">'+
        '<button class="ei" data-warm="'+ei+'.'+si+'" title="Toggle warm-up">'+(s.warm?"W":s.role==="top"?"T":wi)+'</button>'+
        '<input inputmode="decimal" type="number" step="any" data-f="w" aria-label="Weight, set '+(si+1)+'" data-k="'+ei+'.'+si+'" value="'+esc(s.w)+'">'+
        '<span class="times">'+metricJoin(emet)+'</span>'+
        '<input inputmode="numeric" type="number" data-f="r" aria-label="Reps, set '+(si+1)+'" data-k="'+ei+'.'+si+'" value="'+esc(s.r)+'">'+
        '<button class="rm" data-rmset="'+ei+'.'+si+'" aria-label="Delete set">✕</button>'+
      '</div>';
    });
    html+='<div class="row" style="gap:8px;margin-top:8px">'+
      '<button class="btn sm ghost" data-addset="'+ei+'">+ Set</button>'+
      '<button class="btn sm ghost" data-addwarm="'+ei+'">+ Warm-up</button>'+
    '</div></div>';
  });

  html+='<button class="btn ghost block" style="margin-top:10px" data-x="addex">+ Add exercise</button>'+
    '<div style="margin-top:10px"><div class="eyebrow" style="margin-bottom:6px">Note</div>'+
    '<textarea class="txt" data-x="note" aria-label="Session note">'+esc(d.note||"")+'</textarea></div>'+
    '<div class="sheet-foot">'+
      '<button class="btn ghost" style="flex:1" data-x="cancel">Cancel</button>'+
      '<button class="btn primary" style="flex:1.4" data-x="save">Save changes</button></div>';

  /* Redrawn after + Set, a warm-up flip or removing a set: keep the scroll
     position and skip the slide-in, or every tap threw the sheet back to the
     top of a long session (sprint review). Only when the editor itself is
     what is being replaced. */
  var prev=$(".backdrop .sheet"), keepTop=prev&&prev.dataset.editor?prev.scrollTop:null, toEnd=editorToEnd;
  editorToEnd=false;
  sheet(html,function(el){
    var d=draft;
    el.dataset.editor="1";
    if(keepTop!==null){ el.style.animation="none"; el.parentNode.style.animation="none"; el.scrollTop=keepTop; }
    /* back from the exercise picker: show the exercise just added, not the top */
    else if(toEnd) el.scrollTop=el.scrollHeight;
    $('[data-x="date"]',el).onchange=function(){
      var parts=this.value.split("-");
      if(parts.length===3){
        var old=new Date(d.ts);
        d.ts=new Date(+parts[0],+parts[1]-1,+parts[2],old.getHours(),old.getMinutes()).getTime();
      }
    };
    $('[data-x="name"]',el).oninput=function(){ d.name=this.value; };
    $('[data-x="note"]',el).oninput=function(){ d.note=this.value; };
    $('[data-x="deload"]',el).onclick=function(){ d.deload=!d.deload; this.classList.toggle("on",d.deload); this.setAttribute("aria-checked",String(!!d.deload)); };

    el.addEventListener("input",function(e){
      var i=e.target;
      if(!i.matches('input[data-k]')) return;
      var p=i.dataset.k.split("."), s=d.exercises[+p[0]].sets[+p[1]];
      s[i.dataset.f]=i.value;
    });
    el.addEventListener("click",function(e){
      var b=e.target.closest("[data-warm],[data-rmset],[data-addset],[data-addwarm],[data-rmex]");
      if(!b) return;
      if(b.dataset.warm!==undefined){
        var p=b.dataset.warm.split("."), s=d.exercises[+p[0]].sets[+p[1]];
        s.warm=!s.warm; drawEditor(); return;
      }
      if(b.dataset.rmset!==undefined){
        var q=b.dataset.rmset.split(".");
        d.exercises[+q[0]].sets.splice(+q[1],1);
        if(!d.exercises[+q[0]].sets.length) d.exercises.splice(+q[0],1);
        drawEditor(); return;
      }
      if(b.dataset.addset!==undefined){
        var e1=d.exercises[+b.dataset.addset];
        var w1=working(e1.sets), t1=w1[w1.length-1]||e1.sets[e1.sets.length-1]||{w:"",r:"8"};
        var ns1={w:t1.w,r:t1.r,done:true};
        if(e1.scheme==="topback") ns1.role="back";               // + Set on a top-set lift is another back-off
        e1.sets.push(ns1);
        drawEditor(); return;
      }
      if(b.dataset.addwarm!==undefined){
        var e2=d.exercises[+b.dataset.addwarm];
        e2.sets.unshift({w:e2.sets[0]?e2.sets[0].w:"",r:"5",warm:true,done:true});
        drawEditor(); return;
      }
      if(b.dataset.rmex!==undefined){ d.exercises.splice(+b.dataset.rmex,1); drawEditor(); }
    });
    $('[data-x="addex"]',el).onclick=function(){
      pickExercise(null,function(name){
        /* Was five hardcoded numbers that ignored every default and dropped
           bar, metric and the muscle tags. The plan constructor is the same
           source of truth the rest of the app adds an exercise from. */
        var pe=newPlanEx(name);
        draft.exercises.push({id:uid(),planId:null,name:name,
                              targetReps:pe.reps,reps:pe.reps,repTop:pe.repTop,
                              inc:pe.inc,bw:pe.bw,bar:pe.bar,metric:pe.metric,
                              mg:pe.mg,mg2:pe.mg2.slice(),
                              scheme:pe.scheme,backPct:pe.backPct,pins:cleanPins(pe.pins),
                              supplemental:true,note:"",
                              sets:[{w:"",r:String(pe.reps),done:true}]});
        editorToEnd=true; drawEditor();
      });
    };
    $('[data-x="cancel"]',el).onclick=function(){ draft=null; closeSheet(); };
    $('[data-x="save"]',el).onclick=commitEdit;
  });
}

function commitEdit(){
  var d=draft;
  if(!d) return;
  /* What bodyweight this session was logged at. `load` is resolved once, at
     log time, precisely so that changing your bodyweight later can't rewrite
     history — but sessions predating the d.bw snapshot have no record of it,
     and the editor used to fill that gap with TODAY's bodyweight. Editing the
     note on a months-old weighted pull-up silently moved every load in it.

     An untouched set still carries the load it was logged with, so the
     session's own bodyweight can be read back out of it. */
  function readBackBw(){
    var found=0;
    d.exercises.forEach(function(e){
      var mode=bwMode(e);
      if(found||!mode) return;
      e.sets.forEach(function(s){
        if(found||s.w0===undefined||s.w0!==s.w||!(num(s.load)>0)) return;
        found=mode===1?num(s.load)-num(s.w):num(s.load)+num(s.w);
      });
    });
    return found;
  }
  var known=(d.bw!==undefined&&num(d.bw)>0)?num(d.bw):readBackBw();
  var sbw=known||num(S.settings.bodyweight);
  /* Backfill only what was actually read back — writing today's bodyweight
     onto an old session would be inventing the very number this is protecting. */
  if(d.bw===undefined&&known>0) d.bw=known;

  /* Drop empty sets and empty exercises, resolve loads, then re-sort. */
  d.exercises.forEach(function(e){
    var mode=bwMode(e);
    e.sets=e.sets.filter(function(s){ return num(s.r)>0; });
    e.sets.forEach(function(s){
      var edited=s.w0===undefined||s.w0!==s.w;
      delete s.w0;
      s.done=true;
      /* Only a weight you actually changed gets re-resolved, and even then
         against this session's bodyweight rather than today's. */
      if(edited||!(num(s.load)>0)) s.load=effLoad(s.w,mode,sbw);
    });
  });
  d.exercises=d.exercises.filter(function(e){ return e.sets.length; });

  var i=S.sessions.findIndex(function(x){ return x.id===d.id; });
  if(i<0){ draft=null; closeSheet(); return; }
  S.sessions[i]=d;
  S.sessions.sort(function(a,b){ return b.ts-a.ts; });
  recomputePRs();
  writeNow();
  draft=null;
  closeSheet(); render();
  toast("Session updated");
}

self.__ilf=(self.__ilf||0)+1;
