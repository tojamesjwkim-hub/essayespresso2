/* ================= worksheet editor ================= */
var ID=new URLSearchParams(location.search).get("id"), W=null, T={}, msg=null;

auth.onAuthStateChanged(function(u){
  if(!u || !isTeacherUser(u)){ location.href="index.html"; return; }
  Promise.all([wsCol.doc(ID).get(), teacherRef.get()]).then(function(r){
    if(!r[0].exists) throw new Error("worksheet not found");
    W=Object.assign({id:ID}, r[0].data());
    T=r[1].exists?r[1].data():{};
    draw();
  }).catch(function(e){ $("notice").appendChild(errBox("Could not open: "+e.message)); });
});

function save(){
  var patch=JSON.parse(JSON.stringify(W)); delete patch.id;
  return wsCol.doc(ID).set(patch,{merge:true})
    .then(function(){ flash(msg,"Saved ✓"); })
    .catch(function(e){ flash(msg,"Could not save: "+e.message,5000); });
}
function tokensAvailable(){
  var out=[];
  (W.sources||[]).forEach(function(nm){
    var s=null; (T.sources||[]).forEach(function(x){ if(x.name===nm) s=x; });
    if(!s) return;
    (s.cols||[]).forEach(function(c){ out.push("{"+s.name+"."+c.name+"}"); });
  });
  return out;
}
/* Only the columns actually set to show as something visual can fill a media slot. */
function mediaTokens(){
  var out=[];
  (W.sources||[]).forEach(function(nm){
    var s=null; (T.sources||[]).forEach(function(x){ if(x.name===nm) s=x; });
    if(!s || s.kind!=="media") return;
    (s.cols||[]).forEach(function(c){
      if(c.showAs && c.showAs!=="text") out.push({tok:"{"+s.name+"."+c.name+"}", showAs:c.showAs});
    });
  });
  return out;
}
function showAsFor(tok){
  var f="image";
  mediaTokens().forEach(function(m){ if(m.tok===tok) f=m.showAs; });
  return f;
}

