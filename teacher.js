/* ================= EssayEspresso — teacher ================= */
var T={}, STUDENTS=[], WS={}, PARENTS=[], TAB="approve";

auth.onAuthStateChanged(function(u){
  if(!u){ location.href="index.html"; return; }
  if(!isTeacherUser(u)){
    $("notice").appendChild(errBox(
      "This account isn't the teacher account, or its email isn't verified."));
    return;
  }
  boot();
});

function boot(){
  teacherRef.get().then(function(d){ T=d.exists?d.data():{}; })
  .then(loadAll).then(function(){ drawProfile(); drawTabs(); drawPanel(); })
  .catch(function(e){ $("notice").appendChild(errBox("Could not load: "+e.message)); });
}
function loadAll(){
  return Promise.all([
    studentsCol.get(), wsCol.get(),
    parentsCol.get().catch(function(){ return {forEach:function(){}}; })
  ]).then(function(r){
    STUDENTS=[]; r[0].forEach(function(d){ STUDENTS.push(Object.assign({uid:d.id},d.data())); });
    WS={}; r[1].forEach(function(d){ WS[d.id]=Object.assign({id:d.id},d.data()); });
    PARENTS=[]; r[2].forEach(function(d){ PARENTS.push(Object.assign({uid:d.id},d.data())); });
  });
}
function saveTeacher(patch,msg){
  Object.assign(T,patch);
  return teacherRef.set(patch,{merge:true})
    .then(function(){ if(msg) flash(msg,"Saved ✓"); })
    .catch(function(e){ if(msg) flash(msg,"Could not save: "+e.message,4000); });
}

