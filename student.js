// ============================================================
//  student.js — student experience.
//  Modes: normal | ?as=<uid> (teacher view-as) | ?preview=<wsId>
// ============================================================

var params   = new URLSearchParams(location.search);
var asUid    = params.get("as");
var previewWs= params.get("preview");

var ME=null, meData=null, readOnly=false, viewerIsTeacher=false, wordlistBuilt=false;
var siteSettings={}, teacherProfile={}, worksheetCache={};

// ---------- boot ----------
auth.onAuthStateChanged(function(user){
  if(!user){ location.href="index.html"; return; }
  viewerIsTeacher=isTeacher(user);

  loadSite().then(function(s){ siteSettings=s; });
  teacherRef.get().then(function(s){ if(s.exists) teacherProfile=s.data(); });

  if(previewWs){
    if(!viewerIsTeacher){ location.href="student.html"; return; }
    return bootPreview(user);
  }
  if(asUid){
    if(!viewerIsTeacher){ location.href="student.html"; return; }
    readOnly=true; return bootViewAs(asUid);
  }
  if(viewerIsTeacher){ location.href="dashboard.html"; return; }

  ME=user.uid;
  ensureStudentDoc(user).then(function(snap){
    meData=snap.data();
    if(meData.status==="approved"){ startApp(); return; }
    // not approved — are they a parent viewer? if so, send them to the parent page
    findViewableStudents(user.email).then(function(kids){
      if(kids && kids.length){ location.href="parent.html"; return; }
      showPending(user);
    }).catch(function(){ showPending(user); });
  }).catch(handleErr("Could not load your account"));
});

function bar(txt){
  var b=$("viewBar"); b.classList.remove("hidden");
  b.innerHTML='<span>'+txt+'</span><a href="dashboard.html" style="color:#fff;">← Back to my dashboard</a>';
}
function bootViewAs(uid){
  ME=uid; bar("👁 Viewing this student's dashboard (read-only)");
  studentsCol.doc(uid).get().then(function(s){
    if(!s.exists){ alert("Student not found."); location.href="dashboard.html"; return; }
    meData=s.data(); startApp();
  });
}
function bootPreview(user){
  readOnly=true; ME=user.uid; bar("👁 Previewing this worksheet as a student sees it");
  meData={name:"Preview",email:user.email,gold:0,status:"approved"};
  $("loading").classList.add("hidden"); $("app").classList.remove("hidden");
  paintMe();
  ["boxesArea"].forEach(function(id){ $(id).innerHTML=""; });
  $("assignedList").innerHTML='<p class="muted">(preview mode)</p>';
  wsCol.doc(previewWs).get().then(function(s){
    if(!s.exists){ alert("Worksheet not found."); location.href="dashboard.html"; return; }
    openWorksheet(Object.assign({id:s.id},s.data()), null);
  });
}
function showPending(user){
  $("loading").classList.add("hidden");
  $("pendingScreen").classList.remove("hidden");
  $("pendingEmail").textContent=user.email;
  siteRef.get().then(function(s){
    var d=s.exists?s.data():{};
    if($("siteTitle")) $("siteTitle").textContent=d.title||SITE_DEFAULTS.title;
    if(d.icon) $("siteIcon").innerHTML='<img src="'+esc(d.icon)+'" alt="">';
    applyBackground(d.bg,d.opacity);
  });
  $("pendingLogout").onclick=logout;
}

// ---------- app ----------
function startApp(){
  $("loading").classList.add("hidden");
  $("app").classList.remove("hidden");
  paintMe();
  addPanelGears();
  applyBackground(meData.bg,meData.opacity);
  wirePanels();
  loadBoxes();
  loadAssignments();
  loadQuestions();
  $("refreshAssigned").onclick=loadAssignments;
  $("exportJson").onclick=exportJSON;
  $("exportCsv").onclick=exportCSV;
  if(readOnly) lockDown();
}

