/* ================= EssayEspresso — the game ================= */
var ME=null, GUEST=false, CFG=null, SCREENS={}, G=null, S={};
var path=[], nested=null, showMe=false, showGear=false, showEndings=false;
var showConvert=false, convCat=null, convMsg="", invPick=null, endCat=null, endIdx=null;
var qs=new URLSearchParams(location.search), DRAFT=qs.get("draft"), TESTMODE=!!DRAFT;

var gstore={
  load:function(){
    if(GUEST||TESTMODE) return Promise.resolve(LS.get(TESTMODE?"gametest":"game",null));
    return studentsCol.doc(ME).collection("game").doc("state").get()
      .then(function(d){ return d.exists?d.data():null; });
  },
  save:function(){
    if(GUEST||TESTMODE){ LS.set(TESTMODE?"gametest":"game",G); return Promise.resolve(); }
    return studentsCol.doc(ME).collection("game").doc("state").set(G,{merge:true});
  },
  saveStudentAP:function(){
    if(GUEST||TESTMODE){ var c=LS.get("student",{}); c.ap=S.ap; LS.set("student",c); return Promise.resolve(); }
    return studentsCol.doc(ME).set({ap:S.ap},{merge:true});
  }
};

auth.onAuthStateChanged(function(u){
  if(u){
    resolveRole(u,function(role,data){
      if(role==="student"){ ME=u.uid; S=data||{};
        if(S.gameOn===false && !TESTMODE){ location.href="student.html"; return; }
        boot(); return; }
      if(role==="teacher"){ ME=u.uid; S={name:"Jim",ap:99999}; GUEST=false; boot(); return; }
      location.href="index.html";
    });
  } else {
    if(LS.get("guest",false)){ GUEST=true; ME="guest"; S=LS.get("student",{ap:0}); boot(); }
    else location.href="index.html";
  }
});

function boot(){
  var cfgP = DRAFT ? draftsCol.doc(DRAFT).get().then(function(d){
      if(!d.exists) throw new Error("draft not found");
      var data=d.data(); SCREENS=data.screens||{}; return data.config||{};
    })
    : gameCfgRef.get().then(function(d){
        return screensCol.get().then(function(sn){
          SCREENS={}; sn.forEach(function(x){ SCREENS[x.id]=Object.assign({id:x.id},x.data()); });
          return d.exists?d.data():{};
        });
      });
  cfgP.then(function(cfg){
    CFG = Object.assign({days:40, apSkip:5, skipCaption:"Or wait until 12AM PST.",
      invPages:10, stats:[], items:[], convert:{cats:[]}, endings:{},
      restartText:"Would you like to RESTART this game? You will lose ALL OF YOUR STATS. "+
        "(Take a screenshot if you'd like!) You will only get to keep your ✨AP, 🪙coins, and your inventory!"
    }, cfg);
    return gstore.load();
  }).then(function(state){
    G = state || freshGame();
    rolloverCheck();
    draw();
  }).catch(function(e){
    $("host").appendChild(errBox("Could not load the game: "+e.message+
      " — your tutor may not have built it yet."));
  });
}

function freshGame(keep){
  var st={};
  (CFG.stats||[]).forEach(function(s){
    st[s.name] = keep && keep.stats && s.keepOnRestart ? (keep.stats[s.name]||0) : (s.start||0);
  });
  return { day:1, stats:st, inv:(keep&&keep.inv)||{}, found:(keep&&keep.found)||{},
    name:(keep&&keep.name)||"Me", pic:(keep&&keep.pic)||"", bg:(keep&&keep.bg)||"",
    over:false, dayKey:ptDayKey(), once:{} };
}
function rolloverCheck(){
  var k=ptDayKey();
  if(G.dayKey !== k){
    var gap = daysBetweenKeys(G.dayKey, k);
    if(gap>0 && !G.over){ G.day = Math.min(CFG.days, (G.day||1) + gap); }
    G.dayKey = k;
    if(G.day>=CFG.days) { /* stays playable; ending triggers via the button */ }
    gstore.save();
  }
}