function draw(){
  var host=$("host"); clear(host);
  msg=el("span","muted");
  var c=el("div","card t"); host.appendChild(c);
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,"Editing: "+(W.title||"")));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("👁 Preview as student","edit",function(){ save().then(preview); }));
  ctr.appendChild(mkBtn("Save","act",save));
  ctr.appendChild(msg);
  head.appendChild(ctr); c.appendChild(head);

  /* basics */
  c.appendChild(el("h3",null,"Basics"));
  c.appendChild(el("div","lab","Title"));
  var ti=inp(W.title,"text",function(v){ W.title=v; }); c.appendChild(ti);

  var r1=el("div","fxrow");
  r1.appendChild(el("span","muted","Tags (space separated)")).style.width="150px";
  r1.appendChild(inp((W.tags||[]).join(" "),"text",function(v){
    W.tags=v.split(/\s+/).filter(Boolean); }));
  r1.appendChild(el("span","muted","✨ per submit"));
  r1.appendChild(inp(W.ap||0,"number",function(v){ W.ap=Number(v)||0; }));
  c.appendChild(r1);

  var r2=el("div","fxrow");
  r2.appendChild(el("span","muted","Category")).style.width="150px";
  var cat=document.createElement("select"); cat.style.cssText="flex:0 0 180px;";
  var none=document.createElement("option"); none.value=""; none.textContent="— none —"; cat.appendChild(none);
  (T.categories||[]).forEach(function(x){ var o=document.createElement("option");
    o.value=x.name; o.textContent=x.name; cat.appendChild(o); });
  cat.value=W.category||"";
  cat.onchange=function(){ W.category=cat.value; };
  r2.appendChild(cat);
  var ssl=el("label"); ssl.style.width="auto";
  var ss=document.createElement("input"); ss.type="checkbox"; ss.checked=!!W.selfServe;
  ss.onchange=function(){ W.selfServe=ss.checked; };
  ssl.appendChild(ss); ssl.appendChild(document.createTextNode(" students may self-assign"));
  r2.appendChild(ssl);
  c.appendChild(r2);

  var r3=el("div","fxrow");
  r3.appendChild(el("span","muted","Progress counter")).style.width="150px";
  var cs=document.createElement("select"); cs.style.cssText="flex:0 0 160px;";
  [["none","none"],["total","done / total"],["unit","count + unit"]].forEach(function(o){
    var x=document.createElement("option"); x.value=o[0]; x.textContent=o[1]; cs.appendChild(x); });
  cs.value=W.counterStyle||"none";
  r3.appendChild(cs);
  var cx=el("span"); r3.appendChild(cx);
  function counterExtra(){
    clear(cx);
    if(cs.value==="total"){
      cx.appendChild(el("span","muted","total "));
      cx.appendChild(inp(W.counterTotal||0,"number",function(v){ W.counterTotal=Number(v)||0; }));
    } else if(cs.value==="unit"){
      cx.appendChild(el("span","muted","unit "));
      var u=inp(W.counterUnit||"","text",function(v){ W.counterUnit=v; });
      u.style.cssText="width:130px;"; cx.appendChild(u);
    }
  }
  cs.onchange=function(){ W.counterStyle=cs.value; counterExtra(); };
  counterExtra();
  c.appendChild(r3);

  /* archive columns */
  c.appendChild(el("h3",null,"Archive columns"));
  W.archiveCols = W.archiveCols||[];
  var at=el("table"); at.style.maxWidth="520px"; c.appendChild(at);
  function renderCols(){
    clear(at);
    var hr=document.createElement("tr");
    ["Col","Name",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    at.appendChild(hr);
    var tr0=document.createElement("tr");
    tr0.appendChild(el("td",null,"0"));
    tr0.appendChild(el("td","muted","Timestamp — automatic"));
    tr0.appendChild(el("td",null,"")); at.appendChild(tr0);
    W.archiveCols.forEach(function(cn,i){
      var tr=document.createElement("tr");
      tr.appendChild(el("td",null,String(i+1)));
      var td=el("td");
      td.appendChild(inp(cn,"text",function(v){ W.archiveCols[i]=v; }));
      tr.appendChild(td);
      var td2=el("td");
      td2.appendChild(mkBtn("✕","del",function(){ W.archiveCols.splice(i,1); renderCols(); drawQuestions(); }));
      tr.appendChild(td2); at.appendChild(tr);
    });
  }
  renderCols();
  c.appendChild(mkBtn("+ Add column","act",function(){
    W.archiveCols.push("Column "+(W.archiveCols.length+1)); renderCols(); drawQuestions(); }));
  c.appendChild(el("p","muted",
    "Columns whose name matches a source column (e.g. a column called \"words\" with a {src.words} token) "+
    "fill in automatically."));

  /* panels */
  ["help","check"].forEach(function(key){
    W[key]=W[key]||{on:true,text:"",frames:[]};
    c.appendChild(el("h3",null,'"'+(key==="help"?"Help":"Check")+'" panel'));
    var l=el("label"); l.style.width="auto";
    var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=W[key].on!==false;
    cb.onchange=function(){ W[key].on=cb.checked; };
    l.appendChild(cb); l.appendChild(document.createTextNode(" Show a "+
      (key==="help"?"Help":"Check")+" button on this worksheet"));
    c.appendChild(l);
    c.appendChild(el("div","lab","Text"));
    var ta=document.createElement("textarea"); ta.style.minHeight="44px"; ta.value=W[key].text||"";
    ta.oninput=function(){ W[key].text=ta.value; };
    c.appendChild(ta);
    c.appendChild(el("div","lab","Iframes"));
    var ft=el("table"); c.appendChild(ft);
    function renderFrames(){
      clear(ft);
      var hr=document.createElement("tr");
      ["#","URL","Label","Mode",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
      ft.appendChild(hr);
      (W[key].frames||[]).forEach(function(f,i){
        var tr=document.createElement("tr");
        tr.appendChild(el("td",null,String(i+1)));
        var t1=el("td"); t1.appendChild(inp(f.url,"url",function(v){ f.url=v; })); tr.appendChild(t1);
        var t2=el("td"); t2.appendChild(inp(f.label,"text",function(v){ f.label=v; })); tr.appendChild(t2);
        var t3=el("td");
        var m=document.createElement("select");
        [["collapsible","Collapsible"],["open","Always open"]].forEach(function(o){
          var x=document.createElement("option"); x.value=o[0]; x.textContent=o[1]; m.appendChild(x); });
        m.value=f.mode||"collapsible"; m.onchange=function(){ f.mode=m.value; };
        t3.appendChild(m); tr.appendChild(t3);
        var t4=el("td"); t4.appendChild(mkBtn("✕","del",function(){
          W[key].frames.splice(i,1); renderFrames(); }));
        tr.appendChild(t4); ft.appendChild(tr);
      });
    }
    renderFrames();
    c.appendChild(mkBtn("+ Add iframe","act",function(){
      W[key].frames=W[key].frames||[];
      W[key].frames.push({url:"",label:"Reference",mode:"collapsible"}); renderFrames(); }));
  });
  c.appendChild(el("p","muted",
    "Note: many sites (Google search, dictionary.com) block being embedded and will show blank. "+
    "Google Docs you own always work."));

  /* sources */
  c.appendChild(el("h3",null,"Sources for this worksheet"));
  W.sources=W.sources||[];
  var sh=el("div"); c.appendChild(sh);
  function renderSources(){
    clear(sh);
    W.sources.forEach(function(nm,i){
      var r=el("div","fxrow");
      var s=document.createElement("select"); s.style.cssText="flex:0 0 200px;";
      (T.sources||[]).forEach(function(x){ var o=document.createElement("option");
        o.value=x.name;
        o.textContent=x.name+(x.kind==="media"?"  (media set)":"");
        s.appendChild(o); });
      s.value=nm; s.onchange=function(){ W.sources[i]=s.value; renderSources(); };
      r.appendChild(s);
      r.appendChild(mkBtn("✕","del",function(){ W.sources.splice(i,1); renderSources(); }));
      sh.appendChild(r);
    });
    var tk=el("div"); tk.style.cssText=
      "border:2px solid #b8860b;background:#fffdf0;padding:9px;margin-top:8px;font-size:13px;";
    var toks=tokensAvailable();
    tk.innerHTML = "<strong>Available tokens:</strong> "+
      (toks.map(function(t){ return "<code>"+esc(t)+"</code>"; }).join(" ")||"none — add a source")+
      "<br>Two tokens from the <strong>same</strong> source come from the same row (a matched pair). "+
      "Tokens from <strong>different</strong> sources are picked independently."+
      (mediaTokens().length
        ? ("<br><strong>Can fill a media slot:</strong> "+
           mediaTokens().map(function(m){
             return "<code>"+esc(m.tok)+"</code> ("+m.showAs+")"; }).join(" "))
        : "");
    sh.appendChild(tk);
  }
  renderSources();
  c.appendChild(mkBtn("+ Add source","act",function(){
    var first=(T.sources||[])[0]; if(!first){ alert("Add a source on the dashboard first."); return; }
    W.sources.push(first.name); renderSources(); }));

  /* questions */
  c.appendChild(el("h3",null,"Questions"));
  var qh=el("div"); c.appendChild(qh);
  window.drawQuestions=function(){
    clear(qh);
    W.questions=W.questions||[];
    W.questions.forEach(function(q,i){ qh.appendChild(questionCard(q,i)); });
  };
  drawQuestions();
  c.appendChild(mkBtn("+ Add question","act",function(){
    var cols=W.archiveCols||[];
    W.questions.push({label:"Question "+(W.questions.length+1)+".",type:"typed",text:"",
      archiveCol: cols[Math.min(W.questions.length, cols.length-1)] || ""});
    drawQuestions(); }));
  c.appendChild(el("p","muted",
    "Each question needs its own archive column, or its answer won't be saved. "+
    "Two questions pointing at the same column get joined with \" | \"."));

  /* test */
  c.appendChild(el("h3",null,"Test settings"));
  W.test=W.test||{on:false,count:5,options:3,ap:3,wordings:[]};
  var tl=el("label"); tl.style.width="auto";
  var tcb=document.createElement("input"); tcb.type="checkbox"; tcb.checked=!!W.test.on;
  tcb.onchange=function(){ W.test.on=tcb.checked; };
  tl.appendChild(tcb); tl.appendChild(document.createTextNode(' Show "Test ✨" on this worksheet\'s archive'));
  c.appendChild(tl);
  var tr1=el("div","fxrow");
  tr1.appendChild(el("span","muted","Questions per round")).style.width="170px";
  tr1.appendChild(inp(W.test.count||5,"number",function(v){ W.test.count=Number(v)||5; }));
  c.appendChild(tr1);
  var tr2=el("div","fxrow");
  tr2.appendChild(el("span","muted","Answer options each")).style.width="170px";
  tr2.appendChild(inp(W.test.options||3,"number",function(v){ W.test.options=Number(v)||3; }));
  c.appendChild(tr2);
  var tr3=el("div","fxrow");
  tr3.appendChild(el("span","muted","✨ per perfect round")).style.width="170px";
  tr3.appendChild(inp(W.test.ap||3,"number",function(v){ W.test.ap=Number(v)||3; }));
  c.appendChild(tr3);
  var tokBox=el("div");
  tokBox.style.cssText="border:2px solid #b8860b;background:#fffdf0;padding:9px;margin-top:8px;font-size:13px;";
  tokBox.innerHTML="<strong>Test tokens are your ARCHIVE COLUMNS</strong> — including whatever the student "+
    "wrote. One row is picked, so every token in a wording comes from that same entry.<br>Available: "+
    ((W.archiveCols||[]).map(function(cn){ return "<code>{"+esc(cn)+"}</code>"; }).join(" ")||"add a column first")+
    "<br>e.g. <code>What does the keyword in \"{What you wrote}\" mean?</code> with the answer column set to "+
    "<code>Meaning</code>.";
  c.appendChild(tokBox);
  c.appendChild(el("div","lab","Question wording"));
  var wh=el("div"); c.appendChild(wh);
  function renderWordings(){
    clear(wh);
    (W.test.wordings||[]).forEach(function(w,i){
      var r=el("div","fxrow");
      r.appendChild(inp(w.text,"text",function(v){ w.text=v; })).style.cssText="flex:2;min-width:200px;";
      r.appendChild(el("span","muted","answer →"));
      var s=document.createElement("select"); s.style.cssText="flex:0 0 140px;";
      (W.archiveCols||[]).forEach(function(cn){ var o=document.createElement("option");
        o.value=cn; o.textContent=cn; s.appendChild(o); });
      s.value=w.answerCol||""; s.onchange=function(){ w.answerCol=s.value; };
      r.appendChild(s);
      r.appendChild(mkBtn("✕","del",function(){ W.test.wordings.splice(i,1); renderWordings(); }));
      wh.appendChild(r);
    });
  }
  renderWordings();
  c.appendChild(mkBtn("+ Add question wording","act",function(){
    W.test.wordings=W.test.wordings||[];
    W.test.wordings.push({text:"What does {"+((W.archiveCols||["Word"])[0])+"} mean?",
      answerCol:(W.archiveCols||[])[1]||""});
    renderWordings(); }));

  c.appendChild(el("h3",null,"Other"));
  var pd=el("label"); pd.style.width="auto";
  var pcb=document.createElement("input"); pcb.type="checkbox"; pcb.checked=!!W.publicDemo;
  pcb.onchange=function(){ W.publicDemo=pcb.checked; };
  pd.appendChild(pcb); pd.appendChild(document.createTextNode(" Public demo — visible to guests who aren't logged in"));
  c.appendChild(pd);

  var sb=el("div"); sb.style.marginTop="14px";
  sb.appendChild(mkBtn("Save","act",save));
  sb.appendChild(mkBtn("Back to dashboard","",function(){ save().then(function(){
    location.href="teacher.html"; }); }));
  c.appendChild(sb);
}

function inp(val,type,fn){
  var i=document.createElement("input"); i.type=type||"text";
  i.value=(val===undefined||val===null)?"":val;
  i.oninput=function(){ fn(i.value); };
  if(type==="number") i.style.width="90px";
  return i;
}
function questionCard(q,i){
  var box=el("div","card"); box.style.background="#fff";
  var top=el("div"); top.style.cssText="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;";
  var lab=inp(q.label,"text",function(v){ q.label=v; }); lab.style.cssText="width:170px;font-weight:bold;";
  top.appendChild(lab);
  var btns=el("span");
  btns.appendChild(mkBtn("▲","",function(){ if(i>0){ var x=W.questions[i-1];
    W.questions[i-1]=W.questions[i]; W.questions[i]=x; drawQuestions(); } }));
  btns.appendChild(mkBtn("▼","",function(){ if(i<W.questions.length-1){ var x=W.questions[i+1];
    W.questions[i+1]=W.questions[i]; W.questions[i]=x; drawQuestions(); } }));
  btns.appendChild(mkBtn("Delete","del",function(){ W.questions.splice(i,1); drawQuestions(); }));
  top.appendChild(btns); box.appendChild(top);

  var types=[["typed","Typed"],["paired","Paired list"],["mc","MCQ"],["check","Checkbox"]];
  var tp=el("div"); tp.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;";
  types.forEach(function(t){
    var l=el("label"); l.style.cssText="border:1px solid #000;padding:4px 9px;font-size:13px;width:auto;cursor:pointer;"+
      (q.type===t[0]?"background:#000;color:#fff;font-weight:bold;":"background:#fff;");
    var r=document.createElement("input"); r.type="radio"; r.name="qt"+i; r.checked=(q.type===t[0]);
    r.onchange=function(){ q.type=t[0]; drawQuestions(); };
    l.appendChild(r); l.appendChild(document.createTextNode(" "+t[1]));
    tp.appendChild(l);
  });
  box.appendChild(tp);

  box.appendChild(el("div","lab","Question text"));
  box.appendChild(inp(q.text,"text",function(v){ q.text=v; }));
  var toks=tokensAvailable();
  if(toks.length) box.appendChild(el("p","muted","Tokens: "+toks.join(" ")));

  if(q.type==="typed"){
    box.appendChild(el("div","lab","Grey placeholder text"));
    box.appendChild(inp(q.placeholder,"text",function(v){ q.placeholder=v; }));
    var al=el("label"); al.style.cssText="width:auto;display:block;margin-top:6px;";
    var acb=document.createElement("input"); acb.type="checkbox"; acb.checked=!!q.accumulate;
    acb.onchange=function(){ q.accumulate=acb.checked; drawQuestions(); };
    al.appendChild(acb);
    al.appendChild(document.createTextNode(" Carry work forward — this box opens pre-filled with everything submitted before"));
    box.appendChild(al);
    if(q.accumulate){
      var ar=el("div","fxrow");
      ar.appendChild(el("span","muted","Pull from")).style.width="90px";
      ar.appendChild(colSelect(q.accumulateFrom,function(v){ q.accumulateFrom=v; }));
      ar.appendChild(el("span","muted","joined by"));
      ar.appendChild(inp(q.accumulateJoin===undefined?" ":q.accumulateJoin,"text",
        function(v){ q.accumulateJoin=v; }));
      box.appendChild(ar);
      box.appendChild(el("p","muted",
        "Each submission appends to what's already there — so \"I like dogs.\" becomes "+
        "\"I like dogs. I like cats.\" the next day. Editable every time."));
    }
  }
  if(q.type==="mc"){
    box.appendChild(el("div","lab","Options (one per line)"));
    var ta=document.createElement("textarea"); ta.style.minHeight="60px";
    ta.value=(q.options||[]).join("\n");
    ta.oninput=function(){ q.options=ta.value.split("\n").filter(Boolean); };
    box.appendChild(ta);
  }
  /* ---- media slot ---- */
  var mts = mediaTokens();
  box.appendChild(el("div","lab","Show a media slot under the question"));
  if(!mts.length){
    box.appendChild(el("p","muted",
      "No media set is attached to this worksheet yet. Add one under Sources on your dashboard, "+
      "set a column to show as an image, PDF or web page, then add it to this worksheet above."));
  } else {
    var mr=el("div","fxrow");
    var msel=document.createElement("select"); msel.style.cssText="flex:0 0 210px;width:auto;";
    var mnone=document.createElement("option"); mnone.value=""; mnone.textContent="— none —";
    msel.appendChild(mnone);
    mts.forEach(function(m){
      var o=document.createElement("option");
      o.value=m.tok; o.textContent=m.tok+"  ("+m.showAs+")";
      msel.appendChild(o);
    });
    msel.value=q.media||"";
    msel.onchange=function(){ q.media=msel.value; drawQuestions(); };
    mr.appendChild(msel);
    if(q.media){
      mr.appendChild(el("span","muted","caption"));
      mr.appendChild(inp(q.mediaCaption,"text",function(v){ q.mediaCaption=v; }));
    }
    box.appendChild(mr);
    if(q.media){
      box.appendChild(el("p","muted",
        "Any other token from the same source comes from the same row, so the caption always "+
        "matches what's shown. A caption can be a token too, e.g. {paintings.title}."));
      box.appendChild(el("div","lab","Also save the media link to"));
      var mc=colSelect(q.mediaCol,function(v){ q.mediaCol=v; });
      mc.style.borderWidth="2px"; mc.style.borderColor="#0a7d1b";
      box.appendChild(mc);
      box.appendChild(el("p","muted",
        "This is the part that makes it worth something later — the archive keeps which picture "+
        "they were looking at, so the row still means something a month on, and the test can "+
        "show it back to them."));
    }
  }

  box.appendChild(el("div","lab","Embed for this question (optional)"));
  var er=el("div","fxrow");
  er.appendChild(inp(q.embedLabel,"text",function(v){ q.embedLabel=v; },"140px"));
  er.appendChild(inp(q.embed,"url",function(v){ q.embed=v; }));
  var em=document.createElement("select"); em.style.cssText="flex:0 0 130px;";
  [["open","Always open"],["collapsible","Collapsible"]].forEach(function(o){
    var x=document.createElement("option"); x.value=o[0]; x.textContent=o[1]; em.appendChild(x); });
  em.value=q.embedMode||"open"; em.onchange=function(){ q.embedMode=em.value; };
  er.appendChild(em); box.appendChild(er);
  box.appendChild(el("p","muted",
    "Label · URL · mode. Google Docs/Sheets/Slides need to be shared (Anyone with the link) or "+
    "published to the web — otherwise the box renders blank. YouTube links convert automatically."));

  if(q.type==="paired"){
    box.appendChild(el("div","lab","Label the two boxes"));
    var lr=el("div","fxrow");
    lr.appendChild(inp(q.leftLabel||"Left","text",function(v){ q.leftLabel=v; }));
    lr.appendChild(inp(q.rightLabel||"Right","text",function(v){ q.rightLabel=v; }));
    box.appendChild(lr);
    box.appendChild(el("div","lab","Send to archive columns"));
    var ar=el("div","fxrow");
    ar.appendChild(el("span","muted","left →"));
    ar.appendChild(colSelect(q.leftCol,function(v){ q.leftCol=v; }));
    ar.appendChild(el("span","muted","right →"));
    ar.appendChild(colSelect(q.rightCol,function(v){ q.rightCol=v; }));
    box.appendChild(ar);
    box.appendChild(el("p","muted","Each line the student adds becomes its own archive row."));
  } else {
    box.appendChild(el("div","lab","Send this answer to archive column"));
    box.appendChild(colSelect(q.archiveCol,function(v){ q.archiveCol=v; }));
  }
  return box;
}
function colSelect(val,fn){
  var s=document.createElement("select"); s.style.cssText="flex:0 0 170px;width:auto;";
  var none=document.createElement("option"); none.value=""; none.textContent="don't archive";
  s.appendChild(none);
  (W.archiveCols||[]).forEach(function(cn){ var o=document.createElement("option");
    o.value=cn; o.textContent=cn; s.appendChild(o); });
  s.value=val||""; s.onchange=function(){ fn(s.value); if(window.checkCols) checkCols(); };
  return s;
}

/* ---------- preview ---------- */
function preview(){
  var bar=$("previewBar"); bar.className="ok";
  clear(bar);
  bar.appendChild(el("strong",null,"Previewing as a student. "));
  bar.appendChild(mkBtn('← Back to editing "'+(W.title||"")+'"',"act",function(){
    location.reload(); }));
  var f=document.createElement("iframe");
  f.src="student.html?preview="+ID;
  f.style.cssText="width:100%;height:640px;border:2px solid #000;margin-top:10px;background:#fff;";
  clear($("host")); $("host").appendChild(f);
}
