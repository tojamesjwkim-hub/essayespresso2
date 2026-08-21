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
    statPages:["General stats"],
    stats:[{name:"Smarts",page:"General stats",start:0,max:99,inHeader:false,keepOnRestart:false},
           {name:"Strength",page:"General stats",start:0,max:99,inHeader:false,keepOnRestart:false},
           {name:"Gold",emoji:"🪙",page:"General stats",start:0,max:99999,inHeader:true,keepOnRestart:true}],
    items:[], stocks:[], convert:{label:"Convert ✨ to…",pic:"",cats:[]}, endings:{} };
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

var TABS=[["map","Screen map"],["screen","Edit a screen"],["stats","Stats"],["titles","Titles"],
  ["items","Items"],["stocks","Stocks"],["endings","Endings"],["convert","Convert"],
  ["rules","Rules & publish"]];
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
  if(TAB==="titles") return panTitles(p);
  if(TAB==="items") return panItems(p);
  if(TAB==="stocks") return panStocks(p);
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
  CFG.screenOrder = (CFG.screenOrder||[]).filter(function(id){ return SCREENS[id]; });
  Object.keys(SCREENS).forEach(function(id){
    if(CFG.screenOrder.indexOf(id)<0) CFG.screenOrder.push(id); });

  var t=el("table"); c.appendChild(t);
  var hr=document.createElement("tr");
  ["Order","Screen","Type","Buttons","Reached from",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
  t.appendChild(hr);
  CFG.screenOrder.forEach(function(id,oi){
    var s=SCREENS[id];
    var tr=document.createElement("tr");
    var tdo=el("td");
    tdo.appendChild(mkBtn("▲","",function(){
      if(oi>0){ var a=CFG.screenOrder; var x=a[oi-1]; a[oi-1]=a[oi]; a[oi]=x; drawPanel(); } }));
    tdo.appendChild(mkBtn("▼","",function(){
      var a=CFG.screenOrder;
      if(oi<a.length-1){ var x=a[oi+1]; a[oi+1]=a[oi]; a[oi]=x; drawPanel(); } }));
    tr.appendChild(tdo);
    var td=el("td");
    td.appendChild(el("strong",null,s.label||id));
    td.appendChild(el("span","muted"," ("+id+")"));
    if(id===CFG.topScreen) td.appendChild(el("span","tag","start"));
    tr.appendChild(td);
    tr.appendChild(el("td",null, typeLabel(s.type)));
    tr.appendChild(el("td",null, (s.type||1)===1 ? (String((s.buttons||[]).length)+" in pool") : "—"));
    tr.appendChild(el("td","muted", id===CFG.topScreen ? "— the start —" : (reached[id]||"nothing leads here")));
    var td2=el("td");
    td2.appendChild(mkBtn("Edit","edit",function(){ EDIT=id; TAB="screen"; drawTabs(); drawPanel(); }));
    td2.appendChild(mkBtn("Duplicate","",function(){
      var nid=prompt("Id for the copy:", id+"2");
      if(!nid) return;
      nid=nid.replace(/[^A-Za-z0-9_]/g,"");
      if(SCREENS[nid]){ alert("That id already exists."); return; }
      var copy=JSON.parse(JSON.stringify(s)); copy.id=nid;
      copy.label=(s.label||id)+" (copy)";
      (copy.buttons||[]).forEach(function(b){ b.id="b"+Math.random().toString(36).slice(2,8); });
      SCREENS[nid]=copy; CFG.screenOrder.push(nid); drawPanel();
    }));
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
    'The start screen is set on the Rules tab. ▲▼ changes the order shown here.'));
}
function moveScreen(id,dir){
  var ids=Object.keys(SCREENS), i=ids.indexOf(id), j=i+dir;
  if(i<0||j<0||j>=ids.length) return;
  ids[i]=ids[j]; ids[j]=id;
  var re={}; ids.forEach(function(k){ re[k]=SCREENS[k]; });
  SCREENS=re; drawPanel();
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

  c.appendChild(el("div","lab","Screen name (shown on the framed button)"));
  c.appendChild(inp(s.label,"text",function(v){ s.label=v; }));
  c.appendChild(el("div","lab","Image for this screen"));
  c.appendChild(inp(s.pic,"url",function(v){ s.pic=v; }));

  c.appendChild(el("div","lab","Page type"));
  var tp=el("div"); tp.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;";
  [[1,"1 · Buttons"],[2,"2 · Info only"],[3,"3 · Counter"],[4,"4 · Market"]].forEach(function(o){
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
    c.appendChild(el("div","lab","Narrative text at the bottom of this page (optional)"));
    var frb2=richBox(s.footText||"", "e.g. What do you do next?");
    frb2.box.oninput=function(){ s.footText=frb2.getValue(); };
    c.appendChild(frb2);
    return;
  }

  if(s.type===3){ panCounter(c,s); return; }
  if(s.type===4){ panMarket(c,s); return; }

  var r=el("div","fxrow");
  r.appendChild(el("span","muted","Buttons shown per page")).style.width="150px";
  r.appendChild(inp(s.perPage||4,"number",function(v){ s.perPage=v||4; }));
  c.appendChild(r);
  var r2=el("div","fxrow");
  r2.appendChild(el("span","muted","Unavailable buttons")).style.width="150px";
  r2.appendChild(selectFrom(["black","hide"], s.hideEmpty?"hide":"black",
    function(v){ s.hideEmpty=(v==="hide"); },
    function(v){ return v==="hide"?"Hide them entirely":"Show a blacked-out ??? box"; },"250px"));
  c.appendChild(r2);
  c.appendChild(el("div","lab","Narrative text shown at the bottom of this screen (optional)"));
  var frb=richBox(s.footText||"","e.g. What do you do next?");
  frb.box.oninput=function(){ s.footText=frb.getValue(); };
  c.appendChild(frb);

  c.appendChild(el("div","lab","Narrative text at the bottom of this page (optional)"));
  var frb=richBox(s.footText||"", "e.g. What do you do next?");
  frb.box.oninput=function(){ s.footText=frb.getValue(); };
  c.appendChild(frb);

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
      td.appendChild(mkBtn("Duplicate","",function(){
        var copy=JSON.parse(JSON.stringify(b));
        copy.id="b"+Date.now().toString(36);
        copy.label=(b.label||"button")+" (copy)";
        s.buttons.splice(i+1,0,copy); renderPool(); }));
      td.appendChild(mkBtn("▲","",function(){ if(i>0){ var x=s.buttons[i-1];
        s.buttons[i-1]=s.buttons[i]; s.buttons[i]=x; renderPool(); } }));
      td.appendChild(mkBtn("▼","",function(){ if(i<s.buttons.length-1){ var x=s.buttons[i+1];
        s.buttons[i+1]=s.buttons[i]; s.buttons[i]=x; renderPool(); } }));
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
        function(v){ return v==="black"?"Show a blacked-out ??? box":
          "Hide it completely (nothing shows)"; }, "250px"));
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
      ["Give / take","What","How much",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
      t.appendChild(hr);
      b.fx.forEach(function(f,fi){
        var tr=document.createElement("tr");
        var td1=el("td");
        td1.appendChild(selectFrom(["give","take"], f.dir||"give",
          function(v){ f.dir=v; renderFx(); renderPool(); },
          function(v){ return v==="give"?"Give":"Take away"; }, "90px"));
        tr.appendChild(td1);
        var td2=el("td");
        var kindSel=selectFrom(["stat","item"], f.kind==="item"?"item":"stat",
          function(v){ f.kind=v; renderFx(); renderPool(); },
          function(v){ return v==="item"?"an item":"a stat"; }, "80px");
        td2.appendChild(kindSel);
        if(f.kind==="item")
          td2.appendChild(selectFrom((CFG.items||[]).map(function(x){return x.name;}), f.target,
            function(v){ f.target=v; renderPool(); },null,"110px"));
        else
          td2.appendChild(selectFrom(statNames(), f.target,
            function(v){ f.target=v; renderPool(); }, statLabel,"110px"));
        tr.appendChild(td2);
        var td3=el("td"); var row=el("div","fxrow"); row.style.margin="0";
        row.appendChild(inp(Math.abs(f.amount||0),"number",function(v){
          f.amount=Math.abs(v)||0; renderPool(); }));
        if(f.kind!=="item"){
          row.appendChild(selectFrom(["+","x","/","="], (f.op&&f.op!=="-")?f.op:"+",
            function(v){ f.op=v; renderPool(); },
            function(v){ return {"+":"plain","x":"multiply","/":"divide","=":"set to"}[v]; }, "90px"));
        }
        td3.appendChild(row); tr.appendChild(td3);
        var td4=el("td"); td4.appendChild(mkBtn("✕","del",function(){ b.fx.splice(fi,1); renderFx(); renderPool(); }));
        tr.appendChild(td4); t.appendChild(tr);
      });
      fxHost.appendChild(t);
      fxHost.appendChild(mkBtn("+ Add an effect","act",function(){
        b.fx.push({dir:"give",kind:"stat",target:statNames()[1]||"__AP__",op:"+",amount:1});
        renderFx(); renderPool(); }));
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
    then.appendChild(el("div","lab","Unlocks (type a keyword — other buttons can wait for it)"));
    then.appendChild(inp(b.setsFlag,"text",function(v){ b.setsFlag=v.trim(); }));
    then.appendChild(el("div","lab","Only appears after this keyword is unlocked"));
    then.appendChild(inp(b.needsFlag,"text",function(v){ b.needsFlag=v.trim(); }));
    then.appendChild(el("div","lab","Disappears once this keyword is unlocked"));
    then.appendChild(inp(b.hiddenByFlag,"text",function(v){ b.hiddenByFlag=v.trim(); }));
    then.appendChild(el("p","muted",
      'Example: an "Unlock the bakery" button sets <code>bakery</code>, hides itself with '+
      '<code>bakery</code>, and the real Bakery button needs <code>bakery</code>.'));
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
  var n=Math.abs(Number(f.amount)||0);
  if(f.kind==="item") return "("+(f.dir==="take"?"Lose":"Get")+": "+f.target+(n>1?(" ×"+n):"")+")";
  var nm=f.target==="__AP__"?"✨":f.target;
  if(f.op==="x") return "("+nm+"×"+n+")";
  if(f.op==="=") return "("+nm+"="+n+")";
  return "("+nm+(f.dir==="take"?"−":"+")+n+")";
}

