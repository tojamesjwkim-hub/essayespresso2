// ============================================================
//  dashboard.js — teacher dashboard logic.
//
//  DATA MODEL (Firestore collections):
//   site/config                     → home page + shared settings
//   teacher/profile                 → teacher name, photo, stamps, bg
//   students/{uid}                  → {email,name,photo,status,bg}
//   students/{uid}/assignments/{wsId} → {order, done, doneAt}
//   worksheets/{wsId}               → {title, slideshow, instructions,
//                                       allowPhotos, questions:[...], order}
//     questions[]: {label, type, text, options:[], correct, link}
//        type = "typed" | "mc" | "blank" | "task"
//   students/{uid}/answers/{wsId}/attempts/{attemptId}
//                                   → {name, createdAt, responses:{qIndex:val},
//                                       photo, status, comments:{qIndex:txt}}
//   boxes/{boxId}                   → {title, text, order, audience:"all"|"some",
//                                       students:[uid], items:[{label,url,type}]}
// ============================================================

var teacherRef = db.collection("teacher").doc("profile");
var wsCol = db.collection("worksheets");
var boxesCol = db.collection("boxes");
var studentsCol = db.collection("students");

var TEACHER = null;          // firebase user
var teacherProfile = {};     // cached profile
var siteSettings = {};       // cached site config
var studentsCache = [];      // [{uid, ...data}]
var worksheetsCache = [];    // [{id, ...data}]

// ---- boot ----
requireRole("teacher", function (user) {
  TEACHER = user;
  $("whoEmail").textContent = user.email;
  wireTabs();
  loadSite().then(function (s) { siteSettings = s; });
  loadTeacherProfile();
  loadStudents();
  loadWorksheets();
  loadBoxes();
  wireProfileTab();
  wireAppearance();
  wireWorksheetTab();
  wireAssignTab();
  wireAnswersTab();
  wireBoxesTab();
});

$("logoutLink").onclick = function (e) { e.preventDefault(); logout(); };

// ============================================================
//  PROFILE
// ============================================================
function loadTeacherProfile() {
  teacherRef.get().then(function (snap) {
    teacherProfile = snap.exists ? snap.data() : {};
    $("pName").value = teacherProfile.name || "Jim";
    $("whoName").textContent = teacherProfile.name || "Jim";
    $("pPhoto").value = teacherProfile.photo || "";
    $("goodUrl").value = teacherProfile.goodStamp || "";
    $("ngUrl").value = teacherProfile.ngStamp || "";
    applyBackground(teacherProfile.bg || "");
  });
}

function wireProfileTab() {
  wireImageUpload("pPhotoUpload", "pPhotoFile", "pPhoto", 240);
  wireImageUpload("goodUpload", "goodFile", "goodUrl", 200);
  wireImageUpload("ngUpload", "ngFile", "ngUrl", 200);

  $("saveProfileBtn").onclick = function () {
    var p = {
      name: $("pName").value.trim() || "Jim",
      photo: $("pPhoto").value.trim(),
      goodStamp: $("goodUrl").value.trim(),
      ngStamp: $("ngUrl").value.trim(),
      bg: teacherProfile.bg || "",
    };
    teacherRef.set(p, { merge: true }).then(function () {
      teacherProfile = Object.assign(teacherProfile, p);
      $("whoName").textContent = p.name;
      $("profileSaved").textContent = "Saved ✓";
      setTimeout(function () { $("profileSaved").textContent = ""; }, 2000);
    });
  };

  $("exportAllBtn").onclick = exportAllData;
}

// ============================================================
//  APPEARANCE (teacher's own bg, stored on teacher profile)
// ============================================================
function wireAppearance() {
  $("apperanceBtn").onclick = function () {
    renderSwatches("apSwatches", "apBg");
    $("apBg").value = teacherProfile.bg || "";
    $("appearancePanel").classList.remove("hidden");
    $("appearancePanel").scrollIntoView({ behavior: "smooth" });
  };
  $("apCancel").onclick = function () { $("appearancePanel").classList.add("hidden"); };
  $("apSave").onclick = function () {
    var bg = $("apBg").value.trim();
    teacherRef.set({ bg: bg }, { merge: true }).then(function () {
      teacherProfile.bg = bg;
      applyBackground(bg);
      $("appearancePanel").classList.add("hidden");
    });
  };
}

