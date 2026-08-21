/* ================= EssayEspresso — the parent view (read-only) ================= */
var P=null, KIDS=[], KID=null, WS={}, OPENWS=null, ROWS=[];
var qs=new URLSearchParams(location.search), VIEWAS=qs.get("as");

auth.onAuthStateChanged(function(u){
  if(!u){ location.href="student.html"; return; }
  if(isTeacherUser(u) && VIEWAS){
    parentsCol.doc(VIEWAS).get().then(function(d){
      if(!d.exists){ fail("That parent record has gone."); return; }
      P=Object.assign({uid:d.id},d.data()); boot(true);
    });
    return;
  }
  resolveRole(u,function(role,data){
    if(role==="teacher"){ location.href="teacher.html"; return; }
    if(role!=="parent"){ location.href="student.html"; return; }
    P=Object.assign({uid:u.uid},data);
    parentsCol.doc(u.uid).set({lastSeen:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})
      .catch(function(){});
    boot(false);
  });
});
function fail(m){ $("msg").appendChild(errBox(m)); }
function seesAll(){ return P && P.scope==="full"; }

function boot(preview){
  var jobs=(P.students||[]).map(function(uid){
    return studentsCol.doc(uid).get().then(function(d){
      return d.exists ? Object.assign({uid:uid},d.data()) : null;
    }).catch(function(){ return null; });
  });
  Promise.all(jobs).then(function(list){
    KIDS=list.filter(Boolean);
    if(!KIDS.length){ fail("No students are linked to this account yet."); return; }
    KID=KIDS[0];
    return wsCol.get().then(function(sn){
      WS={}; sn.forEach(function(d){ WS[d.id]=Object.assign({id:d.id},d.data()); });
    }).catch(function(){});
  }).then(function(){ if(KID) draw(preview); });
}

function draw(preview){
  drawProfile(preview);
  var b=$("body"); clear(b);
  b.appendChild(el("p","muted","Loading "+(KID.name||"their")+" practice…"));
  loadKid().then(function(data){
    clear(b);
    b.appendChild(summaryCard(data));
    b.appendChild(worksheetCard(data));
    if(OPENWS) b.appendChild(entriesCard());
  });
}

function drawProfile(preview){
  var c=$("profileCard"); clear(c);
  var head=el("div","cardhead");
  var left=el("div"); left.style.cssText="display:flex;align-items:center;gap:9px;";
  left.appendChild(el("span","avatar","👤"));
  var who=el("div");
  var nm=el("strong",null, P.name || (P.email||"").split("@")[0] || "Parent");
  nm.style.fontSize="16px"; who.appendChild(nm);
  who.appendChild(document.createElement("br"));
  who.appendChild(el("span","muted","parent · watching "+
    KIDS.map(function(k){ return k.name||k.email; }).join(", ")));
  left.appendChild(who); head.appendChild(left);

  var ctr=el("div","ctrls");
  if(KIDS.length>1){
    var sel=el("select"); sel.style.width="auto";
    KIDS.forEach(function(k){
      var o=document.createElement("option");
      o.value=k.uid; o.textContent=k.name||k.email;
      if(k.uid===KID.uid) o.selected=true;
      sel.appendChild(o);
    });
    sel.onchange=function(){
      KIDS.forEach(function(k){ if(k.uid===sel.value) KID=k; });
      OPENWS=null; draw(preview);
    };
    ctr.appendChild(sel);
  }
  if(preview) ctr.appendChild(mkBtn("← Back to your dashboard","edit",function(){
    location.href="teacher.html"; }));
  else ctr.appendChild(mkBtn("Log out","out",function(){
    signOutNow().then(function(){ location.href="student.html"; }); }));
  head.appendChild(ctr); c.appendChild(head);

  var b=el("div","banner");
  b.innerHTML = "You're looking at " + esc(KID.name||"their") + " practice. This view is read-only — "
    + "nothing you do here changes their work."
    + (seesAll() ? "" : " Your tutor has set this to <strong>activity only</strong>, so answers aren't shown.");
  c.insertBefore(b, c.firstChild);
  if(preview){
    var v=el("div","ok");
    v.textContent="Teacher preview of what this parent sees.";
    c.insertBefore(v, c.firstChild);
  }
}