/* ---------- helpers ---------- */
function statVal(n){ return (G.stats[n]||0); }
function apVal(){ return S.ap||0; }
function statEmoji(n){
  var f=null; (CFG.stats||[]).forEach(function(s){ if(s.name===n) f=s; });
  return (f&&f.emoji)||n;
}
function fmtFx(f){
  if(f.kind==="item") return "("+(f.amount>0?"Get":"Lose")+": "+f.target+")";
  var nm = f.target==="__AP__" ? "✨" : statEmoji(f.target);
  if(f.op==="x") return "("+nm+"×"+f.amount+")";
  if(f.op==="=") return "("+nm+"="+f.amount+")";
  return "("+nm+(f.amount>=0?"+":"")+f.amount+")";
}
function condOK(c){
  if(!c || !c.kind) return true;
  if(c.kind==="stat_min") return (c.target==="__AP__"?apVal():statVal(c.target)) >= (c.value||0);
  if(c.kind==="stat_max") return (c.target==="__AP__"?apVal():statVal(c.target)) <= (c.value||0);
  if(c.kind==="has")      return (G.inv[c.target]||0) > 0;
  if(c.kind==="not_has")  return !(G.inv[c.target]||0);
  if(c.kind==="day_min")  return G.day >= (c.value||0);
  return true;
}
function buttonEligible(b){
  if((b.conds||[]).some(function(c){ return !condOK(c); })) return false;
  if(b.limit==="once" && G.once[b.id]) return false;
  if(b.limit==="daily" && G.once[b.id]===G.dayKey) return false;
  return true;
}
function visibleButtons(screenId){
  var sc=SCREENS[screenId]; if(!sc) return [];
  var perPage = sc.perPage || 4;
  var pool=(sc.buttons||[]).filter(buttonEligible);
  var picked=[];
  pool.forEach(function(b){
    var ch = (b.chance===undefined||b.chance===null) ? 100 : b.chance;
    if(ch>=100){ picked.push(b); return; }
    if(rand01(G.dayKey+"|"+screenId+"|"+b.id)*100 < ch) picked.push(b);
  });
  return {list:picked, perPage:perPage, hideEmpty:sc.hideEmpty};
}
function applyFx(b){
  (b.fx||[]).forEach(function(f){
    if(f.kind==="item"){
      var cur=G.inv[f.target]||0;
      if(f.amount>0){
        var slots=(CFG.invPages||10)*9;
        if(Object.keys(G.inv).length>=slots && !cur){ convMsg="Your bag is full."; return; }
      }
      G.inv[f.target]=cur+f.amount;
      if(G.inv[f.target]<=0) delete G.inv[f.target];
      return;
    }
    if(f.target==="__AP__"){ S.ap=Math.max(0,(S.ap||0)+f.amount); gstore.saveStudentAP(); return; }
    var v=statVal(f.target);
    if(f.op==="x") v=Math.floor(v*f.amount);
    else if(f.op==="/") v=Math.max(0,Math.floor(v/(f.amount||1)));
    else if(f.op==="=") v=f.amount;
    else v=v+f.amount;
    var max=null; (CFG.stats||[]).forEach(function(s){ if(s.name===f.target && s.max!=null) max=s.max; });
    if(max!=null) v=Math.min(max,v);
    G.stats[f.target]=Math.max(0,v);
  });
  if(b.limit==="once") G.once[b.id]=true;
  if(b.limit==="daily") G.once[b.id]=G.dayKey;
}