function paintMe(){
  siteRef.get().then(function(s){
    var d=s.exists?s.data():{};
    if($("siteTitle2")) $("siteTitle2").textContent=d.title||SITE_DEFAULTS.title;
    if(d.icon && $("siteIcon2")) $("siteIcon2").innerHTML='<img src="'+esc(d.icon)+'" alt="">';
  });
  $("myName").textContent=meData.name||(meData.email||"").split("@")[0];
  $("myEmail").textContent=meData.email||"";
  $("myGold").textContent=meData.gold||0;
  $("myAvatar").innerHTML=meData.photo
    ? '<img src="'+esc(meData.photo)+'" alt="">'
    : esc((meData.name||meData.email||"?").charAt(0).toUpperCase());
}

function lockDown(){
  setTimeout(function(){
    $("app").querySelectorAll("button,input,textarea,select,[contenteditable]").forEach(function(e){
      if(["exportJson","exportCsv","refreshAssigned","logoutBtn"].indexOf(e.id)>=0) return;
      if(e.classList.contains("openbtn")) return;
      if(e.hasAttribute("contenteditable")) e.setAttribute("contenteditable","false");
      else e.disabled=true;
    });
  },500);
}

function wirePanels(){
  function toggle(id, others){
    (others||[]).forEach(function(o){ $(o).classList.add("hidden"); });
    $(id).classList.toggle("hidden");
  }
  $("gameBtn").onclick=function(){ toggle("gamePanel",["profPanel","apPanel","wordPanel"]); };
  $("wordBtn").onclick=function(){
    toggle("wordPanel",["gamePanel","profPanel","apPanel"]);
    if(!$("wordPanel").classList.contains("hidden") && !wordlistBuilt){
      wordlistBuilt=true;
      teacherRef.get().then(function(ts){
        var raw=(ts.exists && ts.data().wordRefs)||"";
        var refs=raw.split("\n").map(function(line){
          var p2=line.split("|").map(function(x){return x.trim();});
          if(!p2[0]&&!p2[1]) return null;
          return {label:p2[0]||"Reference",url:p2[1]||"",mode:(p2[2]||"collapsible")};
        }).filter(function(x){ return x && x.url; });
        buildWordlist($("wordBody"), studentsCol.doc(ME).collection("wordlist"), refs, readOnly);
      });
    }
  };
  $("wordClose").onclick=function(){ $("wordPanel").classList.add("hidden"); };
  $("askBtn2").onclick=function(){ $("askCard").classList.toggle("hidden"); };
  $("gameClose").onclick=function(){ $("gamePanel").classList.add("hidden"); };

  $("profBtn").onclick=function(){
    $("epName").value=meData.name||""; $("epPhoto").value=meData.photo||"";
    toggle("profPanel",["gamePanel","apPanel","wordPanel"]);
  };
  $("epCancel").onclick=function(){ $("profPanel").classList.add("hidden"); };
  wireImageUpload("epUpload","epFile","epPhoto",240);
  $("epSave").onclick=function(){
    var upd={name:$("epName").value.trim()||meData.name, photo:$("epPhoto").value.trim()};
    studentsCol.doc(ME).set(upd,{merge:true}).then(function(){
      meData=Object.assign(meData,upd); paintMe(); $("profPanel").classList.add("hidden");
    }).catch(handleErr("Could not save profile"));
  };

  $("apBtn").onclick=function(){
    renderSwatches("apSwatches","apBg");
    $("apBg").value=meData.bg||"";
    $("apOpacity").value=Math.min(80,meData.opacity==null?80:meData.opacity);
    $("apOpVal").textContent=$("apOpacity").value;
    toggle("apPanel",["gamePanel","profPanel","wordPanel"]);
  };
  $("apOpacity").oninput=function(){ $("apOpVal").textContent=$("apOpacity").value; };
  $("apCancel").onclick=function(){ $("apPanel").classList.add("hidden"); };
  $("apSave").onclick=function(){
    var upd={bg:$("apBg").value.trim(), opacity:Number($("apOpacity").value)};
    studentsCol.doc(ME).set(upd,{merge:true}).then(function(){
      meData=Object.assign(meData,upd); applyBackground(upd.bg,upd.opacity);
      $("apPanel").classList.add("hidden");
    }).catch(handleErr("Could not save appearance"));
  };

  $("logoutBtn").onclick=logout;
  makeCollapsible($("askBody"),$("askToggle"),true);
  $("qaToggle").onclick=function(){ $("qaList").classList.toggle("hidden"); };
  $("askBtn").onclick=submitQuestion;
}

