/* ================= EssayEspresso — student ================= */
var ME=null, GUEST=false, S={}, WS={}, ASSIGN=[], OPEN=null, TEACH={};
var qs=new URLSearchParams(location.search), VIEWAS=qs.get("as"), PREVIEW=qs.get("preview");

function todayKey(){ return ptDayKey(); }

/* ---------- storage abstraction: Firestore for members, localStorage for guests ---------- */
var store = {
  loadStudent:function(){
    if(GUEST){ return Promise.resolve(LS.get("student",{name:"Guest",ap:0,gameOn:true,
      mayToggleGame:true,mayAddOwn:true,bg:"",opacity:80,todayTitle:"Today…",streak:0})); }
    return studentsCol.doc(ME).get().then(function(d){ return d.exists?d.data():{}; });
  },
  saveStudent:function(patch){
    if(GUEST){ var cur=LS.get("student",{}); Object.assign(cur,patch); LS.set("student",cur);
      return Promise.resolve(); }
    if(VIEWAS) return Promise.resolve();
    return studentsCol.doc(ME).set(patch,{merge:true});
  },
  loadAssignments:function(){
    if(GUEST){ return Promise.resolve(LS.get("assign",[])); }
    return studentsCol.doc(ME).collection("assignments").get().then(function(sn){
      var out=[]; sn.forEach(function(d){ out.push(Object.assign({id:d.id},d.data())); });
      return out;
    });
  },
  saveAssignment:function(wsId,patch){
    if(GUEST){ var a=LS.get("assign",[]); var f=null;
      a.forEach(function(x){ if(x.id===wsId) f=x; });
      if(!f){ f={id:wsId}; a.push(f); }
      Object.assign(f,patch); LS.set("assign",a); return Promise.resolve(); }
    if(VIEWAS) return Promise.resolve();
    return studentsCol.doc(ME).collection("assignments").doc(wsId).set(patch,{merge:true});
  },
  removeAssignment:function(wsId){
    if(GUEST){ LS.set("assign", LS.get("assign",[]).filter(function(x){return x.id!==wsId;}));
      return Promise.resolve(); }
    return studentsCol.doc(ME).collection("assignments").doc(wsId).delete();
  },
  loadArchive:function(wsId){
    if(GUEST){ return Promise.resolve(LS.get("arch_"+wsId,[])); }
    return studentsCol.doc(ME).collection("archive").doc(wsId).collection("rows")
      .limit(500).get().then(function(sn){
        var out=[]; sn.forEach(function(d){ out.push(Object.assign({id:d.id},d.data())); });
        out.sort(function(a,b){ return (b.ms||0)-(a.ms||0); });
        return out;
      });
  },
  addArchiveRows:function(wsId,rows){
    if(GUEST){ var a=LS.get("arch_"+wsId,[]); rows.forEach(function(r){ a.unshift(r); });
      LS.set("arch_"+wsId,a); return Promise.resolve(); }
    if(VIEWAS) return Promise.resolve();
    var batch=db.batch(), col=studentsCol.doc(ME).collection("archive").doc(wsId).collection("rows");
    rows.forEach(function(r){ batch.set(col.doc(), r); });
    return batch.commit();
  },
  loadDraft:function(wsId){
    if(GUEST) return Promise.resolve(LS.get("draft_"+wsId,{}));
    return studentsCol.doc(ME).collection("drafts").doc(wsId).get()
      .then(function(d){ return d.exists?d.data():{}; }).catch(function(){ return {}; });
  },
  saveDraft:function(wsId,data){
    if(GUEST){ LS.set("draft_"+wsId,data); return Promise.resolve(); }
    if(VIEWAS) return Promise.resolve();
    return studentsCol.doc(ME).collection("drafts").doc(wsId).set(data,{merge:true});
  }
};

/* ---------- boot ---------- */
auth.onAuthStateChanged(function(u){
  if(u){
    resolveRole(u,function(role,data){
      if(role==="teacher" && PREVIEW){ ME=u.uid; GUEST=true; start(); return; }
      if(role==="teacher" && !VIEWAS){ location.href="teacher.html"; return; }
      if(role==="teacher" && VIEWAS){ ME=VIEWAS; GUEST=false; start(); return; }
      if(role==="student"){ ME=u.uid; GUEST=false; S=data||{}; touchSeen(); start(); return; }
      location.href="index.html";
    });
  } else {
    if(LS.get("guest",false)){ GUEST=true; ME="guest"; start(); }
    else location.href="index.html";
  }
});
function touchSeen(){
  studentsCol.doc(ME).set({lastSeen:firebase.firestore.FieldValue.serverTimestamp(),
    lastSeenDay:todayKey()},{merge:true}).catch(function(){});
}

