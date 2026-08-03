// ============================================================
//  dashboard.js — teacher dashboard.
//
//  DATA MODEL
//   site/config, teacher/profile
//   students/{uid}  {email,name,photo,bg,opacity,gold,status,viewers[]}
//     /assignments/{wsId}  {order,done,doneAt}
//     /answers/{wsId}/attempts/{id} {name,responses,drawings,comments,status,photo,submitted}
//     /questions/{id} {text,createdAt,reply,answered}
//   worksheets/{wsId} {title,tags[],gold,slideshow,instructions,instructionEmbed,
//                      allowPhotos,questions[],order}
//   boxes/{id} {title,text,order,audience,students[],items[{label,url,mode}]}
//   goldlog/{id} {uid,studentName,what,amount,at,kind}
//   feedback/{id} {uid,studentName,html,at}
//   templates/{id} {name,html}
// ============================================================

var TEACHER=null, teacherProfile={}, siteSettings={};
var studentsCache=[], worksheetsCache=[], allTags=[], activeTag="";
var fbEditor=null, templatesCache=[];

auth.onAuthStateChanged(function(user){
  if(!user){ location.href="index.html"; return; }
  if(!isTeacher(user)){ location.href="student.html"; return; }
  TEACHER=user;
  $("myEmail").textContent=user.email;
  wireTabs();
  loadSite().then(function(s){ siteSettings=s; });
  loadTeacherProfile();
  loadStudents();
  loadWorksheets();
  loadBoxes();
  loadTemplates();
  wireAll();
});

function wireAll(){
  $("logoutBtn").onclick=logout;
  $("gameBtn").onclick=function(){ $("apPanel").classList.add("hidden"); $("gamePanel").classList.toggle("hidden"); };
  $("gameClose").onclick=function(){ $("gamePanel").classList.add("hidden"); };
  $("profBtn").onclick=function(){ document.querySelector('.tab[data-panel="profile"]').click(); };

  $("apBtn").onclick=function(){
    renderSwatches("apSwatches","apBg");
    $("apBg").value=teacherProfile.bg||"";
    $("apOpacity").value=teacherProfile.opacity==null?90:teacherProfile.opacity;
    $("apOpVal").textContent=$("apOpacity").value;
    $("gamePanel").classList.add("hidden");
    $("apPanel").classList.toggle("hidden");
  };
  $("apOpacity").oninput=function(){ $("apOpVal").textContent=$("apOpacity").value; };
  $("apCancel").onclick=function(){ $("apPanel").classList.add("hidden"); };
  $("apSave").onclick=function(){
    var upd={bg:$("apBg").value.trim(),opacity:Number($("apOpacity").value)};
    teacherRef.set(upd,{merge:true}).then(function(){
      Object.assign(teacherProfile,upd); applyBackground(upd.bg,upd.opacity);
      $("apPanel").classList.add("hidden");
    }).catch(handleErr("Could not save appearance"));
  };

  wireProfile(); wireWorksheets(); wireGold(); wireQuestions(); wireBoxes(); wireFeedback();
}

// ---------------- profile ----------------
function loadTeacherProfile(){
  teacherRef.get().then(function(s){
    teacherProfile=s.exists?s.data():{};
    $("pName").value=teacherProfile.name||"Jim";
    $("myName").textContent=teacherProfile.name||"Jim";
    $("pPhoto").value=teacherProfile.photo||"";
    $("goodUrl").value=teacherProfile.goodStamp||"";
    $("ngUrl").value=teacherProfile.ngStamp||"";
    $("pBlurb").value=teacherProfile.parentBlurb||SITE_DEFAULTS.parentBlurb;
    var g=teacherProfile.gold||0;
    $("myGold").textContent=g; $("myGold2").textContent=g; $("gameGold").textContent=g;
    $("teacherGoldInput").value=g;
    $("myAvatar").innerHTML=teacherProfile.photo?'<img src="'+esc(teacherProfile.photo)+'" alt="">':"☕";
    applyBackground(teacherProfile.bg,teacherProfile.opacity);
  });
}
function wireProfile(){
  wireImageUpload("pPhotoUpload","pPhotoFile","pPhoto",240);
  wireImageUpload("goodUpload","goodFile","goodUrl",200);
  wireImageUpload("ngUpload","ngFile","ngUrl",200);
  $("saveProfileBtn").onclick=function(){
    var p={ name:$("pName").value.trim()||"Jim", photo:$("pPhoto").value.trim(),
      goodStamp:$("goodUrl").value.trim(), ngStamp:$("ngUrl").value.trim(),
      parentBlurb:$("pBlurb").value.trim() };
    teacherRef.set(p,{merge:true}).then(function(){
      Object.assign(teacherProfile,p);
      $("myName").textContent=p.name;
      $("myAvatar").innerHTML=p.photo?'<img src="'+esc(p.photo)+'" alt="">':"☕";
      flash($("profileSaved"),"Saved ✓");
    }).catch(handleErr("Save failed"));
  };
  $("exportAllBtn").onclick=exportAll;
  $("exportAnswersCsv").onclick=exportAnswersCSV;
}
function flash(e,t){ e.textContent=t; setTimeout(function(){e.textContent="";},2000); }