/* ---------- profile ---------- */
function drawProfile(){
  var c=$("profileCard"); clear(c); c.className="card t";
  var head=el("div","cardhead");
  var left=el("div"); left.style.cssText="display:flex;align-items:center;gap:9px;";
  left.appendChild(el("span","avatar","☕"));
  var who=el("div");
  var n=el("strong",null,T.name||"Jim"); n.style.fontSize="16px";
  who.appendChild(n); who.appendChild(document.createTextNode(" "));
  who.appendChild(el("span","chip","✨"+(T.ap||0)));
  who.appendChild(document.createElement("br"));
  who.appendChild(el("span","muted",auth.currentUser?auth.currentUser.email:""));
  left.appendChild(who); head.appendChild(left);
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Game","fun",function(){ location.href="game.html"; }));
  ctr.appendChild(mkBtn("⚙ Settings","",function(){
    var sc=$("settingsCard");
    if(sc.classList.contains("hidden")){ drawSettings(); sc.classList.remove("hidden"); }
    else sc.classList.add("hidden");
  }));
  ctr.appendChild(mkBtn("Log out","out",function(){ signOutNow().then(function(){ location.href="index.html"; }); }));
  head.appendChild(ctr); c.appendChild(head);
}
function drawSettings(){
  var c=$("settingsCard"); clear(c); c.classList.add("card","t");
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"⚙ My settings"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ c.classList.add("hidden"); }));
  head.appendChild(ctr); c.appendChild(head);
  var msg=el("span","muted");

  c.appendChild(el("div","lab","Display name"));
  var nm=document.createElement("input"); nm.type="text"; nm.value=T.name||"Jim";
  nm.style.maxWidth="300px"; c.appendChild(nm);

  c.appendChild(el("h3",null,"Play-testing"));
  var r1=el("div","fxrow");
  r1.appendChild(el("span","muted","My ✨ balance")).style.width="140px";
  var api=document.createElement("input"); api.type="number"; api.value=T.ap||0;
  api.style.cssText="width:110px;flex:none;";
  r1.appendChild(api);
  r1.appendChild(mkBtn("Set","act",function(){ saveTeacher({ap:Number(api.value)||0},msg).then(drawProfile); }));
  [100,1000].forEach(function(n){ r1.appendChild(mkBtn("+"+n,"",function(){
    api.value=(Number(api.value)||0)+n; saveTeacher({ap:Number(api.value)},msg).then(drawProfile); })); });
  r1.appendChild(mkBtn("Max","",function(){ api.value=99999;
    saveTeacher({ap:99999},msg).then(drawProfile); }));
  r1.appendChild(mkBtn("Zero","",function(){ api.value=0; saveTeacher({ap:0},msg).then(drawProfile); }));
  c.appendChild(r1);

  c.appendChild(el("h3",null,"Export"));
  var ex=el("div"); ex.style.cssText="display:flex;gap:6px;flex-wrap:wrap;";
  ex.appendChild(mkBtn("⬇ All worksheets (JSON)","act",function(){
    download("worksheets.json", JSON.stringify(Object.values(WS),null,2)); }));
  ex.appendChild(mkBtn("⬇ Students (CSV)","",function(){
    var lines=[["name","email","status","ap","streak","last seen"].join(",")];
    STUDENTS.forEach(function(s){ lines.push([s.name,s.email,s.status,s.ap||0,s.streak||0,
      s.lastSeenDay||""].map(function(x){return '"'+String(x||"").replace(/"/g,'""')+'"';}).join(",")); });
    download("students.csv", lines.join("\n")); }));
  c.appendChild(ex);

  var stuRow=el("div","fxrow"); stuRow.style.marginTop="8px";
  stuRow.appendChild(el("span","muted","One student's work")).style.width="140px";
  var sel=document.createElement("select"); sel.style.cssText="flex:0 0 170px;";
  STUDENTS.forEach(function(s){ var o=document.createElement("option");
    o.value=s.uid; o.textContent=s.name||s.email; sel.appendChild(o); });
  stuRow.appendChild(sel);
  stuRow.appendChild(mkBtn("⬇ Their archives (JSON)","act",function(){
    exportStudent(sel.value); }));
  c.appendChild(stuRow);

  var sb=el("div"); sb.style.marginTop="14px";
  sb.appendChild(mkBtn("Save","act",function(){ saveTeacher({name:nm.value.trim()||"Jim"},msg).then(drawProfile); }));
  sb.appendChild(msg);
  c.appendChild(sb);
}
function download(name,text){
  var b=new Blob([text],{type:"text/plain"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click();
}
function exportStudent(uid){
  var out={student:null, archives:{}};
  STUDENTS.forEach(function(s){ if(s.uid===uid) out.student=s; });
  studentsCol.doc(uid).collection("archive").get().then(function(sn){
    var jobs=[];
    sn.forEach(function(d){
      jobs.push(studentsCol.doc(uid).collection("archive").doc(d.id).collection("rows").get()
        .then(function(rs){ var arr=[]; rs.forEach(function(x){ arr.push(x.data()); });
          out.archives[d.id]=arr; }));
    });
    return Promise.all(jobs);
  }).then(function(){ download((out.student.name||"student")+".json", JSON.stringify(out,null,2)); })
   .catch(function(e){ alert("Export failed: "+e.message); });
}

/* ---------- tabs ---------- */
var TABS=[["approve","Approve"],["mark","Mark"],["worksheets","Worksheets"],
  ["cats","Categories & sources"],["rewards","Practice rewards"],["parents","Parents"],
  ["studentgame","Student game"]];
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
  if(TAB==="approve") return panApprove(p);
  if(TAB==="parents") return panParents(p);
  if(TAB==="mark") return panMark(p);
  if(TAB==="worksheets") return panWorksheets(p);
  if(TAB==="cats") return panCats(p);
  if(TAB==="rewards") return panRewards(p);
  if(TAB==="studentgame") return panStudentGame(p);
}

/* ---------- Approve ---------- */

/* ---------- removing a student: revoke, or really delete ---------- */
function askRemove(s){
  var who = esc(s.name || s.email || "this student");
  countWork(s.uid).then(function(n){
    var rows = n===null ? "their work" : (n + " archive entr" + (n===1?"y":"ies"));
    showModal(
      "<p style='font-weight:bold;font-size:15px;margin:0 0 10px;'>Remove " + who + "?</p>" +
      "<label style='display:block;margin-bottom:7px;width:auto;'>" +
        "<input type='radio' name='rm' value='revoke' checked> <strong>Revoke access, keep the work.</strong><br>" +
        "<span class='muted' style='margin-left:20px;'>They can't sign in. You keep " + rows +
        ". Reversible — approve them again any time.</span></label>" +
      "<label style='display:block;margin-bottom:4px;width:auto;'>" +
        "<input type='radio' name='rm' value='delete'> <strong>Delete everything.</strong><br>" +
        "<span class='muted' style='margin-left:20px;'>Archives, drafts and game state. This cannot be undone.</span></label>",
      [ {label:"Remove", cls:"del", fn:function(){
          var pick=document.querySelector("input[name=rm]:checked");
          var mode = pick ? pick.value : "revoke";
          if(mode==="delete" &&
             !confirm("Delete everything for "+(s.name||s.email)+"? This cannot be undone.")) return;
          hideModal();
          doRemove(s, mode);
        }},
        {label:"Cancel", fn:hideModal} ]);
  });
}
function countWork(uid){
  return studentsCol.doc(uid).collection("archive").get().then(function(sn){
    if(sn.empty) return 0;
    var jobs=[];
    sn.forEach(function(d){
      jobs.push(studentsCol.doc(uid).collection("archive").doc(d.id)
        .collection("rows").get().then(function(r){ return r.size; }));
    });
    return Promise.all(jobs).then(function(ns){
      return ns.reduce(function(a,b){ return a+b; }, 0);
    });
  }).catch(function(){ return null; });
}
function doRemove(s, mode){
  if(mode!=="delete"){
    studentsCol.doc(s.uid).set({status:"removed"},{merge:true})
      .then(function(){ loadAll().then(drawPanel); });
    return;
  }
  wipeStudent(s.uid).then(function(){
    return studentsCol.doc(s.uid).delete();
  }).then(function(){ loadAll().then(drawPanel); })
    .catch(function(e){ alert("Could not finish deleting: "+e.message); });
}
function wipeStudent(uid){
  var root=studentsCol.doc(uid);
  function killAll(colRef){
    return colRef.get().then(function(sn){
      var jobs=[];
      sn.forEach(function(d){ jobs.push(colRef.doc(d.id).delete()); });
      return Promise.all(jobs);
    }).catch(function(){});
  }
  return root.collection("archive").get().then(function(sn){
    var jobs=[];
    sn.forEach(function(d){ jobs.push(killAll(root.collection("archive").doc(d.id).collection("rows"))); });
    return Promise.all(jobs);
  }).catch(function(){}).then(function(){
    return Promise.all([ killAll(root.collection("archive")),
                         killAll(root.collection("drafts")),
                         killAll(root.collection("assignments")),
                         killAll(root.collection("game")) ]);
  });
}

/* ---------- Parents: read-only observers linked to one or more students ---------- */
function studentName(uid){
  var f=null; STUDENTS.forEach(function(s){ if(s.uid===uid) f=s; });
  return f ? (f.name || f.email || uid) : uid;
}
function approvedStudents(){
  return STUDENTS.filter(function(s){ return s.status==="approved"; });
}
function panParents(p){
  var c=el("div","card t"); p.appendChild(c);
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,"Parents"));
  var ctr=el("div","ctrls");
  var mail=document.createElement("input");
  mail.type="email"; mail.placeholder="parent@email.com";
  mail.style.cssText="flex:1;min-width:190px;";
  ctr.appendChild(mail);
  ctr.appendChild(mkBtn("+ Invite","act",function(){
    var e=(mail.value||"").trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){ alert("That doesn't look like an email address."); return; }
    if(PARENTS.some(function(x){ return (x.email||"").toLowerCase()===e; })){
      alert("That address is already invited."); return; }
    parentsCol.doc("invite_"+e.replace(/[^a-z0-9]/g,"_")).set({
      email:e, students:[], scope:"activity", invited:true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(){ mail.value=""; loadAll().then(drawPanel); })
      .catch(function(err){ alert("Could not invite: "+err.message); });
  }));
  head.appendChild(ctr); c.appendChild(head);

  c.appendChild(el("p","muted","Invite by email. When that address signs in with Google it becomes a "+
    "read-only parent account. One parent can watch several children, and one child can have two parents. "+
    "Parents never see the game or ✨ balances, and can't change anything."));

  var t=el("table"); t.style.marginTop="10px"; c.appendChild(t);
  function render(){
    clear(t);
    var hr=document.createElement("tr");
    ["Parent","Watching","They may see","Last seen",""].forEach(function(h){
      hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    if(!PARENTS.length){
      var e0=document.createElement("tr");
      var td0=el("td","muted","Nobody yet.");
      td0.colSpan=5; e0.appendChild(td0); t.appendChild(e0);
      return;
    }
    PARENTS.forEach(function(pa){
      var tr=document.createElement("tr");
      var a=el("td");
      a.appendChild(el("strong",null, pa.name || (pa.email||"").split("@")[0] || "Parent"));
      a.appendChild(document.createElement("br"));
      a.appendChild(el("span","muted", pa.email||""));
      if(pa.invited && !pa.uidLinked){
        a.appendChild(document.createTextNode(" "));
        var tg=el("span","tag","invited"); tg.style.cursor="default";
        a.appendChild(tg);
      }
      tr.appendChild(a);

      var b=el("td");
      (pa.students||[]).forEach(function(uid){
        var line=el("div"); line.style.marginBottom="2px";
        line.appendChild(document.createTextNode(studentName(uid)+" "));
        var x=mkBtn("✕","del",function(){
          var next=(pa.students||[]).filter(function(u){ return u!==uid; });
          parentsCol.doc(pa.uid).set({students:next},{merge:true})
            .then(function(){ loadAll().then(drawPanel); });
        });
        x.style.cssText="font-size:11px;padding:0 5px;";
        line.appendChild(x);
        b.appendChild(line);
      });
      var free=approvedStudents().filter(function(s){
        return (pa.students||[]).indexOf(s.uid)<0; });
      if(free.length){
        var add=el("select"); add.style.cssText="width:auto;margin-top:3px;";
        var o0=document.createElement("option"); o0.value=""; o0.textContent="+ add a student";
        add.appendChild(o0);
        free.forEach(function(s){
          var o=document.createElement("option");
          o.value=s.uid; o.textContent=s.name||s.email; add.appendChild(o);
        });
        add.onchange=function(){
          if(!add.value) return;
          var next=(pa.students||[]).concat([add.value]);
          parentsCol.doc(pa.uid).set({students:next},{merge:true})
            .then(function(){ loadAll().then(drawPanel); });
        };
        b.appendChild(add);
      }
      tr.appendChild(b);

      var cc=el("td");
      cc.appendChild(selectFromT(["full","activity"], pa.scope||"activity", function(v){
        parentsCol.doc(pa.uid).set({scope:v},{merge:true})
          .then(function(){ loadAll().then(drawPanel); });
      }, function(v){ return v==="full" ? "Everything" : "Activity only"; }));
      tr.appendChild(cc);

      tr.appendChild(el("td","muted", pa.lastSeen ? ptStamp(pa.lastSeen) : "—"));

      var e2=el("td");
      if((pa.students||[]).length){
        e2.appendChild(mkBtn("👁 View as","edit",function(){
          location.href="parent.html?as="+pa.uid; }));
      }
      e2.appendChild(mkBtn("Remove","del",function(){
        if(!confirm("Remove "+(pa.email||"this parent")+"? They lose access straight away.")) return;
        parentsCol.doc(pa.uid).delete().then(function(){ loadAll().then(drawPanel); });
      }));
      tr.appendChild(e2);
      t.appendChild(tr);
    });
  }
  render();

  var note=el("div","card t"); p.appendChild(note);
  note.appendChild(el("h2",null,"What each setting shows"));
  var nt=el("table"); nt.style.cssText="margin-top:8px;max-width:640px;";
  var nh=document.createElement("tr");
  ["Setting","They see","They don't see"].forEach(function(h){ nh.appendChild(el("th",null,h)); });
  nt.appendChild(nh);
  [["Activity only","Streak, how many entries, which worksheets, when",
    "The answers themselves, or your comments"],
   ["Everything","All of the above, plus every answer and every comment you've written",
    "The game, ✨ balances, and anything they could change"]].forEach(function(r){
    var tr=document.createElement("tr");
    tr.appendChild(el("td")).innerHTML="<strong>"+r[0]+"</strong>";
    tr.appendChild(el("td",null,r[1]));
    tr.appendChild(el("td","muted",r[2]));
    nt.appendChild(tr);
  });
  note.appendChild(nt);
}
function selectFromT(list, val, fn, labelFn){
  var sel=el("select"); sel.style.width="auto";
  list.forEach(function(v){
    var o=document.createElement("option");
    o.value=v; o.textContent=labelFn?labelFn(v):v;
    if(v===val) o.selected=true;
    sel.appendChild(o);
  });
  sel.onchange=function(){ fn(sel.value); };
  return sel;
}

function panApprove(p){
  var c=el("div","card t"); p.appendChild(c);
  var msg=el("span","muted");
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,"Students"));
  var ctr=el("div","ctrls");
  var filt=document.createElement("select"); filt.style.cssText="flex:none;width:auto;";
  [["all","All students"],["flagged","Flagged (inactive)"],["pending","Waiting for approval"]]
    .forEach(function(o){ var x=document.createElement("option"); x.value=o[0]; x.textContent=o[1];
      filt.appendChild(x); });
  ctr.appendChild(filt);
  ctr.appendChild(el("span","muted","inactive after"));
  var days=document.createElement("input"); days.type="number"; days.value=T.inactiveDays||3;
  days.style.cssText="width:60px;flex:none;";
  ctr.appendChild(days); ctr.appendChild(el("span","muted","days"));
  ctr.appendChild(mkBtn("⟳","",function(){ loadAll().then(drawPanel); }));
  head.appendChild(ctr); c.appendChild(head);
  c.appendChild(msg);

  filt.onchange=render; days.onchange=function(){ saveTeacher({inactiveDays:Number(days.value)||3}); render(); };
  var body=el("div"); c.appendChild(body);
  render();

  function render(){
    clear(body);
    var today=ptDayKey(), lim=Number(days.value)||3;
    var list=STUDENTS.filter(function(s){
      var gap = s.lastSeenDay ? daysBetweenKeys(s.lastSeenDay,today) : 999;
      if(filt.value==="pending") return s.status!=="approved";
      if(filt.value==="flagged") return s.status==="approved" && gap>=lim;
      return true;
    });
    if(!list.length){ body.appendChild(el("p","muted","Nobody here.")); return; }
    var t=el("table");
    var hr=document.createElement("tr");
    ["Student","Last seen","Game","May switch","May add own",""].forEach(function(h,i){
      var th=el("th",null,h); if(i>=2&&i<=4) th.style.width="100px"; hr.appendChild(th); });
    t.appendChild(hr);
    list.forEach(function(s){
      var gap = s.lastSeenDay ? daysBetweenKeys(s.lastSeenDay,today) : 999;
      var tr=document.createElement("tr");
      var td1=el("td");
      td1.appendChild(el("strong",null,s.name||s.email));
      td1.appendChild(document.createElement("br"));
      td1.appendChild(el("span","muted",s.email||""));
      if(s.status==="approved" && gap>=lim){
        var f=el("span",null," inactive "+(gap>900?"—":gap+" days"));
        f.style.cssText="background:#f7d6d3;border:1px solid #c0261a;padding:1px 6px;font-size:11px;font-weight:bold;";
        td1.appendChild(f);
      }
      tr.appendChild(td1);
      tr.appendChild(el("td","muted", s.lastSeenDay||"never"));

      var td3=el("td");
      if(s.status==="approved"){
        var g=document.createElement("select");
        [["on","On"],["off","Off"]].forEach(function(o){ var x=document.createElement("option");
          x.value=o[0]; x.textContent=o[1]; g.appendChild(x); });
        g.value = (s.gameOn===false)?"off":"on";
        g.onchange=function(){ studentsCol.doc(s.uid).set({gameOn:g.value==="on"},{merge:true})
          .then(function(){ s.gameOn=g.value==="on"; flash(msg,"Saved ✓"); }); };
        td3.appendChild(g);
      } else td3.appendChild(el("span","muted","—"));
      tr.appendChild(td3);

      function tick(field, dflt){
        var td=el("td"); td.style.textAlign="center";
        if(s.status!=="approved"){ td.appendChild(el("span","muted","—")); return td; }
        var cb=document.createElement("input"); cb.type="checkbox";
        cb.checked = s[field]!==false;
        cb.onchange=function(){ var o={}; o[field]=cb.checked;
          studentsCol.doc(s.uid).set(o,{merge:true}).then(function(){ s[field]=cb.checked; flash(msg,"Saved ✓"); }); };
        td.appendChild(cb); return td;
      }
      tr.appendChild(tick("mayToggleGame"));
      tr.appendChild(tick("mayAddOwn"));

      var td6=el("td");
      if(s.status!=="approved"){
        td6.appendChild(mkBtn("Approve","act",function(){
          studentsCol.doc(s.uid).set({status:"approved",gameOn:T.defaultGameOn!==false,
            mayToggleGame:true,mayAddOwn:true},{merge:true}).then(function(){ loadAll().then(drawPanel); });
        }));
      } else {
        td6.appendChild(mkBtn("👁 View as","edit",function(){ location.href="student.html?as="+s.uid; }));
      }
      td6.appendChild(mkBtn("Remove","del",function(){ askRemove(s); }));
      tr.appendChild(td6);
      t.appendChild(tr);
    });
    body.appendChild(t);
    body.appendChild(el("p","muted",
      "Game Off hides ✨ and the Game button for that student — points still accrue quietly, "+
      "so switching back loses nothing. Untick \"May switch\" and your setting is final."));
  }
}

/* ---------- Mark ---------- */
function panMark(p){
  var c=el("div","card t"); p.appendChild(c);
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"Mark"));
  var ctr=el("div","ctrls");
  var sel=document.createElement("select"); sel.style.cssText="flex:none;width:auto;min-width:150px;";
  STUDENTS.filter(function(s){return s.status==="approved";}).forEach(function(s){
    var o=document.createElement("option"); o.value=s.uid; o.textContent=s.name||s.email; sel.appendChild(o); });
  ctr.appendChild(sel);
  ctr.appendChild(mkBtn("Load","act",function(){ load(sel.value); }));
  head.appendChild(ctr); c.appendChild(head);
  var body=el("div"); c.appendChild(body);
  if(sel.value) load(sel.value);

  function load(uid){
    clear(body); body.appendChild(el("p","muted","Loading…"));
    var assignRef=studentsCol.doc(uid).collection("assignments");
    assignRef.get().then(function(sn){
      var asn=[]; sn.forEach(function(d){ asn.push(Object.assign({id:d.id},d.data())); });
      asn.sort(function(a,b){ return (a.order||0)-(b.order||0); });
      clear(body);

      // assign bar
      var bar=el("div"); bar.style.cssText=
        "display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center;border:1px solid #000;background:#fff;padding:7px 9px;";
      var q=document.createElement("input"); q.type="text";
      q.placeholder="Type to find a worksheet to assign…"; q.style.cssText="flex:1;min-width:200px;";
      bar.appendChild(q);
      var hits=el("div"); hits.style.cssText="display:flex;gap:6px;flex-wrap:wrap;";
      q.oninput=function(){
        clear(hits);
        var term=q.value.trim().toLowerCase();
        if(term.length<2) return;
        Object.values(WS).filter(function(w){
          return (w.title||"").toLowerCase().indexOf(term)>=0 &&
                 !asn.some(function(a){return a.id===w.id;});
        }).slice(0,6).forEach(function(w){
          hits.appendChild(mkBtn(w.title,"assign",function(){
            assignRef.doc(w.id).set({order:(asn.length+1)*10, addedBy:"teacher"},{merge:true})
              .then(function(){ load(uid); });
          }));
        });
      };
      bar.appendChild(hits);
      body.appendChild(bar);

      if(!asn.length){ body.appendChild(el("p","muted","Nothing assigned yet.")); return; }
      asn.forEach(function(a,i){
        var w=WS[a.id]; if(!w) return;
        var r=el("div","row");
        r.appendChild(el("span","num",(i+1)+"."));
        var d=el("div"); d.style.flex="1";
        d.appendChild(el("strong",null,w.title));
        d.appendChild(el("span","muted"," · "+(a.attempts||0)+" submissions"+
          (a.doneDate?(" · last "+a.doneDate):"")));
        r.appendChild(d);
        r.appendChild(mkBtn("▲","",function(){ move(i,-1); }));
        r.appendChild(mkBtn("▼","",function(){ move(i,1); }));
        r.appendChild(mkBtn("Open ▾","edit",function(){ openArchive(uid,w,r); }));
        r.appendChild(mkBtn("✕ Unassign","del",function(){
          if(confirm("Unassign "+w.title+"?")) assignRef.doc(a.id).delete().then(function(){ load(uid); });
        }));
        body.appendChild(r);
      });
      function move(i,dir){
        var j=i+dir; if(j<0||j>=asn.length) return;
        var b=db.batch();
        b.set(assignRef.doc(asn[i].id),{order:(j+1)*10},{merge:true});
        b.set(assignRef.doc(asn[j].id),{order:(i+1)*10},{merge:true});
        b.commit().then(function(){ load(uid); });
      }
    }).catch(function(e){ clear(body); body.appendChild(errBox("Could not load: "+e.message)); });
  }

  function openArchive(uid,w,afterNode){
    if(afterNode._open){ afterNode._open.remove(); afterNode._open=null; return; }
    var box=el("div","card"); box.style.marginLeft="14px";
    box.appendChild(el("p","muted","Loading…"));
    afterNode.parentNode.insertBefore(box, afterNode.nextSibling);
    afterNode._open=box;
    studentsCol.doc(uid).collection("archive").doc(w.id).collection("rows").limit(300).get()
    .then(function(sn){
      var rows=[]; sn.forEach(function(d){ rows.push(Object.assign({id:d.id},d.data())); });
      rows.sort(function(a,b){ return (b.ms||0)-(a.ms||0); });
      clear(box);
      var hd=el("div","cardhead");
      hd.appendChild(el("strong",null,w.title));
      var hc=el("div","ctrls");
      var pick=document.createElement("select"); pick.style.cssText="flex:none;width:auto;min-width:210px;";
      rows.forEach(function(r,i){ var o=document.createElement("option"); o.value=i;
        o.textContent="Entry "+(rows.length-i)+" — "+(r.ms?ptStamp(new Date(r.ms)):""); pick.appendChild(o); });
      hc.appendChild(mkBtn("◀","",function(){ if(pick.selectedIndex<rows.length-1){pick.selectedIndex++; show();} }));
      hc.appendChild(pick);
      hc.appendChild(mkBtn("▶","",function(){ if(pick.selectedIndex>0){pick.selectedIndex--; show();} }));
      hc.appendChild(mkBtn("Close ▴","close",function(){ box.remove(); afterNode._open=null; }));
      hd.appendChild(hc); box.appendChild(hd);
      var view=el("div"); box.appendChild(view);
      pick.onchange=show;
      if(!rows.length){ view.appendChild(el("p","muted","Nothing submitted yet.")); return; }
      show();

      function show(){
        clear(view);
        var r=rows[Number(pick.value)||0];
        var msg=el("span","muted");
        (w.archiveCols||[]).forEach(function(cn){
          view.appendChild(el("div","lab",cn));
          var inp=document.createElement("input"); inp.type="text";
          inp.value=(r.cols||{})[cn]||"";
          inp.oninput=function(){ r.cols=r.cols||{}; r.cols[cn]=inp.value; };
          view.appendChild(inp);
        });
        view.appendChild(el("div","lab","Comment (the student sees this)"));
        var cm=document.createElement("input"); cm.type="text"; cm.value=r.comment||"";
        cm.oninput=function(){ r.comment=cm.value; };
        view.appendChild(cm);
        var bar=el("div"); bar.style.marginTop="8px";
        bar.appendChild(mkBtn("Save","act",function(){
          studentsCol.doc(uid).collection("archive").doc(w.id).collection("rows").doc(r.id)
            .set({cols:r.cols||{}, comment:r.comment||""},{merge:true})
            .then(function(){ flash(msg,"Saved ✓"); })
            .catch(function(e){ flash(msg,"Failed: "+e.message,4000); });
        }));
        bar.appendChild(mkBtn("Delete entry","del",function(){
          if(!confirm("Delete this entry?")) return;
          studentsCol.doc(uid).collection("archive").doc(w.id).collection("rows").doc(r.id).delete()
            .then(function(){ box.remove(); afterNode._open=null; openArchive(uid,w,afterNode); });
        }));
        bar.appendChild(msg);
        view.appendChild(bar);
      }
    }).catch(function(e){ clear(box); box.appendChild(errBox("Could not load: "+e.message)); });
  }
}

/* ---------- Worksheets ---------- */
function panWorksheets(p){
  var c=el("div","card t"); p.appendChild(c);
  var msg=el("span","muted");
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"Worksheets"));
  var ctr=el("div","ctrls");
  var nt=document.createElement("input"); nt.type="text"; nt.placeholder="New worksheet title…";
  nt.style.cssText="flex:1;min-width:170px;";
  ctr.appendChild(nt);
  ctr.appendChild(mkBtn("+ Create","act",function(){
    var title=nt.value.trim(); if(!title){ flash(msg,"Type a title first."); return; }
    wsCol.add({title:title, ap:5, order:Object.keys(WS).length*10,
      archiveCols:["Word","Meaning","What you wrote"],
      questions:[{label:"Question 1.",type:"typed",text:"",archiveCol:"What you wrote"}],
      help:{on:true,text:"",frames:[]}, check:{on:true,text:"",frames:[]},
      sources:[], test:{on:true,count:5,options:3,ap:3,wordings:[]},
      counterStyle:"unit", counterUnit:"times"
    }).then(function(ref){ location.href="wseditor.html?id="+ref.id; })
      .catch(function(e){ flash(msg,"Failed: "+e.message,4000); });
  }));
  head.appendChild(ctr); c.appendChild(head);
  c.appendChild(msg);

  var fbar=el("div"); fbar.style.cssText=
    "display:flex;gap:6px;margin:10px 0;flex-wrap:wrap;align-items:center;border:1px solid #000;background:#fff;padding:7px 9px;";
  var f=document.createElement("input"); f.type="text"; f.placeholder="Filter by tag or title…";
  f.style.cssText="flex:1;min-width:160px;";
  fbar.appendChild(f);
  var tagset={}; Object.values(WS).forEach(function(w){ (w.tags||[]).forEach(function(t){ tagset[t]=1; }); });
  Object.keys(tagset).sort().forEach(function(t){
    var chip=el("span","tag",t);
    chip.onclick=function(){ f.value=t; render(); };
    fbar.appendChild(chip);
  });
  fbar.appendChild(mkBtn("clear","",function(){ f.value=""; render(); }));
  c.appendChild(fbar);
  f.oninput=render;
  var body=el("div"); c.appendChild(body);
  render();

  function render(){
    clear(body);
    var term=(f.value||"").toLowerCase();
    var list=Object.values(WS).filter(function(w){
      if(!term) return true;
      return (w.title||"").toLowerCase().indexOf(term)>=0 ||
        (w.tags||[]).some(function(t){ return t.toLowerCase().indexOf(term)>=0; });
    });
    list.sort(function(a,b){ return (a.order||0)-(b.order||0); });
    if(!list.length){ body.appendChild(el("p","muted","No worksheets yet.")); return; }
    list.forEach(function(w,i){
      var r=el("div","row");
      var d=el("div"); d.style.cssText="flex:1;min-width:190px;";
      d.appendChild(el("strong",null,(i+1)+". "+(w.title||"(untitled)")));
      (w.tags||[]).forEach(function(t){ d.appendChild(el("span","tag",t)); });
      if(w.category) d.appendChild(el("span","muted"," · "+w.category));
      r.appendChild(d);
      r.appendChild(el("span","muted","✨"));
      var ap=document.createElement("input"); ap.type="number"; ap.value=w.ap||0;
      ap.style.cssText="width:60px;flex:none;";
      ap.onchange=function(){ wsCol.doc(w.id).set({ap:Number(ap.value)||0},{merge:true})
        .then(function(){ w.ap=Number(ap.value)||0; flash(msg,"Saved ✓"); }); };
      r.appendChild(ap);
      r.appendChild(mkBtn("▲","",function(){ reorder(list,i,-1); }));
      r.appendChild(mkBtn("▼","",function(){ reorder(list,i,1); }));
      r.appendChild(mkBtn("Edit","edit",function(){ location.href="wseditor.html?id="+w.id; }));
      r.appendChild(mkBtn("⧉ Duplicate","",function(){
        var copy=JSON.parse(JSON.stringify(w)); delete copy.id;
        copy.title=(w.title||"Worksheet")+" (copy)";
        copy.order=(w.order||0)+1;
        wsCol.add(copy).then(function(ref){ location.href="wseditor.html?id="+ref.id; })
          .catch(function(e){ flash(msg,"Could not duplicate: "+e.message,4000); });
      }));
      r.appendChild(mkBtn("Delete","del",function(){
        if(confirm('Delete "'+w.title+'"? This cannot be undone.'))
          wsCol.doc(w.id).delete().then(function(){ loadAll().then(drawPanel); });
      }));
      body.appendChild(r);
    });
  }
  function reorder(list,i,dir){
    var j=i+dir; if(j<0||j>=list.length) return;
    var b=db.batch();
    b.set(wsCol.doc(list[i].id),{order:(j+1)*10},{merge:true});
    b.set(wsCol.doc(list[j].id),{order:(i+1)*10},{merge:true});
    b.commit().then(function(){ loadAll().then(drawPanel); });
  }
}

