/* ================= EssayEspresso — the game ================= */
var ME=null, GUEST=false, CFG=null, SCREENS={}, G=null, S={};
var path=[], showMe=false, showGear=false, showEndings=false;
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

var EMBEDDED = !!document.getElementById("gameHost") && !document.getElementById("host");

/* When embedded in the student page, student.js calls gameStart() instead. */
function gameStart(uid, guest, studentDoc){
  ME=uid; GUEST=guest; S=studentDoc||{};
  boot();
}
if(!EMBEDDED){
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
}

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
    var h=gameHostNode();
    if(h) h.appendChild(errBox("Could not load the game: "+e.message+
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
    over:false, dayKey:ptDayKey(), once:{}, flags:(keep&&keep.flags)||{},
    seed:newSeed(), shares:{}, bank:{}, prices:{} };
}
function rolloverCheck(){
  var k=ptDayKey();
  if(G.dayKey !== k){
    var gap = daysBetweenKeys(G.dayKey, k);
    if(gap>0 && !G.over){
      var moved = Math.min(CFG.days, (G.day||1) + gap) - (G.day||1);
      G.day = Math.min(CFG.days, (G.day||1) + gap);
      if(moved>0) applyInterest(moved);
    }
    G.dayKey = k;
    if(G.day>=CFG.days) { /* stays playable; ending triggers via the button */ }
    gstore.save();
  }
}

/* ---------- helpers ---------- */
/* Every run gets its own seed, so two students on the same day see different
   luck, and restarting gives a fresh world. Fixed within a day: reloading
   never rerolls anything. */
function newSeed(){
  function blk(){ return Math.random().toString(36).slice(2,6); }
  return blk()+"-"+blk();
}
function runSeed(){
  if(!G.seed){ G.seed = newSeed(); }
  return G.seed;
}
function gameRand(key){ return rand01(runSeed()+"|"+key); }
function statVal(n){ return (G.stats[n]||0); }
function apVal(){ return S.ap||0; }
function statEmoji(n){
  var f=null; (CFG.stats||[]).forEach(function(s){ if(s.name===n) f=s; });
  return (f&&f.emoji)||n;
}
function fmtFx(f){
  var n=Math.abs(Number(f.amount)||0);
  if(f.kind==="item") return "("+(f.dir==="take"?"Lose":"Get")+": "+f.target+
    (n>1?(" ×"+n):"")+")";
  var nm = f.target==="__AP__" ? "✨" : statEmoji(f.target);
  if(f.op==="x") return "("+nm+"×"+n+")";
  if(f.op==="=") return "("+nm+"="+n+")";
  return "("+nm+(f.dir==="take"?"−":"+")+n+")";
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
function affordable(b){
  var need={};
  (b.fx||[]).forEach(function(f){
    if(f.dir!=="take") return;
    var n=Math.abs(Number(f.amount)||0);
    if(f.kind==="item"){ need["item:"+f.target]=(need["item:"+f.target]||0)+n; }
    else need["stat:"+f.target]=(need["stat:"+f.target]||0)+n;
  });
  return Object.keys(need).every(function(k){
    var amount=need[k];
    if(k.indexOf("item:")===0) return (G.inv[k.slice(5)]||0) >= amount;
    var t=k.slice(5);
    return (t==="__AP__" ? apVal() : statVal(t)) >= amount;
  });
}
function buttonEligible(b){
  if((b.conds||[]).some(function(c){ return !condOK(c); })) return false;
  if(!affordable(b)) return false;
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
    if(gameRand(G.dayKey+"|"+screenId+"|"+b.id)*100 < ch) picked.push(b);
  });
  return {list:picked, perPage:perPage, hideEmpty:sc.hideEmpty};
}
function fxDelta(f){
  // give/take always carry a positive amount; direction comes from the kind
  var n = Math.abs(Number(f.amount)||0);
  return (f.dir==="take") ? -n : n;
}
function applyFx(b){
  (b.fx||[]).forEach(function(f){
    if(f.kind==="item"){
      var cur=G.inv[f.target]||0;
      var amt=fxDelta(f);
      if(amt>0){
        var slots=(CFG.invPages||10)*9;
        if(Object.keys(G.inv).length>=slots && !cur){ convMsg="Your bag is full."; return; }
      }
      G.inv[f.target]=cur+amt;
      if(G.inv[f.target]<=0) delete G.inv[f.target];
      return;
    }
    var d=fxDelta(f);
    if(f.target==="__AP__"){
      if(f.op==="x") S.ap=Math.floor((S.ap||0)*Math.abs(f.amount||1));
      else if(f.op==="=") S.ap=Math.abs(f.amount||0);
      else S.ap=Math.max(0,(S.ap||0)+d);
      gstore.saveStudentAP(); return;
    }
    var v=statVal(f.target);
    if(f.op==="x") v=Math.floor(v*Math.abs(f.amount||1));
    else if(f.op==="/") v=Math.max(0,Math.floor(v/(Math.abs(f.amount)||1)));
    else if(f.op==="=") v=Math.abs(f.amount||0);
    else v=v+d;
    var max=null; (CFG.stats||[]).forEach(function(s){ if(s.name===f.target && s.max!=null) max=s.max; });
    if(max!=null) v=Math.min(max,v);
    G.stats[f.target]=Math.max(0,v);
  });
  if(b.limit==="once") G.once[b.id]=true;
  if(b.limit==="daily") G.once[b.id]=G.dayKey;
  if(b.setsFlag){ G.flags=G.flags||{}; G.flags[b.setsFlag]=true; }
}

