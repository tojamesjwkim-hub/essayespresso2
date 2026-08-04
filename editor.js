// ============================================================
//  editor.js — create/edit a worksheet.
//  Question: {label,type,text,options[],correct,embed,embedLabel,embedMode,checkLabel}
//  types: typed | mc | blank | check | draw | task
// ============================================================

var wsId=new URLSearchParams(location.search).get("id");
var wsRef=wsId?wsCol.doc(wsId):null;
var questions=[];

auth.onAuthStateChanged(function(user){
  if(!user){ location.href="index.html"; return; }
  if(!isTeacher(user)){ location.href="student.html"; return; }
  loadSite();
  teacherRef.get().then(function(s){ if(s.exists) applyBackground(s.data().bg,s.data().opacity); });
  if(!wsRef){ alert("No worksheet specified."); location.href="dashboard.html"; return; }
  wsRef.get().then(function(snap){
    if(!snap.exists){ alert("That worksheet no longer exists."); location.href="dashboard.html"; return; }
    var w=snap.data();
    $("pageTitle").textContent="Edit: "+(w.title||"worksheet");
    $("wsTitle").value=w.title||"";
    $("wsTags").value=(w.tags||[]).join(" ");
    $("wsGold").value=w.gold||0;
    $("wsInstructions").value=w.instructions||"";
    $("wsInsEmbed").value=w.instructionEmbed||"";
    $("wsInsEmbedMode").value=w.instructionEmbedMode||"open";
    $("wsSlideshow").value=w.slideshow||"";
    $("wsSlideMode").value=w.slideshowMode||"collapsible";
    $("wsAllowPhotos").checked=w.allowPhotos!==false;
    questions=(w.questions||[]).map(norm);
    $("loading").classList.add("hidden");
    $("editArea").classList.remove("hidden");
    renderQuestions();
    wireButtons();
  }).catch(handleErr("Could not load worksheet"));
});

function norm(q){
  return { label:q.label||"", type:q.type||"typed", text:q.text||"",
    options:q.options||[], correct:(q.correct==null?-1:q.correct),
    embed:q.embed||"", embedLabel:q.embedLabel||"", embedMode:q.embedMode||"open",
    checkLabel:q.checkLabel||"" };
}

var TYPES=[
  {v:"typed",label:"Typed answer"},
  {v:"mc",   label:"Multiple choice"},
  {v:"blank",label:"Fill in the blank"},
  {v:"check",label:"Checkbox (tick it off)"},
  {v:"draw", label:"Draw a picture"},
  {v:"task", label:"Task (nothing to submit)"}
];

function renderQuestions(){
  var box=$("questions"); box.innerHTML="";
  if(!questions.length){ box.innerHTML='<p class="muted">No questions yet — click "+ Add question".</p>'; return; }
  questions.forEach(function(q,i){ box.appendChild(qCard(q,i)); });
}