/* ---------- stats ---------- */
function typeLabel(t){
  if(t===2) return "2 · Info only";
  if(t===3) return "3 · Counter";
  if(t===4) return "4 · Market";
  return "1 · Buttons";
}
function labelledRow(parent, label, node, w){
  var r=el("div","fxrow");
  var sp=el("span","muted",label); sp.style.width=(w||"180px"); sp.style.flex="none";
  r.appendChild(sp); r.appendChild(node);
  parent.appendChild(r);
  return r;
}
function narrativeField(c, s, hint){
  c.appendChild(el("div","lab","Narrative text at the bottom of this screen (optional)"));
  var rb=richBox(s.footText||"", hint||"e.g. What do you do next?");
  rb.box.oninput=function(){ s.footText=rb.getValue(); };
  c.appendChild(rb);
  c.appendChild(el("p","muted","It sits under the framed centre button, indented a third of the way in."));
}

/* ---------- page type 3 · Counter ---------- */
function panCounter(c, s){
  if(!s.counterMode) s.counterMode="bank";
  labelledRow(c, "This counter is a…",
    selectFrom(["bank","store"], s.counterMode, function(v){ s.counterMode=v; drawPanel(); },
      function(v){ return v==="store" ? "Store (buy / sell items)" : "Bank (deposit / withdraw)"; },
      "230px"));

  if(s.counterMode==="store"){
    c.appendChild(el("h3",null,"Store settings"));
    labelledRow(c, "What's for sale",
      selectFrom(["all","pick"], (s.stockList&&s.stockList.length)?"pick":"all",
        function(v){ s.stockList = (v==="pick") ? (s.stockList||[]) : null; drawPanel(); },
        function(v){ return v==="pick" ? "Only the items I pick" : "Everything with a buy price"; },
        "260px"));
    if(s.stockList){
      var pick=el("div"); pick.style.cssText="border:1px solid #000;background:#fff;padding:8px;margin-top:6px;";
      (CFG.items||[]).forEach(function(it){
        if(it.buy===undefined||it.buy===null||it.buy==="") return;
        var lb=el("label"); lb.style.cssText="width:auto;display:block;margin:2px 0;";
        var cb=document.createElement("input"); cb.type="checkbox";
        cb.checked = s.stockList.indexOf(it.name)>=0;
        cb.onchange=function(){
          if(cb.checked) s.stockList.push(it.name);
          else s.stockList=s.stockList.filter(function(n){ return n!==it.name; });
        };
        lb.appendChild(cb); lb.appendChild(document.createTextNode(" "+it.name+" — 🪙"+it.buy));
        pick.appendChild(lb);
      });
      if(!pick.childNodes.length) pick.appendChild(el("p","muted","No items have a buy price yet."));
      c.appendChild(pick);
    }
    var sellCb=document.createElement("input"); sellCb.type="checkbox";
    sellCb.checked = s.allowSell!==false;
    sellCb.onchange=function(){ s.allowSell=sellCb.checked; };
    var sl=el("label"); sl.style.cssText="width:auto;display:block;margin-top:8px;";
    sl.appendChild(sellCb); sl.appendChild(document.createTextNode(" They may sell things here"));
    c.appendChild(sl);

    var pctIn = inp(s.defaultSellPct===undefined?50:s.defaultSellPct,"number",
      function(v){ s.defaultSellPct=v; });
    labelledRow(c, "Default sell price", pctIn);
    c.appendChild(el("p","muted","A percentage of the buy price. Override it per item on the Items tab. "+
      "An item with no buy price can't be bought or sold at all — that's how quest items stay safe."));
    c.appendChild(el("h3",null,"Button images"));
    labelledRow(c, "Buy button image", inp(s.buyPic,"url",function(v){ s.buyPic=v; }));
    labelledRow(c, "Sell button image", inp(s.sellPic,"url",function(v){ s.sellPic=v; }));
  } else {
    c.appendChild(el("h3",null,"Bank settings"));
    labelledRow(c, "Which stat is stored",
      selectFrom(statNames().filter(function(n){return n!=="__AP__";}), s.statName||goldGuess(),
        function(v){ s.statName=v; }, statLabel, "180px"));
    labelledRow(c, "Interest per day", inp(s.interest||0,"number",function(v){ s.interest=v; }));
    labelledRow(c, "Maximum balance", inp(s.maxBalance||0,"number",function(v){ s.maxBalance=v; }));
    c.appendChild(el("p","muted","0 means no limit. Interest lands when the day rolls over — including "+
      "when a student pays ✨ to skip a day, so ✨ speeds up their savings too."));
    c.appendChild(el("h3",null,"Button images"));
    labelledRow(c, "Deposit button image", inp(s.depositPic,"url",function(v){ s.depositPic=v; }));
    labelledRow(c, "Withdraw button image", inp(s.withdrawPic,"url",function(v){ s.withdrawPic=v; }));
  }
  narrativeField(c, s, "Leave blank and the balance line is written for you.");
}
function goldGuess(){
  var g=null; (CFG.stats||[]).forEach(function(x){ if(x.emoji==="🪙") g=x.name; });
  return g || (statNames().filter(function(n){return n!=="__AP__";})[0] || "Gold");
}