/* ---------- rendering ---------- */
function ibNode(cls, pic, label, eff, fn){
  var b=el("button","ib "+(cls||""));
  b.appendChild(picNode(pic, ""));
  var l=el("span","lbl"); l.textContent=label;
  if(eff){ var e=el("span","eff",eff); l.appendChild(e); }
  b.appendChild(l);
  if(fn) b.onclick=fn; else b.disabled=true;
  return b;
}
function header(){
  var head=el("div","cardhead");
  var h=el("h2",null,"Game ");
  var chip=el("span","daychip", G.over ? "THE END" : ("Day "+G.day+" / "+CFG.days));
  chip.onclick=askRestart;
  h.appendChild(chip); head.appendChild(h);
  var ctr=el("div","ctrls");
  var ap=el("span","hdrbtn","✨"+apVal()); ap.onclick=function(){ openConvert(); };
  ctr.appendChild(ap);
  (CFG.stats||[]).forEach(function(s){
    if(!s.inHeader || s.name==="__AP__") return;
    var b=el("span","hdrbtn",(s.emoji||s.name)+statVal(s.name));
    b.onclick=function(){ toggleMe(); };
    ctr.appendChild(b);
  });
  var bag=el("span","hdrbtn bag","🎒"); bag.onclick=function(){ toggleMe(); };
  ctr.appendChild(bag);
  head.appendChild(ctr);
  return head;
}
function draw(){
  var host=$("host"); clear(host);
  if(TESTMODE){ var t=el("div","ok"); t.textContent="Play-testing a draft — nothing here touches real saves.";
    host.appendChild(t); }
  if(G.over){ host.appendChild(drawEnding()); }
  else host.appendChild(drawScreen());
  if(showConvert) host.appendChild(drawConvert());
  if(showMe) host.appendChild(drawMe());
  gstore.save();
}
function drawScreen(){
  var cur = path.length ? path[path.length-1] : (CFG.topScreen||"top");
  var sc = SCREENS[cur];
  var card=el("div","card");
  if(G.bg) card.style.background=G.bg;
  card.appendChild(header());
  if(!sc){ card.appendChild(el("p","muted","This screen hasn't been built yet."));
    if(path.length) card.appendChild(mkBtn("← Back","",goBack));
    return card; }

  if(sc.type===2){
    var wrap=el("div","p2"); wrap.style.marginTop="10px";
    wrap.appendChild(ibNode("back", sc.pic, "← Back", "", path.length?goBack:null));
    var content=el("div","content");
    var txt=el("div","txt"); txt.innerHTML=sc.text||""; content.appendChild(txt);
    var imgs=el("div","imgs"); var rowd=el("div","imgrow");
    (sc.images||[]).forEach(function(im){
      var b=el("div","imgbox");
      if(im.url){ var i=document.createElement("img"); i.src=im.url; b.appendChild(i); }
      else b.textContent="·";
      rowd.appendChild(b);
    });
    imgs.appendChild(rowd); content.appendChild(imgs);
    wrap.appendChild(content); card.appendChild(wrap);
    return card;
  }

  var vis=visibleButtons(cur);
  var page = sc._page||0;
  var per = vis.perPage||4;
  var slice = vis.list.slice(page*per, page*per+per);
  var grid=el("div","grid"); grid.style.marginTop="10px";
  var centre = path.length
    ? ibNode("big mid back", sc.pic, "← Back", "", goBack)
    : ibNode("big mid", G.pic||sc.pic, G.name||"Me", "", toggleMe);
  function slotAt(i){
    var b=slice[i];
    if(!b) return ibNode("locked","", "???", "", null);
    var eff=(b.fx||[]).map(fmtFx).join(" ");
    return ibNode("", b.pic, b.label, eff, function(){ pressButton(cur,b); });
  }
  grid.appendChild(slotAt(0)); grid.appendChild(centre); grid.appendChild(slotAt(1));
  grid.appendChild(slotAt(2)); grid.appendChild(slotAt(3));
  card.appendChild(grid);

  if(vis.list.length > per){
    var pg=el("div","pager");
    pg.appendChild(mkBtn("◀","",function(){ sc._page=Math.max(0,page-1); draw(); }));
    pg.appendChild(el("span","muted",(page+1)+" / "+Math.ceil(vis.list.length/per)));
    pg.appendChild(mkBtn("▶","",function(){
      sc._page=Math.min(Math.ceil(vis.list.length/per)-1, page+1); draw(); }));
    card.appendChild(pg);
  }

  if(!path.length){
    var foot=el("div"); foot.style.cssText="margin-top:10px;text-align:center;";
    var last = G.day>=CFG.days;
    var w=mkBtn(last?"A few years later…":("Go to Day "+(G.day+1)),"",function(){ advance(false); });
    w.style.cssText="font-size:15px;padding:9px 0;width:250px;font-weight:bold;";
    foot.appendChild(w);
    var cap=el("p",null,CFG.skipCaption||"Or wait until 12AM PST.");
    cap.style.cssText="margin:6px 0;font-size:13px;color:#000;";
    foot.appendChild(cap);
    var b2=mkBtn((last?"A few years later…":("Skip to Day "+(G.day+1)))+" (−✨"+(CFG.apSkip||5)+")",
      "act",function(){ advance(true); });
    b2.style.cssText="font-size:15px;padding:9px 0;width:250px;";
    foot.appendChild(b2);
    card.appendChild(foot);
  }
  if(convMsg){ card.appendChild(el("p",null,convMsg)).style.cssText=
    "margin-top:10px;font-weight:bold;text-align:center;"; convMsg=""; }
  return card;
}
function pressButton(screenId,b){
  applyFx(b);
  if(b.message) convMsg=b.message;
  if(b.leads && SCREENS[b.leads]) path.push(b.leads);
  draw();
}
function goBack(){ path.pop(); draw(); }
function advance(spend){
  if(spend){
    if(apVal() < (CFG.apSkip||5)){ convMsg="Not enough ✨ — do some practice!"; draw(); return; }
    S.ap = apVal() - (CFG.apSkip||5); gstore.saveStudentAP();
  }
  if(G.day >= CFG.days){ endRun(); return; }
  G.day++; path=[]; draw();
}
function endRun(){
  G.over=true;
  Object.keys(CFG.endings||{}).forEach(function(cat){
    var list=CFG.endings[cat]||[];
    for(var i=0;i<list.length;i++){
      if((list[i].conds||[]).every(condOK)){ G.found[cat+"|"+i]=true; break; }
    }
  });
  path=[]; endCat=null; endIdx=null; draw();
}
function askRestart(){
  showModal("<h2>Restart this game?</h2><p style='margin:10px 0;'>"+esc(CFG.restartText)+"</p>",
   [{label:"Yes",cls:"act",fn:doRestart},{label:"No",fn:hideModal}]);
}
function doRestart(){
  var keep={stats:G.stats, inv:G.inv, found:G.found, name:G.name, pic:G.pic, bg:G.bg};
  G=freshGame(keep); path=[]; showMe=false; showEndings=false; hideModal(); draw();
}