// ---------- questions ----------
function submitQuestion(){
  var t=$("askInput").value.trim();
  if(!t) return;
  studentsCol.doc(ME).collection("questions").add({
    text:t, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    reply:"", answered:false
  }).then(function(){ $("askInput").value=""; loadQuestions(); })
    .catch(handleErr("Could not send question"));
}
function loadQuestions(){
  studentsCol.doc(ME).collection("questions").orderBy("createdAt","desc").limit(20).get()
    .then(function(snap){
      var box=$("qaList"); box.innerHTML="";
      if(snap.empty){ box.innerHTML='<p class="muted">No questions yet.</p>'; return; }
      snap.forEach(function(d){
        var q=d.data();
        var c=el("div","comment");
        c.innerHTML='<strong>'+esc(fmtTime(q.createdAt))+'</strong> — '+esc(q.text);
        if(q.reply) c.innerHTML+='<br><strong>'+esc(teacherName())+' says…</strong> '+esc(q.reply);
        box.appendChild(c);
      });
    }).catch(function(){});
}
function teacherName(){ return teacherProfile.name || "Jim"; }

// ---------- custom boxes ----------
function loadBoxes(){
  boxesCol.orderBy("order","asc").get().then(function(snap){
    var area=$("boxesArea"); area.innerHTML="";
    snap.forEach(function(d){
      var b=d.data();
      if(b.audience==="none") return;
      var visible = b.audience==="all" || (b.students||[]).indexOf(ME)>=0;
      if(!visible) return;
      area.appendChild(renderBox(b));
    });
  }).catch(function(){});
}
function renderBox(b){
  var card=el("div","card");
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,esc(b.title||"")));
  var body=el("div");
  var btn=mkBtn("","");
  head.appendChild(btn);
  card.appendChild(head); card.appendChild(body);

  addBoxGear(head, card, (meData.boxTints||{})["box_"+b.id], function(c){
    var t=Object.assign({},meData.boxTints||{}); t["box_"+b.id]=c;
    meData.boxTints=t;
    if(!readOnly) studentsCol.doc(ME).set({boxTints:t},{merge:true});
  });

  if(b.text){ var p=el("p"); p.style.margin="8px 0 4px"; p.textContent=b.text; body.appendChild(p); }
  (b.items||[]).forEach(function(it){
    if(!it.url) return;
    body.appendChild(makeEmbed(it.label,it.url,it.mode||"open"));
  });

  // optional free text box for the student
  if(b.textbox && b.textbox!=="off"){
    body.appendChild(el("p","muted","Your notes:"));
    var ta=document.createElement("textarea"); ta.style.minHeight="60px";
    var noteRef=studentsCol.doc(ME).collection("boxnotes").doc(b.id);
    var msg=el("span","muted");
    var listBox=el("div");
    noteRef.get().then(function(sn){
      if(sn.exists){
        var d=sn.data();
        if(b.textbox==="single") ta.value=d.text||"";
        else renderNotes(d.entries||[]);
      }
    }).catch(function(){});
    function renderNotes(entries){
      listBox.innerHTML="";
      (entries||[]).slice().reverse().forEach(function(e2){
        listBox.appendChild(el("div","comment","<strong>"+esc(fmtTime(e2.at))+"</strong><br>"+esc(e2.text)));
      });
    }
    body.appendChild(ta);
    if(!readOnly){
      var save=mkBtn("Save","primary",function(){
        var v=ta.value.trim(); if(!v) return;
        if(b.textbox==="single"){
          noteRef.set({text:v},{merge:true}).then(function(){
            msg.textContent="Saved ✓"; setTimeout(function(){msg.textContent="";},1500);
          }).catch(function(e3){ msg.textContent="Error: "+e3.message; });
        } else {
          noteRef.get().then(function(sn){
            var entries=(sn.exists&&sn.data().entries)||[];
            entries.push({text:v,at:new Date().toISOString()});
            return noteRef.set({entries:entries},{merge:true}).then(function(){
              ta.value=""; renderNotes(entries); msg.textContent="Saved ✓";
              setTimeout(function(){msg.textContent="";},1500);
            });
          }).catch(function(e3){ msg.textContent="Error: "+e3.message; });
        }
      });
      var bar2=el("div"); bar2.style.marginTop="6px";
      bar2.appendChild(save); bar2.appendChild(msg);
      body.appendChild(bar2);
    }
    if(b.textbox==="list") body.appendChild(listBox);
  }

  makeCollapsible(body,btn,true);
  return card;
}