// ---------------- students ----------------
function loadStudents(){
  studentsCol.onSnapshot(function(snap){
    studentsCache=[];
    snap.forEach(function(d){ studentsCache.push(Object.assign({uid:d.id},d.data())); });
    studentsCache.sort(function(a,b){ return (a.name||"").localeCompare(b.name||""); });
    renderStudents(); fillStudentSelects();
  },function(e){ $("pendingList").innerHTML='<p class="muted">Could not load students: '+esc(e.message)+'</p>'; });
}

function avatarOf(s){
  return s.photo?'<img src="'+esc(s.photo)+'" alt="">':esc((s.name||s.email||"?").charAt(0).toUpperCase());
}

function renderStudents(){
  var pending=studentsCache.filter(function(s){return s.status!=="approved";});
  var approved=studentsCache.filter(function(s){return s.status==="approved";});

  var pl=$("pendingList"); pl.innerHTML = pending.length?"":'<p class="muted">Nobody waiting.</p>';
  pending.forEach(function(s){
    var r=el("div","row");
    r.innerHTML='<div class="left"><span class="avatar" style="width:26px;height:26px;font-size:12px;">'+avatarOf(s)+
      '</span> <strong>'+esc(s.email)+'</strong></div>';
    r.appendChild(mkBtn("Approve","primary",function(){
      studentsCol.doc(s.uid).set({status:"approved"},{merge:true}).catch(handleErr("Could not approve"));
    }));
    r.appendChild(mkBtn("Remove","",function(){
      if(confirm("Remove "+s.email+"?")) studentsCol.doc(s.uid).delete().catch(handleErr("Could not remove"));
    }));
    pl.appendChild(r);
  });

  var al=$("approvedList"); al.innerHTML = approved.length?"":'<p class="muted">No approved students yet.</p>';
  approved.forEach(function(s){
    var card=el("div","card");
    var top=el("div"); top.style.cssText="display:flex;align-items:center;gap:9px;flex-wrap:wrap;";
    top.innerHTML='<span class="avatar" style="width:28px;height:28px;font-size:13px;">'+avatarOf(s)+
      '</span> <strong>'+esc(s.name||s.email)+'</strong> <span class="muted">('+esc(s.email)+')</span>';
    var spacer=el("span"); spacer.style.flex="1"; top.appendChild(spacer);
    top.appendChild(el("span","muted","gold:"));
    var gi=document.createElement("input"); gi.type="number"; gi.value=s.gold||0; gi.style.width="72px";
    top.appendChild(gi);
    top.appendChild(mkBtn("Set","",function(){
      var v=Number(gi.value)||0, diff=v-(s.gold||0);
      studentsCol.doc(s.uid).set({gold:v},{merge:true}).then(function(){
        if(diff) return goldLogCol.add({uid:s.uid,studentName:s.name||s.email,
          what:"Manual adjustment by "+(teacherProfile.name||"Jim"),
          amount:diff,at:firebase.firestore.FieldValue.serverTimestamp(),kind:"manual"});
      }).catch(handleErr("Could not set gold"));
    }));
    top.appendChild(mkBtn("👁 View as","",function(){ location.href="student.html?as="+s.uid; }));
    top.appendChild(mkBtn("Remove access","",function(){
      if(confirm("Remove access for "+(s.name||s.email)+"?"))
        studentsCol.doc(s.uid).set({status:"pending"},{merge:true});
    }));
    card.appendChild(top);

    // parent viewers
    var vw=el("div"); vw.style.cssText="border-top:1px solid #ccc;padding-top:7px;margin-top:8px;";
    vw.appendChild(el("span","muted","<strong>Parent / guardian viewers</strong> (read-only):"));
    var chips=el("div"); chips.style.cssText="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;align-items:center;";
    (s.viewers||[]).forEach(function(v){
      var chip=el("span","tag",esc(v)+" ✕");
      chip.onclick=function(){
        var next=(s.viewers||[]).filter(function(x){return x!==v;});
        studentsCol.doc(s.uid).set({viewers:next},{merge:true}).catch(handleErr("Could not remove viewer"));
      };
      chips.appendChild(chip);
    });
    var vi=document.createElement("input"); vi.type="email"; vi.placeholder="add another email…";
    vi.style.cssText="flex:1;min-width:160px;";
    chips.appendChild(vi);
    chips.appendChild(mkBtn("+ Add","primary",function(){
      var e2=(vi.value||"").trim().toLowerCase();
      if(!e2) return;
      var next=(s.viewers||[]).slice(); if(next.indexOf(e2)<0) next.push(e2);
      studentsCol.doc(s.uid).set({viewers:next},{merge:true})
        .then(function(){ vi.value=""; }).catch(handleErr("Could not add viewer"));
    }));
    vw.appendChild(chips);
    card.appendChild(vw);
    al.appendChild(card);
  });
}