/* ---------- page type 4 · Market ---------- */
function panMarket(c, s){
  c.appendChild(el("h3",null,"Market settings"));
  labelledRow(c, "Which stat buys shares",
    selectFrom(statNames().filter(function(n){return n!=="__AP__";}), s.statName||goldGuess(),
      function(v){ s.statName=v; }, statLabel, "180px"));
  var dcb=document.createElement("input"); dcb.type="checkbox";
  dcb.checked=!!s.detailsOpen;
  dcb.onchange=function(){ s.detailsOpen=dcb.checked; };
  var dl=el("label"); dl.style.cssText="width:auto;display:block;margin-top:8px;";
  dl.appendChild(dcb); dl.appendChild(document.createTextNode(" Show the table and chart straight away"));
  c.appendChild(dl);
  c.appendChild(el("p","muted","Off by default — arriving shows just Buy, Sell and a See details button."));
  labelledRow(c, "Sell price cut", inp(s.sellCutPct||0,"number",function(v){ s.sellCutPct=v; }));
  c.appendChild(el("p","muted","A percentage taken off today's price when selling. 0 means they sell at "+
    "full price, which is the usual choice for a stock market."));
  c.appendChild(el("h3",null,"Button images"));
  labelledRow(c, "Buy button image", inp(s.buyPic,"url",function(v){ s.buyPic=v; }));
  labelledRow(c, "Sell button image", inp(s.sellPic,"url",function(v){ s.sellPic=v; }));
  c.appendChild(el("p","muted","The stocks themselves live on the Stocks tab, so several market screens "+
    "can share the same companies."));
  narrativeField(c, s);
}

