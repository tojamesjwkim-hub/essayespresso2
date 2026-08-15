/* ================= game editor ================= */
var CFG=null, SCREENS={}, TAB="map", EDIT=null, msg=null;

auth.onAuthStateChanged(function(u){
  if(!u || !isTeacherUser(u)){ location.href="index.html"; return; }
  msg=$("saveMsg");
  $("saveBtn").onclick=saveAll;
  Promise.all([gameCfgRef.get(), screensCol.get()]).then(function(r){
    CFG = r[0].exists ? r[0].data() : defaults();
    CFG = Object.assign(defaults(), CFG);
    SCREENS={}; r[1].forEach(function(d){ SCREENS[d.id]=Object.assign({id:d.id},d.data()); });
    if(!Object.keys(SCREENS).length){
      SCREENS.top={id:"top",type:1,label:"Top level",pic:"",buttons:[],perPage:4};
    }
    drawTabs(); drawPanel();
  }).catch(function(e){ $("notice").appendChild(errBox("Could not load: "+e.message)); });
});

function defaults(){
  return { days:40, apSkip:5, skipCaption:"Or wait until 12AM PST.", invPages:10, topScreen:"top",
    restartText:"Would you like to RESTART this game? You will lose ALL OF YOUR STATS. "+
      "(Take a screenshot if you'd like!) You will only get to keep your ✨AP, 🪙coins, and your inventory!",
    stats:[{name:"Smarts",start:0,max:99,inHeader:false,keepOnRestart:false},
           {name:"Strength",start:0,max:99,inHeader:false,keepOnRestart:false},
           {name:"Gold",emoji:"🪙",start:0,max:99999,inHeader:true,keepOnRestart:true}],
    items:[], convert:{label:"Convert ✨ to…",pic:"",cats:[]}, endings:{} };
}
function saveAll(){
  flash(msg,"Saving…",8000);
  var jobs=[gameCfgRef.set(CFG,{merge:false})];
  Object.keys(SCREENS).forEach(function(id){
    var s=JSON.parse(JSON.stringify(SCREENS[id])); delete s.id; delete s._page;
    jobs.push(screensCol.doc(id).set(s,{merge:false}));
  });
  return Promise.all(jobs).then(function(){ flash(msg,"Saved ✓"); })
    .catch(function(e){ flash(msg,"Could not save: "+e.message,6000); });
}

var TABS=[["map","Screen map"],["screen","Edit a screen"],["stats","Stats"],["items","Items"],
  ["endings","Endings"],["convert","Convert"],["rules","Rules & publish"]];
function drawTabs(){
  var t=$("tabs"); clear(t);
  TABS.forEach(function(p){
    var d=el("div","tab"+(TAB===p[0]?" on":""),p[1]);
    d.onclick=function(){ TAB=p[0]; drawTabs(); drawPanel(); };
    t.appendChild(d);
  });
}
function drawPanel(){
  var p=$("panels"); clear(p);
  if(TAB==="map") return panMap(p);
  if(TAB==="screen") return panScreen(p);
  if(TAB==="stats") return panStats(p);
  if(TAB==="items") return panItems(p);
  if(TAB==="endings") return panEndings(p);
  if(TAB==="convert") return panConvert(p);
  if(TAB==="rules") return panRules(p);
}
function inp(val,type,fn,w){
  var i=document.createElement("input"); i.type=type||"text";
  i.value=(val===undefined||val===null)?"":val;
  i.oninput=function(){ fn(type==="number"?Number(i.value):i.value); };
  if(w) i.style.cssText="width:"+w+";flex:none;";
  else if(type==="number") i.style.width="80px";
  return i;
}
function statNames(){
  var out=(CFG.stats||[]).map(function(s){ return s.name; });
  out.unshift("__AP__"); return out;
}
function statLabel(n){ return n==="__AP__" ? "✨ AP" : n; }
function selectFrom(list, val, fn, labelFn, w){
  var s=document.createElement("select");
  s.style.cssText=(w?("flex:0 0 "+w+";"):"")+"width:auto;";
  list.forEach(function(v){ var o=document.createElement("option"); o.value=v;
    o.textContent=labelFn?labelFn(v):v; s.appendChild(o); });
  s.value=val||list[0]; s.onchange=function(){ fn(s.value); };
  return s;
}