function fillStudentSelects(){
  var approved=studentsCache.filter(function(s){return s.status==="approved";});
  [["qStudentFilter",true],["logStudentFilter",true],["fbFilter",true],["fbStudent",false]].forEach(function(pair){
    var sel=$(pair[0]); if(!sel) return;
    var cur=sel.value;
    sel.innerHTML = pair[1] ? '<option value="">All students</option>' : "";
    approved.forEach(function(s){
      sel.innerHTML+='<option value="'+s.uid+'">'+esc(s.name||s.email)+'</option>';
    });
    if(cur) sel.value=cur;
  });
}

// ---------------- worksheets ----------------
function loadWorksheets(){
  wsCol.orderBy("order","asc").onSnapshot(function(snap){
    worksheetsCache=[];
    snap.forEach(function(d){ worksheetsCache.push(Object.assign({id:d.id},d.data())); });
    collectTags(); renderWorksheets(); renderGoldSettings();
  },function(e){ $("wsList").innerHTML='<p class="muted">Could not load: '+esc(e.message)+'</p>'; });
}
function collectTags(){
  var set={};
  worksheetsCache.forEach(function(w){ (w.tags||[]).forEach(function(t){ set[t]=1; }); });
  allTags=Object.keys(set).sort();
  var c=$("tagChips"); c.innerHTML="";
  allTags.forEach(function(t){
    var chip=el("span","tag"+(activeTag===t?" on":""),esc(t));
    chip.onclick=function(){ activeTag=(activeTag===t?"":t); $("tagFilter").value=activeTag; collectTags(); renderWorksheets(); };
    c.appendChild(chip);
  });
}
function wsMatches(w){
  var q=($("tagFilter").value||"").trim().toLowerCase();
  if(!q) return true;
  if((w.title||"").toLowerCase().indexOf(q)>=0) return true;
  return (w.tags||[]).some(function(t){ return t.toLowerCase().indexOf(q)>=0; });
}
function renderWorksheets(){
  var box=$("wsList"); box.innerHTML="";
  var shown=0;
  worksheetsCache.forEach(function(w,idx){
    if(!wsMatches(w)) return;
    shown++;
    var r=el("div","row");
    var left=el("div","left");
    var qn=(w.questions||[]).length;
    left.innerHTML='<strong>'+(idx+1)+'. '+esc(w.title)+'</strong> <span class="muted">· '+qn+' Q</span> '+
      (w.gold?'<span class="gold"><span class="dot"></span>'+w.gold+'</span>':'')+'<br>';
    (w.tags||[]).forEach(function(t){
      var chip=el("span","tag",esc(t)+" ✕");
      chip.onclick=function(){
        var next=(w.tags||[]).filter(function(x){return x!==t;});
        wsCol.doc(w.id).set({tags:next},{merge:true});
      };
      left.appendChild(chip);
    });
    var ti=document.createElement("input");
    ti.type="text"; ti.placeholder="+ tag"; ti.style.cssText="width:80px;font-size:12px;padding:2px 4px;";
    ti.onkeydown=function(e){
      if(e.key!=="Enter") return;
      var t=(ti.value||"").trim().toLowerCase(); if(!t) return;
      var next=(w.tags||[]).slice(); if(next.indexOf(t)<0) next.push(t);
      wsCol.doc(w.id).set({tags:next},{merge:true}).then(function(){ ti.value=""; });
    };
    left.appendChild(ti);
    r.appendChild(left);

    r.appendChild(mkBtn("▲","arrow",function(){ moveWs(idx,-1); }));
    r.appendChild(mkBtn("▼","arrow",function(){ moveWs(idx,1); }));
    r.appendChild(mkBtn("Edit","",function(){ location.href="editor.html?id="+w.id; }));
    r.appendChild(mkBtn("Assign","",function(){ location.href="assign.html?ws="+w.id; }));
    r.appendChild(mkBtn("Generate ➕","",function(){ location.href="generator.html?src="+w.id; }));
    r.appendChild(mkBtn("Delete","",function(){
      if(confirm('Delete "'+w.title+'"? This cannot be undone.')) wsCol.doc(w.id).delete();
    }));
    box.appendChild(r);
  });
  if(!shown) box.innerHTML='<p class="muted">No worksheets match. <button id="cf2">clear filter</button></p>';
  if($("cf2")) $("cf2").onclick=function(){ $("tagFilter").value=""; activeTag=""; collectTags(); renderWorksheets(); };
}
function moveWs(i,dir){
  var j=i+dir; if(j<0||j>=worksheetsCache.length) return;
  var a=worksheetsCache[i], b=worksheetsCache[j];
  var batch=db.batch();
  batch.set(wsCol.doc(a.id),{order:j},{merge:true});
  batch.set(wsCol.doc(b.id),{order:i},{merge:true});
  batch.commit().catch(handleErr("Could not reorder"));
}