function start(){
  if(PREVIEW){ setTimeout(function(){ OPEN=PREVIEW; drawPractice(); drawExercise(); }, 600); }
  siteRef.get().then(function(d){
    if(d.exists && d.data().title) $("siteTitle").textContent=d.data().title;
  }).catch(function(){});
  teacherRef.get().then(function(d){ TEACH = d.exists?d.data():{}; })
    .catch(function(){ TEACH={}; })
    .then(function(){ return store.loadStudent(); })
    .then(function(data){
      S = data||{};
      if(S.bg) document.body.style.background=S.bg;
      return refresh();
    });
}

function refresh(){
  return Promise.all([ store.loadAssignments(), wsCol.get() ]).then(function(res){
    var asn=res[0]; WS={};
    res[1].forEach(function(d){ WS[d.id]=Object.assign({id:d.id},d.data()); });
    if(PREVIEW && WS[PREVIEW]) asn=[{id:PREVIEW,order:0,addedBy:"teacher"}];
    asn = asn.filter(function(a){ return WS[a.id]; });
    asn.sort(function(a,b){ return (a.order||0)-(b.order||0); });
    ASSIGN=asn;
    drawProfile(); drawPractice();
  }).catch(function(e){
    $("notice").appendChild(errBox("Could not load: "+e.message));
  });
}

/* ---------- profile ---------- */
function gameOn(){ return S.gameOn !== false; }

function drawProfile(){
  var c=$("profileCard"); clear(c); c.className="card";
  if(S.tintProfile) c.style.background=S.tintProfile;
  var head=el("div","cardhead");
  var left=el("div"); left.style.cssText="display:flex;align-items:center;gap:9px;";
  if(S.photo){ var im=document.createElement("img"); im.className="avatar"; im.src=S.photo; left.appendChild(im); }
  else left.appendChild(el("span","avatar", GUEST?"?":"🌳"));
  var who=el("div");
  var nm=el("strong",null,S.name||(GUEST?"Guest":"Student")); nm.style.fontSize="16px";
  who.appendChild(nm);
  if(gameOn()){ who.appendChild(document.createTextNode(" "));
    who.appendChild(el("span","chip","✨"+(S.ap||0))); }
  who.appendChild(document.createElement("br"));
  who.appendChild(el("span","muted", GUEST?"not signed in":(S.email||"")));
  left.appendChild(who);
  head.appendChild(left);

  var ctr=el("div","ctrls");
  var gb=mkBtn("Game","fun",function(){ location.href="game.html"; });
  gb.disabled = !gameOn();
  ctr.appendChild(gb);
  ctr.appendChild(mkBtn("⚙ Settings","",function(){
    var s=$("settingsCard"); if(s.classList.contains("hidden")) drawSettings();
    s.classList.toggle("hidden"); }));
  if(GUEST) ctr.appendChild(mkBtn("Log in","login",function(){
    signIn().then(function(){ LS.set("guest",false); location.href="student.html"; })
      .catch(function(e){ alert("Sign-in failed: "+e.message); }); }));
  else ctr.appendChild(mkBtn("Log out","out",function(){
    signOutNow().then(function(){ LS.set("guest",false); location.href="index.html"; }); }));
  head.appendChild(ctr);
  c.appendChild(head);

  if(GUEST){
    var b=el("div","banner");
    b.innerHTML="You're practising as a guest — saved on this device only. <strong>Log in</strong> to keep it for good.";
    c.insertBefore(b, c.firstChild);
  }
  if(VIEWAS){
    var v=el("div","ok"); v.textContent="Viewing as a student (teacher preview — nothing you do is saved).";
    c.insertBefore(v, c.firstChild);
  }
}