// ---------- assigned worksheets ----------
var openWsId=null;
function loadAssignments(){
  studentsCol.doc(ME).collection("assignments").get().then(function(snap){
    var list=[];
    snap.forEach(function(d){ list.push(Object.assign({wsId:d.id},d.data())); });
    list.sort(function(a,b){ return (a.order||0)-(b.order||0); });
    if(!list.length){ $("assignedList").innerHTML='<p class="muted">Nothing assigned yet.</p>'; return; }
    return Promise.all(list.map(function(a){
      return wsCol.doc(a.wsId).get().then(function(s){
        if(!s.exists) return null;
        var w=Object.assign({id:s.id,assignment:a},s.data());
        worksheetCache[s.id]=w; return w;
      });
    })).then(function(ws){ renderAssigned(ws.filter(Boolean)); });
  }).catch(handleErr("Could not load your work"));
}

function renderAssigned(list){
  var box=$("assignedList"); box.innerHTML="";
  list.forEach(function(w,i){
    var a=w.assignment;
    var row=el("div","row");
    var left=el("div","left");
    left.style.cssText="display:flex;align-items:center;gap:8px;";

    left.appendChild(el("span","qnum",(i+1)+"."));

    var lab=el("label","bigcheck");
    var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!a.done;
    var bx=el("span","box"); if(a.done) bx.textContent="✓";
    var txt=el("span");
    var goldTag = w.gold ? ' <span class="gold"><span class="dot"></span>'+w.gold+'</span>' : '';
    var sub=el("span","muted", a.done ? "Done — "+esc(fmtTime(a.doneAt)) : "not done yet");
    txt.innerHTML="<strong>"+esc(w.title)+"</strong>"+goldTag+"<br>";
    txt.appendChild(sub);
    cb.onchange=function(){
      if(readOnly){ cb.checked=a.done; return; }
      var done=cb.checked;
      bx.textContent=done?"✓":"";
      var upd = done
        ? {done:true, doneAt:firebase.firestore.FieldValue.serverTimestamp()}
        : {done:false, doneAt:null};
      studentsCol.doc(ME).collection("assignments").doc(w.id).set(upd,{merge:true})
        .then(function(){ a.done=done; sub.textContent=done?"Done — just now":"not done yet"; })
        .catch(function(e){ cb.checked=!done; bx.textContent=!done?"✓":""; showErr("Could not save: "+e.message); });
    };
    lab.appendChild(cb); lab.appendChild(bx); lab.appendChild(txt);
    left.appendChild(lab);
    row.appendChild(left);

    var openBtn=mkBtn(openWsId===w.id?"Close ▴":"Open ▸", openWsId===w.id?"primary":"");
    openBtn.classList.add("openbtn");
    openBtn.onclick=function(){
      if(openWsId===w.id){ openWsId=null; $("openWorksheet").innerHTML=""; renderAssigned(list); return; }
      openWsId=w.id; renderAssigned(list); openWorksheet(w, w.id);
      $("openWorksheet").scrollIntoView({behavior:"smooth"});
    };
    row.appendChild(openBtn);
    box.appendChild(row);
  });
}

// ---------- doing a worksheet (box per question) ----------
var attempts=[], curAttemptId=null;

function openWorksheet(w, wsId){
  var area=$("openWorksheet"); area.innerHTML='<p class="spinner">Loading worksheet…</p>';
  if(!wsId){ attempts=[]; curAttemptId=null; drawWorksheet(w); return; }
  studentsCol.doc(ME).collection("answers").doc(wsId).collection("attempts")
    .orderBy("createdAt","asc").get().then(function(snap){
      attempts=[]; snap.forEach(function(d){ attempts.push(Object.assign({id:d.id},d.data())); });
      curAttemptId = attempts.length ? attempts[attempts.length-1].id : null;
      drawWorksheet(w);
    }).catch(handleErr("Could not load attempts"));
}