function wireWorksheets(){
  $("createWsBtn").onclick=function(){
    var t=$("newWsTitle").value.trim();
    if(!t){ showErr("Give the worksheet a title first."); return; }
    wsCol.add({title:t,tags:[],gold:0,slideshow:"",instructions:"",instructionEmbed:"",
      allowPhotos:true,questions:[],order:worksheetsCache.length,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()})
      .then(function(ref){ location.href="editor.html?id="+ref.id; })
      .catch(handleErr("Could not create"));
  };
  $("tagFilter").oninput=function(){ renderWorksheets(); };
  $("clearFilter").onclick=function(){ $("tagFilter").value=""; activeTag=""; collectTags(); renderWorksheets(); };

  $("exportWsCsvBtn").onclick=function(){
    var rows=[["worksheet","tags","gold","question_label","type","question_text","option_a","option_b","correct","embed_url"]];
    worksheetsCache.forEach(function(w){
      (w.questions||[]).forEach(function(q,i){
        var o=q.options||[];
        rows.push([w.title,(w.tags||[]).join(" "),w.gold||0,q.label||("Question "+(i+1)),
          q.type,q.text||"",o[0]||"",o[1]||"",
          (q.correct===0?"a":(q.correct===1?"b":"")),q.embed||""]);
      });
      if(!(w.questions||[]).length) rows.push([w.title,(w.tags||[]).join(" "),w.gold||0,"","","","","","",""]);
    });
    downloadCSV(rows,"worksheets.csv");
  };
  $("templateBtn").onclick=function(){
    downloadCSV([
      ["worksheet","tags","gold","question_label","type","question_text","option_a","option_b","correct","embed_url"],
      ["Sample Vocab","vocab SAT","10","Question 1","typed","Write a sentence with a blank.","","","",""],
      ["Sample Vocab","vocab SAT","10","Question 2","mc","Which word fits?","dog","refrigerator","a",""],
      ["Sample Vocab","vocab SAT","10","Question 3","check","Did you read chapter 4?","","","",""],
      ["Sample Vocab","vocab SAT","10","Question 4","draw","Draw a mind map.","","","",""],
      ["Sample Vocab","vocab SAT","10","Question 5","task","Watch this video.","","","","https://youtu.be/xxxx"]
    ],"worksheet-template.csv");
  };
  $("importCsvBtn").onclick=function(){ $("importCsvFile").click(); };
  $("importCsvFile").onchange=function(){
    var f=$("importCsvFile").files[0]; if(!f) return;
    var reader=new FileReader();
    reader.onload=function(e){ importCSV(e.target.result); };
    reader.readAsText(f);
  };
}

function parseCSV(text){
  var rows=[],row=[],cur="",q=false;
  text=text.replace(/^\ufeff/,"");
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(q){
      if(c==='"'&&text[i+1]==='"'){cur+='"';i++;}
      else if(c==='"'){q=false;}
      else cur+=c;
    } else {
      if(c==='"')q=true;
      else if(c===","){row.push(cur);cur="";}
      else if(c==="\n"){row.push(cur);rows.push(row);row=[];cur="";}
      else if(c!=="\r")cur+=c;
    }
  }
  if(cur!==""||row.length){row.push(cur);rows.push(row);}
  return rows.filter(function(r){return r.some(function(c){return String(c).trim()!=="";});});
}