/* ---------- practice list ---------- */
function counterText(w, archCount){
  if(w.counterStyle==="total") return (archCount||0)+" / "+(w.counterTotal||0);
  if(w.counterStyle==="unit")  return (archCount||0)+" "+(w.counterUnit||"");
  return "";
}
function drawPractice(){
  var c=$("practiceCard"); clear(c); c.className="card";
  if(S.tintPractice) c.style.background=S.tintPractice;
  var head=el("div","cardhead");
  var t=el("h2",null,S.todayTitle||"Today…");
  t.contentEditable="true"; t.style.cssText="border-bottom:1px dashed #aaa;padding:1px 3px;outline:none;min-width:110px;";
  t.onblur=function(){ store.saveStudent({todayTitle:t.textContent.trim()||"Today…"}); };
  head.appendChild(t);
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("⟳","",function(){ refresh(); }));
  head.appendChild(ctr);
  c.appendChild(head);
  c.appendChild(el("div")).style.height="10px";

  if(!ASSIGN.length){
    c.appendChild(el("p","muted","Nothing here yet. Use + to pick something, or ask your tutor."));
  }
  ASSIGN.forEach(function(a,i){
    var w=WS[a.id];
    var r=el("div","wsrow"+(OPEN===a.id?" open":""));
    r.appendChild(el("span","num",(i+1)+"."));
    var bx=el("span","box"+(a.doneDate===todayKey()?" on":""), a.doneDate===todayKey()?"✓":"");
    r.appendChild(bx);
    var ti=el("span","wstitle"); ti.appendChild(el("strong",null,w.title||"(untitled)"));
    r.appendChild(ti);
    var cnt=counterText(w, a.archCount);
    if(cnt) r.appendChild(el("span","cnt",cnt));
    if(gameOn() && w.ap) r.appendChild(el("span","chip","✨+"+w.ap));
    r.onclick=function(){ OPEN = (OPEN===a.id? null : a.id); drawPractice(); drawExercise(); };
    c.appendChild(r);
  });

  var bar=el("div"); bar.style.marginTop="8px";
  if(S.mayAddOwn !== false){
    var plus=mkBtn("+","act",function(){ togglePicker("add"); });
    plus.style.cssText="font-size:16px;padding:3px 12px;font-weight:bold;";
    var minus=mkBtn("−","del",function(){ togglePicker("drop"); });
    minus.style.cssText="font-size:16px;padding:3px 12px;font-weight:bold;";
    bar.appendChild(plus); bar.appendChild(minus);
  }
  c.appendChild(bar);

  // load archive counts lazily for counters
  ASSIGN.forEach(function(a){
    if(a.archCount!==undefined) return;
    var w=WS[a.id];
    if(!w || !w.counterStyle || w.counterStyle==="none") return;
    store.loadArchive(a.id).then(function(rows){
      a.archCount = rows.length;
      drawPractice();
    }).catch(function(){});
  });
}

/* ---------- add / drop picker ---------- */
var pickerMode=null, pickerCat=null;
function togglePicker(mode){
  if(pickerMode===mode){ pickerMode=null; $("pickerCard").classList.add("hidden"); return; }
  pickerMode=mode; pickerCat=null; drawPicker();
}
function drawPicker(){
  var c=$("pickerCard"); clear(c); c.className="card"; c.classList.remove("hidden");
  c.style.background="#fafafa";
  var head=el("div","cardhead");
  head.appendChild(el("h2",null, pickerMode==="add"?"Add an activity":"Drop an activity"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ pickerMode=null; c.classList.add("hidden"); }));
  head.appendChild(ctr); c.appendChild(head);

  if(pickerMode==="drop"){
    var mine=ASSIGN.filter(function(a){ return a.addedBy==="self"; });
    if(!mine.length){ c.appendChild(el("p","muted","Nothing to drop — everything here was set by your tutor."));
      return; }
    mine.forEach(function(a){
      var r=el("div","row");
      var d=el("div"); d.style.flex="1"; d.appendChild(el("strong",null,WS[a.id].title));
      r.appendChild(d);
      r.appendChild(mkBtn("Drop","del",function(){
        store.removeAssignment(a.id).then(function(){ pickerMode=null; c.classList.add("hidden"); refresh(); });
      }));
      c.appendChild(r);
    });
    c.appendChild(el("p","muted","Only things you added yourself can be dropped."));
    return;
  }

  var cats=(TEACH.categories||[]).filter(function(x){ return x.selfServe; });
  if(!cats.length){ c.appendChild(el("p","muted","No self-serve categories yet.")); return; }
  c.appendChild(el("p","muted","Pick a category:"));
  var cb=el("div"); cb.style.cssText="display:flex;gap:6px;flex-wrap:wrap;";
  cats.forEach(function(cat){
    cb.appendChild(mkBtn(cat.name, pickerCat===cat.name?"fun":"", function(){
      pickerCat=cat.name; drawPicker(); }));
  });
  c.appendChild(cb);
  if(!pickerCat) return;

  c.appendChild(el("p","muted","…then a worksheet from "+pickerCat+":"));
  var have={}; ASSIGN.forEach(function(a){ have[a.id]=true; });
  var any=false;
  Object.keys(WS).forEach(function(id){
    var w=WS[id];
    if(w.category!==pickerCat || !w.selfServe) return;
    any=true;
    var r=el("div","row");
    var d=el("div"); d.style.flex="1"; d.appendChild(el("strong",null,w.title));
    r.appendChild(d);
    if(have[id]){ var b=mkBtn("Added",""); b.disabled=true; r.appendChild(b); }
    else r.appendChild(mkBtn("+ Add","act",function(){
      store.saveAssignment(id,{order:(ASSIGN.length+1)*10, addedBy:"self"}).then(function(){
        pickerMode=null; $("pickerCard").classList.add("hidden"); refresh(); });
    }));
    c.appendChild(r);
  });
  if(!any) c.appendChild(el("p","muted","Nothing available in that category yet."));
}