function currentAttempt(){
  return attempts.filter(function(a){return a.id===curAttemptId;})[0]
      || {responses:{},comments:{},status:"",photo:"",drawings:{}};
}

function drawWorksheet(w){
  var area=$("openWorksheet"); area.innerHTML="";
  var att=currentAttempt();

  // ---- header card ----
  var head=el("div","card");
  var hd=el("div","cardhead");
  hd.appendChild(el("h2",null,esc(w.title)));

  var right=el("div"); right.style.cssText="display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
  var sel=document.createElement("select"); sel.style.width="auto";
  if(!attempts.length){ sel.innerHTML='<option>Attempt 1 (new)</option>'; }
  else attempts.forEach(function(a,i){
    sel.innerHTML+='<option value="'+a.id+'"'+(a.id===curAttemptId?" selected":"")+'>'+esc(a.name||("Attempt "+(i+1)))+'</option>';
  });
  sel.onchange=function(){ curAttemptId=sel.value; drawWorksheet(w); };
  right.appendChild(sel);
  if(!readOnly) right.appendChild(mkBtn("+ New attempt","",function(){ newAttempt(w); }));
  if(w.gold) right.appendChild(el("span","gold",'<span class="dot"></span>'+w.gold));
  if(att.status==="good") right.appendChild(el("span","good","Good job ✓"));
  if(att.status==="ng")   right.appendChild(el("span","ng","Try again ✗"));
  hd.appendChild(right);
  head.appendChild(hd);

  if(w.instructions){
    var ins=el("p"); ins.style.margin="8px 0 0"; ins.textContent=w.instructions; head.appendChild(ins);
  }
  if(w.instructionEmbed){
    head.appendChild(makeEmbed("Instructions", w.instructionEmbed, w.instructionEmbedMode||"open"));
  }
  if(w.slideshow){
    head.appendChild(makeEmbed("Slideshow", w.slideshow, w.slideshowMode||"collapsible"));
  }
  area.appendChild(head);

  // ---- one card per question ----
  var inputs=[];
  (w.questions||[]).forEach(function(q,i){
    area.appendChild(renderQuestionCard(q,i,att,inputs));
  });

  // ---- footer card ----
  var foot=el("div","card");
  // photo
  var pendingPhoto={data:att.photo||""};
  if(w.allowPhotos!==false && !readOnly){
    var pw=el("div"); pw.style.marginBottom="10px";
    var upBtn=mkBtn("📷 Upload a photo of my work","big");
    var fi=document.createElement("input"); fi.type="file"; fi.accept="image/*"; fi.className="hidden";
    var prev=el("div");
    if(att.photo) prev.innerHTML='<img src="'+esc(att.photo)+'" style="max-width:200px;border:1px solid #000;margin-top:6px;">';
    upBtn.onclick=function(){ fi.click(); };
    fi.onchange=function(){
      if(!fi.files[0])return;
      upBtn.textContent="Shrinking…";
      shrinkImage(fi.files[0],900,function(d){
        pendingPhoto.data=d||"";
        prev.innerHTML=d?'<img src="'+d+'" style="max-width:200px;border:1px solid #000;margin-top:6px;">':"";
        upBtn.textContent="📷 Upload a photo of my work";
      });
    };
    pw.appendChild(upBtn); pw.appendChild(fi); pw.appendChild(prev);
    area.appendChild(pw);
  }

  // ---- footer card: Save / Submit / Close only ----
  var foot=el("div","card");
  var bar=el("div"); bar.style.cssText="display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
  if(!readOnly){
    var msg=el("span","muted");
    bar.appendChild(mkBtn("Save","act",function(){ saveWork(w,inputs,pendingPhoto,false,msg); }));
    var submitLabel = w.gold ? ("Submit ✓ (+"+w.gold+" gold)") : "Submit ✓";
    bar.appendChild(mkBtn(submitLabel,"primary",function(){ saveWork(w,inputs,pendingPhoto,true,msg); }));
    bar.appendChild(mkBtn("Close ▴","close",function(){
      openWsId=null; $("openWorksheet").innerHTML=""; loadAssignments();
    }));
    bar.appendChild(msg);
  }
  foot.appendChild(bar);
  area.appendChild(foot);
}