function importCSV(text){
  try{
    var rows=parseCSV(text);
    if(rows.length<2){ showErr("That CSV looks empty."); return; }
    var head=rows[0].map(function(h){return h.trim().toLowerCase();});
    function col(name){ return head.indexOf(name); }
    var groups={};
    rows.slice(1).forEach(function(r){
      var title=(r[col("worksheet")]||"").trim(); if(!title) return;
      if(!groups[title]) groups[title]={title:title,tags:[],gold:0,questions:[]};
      var g=groups[title];
      var tg=(r[col("tags")]||"").trim();
      if(tg) g.tags=tg.split(/\s+/).map(function(x){return x.toLowerCase();});
      var gd=Number(r[col("gold")]||0); if(gd) g.gold=gd;
      var qt=(r[col("question_text")]||"").trim();
      var type=(r[col("type")]||"typed").trim().toLowerCase();
      if(!qt && type!=="draw") return;
      var q={ label:(r[col("question_label")]||"").trim(), type:type, text:qt };
      if(type==="mc"){
        q.options=[(r[col("option_a")]||"").trim(),(r[col("option_b")]||"").trim()].filter(Boolean);
        var c=(r[col("correct")]||"").trim().toLowerCase();
        q.correct = c==="a"?0:(c==="b"?1:-1);
      }
      var em=(r[col("embed_url")]||"").trim();
      if(em){ q.embed=em; q.embedMode="open"; }
      g.questions.push(q);
    });
    var list=Object.keys(groups);
    if(!list.length){ showErr("No worksheets found in that CSV."); return; }
    var batch=db.batch();
    list.forEach(function(k,i){
      var g=groups[k];
      batch.set(wsCol.doc(),{
        title:g.title,tags:g.tags,gold:g.gold,questions:g.questions,
        slideshow:"",instructions:"",instructionEmbed:"",allowPhotos:true,
        order:worksheetsCache.length+i,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    batch.commit().then(function(){ alert("Imported "+list.length+" worksheet(s)."); })
      .catch(handleErr("Import failed"));
  }catch(err){ showErr("Could not read that CSV: "+err.message); }
}

// ---------------- gold ----------------
function renderGoldSettings(){
  var box=$("goldSetList"); box.innerHTML="";
  if(!worksheetsCache.length){ box.innerHTML='<p class="muted">No worksheets yet.</p>'; return; }
  worksheetsCache.forEach(function(w){
    var r=el("div","row");
    r.appendChild(el("div","left","<strong>"+esc(w.title)+"</strong>"));
    r.appendChild(el("span","muted","per submit:"));
    var i=document.createElement("input"); i.type="number"; i.min="0"; i.value=w.gold||0; i.style.width="80px";
    r.appendChild(i);
    var m=el("span","muted");
    r.appendChild(mkBtn("Save","",function(){
      wsCol.doc(w.id).set({gold:Number(i.value)||0},{merge:true})
        .then(function(){ flash(m,"✓"); }).catch(handleErr("Could not save"));
    }));
    r.appendChild(m);
    box.appendChild(r);
  });
}
function wireGold(){
  function setTeacherGold(v){
    v=Math.max(0,Math.min(99999,Number(v)||0));
    teacherRef.set({gold:v},{merge:true}).then(function(){
      teacherProfile.gold=v;
      $("myGold").textContent=v; $("myGold2").textContent=v;
      $("gameGold").textContent=v; $("teacherGoldInput").value=v;
    }).catch(handleErr("Could not set gold"));
  }
  $("setTeacherGold").onclick=function(){ setTeacherGold($("teacherGoldInput").value); };
  $("maxGold").onclick=function(){ setTeacherGold(99999); };
  $("zeroGold").onclick=function(){ setTeacherGold(0); };
  document.querySelectorAll("[data-add]").forEach(function(b){
    b.onclick=function(){ setTeacherGold((teacherProfile.gold||0)+Number(b.getAttribute("data-add"))); };
  });
  $("logRefresh").onclick=loadGoldLog;
  $("logStudentFilter").onchange=loadGoldLog;
  $("logSort").onchange=loadGoldLog;
  $("logCsv").onclick=function(){
    loadGoldLog(function(rows){
      var out=[["When (PT)","Student","What","Gold"]];
      rows.forEach(function(r){ out.push([fmtTime(r.at),r.studentName,r.what,r.amount]); });
      downloadCSV(out,"gold-log.csv");
    });
  };
  document.querySelector('.tab[data-panel="goldlog"]').addEventListener("click",loadGoldLog);
}
function loadGoldLog(cb){
  goldLogCol.orderBy("at","desc").limit(300).get().then(function(snap){
    var rows=[]; snap.forEach(function(d){ rows.push(d.data()); });
    var f=$("logStudentFilter").value;
    if(f) rows=rows.filter(function(r){return r.uid===f;});
    var sort=$("logSort").value;
    if(sort==="oldest") rows.reverse();
    if(sort==="biggest") rows.sort(function(a,b){return (b.amount||0)-(a.amount||0);});
    if(typeof cb==="function"){ cb(rows); return; }
    var t=el("table");
    t.innerHTML="<tr><th>When (PT)</th><th>Student</th><th>What</th><th>Gold</th></tr>";
    rows.forEach(function(r){
      var tr=el("tr");
      tr.innerHTML="<td>"+esc(fmtTime(r.at))+"</td><td>"+esc(r.studentName||"")+"</td><td>"+
        esc(r.what||"")+"</td><td>"+(r.amount>0?"+":"")+esc(r.amount)+"</td>";
      t.appendChild(tr);
    });
    $("logTable").innerHTML=""; 
    $("logTable").appendChild(rows.length?t:el("p","muted","No gold awarded yet."));
  }).catch(handleErr("Could not load log"));
}

// ---------------- questions ----------------
function wireQuestions(){
  $("qRefresh").onclick=loadAllQuestions;
  $("qStudentFilter").onchange=loadAllQuestions;
  $("qSort").onchange=loadAllQuestions;
  document.querySelector('.tab[data-panel="questions"]').addEventListener("click",loadAllQuestions);
  setTimeout(loadAllQuestions,1500);
}
function loadAllQuestions(){
  var filter=$("qStudentFilter").value;
  var targets=studentsCache.filter(function(s){
    return s.status==="approved" && (!filter||s.uid===filter);
  });
  Promise.all(targets.map(function(s){
    return studentsCol.doc(s.uid).collection("questions").orderBy("createdAt","desc").limit(50).get()
      .then(function(snap){
        var out=[]; snap.forEach(function(d){ out.push(Object.assign({id:d.id,student:s},d.data())); });
        return out;
      }).catch(function(){return [];});
  })).then(function(lists){
    var all=[].concat.apply([],lists);
    var unanswered=all.filter(function(q){return !q.answered;}).length;
    var b=$("qBadge");
    if(unanswered){ b.textContent=unanswered; b.classList.remove("hidden"); } else b.classList.add("hidden");
    if($("qSort").value==="unanswered")
      all.sort(function(a,b2){ return (a.answered?1:0)-(b2.answered?1:0); });
    var box=$("questionList"); box.innerHTML="";
    if(!all.length){ box.innerHTML='<p class="muted">No questions yet.</p>'; return; }
    all.forEach(function(q){ box.appendChild(renderQuestion(q)); });
  });
}
function renderQuestion(q){
  var card=el("div","card");
  if(!q.answered) card.style.background="#fff8f8";
  card.innerHTML='<strong>'+esc(q.student.name||q.student.email)+'</strong> <span class="muted">— '+
    esc(fmtTime(q.createdAt))+'</span> '+(q.answered?'<span class="muted">· answered</span>':'<span class="badge">new</span>');
  var p=el("p"); p.style.margin="5px 0"; p.textContent=q.text; card.appendChild(p);
  if(q.answered && q.reply){
    card.appendChild(el("div","comment","<strong>"+esc(teacherProfile.name||"Jim")+" says…</strong> "+esc(q.reply)));
  }
  var inp=document.createElement("input"); inp.type="text";
  inp.placeholder="Your reply (they'll see it)"; inp.value=q.reply||"";
  card.appendChild(inp);
  var bar=el("div"); bar.style.marginTop="6px";
  bar.appendChild(mkBtn("Reply","primary",function(){
    studentsCol.doc(q.student.uid).collection("questions").doc(q.id)
      .set({reply:inp.value.trim(),answered:true},{merge:true})
      .then(loadAllQuestions).catch(handleErr("Could not reply"));
  }));
  bar.appendChild(mkBtn("Mark handled","",function(){
    studentsCol.doc(q.student.uid).collection("questions").doc(q.id)
      .set({answered:true},{merge:true}).then(loadAllQuestions);
  }));
  bar.appendChild(mkBtn("Delete","",function(){
    if(confirm("Delete this question?"))
      studentsCol.doc(q.student.uid).collection("questions").doc(q.id).delete().then(loadAllQuestions);
  }));
  card.appendChild(bar);
  return card;
}

// ---------------- student boxes ----------------
function loadBoxes(){
  boxesCol.orderBy("order","asc").onSnapshot(function(snap){
    var list=[]; snap.forEach(function(d){ list.push(Object.assign({id:d.id},d.data())); });
    renderBoxes(list);
  },function(e){ $("boxList").innerHTML='<p class="muted">Could not load boxes.</p>'; });
}
function wireBoxes(){
  $("createBoxBtn").onclick=function(){
    var t=$("newBoxTitle").value.trim();
    if(!t){ showErr("Give the box a title."); return; }
    boxesCol.add({title:t,text:"",order:Date.now(),audience:"some",students:[],items:[]})
      .then(function(){ $("newBoxTitle").value=""; }).catch(handleErr("Could not create box"));
  };
}
function renderBoxes(list){
  var box=$("boxList"); box.innerHTML = list.length?"":'<p class="muted">No boxes yet.</p>';
  list.forEach(function(b,idx){
    var card=el("div","card");
    var ctrl=el("div"); ctrl.style.cssText="display:flex;gap:6px;align-items:center;margin-bottom:8px;";
    ctrl.appendChild(mkBtn("▲","arrow",function(){ moveBox(list,idx,-1); }));
    ctrl.appendChild(mkBtn("▼","arrow",function(){ moveBox(list,idx,1); }));
    ctrl.appendChild(el("strong",null,"Box: "+esc(b.title)));
    card.appendChild(ctrl);

    card.appendChild(el("p","muted","Title"));
    var ti=document.createElement("input"); ti.type="text"; ti.value=b.title||"";
    card.appendChild(ti);
    card.appendChild(el("p","muted","Text"));
    var tx=document.createElement("textarea"); tx.value=b.text||""; tx.style.minHeight="40px";
    card.appendChild(tx);

    card.appendChild(el("p","muted","Items — each a link or an embedded doc:"));
    var items=(b.items||[]).map(function(x){return Object.assign({},x);});
    var itemBox=el("div");
    function drawItems(){
      itemBox.innerHTML="";
      items.forEach(function(it,ii){
        var r=el("div","row"); r.style.padding="5px 8px";
        var l=document.createElement("input"); l.type="text"; l.value=it.label||""; l.placeholder="Label"; l.style.flex="1";
        l.oninput=function(){ it.label=l.value; };
        var u=document.createElement("input"); u.type="text"; u.value=it.url||""; u.placeholder="https://…"; u.style.flex="1";
        u.oninput=function(){ it.url=u.value; };
        var m=document.createElement("select"); m.style.width="auto";
        m.innerHTML='<option value="open">Embed (always open)</option>'+
                    '<option value="collapsible">Embed (collapsible)</option>'+
                    '<option value="link">Plain link</option>';
        m.value=it.mode||"open"; m.onchange=function(){ it.mode=m.value; };
        r.appendChild(l); r.appendChild(u); r.appendChild(m);
        r.appendChild(mkBtn("✕","",function(){ items.splice(ii,1); drawItems(); }));
        itemBox.appendChild(r);
      });
    }
    drawItems();
    card.appendChild(itemBox);
    card.appendChild(mkBtn("+ Add item","",function(){ items.push({label:"",url:"",mode:"open"}); drawItems(); }));

    card.appendChild(el("p","muted","Who sees this box?"));
    var aud=el("div"); aud.style.cssText="display:flex;gap:10px;flex-wrap:wrap;align-items:center;";
    var nameAll="aud_"+b.id;
    var rAll=document.createElement("input"); rAll.type="radio"; rAll.name=nameAll; rAll.style.width="auto";
    rAll.checked=b.audience==="all";
    var lAll=el("label"); lAll.appendChild(rAll); lAll.appendChild(document.createTextNode(" All students"));
    var rSome=document.createElement("input"); rSome.type="radio"; rSome.name=nameAll; rSome.style.width="auto";
    rSome.checked=b.audience!=="all";
    var lSome=el("label"); lSome.appendChild(rSome); lSome.appendChild(document.createTextNode(" Only these:"));
    aud.appendChild(lAll); aud.appendChild(lSome);
    card.appendChild(aud);

    var picks=el("div"); picks.style.cssText="margin-top:5px;";
    var chosen=(b.students||[]).slice();
    function drawPicks(){
      picks.innerHTML="";
      picks.style.display=rSome.checked?"block":"none";
      studentsCache.filter(function(s){return s.status==="approved";}).forEach(function(s){
        var lab=el("label"); lab.style.marginRight="10px";
        var cb=document.createElement("input"); cb.type="checkbox"; cb.style.width="auto";
        cb.checked=chosen.indexOf(s.uid)>=0;
        cb.onchange=function(){
          if(cb.checked){ if(chosen.indexOf(s.uid)<0) chosen.push(s.uid); }
          else chosen=chosen.filter(function(x){return x!==s.uid;});
        };
        lab.appendChild(cb); lab.appendChild(document.createTextNode(" "+(s.name||s.email)));
        picks.appendChild(lab);
      });
    }
    rAll.onchange=drawPicks; rSome.onchange=drawPicks; drawPicks();
    card.appendChild(picks);

    var actions=el("div"); actions.style.marginTop="10px";
    var m2=el("span","muted");
    actions.appendChild(mkBtn("Save box","primary",function(){
      boxesCol.doc(b.id).set({
        title:ti.value.trim(), text:tx.value,
        audience:rAll.checked?"all":"some", students:chosen,
        items:items.filter(function(x){return x.url;})
      },{merge:true}).then(function(){ flash(m2,"Saved ✓"); }).catch(handleErr("Could not save box"));
    }));
    actions.appendChild(mkBtn("Delete box","",function(){
      if(confirm('Delete box "'+b.title+'"?')) boxesCol.doc(b.id).delete();
    }));
    actions.appendChild(m2);
    card.appendChild(actions);
    box.appendChild(card);
  });
}
function moveBox(list,i,dir){
  var j=i+dir; if(j<0||j>=list.length) return;
  var a=list[i],b=list[j];
  var batch=db.batch();
  batch.set(boxesCol.doc(a.id),{order:b.order},{merge:true});
  batch.set(boxesCol.doc(b.id),{order:a.order},{merge:true});
  batch.commit();
}

// ---------------- parent feedback ----------------
function wireFeedback(){
  fbEditor=makeRichEditor("");
  $("fbEditorHolder").appendChild(fbEditor);

  $("fbInsert").onclick=function(){
    var id=$("fbTemplate").value; if(!id) return;
    var t=templatesCache.filter(function(x){return x.id===id;})[0];
    if(t) fbEditor.setHTML(t.html||"");
  };
  $("fbPost").onclick=function(){
    var uid=$("fbStudent").value;
    if(!uid){ showErr("Pick a student first."); return; }
    var s=studentsCache.filter(function(x){return x.uid===uid;})[0]||{};
    var html=fbEditor.getHTML().trim();
    if(!html||html==="<br>"){ showErr("Write something first."); return; }
    feedbackCol.add({uid:uid,studentName:s.name||s.email,html:html,
      at:firebase.firestore.FieldValue.serverTimestamp()})
      .then(function(){ fbEditor.setHTML(""); flash($("fbMsg"),"Posted ✓"); loadFeedback(); })
      .catch(handleErr("Could not post"));
  };
  $("createTemplate").onclick=function(){
    var n=$("newTemplateName").value.trim();
    if(!n){ showErr("Name the template."); return; }
    templatesCol.add({name:n,html:"<ul><li>Today, we did…</li><li>Next time, we'll do…</li></ul>"})
      .then(function(){ $("newTemplateName").value=""; }).catch(handleErr("Could not create template"));
  };
  $("fbRefresh").onclick=loadFeedback;
  $("fbFilter").onchange=loadFeedback;
  document.querySelector('.tab[data-panel="feedback"]').addEventListener("click",loadFeedback);
}
function loadTemplates(){
  templatesCol.onSnapshot(function(snap){
    templatesCache=[]; snap.forEach(function(d){ templatesCache.push(Object.assign({id:d.id},d.data())); });
    var sel=$("fbTemplate"); sel.innerHTML='<option value="">— none —</option>';
    templatesCache.forEach(function(t){ sel.innerHTML+='<option value="'+t.id+'">'+esc(t.name)+'</option>'; });
    var box=$("templateList"); box.innerHTML = templatesCache.length?"":'<p class="muted">No templates yet.</p>';
    templatesCache.forEach(function(t){
      var card=el("div","card");
      card.appendChild(el("strong",null,esc(t.name)));
      var ed=makeRichEditor(t.html||"");
      card.appendChild(ed);
      var m=el("span","muted");
      var bar=el("div"); bar.style.marginTop="6px";
      bar.appendChild(mkBtn("Save","primary",function(){
        templatesCol.doc(t.id).set({html:ed.getHTML()},{merge:true})
          .then(function(){ flash(m,"Saved ✓"); }).catch(handleErr("Could not save"));
      }));
      bar.appendChild(mkBtn("Delete","",function(){
        if(confirm('Delete template "'+t.name+'"?')) templatesCol.doc(t.id).delete();
      }));
      bar.appendChild(m);
      card.appendChild(bar);
      box.appendChild(card);
    });
  },function(){});
}
function loadFeedback(){
  feedbackCol.orderBy("at","desc").limit(100).get().then(function(snap){
    var rows=[]; snap.forEach(function(d){ rows.push(Object.assign({id:d.id},d.data())); });
    var f=$("fbFilter").value;
    if(f) rows=rows.filter(function(r){return r.uid===f;});
    var box=$("fbList"); box.innerHTML = rows.length?"":'<p class="muted">No notes yet.</p>';
    rows.forEach(function(r){
      var card=el("div","card");
      card.innerHTML='<strong>'+esc(r.studentName||"")+'</strong> <span class="muted">— '+esc(fmtTime(r.at))+'</span>';
      var body=el("div"); body.innerHTML=r.html||""; body.style.margin="5px 0";
      card.appendChild(body);
      card.appendChild(mkBtn("Delete","",function(){
        if(confirm("Delete this note?")) feedbackCol.doc(r.id).delete().then(loadFeedback);
      }));
      box.appendChild(card);
    });
  }).catch(handleErr("Could not load notes"));
}

// ---------------- exports ----------------
function gatherEverything(){
  var out={type:"essay-espresso-backup",exportedAt:new Date().toISOString(),
    site:siteSettings,teacher:teacherProfile,worksheets:worksheetsCache,
    boxes:[],students:[],goldlog:[],feedback:[]};
  return boxesCol.get().then(function(s){
    s.forEach(function(d){ out.boxes.push(Object.assign({id:d.id},d.data())); });
    return goldLogCol.get();
  }).then(function(s){
    s.forEach(function(d){ out.goldlog.push(d.data()); });
    return feedbackCol.get();
  }).then(function(s){
    s.forEach(function(d){ out.feedback.push(d.data()); });
    return Promise.all(studentsCache.map(function(st){
      var rec=Object.assign({},st); rec.assignments=[]; rec.answers={}; rec.questions=[];
      return studentsCol.doc(st.uid).collection("assignments").get().then(function(a){
        a.forEach(function(d){ rec.assignments.push(Object.assign({wsId:d.id},d.data())); });
        return studentsCol.doc(st.uid).collection("questions").get();
      }).then(function(q){
        q.forEach(function(d){ rec.questions.push(d.data()); });
        return Promise.all(worksheetsCache.map(function(w){
          return studentsCol.doc(st.uid).collection("answers").doc(w.id).collection("attempts").get()
            .then(function(at){
              if(at.empty) return;
              rec.answers[w.id]=[];
              at.forEach(function(d){ rec.answers[w.id].push(Object.assign({id:d.id},d.data())); });
            });
        }));
      }).then(function(){ out.students.push(rec); });
    }));
  }).then(function(){ return out; });
}
function exportAll(){
  var b=$("exportAllBtn"); b.textContent="Gathering…";
  gatherEverything().then(function(out){
    downloadJSON(out,"essay-espresso-backup-"+new Date().toISOString().slice(0,10)+".json");
    b.textContent="⬇ Export ALL (JSON)";
  }).catch(function(e){ showErr("Export failed: "+e.message); b.textContent="⬇ Export ALL (JSON)"; });
}
function exportAnswersCSV(){
  var b=$("exportAnswersCsv"); b.textContent="Gathering…";
  gatherEverything().then(function(out){
    var rows=[["Student","Worksheet","Attempt","Question","Answer","Tutor comment","Status","Submitted (PT)"]];
    out.students.forEach(function(st){
      Object.keys(st.answers||{}).forEach(function(wid){
        var w=worksheetsCache.filter(function(x){return x.id===wid;})[0]||{title:wid,questions:[]};
        st.answers[wid].forEach(function(a){
          (w.questions||[]).forEach(function(q,i){
            rows.push([st.name||st.email,w.title,a.name||"",q.label||("Question "+(i+1)),
              stripHTML((a.responses||{})[i]||""),(a.comments||{})[i]||"",
              a.status==="good"?"Good job":(a.status==="ng"?"Try again":""),
              a.submittedAt?fmtTime(a.submittedAt):""]);
          });
        });
      });
    });
    downloadCSV(rows,"all-answers.csv");
    b.textContent="⬇ All answers (CSV)";
  }).catch(function(e){ showErr("Export failed: "+e.message); b.textContent="⬇ All answers (CSV)"; });
}