/* ---------- settings ---------- */
var TINTS=["#ffffff","#eef6ef","#fdf0f5","#eef3fb","#fbf6e9","#f3eefb"];
function swatches(current, fn){
  var d=el("div"); d.style.cssText="display:flex;gap:5px;flex-wrap:wrap;";
  TINTS.forEach(function(col){
    var b=mkBtn("","",function(){ fn(col); });
    b.style.cssText="width:26px;height:26px;padding:0;background:"+col+";"+
      (current===col?"border-width:3px;":"");
    d.appendChild(b);
  });
  return d;
}
function drawSettings(){
  var c=$("settingsCard"); clear(c); c.className="card"; c.style.background="#fafafa";
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"⚙ Settings"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ c.classList.add("hidden"); }));
  head.appendChild(ctr); c.appendChild(head);

  c.appendChild(el("h3",null,"You"));
  c.appendChild(el("div","lab","Name"));
  var nameIn=document.createElement("input"); nameIn.type="text"; nameIn.value=S.name||"";
  nameIn.style.maxWidth="340px"; c.appendChild(nameIn);
  c.appendChild(el("div","lab","Picture — paste a link or upload"));
  var picRow=el("div"); picRow.style.cssText="display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
  var picIn=document.createElement("input"); picIn.type="url"; picIn.placeholder="https://…";
  picIn.value=S.photo||""; picIn.style.cssText="flex:1;min-width:200px;";
  picRow.appendChild(picIn);
  var fileIn=document.createElement("input"); fileIn.type="file"; fileIn.accept="image/*";
  fileIn.style.display="none";
  fileIn.onchange=function(){ if(fileIn.files[0]) shrinkImage(fileIn.files[0],300,function(d){ picIn.value=d; }); };
  picRow.appendChild(mkBtn("Choose file…","",function(){ fileIn.click(); }));
  picRow.appendChild(fileIn);
  c.appendChild(picRow);

  c.appendChild(el("h3",null,"Look"));
  c.appendChild(el("div","lab","Page background"));
  c.appendChild(swatches(S.bg, function(col){ S.bg=col; document.body.style.background=col; }));
  c.appendChild(el("div","lab","Profile box"));
  c.appendChild(swatches(S.tintProfile, function(col){ S.tintProfile=col; drawProfile(); }));
  c.appendChild(el("div","lab","Practice box"));
  c.appendChild(swatches(S.tintPractice, function(col){ S.tintPractice=col; drawPractice(); }));

  if(S.mayToggleGame !== false){
    c.appendChild(el("h3",null,"The game"));
    var g=el("div"); g.style.cssText="border:2px solid #000;background:#fff;padding:11px;";
    var line=el("div","fxrow");
    var lbl=el("span",null,"Turn game on?");
    lbl.style.cssText="width:150px;font-weight:bold;font-size:15px;";
    line.appendChild(lbl);
    var yes=el("label"); yes.style.cssText="width:auto;margin-right:14px;font-size:15px;";
    var ry=document.createElement("input"); ry.type="radio"; ry.name="gm"; ry.checked=gameOn();
    yes.appendChild(ry); yes.appendChild(document.createTextNode(" Yes"));
    var no=el("label"); no.style.cssText="width:auto;font-size:15px;";
    var rn=document.createElement("input"); rn.type="radio"; rn.name="gm"; rn.checked=!gameOn();
    no.appendChild(rn); no.appendChild(document.createTextNode(" No"));
    line.appendChild(yes); line.appendChild(no);
    g.appendChild(line);
    ry.onchange=function(){ if(ry.checked){ S.gameOn=true; drawProfile(); drawPractice(); } };
    rn.onchange=function(){ if(rn.checked){ S.gameOn=false; drawProfile(); drawPractice(); } };
    g.appendChild(el("p","muted","Off hides ✨ points and the Game button. Your practice is unchanged — "+
      "nothing is lost, points keep counting quietly, and you can switch back any time."));
    var sep=el("div"); sep.style.cssText="border-top:1px solid #ccc;margin-top:11px;padding-top:11px;";
    sep.appendChild(el("strong",null,"Play the game on its own here!"));
    var pb=mkBtn("Play","act",function(){ alert("The standalone version isn't live yet."); });
    pb.style.cssText="margin-left:10px;padding:6px 20px;font-weight:bold;";
    sep.appendChild(pb);
    sep.appendChild(el("p","muted","Opens in a new tab. (coming soon)"));
    g.appendChild(sep);
    c.appendChild(g);
  }

  var msg=el("span","muted");
  var save=el("div"); save.style.marginTop="14px";
  var sb=mkBtn("Save settings","act",function(){
    S.name=nameIn.value.trim()||S.name; S.photo=picIn.value.trim();
    store.saveStudent({name:S.name,photo:S.photo,bg:S.bg||"",tintProfile:S.tintProfile||"",
      tintPractice:S.tintPractice||"",gameOn:gameOn()}).then(function(){
      flash(msg,"Saved ✓"); drawProfile(); drawPractice();
    }).catch(function(e){ flash(msg,"Could not save: "+e.message,4000); });
  });
  sb.style.cssText="font-weight:bold;padding:7px 20px;";
  save.appendChild(sb); save.appendChild(msg);
  c.appendChild(save);
}