/* ---------- screen map ---------- */
function panMap(p){
  var c=el("div","card t"); p.appendChild(c);
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"Screen map"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("+ Add screen","act",function(){
    var id=prompt("Short id for the new screen (letters/numbers, no spaces):","screen"+(Object.keys(SCREENS).length+1));
    if(!id) return;
    id=id.replace(/[^A-Za-z0-9_]/g,"");
    if(SCREENS[id]){ alert("That id already exists."); return; }
    SCREENS[id]={id:id,type:1,label:id,pic:"",buttons:[],perPage:4};
    EDIT=id; TAB="screen"; drawTabs(); drawPanel();
  }));
  head.appendChild(ctr); c.appendChild(head);

  var reached={};
  Object.keys(SCREENS).forEach(function(id){
    (SCREENS[id].buttons||[]).forEach(function(b){ if(b.leads) reached[b.leads]=id; });
  });
  var t=el("table"); c.appendChild(t);
  var hr=document.createElement("tr");
  ["Screen","Type","Buttons","Reached from",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
  t.appendChild(hr);
  Object.keys(SCREENS).forEach(function(id){
    var s=SCREENS[id];
    var tr=document.createElement("tr");
    var td=el("td");
    td.appendChild(el("strong",null,s.label||id));
    td.appendChild(el("span","muted"," ("+id+")"));
    if(id===CFG.topScreen) td.appendChild(el("span","tag","start"));
    tr.appendChild(td);
    tr.appendChild(el("td",null, s.type===2?"2 · Info only":(s.type===3?"3 · Nested":"1 · Buttons")));
    tr.appendChild(el("td",null, s.type===2?"—":String((s.buttons||[]).length)+" in pool"));
    tr.appendChild(el("td","muted", id===CFG.topScreen ? "— the start —" : (reached[id]||"nothing leads here")));
    var td2=el("td");
    td2.appendChild(mkBtn("Edit","edit",function(){ EDIT=id; TAB="screen"; drawTabs(); drawPanel(); }));
    if(id!==CFG.topScreen) td2.appendChild(mkBtn("✕","del",function(){
      if(!confirm("Delete screen \""+id+"\"? Buttons pointing here will stop working.")) return;
      screensCol.doc(id).delete().catch(function(){});
      delete SCREENS[id]; drawPanel();
    }));
    tr.appendChild(td2);
    t.appendChild(tr);
  });
  c.appendChild(el("p","muted",
    'Point a button at a screen using "Leads to" in the button editor. '+
    'The start screen is set on the Rules tab.'));
}

