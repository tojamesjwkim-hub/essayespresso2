// ============================================================
//  student.js — the student experience.
//
//  Modes (from URL):
//    (none)         → the logged-in student themselves
//    ?as=<uid>      → teacher viewing a student's dashboard (read-only)
//    ?preview=<wsId>→ teacher previewing one worksheet as a student
// ============================================================

var params = new URLSearchParams(location.search);
var asUid = params.get("as");
var previewWs = params.get("preview");

var studentsCol = db.collection("students");
var wsCol = db.collection("worksheets");
var boxesCol = db.collection("boxes");
var teacherRef = db.collection("teacher").doc("profile");

var ME = null;            // the uid whose dashboard we're showing
var meData = null;        // that student's doc data
var readOnly = false;     // true in view-as / preview
var viewerIsTeacher = false;
var teacherStamps = { good: "", ng: "" };

// ---- boot ----
auth.onAuthStateChanged(function (user) {
  if (!user) { location.href = "index.html"; return; }
  viewerIsTeacher = isTeacher(user);

  loadSite();
  teacherRef.get().then(function (s) {
    if (s.exists) { teacherStamps.good = s.data().goodStamp || ""; teacherStamps.ng = s.data().ngStamp || ""; }
  });

  if (previewWs) {
    if (!viewerIsTeacher) { location.href = "student.html"; return; }
    return bootPreview(user);
  }
  if (asUid) {
    if (!viewerIsTeacher) { location.href = "student.html"; return; }
    readOnly = true;
    return bootViewAs(user, asUid);
  }
  // normal student (or teacher who wandered here → send to dashboard)
  if (viewerIsTeacher) { location.href = "dashboard.html"; return; }
  bootSelf(user);
});

function showViewBar(text) {
  var bar = $("viewBar");
  bar.classList.remove("hidden");
  bar.innerHTML = text + ' <a href="dashboard.html" style="color:#fff; margin-left:8px;">← Back to my dashboard</a>';
}

// ---- boot: normal student ----
function bootSelf(user) {
  ME = user.uid;
  ensureStudentDoc(user).then(function (snap) {
    meData = snap.data();
    if (meData.status !== "approved") { showPending(user); return; }
    startApp();
  });
}

// ---- boot: teacher viewing as a student ----
function bootViewAs(user, uid) {
  ME = uid;
  showViewBar("👁 You are viewing this student's dashboard (read-only).");
  studentsCol.doc(uid).get().then(function (snap) {
    if (!snap.exists) { alert("That student no longer exists."); location.href = "dashboard.html"; return; }
    meData = snap.data();
    startApp();
  });
}

// ---- boot: teacher previewing one worksheet ----
function bootPreview(user) {
  showViewBar("👁 Previewing this worksheet as a student would see it.");
  readOnly = true;
  ME = user.uid;
  meData = { name: "Preview", email: user.email, status: "approved" };
  $("loading").classList.add("hidden");
  $("app").classList.remove("hidden");
  // minimal chrome
  renderMyChrome();
  $("assignedList").innerHTML = "";
  $("boxesArea").innerHTML = "";
  $("exportMineBtn").parentElement.classList.add("hidden");
  wsCol.doc(previewWs).get().then(function (snap) {
    if (!snap.exists) { alert("Worksheet not found."); location.href = "dashboard.html"; return; }
    var w = Object.assign({ id: snap.id }, snap.data());
    openWorksheet(w, /*previewOnly*/ true);
  });
}

// ---- pending screen ----
function showPending(user) {
  $("loading").classList.add("hidden");
  $("pendingScreen").classList.remove("hidden");
  $("pendingEmail").textContent = user.email;
  loadSiteInto("siteTitle", "siteIcon");
  $("pendingLogout").onclick = logout;
}

// ============================================================
//  MAIN APP
// ============================================================
function startApp() {
  $("loading").classList.add("hidden");
  $("app").classList.remove("hidden");
  renderMyChrome();
  applyBackground(meData.bg || "");
  wireProfileAndAppearance();
  loadBoxes();
  loadAssignments();
  $("exportMineBtn").onclick = exportMine;
  if (readOnly) lockForReadOnly();
}

function renderMyChrome() {
  loadSiteInto("siteTitle2", "siteIcon2");
  $("myName").textContent = meData.name || (meData.email || "").split("@")[0];
  $("myEmail").textContent = meData.email || "";
  $("myAvatar").innerHTML = meData.photo ? '<img src="' + esc(meData.photo) + '" alt="">' :
    esc((meData.name || meData.email || "?").charAt(0).toUpperCase());
}