/* ---------- Stocks tab ---------- */
var TRACK_OPTS=["random","increase","decrease","stable","wild"];
function trackLabel(v){
  return {random:"Random", increase:"Increase", decrease:"Decrease",
          stable:"Stable", wild:"Wild"}[v] || v;
}
function panStocks(p){
  CFG.stocks = CFG.stocks || [];
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Stocks"));
  c.appendChild(el("p","muted","Shared by every Market screen. Prices are worked out from each "+
    "student's own run seed, so no two students see the same market and replaying gives a new one."));

  var t=el("table"); t.style.marginTop="8px"; c.appendChild(t);
  function render(){
    clear(t);
    var hr=document.createElement("tr");
    ["Ticker","Description","Colour","Low","High","Starts at","Starting track","Switch %/day",""]
      .forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    CFG.stocks.forEach(function(st,i){
      var tr=document.createElement("tr");
      var t1=el("td");
      var ti=inp(st.ticker,"text",function(v){ st.ticker=v.toUpperCase().slice(0,3); });
      ti.maxLength=3; ti.style.width="66px"; t1.appendChild(ti); tr.appendChild(t1);
      var t2=el("td"); t2.appendChild(inp(st.desc,"text",function(v){ st.desc=v; })); tr.appendChild(t2);
      var t3=el("td");
      var col=document.createElement("input"); col.type="color";
      col.value=st.color||"#333333"; col.style.cssText="height:26px;padding:1px;width:56px;";
      col.oninput=function(){ st.color=col.value; };
      t3.appendChild(col); tr.appendChild(t3);
      var t4=el("td"); t4.appendChild(inp(st.low===undefined?1:st.low,"number",
        function(v){ st.low=v; })); tr.appendChild(t4);
      var t5=el("td"); t5.appendChild(inp(st.high===undefined?20:st.high,"number",
        function(v){ st.high=v; })); tr.appendChild(t5);
      var t6=el("td");
      var si=inp(st.start===undefined?"":st.start,"number",function(v){ st.start=v; });
      si.placeholder="random"; t6.appendChild(si); tr.appendChild(t6);
      var t7=el("td");
      t7.appendChild(selectFrom(TRACK_OPTS, st.startTrack||"random",
        function(v){ st.startTrack=v; }, trackLabel, "120px")); tr.appendChild(t7);
      var t8=el("td"); t8.appendChild(inp(st.switchPct===undefined?25:st.switchPct,"number",
        function(v){ st.switchPct=v; })); tr.appendChild(t8);
      var t9=el("td");
      t9.appendChild(mkBtn("✕","del",function(){ CFG.stocks.splice(i,1); render(); }));
      tr.appendChild(t9);
      t.appendChild(tr);
    });
  }
  render();
  c.appendChild(mkBtn("+ Add stock","act",function(){
    CFG.stocks.push({ticker:"NEW",desc:"New company",color:"#333333",
      low:1,high:20,start:"",startTrack:"random",switchPct:8});
    render();
  }));

  var d=el("div","card t"); p.appendChild(d);
  d.appendChild(el("h2",null,"The four tracks"));
  var tt=el("table"); tt.style.cssText="margin-top:8px;max-width:640px;";
  var hh=document.createElement("tr");
  ["Track","What it does","Example"].forEach(function(h){ hh.appendChild(el("th",null,h)); });
  tt.appendChild(hh);
  [["Increase","Drifts up by a random amount each day","1 → 3 → 6 → 6 → 9"],
   ["Decrease","Drifts down by a random amount each day","12 → 11 → 7 → 6 → 4"],
   ["Stable","Hovers near where it already is","5 → 7 → 6 → 5 → 6"],
   ["Wild","Can jump anywhere between low and high","4 → 18 → 6 → 19 → 2"]].forEach(function(r){
    var tr=document.createElement("tr");
    tr.appendChild(el("td")).innerHTML="<strong>"+r[0]+"</strong>";
    tr.appendChild(el("td",null,r[1]));
    tr.appendChild(el("td","muted",r[2]));
    tt.appendChild(tr);
  });
  d.appendChild(tt);
  d.appendChild(el("p","muted","Each day there's a switch chance that a stock changes track. "+
    "Over a 40-day run, 25% means it switches about 10 times — busy, and hard to read a trend. "+
    "Around 5–10% gives roughly 2–4 turning points, which is long enough for a student to "+
    "notice a stock is climbing and decide to buy. Start low. "+
    "Prices never leave the low–high range."));
}