function renderQuestionCard(q,i,att,inputs){
  var card=el("div","card");
  var responses=att.responses||{}, comments=att.comments||{}, drawings=att.drawings||{};
  var answered = responses[i]!=null && responses[i]!=="" ;

  var head=el("div","qhead");
  var label=q.label||("Question "+(i+1));
  head.appendChild(el("span","qnum",esc(label)+". "+esc(q.text||"")));
  var body=el("div");
  card.appendChild(head); card.appendChild(body);

  // per-question embed
  if(q.embed) body.appendChild(makeEmbed(q.embedLabel||"Watch / read this", q.embed, q.embedMode||"open"));

  if(q.type==="typed"||q.type==="blank"){
    var rich=makeRichEditor(responses[i]||"");
    if(readOnly) rich.setDisabled(true);
    body.appendChild(rich);
    inputs.push({i:i,type:"rich",get:function(){return rich.getHTML();}});
  }
  else if(q.type==="mc"){
    (q.options||[]).forEach(function(opt,oi){
      var lab=el("label"); lab.style.display="block";
      var r=document.createElement("input");
      r.type="radio"; r.name="q_"+i+"_"+(curAttemptId||"new"); r.value=opt;
      r.style.width="auto"; r.style.marginRight="6px";
      if(responses[i]===opt) r.checked=true;
      if(readOnly) r.disabled=true;
      lab.appendChild(r); lab.appendChild(document.createTextNode(" "+opt));
      body.appendChild(lab);
      inputs.push({i:i,type:"radio",el:r});
    });
  }
  else if(q.type==="check"){
    var lab2=el("label","bigcheck");
    var cb=document.createElement("input"); cb.type="checkbox";
    cb.checked = responses[i]==="yes";
    var bx=el("span","box"); if(cb.checked) bx.textContent="✓";
    cb.onchange=function(){ bx.textContent=cb.checked?"✓":""; };
    if(readOnly) cb.disabled=true;
    lab2.appendChild(cb); lab2.appendChild(bx);
    lab2.appendChild(el("span",null,"&nbsp;"+esc(q.checkLabel||"Yes, I did this")));
    body.appendChild(lab2);
    inputs.push({i:i,type:"check",el:cb});
  }
  else if(q.type==="draw"){
    var cv=makeCanvas(drawings[i]||"", readOnly);
    body.appendChild(cv);
    inputs.push({i:i,type:"draw",get:function(){return cv.getData();}});
  }
  else if(q.type==="task"){
    body.appendChild(el("p","muted","(nothing to submit — tick the worksheet off when you're done)"));
  }

  if(comments[i]){
    var c=el("div","comment");
    c.innerHTML="<strong>"+esc(teacherName())+" says…</strong> "+esc(comments[i]);
    body.appendChild(c);
  }

  if(answered) card.classList.add("done");
  return card;
}

function collectResponses(inputs){
  var resp={}, draws={};
  inputs.forEach(function(inp){
    if(inp.type==="rich") resp[inp.i]=inp.get();
    else if(inp.type==="radio"){ if(inp.el.checked) resp[inp.i]=inp.el.value; }
    else if(inp.type==="check") resp[inp.i]=inp.el.checked?"yes":"";
    else if(inp.type==="draw") draws[inp.i]=inp.get();
  });
  return {responses:resp, drawings:draws};
}

function saveWork(w,inputs,pendingPhoto,isSubmit,msg){
  var data=collectResponses(inputs);
  var payload={
    responses:data.responses, drawings:data.drawings,
    photo:pendingPhoto?pendingPhoto.data:""
  };
  var col=studentsCol.doc(ME).collection("answers").doc(w.id).collection("attempts");
  var p;
  if(curAttemptId){ p=col.doc(curAttemptId).set(payload,{merge:true}).then(function(){return curAttemptId;}); }
  else {
    payload.name="Attempt 1";
    payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();
    payload.comments={}; payload.status=""; payload.submitted=false;
    p=col.add(payload).then(function(r){ curAttemptId=r.id; return r.id; });
  }
  p.then(function(attemptId){
    if(!isSubmit){ if(msg) flash(msg,"Saved ✓"); return; }
    return col.doc(attemptId).set({
      submitted:true, submittedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true}).then(function(){ return awardGold(w,attemptId,msg); });
  }).then(function(){ openWorksheet(w,w.id); })
    .catch(handleErr("Could not save"));
}