/* ---------- Me panel ---------- */
function toggleMe(){ showMe=!showMe; showConvert=false; showEndings=false; draw(); }
function drawMe(){
  var card=el("div","card"); card.style.background="#fafafa";
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,G.name||"Me"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("⚙","",function(){ showGear=!showGear; draw(); }));
  ctr.appendChild(mkBtn("Endings","act",function(){ showEndings=!showEndings; draw(); }));
  ctr.appendChild(mkBtn("Close ▴","close",toggleMe));
  head.appendChild(ctr); card.appendChild(head);

  var split=el("div"); split.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;";
  var left=el("div");
  left.appendChild(el("p",null,"Stats")).style.cssText="font-weight:bold;margin:0 0 5px;";
  var t=el("table");
  var apr=document.createElement("tr");
  apr.appendChild(el("td",null,"✨ Action points")).style.width="56%";
  apr.appendChild(el("td")).innerHTML="<strong>"+apVal()+"</strong>";
  t.appendChild(apr);
  (CFG.stats||[]).forEach(function(s){
    if(s.name==="__AP__") return;
    var tr=document.createElement("tr");
    tr.appendChild(el("td",null,(s.emoji?s.emoji+" ":"")+s.name));
    var td=el("td"); td.innerHTML="<strong>"+statVal(s.name)+"</strong>"; tr.appendChild(td);
    t.appendChild(tr);
  });
  left.appendChild(t); split.appendChild(left);

  var right=el("div");
  right.appendChild(el("p",null,"Inventory")).style.cssText="font-weight:bold;margin:0 0 5px;";
  var inv=el("div","inv");
  var keys=Object.keys(G.inv);
  var pg=G._invPage||0;
  for(var i=0;i<9;i++){
    var k=keys[pg*9+i];
    if(k){
      var it=null; (CFG.items||[]).forEach(function(x){ if(x.name===k) it=x; });
      var s=el("div","islot");
      var p=el("span","p");
      if(it && it.pic){ var im=document.createElement("img"); im.src=it.pic; p.appendChild(im); }
      else p.textContent="["+k.toLowerCase()+"]";
      s.appendChild(p);
      s.appendChild(el("span","l", k+(G.inv[k]>1?" (×"+G.inv[k]+")":"")));
      (function(kk){ s.onclick=function(){ invPick=kk; draw(); }; })(k);
      inv.appendChild(s);
    } else {
      var e2=el("div","islot empty");
      e2.appendChild(el("span","p","·")); e2.appendChild(el("span","l"," "));
      inv.appendChild(e2);
    }
  }
  right.appendChild(inv);
  var pgr=el("div","pager");
  pgr.appendChild(mkBtn("◀","",function(){ G._invPage=Math.max(0,pg-1); draw(); }));
  pgr.appendChild(el("span","muted",(pg+1)+" / "+(CFG.invPages||10)));
  pgr.appendChild(mkBtn("▶","",function(){ G._invPage=Math.min((CFG.invPages||10)-1,pg+1); draw(); }));
  right.appendChild(pgr);
  split.appendChild(right);
  card.appendChild(split);

  if(invPick && G.inv[invPick]){
    var it2=null; (CFG.items||[]).forEach(function(x){ if(x.name===invPick) it2=x; });
    var d=el("div"); d.style.cssText="border:2px solid #000;background:#fff;padding:9px;margin-top:10px;";
    var dh=el("div","cardhead"); dh.appendChild(el("strong",null,invPick));
    var dc=el("div","ctrls");
    dc.appendChild(mkBtn("Throw away","del",function(){
      if(confirm("Throw away your "+invPick+"?")){ delete G.inv[invPick]; invPick=null; draw(); } }));
    dc.appendChild(mkBtn("Close ▴","close",function(){ invPick=null; draw(); }));
    dh.appendChild(dc); d.appendChild(dh);
    d.appendChild(el("p",null,(it2&&it2.desc)||"")).style.margin="6px 0 0";
    card.appendChild(d);
  }

  if(showGear) card.appendChild(drawGear());
  if(showEndings) card.appendChild(drawCollection());
  return card;
}
function drawGear(){
  var d=el("div"); d.style.cssText="border:2px solid #000;background:#fff;padding:10px;margin-top:10px;";
  var h=el("div","cardhead"); h.appendChild(el("h2",null,"⚙ Character & look"));
  var c=el("div","ctrls");
  c.appendChild(mkBtn("Close ▴","close",function(){ showGear=false; draw(); }));
  h.appendChild(c); d.appendChild(h);
  d.appendChild(el("div","lab","Character name"));
  var n=document.createElement("input"); n.type="text"; n.value=G.name||"Me";
  n.onchange=function(){ G.name=n.value.trim()||"Me"; gstore.save(); draw(); };
  d.appendChild(n);
  d.appendChild(el("div","lab","Character picture — link or upload"));
  var row=el("div"); row.style.cssText="display:flex;gap:6px;flex-wrap:wrap;";
  var p=document.createElement("input"); p.type="url"; p.value=G.pic||""; p.placeholder="https://…";
  p.style.cssText="flex:1;min-width:180px;";
  p.onchange=function(){ G.pic=p.value.trim(); gstore.save(); draw(); };
  row.appendChild(p);
  var f=document.createElement("input"); f.type="file"; f.accept="image/*"; f.style.display="none";
  f.onchange=function(){ if(f.files[0]) shrinkImage(f.files[0],400,function(u){
    G.pic=u; gstore.save(); draw(); }); };
  row.appendChild(mkBtn("Choose file…","",function(){ f.click(); }));
  row.appendChild(f);
  d.appendChild(row);
  d.appendChild(el("div","lab","Background for all game boxes"));
  var sw=el("div"); sw.style.cssText="display:flex;gap:5px;flex-wrap:wrap;";
  ["#ffffff","#eef6ef","#fdf0f5","#eef3fb","#fbf6e9","#f3eefb"].forEach(function(col){
    var b=mkBtn("","",function(){ G.bg=col; gstore.save(); draw(); });
    b.style.cssText="width:26px;height:26px;padding:0;background:"+col+";";
    sw.appendChild(b);
  });
  d.appendChild(sw);
  return d;
}