/* ================= exercise ================= */
var CURRENT=null; // {ws, filled, inputs, draftTimer}

function drawExercise(){
  var host=$("exerciseCard"); clear(host);
  if(!OPEN){ CURRENT=null; return; }
  var w=WS[OPEN];
  var card=el("div","card"); host.appendChild(card);
  card.appendChild(el("p","muted","Loading…"));

  var a=null; ASSIGN.forEach(function(x){ if(x.id===OPEN) a=x; });
  var seedKey = OPEN+"|"+todayKey()+"|"+((a&&a.attempts)||0);

  store.loadDraft(OPEN).then(function(draft){
    var used = draft.usedRows || {};
    var qs = w.questions||[];
    // fill tokens for each question, sharing one pick per source across the whole worksheet
    return fillTokens((qs.map(function(q){return q.text||"";}).join("\u0001")),
                      w.sources||[], seedKey, used).then(function(res){
      var parts = res.text.split("\u0001");
      renderExercise(card, w, qs, parts, res, draft);
    });
  }).catch(function(e){
    clear(card); card.appendChild(errBox("Could not open: "+e.message));
  });
}

function renderExercise(card, w, qs, texts, tok, draft){
  clear(card);
  CURRENT={ws:w, tok:tok, inputs:[], draft:draft};
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,w.title||""));
  var ctr=el("div","ctrls");
  if(w.help && w.help.on!==false) ctr.appendChild(mkBtn("Help","edit",function(){ togglePanel("help"); }));
  if(w.check && w.check.on!==false) ctr.appendChild(mkBtn("Check","act",function(){ togglePanel("check"); }));
  head.appendChild(ctr); card.appendChild(head);

  qs.forEach(function(q,i){
    var qc=el("div"); qc.style.marginTop="12px";
    var lbl=el("p",null,null); lbl.style.cssText="font-weight:bold;margin:12px 0 4px;";
    lbl.innerHTML = (q.label||("Question "+(i+1)+"."))+" "+esc(texts[i]||"")
      .replace(/\u0000/g,"");
    // highlight substituted values
    Object.keys(tok.values||{}).forEach(function(k){
      var v=tok.values[k];
      if(v) lbl.innerHTML = lbl.innerHTML.split(esc(v)).join('<span class="word">'+esc(v)+'</span>');
    });
    qc.appendChild(lbl);

    if(q.embed){ qc.appendChild(makeFrame(q.embedLabel||"Watch this", q.embed, q.embedMode||"open")); }

    var saved = (draft.answers||{})[i];
    if(q.type==="paired"){
      var tbl=el("table");
      var hr=document.createElement("tr");
      hr.appendChild(el("th",null,q.leftLabel||"Left"));
      hr.appendChild(el("th",null,q.rightLabel||"Right"));
      hr.appendChild(el("th",null,""));
      tbl.appendChild(hr);
      var rows = (saved && saved.pairs) ? saved.pairs.slice() : [["",""]];
      function redraw(){
        while(tbl.rows.length>1) tbl.deleteRow(1);
        rows.forEach(function(pair,ri){
          var tr=document.createElement("tr");
          [0,1].forEach(function(ci){
            var td=document.createElement("td");
            var inp=document.createElement("input"); inp.type="text"; inp.value=pair[ci]||"";
            inp.setAttribute("spellcheck","true");
            inp.oninput=function(){ pair[ci]=inp.value; queueDraft(); };
            td.appendChild(inp); tr.appendChild(td);
          });
          var td3=document.createElement("td");
          td3.appendChild(mkBtn("✕","del",function(){ rows.splice(ri,1); if(!rows.length)rows.push(["",""]);
            redraw(); queueDraft(); }));
          tr.appendChild(td3); tbl.appendChild(tr);
        });
      }
      redraw();
      qc.appendChild(tbl);
      qc.appendChild(mkBtn("+ Add another","",function(){ rows.push(["",""]); redraw(); }));
      CURRENT.inputs.push({q:q, get:function(){ return {pairs:rows.filter(function(p){
        return (p[0]||"").trim()||(p[1]||"").trim(); })}; }});
    } else if(q.type==="mc"){
      var opts=(q.options||[]).slice();
      var chosen = saved ? saved.choice : null;
      opts.forEach(function(o,oi){
        var l=el("label"); l.style.cssText="display:block;border:1px solid #000;padding:6px 9px;margin:4px 0;background:#fff;cursor:pointer;";
        var r=document.createElement("input"); r.type="radio"; r.name="q"+i;
        r.checked = (chosen===oi);
        r.onchange=function(){ chosen=oi; queueDraft(); };
        l.appendChild(r); l.appendChild(document.createTextNode(" "+o));
        qc.appendChild(l);
      });
      CURRENT.inputs.push({q:q, get:function(){ return {choice:chosen, text:(opts[chosen]||"")}; }});
    } else if(q.type==="check"){
      var l2=el("label"); l2.style.cssText="display:inline-flex;align-items:center;gap:8px;cursor:pointer;";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!(saved&&saved.checked);
      cb.onchange=queueDraft;
      l2.appendChild(cb); l2.appendChild(document.createTextNode(" Yes, I did this"));
      qc.appendChild(l2);
      CURRENT.inputs.push({q:q, get:function(){ return {checked:cb.checked, text:cb.checked?"yes":"no"}; }});
    } else {
      var rb=richBox(saved?saved.html:"", q.placeholder||"");
      rb.box.oninput=queueDraft;
      qc.appendChild(rb);
      CURRENT.inputs.push({q:q, get:function(){
        var html=rb.getValue();
        var tmp=el("div"); tmp.innerHTML=html;
        return {html:html, text:(tmp.textContent||"").trim()};
      }});
    }
    card.appendChild(qc);
  });

  var autoMsg=el("p","muted","Saved automatically as you type.");
  card.appendChild(autoMsg);
  CURRENT.autoMsg=autoMsg;

  var bar=el("div"); bar.style.cssText="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;";
  var msg=el("span","muted");
  bar.appendChild(mkBtn("Submit"+(gameOn()&&w.ap?(" (✨+"+w.ap+")"):""),"submit",function(){ submitWork(msg); }));
  bar.appendChild(mkBtn("Archives","",function(){ toggleArchive(); }));
  bar.appendChild(mkBtn("Close ▴","close",function(){ OPEN=null; drawPractice(); drawExercise(); }));
  bar.appendChild(msg);
  card.appendChild(bar);

  CURRENT.panels=el("div"); $("exerciseCard").appendChild(CURRENT.panels);
}