function loadKid(){
  return studentsCol.doc(KID.uid).collection("archive").get().then(function(sn){
    var jobs=[];
    sn.forEach(function(d){
      jobs.push(studentsCol.doc(KID.uid).collection("archive").doc(d.id).collection("rows")
        .limit(500).get().then(function(r){
          var rows=[]; r.forEach(function(x){ rows.push(Object.assign({id:x.id},x.data())); });
          rows.sort(function(a,b){ return (b.ms||0)-(a.ms||0); });
          return {wsId:d.id, rows:rows};
        }).catch(function(){ return {wsId:d.id, rows:[], blocked:true}; }));
    });
    return Promise.all(jobs);
  }).catch(function(){ return []; });
}

function summaryCard(data){
  var total=0, today=0;
  var key=ptDayKey();
  data.forEach(function(d){
    total += d.rows.length;
    d.rows.forEach(function(r){ if(r.day===key) today++; });
  });
  var c=el("div","card");
  var g=el("div");
  g.style.cssText="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;";
  [[String(KID.streak||0),"day streak"],
   [String(total),"entries all time"],
   [String(today),"practised today"]].forEach(function(pair){
    var box=el("div"); box.style.cssText="border:1px solid #000;padding:9px;text-align:center;";
    var n=el("div",null,pair[0]); n.style.cssText="font-size:22px;font-weight:bold;";
    box.appendChild(n); box.appendChild(el("div","muted",pair[1]));
    g.appendChild(box);
  });
  c.appendChild(g);
  if(!total) c.appendChild(el("p","muted","No practice recorded yet."));
  return c;
}

function worksheetCard(data){
  var c=el("div","card");
  c.appendChild(el("h2",null,"Practice"));
  var t=el("table"); t.style.marginTop="8px";
  var hr=document.createElement("tr");
  ["Worksheet","Entries","Last done",""].forEach(function(h){ hr.appendChild(el("th",null,h)); });
  t.appendChild(hr);
  var any=false;
  data.sort(function(a,b){ return b.rows.length-a.rows.length; }).forEach(function(d){
    if(!d.rows.length && !d.blocked) return;
    any=true;
    var w=WS[d.wsId]||{};
    var tr=document.createElement("tr");
    tr.appendChild(el("td",null, w.title || d.wsId));
    tr.appendChild(el("td",null, String(d.rows.length)));
    tr.appendChild(el("td","muted", d.rows[0] ? ptStamp(d.rows[0].ms ? new Date(d.rows[0].ms) : null) : "—"));
    var act=el("td");
    if(seesAll() && d.rows.length){
      act.appendChild(mkBtn(OPENWS===d.wsId?"Close ▴":"See the work","edit",function(){
        OPENWS = (OPENWS===d.wsId) ? null : d.wsId;
        ROWS = d.rows;
        draw(false);
      }));
    } else act.appendChild(el("span","muted","—"));
    tr.appendChild(act);
    t.appendChild(tr);
  });
  c.appendChild(t);
  if(!any) c.appendChild(el("p","muted","Nothing yet."));
  if(!seesAll()) c.appendChild(el("p","muted",
    "Your tutor has set this account to activity only, so the answers aren't shown here."));
  return c;
}

function entriesCard(){
  var w=WS[OPENWS]||{};
  var cols=(w.cols||[]).map(function(x){ return x.name||x; });
  var c=el("div","card");
  var head=el("div","cardhead");
  head.appendChild(el("h2",null,(w.title||OPENWS)+" — every entry"));
  var ctr=el("div","ctrls");
  ctr.appendChild(mkBtn("Close ▴","close",function(){ OPENWS=null; draw(false); }));
  head.appendChild(ctr); c.appendChild(head);

  var t=el("table"); t.style.marginTop="8px";
  var hr=document.createElement("tr");
  hr.appendChild(el("th",null,"When"));
  cols.forEach(function(n){ hr.appendChild(el("th",null,n)); });
  hr.appendChild(el("th",null,"Tutor's comment"));
  t.appendChild(hr);
  ROWS.forEach(function(r){
    var tr=document.createElement("tr");
    tr.appendChild(el("td","muted", r.ms ? ptStamp(new Date(r.ms)) : "—"));
    cols.forEach(function(n,i){
      tr.appendChild(el("td",null, r["c"+(i+1)] !== undefined ? String(r["c"+(i+1)]) : (r[n]||"")));
    });
    tr.appendChild(el("td", r.comment?null:"muted", r.comment || "—"));
    t.appendChild(tr);
  });
  c.appendChild(t);
  return c;
}