// ============================================================
//  STUDENTS  (approve / remove / view-as)
// ============================================================
function loadStudents() {
  studentsCol.orderBy("createdAt", "desc").onSnapshot(function (snap) {
    studentsCache = [];
    snap.forEach(function (d) { studentsCache.push(Object.assign({ uid: d.id }, d.data())); });
    renderStudents();
    fillStudentDropdowns();
  }, function () {
    $("pendingList").innerHTML = '<p class="muted">Could not load students (check Firestore rules).</p>';
  });
}

function renderStudents() {
  var pending = studentsCache.filter(function (s) { return s.status !== "approved"; });
  var approved = studentsCache.filter(function (s) { return s.status === "approved"; });

  $("pendingList").innerHTML = pending.length ? "" : '<p class="muted">Nobody waiting.</p>';
  pending.forEach(function (s) {
    var el = document.createElement("div");
    el.className = "row";
    el.innerHTML =
      '<div class="left"><span class="avatar">' + avatarInner(s) + '</span> <strong>' + esc(s.email) + '</strong></div>';
    var ap = mkBtn("Approve", "primary", function () { setStatus(s.uid, "approved"); });
    var rm = mkBtn("Remove", "", function () { if (confirm("Remove " + s.email + "?")) removeStudent(s.uid); });
    el.appendChild(ap); el.appendChild(rm);
    $("pendingList").appendChild(el);
  });

  $("approvedList").innerHTML = approved.length ? "" : '<p class="muted">No approved students yet.</p>';
  approved.forEach(function (s) {
    var el = document.createElement("div");
    el.className = "row";
    el.innerHTML =
      '<div class="left"><span class="avatar">' + avatarInner(s) + '</span> <strong>' + esc(s.name || s.email) +
      '</strong> <span class="muted">(' + esc(s.email) + ')</span> <span class="pill">active</span></div>';
    var view = mkBtn("👁 View as", "", function () { window.location.href = "student.html?as=" + s.uid; });
    var rm = mkBtn("Remove access", "", function () { if (confirm("Remove access for " + (s.name||s.email) + "?")) setStatus(s.uid, "pending"); });
    el.appendChild(view); el.appendChild(rm);
    $("approvedList").appendChild(el);
  });
}

function avatarInner(s) {
  if (s.photo) return '<img src="' + esc(s.photo) + '" alt="">';
  return esc((s.name || s.email || "?").charAt(0).toUpperCase());
}
function setStatus(uid, status) { studentsCol.doc(uid).set({ status: status }, { merge: true }); }
function removeStudent(uid) { studentsCol.doc(uid).delete(); }

function fillStudentDropdowns() {
  var approved = studentsCache.filter(function (s) { return s.status === "approved"; });
  var sel = $("assignStudent");
  var cur = sel.value;
  sel.innerHTML = '<option value="">— pick a student —</option>';
  approved.forEach(function (s) {
    sel.innerHTML += '<option value="' + s.uid + '">' + esc(s.name || s.email) + ' (' + esc(s.email) + ')</option>';
  });
  if (cur) sel.value = cur;

  var af = $("ansStuFilter");
  var acur = af.value;
  af.innerHTML = '<option value="">All students</option>';
  approved.forEach(function (s) { af.innerHTML += '<option value="' + s.uid + '">' + esc(s.name || s.email) + '</option>'; });
  if (acur) af.value = acur;
}

// ============================================================
//  WORKSHEETS  (create / rename / edit / delete / import / export)
// ============================================================
function loadWorksheets() {
  wsCol.orderBy("order", "asc").onSnapshot(function (snap) {
    worksheetsCache = [];
    snap.forEach(function (d) { worksheetsCache.push(Object.assign({ id: d.id }, d.data())); });
    renderWorksheets();
    fillWorksheetDropdowns();
  }, function () {
    $("wsList").innerHTML = '<p class="muted">Could not load worksheets (check Firestore rules).</p>';
  });
}