/* ---------- convert ---------- */
function openConvert(){ showConvert=!showConvert; showMe=false; convCat=null; draw(); }
function drawConvert(){
  var cfg=CFG.convert||{cats:[]};
  var card=el("div","card"); if(G.bg) card.style.background=G.bg;
  card.style.marginTop="10px";
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"Convert"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ showConvert=false; draw(); }));
  head.appendChild(ctr); card.appendChild(head);

  var grid=el("div","grid"); grid.style.marginTop="10px";
  if(convCat===null){
    var cats=(cfg.cats||[]).filter(function(c){ return (c.conds||[]).every(condOK); });
    function catSlot(i){
      var c=cats[i];
      if(!c) return ibNode("locked","","???","",null);
      return ibNode("", c.pic, c.label, "", function(){ convCat=i; draw(); });
    }
    grid.appendChild(catSlot(0));
    grid.appendChild(ibNode("big mid back", cfg.pic, cfg.label||"Convert ✨ to…","",
      function(){ showConvert=false; draw(); }));
    grid.appendChild(catSlot(1)); grid.appendChild(catSlot(2)); grid.appendChild(catSlot(3));
  } else {
    var c=(cfg.cats||[])[convCat]||{options:[]};
    var opts=(c.options||[]).filter(function(o){ return (o.conds||[]).every(condOK); });
    function optSlot(i){
      var o=opts[i];
      if(!o) return ibNode("locked","","???","",null);
      return ibNode("", o.pic||c.pic, o.label, "", function(){ doConvert(o); });
    }
    grid.appendChild(optSlot(0));
    grid.appendChild(ibNode("big mid back", c.pic, "← Back","", function(){ convCat=null; draw(); }));
    grid.appendChild(optSlot(1)); grid.appendChild(optSlot(2)); grid.appendChild(optSlot(3));
  }
  card.appendChild(grid);
  if(convMsg){ var p=el("p",null,convMsg);
    p.style.cssText="margin-top:10px;font-weight:bold;text-align:center;";
    card.appendChild(p); convMsg=""; }
  return card;
}
function doConvert(o){
  if(apVal() < (o.cost||0)){ convMsg="Not enough ✨ — do some practice!"; draw(); return; }
  S.ap = apVal() - (o.cost||0); gstore.saveStudentAP();
  var g=o.gain||{};
  if(g.kind==="item"){ G.inv[g.target]=(G.inv[g.target]||0)+(g.amount||1); convMsg="Got a "+g.target+"."; }
  else if(g.kind==="day"){ G.day=Math.min(CFG.days,G.day+(g.amount||1)); path=[];
    convMsg="Skipped "+(g.amount||1)+" day(s)."; }
  else { G.stats[g.target]=statVal(g.target)+(g.amount||0); convMsg=g.target+" +"+(g.amount||0)+"."; }
  draw();
}