function flash(el2,text){ el2.textContent=text; setTimeout(function(){el2.textContent="";},2000); }

function awardGold(w,attemptId,msg){
  var amount=Number(w.gold||0);
  if(!amount){ if(msg) flash(msg,"Submitted ✓"); return Promise.resolve(); }
  var attName=(attempts.filter(function(a){return a.id===attemptId;})[0]||{}).name||"Attempt";
  return db.runTransaction(function(tx){
    var ref=studentsCol.doc(ME);
    return tx.get(ref).then(function(s){
      var cur=(s.data()&&s.data().gold)||0;
      tx.set(ref,{gold:cur+amount},{merge:true});
    });
  }).then(function(){
    return goldLogCol.add({
      uid:ME, studentName:meData.name||meData.email,
      what:'Submitted "'+w.title+'" — '+attName,
      amount:amount, at:firebase.firestore.FieldValue.serverTimestamp(), kind:"submit"
    });
  }).then(function(){
    meData.gold=(meData.gold||0)+amount;
    $("myGold").textContent=meData.gold;
    if(msg) flash(msg,"Submitted ✓ +"+amount+" gold");
  });
}

function newAttempt(w){
  var name="Attempt "+(attempts.length+1);
  studentsCol.doc(ME).collection("answers").doc(w.id).collection("attempts").add({
    name:name, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    responses:{}, drawings:{}, comments:{}, status:"", photo:"", submitted:false
  }).then(function(){ openWorksheet(w,w.id); }).catch(handleErr("Could not start attempt"));
}

// ---------- exports ----------
function gatherMyWork(){
  return studentsCol.doc(ME).collection("assignments").get().then(function(asnap){
    var ids=[]; asnap.forEach(function(d){ ids.push(d.id); });
    return Promise.all(ids.map(function(wid){
      return wsCol.doc(wid).get().then(function(ws){
        return studentsCol.doc(ME).collection("answers").doc(wid).collection("attempts")
          .orderBy("createdAt","asc").get().then(function(att){
            var list=[]; att.forEach(function(x){ list.push(Object.assign({id:x.id},x.data())); });
            return { worksheet: ws.exists?Object.assign({id:ws.id},ws.data()):{id:wid,title:wid}, attempts:list };
          });
      });
    }));
  });
}
function exportJSON(){
  gatherMyWork().then(function(all){
    downloadJSON({type:"my-answers",student:meData.email,exportedAt:new Date().toISOString(),work:all},"my-answers.json");
  }).catch(handleErr("Export failed"));
}
function exportCSV(){
  gatherMyWork().then(function(all){
    var rows=[["Worksheet","Attempt","Question","My answer","Tutor comment","Status","Submitted (PT)"]];
    all.forEach(function(item){
      var qs=item.worksheet.questions||[];
      item.attempts.forEach(function(a){
        qs.forEach(function(q,i){
          rows.push([
            item.worksheet.title, a.name||"", q.label||("Question "+(i+1)),
            stripHTML((a.responses||{})[i]||""), (a.comments||{})[i]||"",
            a.status==="good"?"Good job":(a.status==="ng"?"Try again":""),
            a.submittedAt?fmtTime(a.submittedAt):""
          ]);
        });
      });
    });
    downloadCSV(rows,"my-answers.csv");
  }).catch(handleErr("Export failed"));
}


// gear on each fixed panel so every box can be tinted
function addPanelGears(){
  var tints=meData.boxTints||{};
  function gearFor(key, cardEl){
    if(!cardEl) return;
    var head=cardEl.querySelector(".cardhead");
    if(!head) return;
    addBoxGear(head, cardEl, tints[key], function(c){
      var t=Object.assign({},meData.boxTints||{}); t[key]=c;
      meData.boxTints=t;
      if(!readOnly) studentsCol.doc(ME).set({boxTints:t},{merge:true});
    });
  }
  gearFor("profile", $("myAvatar").closest(".card"));
  gearFor("game", $("gamePanel"));
  gearFor("wordlist", $("wordPanel"));
  gearFor("ask", $("askCard"));
  gearFor("assigned", $("assignedList").closest(".card"));
}