/* ---------- shared bits of screen furniture ---------- */
function backButton(){
  var b=mkBtn("← Back","backbtn");
  b.className="backbtn";
  b.onclick=goBack;
  return b;
}
/* The framed centre slot: "who you are" at the top, "where you are" deeper in.
   The frame travels with the player. */
function centreColumn(sc){
  var wrapc=el("div"); wrapc.className="mid";
  if(path.length){
    wrapc.appendChild(ibNode("big here", sc.pic, sc.label||"", "", null));
    if(titleLines().length) wrapc.appendChild(titleBox());
    wrapc.appendChild(backButton());
  } else {
    var me=ibNode("big here", G.pic||sc.pic, G.name||"Me", "", toggleMe);
    me.classList.remove("here");        /* the character is clickable */
    me.classList.add("here");
    me.style.cursor="pointer";
    me.disabled=false;
    me.onclick=toggleMe;
    wrapc.appendChild(me);
    if(titleLines().length) wrapc.appendChild(titleBox());
  }
  return wrapc;
}
function titleBox(){
  var tb=el("div","titlebox");
  titleLines().forEach(function(t){ tb.appendChild(el("div","t",t)); });
  return tb;
}
/* Narrative text sits under the centre column, not flush left. */
function addNarrative(card, html){
  if(!html) return;
  var n=el("div","narr");
  n.innerHTML=html;
  card.appendChild(n);
}
function goldName(){
  var g=null;
  (CFG.stats||[]).forEach(function(s){ if(s.emoji==="🪙") g=s.name; });
  return g || "Gold";
}
function coin(n){ return "🪙"+n; }
function bold(n){ var b=el("strong",null,String(n)); return b; }
function tdHTML(html,cls){ var t=el("td",cls||"mid"); t.innerHTML=html; return t; }
function thTxt(txt,cls){ var t=el("th",cls||null,txt); return t; }
function qtyRow(maxFn, allLabel, goLabel, goFn){
  var wrap=el("div","qty");
  var inp=document.createElement("input");
  inp.type="number"; inp.min="1"; inp.value="1";
  wrap.appendChild(inp);
  if(allLabel){
    var mx=maxFn();
    var a=mkBtn(allLabel+" ("+mx+")","go",function(){ inp.value=String(Math.max(1,mx)); });
    if(mx<1) a.disabled=true;
    wrap.appendChild(a);
  }
  var go=mkBtn(goLabel,"act",function(){
    var n=Math.floor(Number(inp.value)||0);
    if(n>0) goFn(n);
  });
  go.style.fontWeight="bold";
  wrap.appendChild(go);
  return wrap;
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
  if(EMBEDDED) ctr.appendChild(mkBtn("Close ▴","close",function(){
    clear($("gameHost")); if(window.onGameClosed) window.onGameClosed(); }));
  head.appendChild(ctr);
  return head;
}
function gameHostNode(){ return $("host") || $("gameHost"); }
function draw(){
  var host=gameHostNode(); if(!host) return;
  clear(host);
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

  if(sc.type===3) return drawCounter(card, sc, cur);
  if(sc.type===4) return drawMarket(card, sc, cur);

  if(sc.type===2){
    var wrap=el("div","p2"); wrap.style.marginTop="10px";
    var lefty=el("div");
    lefty.appendChild(ibNode("big here", sc.pic, sc.label||"", "", null));
    if(path.length) lefty.appendChild(backButton());
    wrap.appendChild(lefty);
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
    addNarrative(card, sc.footText);
    return card;
  }

  var vis=visibleButtons(cur);
  var page = sc._page||0;
  var per = vis.perPage||4;
  var slice = vis.list.slice(page*per, page*per+per);
  var grid=el("div","grid"); grid.style.marginTop="10px";
  var centre = centreColumn(sc);
  function slotAt(i){
    var b=slice[i];
    if(!b){
      if(sc.hideEmpty){ var ph=el("div"); return ph; }   // truly invisible
      return ibNode("locked","", "???", "", null);
    }
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
  addNarrative(card, sc.footText);
  if(convMsg){ card.appendChild(el("p",null,convMsg)).style.cssText=
    "margin-top:10px;font-weight:bold;text-align:center;"; convMsg=""; }
  return card;
}
/* ================= prices: the four tracks ================= */
var TRACKS=["increase","decrease","stable","wild"];
var PRICE_CACHE={};
function stockDefs(){ return (CFG.stocks||[]); }
function stockByTicker(t){
  var f=null; stockDefs().forEach(function(s){ if(s.ticker===t) f=s; });
  return f;
}
function clampPrice(v, lo, hi){
  v=Math.round(v);
  if(v<lo) v=lo;
  if(v>hi) v=hi;
  return Math.max(1,v);
}
function stepPrice(p, track, lo, hi, r){
  var span=Math.max(1,hi-lo);
  if(track==="increase") return p + (r*(hi-p)*0.45) + 1;
  if(track==="decrease") return p - (r*(p-lo)*0.45) - 1;
  if(track==="wild")     return lo + r*span;
  return p + (r-0.5)*span*0.18;                     /* stable */
}
/* The whole price history for one stock, day 1 to today, from the run seed. */
function priceSeries(st){
  var key = runSeed()+"|"+st.ticker+"|"+(G.day||1);
  if(PRICE_CACHE[key]) return PRICE_CACHE[key];
  var lo=Math.max(1, Number(st.low)||1), hi=Math.max(lo+1, Number(st.high)||20);
  var track = st.startTrack && st.startTrack!=="random" ? st.startTrack
            : TRACKS[Math.floor(gameRand(st.ticker+"|track0")*TRACKS.length)];
  var p = (st.start!==undefined && st.start!=="" && st.start!==null)
        ? Number(st.start) : lo + gameRand(st.ticker+"|p0")*(hi-lo);
  var out=[];
  var switchPct = Number(st.switchPct);
  if(isNaN(switchPct)) switchPct = 25;
  for(var d=1; d<=(G.day||1); d++){
    out.push(clampPrice(p, lo, hi));
    if(gameRand(st.ticker+"|sw|"+d)*100 < switchPct){
      track = TRACKS[Math.floor(gameRand(st.ticker+"|nt|"+d)*TRACKS.length)];
    }
    p = stepPrice(out[out.length-1], track, lo, hi, gameRand(st.ticker+"|mv|"+d));
  }
  PRICE_CACHE[key]=out;
  return out;
}
function priceToday(st){ var s=priceSeries(st); return s[s.length-1]; }
function priceYesterday(st){ var s=priceSeries(st); return s.length>1?s[s.length-2]:s[0]; }

/* ================= holdings ================= */
function holding(t){
  G.shares = G.shares || {};
  return G.shares[t] || {n:0, spent:0};
}
function goldHeld(){ return statVal(goldName()); }
function addGold(n){
  var g=goldName();
  var max=null; (CFG.stats||[]).forEach(function(s){ if(s.name===g && s.max!=null) max=s.max; });
  var v=Math.max(0, goldHeld()+n);
  if(max!=null) v=Math.min(max,v);
  G.stats[g]=v;
}

/* ================= page type 3 — counter (bank / store) ================= */
var counterView=null;   /* null | deposit | withdraw | buy | sell */

function bankBalance(id){ G.bank=G.bank||{}; return G.bank[id]||0; }
function setBank(id,v){ G.bank=G.bank||{}; G.bank[id]=Math.max(0,Math.round(v)); }

function drawCounter(card, sc, cur){
  var mode = sc.counterMode==="store" ? "store" : "bank";
  if(counterView){
    card.appendChild(mode==="store" ? storeBox(sc,cur) : bankBox(sc,cur));
    return card;
  }
  var grid=el("div","grid"); grid.style.marginTop="10px";
  var leftLbl  = mode==="store" ? "Buy"  : "Deposit";
  var rightLbl = mode==="store" ? "Sell" : "Withdraw";
  var leftPic  = mode==="store" ? sc.buyPic  : sc.depositPic;
  var rightPic = mode==="store" ? sc.sellPic : sc.withdrawPic;
  var leftView = mode==="store" ? "buy" : "deposit";
  var rightView= mode==="store" ? "sell" : "withdraw";

  grid.appendChild(ibNode("", leftPic, leftLbl, "", function(){ counterView=leftView; draw(); }));
  grid.appendChild(centreColumn(sc));
  var canSell = mode!=="store" || sc.allowSell!==false;
  grid.appendChild(canSell
    ? ibNode("", rightPic, rightLbl, "", function(){ counterView=rightView; draw(); })
    : el("div"));
  grid.appendChild(el("div")); grid.appendChild(el("div"));
  card.appendChild(grid);

  var note = sc.footText;
  if(!note && mode==="bank"){
    var pct=Number(sc.interest)||0;
    note = "<strong>You have "+coin(bankBalance(cur))+" in the bank.</strong>"
         + (pct ? (" Growing "+pct+"% a day.") : "");
  }
  addNarrative(card, note);
  return card;
}

function boxHead(title, card){
  var h=el("div","cardhead");
  h.appendChild(el("h2",null,title));
  var c=el("div","ctrls");
  c.appendChild(el("span","hdrbtn", coin(goldHeld())));
  c.appendChild(mkBtn("Close ▴","close",function(){ counterView=null; draw(); }));
  h.appendChild(c);
  card.appendChild(h);
}

function bankBox(sc,cur){
  var box=el("div"); box.style.cssText="border:1px solid #000;background:#eef3fb;padding:12px;margin-top:10px;";
  var depositing = counterView==="deposit";
  boxHead(depositing?"Deposit":"Withdraw", box);
  var bal=bankBalance(cur);
  var cap=Number(sc.maxBalance)||0;
  var line=el("p"); line.style.margin="8px 0";
  line.innerHTML="You have <strong>"+coin(bal)+"</strong> in the bank.";
  box.appendChild(line);

  var maxFn = depositing
    ? function(){ var m=goldHeld(); if(cap) m=Math.min(m, Math.max(0,cap-bal)); return m; }
    : function(){ return bal; };

  box.appendChild(qtyRow(maxFn, null, depositing?"Deposit":"Withdraw", function(n){
    var lim=maxFn();
    if(n>lim){ convMsg = depositing
      ? (cap && bal+n>cap ? "The bank won't hold more than "+coin(cap)+"." : "You don't have that much gold.")
      : "There isn't that much in the bank.";
      draw(); return; }
    if(depositing){ addGold(-n); setBank(cur, bal+n); }
    else { addGold(n); setBank(cur, bal-n); }
    counterView=null; draw();
  }));
  if(cap) box.appendChild(el("p","muted","The bank holds at most "+coin(cap)+"."));
  return box;
}

function sellPriceOf(it, sc){
  if(it.sell!==undefined && it.sell!==null && it.sell!=="") return Math.max(0,Math.round(Number(it.sell)));
  var pct = Number(sc && sc.defaultSellPct);
  if(isNaN(pct)) pct = 50;
  if(it.buy===undefined || it.buy===null || it.buy==="") return null;
  return Math.max(0, Math.round(Number(it.buy)*pct/100));
}
function storeStock(sc){
  var all=(CFG.items||[]).filter(function(i){
    return i.buy!==undefined && i.buy!==null && i.buy!=="";
  });
  if(sc.stockList && sc.stockList.length){
    all = all.filter(function(i){ return sc.stockList.indexOf(i.name)>=0; });
  }
  return all;
}
function storeBox(sc,cur){
  var buying = counterView==="buy";
  var box=el("div"); box.style.cssText="border:1px solid #000;background:#eef3fb;padding:12px;margin-top:10px;";
  boxHead(buying?"Buy":"Sell", box);
  var t=el("table"); t.style.marginTop="8px";
  var hr=document.createElement("tr");
  hr.appendChild(thTxt("Item"));
  hr.appendChild(thTxt(buying?"Price":"Sells for","gR"));
  hr.appendChild(thTxt("You have…","ctr gR"));
  hr.appendChild(thTxt(buying?"Buy how many?":"Sell how many?"));
  t.appendChild(hr);

  var list = buying ? storeStock(sc)
                    : (CFG.items||[]).filter(function(i){ return (G.inv[i.name]||0)>0; });
  if(!list.length){
    box.appendChild(t);
    box.appendChild(el("p","muted", buying?"Nothing for sale here.":"You have nothing to sell."));
    return box;
  }
  list.forEach(function(it){
    var have=G.inv[it.name]||0;
    var price = buying ? Math.max(0,Math.round(Number(it.buy)||0)) : sellPriceOf(it, sc);
    var tr=document.createElement("tr");
    tr.appendChild(tdHTML("<strong>"+esc(it.name)+"</strong>"));
    if(price===null){
      tr.appendChild(tdHTML("<span class='muted'>not sellable</span>","mid gR"));
      tr.appendChild(tdHTML("<strong>"+have+"</strong>","ctr mid gR"));
      tr.appendChild(tdHTML("<span class='muted'>—</span>"));
      tr.style.opacity=".55";
      t.appendChild(tr); return;
    }
    tr.appendChild(tdHTML(coin("<strong>"+price+"</strong>")+" each","mid gR"));
    tr.appendChild(tdHTML("<strong>"+have+"</strong>","ctr mid gR"));
    var cell=el("td","mid");
    var maxFn = buying
      ? function(){ return price>0 ? Math.floor(goldHeld()/price) : 0; }
      : function(){ return have; };
    cell.appendChild(qtyRow(
      buying ? null : maxFn,
      buying ? null : "All",
      (buying?"Buy for ":"Sell for ")+coin(price),
      function(n){
        if(buying){
          if(n*price > goldHeld()){ convMsg="You can't afford that many."; draw(); return; }
          var slots=(CFG.invPages||10)*9;
          if(!have && Object.keys(G.inv).length>=slots){ convMsg="Your bag is full."; draw(); return; }
          addGold(-n*price); G.inv[it.name]=have+n;
        } else {
          if(n>have){ convMsg="You don't have that many."; draw(); return; }
          addGold(n*price); G.inv[it.name]=have-n;
          if(G.inv[it.name]<=0) delete G.inv[it.name];
        }
        counterView=null; draw();
      }));
    tr.appendChild(cell);
    t.appendChild(tr);
  });
  box.appendChild(t);
  return box;
}

/* ================= page type 4 — market (stocks) ================= */
var marketView=null;      /* null | buy | sell */
var showDetails=false, chartTicker=null, chartAll=false;

function drawMarket(card, sc, cur){
  if(marketView){ card.appendChild(marketBox(sc,cur)); return card; }

  var two=el("div","p2"); two.style.marginTop="10px";
  var lefty=el("div");
  lefty.appendChild(ibNode("big here", sc.pic, sc.label||"", "", null));
  if(path.length) lefty.appendChild(backButton());
  two.appendChild(lefty);

  var righty=el("div");
  var pair=el("div");
  pair.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:8px;";
  pair.appendChild(ibNode("", sc.buyPic, "Buy", "", function(){ marketView="buy"; draw(); }));
  pair.appendChild(ibNode("", sc.sellPic, "Sell", "", function(){ marketView="sell"; draw(); }));
  righty.appendChild(pair);

  var det=mkBtn(showDetails?"Hide details":"See details","detbtn");
  det.className = showDetails ? "detbtn on" : "detbtn";
  det.onclick=function(){ showDetails=!showDetails; draw(); };
  righty.appendChild(det);
  two.appendChild(righty);
  card.appendChild(two);

  if(showDetails){
    card.appendChild(marketTable(sc));
    card.appendChild(marketChart());
  }
  addNarrative(card, sc.footText);
  return card;
}

function marketTable(sc){
  var t=el("table"); t.style.marginTop="14px";
  var hr=document.createElement("tr");
  hr.appendChild(thTxt("Stock"));
  hr.appendChild(thTxt("Description"));
  hr.appendChild(thTxt("Today's price","gR"));
  hr.appendChild(thTxt("You have…","ctr"));
  hr.appendChild(thTxt("You spent…"));
  hr.appendChild(thTxt("Today, they're…","gR"));
  hr.appendChild(thTxt("Buy or sell:"));
  t.appendChild(hr);

  stockDefs().forEach(function(st){
    var p=priceToday(st), h=holding(st.ticker);
    var tr=document.createElement("tr");
    if(chartTicker===st.ticker) tr.style.background="#fdf3cf";
    tr.style.cursor="pointer";
    tr.onclick=function(){ chartTicker=st.ticker; draw(); };

    var c=esc(st.color||"#000");
    tr.appendChild(tdHTML("<span class='tick' style='color:"+c+"'>"+esc(st.ticker)+"</span>"));
    tr.appendChild(tdHTML("<span style='color:"+c+";font-weight:bold'>"+esc(st.desc||"")+"</span>"));
    tr.appendChild(tdHTML(coin("<strong>"+p+"</strong>")+" each","mid gR"));
    tr.appendChild(tdHTML(h.n ? ("<strong>"+h.n+"</strong> shares") : "<span class='muted'>—</span>","ctr mid"));
    if(h.n){
      var per=Math.round(h.spent/h.n);
      tr.appendChild(tdHTML(coin("<strong>"+h.spent+"</strong>")+" total <span class='muted'>("
        +coin("<strong>"+per+"</strong>")+" each)</span>"));
      var worth=h.n*p, diff=worth-h.spent;
      var arrow = diff>0 ? "<span class='up'>▲+"+diff+"</span>"
                : diff<0 ? "<span class='down'>▼"+diff+"</span>"
                : "<span class='muted'>—</span>";
      tr.appendChild(tdHTML(coin("<strong>"+worth+"</strong>")+" "+arrow
        +" <span class='muted'>("+coin("<strong>"+p+"</strong>")+" each)</span>","mid gR"));
    } else {
      tr.appendChild(tdHTML("<span class='muted'>—</span>"));
      tr.appendChild(tdHTML("<span class='muted'>—</span>","mid gR"));
    }
    var act=el("td","mid");
    var bb=mkBtn("Buy","act",function(e){ e.stopPropagation(); marketView="buy"; chartTicker=st.ticker; draw(); });
    bb.style.fontWeight="bold"; act.appendChild(bb);
    var sb=mkBtn("Sell","del",function(e){ e.stopPropagation(); marketView="sell"; chartTicker=st.ticker; draw(); });
    sb.style.fontWeight="bold";
    if(!h.n) sb.disabled=true;
    act.appendChild(sb);
    tr.appendChild(act);
    t.appendChild(tr);
  });
  return t;
}

function marketChart(){
  var defs=stockDefs();
  if(!defs.length) return el("div");
  var st = stockByTicker(chartTicker) || defs[0];
  chartTicker = st.ticker;
  var series = priceSeries(st);
  var days = chartAll ? series.length : Math.min(10, series.length);
  var slice = series.slice(series.length-days);
  var startDay = (G.day||1) - days + 1;
  var lo=Math.max(1,Number(st.low)||1), hi=Math.max(lo+1,Number(st.high)||20);

  var w=el("div","chartwrap");
  var h=el("div","cardhead"); h.style.marginBottom="8px";
  var lbl=el("span");
  lbl.innerHTML="<span class='tick' style='color:"+esc(st.color||"#000")+"'>"+esc(st.ticker)
    +"</span> <span style='color:"+esc(st.color||"#000")+";font-weight:bold'>"+esc(st.desc||"")+"</span>";
  h.appendChild(lbl);
  var ctr=el("div","ctrls");
  var b10=mkBtn("Last 10 days", chartAll?"":"act", function(){ chartAll=false; draw(); });
  var ball=mkBtn("All days", chartAll?"act":"", function(){ chartAll=true; draw(); });
  if(!chartAll) b10.style.fontWeight="bold"; else ball.style.fontWeight="bold";
  ctr.appendChild(b10); ctr.appendChild(ball);
  h.appendChild(ctr); w.appendChild(h);

  w.appendChild(el("div","ylab","🪙 per share"));
  var plot=el("div","plot");
  var ax=el("div","yaxis");
  [hi, Math.round(hi*0.75), Math.round(hi*0.5), Math.round(hi*0.25), 0].forEach(function(v){
    ax.appendChild(el("div",null,String(v)));
  });
  plot.appendChild(ax);
  var bars=el("div","bars");
  slice.forEach(function(v,i){
    var col=el("div","bcol");
    var b=el("div","bar");
    b.style.height = Math.max(1, Math.round(v/hi*100)) + "%";
    b.style.background = st.color||"#666";
    if(i < slice.length-1) b.style.opacity=".35";
    b.title = "Day "+(startDay+i)+" — "+coin(v);
    col.appendChild(b);
    bars.appendChild(col);
  });
  plot.appendChild(bars);
  w.appendChild(plot);
  var xa=el("div","xaxis");
  slice.forEach(function(_,i){ xa.appendChild(el("div",null,"Day "+(startDay+i))); });
  w.appendChild(xa);
  return w;
}

function marketBox(sc,cur){
  var buying = marketView==="buy";
  var box=el("div"); box.style.cssText="border:1px solid #000;background:#eef3fb;padding:12px;margin-top:10px;";
  var h=el("div","cardhead");
  h.appendChild(el("h2",null, buying?"Buy":"Sell"));
  var c=el("div","ctrls");
  c.appendChild(el("span","hdrbtn", coin(goldHeld())));
  c.appendChild(mkBtn("Close ▴","close",function(){ marketView=null; draw(); }));
  h.appendChild(c); box.appendChild(h);

  var t=el("table"); t.style.marginTop="8px";
  var hr=document.createElement("tr");
  hr.appendChild(thTxt("Stock"));
  hr.appendChild(thTxt("Description"));
  hr.appendChild(thTxt("Today's price","gR"));
  hr.appendChild(thTxt("You have…","ctr"));
  hr.appendChild(thTxt("You spent…","gR"));
  hr.appendChild(thTxt(buying?"Buy how many?":"Sell how many?"));
  t.appendChild(hr);

  var any=false;
  stockDefs().forEach(function(st){
    var p=priceToday(st), hh=holding(st.ticker);
    var cutPct = Number(sc.sellCutPct)||0;
    var sellAt = buying ? p : Math.max(1, Math.round(p*(100-cutPct)/100));
    var tr=document.createElement("tr");
    var c2=esc(st.color||"#000");
    tr.appendChild(tdHTML("<span class='tick' style='color:"+c2+"'>"+esc(st.ticker)+"</span>"));
    tr.appendChild(tdHTML("<span style='color:"+c2+";font-weight:bold'>"+esc(st.desc||"")+"</span>"));
    tr.appendChild(tdHTML(coin("<strong>"+p+"</strong>")+" each","mid gR"));
    tr.appendChild(tdHTML(hh.n ? ("<strong>"+hh.n+"</strong> shares")
      : "<span class='muted'>"+(buying?"none":"none held")+"</span>","ctr mid"));
    tr.appendChild(tdHTML(hh.n ? (coin("<strong>"+Math.round(hh.spent/hh.n)+"</strong>")+" each")
      : "<span class='muted'>—</span>","mid gR"));

    if(!buying && !hh.n){
      tr.appendChild(tdHTML("<span class='muted'>—</span>"));
      tr.style.opacity=".55";
      t.appendChild(tr); return;
    }
    any=true;
    var cell=el("td","mid");
    var maxFn = buying ? function(){ return p>0?Math.floor(goldHeld()/p):0; }
                       : function(){ return hh.n; };
    cell.appendChild(qtyRow(maxFn, "All",
      (buying?"Buy for ":"Sell for ")+coin(buying?p:sellAt),
      function(n){
        G.shares = G.shares || {};
        if(buying){
          if(n*p > goldHeld()){ convMsg="You can't afford that many."; draw(); return; }
          addGold(-n*p);
          G.shares[st.ticker] = {n:hh.n+n, spent:hh.spent + n*p};
        } else {
          if(n>hh.n){ convMsg="You don't hold that many."; draw(); return; }
          addGold(n*sellAt);
          var left=hh.n-n;
          if(left<=0) delete G.shares[st.ticker];
          else G.shares[st.ticker] = {n:left, spent: Math.round(hh.spent*left/hh.n)};
        }
        marketView=null; draw();
      }));
    tr.appendChild(cell);
    t.appendChild(tr);
  });
  box.appendChild(t);
  if(!stockDefs().length) box.appendChild(el("p","muted","No stocks have been set up yet."));
  else if(!buying && !any) box.appendChild(el("p","muted","You don't hold any shares yet."));
  else box.appendChild(el("p","muted", buying
    ? "\"You spent\" is the average you've paid so far. \"All\" is as many as you can afford."
    : "\"You spent\" is the average you've paid — compare it with today's price."));
  return box;
}

function resetSubViews(){ counterView=null; marketView=null; showDetails=false; }
function pressButton(screenId,b){
  applyFx(b);
  if(b.message) convMsg=b.message;
  if(b.leads && SCREENS[b.leads]){ path.push(b.leads); resetSubViews(); }
  draw();
}
function goBack(){ path.pop(); resetSubViews(); draw(); }
function advance(spend){
  if(spend){
    if(apVal() < (CFG.apSkip||5)){ convMsg="Not enough ✨ — do some practice!"; draw(); return; }
    S.ap = apVal() - (CFG.apSkip||5); gstore.saveStudentAP();
  }
  if(G.day >= CFG.days){ endRun(); return; }
  G.day++; path=[]; resetSubViews(); applyInterest(1); draw();
}
/* Interest lands when the day rolls over, whether they waited or paid ✨ to skip. */
function applyInterest(days){
  G.bank = G.bank || {};
  Object.keys(SCREENS).forEach(function(id){
    var sc=SCREENS[id];
    if(!sc || sc.type!==3 || sc.counterMode==="store") return;
    var pct=Number(sc.interest)||0;
    if(!pct) return;
    var bal=G.bank[id]||0;
    if(!bal) return;
    for(var i=0;i<days;i++) bal = bal + bal*pct/100;
    var cap=Number(sc.maxBalance)||0;
    bal=Math.floor(bal);
    if(cap) bal=Math.min(cap,bal);
    G.bank[id]=bal;
  });
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
  G=freshGame(keep);
  PRICE_CACHE={};
  path=[]; showMe=false; showEndings=false; resetSubViews();
  chartTicker=null; chartAll=false;
  hideModal(); draw();
}

/* ---------- stat pages ---------- */
function statPages(){
  var defs = (CFG.statPages||[]).slice();
  var byName = {};
  defs.forEach(function(nm){ byName[nm]={name:nm, stats:[]}; });
  var loose=[];
  (CFG.stats||[]).forEach(function(st){
    if(st.name==="__AP__") return;
    var pg = st.page;
    if(pg && byName[pg]) byName[pg].stats.push(st);
    else loose.push(st);
  });
  var out = defs.map(function(nm){ return byName[nm]; })
                .filter(function(p){ return p.stats.length; });
  if(loose.length){
    /* stats not assigned anywhere land on the first page, or their own */
    if(out.length) out[0].stats = out[0].stats.concat(loose);
    else out.push({name: defs[0] || "Stats", stats: loose});
  }
  if(!out.length) out=[{name:"Stats", stats:[]}];
  return out;
}

/* ---------- titles ---------- */
function titleLines(){
  var out=[];
  (CFG.titles||[]).forEach(function(line){
    var best=null;
    (line.levels||[]).forEach(function(lv){
      if((lv.conds||[]).every(condOK)) best=lv;   // last matching wins → order easiest first
    });
    if(best) out.push(best.label);
  });
  return out;
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

  /* Stat pages: named and ordered by you, and each stat says which one it's on.
     A page with nothing on it is skipped. */
  var pages = statPages();
  var gi = Math.min(G._statPage||0, pages.length-1);
  if(gi<0) gi=0;
  var page = pages[gi] || {name:"Stats", stats:[]};

  var gt=el("p",null,page.name); gt.style.cssText="font-weight:bold;margin:0 0 5px;";
  left.appendChild(gt);

  var t=el("table");
  if(gi===0){
    var apr=document.createElement("tr");
    apr.appendChild(el("td",null,"✨ Action points")).style.width="56%";
    apr.appendChild(el("td")).innerHTML="<strong>"+apVal()+"</strong>";
    t.appendChild(apr);
  }
  page.stats.forEach(function(s){
    var tr=document.createElement("tr");
    tr.appendChild(el("td",null,(s.emoji?s.emoji+" ":"")+s.name));
    var td=el("td"); td.innerHTML="<strong>"+statVal(s.name)+"</strong>"; tr.appendChild(td);
    t.appendChild(tr);
  });
  left.appendChild(t);

  /* Titles belong to the character, so they show on every page. */
  var tl=titleLines();
  if(tl.length){
    var tb=el("div","titlebox");
    tb.appendChild(el("div","lab","Titles"));
    tl.forEach(function(x){ tb.appendChild(el("div","t",x)); });
    left.appendChild(tb);
  }

  /* Arrows below the titles box, matching the inventory pager. */
  if(pages.length>1){
    var pgs=el("div","pager");
    pgs.appendChild(mkBtn("◀","",function(){
      G._statPage=(gi-1+pages.length)%pages.length; draw(); }));
    pgs.appendChild(el("span","muted",(gi+1)+" / "+pages.length));
    pgs.appendChild(mkBtn("▶","",function(){
      G._statPage=(gi+1)%pages.length; draw(); }));
    left.appendChild(pgs);
  }
  split.appendChild(left);

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
    /* No Back here — Close ▴ is the way out. */
    var mid0=el("div"); mid0.className="mid";
    mid0.appendChild(ibNode("big here", cfg.pic, cfg.label||"Convert ✨ to…","",null));
    grid.appendChild(catSlot(0));
    grid.appendChild(mid0);
    grid.appendChild(catSlot(1)); grid.appendChild(catSlot(2)); grid.appendChild(catSlot(3));
  } else {
    var c=(cfg.cats||[])[convCat]||{options:[]};
    var opts=(c.options||[]).filter(function(o){ return (o.conds||[]).every(condOK); });
    function optSlot(i){
      var o=opts[i];
      if(!o) return ibNode("locked","","???","",null);
      return ibNode("", o.pic||c.pic, o.label, "", function(){ doConvert(o); });
    }
    var mid1=el("div"); mid1.className="mid";
    mid1.appendChild(ibNode("big here", c.pic, c.label||"", "", null));
    var cb=mkBtn("← Back","backbtn"); cb.className="backbtn";
    cb.onclick=function(){ convCat=null; draw(); };
    mid1.appendChild(cb);
    grid.appendChild(optSlot(0));
    grid.appendChild(mid1);
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
  /* No Back on the collection page — Close ▴ is the way out. */
  var midE=el("div"); midE.className="mid";
  midE.appendChild(ibNode("big here", G.pic, "Endings","", null));
  grid.appendChild(catSlot(0));
  grid.appendChild(midE);
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