function loadSiteInto(titleId, iconId) {
  siteRef.get().then(function (snap) {
    var s = snap.exists ? snap.data() : {};
    if (s.title && $(titleId)) $(titleId).textContent = s.title;
    if (s.icon && $(iconId)) $(iconId).innerHTML = '<img src="' + esc(s.icon) + '" alt="">';
  });
}

function lockForReadOnly() {
  // disable inputs/buttons within the app area except the back link
  setTimeout(function () {
    $("app").querySelectorAll("button, input, textarea, select").forEach(function (el) {
      if (el.id === "exportMineBtn") return;
      el.disabled = true;
    });
  }, 400);
}

// ============================================================
//  PROFILE + APPEARANCE
// ============================================================
function wireProfileAndAppearance() {
  $("editProfileBtn").onclick = function () {
    $("epName").value = meData.name || "";
    $("epPhoto").value = meData.photo || "";
    togglePanel("profilePanel");
  };
  $("epCancel").onclick = function () { $("profilePanel").classList.add("hidden"); };
  wireImageUpload("epUpload", "epFile", "epPhoto", 240);
  $("epSave").onclick = function () {
    var upd = { name: $("epName").value.trim() || meData.name, photo: $("epPhoto").value.trim() };
    studentsCol.doc(ME).set(upd, { merge: true }).then(function () {
      meData = Object.assign(meData, upd);
      renderMyChrome();
      $("profilePanel").classList.add("hidden");
    });
  };

  $("appearanceBtn").onclick = function () {
    renderSwatches("apSwatches", "apBg");
    $("apBg").value = meData.bg || "";
    togglePanel("appearancePanel");
  };
  $("apCancel").onclick = function () { $("appearancePanel").classList.add("hidden"); };
  $("apSave").onclick = function () {
    var bg = $("apBg").value.trim();
    studentsCol.doc(ME).set({ bg: bg }, { merge: true }).then(function () {
      meData.bg = bg; applyBackground(bg);
      $("appearancePanel").classList.add("hidden");
    });
  };
}

function togglePanel(id) {
  ["profilePanel", "appearancePanel"].forEach(function (p) {
    if (p !== id) $(p).classList.add("hidden");
  });
  $(id).classList.toggle("hidden");
}

// ============================================================
//  CUSTOM BOXES
// ============================================================
function loadBoxes() {
  boxesCol.orderBy("order", "asc").get().then(function (snap) {
    var area = $("boxesArea"); area.innerHTML = "";
    snap.forEach(function (d) {
      var b = d.data();
      var visible = b.audience !== "some" || (b.students || []).indexOf(ME) >= 0;
      if (!visible) return;
      area.appendChild(renderBox(b));
    });
  });
}

function renderBox(b) {
  var card = document.createElement("div");
  card.className = "card";
  card.innerHTML = '<h2 style="margin-top:0;">' + esc(b.title || "") + '</h2>';
  if (b.text) { var p = document.createElement("p"); p.textContent = b.text; card.appendChild(p); }
  (b.items || []).forEach(function (it) {
    if (!it.url) return;
    if (it.type === "embed") {
      var wrap = document.createElement("div");
      wrap.className = "embed";
      var head = document.createElement("div");
      head.className = "embed-head";
      head.innerHTML = '<span>📄 ' + esc(it.label || "Document") + '</span>';
      var toggle = mkBtn("Open ▾", "", function () {
        if (frame.style.display === "none") { frame.style.display = "block"; toggle.textContent = "Close ▴"; }
        else { frame.style.display = "none"; toggle.textContent = "Open ▾"; }
      });
      toggle.style.cssText = "font-size:0.8rem; padding:2px 8px;";
      head.appendChild(toggle);
      var frame = document.createElement("iframe");
      frame.src = toEmbedUrl(it.url);
      frame.style.display = "none";
      wrap.appendChild(head); wrap.appendChild(frame);
      card.appendChild(wrap);
    } else {
      var a = document.createElement("a");
      a.href = it.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = it.label || it.url;
      var line = document.createElement("p"); line.style.margin = "4px 0";
      line.appendChild(a);
      card.appendChild(line);
    }
  });
  return card;
}

// Google Docs / Slides embed: prefer their /preview or published form.
function toEmbedUrl(url) {
  // if it's a normal /edit doc link, swap to /preview
  var m = url.match(/(https:\/\/docs\.google\.com\/[^\/]+\/d\/[^\/]+)/);
  if (m) return m[1] + "/preview";
  return url;
}