/* ---------- edit a screen ---------- */
function panScreen(p){
  if(!EDIT || !SCREENS[EDIT]) EDIT=CFG.topScreen || Object.keys(SCREENS)[0];
  var s=SCREENS[EDIT];
  var c=el("div","card t"); p.appendChild(c);
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,"Editing screen"));
  var ctr=el("div","ctrls");
  ctr.appendChild(selectFrom(Object.keys(SCREENS), EDIT, function(v){ EDIT=v; drawPanel(); },
    function(id){ return (SCREENS[id].label||id); }, "180px"));
  ctr.appendChild(mkBtn("👁 Play the draft","edit",function(){
    saveAll().then(function(){ window.open("game.html","_blank"); }); }));
  head.appendChild(ctr); c.appendChild(head);

  c.appendChild(el("div","lab","Screen name (shown on the Back button)"));
  c.appendChild(inp(s.label,"text",function(v){ s.label=v; }));
  c.appendChild(el("div","lab","Image for this screen (used as its Back button)"));
  c.appendChild(inp(s.pic,"url",function(v){ s.pic=v; }));

  c.appendChild(el("div","lab","Page type"));
  var tp=el("div"); tp.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;";
  [[1,"1 · Buttons"],[2,"2 · Info only"],[3,"3 · Nested"]].forEach(function(o){
    var l=el("label"); l.style.cssText="border:1px solid #000;padding:5px 10px;font-size:13px;width:auto;cursor:pointer;"+
      ((s.type||1)===o[0]?"background:#000;color:#fff;font-weight:bold;":"background:#fff;");
    var r=document.createElement("input"); r.type="radio"; r.name="pt"; r.checked=((s.type||1)===o[0]);
    r.onchange=function(){ s.type=o[0]; drawPanel(); };
    l.appendChild(r); l.appendChild(document.createTextNode(" "+o[1]));
    tp.appendChild(l);
  });
  c.appendChild(tp);

  if(s.type===2){
    c.appendChild(el("h3",null,"Text — top half of the right side"));
    var rb=richBox(s.text||"", "Write the scene here…");
    rb.box.style.minHeight="180px";
    rb.box.oninput=function(){ s.text=rb.getValue(); };
    c.appendChild(rb);
    c.appendChild(el("h3",null,"Images — bottom half"));
    s.images=s.images||[];
    var it=el("table"); c.appendChild(it);
    function renderImgs(){
      clear(it);
      var hr=document.createElement("tr");
      ["#","Image URL","Caption",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
      it.appendChild(hr);
      s.images.forEach(function(im,i){
        var tr=document.createElement("tr");
        tr.appendChild(el("td",null,String(i+1)));
        var t1=el("td"); t1.appendChild(inp(im.url,"url",function(v){ im.url=v; })); tr.appendChild(t1);
        var t2=el("td"); t2.appendChild(inp(im.caption,"text",function(v){ im.caption=v; })); tr.appendChild(t2);
        var t3=el("td"); t3.appendChild(mkBtn("✕","del",function(){ s.images.splice(i,1); renderImgs(); }));
        tr.appendChild(t3); it.appendChild(tr);
      });
    }
    renderImgs();
    c.appendChild(mkBtn("+ Add image","act",function(){ s.images.push({url:"",caption:""}); renderImgs(); }));
    return;
  }

  var r=el("div","fxrow");
  r.appendChild(el("span","muted","Buttons shown per page")).style.width="150px";
  r.appendChild(inp(s.perPage||4,"number",function(v){ s.perPage=v||4; }));
  c.appendChild(r);

  c.appendChild(el("h3",null,"Button pool"));
  c.appendChild(el("p","muted","Each day the game picks from this pool: conditions first, then times-per-run, then chance."));
  s.buttons=s.buttons||[];
  var host=el("div"); c.appendChild(host);
  function renderPool(){
    clear(host);
    var t=el("table");
    var hr=document.createElement("tr");
    ["Label","Chance","Only if…","Effects","Leads to",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    s.buttons.forEach(function(b,i){
      var tr=document.createElement("tr");
      tr.appendChild(el("td",null,b.label||"(unnamed)"));
      tr.appendChild(el("td",null,(b.chance===undefined||b.chance>=100)?"always":(b.chance+"%")));
      tr.appendChild(el("td","muted",(b.conds||[]).map(condText).join(", ")||"—"));
      tr.appendChild(el("td","muted",(b.fx||[]).map(fxText).join(" ")||"—"));
      tr.appendChild(el("td","muted",b.leads||"— stay —"));
      var td=el("td");
      td.appendChild(mkBtn("Edit","edit",function(){ openButton(s,b,i); }));
      td.appendChild(mkBtn("✕","del",function(){ s.buttons.splice(i,1); renderPool(); }));
      tr.appendChild(td); t.appendChild(tr);
    });
    host.appendChild(t);
    host.appendChild(mkBtn("+ Add button to pool","act",function(){
      var b={id:"b"+Date.now().toString(36),label:"New button",chance:100,fx:[],conds:[],limit:"none"};
      s.buttons.push(b); renderPool(); openButton(s,b,s.buttons.length-1);
    }));
  }
  renderPool();
  var edit=el("div"); c.appendChild(edit);

  function openButton(sc,b,i){
    clear(edit);
    var box=el("div"); box.style.cssText="border:2px solid #000;background:#fff;padding:12px;margin-top:12px;";
    var hd=el("div","cardhead");
    hd.appendChild(el("strong",null,"Editing: "+(b.label||"")));
    var hc=el("div","ctrls");
    hc.appendChild(mkBtn("Close ▴","close",function(){ clear(edit); renderPool(); }));
    hd.appendChild(hc); box.appendChild(hd);

    var grid=el("div"); grid.style.cssText="display:grid;grid-template-columns:270px 1fr;gap:14px;margin-top:10px;";
    var left=el("div");
    left.appendChild(el("div","lab","Image URL"));
    left.appendChild(inp(b.pic,"url",function(v){ b.pic=v; }));
    left.appendChild(el("div","lab","Button label"));
    left.appendChild(inp(b.label,"text",function(v){ b.label=v; renderPool(); }));
    left.appendChild(el("div","lab","Leads to"));
    var opts=["" ].concat(Object.keys(SCREENS));
    left.appendChild(selectFrom(opts, b.leads||"", function(v){ b.leads=v; renderPool(); },
      function(v){ return v===""?"— stay on this screen —":(SCREENS[v].label||v); }));
    grid.appendChild(left);

    var right=el("div");
    right.appendChild(el("h4",null,"1 · When may this button appear?"));
    var condHost=el("div"); condHost.style.cssText="border:1px solid #000;padding:8px;background:#fafafa;";
    b.conds=b.conds||[];
    function renderConds(){
      clear(condHost);
      b.conds.forEach(function(cd,ci){
        var r=el("div","fxrow");
        r.appendChild(selectFrom(["stat_min","stat_max","has","not_has","day_min"], cd.kind,
          function(v){ cd.kind=v; renderConds(); },
          function(v){ return {stat_min:"Stat is at least",stat_max:"Stat is at most",
            has:"Has item",not_has:"Doesn't have item",day_min:"Day is at least"}[v]; }, "160px"));
        if(cd.kind==="has"||cd.kind==="not_has"){
          r.appendChild(selectFrom((CFG.items||[]).map(function(x){return x.name;}), cd.target,
            function(v){ cd.target=v; }, null, "130px"));
        } else if(cd.kind==="day_min"){
          r.appendChild(inp(cd.value,"number",function(v){ cd.value=v; }));
        } else {
          r.appendChild(selectFrom(statNames(), cd.target, function(v){ cd.target=v; }, statLabel, "120px"));
          r.appendChild(inp(cd.value,"number",function(v){ cd.value=v; }));
        }
        r.appendChild(mkBtn("✕","del",function(){ b.conds.splice(ci,1); renderConds(); renderPool(); }));
        condHost.appendChild(r);
      });
      condHost.appendChild(mkBtn("+ another condition","",function(){
        b.conds.push({kind:"stat_min",target:statNames()[1]||"__AP__",value:1}); renderConds(); }));
      var hr2=el("div","fxrow"); hr2.style.marginTop="8px";
      hr2.appendChild(el("span","muted","If it can't appear")).style.width="125px";
      hr2.appendChild(selectFrom(["black","none"], sc.hideEmpty?"none":"black",
        function(v){ sc.hideEmpty=(v==="none"); },
        function(v){ return v==="black"?"Show a blacked-out ??? box":"Show nothing"; }, "230px"));
      condHost.appendChild(hr2);
    }
    renderConds();
    right.appendChild(condHost);

    right.appendChild(el("h4",null,"2 · How often?"));
    var freq=el("div"); freq.style.cssText="border:1px solid #000;padding:8px;background:#fafafa;";
    var fr=el("div","fxrow");
    fr.appendChild(selectFrom(["always","random"], (b.chance===undefined||b.chance>=100)?"always":"random",
      function(v){ b.chance = v==="always"?100:(b.chance>=100?50:b.chance); renderPool(); drawPanel(); },
      function(v){ return v==="always"?"Always (100%)":"Random chance"; }, "150px"));
    if(!(b.chance===undefined||b.chance>=100)){
      fr.appendChild(inp(b.chance,"number",function(v){ b.chance=v; renderPool(); }));
      fr.appendChild(el("span","muted","% — rolled once per day, then fixed"));
    }
    freq.appendChild(fr);
    var fr2=el("div","fxrow"); fr2.style.marginTop="6px";
    fr2.appendChild(el("span","muted","Times per run")).style.width="125px";
    fr2.appendChild(selectFrom(["none","once","daily"], b.limit||"none",
      function(v){ b.limit=v; }, function(v){ return {none:"Unlimited",once:"Once only",
        daily:"Once per day"}[v]; }, "190px"));
    freq.appendChild(fr2);
    right.appendChild(freq);

    right.appendChild(el("h4",null,"3 · What happens when clicked?"));
    var fxHost=el("div"); fxHost.style.cssText="border:1px solid #000;padding:8px;background:#fafafa;";
    b.fx=b.fx||[];
    function renderFx(){
      clear(fxHost);
      var t=el("table");
      var hr=document.createElement("tr");
      ["Do what","To what","How much",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
      t.appendChild(hr);
      b.fx.forEach(function(f,fi){
        var tr=document.createElement("tr");
        var td1=el("td");
        td1.appendChild(selectFrom(["stat","item"], f.kind==="item"?"item":"stat",
          function(v){ f.kind=v; renderFx(); renderPool(); },
          function(v){ return v==="item"?"Give / take item":"Change stat"; }));
        tr.appendChild(td1);
        var td2=el("td");
        if(f.kind==="item")
          td2.appendChild(selectFrom((CFG.items||[]).map(function(x){return x.name;}), f.target,
            function(v){ f.target=v; renderPool(); }));
        else
          td2.appendChild(selectFrom(statNames(), f.target, function(v){ f.target=v; renderPool(); }, statLabel));
        tr.appendChild(td2);
        var td3=el("td"); var row=el("div","fxrow"); row.style.margin="0";
        if(f.kind!=="item")
          row.appendChild(selectFrom(["+","-","x","/","="], f.op||"+", function(v){ f.op=v; renderPool(); },
            null, "56px"));
        row.appendChild(inp(f.amount,"number",function(v){ f.amount=v; renderPool(); }));
        td3.appendChild(row); tr.appendChild(td3);
        var td4=el("td"); td4.appendChild(mkBtn("✕","del",function(){ b.fx.splice(fi,1); renderFx(); renderPool(); }));
        tr.appendChild(td4); t.appendChild(tr);
      });
      fxHost.appendChild(t);
      fxHost.appendChild(mkBtn("+ Add an effect","act",function(){
        b.fx.push({kind:"stat",target:statNames()[1]||"__AP__",op:"+",amount:1}); renderFx(); renderPool(); }));
      fxHost.appendChild(el("p","muted","Shows on the button as: "+
        ((b.fx||[]).map(fxText).join(" ")||"—")));
    }
    renderFx();
    right.appendChild(fxHost);

    right.appendChild(el("h4",null,"4 · Then what?"));
    var then=el("div"); then.style.cssText="border:1px solid #000;padding:8px;background:#fafafa;";
    then.appendChild(el("div","lab","Message shown after clicking (optional)"));
    var ta=document.createElement("textarea"); ta.style.minHeight="42px"; ta.value=b.message||"";
    ta.oninput=function(){ b.message=ta.value; };
    then.appendChild(ta);
    right.appendChild(then);

    grid.appendChild(right);
    box.appendChild(grid);
    box.appendChild(el("p","muted",
      "Order of checks: conditions → times-per-run → chance. A button failing a condition never rolls its chance."));
    edit.appendChild(box);
    box.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
}
function condText(c){
  if(!c) return "";
  if(c.kind==="has") return "has "+c.target;
  if(c.kind==="not_has") return "no "+c.target;
  if(c.kind==="day_min") return "day ≥ "+c.value;
  return (c.target==="__AP__"?"✨":c.target)+(c.kind==="stat_max"?" ≤ ":" ≥ ")+c.value;
}
function fxText(f){
  if(!f) return "";
  if(f.kind==="item") return "("+(f.amount>0?"Get":"Lose")+": "+f.target+")";
  var nm=f.target==="__AP__"?"✨":f.target;
  if(f.op==="x") return "("+nm+"×"+f.amount+")";
  if(f.op==="=") return "("+nm+"="+f.amount+")";
  return "("+nm+(f.amount>=0?"+":"")+f.amount+")";
}

/* ---------- stats ---------- */
function panStats(p){
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Stats"));
  CFG.stats=CFG.stats||[];
  var t=el("table"); c.appendChild(t);
  function render(){
    clear(t);
    var hr=document.createElement("tr");
    ["Name","Starts","Max","Header emoji","On restart",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    CFG.stats.forEach(function(s,i){
      var tr=document.createElement("tr");
      var a=el("td"); a.appendChild(inp(s.name,"text",function(v){ s.name=v; })); tr.appendChild(a);
      var b=el("td"); b.appendChild(inp(s.start||0,"number",function(v){ s.start=v; })); tr.appendChild(b);
      var d=el("td"); d.appendChild(inp(s.max||99,"number",function(v){ s.max=v; })); tr.appendChild(d);
      var e=el("td"); e.appendChild(inp(s.emoji||"","text",function(v){ s.emoji=v; },"70px"));
      var lb=el("label"); lb.style.width="auto";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!s.inHeader;
      cb.onchange=function(){ s.inHeader=cb.checked; };
      lb.appendChild(cb); lb.appendChild(document.createTextNode(" show"));
      e.appendChild(lb); tr.appendChild(e);
      var f=el("td");
      f.appendChild(selectFrom(["keep","reset"], s.keepOnRestart?"keep":"reset",
        function(v){ s.keepOnRestart=(v==="keep"); }, function(v){ return v==="keep"?"Keep":"Reset"; }));
      tr.appendChild(f);
      var g=el("td"); g.appendChild(mkBtn("✕","del",function(){ CFG.stats.splice(i,1); render(); }));
      tr.appendChild(g); t.appendChild(tr);
    });
  }
  render();
  c.appendChild(mkBtn("+ Add stat","act",function(){
    CFG.stats.push({name:"New stat",start:0,max:99,inHeader:false,keepOnRestart:false}); render(); }));
  c.appendChild(el("p","muted",
    "Effects read name first, no space: (Smarts+1), (✨−1), (Strength×2). "+
    "✨ AP is not a stat here — it comes from practice and is always in the header. "+
    "Division rounds down and never goes below zero."));
}

/* ---------- items ---------- */
function panItems(p){
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Items"));
  CFG.items=CFG.items||[];
  var t=el("table"); c.appendChild(t);
  function render(){
    clear(t);
    var hr=document.createElement("tr");
    ["Name","Image URL","Description","Keep on restart",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    CFG.items.forEach(function(it,i){
      var tr=document.createElement("tr");
      var a=el("td"); a.appendChild(inp(it.name,"text",function(v){ it.name=v; })); tr.appendChild(a);
      var b=el("td"); b.appendChild(inp(it.pic,"url",function(v){ it.pic=v; })); tr.appendChild(b);
      var d=el("td"); d.appendChild(inp(it.desc,"text",function(v){ it.desc=v; })); tr.appendChild(d);
      var e=el("td"); e.style.textAlign="center";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!it.keep;
      cb.onchange=function(){ it.keep=cb.checked; }; e.appendChild(cb); tr.appendChild(e);
      var f=el("td"); f.appendChild(mkBtn("✕","del",function(){ CFG.items.splice(i,1); render(); }));
      tr.appendChild(f); t.appendChild(tr);
    });
  }
  render();
  c.appendChild(mkBtn("+ Add item","act",function(){
    CFG.items.push({name:"New item",pic:"",desc:"",keep:false}); render(); }));
  c.appendChild(el("p","muted",
    (CFG.invPages||10)+" pages ("+((CFG.invPages||10)*9)+" slots). When full, new items are refused."));
}

/* ---------- endings ---------- */
function panEndings(p){
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Endings"));
  c.appendChild(el("p","muted",
    "Each category is one of the four buttons on the ending page. Within a category the first match wins — "+
    "put demanding ones first and always finish with a catch-all."));
  CFG.endings=CFG.endings||{};
  var cats=Object.keys(CFG.endings);
  var bar=el("div","fxrow");
  bar.appendChild(el("span","muted","Category")).style.width="70px";
  var sel=selectFrom(cats.length?cats:["(none yet)"], cats[0]||"", function(){ render(); }, null, "180px");
  bar.appendChild(sel);
  bar.appendChild(mkBtn("+ Add category","act",function(){
    var n=prompt("Category name (e.g. Business):"); if(!n) return;
    CFG.endings[n]=CFG.endings[n]||[]; drawPanel();
  }));
  bar.appendChild(mkBtn("✕ Delete category","del",function(){
    if(!sel.value||!CFG.endings[sel.value]) return;
    if(confirm("Delete category "+sel.value+"?")){ delete CFG.endings[sel.value]; drawPanel(); }
  }));
  c.appendChild(bar);
  var host=el("div"); c.appendChild(host);
  render();

  function render(){
    clear(host);
    var cat=sel.value;
    if(!CFG.endings[cat]){ host.appendChild(el("p","muted","Add a category to begin.")); return; }
    var list=CFG.endings[cat];
    var t=el("table"); host.appendChild(t);
    var hr=document.createElement("tr");
    ["#","Title","Shows if… (all true)",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    list.forEach(function(e,i){
      var tr=document.createElement("tr");
      tr.appendChild(el("td",null,String(i+1)));
      var td1=el("td"); td1.appendChild(inp(e.title,"text",function(v){ e.title=v; })); tr.appendChild(td1);
      var td2=el("td");
      e.conds=e.conds||[];
      function renderConds(){
        clear(td2);
        if(!e.conds.length) td2.appendChild(el("span","muted","Always — catch-all"));
        e.conds.forEach(function(cd,ci){
          var r=el("div","fxrow");
          r.appendChild(selectFrom(["stat_min","stat_max","has","not_has"], cd.kind,
            function(v){ cd.kind=v; renderConds(); },
            function(v){ return {stat_min:"≥",stat_max:"≤",has:"Has item",not_has:"No item"}[v]; },"90px"));
          if(cd.kind==="has"||cd.kind==="not_has")
            r.appendChild(selectFrom((CFG.items||[]).map(function(x){return x.name;}), cd.target,
              function(v){ cd.target=v; },null,"110px"));
          else {
            r.appendChild(selectFrom(statNames(), cd.target, function(v){ cd.target=v; }, statLabel,"100px"));
            r.appendChild(inp(cd.value,"number",function(v){ cd.value=v; }));
          }
          r.appendChild(mkBtn("✕","del",function(){ e.conds.splice(ci,1); renderConds(); }));
          td2.appendChild(r);
        });
        td2.appendChild(mkBtn("+ condition","",function(){
          e.conds.push({kind:"stat_min",target:statNames()[1]||"__AP__",value:1}); renderConds(); }));
      }
      renderConds();
      tr.appendChild(td2);
      var td3=el("td");
      td3.appendChild(mkBtn("Edit page ▾","edit",function(){ openEndingPage(cat,e,i); }));
      td3.appendChild(mkBtn("▲","",function(){ if(i>0){ var x=list[i-1]; list[i-1]=list[i]; list[i]=x; render(); } }));
      td3.appendChild(mkBtn("✕","del",function(){ list.splice(i,1); render(); }));
      tr.appendChild(td3);
      t.appendChild(tr);
    });
    host.appendChild(mkBtn("+ Add ending to "+cat,"act",function(){
      list.push({title:"New ending",text:"",images:[],conds:[]}); render(); }));
    var edit=el("div"); host.appendChild(edit);

    function openEndingPage(cat,e,i){
      clear(edit);
      var box=el("div"); box.style.cssText="border:2px solid #000;background:#fff;padding:12px;margin-top:12px;";
      var hd=el("div","cardhead");
      hd.appendChild(el("strong",null,"Editing ending: "+(e.title||"")));
      var hc=el("div","ctrls");
      hc.appendChild(mkBtn("Close ▴","close",function(){ clear(edit); }));
      hd.appendChild(hc); box.appendChild(hd);
      box.appendChild(el("div","lab","Back button image"));
      box.appendChild(inp(e.pic,"url",function(v){ e.pic=v; }));
      box.appendChild(el("div","lab","Text"));
      var rb=richBox(e.text||"","Write the ending here…");
      rb.box.style.minHeight="150px";
      rb.box.oninput=function(){ e.text=rb.getValue(); };
      box.appendChild(rb);
      box.appendChild(el("div","lab","Images"));
      e.images=e.images||[];
      var it=el("table"); box.appendChild(it);
      function renderImgs(){
        clear(it);
        var hr=document.createElement("tr");
        ["#","Image URL",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
        it.appendChild(hr);
        e.images.forEach(function(im,ii){
          var tr=document.createElement("tr");
          tr.appendChild(el("td",null,String(ii+1)));
          var t1=el("td"); t1.appendChild(inp(im.url,"url",function(v){ im.url=v; })); tr.appendChild(t1);
          var t2=el("td"); t2.appendChild(mkBtn("✕","del",function(){ e.images.splice(ii,1); renderImgs(); }));
          tr.appendChild(t2); it.appendChild(tr);
        });
      }
      renderImgs();
      box.appendChild(mkBtn("+ Add image","act",function(){ e.images.push({url:""}); renderImgs(); }));
      edit.appendChild(box);
      box.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  }
}

/* ---------- convert ---------- */
function panConvert(p){
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Convert"));
  c.appendChild(el("p","muted","What the ✨ button in the game header opens."));
  CFG.convert=CFG.convert||{label:"Convert ✨ to…",pic:"",cats:[]};
  var r=el("div","fxrow");
  r.appendChild(el("span","muted","Centre button label")).style.width="150px";
  r.appendChild(inp(CFG.convert.label,"text",function(v){ CFG.convert.label=v; }));
  r.appendChild(el("span","muted","image"));
  r.appendChild(inp(CFG.convert.pic,"url",function(v){ CFG.convert.pic=v; }));
  c.appendChild(r);

  c.appendChild(el("h3",null,"Categories"));
  var host=el("div"); c.appendChild(host);
  function render(){
    clear(host);
    var t=el("table");
    var hr=document.createElement("tr");
    ["Order","Label","Image","Options",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    CFG.convert.cats.forEach(function(cat,i){
      var tr=document.createElement("tr");
      var t0=el("td");
      t0.appendChild(mkBtn("▲","",function(){ if(i>0){ var x=CFG.convert.cats[i-1];
        CFG.convert.cats[i-1]=CFG.convert.cats[i]; CFG.convert.cats[i]=x; render(); } }));
      t0.appendChild(mkBtn("▼","",function(){ if(i<CFG.convert.cats.length-1){ var x=CFG.convert.cats[i+1];
        CFG.convert.cats[i+1]=CFG.convert.cats[i]; CFG.convert.cats[i]=x; render(); } }));
      tr.appendChild(t0);
      var t1=el("td"); t1.appendChild(inp(cat.label,"text",function(v){ cat.label=v; })); tr.appendChild(t1);
      var t2=el("td"); t2.appendChild(inp(cat.pic,"url",function(v){ cat.pic=v; })); tr.appendChild(t2);
      tr.appendChild(el("td","muted",((cat.options||[]).length)+" options"));
      var t4=el("td");
      t4.appendChild(mkBtn("Edit ▾","edit",function(){ openCat(cat); }));
      t4.appendChild(mkBtn("✕","del",function(){ CFG.convert.cats.splice(i,1); render(); }));
      tr.appendChild(t4); t.appendChild(tr);
    });
    host.appendChild(t);
    host.appendChild(mkBtn("+ Add category","act",function(){
      CFG.convert.cats.push({label:"New",pic:"",options:[]}); render(); }));
    var edit=el("div"); host.appendChild(edit);

    function openCat(cat){
      clear(edit);
      var box=el("div"); box.style.cssText="border:2px solid #000;background:#fff;padding:12px;margin-top:12px;";
      var hd=el("div","cardhead"); hd.appendChild(el("strong",null,cat.label));
      var hc=el("div","ctrls"); hc.appendChild(mkBtn("Close ▴","close",function(){ clear(edit); }));
      hd.appendChild(hc); box.appendChild(hd);
      cat.options=cat.options||[];
      var t=el("table"); box.appendChild(t);
      function renderOpts(){
        clear(t);
        var hr=document.createElement("tr");
        ["Button label","Costs ✨","Gives",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
        t.appendChild(hr);
        cat.options.forEach(function(o,oi){
          var tr=document.createElement("tr");
          var a=el("td"); a.appendChild(inp(o.label,"text",function(v){ o.label=v; })); tr.appendChild(a);
          var b=el("td"); b.appendChild(inp(o.cost||0,"number",function(v){ o.cost=v; })); tr.appendChild(b);
          var d=el("td"); var row=el("div","fxrow"); row.style.margin="0";
          o.gain=o.gain||{kind:"stat",target:(CFG.stats[0]||{}).name,amount:1};
          row.appendChild(selectFrom(["stat","item","day"], o.gain.kind,
            function(v){ o.gain.kind=v; renderOpts(); },
            function(v){ return {stat:"Stat",item:"Item",day:"Days"}[v]; },"80px"));
          if(o.gain.kind==="item")
            row.appendChild(selectFrom((CFG.items||[]).map(function(x){return x.name;}), o.gain.target,
              function(v){ o.gain.target=v; },null,"110px"));
          else if(o.gain.kind==="stat")
            row.appendChild(selectFrom((CFG.stats||[]).map(function(x){return x.name;}), o.gain.target,
              function(v){ o.gain.target=v; },null,"110px"));
          row.appendChild(inp(o.gain.amount||1,"number",function(v){ o.gain.amount=v; }));
          d.appendChild(row); tr.appendChild(d);
          var e=el("td"); e.appendChild(mkBtn("✕","del",function(){ cat.options.splice(oi,1); renderOpts(); }));
          tr.appendChild(e); t.appendChild(tr);
        });
      }
      renderOpts();
      box.appendChild(mkBtn("+ Add option","act",function(){
        cat.options.push({label:"✨1 → …",cost:1,gain:{kind:"stat",
          target:(CFG.stats[0]||{}).name,amount:1}}); renderOpts(); }));
      edit.appendChild(box);
    }
  }
  render();
}

/* ---------- rules & publish ---------- */
function panRules(p){
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Rules"));
  var t=el("table"); t.style.maxWidth="600px"; c.appendChild(t);
  function row(label,node){
    var tr=document.createElement("tr");
    var a=el("td",null,label); a.style.width="230px"; tr.appendChild(a);
    var b=el("td"); b.appendChild(node); tr.appendChild(b); t.appendChild(tr);
  }
  row("Days in a run", inp(CFG.days,"number",function(v){ CFG.days=v||40; },"110px"));
  row("Start screen", selectFrom(Object.keys(SCREENS), CFG.topScreen,
    function(v){ CFG.topScreen=v; }, function(id){ return SCREENS[id].label||id; }));
  var d=el("span","muted"); d.textContent="12:00 AM Pacific — fixed for everyone";
  row("Day rolls over at", d);
  row("✨ cost to skip a day", inp(CFG.apSkip,"number",function(v){ CFG.apSkip=v; },"110px"));
  row("Caption under skip button", inp(CFG.skipCaption,"text",function(v){ CFG.skipCaption=v; }));
  row("Inventory pages", inp(CFG.invPages,"number",function(v){ CFG.invPages=v||10; },"110px"));
  var ta=document.createElement("textarea"); ta.style.minHeight="70px"; ta.value=CFG.restartText||"";
  ta.oninput=function(){ CFG.restartText=ta.value; };
  row("Restart warning text", ta);

  /* drafts */
  var c2=el("div","card t"); p.appendChild(c2);
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"Drafts & publish"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("⬇ Download whole game (JSON)","act",function(){
    var blob=new Blob([JSON.stringify({config:CFG,screens:SCREENS},null,2)],{type:"application/json"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="game-backup-"+ptDayKey()+".json"; a.click();
  }));
  var fi=document.createElement("input"); fi.type="file"; fi.accept=".json"; fi.style.display="none";
  fi.onchange=function(){
    if(!fi.files[0]) return;
    var r=new FileReader();
    r.onload=function(e){
      try{
        var d=JSON.parse(e.target.result);
        if(!d.config) throw new Error("not a game backup");
        if(!confirm("Replace the current game with this file?")) return;
        CFG=d.config; SCREENS=d.screens||{}; drawPanel();
        flash(msg,"Loaded — press Save draft to keep it.",6000);
      }catch(err){ alert("Could not read that file: "+err.message); }
    };
    r.readAsText(fi.files[0]);
  };
  ctr.appendChild(mkBtn("⬆ Restore from file","edit",function(){ fi.click(); }));
  ctr.appendChild(fi);
  head.appendChild(ctr); c2.appendChild(head);

  c2.appendChild(el("p","muted",
    "\"Save draft\" (top right) writes the live game straight away. Named snapshots below are your safety net — "+
    "take one before any big rewrite."));
  var dh=el("div"); c2.appendChild(dh);
  function loadDrafts(){
    clear(dh); dh.appendChild(el("p","muted","Loading snapshots…"));
    draftsCol.limit(30).get().then(function(sn){
      clear(dh);
      var list=[]; sn.forEach(function(x){ list.push(Object.assign({id:x.id},x.data())); });
      list.sort(function(a,b){ return (b.ms||0)-(a.ms||0); });
      var t=el("table");
      var hr=document.createElement("tr");
      ["Snapshot","Saved",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
      t.appendChild(hr);
      if(!list.length){
        var tr=document.createElement("tr");
        var td=el("td","muted","No snapshots yet."); td.colSpan=3; tr.appendChild(td); t.appendChild(tr);
      }
      list.forEach(function(d){
        var tr=document.createElement("tr");
        tr.appendChild(el("td",null,d.name||d.id));
        tr.appendChild(el("td","muted", d.ms?ptStamp(new Date(d.ms)):""));
        var td=el("td");
        td.appendChild(mkBtn("👁 Play","edit",function(){ window.open("game.html?draft="+d.id,"_blank"); }));
        td.appendChild(mkBtn("↩ Load","",function(){
          if(!confirm("Replace the editor contents with \""+(d.name||d.id)+"\"?")) return;
          CFG=d.config; SCREENS=d.screens||{}; drawPanel();
          flash(msg,"Loaded — press Save draft to make it live.",6000);
        }));
        td.appendChild(mkBtn("✕","del",function(){
          if(confirm("Delete this snapshot?")) draftsCol.doc(d.id).delete().then(loadDrafts); }));
        tr.appendChild(td); t.appendChild(tr);
      });
      dh.appendChild(t);
    }).catch(function(e){ clear(dh); dh.appendChild(errBox("Could not load snapshots: "+e.message)); });
  }
  loadDrafts();
  var bar=el("div"); bar.style.marginTop="10px";
  bar.appendChild(mkBtn("+ Save a named snapshot","act",function(){
    var n=prompt("Name this snapshot:","before "+ptDayKey()+" changes");
    if(!n) return;
    draftsCol.add({name:n, ms:Date.now(), config:CFG, screens:SCREENS})
      .then(loadDrafts).catch(function(e){ alert("Failed: "+e.message); });
  }));
  bar.appendChild(mkBtn("👁 Play the live game","edit",function(){
    saveAll().then(function(){ window.open("game.html","_blank"); }); }));
  c2.appendChild(bar);
}