function renderWorksheets() {
  var box = $("wsList");
  box.innerHTML = worksheetsCache.length ? "" : '<p class="muted">No worksheets yet. Create one above.</p>';
  worksheetsCache.forEach(function (w) {
    var el = document.createElement("div");
    el.className = "row";
    var qn = (w.questions || []).length;
    el.innerHTML = '<div class="left"><strong>' + esc(w.title) + '</strong> <span class="muted">· ' + qn + ' question' + (qn===1?"":"s") + '</span></div>';
    el.appendChild(mkBtn("Edit", "", function () { window.location.href = "editor.html?id=" + w.id; }));
    el.appendChild(mkBtn("Rename", "", function () { renameWs(w); }));
    el.appendChild(mkBtn("Delete", "", function () { if (confirm('Delete "' + w.title + '"? This cannot be undone.')) wsCol.doc(w.id).delete(); }));
    box.appendChild(el);
  });
}

function renameWs(w) {
  var t = prompt("New title:", w.title);
  if (t && t.trim()) wsCol.doc(w.id).set({ title: t.trim() }, { merge: true });
}

function wireWorksheetTab() {
  $("createWsBtn").onclick = function () {
    var t = $("newWsTitle").value.trim();
    if (!t) { alert("Give the worksheet a title first."); return; }
    var order = worksheetsCache.length;
    wsCol.add({
      title: t, slideshow: "", instructions: "", allowPhotos: true,
      questions: [], order: order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function (ref) { window.location.href = "editor.html?id=" + ref.id; });
  };

  $("exportWsBtn").onclick = function () {
    downloadJSON({ type: "worksheets", worksheets: worksheetsCache }, "worksheets.json");
  };

  $("importWsBtn").onclick = function () { $("importWsFile").click(); };
  $("importWsFile").onchange = function () {
    var f = $("importWsFile").files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var list = data.worksheets || (Array.isArray(data) ? data : []);
        if (!list.length) { alert("No worksheets found in that file."); return; }
        var batch = db.batch();
        list.forEach(function (w, i) {
          var ref = wsCol.doc();
          batch.set(ref, {
            title: w.title || "Imported worksheet",
            slideshow: w.slideshow || "",
            instructions: w.instructions || "",
            allowPhotos: w.allowPhotos !== false,
            questions: w.questions || [],
            order: worksheetsCache.length + i,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        batch.commit().then(function () { alert("Imported " + list.length + " worksheet(s)."); });
      } catch (err) { alert("Could not read that file: " + err.message); }
    };
    reader.readAsText(f);
  };
}

function fillWorksheetDropdowns() {
  var af = $("ansWsFilter"); var cur = af.value;
  af.innerHTML = '<option value="">All worksheets</option>';
  worksheetsCache.forEach(function (w) { af.innerHTML += '<option value="' + w.id + '">' + esc(w.title) + '</option>'; });
  if (cur) af.value = cur;
}

// ============================================================
//  ASSIGN
// ============================================================
function wireAssignTab() {
  $("assignStudent").onchange = function () {
    var uid = $("assignStudent").value;
    if (!uid) { $("assignArea").innerHTML = '<p class="muted">Pick a student above.</p>'; return; }
    renderAssignments(uid);
  };
}

function renderAssignments(uid) {
  var area = $("assignArea");
  area.innerHTML = '<p class="muted">Loading…</p>';
  studentsCol.doc(uid).collection("assignments").get().then(function (snap) {
    var assigned = [];
    snap.forEach(function (d) { assigned.push(Object.assign({ wsId: d.id }, d.data())); });
    assigned.sort(function (a, b) { return (a.order||0) - (b.order||0); });

    area.innerHTML = "";
    var box = document.createElement("div");
    box.className = "card fill";

    if (!assigned.length) {
      box.innerHTML = '<p class="muted">No worksheets assigned yet.</p>';
    } else {
      assigned.forEach(function (a, idx) {
        var w = worksheetsCache.filter(function (x) { return x.id === a.wsId; })[0];
        var title = w ? w.title : "(deleted worksheet)";
        var row = document.createElement("div");
        row.className = "row";
        var doneTxt = a.done ? '<span class="pill">DONE ✓ ' + esc(fmtTime(a.doneAt)) + '</span>' : '<span class="muted">not done</span>';
        row.innerHTML = '<div class="left"><strong>' + esc(title) + '</strong> ' + doneTxt + '</div>';
        var up = mkBtn("▲", "arrow", function () { moveAssignment(uid, assigned, idx, -1); });
        var dn = mkBtn("▼", "arrow", function () { moveAssignment(uid, assigned, idx, 1); });
        if (a.done) row.appendChild(mkBtn("Reset done", "", function () {
          studentsCol.doc(uid).collection("assignments").doc(a.wsId).set({ done: false, doneAt: null }, { merge: true }).then(function(){ renderAssignments(uid); });
        }));
        row.appendChild(up); row.appendChild(dn);
        row.appendChild(mkBtn("Unassign", "", function () {
          studentsCol.doc(uid).collection("assignments").doc(a.wsId).delete().then(function () { renderAssignments(uid); });
        }));
        box.appendChild(row);
      });
    }

    // add-worksheet control
    var unassigned = worksheetsCache.filter(function (w) {
      return !assigned.some(function (a) { return a.wsId === w.id; });
    });
    var addWrap = document.createElement("div");
    addWrap.style.cssText = "display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;";
    var sel = document.createElement("select");
    sel.style.flex = "1";
    sel.innerHTML = '<option value="">+ Add a worksheet…</option>' +
      unassigned.map(function (w) { return '<option value="' + w.id + '">' + esc(w.title) + '</option>'; }).join("");
    var addBtn = mkBtn("Add", "primary", function () {
      if (!sel.value) return;
      studentsCol.doc(uid).collection("assignments").doc(sel.value).set({
        order: assigned.length, done: false, doneAt: null
      }).then(function () { renderAssignments(uid); });
    });
    addWrap.appendChild(sel); addWrap.appendChild(addBtn);
    box.appendChild(addWrap);
    area.appendChild(box);
  });
}

function moveAssignment(uid, assigned, idx, dir) {
  var j = idx + dir;
  if (j < 0 || j >= assigned.length) return;
  var a = assigned[idx], b = assigned[j];
  var batch = db.batch();
  batch.set(studentsCol.doc(uid).collection("assignments").doc(a.wsId), { order: j }, { merge: true });
  batch.set(studentsCol.doc(uid).collection("assignments").doc(b.wsId), { order: idx }, { merge: true });
  batch.commit().then(function () { renderAssignments(uid); });
}

// ============================================================
//  ANSWERS
// ============================================================
function wireAnswersTab() {
  $("ansRefresh").onclick = loadAnswers;
}

function loadAnswers() {
  var wsFilter = $("ansWsFilter").value;
  var stuFilter = $("ansStuFilter").value;
  var list = $("answersList");
  list.innerHTML = '<p class="muted">Loading…</p>';

  var students = studentsCache.filter(function (s) {
    return s.status === "approved" && (!stuFilter || s.uid === stuFilter);
  });
  var worksheets = worksheetsCache.filter(function (w) { return !wsFilter || w.id === wsFilter; });

  var tasks = [];
  students.forEach(function (s) {
    worksheets.forEach(function (w) {
      tasks.push(
        studentsCol.doc(s.uid).collection("answers").doc(w.id).collection("attempts")
          .orderBy("createdAt", "asc").get().then(function (snap) {
            var attempts = [];
            snap.forEach(function (d) { attempts.push(Object.assign({ id: d.id }, d.data())); });
            return { student: s, ws: w, attempts: attempts };
          })
      );
    });
  });

  Promise.all(tasks).then(function (results) {
    results = results.filter(function (r) { return r.attempts.length; });
    if (!results.length) { list.innerHTML = '<p class="muted">No submitted attempts match those filters.</p>'; return; }
    list.innerHTML = "";
    results.forEach(function (r) {
      r.attempts.forEach(function (att) {
        list.appendChild(renderAttemptCard(r.student, r.ws, att));
      });
    });
  });
}

function renderAttemptCard(student, ws, att) {
  var card = document.createElement("div");
  card.className = "card";
  var head = document.createElement("div");
  head.className = "muted";
  head.style.marginBottom = "8px";
  head.innerHTML = '<span class="avatar" style="width:20px;height:20px;font-size:0.7rem;">' + avatarInner(student) +
    '</span> <strong>' + esc(student.name || student.email) + '</strong> · ' + esc(ws.title) + ' · ';
  var nameInput = document.createElement("input");
  nameInput.type = "text"; nameInput.value = att.name || "Attempt";
  nameInput.style.width = "120px";
  head.appendChild(nameInput);
  card.appendChild(head);

  var responses = att.responses || {};
  var comments = att.comments || {};
  (ws.questions || []).forEach(function (q, i) {
    var qEl = document.createElement("div");
    qEl.style.marginBottom = "10px";
    var label = q.label || ("Question " + (i + 1));
    qEl.innerHTML = '<p style="font-weight:bold;margin:0 0 2px;">' + esc(label) + '. ' + esc(q.text || "") + '</p>';
    if (q.type !== "task") {
      var ta = document.createElement("textarea");
      ta.value = responses[i] != null ? responses[i] : "";
      ta.style.minHeight = "40px";
      ta.dataset.qi = i;
      ta.className = "resp";
      qEl.appendChild(ta);
    } else {
      qEl.innerHTML += '<p class="muted">(task — nothing to submit)</p>';
    }
    var cm = document.createElement("input");
    cm.type = "text"; cm.placeholder = "Teacher comment (student sees this)";
    cm.value = comments[i] || "";
    cm.dataset.qi = i; cm.className = "cmt";
    cm.style.marginTop = "4px";
    qEl.appendChild(cm);
    card.appendChild(qEl);
  });

  if (att.photo) {
    var ph = document.createElement("p");
    ph.className = "muted";
    ph.innerHTML = '📷 photo attached:';
    var img = document.createElement("img");
    img.src = att.photo; img.style.cssText = "display:block;max-width:220px;border:1px solid #000;margin-top:4px;";
    card.appendChild(ph); card.appendChild(img);
  }

  var mark = document.createElement("div");
  mark.style.margin = "8px 0";
  mark.innerHTML = 'Mark: ';
  var ngBtn = mkBtn("Try again ✗", att.status === "ng" ? "ng" : "", function () { setMark("ng"); });
  var goodBtn = mkBtn("Good job ✓", att.status === "good" ? "good" : "", function () { setMark("good"); });
  mark.appendChild(ngBtn); mark.appendChild(goodBtn);
  card.appendChild(mark);

  var curStatus = att.status || "";
  function setMark(v) {
    curStatus = v;
    ngBtn.className = v === "ng" ? "ng" : "";
    goodBtn.className = v === "good" ? "good" : "";
  }

  var saveBtn = mkBtn("Save", "primary", function () {
    var newResp = Object.assign({}, responses);
    card.querySelectorAll(".resp").forEach(function (ta) { newResp[ta.dataset.qi] = ta.value; });
    var newCmt = {};
    card.querySelectorAll(".cmt").forEach(function (c) { if (c.value.trim()) newCmt[c.dataset.qi] = c.value.trim(); });
    studentsCol.doc(student.uid).collection("answers").doc(ws.id).collection("attempts").doc(att.id)
      .set({ name: nameInput.value.trim() || "Attempt", responses: newResp, comments: newCmt, status: curStatus }, { merge: true })
      .then(function () { saveBtn.textContent = "Saved ✓"; setTimeout(function(){ saveBtn.textContent = "Save"; }, 1500); });
  });
  var delBtn = mkBtn("Delete attempt", "", function () {
    if (confirm("Delete this attempt?"))
      studentsCol.doc(student.uid).collection("answers").doc(ws.id).collection("attempts").doc(att.id).delete().then(loadAnswers);
  });
  card.appendChild(saveBtn); card.appendChild(delBtn);
  return card;
}

// ============================================================
//  STUDENT BOXES
// ============================================================
function loadBoxes() {
  boxesCol.orderBy("order", "asc").onSnapshot(function (snap) {
    var boxes = [];
    snap.forEach(function (d) { boxes.push(Object.assign({ id: d.id }, d.data())); });
    renderBoxes(boxes);
  }, function () { $("boxesList").innerHTML = '<p class="muted">Could not load boxes.</p>'; });
}

function wireBoxesTab() {
  $("createBoxBtn").onclick = function () {
    var t = $("newBoxTitle").value.trim();
    if (!t) { alert("Give the box a title."); return; }
    boxesCol.add({ title: t, text: "", order: Date.now(), audience: "all", students: [], items: [] })
      .then(function () { $("newBoxTitle").value = ""; });
  };
}

function renderBoxes(boxes) {
  var box = $("boxesList");
  box.innerHTML = boxes.length ? "" : '<p class="muted">No boxes yet.</p>';
  boxes.forEach(function (b, idx) {
    var el = document.createElement("div");
    el.className = "card";
    var titleIn = inputEl(b.title, "Box title");
    var textIn = document.createElement("textarea");
    textIn.value = b.text || ""; textIn.placeholder = "Text (optional)"; textIn.style.minHeight = "40px";

    el.innerHTML = '<div style="display:flex;gap:6px;margin-bottom:8px;"></div>';
    var ctrls = el.firstChild;
    ctrls.appendChild(mkBtn("▲","arrow", function(){ moveBox(boxes, idx, -1); }));
    ctrls.appendChild(mkBtn("▼","arrow", function(){ moveBox(boxes, idx, 1); }));
    var strong = document.createElement("strong"); strong.style.alignSelf="center"; strong.textContent = "Box";
    ctrls.appendChild(strong);

    el.appendChild(labeled("Title", titleIn));
    el.appendChild(labeled("Text", textIn));

    // audience
    var aud = document.createElement("div");
    aud.style.margin = "6px 0";
    var audAll = 'audience_' + b.id;
    aud.innerHTML = 'Show to: ' +
      '<label><input type="radio" name="' + audAll + '" value="all" ' + (b.audience !== "some" ? "checked" : "") + '> All students</label> ' +
      '<label><input type="radio" name="' + audAll + '" value="some" ' + (b.audience === "some" ? "checked" : "") + '> Specific</label>';
    el.appendChild(aud);

    var studentPick = document.createElement("div");
    studentPick.style.margin = "4px 0";
    function renderStudentPick() {
      var isSome = el.querySelector('input[name="' + audAll + '"]:checked').value === "some";
      studentPick.style.display = isSome ? "block" : "none";
      if (!isSome) { studentPick.innerHTML = ""; return; }
      var chosen = b.students || [];
      studentPick.innerHTML = '<p class="muted" style="margin:2px 0;">Tick who sees it:</p>';
      studentsCache.filter(function(s){return s.status==="approved";}).forEach(function (s) {
        var lab = document.createElement("label");
        lab.style.marginRight = "10px";
        lab.innerHTML = '<input type="checkbox" value="' + s.uid + '" ' + (chosen.indexOf(s.uid)>=0?"checked":"") + '> ' + esc(s.name||s.email);
        studentPick.appendChild(lab);
      });
    }
    aud.querySelectorAll('input[type=radio]').forEach(function(r){ r.onchange = renderStudentPick; });
    renderStudentPick();
    el.appendChild(studentPick);

    // items
    var itemsWrap = document.createElement("div");
    itemsWrap.innerHTML = '<p class="muted" style="margin:8px 0 2px;">Items — each a link OR embedded doc:</p>';
    var items = (b.items || []).slice();
    function renderItems() {
      itemsWrap.querySelectorAll(".itemrow").forEach(function(n){ n.remove(); });
      items.forEach(function (it, ii) {
        var r = document.createElement("div");
        r.className = "row itemrow"; r.style.padding = "5px 8px";
        var lab = inputEl(it.label, "Label"); lab.classList.add("il"); lab.dataset.ii = ii; lab.style.flex="1";
        var url = inputEl(it.url, "https://…"); url.classList.add("iu"); url.dataset.ii = ii; url.style.flex="1";
        var typ = document.createElement("select"); typ.className="it"; typ.dataset.ii = ii;
        typ.innerHTML = '<option value="link"' + (it.type!=="embed"?" selected":"") + '>Link</option><option value="embed"' + (it.type==="embed"?" selected":"") + '>Embed doc</option>';
        r.appendChild(lab); r.appendChild(url); r.appendChild(typ);
        r.appendChild(mkBtn("✕","", function(){ items.splice(ii,1); renderItems(); }));
        itemsWrap.appendChild(r);
      });
    }
    renderItems();
    var addItem = mkBtn("+ Add item", "", function () {
      // capture current field values before re-render
      syncItems();
      items.push({ label:"", url:"", type:"link" }); renderItems();
    });
    itemsWrap.appendChild(addItem);
    el.appendChild(itemsWrap);

    function syncItems() {
      itemsWrap.querySelectorAll(".il").forEach(function(n){ items[n.dataset.ii].label = n.value; });
      itemsWrap.querySelectorAll(".iu").forEach(function(n){ items[n.dataset.ii].url = n.value; });
      itemsWrap.querySelectorAll(".it").forEach(function(n){ items[n.dataset.ii].type = n.value; });
    }

    var actions = document.createElement("div");
    actions.style.marginTop = "10px";
    actions.appendChild(mkBtn("Save box", "primary", function () {
      syncItems();
      var audience = el.querySelector('input[name="' + audAll + '"]:checked').value;
      var chosen = [];
      studentPick.querySelectorAll('input[type=checkbox]:checked').forEach(function(c){ chosen.push(c.value); });
      boxesCol.doc(b.id).set({
        title: titleIn.value.trim(), text: textIn.value,
        audience: audience, students: chosen, items: items
      }, { merge: true }).then(function () {
        actions.querySelector(".savemsg").textContent = "Saved ✓";
        setTimeout(function(){ actions.querySelector(".savemsg").textContent=""; }, 1500);
      });
    }));
    actions.appendChild(mkBtn("Delete box", "", function () {
      if (confirm('Delete box "' + b.title + '"?')) boxesCol.doc(b.id).delete();
    }));
    var msg = document.createElement("span"); msg.className="savemsg muted"; msg.style.marginLeft="8px";
    actions.appendChild(msg);
    el.appendChild(actions);

    box.appendChild(el);
  });
}

function moveBox(boxes, idx, dir) {
  var j = idx + dir; if (j<0 || j>=boxes.length) return;
  var a = boxes[idx], b = boxes[j];
  var batch = db.batch();
  batch.set(boxesCol.doc(a.id), { order: b.order }, { merge: true });
  batch.set(boxesCol.doc(b.id), { order: a.order }, { merge: true });
  batch.commit();
}

// ============================================================
//  EXPORT ALL (backup)
// ============================================================
function exportAllData() {
  $("exportAllBtn").textContent = "Gathering…";
  var out = { type: "essay-espresso-backup", exportedAt: new Date().toISOString(),
              site: siteSettings, teacher: teacherProfile,
              worksheets: worksheetsCache, boxes: [], students: [] };

  boxesCol.get().then(function (bsnap) {
    bsnap.forEach(function (d) { out.boxes.push(Object.assign({ id: d.id }, d.data())); });
    return studentsCol.get();
  }).then(function (ssnap) {
    var studentTasks = [];
    ssnap.forEach(function (sdoc) {
      var s = Object.assign({ uid: sdoc.id }, sdoc.data());
      s.assignments = []; s.answers = {};
      var p = studentsCol.doc(sdoc.id).collection("assignments").get().then(function (asnap) {
        asnap.forEach(function (a) { s.assignments.push(Object.assign({ wsId: a.id }, a.data())); });
        // answers per worksheet
        var ansTasks = worksheetsCache.map(function (w) {
          return studentsCol.doc(sdoc.id).collection("answers").doc(w.id).collection("attempts").get().then(function (att) {
            if (!att.empty) {
              s.answers[w.id] = [];
              att.forEach(function (x) { s.answers[w.id].push(Object.assign({ id: x.id }, x.data())); });
            }
          });
        });
        return Promise.all(ansTasks);
      });
      studentTasks.push(p.then(function () { out.students.push(s); }));
    });
    return Promise.all(studentTasks);
  }).then(function () {
    downloadJSON(out, "essay-espresso-backup-" + new Date().toISOString().slice(0,10) + ".json");
    $("exportAllBtn").textContent = "⬇ Export ALL data (backup)";
  }).catch(function (e) {
    alert("Export ran into an issue: " + e.message);
    $("exportAllBtn").textContent = "⬇ Export ALL data (backup)";
  });
}

// ============================================================
//  tiny DOM helpers
// ============================================================
function mkBtn(label, cls, onclick) {
  var b = document.createElement("button");
  b.textContent = label; if (cls) b.className = cls; b.onclick = onclick;
  return b;
}
function inputEl(val, ph) {
  var i = document.createElement("input"); i.type = "text";
  i.value = val || ""; if (ph) i.placeholder = ph; return i;
}
function labeled(lbl, node) {
  var wrap = document.createElement("div"); wrap.style.marginBottom = "6px";
  var p = document.createElement("p"); p.className = "muted"; p.style.margin = "6px 0 2px"; p.textContent = lbl;
  wrap.appendChild(p); wrap.appendChild(node); return wrap;
}