// ============================================================
//  ASSIGNED WORKSHEETS (list, one-at-a-time, done tracking)
// ============================================================
function loadAssignments() {
  studentsCol.doc(ME).collection("assignments").get().then(function (snap) {
    var assigned = [];
    snap.forEach(function (d) { assigned.push(Object.assign({ wsId: d.id }, d.data())); });
    assigned.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!assigned.length) { $("assignedList").innerHTML = '<p class="muted">Nothing assigned yet.</p>'; return; }

    // fetch each worksheet's title
    Promise.all(assigned.map(function (a) {
      return wsCol.doc(a.wsId).get().then(function (s) {
        return s.exists ? Object.assign({ id: s.id, assignment: a }, s.data()) : null;
      });
    })).then(function (list) {
      list = list.filter(Boolean);
      renderAssignedList(list);
    });
  });
}

function renderAssignedList(list) {
  var box = $("assignedList"); box.innerHTML = "";
  list.forEach(function (w) {
    var a = w.assignment;
    var row = document.createElement("div");
    row.className = "row";

    var left = document.createElement("div");
    left.className = "left";
    var lab = document.createElement("label"); lab.className = "bigcheck";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!a.done;
    var boxSpan = document.createElement("span"); boxSpan.className = "box"; boxSpan.textContent = a.done ? "✓" : "";
    cb.onchange = function () {
      if (readOnly) { cb.checked = a.done; return; }
      var done = cb.checked;
      boxSpan.textContent = done ? "✓" : "";
      var upd = done
        ? { done: true, doneAt: firebase.firestore.FieldValue.serverTimestamp() }
        : { done: false, doneAt: null };
      studentsCol.doc(ME).collection("assignments").doc(w.id).set(upd, { merge: true }).then(function () {
        a.done = done;
        sub.textContent = done ? "Done — just now" : "not done yet";
      });
    };
    var textSpan = document.createElement("span");
    var sub = document.createElement("span"); sub.className = "muted";
    sub.textContent = a.done ? ("Done — " + fmtTime(a.doneAt)) : "not done yet";
    textSpan.innerHTML = "<strong>" + esc(w.title) + "</strong><br>";
    textSpan.appendChild(sub);
    lab.appendChild(cb); lab.appendChild(boxSpan); lab.appendChild(textSpan);
    left.appendChild(lab);
    row.appendChild(left);

    row.appendChild(mkBtn("Open ▸", "primary", function () {
      openWorksheet(w);
      $("openWorksheet").scrollIntoView({ behavior: "smooth" });
    }));
    box.appendChild(row);
  });
}

// ============================================================
//  DOING A WORKSHEET (attempts, all 4 question types)
// ============================================================
var currentAttempts = [];   // for the open worksheet
var currentAttemptId = null;

function openWorksheet(w, previewOnly) {
  var area = $("openWorksheet");
  area.innerHTML = "";
  var card = document.createElement("div");
  card.className = "card";
  card.innerHTML = '<h2 style="margin-top:0;">' + esc(w.title) + '</h2>';
  if (w.instructions) { var ins = document.createElement("p"); ins.textContent = w.instructions; card.appendChild(ins); }
  if (w.slideshow) {
    var sl = document.createElement("p");
    sl.innerHTML = '<a href="' + esc(w.slideshow) + '" target="_blank" rel="noopener">Open slideshow →</a>';
    card.appendChild(sl);
  }

  var body = document.createElement("div");
  card.appendChild(body);
  area.appendChild(card);

  if (previewOnly) {
    renderAttemptForm(w, body, {}, null, true);
    return;
  }

  // load this student's attempts for this worksheet
  studentsCol.doc(ME).collection("answers").doc(w.id).collection("attempts")
    .orderBy("createdAt", "asc").get().then(function (snap) {
      currentAttempts = [];
      snap.forEach(function (d) { currentAttempts.push(Object.assign({ id: d.id }, d.data())); });
      renderWorksheetBody(w, body);
    });
}