/* ---------- endings ---------- */
function drawEnding(){
  var card=el("div","card"); if(G.bg) card.style.background=G.bg;
  card.appendChild(header());
  var cats=Object.keys(CFG.endings||{});
  if(endCat!==null && endIdx!==null){
    var e=(CFG.endings[endCat]||[])[endIdx]||{};
    var wrap=el("div","p2"); wrap.style.marginTop="10px";
    wrap.appendChild(ibNode("back", e.pic, "← Back","", function(){ endCat=null; endIdx=null; draw(); }));
    var content=el("div","content");
    var txt=el("div","txt");
    txt.innerHTML="<p style='margin:0 0 6px;'><strong style='font-size:17px;'>"+esc(e.title||"")+
      "</strong></p>"+(e.text||"");
    content.appendChild(txt);
    var imgs=el("div","imgs"); var r=el("div","imgrow");
    (e.images||[]).forEach(function(im){
      var b=el("div","imgbox");
      if(im.url){ var i=document.createElement("img"); i.src=im.url; b.appendChild(i); }
      r.appendChild(b);
    });
    imgs.appendChild(r); content.appendChild(imgs);
    wrap.appendChild(content); card.appendChild(wrap);
    return card;
  }
  var grid=el("div","grid"); grid.style.marginTop="10px";
  function catSlot(i){
    var cat=cats[i];
    if(!cat) return ibNode("locked","","???","",null);
    var list=CFG.endings[cat]||[], idx=-1;
    for(var k=0;k<list.length;k++){ if((list[k].conds||[]).every(condOK)){ idx=k; break; } }
    return ibNode("", (list[idx]||{}).pic, cat, "how it ended", function(){
      endCat=cat; endIdx=idx>=0?idx:0; draw(); });
  }
  grid.appendChild(catSlot(0));
  grid.appendChild(ibNode("big mid again","", "↻ Play again","", askRestart));
  grid.appendChild(catSlot(1)); grid.appendChild(catSlot(2)); grid.appendChild(catSlot(3));
  card.appendChild(grid);
  return card;
}
function drawCollection(){
  var cats=Object.keys(CFG.endings||{});
  var total=0, got=0;
  cats.forEach(function(c){ (CFG.endings[c]||[]).forEach(function(e,i){
    total++; if(G.found[c+"|"+i]) got++; }); });
  var card=el("div","card"); card.style.marginTop="10px";
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,"Endings — "+got+" of "+total+" found"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ showEndings=false; draw(); }));
  head.appendChild(ctr); card.appendChild(head);

  var grid=el("div","grid"); grid.style.marginTop="10px";
  function catSlot(i){
    var cat=cats[i];
    if(!cat) return ibNode("locked","","???","",null);
    var list=CFG.endings[cat]||[], n=0;
    list.forEach(function(e,k){ if(G.found[cat+"|"+k]) n++; });
    if(!n) return ibNode("locked","","???", "0 of "+list.length+" found", null);
    return ibNode("", (list[0]||{}).pic, cat, n+" of "+list.length+" found", function(){
      showEndingCat(cat); });
  }
  grid.appendChild(catSlot(0));
  grid.appendChild(ibNode("big mid back", G.pic, "Endings","", function(){ showEndings=false; draw(); }));
  grid.appendChild(catSlot(1)); grid.appendChild(catSlot(2)); grid.appendChild(catSlot(3));
  card.appendChild(grid);
  if(card._sub) card.appendChild(card._sub);
  return card;
}
function showEndingCat(cat){
  var list=CFG.endings[cat]||[];
  var html="<h2>Endings — "+esc(cat)+"</h2><div style='margin-top:10px;'>";
  list.forEach(function(e,i){
    if(G.found[cat+"|"+i])
      html+="<div style='border:1px solid #000;padding:8px;margin-bottom:6px;background:#fff;'>"+
        "<strong>"+esc(e.title)+"</strong><div style='margin-top:5px;'>"+(e.text||"")+"</div></div>";
    else html+="<div style='border:1px solid #000;padding:8px;margin-bottom:6px;background:#111;color:#999;'>???</div>";
  });
  html+="</div>";
  showModal(html,[{label:"Close",cls:"close",fn:hideModal}]);
}