function qCard(q,i){
  var card=el("div","card fill");

  // header: editable label + controls
  var head=el("div"); head.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;";
  var lw=el("div"); lw.style.flex="1";
  var li=document.createElement("input");
  li.type="text"; li.value=q.label||("Question "+(i+1));
  li.placeholder="Question "+(i+1);
  li.style.cssText="font-weight:bold;max-width:280px;";
  li.oninput=function(){ q.label=li.value; };
  lw.appendChild(li);
  lw.appendChild(el("span","muted"," ✎ rename (blank = auto-number)"));
  head.appendChild(lw);
  var ctr=el("div");
  ctr.appendChild(mkBtn("▲","arrow",function(){ move(i,-1); }));
  ctr.appendChild(mkBtn("▼","arrow",function(){ move(i,1); }));
  ctr.appendChild(mkBtn("Delete","del",function(){ questions.splice(i,1); renderQuestions(); }));
  head.appendChild(ctr);
  card.appendChild(head);

  // type picker
  var pick=el("div"); pick.style.cssText="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;";
  TYPES.forEach(function(t){
    var lab=el("label"); lab.style.cssText="border:1px solid #000;padding:4px 9px;font-size:13px;";
    var r=document.createElement("input");
    r.type="radio"; r.name="t"+i; r.checked=q.type===t.v; r.style.cssText="width:auto;margin-right:5px;";
    r.onchange=function(){ q.type=t.v; renderQuestions(); };
    lab.appendChild(r); lab.appendChild(document.createTextNode(t.label));
    pick.appendChild(lab);
  });
  card.appendChild(pick);

  // question text
  var ti=document.createElement("input"); ti.type="text"; ti.value=q.text||"";
  ti.placeholder = q.type==="task" ? "What should they do?" : "Question text";
  ti.oninput=function(){ q.text=ti.value; };
  card.appendChild(ti);

  // per-question embed (any type)
  var emb=el("div"); emb.style.marginTop="8px";
  emb.appendChild(el("p","muted","Embed for this question (video, doc) — optional. Students never leave the site."));
  var eu=document.createElement("input"); eu.type="url"; eu.value=q.embed||"";
  eu.placeholder="https://youtu.be/… or a Google Doc";
  eu.oninput=function(){ q.embed=eu.value; };
  emb.appendChild(eu);
  var erow=el("div"); erow.style.cssText="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;";
  var el2=document.createElement("input"); el2.type="text"; el2.value=q.embedLabel||"";
  el2.placeholder="Label (e.g. 'Watch this')"; el2.style.flex="1";
  el2.oninput=function(){ q.embedLabel=el2.value; };
  var em=document.createElement("select"); em.style.width="auto";
  em.innerHTML='<option value="open">Always open</option><option value="collapsible">Collapsible</option>';
  em.value=q.embedMode||"open"; em.onchange=function(){ q.embedMode=em.value; };
  erow.appendChild(el2); erow.appendChild(em);
  emb.appendChild(erow);
  card.appendChild(emb);

  // type extras
  if(q.type==="mc"){
    var w=el("div"); w.style.marginTop="8px";
    w.appendChild(el("p","muted","Options (tick the correct one — optional):"));
    (q.options||[]).forEach(function(opt,oi){
      var r=el("div"); r.style.cssText="display:flex;gap:6px;align-items:center;margin-bottom:5px;";
      var rad=document.createElement("input"); rad.type="radio"; rad.name="c"+i;
      rad.checked=q.correct===oi; rad.style.width="auto";
      rad.onchange=function(){ q.correct=oi; };
      var txt=document.createElement("input"); txt.type="text"; txt.value=opt; txt.style.flex="1";
      txt.oninput=function(){ q.options[oi]=txt.value; };
      r.appendChild(rad); r.appendChild(txt);
      r.appendChild(mkBtn("✕","",function(){
        q.options.splice(oi,1);
        if(q.correct===oi) q.correct=-1; else if(q.correct>oi) q.correct--;
        renderQuestions();
      }));
      w.appendChild(r);
    });
    w.appendChild(mkBtn("+ Add option","",function(){
      q.options=q.options||[]; q.options.push(""); renderQuestions();
    }));
    card.appendChild(w);
  }
  else if(q.type==="check"){
    var cw=el("div"); cw.style.marginTop="8px";
    cw.appendChild(el("p","muted","Text next to the tickbox:"));
    var ci=document.createElement("input"); ci.type="text";
    ci.value=q.checkLabel||""; ci.placeholder="Yes, I did this";
    ci.oninput=function(){ q.checkLabel=ci.value; };
    cw.appendChild(ci);
    card.appendChild(cw);
  }
  else if(q.type==="blank"){
    card.appendChild(el("p","muted","Use ___ where the blank goes."));
  }
  else if(q.type==="draw"){
    card.appendChild(el("p","muted","Student gets a drawing box (pen, eraser, undo, clear)."));
  }
  else if(q.type==="task"){
    card.appendChild(el("p","muted","Nothing to submit — they read/watch, then tick the worksheet done."));
  }
  else {
    card.appendChild(el("p","muted","Student gets a text box with a formatting toolbar."));
  }
  return card;
}

function move(i,dir){
  var j=i+dir; if(j<0||j>=questions.length) return;
  var t=questions[i]; questions[i]=questions[j]; questions[j]=t;
  renderQuestions();
}

function wireButtons(){
  $("addQBtn").onclick=function(){
    questions.push(norm({type:"typed"})); renderQuestions();
    window.scrollTo(0,document.body.scrollHeight);
  };
  $("backBtn").onclick=function(){ location.href="dashboard.html"; };
  $("previewBtn").onclick=function(){ save(function(){ location.href="student.html?preview="+wsId; }); };
  $("saveBtn").onclick=function(){ save(function(){ flash($("savedMsg"),"Saved ✓"); }); };
}
function flash(e,t){ e.textContent=t; setTimeout(function(){e.textContent="";},2000); }

function save(then){
  var title=$("wsTitle").value.trim();
  if(!title){ showErr("Give the worksheet a title."); return; }
  var clean=questions.map(function(q){
    var o={label:q.label||"",type:q.type,text:q.text||""};
    if(q.type==="mc"){ o.options=(q.options||[]).filter(function(x){return x!=="";}); o.correct=q.correct==null?-1:q.correct; }
    if(q.type==="check") o.checkLabel=q.checkLabel||"";
    if(q.embed){ o.embed=q.embed; o.embedLabel=q.embedLabel||""; o.embedMode=q.embedMode||"open"; }
    return o;
  });
  wsRef.set({
    title:title,
    tags:($("wsTags").value||"").trim().toLowerCase().split(/\s+/).filter(Boolean),
    gold:Number($("wsGold").value)||0,
    instructions:$("wsInstructions").value.trim(),
    instructionEmbed:$("wsInsEmbed").value.trim(),
    instructionEmbedMode:$("wsInsEmbedMode").value,
    slideshow:$("wsSlideshow").value.trim(),
    slideshowMode:$("wsSlideMode").value,
    allowPhotos:$("wsAllowPhotos").checked,
    questions:clean
  },{merge:true}).then(function(){ if(then) then(); })
   .catch(handleErr("Save failed"));
}