function renderWorksheetBody(w, body) {
  body.innerHTML = "";

  // attempt selector
  var bar = document.createElement("p");
  bar.innerHTML = "Attempt: ";
  var sel = document.createElement("select"); sel.style.width = "auto";
  if (!currentAttempts.length) {
    sel.innerHTML = '<option>Attempt 1 (new)</option>';
  } else {
    currentAttempts.forEach(function (att, i) {
      sel.innerHTML += '<option value="' + att.id + '">' + esc(att.name || ("Attempt " + (i + 1))) + '</option>';
    });
  }
  currentAttemptId = currentAttempts.length ? currentAttempts[currentAttempts.length - 1].id : null;
  sel.value = currentAttemptId || "";
  sel.onchange = function () { currentAttemptId = sel.value; drawAttempt(); };
  bar.appendChild(sel);

  if (!readOnly) {
    var newBtn = mkBtn("Start new attempt", "", function () {
      var name = "Attempt " + (currentAttempts.length + 1);
      studentsCol.doc(ME).collection("answers").doc(w.id).collection("attempts").add({
        name: name, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        responses: {}, comments: {}, status: "", photo: ""
      }).then(function (ref) {
        currentAttempts.push({ id: ref.id, name: name, responses: {}, comments: {}, status: "", photo: "" });
        currentAttemptId = ref.id;
        renderWorksheetBody(w, body);
      });
    });
    newBtn.style.marginLeft = "8px";
    bar.appendChild(newBtn);
  }
  body.appendChild(bar);

  var formArea = document.createElement("div");
  body.appendChild(formArea);

  function drawAttempt() {
    var att = currentAttempts.filter(function (a) { return a.id === currentAttemptId; })[0]
              || { responses: {}, comments: {}, status: "", photo: "" };
    formArea.innerHTML = "";
    renderAttemptForm(w, formArea, att, att.id, false);
  }

  if (!currentAttempts.length) {
    // implicit first attempt — will be created on save
    renderAttemptForm(w, formArea, { responses: {}, comments: {}, status: "", photo: "" }, null, false);
  } else {
    drawAttempt();
  }
}

function renderAttemptForm(w, container, att, attemptId, previewOnly) {
  var responses = att.responses || {};
  var comments = att.comments || {};
  var inputs = [];

  // status stamp (if marked)
  if (att.status === "good" || att.status === "ng") {
    var stampWrap = document.createElement("p");
    var cls = att.status === "good" ? "good" : "ng";
    var label = att.status === "good" ? "Good job ✓" : "Try again ✗";
    var stampImg = att.status === "good" ? teacherStamps.good : teacherStamps.ng;
    stampWrap.innerHTML = '<span class="' + cls + '">' + label + '</span>';
    if (stampImg) stampWrap.innerHTML += ' <img src="' + esc(stampImg) + '" alt="" style="height:40px;vertical-align:middle;">';
    container.appendChild(stampWrap);
  }

  (w.questions || []).forEach(function (q, i) {
    var qWrap = document.createElement("div");
    qWrap.style.marginBottom = "16px";
    var label = q.label || ("Question " + (i + 1));
    var title = document.createElement("p");
    title.style.cssText = "font-weight:bold; margin:0 0 4px;";
    title.textContent = label + ". " + (q.text || "");
    qWrap.appendChild(title);

    if (q.type === "typed" || q.type === "blank") {
      var ta = document.createElement("textarea");
      ta.value = responses[i] != null ? responses[i] : "";
      ta.dataset.qi = i;
      if (previewOnly || readOnly) ta.disabled = true;
      inputs.push(ta); qWrap.appendChild(ta);
    } else if (q.type === "mc") {
      (q.options || []).forEach(function (opt, oi) {
        var lab = document.createElement("label");
        lab.style.display = "block";
        var r = document.createElement("input");
        r.type = "radio"; r.name = "q_" + i + "_" + (attemptId || "new");
        r.value = opt; r.style.width = "auto"; r.style.marginRight = "6px";
        if (responses[i] === opt) r.checked = true;
        if (previewOnly || readOnly) r.disabled = true;
        r.dataset.qi = i;
        lab.appendChild(r); lab.appendChild(document.createTextNode(" " + opt));
        qWrap.appendChild(lab);
        inputs.push(r);
      });
    } else if (q.type === "task") {
      if (q.link) {
        var linkP = document.createElement("p");
        linkP.innerHTML = '<a href="' + esc(q.link) + '" target="_blank" rel="noopener">Open link →</a>';
        qWrap.appendChild(linkP);
      }
      var tn = document.createElement("p"); tn.className = "muted"; tn.textContent = "(check this off in the assignment list when done)";
      qWrap.appendChild(tn);
    }

    // teacher comment (read-only for student)
    if (comments[i]) {
      var cm = document.createElement("div");
      cm.className = "comment";
      cm.innerHTML = "<strong>Tutor:</strong> " + esc(comments[i]);
      qWrap.appendChild(cm);
    }
    container.appendChild(qWrap);
  });

  // photo upload
  if (w.allowPhotos !== false && !previewOnly) {
    var photoWrap = document.createElement("div");
    photoWrap.style.cssText = "border-top:1px solid #ccc; padding-top:12px; margin-bottom:12px;";
    photoWrap.innerHTML = '<p style="font-weight:bold; margin:0 0 6px;">Or upload a photo of your work:</p>';
    var upBtn = document.createElement("button");
    upBtn.textContent = "📷 Upload a photo of my work";
    upBtn.style.fontSize = "1rem"; upBtn.style.padding = "12px 18px";
    var fileIn = document.createElement("input");
    fileIn.type = "file"; fileIn.accept = "image/*"; fileIn.className = "hidden";
    var preview = document.createElement("div");
    if (att.photo) preview.innerHTML = '<img src="' + esc(att.photo) + '" style="max-width:200px;border:1px solid #000;margin-top:6px;">';
    var pendingPhoto = { data: att.photo || "" };
    if (readOnly) upBtn.disabled = true;
    upBtn.onclick = function () { fileIn.click(); };
    fileIn.onchange = function () {
      if (!fileIn.files[0]) return;
      upBtn.textContent = "Shrinking…";
      shrinkImage(fileIn.files[0], 900, function (dataUrl) {
        pendingPhoto.data = dataUrl || "";
        preview.innerHTML = dataUrl ? '<img src="' + dataUrl + '" style="max-width:200px;border:1px solid #000;margin-top:6px;">' : "";
        upBtn.textContent = "📷 Upload a photo of my work";
      });
    };
    photoWrap.appendChild(upBtn); photoWrap.appendChild(fileIn); photoWrap.appendChild(preview);
    container.appendChild(photoWrap);
    container._pendingPhoto = pendingPhoto;
  }

  // save button
  if (!previewOnly && !readOnly) {
    var saveBtn = mkBtn("Save", "primary", function () {
      var resp = {};
      inputs.forEach(function (el) {
        if (el.type === "radio") { if (el.checked) resp[el.dataset.qi] = el.value; }
        else { resp[el.dataset.qi] = el.value; }
      });
      var photo = container._pendingPhoto ? container._pendingPhoto.data : (att.photo || "");
      saveAttempt(w, attemptId, resp, photo, saveBtn);
    });
    var msg = document.createElement("span"); msg.className = "muted"; msg.style.marginLeft = "8px"; msg.id = "attSaved";
    container.appendChild(saveBtn); container.appendChild(msg);
  }
}