/* ---------- checking a media set ----------
   Reports how many rows, how many are Drive links that need rewriting, and
   which ones don't load. Images we can genuinely test; frames we can't, so
   we say so rather than pretending.                                        */
function checkMediaSet(src, body, statusNode){
  var mediaCols=(src.cols||[]).filter(function(c){
    return c.showAs && c.showAs!=="text";
  });
  if(!mediaCols.length){
    statusNode.textContent="✓ "+body.length+" rows — but no column is set to show as an image, "+
      "PDF or web page yet.";
    return;
  }
  var col = mediaCols[0];
  var idx = colIndex(col.letter);
  var urls = body.map(function(r){ return (r[idx]||"").trim(); }).filter(Boolean);
  var drive = urls.filter(looksLikeDrive).length;

  clear(statusNode);
  statusNode.appendChild(el("div",null,"✓ "+body.length+" rows · "+urls.length+
    " link"+(urls.length===1?"":"s")+" in column "+col.letter));

  if(drive){
    var d=el("div"); d.style.cssText="margin-top:5px;";
    d.appendChild(el("span",null, drive+" Drive link"+(drive===1?" is":"s are")+
      " in the share format, which shows Drive's viewer instead of the file. "));
    d.appendChild(mkBtn("Rewrite them","act",function(){
      statusNode.appendChild(el("div","ok",
        "They're rewritten automatically when a student sees them — nothing to change in your sheet."));
    }));
    statusNode.appendChild(d);
  }

  if(col.showAs==="image"){
    var sample = urls.slice(0,12);
    var done=0, bad=[];
    var line=el("div"); line.style.marginTop="5px";
    line.textContent="Checking "+sample.length+" image"+(sample.length===1?"":"s")+"…";
    statusNode.appendChild(line);
    if(!sample.length){ line.textContent="No links to check."; return; }
    sample.forEach(function(u){
      var im=new Image();
      var settled=false;
      function finish(ok){
        if(settled) return; settled=true;
        done++; if(!ok) bad.push(u);
        if(done===sample.length){
          if(!bad.length) line.textContent="✓ all "+sample.length+" checked images load.";
          else {
            clear(line);
            line.className="err";
            line.appendChild(el("div",null, bad.length+" of "+sample.length+
              " didn't load. Usually that means the file isn't shared with "+
              "anyone with the link."));
            bad.slice(0,4).forEach(function(b){
              line.appendChild(el("div","muted", b.slice(0,90)));
            });
          }
        }
      }
      im.onload=function(){ finish(true); };
      im.onerror=function(){ finish(false); };
      setTimeout(function(){ finish(false); }, 8000);
      im.src=mediaUrl(u,"image");
    });
  } else {
    statusNode.appendChild(el("div","muted",
      "PDFs and web pages can't be checked from here — some sites refuse to load inside a frame. "+
      "Open the worksheet preview to see which ones come up blank."));
  }
}