function togglePanel(which){
  var w=CURRENT.ws, host=CURRENT.panels;
  if(host.dataset.open===which){ clear(host); host.dataset.open=""; return; }
  clear(host); host.dataset.open=which;
  var cfg = which==="help" ? (w.help||{}) : (w.check||{});
  var c=el("div","card");
  c.style.background = which==="help" ? "#f2f8f3" : "#eff5fc";
  var head=el("div","cardhead");
  head.appendChild(el("h2",null, which==="help"?"Help":"Check"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ clear(host); host.dataset.open=""; }));
  head.appendChild(ctr); c.appendChild(head);
  if(cfg.text){ var p=el("p"); p.style.margin="8px 0 0"; p.innerHTML=cfg.text; c.appendChild(p); }
  (cfg.frames||[]).forEach(function(f){
    if(f.url) c.appendChild(makeFrame(f.label,f.url,f.mode||"collapsible"));
  });
  host.appendChild(c);
}

var draftTimer=null;
function queueDraft(){
  if(!CURRENT) return;
  if(CURRENT.autoMsg) CURRENT.autoMsg.textContent="Saving…";
  clearTimeout(draftTimer);
  draftTimer=setTimeout(function(){
    var answers={};
    CURRENT.inputs.forEach(function(inp,i){ answers[i]=inp.get(); });
    store.saveDraft(OPEN,{answers:answers, at:Date.now()}).then(function(){
      if(CURRENT&&CURRENT.autoMsg) CURRENT.autoMsg.textContent="Saved automatically as you type.";
    }).catch(function(){
      if(CURRENT&&CURRENT.autoMsg) CURRENT.autoMsg.textContent="Couldn't save — check your connection.";
    });
  }, 700);
}

/* ---------- submit ---------- */
function submitWork(msg){
  if(!CURRENT) return;
  var w=CURRENT.ws, tok=CURRENT.tok;
  var answers={}, listRows=[], baseCols={};
  // auto-fill columns from the source pick
  Object.keys(tok.values||{}).forEach(function(k){
    var colName = k.split(".")[1];
    (w.archiveCols||[]).forEach(function(c){
      if(c.toLowerCase()===colName.toLowerCase()) baseCols[c]=tok.values[k];
    });
  });
  CURRENT.inputs.forEach(function(inp,i){
    var v=inp.get(); answers[i]=v;
    var q=inp.q;
    if(q.type==="paired" && q.leftCol && q.rightCol){
      (v.pairs||[]).forEach(function(p){
        var row=Object.assign({},baseCols);
        row[q.leftCol]=p[0]; row[q.rightCol]=p[1];
        listRows.push(row);
      });
    } else if(q.archiveCol){
      baseCols[q.archiveCol] = v.text || "";
    }
  });
  var rows=[];
  var now=Date.now();
  if(listRows.length){ listRows.forEach(function(r){
    rows.push({ms:now, cols:r, at:firebase.firestore.FieldValue.serverTimestamp()}); }); }
  else rows.push({ms:now, cols:baseCols, at:firebase.firestore.FieldValue.serverTimestamp()});

  var a=null; ASSIGN.forEach(function(x){ if(x.id===OPEN) a=x; });
  var firstToday = !a || a.doneDate !== todayKey();

  store.addArchiveRows(OPEN, rows).then(function(){
    return store.saveAssignment(OPEN,{doneDate:todayKey(),
      attempts:((a&&a.attempts)||0)+1, order:(a&&a.order)||0,
      addedBy:(a&&a.addedBy)||"teacher"});
  }).then(function(){
    return awardAP(w.ap||0, firstToday);
  }).then(function(){
    if(a){ a.doneDate=todayKey(); a.attempts=((a.attempts)||0)+1;
      if(a.archCount!==undefined) a.archCount+=rows.length; }
    flash(msg, gameOn()&&w.ap ? ("Submitted ✓  ✨+"+w.ap) : "Submitted ✓");
    store.saveDraft(OPEN,{answers:{}, at:Date.now()});
    OPEN=null; drawPractice(); drawExercise();
  }).catch(function(e){ flash(msg,"Could not submit: "+e.message,5000); });
}