function saveAttempt(w, attemptId, responses, photo, btn) {
  var col = studentsCol.doc(ME).collection("answers").doc(w.id).collection("attempts");
  var payload = { responses: responses, photo: photo || "" };
  var p;
  if (attemptId) {
    p = col.doc(attemptId).set(payload, { merge: true });
  } else {
    // first implicit attempt
    payload.name = "Attempt 1";
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.comments = {}; payload.status = "";
    p = col.add(payload);
  }
  p.then(function () {
    if (btn) { btn.textContent = "Saved ✓"; setTimeout(function () { btn.textContent = "Save"; }, 1500); }
    // reload attempts so a new implicit one shows in the selector
    openWorksheet(w);
  }).catch(function (e) { alert("Save failed: " + e.message); });
}

// ============================================================
//  EXPORT MY ANSWERS
// ============================================================
function exportMine() {
  var out = { type: "my-answers", student: meData.email, exportedAt: new Date().toISOString(), worksheets: [] };
  studentsCol.doc(ME).collection("assignments").get().then(function (asnap) {
    var wsIds = []; asnap.forEach(function (d) { wsIds.push(d.id); });
    return Promise.all(wsIds.map(function (wid) {
      return wsCol.doc(wid).get().then(function (ws) {
        return studentsCol.doc(ME).collection("answers").doc(wid).collection("attempts").get().then(function (att) {
          var attempts = []; att.forEach(function (x) { attempts.push(x.data()); });
          out.worksheets.push({ title: ws.exists ? ws.data().title : wid, attempts: attempts });
        });
      });
    }));
  }).then(function () {
    downloadJSON(out, "my-answers.json");
  });
}

// tiny helper
function mkBtn(label, cls, onclick) {
  var b = document.createElement("button");
  b.textContent = label; if (cls) b.className = cls; b.onclick = onclick;
  return b;
}