function panStats(p){
  /* ---- the pages first: name them and put them in order ---- */
  CFG.statPages = CFG.statPages || ["General stats"];
  var pc=el("div","card t"); p.appendChild(pc);
  pc.appendChild(el("h2",null,"Stat pages"));
  pc.appendChild(el("p","muted","These are the pages the ◀ ▶ arrows flip through in the Me panel, "+
    "in this order. A page with no stats on it is skipped, so you can leave spares set up."));
  var pt=el("table"); pt.style.cssText="margin-top:8px;max-width:520px;"; pc.appendChild(pt);
  function renderPages(){
    clear(pt);
    var hr=document.createElement("tr");
    ["Order","Page name",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    pt.appendChild(hr);
    CFG.statPages.forEach(function(nm,i){
      var tr=document.createElement("tr");
      var a=el("td","mid");
      a.appendChild(mkBtn("▲","",function(){ movePage(i,-1); }));
      a.appendChild(mkBtn("▼","",function(){ movePage(i, 1); }));
      tr.appendChild(a);
      var b=el("td");
      b.appendChild(inp(nm,"text",function(v){
        var old=CFG.statPages[i];
        CFG.statPages[i]=v;
        /* keep the stats pointing at it */
        (CFG.stats||[]).forEach(function(st){ if(st.page===old) st.page=v; });
      }));
      tr.appendChild(b);
      var d=el("td","mid");
      d.appendChild(mkBtn("✕","del",function(){
        var gone=CFG.statPages[i];
        if(CFG.statPages.length<2){ alert("You need at least one stat page."); return; }
        CFG.statPages.splice(i,1);
        (CFG.stats||[]).forEach(function(st){ if(st.page===gone) st.page=CFG.statPages[0]; });
        drawPanel();
      }));
      tr.appendChild(d);
      pt.appendChild(tr);
    });
  }
  function movePage(i,dir){
    var j=i+dir;
    if(j<0||j>=CFG.statPages.length) return;
    var tmp=CFG.statPages[i]; CFG.statPages[i]=CFG.statPages[j]; CFG.statPages[j]=tmp;
    renderPages();
  }
  renderPages();
  pc.appendChild(mkBtn("+ Add stat page","act",function(){
    CFG.statPages.push("New page"); drawPanel(); }));

  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Stats"));
  CFG.stats=CFG.stats||[];
  var t=el("table"); c.appendChild(t);
  function render(){
    clear(t);
    var hr=document.createElement("tr");
    ["Name","Stat page","Starts","Max","Header emoji","On restart",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    CFG.stats.forEach(function(s,i){
      var tr=document.createElement("tr");
      var a=el("td"); a.appendChild(inp(s.name,"text",function(v){ s.name=v; })); tr.appendChild(a);
      var gg=el("td");
      gg.appendChild(selectFrom(CFG.statPages, s.page||CFG.statPages[0],
        function(v){ s.page=v; }, function(v){ return v; }, "150px"));
      tr.appendChild(gg);
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
    CFG.stats.push({name:"New stat",page:CFG.statPages[0],start:0,max:99,
      inHeader:false,keepOnRestart:false});
    render(); }));
  c.appendChild(el("p","muted",
    "Effects read name first, no space: (Smarts+1), (✨−1), (Strength×2). "+
    "✨ AP is not a stat here — it comes from practice and is always on page 1. "+
    "Division rounds down and never goes below zero. A stat with no header emoji stays "+
    "out of the way, which is how a hidden counter like \"Cookies baked\" can quietly feed a title."));
}

/* ---------- titles ---------- */
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

/* ---------- titles ---------- */
function panTitles(p){
  var c=el("div","card t"); p.appendChild(c);
  c.appendChild(el("h2",null,"Titles"));
  c.appendChild(el("p","muted",
    "Each line is one independent title slot shown under the character on the top page and in the Me panel. "+
    "Within a line, the LAST matching level wins — so order them easiest first (Junior baker, then Senior baker)."));
  CFG.titles=CFG.titles||[];
  var host=el("div"); c.appendChild(host);
  function render(){
    clear(host);
    CFG.titles.forEach(function(line,li){
      var box=el("div"); box.style.cssText="border:1px solid #000;background:#fff;padding:10px;margin-bottom:10px;";
      var hd=el("div","cardhead");
      hd.appendChild(el("strong",null,"Line "+(li+1)));
      var hc=el("div","ctrls");
      hc.appendChild(mkBtn("▲","",function(){ if(li>0){ var x=CFG.titles[li-1];
        CFG.titles[li-1]=CFG.titles[li]; CFG.titles[li]=x; render(); } }));
      hc.appendChild(mkBtn("▼","",function(){ if(li<CFG.titles.length-1){ var x=CFG.titles[li+1];
        CFG.titles[li+1]=CFG.titles[li]; CFG.titles[li]=x; render(); } }));
      hc.appendChild(mkBtn("✕ Delete line","del",function(){ CFG.titles.splice(li,1); render(); }));
      hd.appendChild(hc); box.appendChild(hd);

      line.levels=line.levels||[];
      var t=el("table"); t.style.marginTop="8px";
      var hr=document.createElement("tr");
      ["#","Title shown","Earned when… (all true)",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
      t.appendChild(hr);
      line.levels.forEach(function(lv,vi){
        var tr=document.createElement("tr");
        tr.appendChild(el("td",null,String(vi+1)));
        var a=el("td"); a.appendChild(inp(lv.label,"text",function(v){ lv.label=v; })); tr.appendChild(a);
        var b=el("td");
        lv.conds=lv.conds||[];
        function renderConds(){
          clear(b);
          if(!lv.conds.length) b.appendChild(el("span","muted","Always (shows from the start)"));
          lv.conds.forEach(function(cd,ci){
            var r=el("div","fxrow");
            r.appendChild(selectFrom(["stat_min","stat_max","has","not_has"], cd.kind,
              function(v){ cd.kind=v; renderConds(); },
              function(v){ return {stat_min:"≥",stat_max:"≤",has:"Has item",not_has:"No item"}[v]; },"88px"));
            if(cd.kind==="has"||cd.kind==="not_has")
              r.appendChild(selectFrom((CFG.items||[]).map(function(x){return x.name;}), cd.target,
                function(v){ cd.target=v; },null,"110px"));
            else {
              r.appendChild(selectFrom(statNames(), cd.target, function(v){ cd.target=v; }, statLabel,"110px"));
              r.appendChild(inp(cd.value,"number",function(v){ cd.value=v; }));
            }
            r.appendChild(mkBtn("✕","del",function(){ lv.conds.splice(ci,1); renderConds(); }));
            b.appendChild(r);
          });
          b.appendChild(mkBtn("+ condition","",function(){
            lv.conds.push({kind:"stat_min",target:statNames()[1]||"__AP__",value:1}); renderConds(); }));
        }
        renderConds();
        tr.appendChild(b);
        var d=el("td");
        d.appendChild(mkBtn("▲","",function(){ if(vi>0){ var x=line.levels[vi-1];
          line.levels[vi-1]=line.levels[vi]; line.levels[vi]=x; render(); } }));
        d.appendChild(mkBtn("✕","del",function(){ line.levels.splice(vi,1); render(); }));
        tr.appendChild(d);
        t.appendChild(tr);
      });
      box.appendChild(t);
      box.appendChild(mkBtn("+ Add level","act",function(){
        line.levels.push({label:"New title",conds:[]}); render(); }));
      host.appendChild(box);
    });
  }
  render();
  c.appendChild(mkBtn("+ Add title line","act",function(){
    CFG.titles.push({levels:[{label:"Junior baker",conds:[]}]}); render(); }));
  c.appendChild(el("p","muted",
    "Example: Line 1 = Junior baker (Baking ≥ 3) then Senior baker (Baking ≥ 10). "+
    "Line 2 = Junior painter / Senior painter. Both show at once, on separate lines."));
}