/* ---------- Categories & sources ---------- */
function panCats(p){
  var msg=el("span","muted");
  var c1=el("div","card t"); p.appendChild(c1);
  c1.appendChild(el("h2",null,"Categories"));
  c1.appendChild(el("p","muted",
    'Order here is the order students see behind the "+". Untick self-serve to keep a category for assignment only.'));
  var cats=(T.categories||[]).slice();
  var t=el("table"); c1.appendChild(t);
  function renderCats(){
    clear(t);
    var hr=document.createElement("tr");
    ["Order","Category","Self-serve","Worksheets",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    cats.forEach(function(cat,i){
      var tr=document.createElement("tr");
      var td0=el("td");
      td0.appendChild(mkBtn("▲","",function(){ if(i>0){ var x=cats[i-1]; cats[i-1]=cats[i]; cats[i]=x;
        renderCats(); } }));
      td0.appendChild(mkBtn("▼","",function(){ if(i<cats.length-1){ var x=cats[i+1]; cats[i+1]=cats[i];
        cats[i]=x; renderCats(); } }));
      tr.appendChild(td0);
      var td1=el("td"); var inp=document.createElement("input"); inp.type="text"; inp.value=cat.name||"";
      inp.oninput=function(){ cat.name=inp.value; }; td1.appendChild(inp); tr.appendChild(td1);
      var td2=el("td"); td2.style.textAlign="center";
      var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!cat.selfServe;
      cb.onchange=function(){ cat.selfServe=cb.checked; }; td2.appendChild(cb); tr.appendChild(td2);
      var n=Object.values(WS).filter(function(w){ return w.category===cat.name; }).length;
      tr.appendChild(el("td","muted",n+" worksheet"+(n===1?"":"s")));
      var td4=el("td");
      td4.appendChild(mkBtn("✕","del",function(){ cats.splice(i,1); renderCats(); }));
      tr.appendChild(td4);
      t.appendChild(tr);
    });
  }
  renderCats();
  var bar=el("div"); bar.style.marginTop="8px";
  bar.appendChild(mkBtn("+ Add category","act",function(){
    cats.push({name:"New category",selfServe:true}); renderCats(); }));
  bar.appendChild(mkBtn("Save categories","act",function(){ saveTeacher({categories:cats},msg); }));
  bar.appendChild(msg);
  c1.appendChild(bar);

  /* sources */
  var c2=el("div","card t"); p.appendChild(c2);
  c2.appendChild(el("h2",null,"Sources"));
  c2.appendChild(el("p","muted",
    "In Google Sheets: File → Share → Publish to web → choose the tab → CSV. Paste that link here. "+
    "It updates automatically when you edit the sheet (a few minutes' cache delay)."));
  c2.appendChild(el("p","muted",
    "A word list is a sheet of words. A media set is a sheet of links — one image, PDF or web page "+
    "per row — and works exactly the same way, including no repeats until the list runs out. "+
    "Drive folders can't be read directly, so a media set needs a sheet with one link per row."));
  var srcs=(T.sources||[]).slice();
  var host=el("div"); c2.appendChild(host);
  function renderSrcs(){
    clear(host);
    srcs.forEach(function(s,i){
      var box=el("div"); box.style.cssText="border:1px solid #000;background:#fff;padding:9px;margin-bottom:10px;";
      var r=el("div","fxrow");
      r.appendChild(el("span","muted","Name")).style.width="60px";
      var nm=document.createElement("input"); nm.type="text"; nm.value=s.name||"";
      nm.style.cssText="flex:1;min-width:110px;"; nm.oninput=function(){ s.name=nm.value; renderTokens(); };
      r.appendChild(nm);
      var kind=el("select"); kind.style.cssText="flex:0 0 130px;width:auto;";
      [["words","Word list"],["media","Media set"]].forEach(function(k){
        var o=document.createElement("option"); o.value=k[0]; o.textContent=k[1];
        if((s.kind||"words")===k[0]) o.selected=true; kind.appendChild(o);
      });
      kind.onchange=function(){ s.kind=kind.value; renderSrcs(); };
      r.appendChild(kind);
      var url=document.createElement("input"); url.type="url"; url.value=s.url||"";
      url.placeholder="https://docs.google.com/…/pub?output=csv";
      url.style.cssText="flex:2;min-width:190px;"; url.oninput=function(){ s.url=url.value; };
      r.appendChild(url);
      var st=el("span","muted");
      r.appendChild(mkBtn("Test","act",function(){
        st.textContent="Loading…";
        SHEET_CACHE[s.url]=null;
        loadSheet(s.url).then(function(rows){
          var body=rows.length>1?rows.slice(1):rows;
          if((s.kind||"words")!=="media"){
            st.textContent="✓ "+body.length+" rows · e.g. "+(body[0]||[]).slice(0,3).join(", ");
            return;
          }
          checkMediaSet(s, body, st);
        }).catch(function(e){ st.textContent="✗ "+e.message+" — is it published to the web as CSV?"; });
      }));
      r.appendChild(mkBtn("✕ Delete","del",function(){ srcs.splice(i,1); renderSrcs(); }));
      box.appendChild(r); box.appendChild(st);

      var ct=el("table"); ct.style.marginTop="8px";
      var tokLine=el("p","muted");
      function renderTokens(){
        tokLine.innerHTML="Use as: "+((s.cols||[]).map(function(cc){
          return "<code>{"+esc(s.name||"src")+"."+esc(cc.name||"col")+"}</code>"; }).join(" ")||"—");
      }
      function renderCols(){
        clear(ct);
        var hr=document.createElement("tr");
        var heads = (s.kind==="media")
          ? ["Column","Call it…","Show it as","Token",""]
          : ["Column","Call it…","Token",""];
        heads.forEach(function(h){ hr.appendChild(el("th",null,h)); });
        ct.appendChild(hr);
        (s.cols||[]).forEach(function(col,ci){
          var tr=document.createElement("tr");
          var t1=el("td"); var li=document.createElement("input"); li.type="text"; li.value=col.letter||"A";
          li.style.width="56px"; li.oninput=function(){ col.letter=li.value.toUpperCase(); renderCols(); };
          t1.appendChild(li); tr.appendChild(t1);
          var t2=el("td"); var ni=document.createElement("input"); ni.type="text"; ni.value=col.name||"";
          ni.oninput=function(){ col.name=ni.value; renderTokens(); renderCols(); }; t2.appendChild(ni); tr.appendChild(t2);
          if(s.kind==="media"){
            var ts=el("td");
            var sh=el("select"); sh.style.width="auto";
            [["text","Plain text"],["image","Image"],["pdf","PDF"],
             ["web","Web page"],["link","A link to click"]].forEach(function(o){
              var op=document.createElement("option"); op.value=o[0]; op.textContent=o[1];
              if((col.showAs||"text")===o[0]) op.selected=true; sh.appendChild(op);
            });
            sh.onchange=function(){ col.showAs=sh.value; };
            ts.appendChild(sh); tr.appendChild(ts);
          }
          var t3=el("td"); t3.innerHTML="<code>{"+esc(s.name||"src")+"."+esc(col.name||"col")+"}</code>";
          tr.appendChild(t3);
          var t4=el("td"); t4.appendChild(mkBtn("✕","del",function(){ s.cols.splice(ci,1); renderCols(); renderTokens(); }));
          tr.appendChild(t4);
          ct.appendChild(tr);
        });
      }
      s.cols = s.cols||[];
      renderCols(); renderTokens();
      box.appendChild(ct);
      box.appendChild(mkBtn("+ Add column","act",function(){
        s.cols.push({letter:"A",name:"col"+(s.cols.length+1),showAs:"text"});
        renderCols(); renderTokens(); }));
      if(s.kind==="media"){
        var dr=el("div","fxrow"); dr.style.marginTop="8px";
        dr.appendChild(el("span","muted","Display height")).style.width="110px";
        var hi=document.createElement("input"); hi.type="number";
        hi.value=s.height||240; hi.style.cssText="width:80px;flex:none;";
        hi.oninput=function(){ s.height=Number(hi.value)||240; };
        dr.appendChild(hi); dr.appendChild(el("span","muted","px"));
        var cl=el("label"); cl.style.cssText="width:auto;margin-left:12px;";
        var cc2=document.createElement("input"); cc2.type="checkbox";
        cc2.checked = s.clickable!==false;
        cc2.onchange=function(){ s.clickable=cc2.checked; };
        cl.appendChild(cc2); cl.appendChild(document.createTextNode(" let them click to open full size"));
        dr.appendChild(cl);
        box.appendChild(dr);
      }
      box.appendChild(tokLine);
      host.appendChild(box);
    });
  }
  renderSrcs();
  var sbar=el("div");
  sbar.appendChild(mkBtn("+ Add source","act",function(){
    srcs.push({name:"source"+(srcs.length+1),kind:"words",url:"",
      cols:[{letter:"A",name:"words",showAs:"text"},{letter:"B",name:"meaning",showAs:"text"}]});
    renderSrcs(); }));
  sbar.appendChild(mkBtn("+ Add media set","act",function(){
    srcs.push({name:"media"+(srcs.length+1),kind:"media",url:"",height:240,clickable:true,
      cols:[{letter:"A",name:"pic",showAs:"image"},{letter:"B",name:"title",showAs:"text"}]});
    renderSrcs(); }));
  var msg2=el("span","muted");
  sbar.appendChild(mkBtn("Save sources","act",function(){ saveTeacher({sources:srcs},msg2); }));
  sbar.appendChild(msg2);
  c2.appendChild(sbar);
  c2.appendChild(el("p","muted",
    "Two tokens from the SAME source come from the same row (a matched pair). "+
    "Tokens from different sources are picked independently."));
}

/* ---------- Practice rewards ---------- */
function panRewards(p){
  var c=el("div","card t"); p.appendChild(c);
  var msg=el("span","muted");
  c.appendChild(el("h2",null,"Practice rewards"));
  c.appendChild(el("p","muted",
    "Each worksheet pays its own ✨ (set on the Worksheets tab). Streak tiers add a bonus on the first "+
    "submission of a day."));
  var tiers=(T.rewardTiers||[{label:"Day 1–3",bonus:0},{label:"Day 4–6",bonus:1},{label:"Day 7+",bonus:2}]).slice();
  var t=el("table"); c.appendChild(t);
  function render(){
    clear(t);
    var hr=document.createElement("tr");
    ["Streak","Bonus ✨ on first submit of the day",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
    t.appendChild(hr);
    tiers.forEach(function(tr0,i){
      var tr=document.createElement("tr");
      var td1=el("td"); var l=document.createElement("input"); l.type="text"; l.value=tr0.label||"";
      l.oninput=function(){ tr0.label=l.value; }; td1.appendChild(l); tr.appendChild(td1);
      var td2=el("td"); var b=document.createElement("input"); b.type="number"; b.value=tr0.bonus||0;
      b.style.width="90px"; b.oninput=function(){ tr0.bonus=Number(b.value)||0; };
      td2.appendChild(b); tr.appendChild(td2);
      var td3=el("td"); td3.appendChild(mkBtn("✕","del",function(){ tiers.splice(i,1); render(); }));
      tr.appendChild(td3); t.appendChild(tr);
    });
  }
  render();
  var bar=el("div"); bar.style.marginTop="8px";
  bar.appendChild(mkBtn("+ Add tier","act",function(){ tiers.push({label:"New tier",bonus:0}); render(); }));
  var r2=el("div","fxrow"); r2.style.marginTop="10px";
  r2.appendChild(el("span","muted","Miss a day →")).style.width="180px";
  var sel=document.createElement("select"); sel.style.cssText="flex:0 0 210px;";
  [["drop","Drop one tier"],["reset","Reset to tier 1"],["none","No change"]].forEach(function(o){
    var x=document.createElement("option"); x.value=o[0]; x.textContent=o[1]; sel.appendChild(x); });
  sel.value=T.missDayRule||"drop";
  r2.appendChild(sel);
  var r3=el("div","fxrow");
  r3.appendChild(el("span","muted","New students may add own activities")).style.width="260px";
  var cb=document.createElement("input"); cb.type="checkbox"; cb.checked=T.defaultMayAddOwn!==false;
  r3.appendChild(cb);
  var r4=el("div","fxrow");
  r4.appendChild(el("span","muted","New students start with the game")).style.width="260px";
  var cb2=document.createElement("input"); cb2.type="checkbox"; cb2.checked=T.defaultGameOn!==false;
  r4.appendChild(cb2);
  bar.appendChild(mkBtn("Save","act",function(){
    saveTeacher({rewardTiers:tiers, missDayRule:sel.value,
      defaultMayAddOwn:cb.checked, defaultGameOn:cb2.checked}, msg); }));
  bar.appendChild(msg);
  c.appendChild(r2); c.appendChild(r3); c.appendChild(r4); c.appendChild(bar);
}

/* ---------- Student game ---------- */
function panStudentGame(p){
  var c=el("div","card t"); p.appendChild(c);
  var head=el("div","cardhead"); head.appendChild(el("h2",null,"Student game state"));
  var ctr=el("div","ctrls");
  var sel=document.createElement("select"); sel.style.cssText="flex:none;width:auto;min-width:150px;";
  STUDENTS.filter(function(s){return s.status==="approved";}).forEach(function(s){
    var o=document.createElement("option"); o.value=s.uid; o.textContent=s.name||s.email; sel.appendChild(o); });
  ctr.appendChild(sel);
  ctr.appendChild(mkBtn("Load","act",function(){ load(sel.value); }));
  ctr.appendChild(mkBtn("Open the game editor","edit",function(){ location.href="gameeditor.html"; }));
  head.appendChild(ctr); c.appendChild(head);
  var body=el("div"); c.appendChild(body);
  if(sel.value) load(sel.value);

  function load(uid){
    clear(body); body.appendChild(el("p","muted","Loading…"));
    studentsCol.doc(uid).collection("game").doc("state").get().then(function(d){
      clear(body);
      if(!d.exists){ body.appendChild(el("p","muted","This student hasn't started the game.")); return; }
      var g=d.data(), msg=el("span","muted");
      var t=el("table");
      var hr=document.createElement("tr");
      hr.appendChild(el("th",null,"Field")); hr.appendChild(el("th",null,"Value"));
      t.appendChild(hr);
      var fields=[["day","Day"]];
      Object.keys(g.stats||{}).forEach(function(k){ fields.push(["stat:"+k,k]); });
      var edits={};
      fields.forEach(function(f){
        var tr=document.createElement("tr");
        tr.appendChild(el("td",null,f[1]));
        var td=el("td"); var inp=document.createElement("input"); inp.type="number";
        inp.value = f[0]==="day" ? (g.day||1) : (g.stats[f[0].slice(5)]||0);
        inp.style.width="110px";
        edits[f[0]]=inp; td.appendChild(inp); tr.appendChild(td); t.appendChild(tr);
      });
      body.appendChild(t);
      var inv=el("div"); inv.style.marginTop="10px";
      inv.appendChild(el("h3",null,"Inventory"));
      inv.appendChild(el("p","muted",Object.keys(g.inv||{}).map(function(k){
        return k+" ×"+g.inv[k]; }).join(", ")||"empty"));
      body.appendChild(inv);
      var bar=el("div"); bar.style.marginTop="10px";
      bar.appendChild(mkBtn("Save","act",function(){
        var patch={day:Number(edits.day.value)||1, stats:{}};
        Object.keys(edits).forEach(function(k){
          if(k.indexOf("stat:")===0) patch.stats[k.slice(5)]=Number(edits[k].value)||0; });
        studentsCol.doc(uid).collection("game").doc("state").set(patch,{merge:true})
          .then(function(){ flash(msg,"Saved ✓"); })
          .catch(function(e){ flash(msg,"Failed: "+e.message,4000); });
      }));
      bar.appendChild(mkBtn("Reset their run","del",function(){
        if(!confirm("Reset this student's game run?")) return;
        studentsCol.doc(uid).collection("game").doc("state").delete()
          .then(function(){ load(uid); });
      }));
      bar.appendChild(msg);
      body.appendChild(bar);
    }).catch(function(e){ clear(body); body.appendChild(errBox("Could not load: "+e.message)); });
  }
}