function awardAP(amount, firstToday){
  if(!amount) return Promise.resolve();
  var tier = rewardFor(firstToday);
  var pay = tier===null ? amount : tier;
  S.ap = (S.ap||0) + pay;
  var patch = {ap:S.ap};
  if(firstToday){
    var last=S.lastPracticeDay, gap=daysBetweenKeys(last, todayKey());
    if(!last) S.streak=1;
    else if(gap===1) S.streak=(S.streak||0)+1;
    else if(gap>1) S.streak=Math.max(1,(S.streak||1)-1); // miss a day → drop one
    patch.streak=S.streak; patch.lastPracticeDay=todayKey();
    S.lastPracticeDay=todayKey();
  }
  if(!GUEST && !VIEWAS){
    db.collection("aplog").add({uid:ME, name:S.name||"", amount:pay,
      what:(CURRENT&&CURRENT.ws.title)||"", at:firebase.firestore.FieldValue.serverTimestamp()})
      .catch(function(){});
  }
  return store.saveStudent(patch);
}
function rewardFor(){ return null; } // worksheet ✨ is the payout; tiers act as a multiplier layer later

/* ---------- archives + test ---------- */
var archOpen=false;
function toggleArchive(){
  archOpen=!archOpen;
  var host=CURRENT.panels;
  clear(host); host.dataset.open="";
  if(!archOpen) return;
  var w=CURRENT.ws;
  var c=el("div","card"); host.appendChild(c);
  c.appendChild(el("p","muted","Loading…"));
  store.loadArchive(OPEN).then(function(rows){
    clear(c);
    var head=el("div","cardhead");
    head.appendChild(el("h2",null,"Archives — "+(w.title||"")));
    var ctr=el("div","ctrls");
    ctr.appendChild(mkBtn("⬇ CSV","",function(){ exportCSV(w,rows); }));
    if(w.test && w.test.on && rows.length>=4)
      ctr.appendChild(mkBtn("Test ✨","act",function(){ startTest(w,rows); }));
    ctr.appendChild(mkBtn("Close ▴","close",function(){ archOpen=false; clear(host); }));
    head.appendChild(ctr); c.appendChild(head);

    if(!rows.length){ c.appendChild(el("p","muted","Nothing archived yet — submit something.")); return; }
    var cols=w.archiveCols||[];
    var t=el("table"); t.style.marginTop="8px";
    var hr=document.createElement("tr");
    hr.appendChild(el("th",null,"When (PT)"));
    cols.forEach(function(cn){ hr.appendChild(el("th",null,cn)); });
    t.appendChild(hr);
    rows.slice(0,200).forEach(function(r){
      var tr=document.createElement("tr");
      tr.appendChild(el("td",null, r.ms? ptStamp(new Date(r.ms)) : ""));
      cols.forEach(function(cn){ tr.appendChild(el("td",null,(r.cols||{})[cn]||"")); });
      t.appendChild(tr);
    });
    c.appendChild(t);
  }).catch(function(e){ clear(c); c.appendChild(errBox("Could not load archive: "+e.message)); });
}
function exportCSV(w,rows){
  var cols=w.archiveCols||[];
  var lines=[["When (PT)"].concat(cols).map(q).join(",")];
  rows.forEach(function(r){
    lines.push([r.ms?ptStamp(new Date(r.ms)):""].concat(cols.map(function(cn){
      return (r.cols||{})[cn]||""; })).map(q).join(","));
  });
  function q(s){ return '"'+String(s).replace(/"/g,'""')+'"'; }
  var blob=new Blob([lines.join("\n")],{type:"text/csv"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=(w.title||"archive")+".csv"; a.click();
}

/* ---------- the test ---------- */
function startTest(w, rows){
  var host=CURRENT.panels; clear(host);
  var state={round:1, ap:0, over:false};
  runRound();
  function runRound(){
    clear(host);
    var c=el("div","card"); c.style.background="#eff5fc"; host.appendChild(c);
    var head=el("div","cardhead"); head.appendChild(el("h2",null,"Test"));
    var ctr=el("div","ctrls");
    ctr.appendChild(mkBtn("Close ▴","close",function(){ clear(host); }));
    head.appendChild(ctr); c.appendChild(head);

    var n=(w.test.count||5), wrong=0, answered=0;
    var qs=buildTestQuestions(w, rows, n);
    if(!qs.length){ c.appendChild(el("p","muted","Not enough archived work to build a test yet.")); return; }
    qs.forEach(function(q,qi){
      var box=el("div"); box.style.cssText="border:1px solid #000;background:#fafafa;padding:10px;margin-top:10px;";
      var p=el("p"); p.style.cssText="font-weight:bold;margin:0 0 6px;";
      p.innerHTML=(qi+1)+". "+q.prompt;
      box.appendChild(p);
      q.options.forEach(function(opt){
        var b=el("span"); b.style.cssText="display:block;border:1px solid #000;padding:6px 9px;margin:4px 0;background:#fff;cursor:pointer;";
        b.textContent=opt;
        b.onclick=function(){
          if(box.dataset.done) return;
          box.dataset.done="1"; answered++;
          if(opt===q.answer){ b.style.cssText+="border-width:2px;border-color:#0a7d1b;background:#e3f0e6;";
            b.textContent=opt+" ✓"; }
          else { b.style.cssText+="border-width:2px;border-color:#c0261a;background:#f9e2e0;";
            b.textContent=opt+" ✗"; wrong++;
            Array.prototype.forEach.call(box.children,function(ch){
              if(ch.textContent===q.answer) ch.style.cssText+="border-width:2px;border-color:#0a7d1b;background:#e3f0e6;"; });
          }
          if(answered===qs.length) finish();
        };
        box.appendChild(b);
      });
      c.appendChild(box);
    });
    var footer=el("div"); footer.style.marginTop="10px"; c.appendChild(footer);

    function finish(){
      clear(footer);
      if(wrong===0){
        var pay=w.test.ap||3;
        state.ap+=pay;
        S.ap=(S.ap||0)+pay; store.saveStudent({ap:S.ap}); drawProfile();
        var sc=el("span"); sc.style.cssText="border:2px solid #000;background:#fdf3cf;padding:8px 12px;font-weight:bold;";
        sc.textContent="✨+"+pay;
        footer.appendChild(sc);
        var again=el("p"); again.style.marginTop="8px";
        var gb=mkBtn("Go again","act",function(){ state.round++; runRound(); });
        gb.style.cssText="font-size:15px;padding:9px 16px;font-weight:bold;background:#e0ecfa;";
        again.appendChild(gb);
        var note=el("span",null," (until you get something wrong)");
        note.style.fontSize="13px"; again.appendChild(note);
        footer.appendChild(again);
      } else {
        var b=mkBtn("Try again tomorrow!","",null);
        b.disabled=true; b.style.cssText="font-size:15px;padding:9px 16px;font-weight:bold;";
        footer.appendChild(b);
        if(state.ap) footer.appendChild(el("p","muted","You banked ✨"+state.ap+" this session."));
      }
    }
  }
}
function buildTestQuestions(w, rows, n){
  var tmpl=(w.test&&w.test.wordings)||[];
  var cols=w.archiveCols||[];
  if(!tmpl.length||rows.length<3) return [];
  var out=[], tries=0;
  while(out.length<n && tries<n*12){
    tries++;
    var t=tmpl[Math.floor(Math.random()*tmpl.length)];
    var row=rows[Math.floor(Math.random()*rows.length)];
    if(!t.answerCol) continue;
    var ans=(row.cols||{})[t.answerCol];
    if(!ans) continue;
    var prompt=t.text.replace(/\{([^}]+)\}/g,function(m,inner){
      var v=(row.cols||{})[inner]; return v!==undefined? "<strong>"+esc(v)+"</strong>" : m; });
    if(prompt.indexOf("{")>=0) continue;
    var pool=[];
    rows.forEach(function(r){
      var v=(r.cols||{})[t.answerCol];
      if(v && v!==ans && pool.indexOf(v)<0) pool.push(v);
    });
    if(pool.length<((w.test.options||3)-1)) continue;
    var opts=[ans];
    while(opts.length<(w.test.options||3)){
      var pick=pool[Math.floor(Math.random()*pool.length)];
      if(opts.indexOf(pick)<0) opts.push(pick);
    }
    opts.sort(function(){ return Math.random()-0.5; });
    out.push({prompt:prompt, answer:ans, options:opts});
  }
  return out;
}
