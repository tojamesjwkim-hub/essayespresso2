// ============================================================
//  editor.js — create/edit a worksheet.
//  Question shape: {label, type, text, options:[], correct, link}
//    type: "typed" | "mc" | "blank" | "task"
// ============================================================

var wsId = new URLSearchParams(location.search).get("id");
var wsRef = wsId ? db.collection("worksheets").doc(wsId) : null;
var questions = [];   // working copy

requireRole("teacher", function () {
  loadSite();
  if (!wsRef) { alert("No worksheet specified."); location.href = "dashboard.html"; return; }
  wsRef.get().then(function (snap) {
    if (!snap.exists) { alert("That worksheet no longer exists."); location.href = "dashboard.html"; return; }
    var w = snap.data();
    $("pageTitle").textContent = "Edit: " + (w.title || "worksheet");
    $("wsTitle").value = w.title || "";
    $("wsSlideshow").value = w.slideshow || "";
    $("wsInstructions").value = w.instructions || "";
    $("wsAllowPhotos").checked = w.allowPhotos !== false;
    questions = (w.questions || []).map(normalizeQ);
    $("loading").classList.add("hidden");
    $("editArea").classList.remove("hidden");
    renderQuestions();
    wireButtons();
  });
});

function normalizeQ(q) {
  return {
    label: q.label || "",
    type: q.type || "typed",
    text: q.text || "",
    options: q.options || [],
    correct: (q.correct == null ? -1 : q.correct),
    link: q.link || ""
  };
}

var TYPES = [
  { v: "typed", label: "Typed answer" },
  { v: "mc",    label: "Multiple choice" },
  { v: "blank", label: "Fill in the blank" },
  { v: "task",  label: "Task (just check off)" },
];

function renderQuestions() {
  var box = $("questions");
  box.innerHTML = "";
  if (!questions.length) {
    box.innerHTML = '<p class="muted">No questions yet. Click "+ Add question" below.</p>';
  }
  questions.forEach(function (q, i) {
    box.appendChild(renderQCard(q, i));
  });
}

function renderQCard(q, i) {
  var card = document.createElement("div");
  card.className = "card fill";

  // header: editable label + reorder/delete
  var head = document.createElement("div");
  head.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;";
  var labelWrap = document.createElement("div");
  labelWrap.style.flex = "1";
  var labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = q.label || ("Question " + (i + 1));
  labelInput.placeholder = "Question " + (i + 1);
  labelInput.style.cssText = "font-weight:bold; max-width:280px;";
  labelInput.oninput = function () { q.label = labelInput.value; };
  labelWrap.appendChild(labelInput);
  var lm = document.createElement("span"); lm.className = "muted"; lm.textContent = " ✎ rename (blank = auto-number)";
  labelWrap.appendChild(lm);
  head.appendChild(labelWrap);

  var ctrls = document.createElement("div");
  ctrls.appendChild(mkBtn("▲", "arrow", function () { moveQ(i, -1); }));
  ctrls.appendChild(mkBtn("▼", "arrow", function () { moveQ(i, 1); }));
  ctrls.appendChild(mkBtn("Delete", "", function () { questions.splice(i, 1); renderQuestions(); }));
  head.appendChild(ctrls);
  card.appendChild(head);

  // type picker
  var picker = document.createElement("div");
  picker.style.cssText = "display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;";
  TYPES.forEach(function (t) {
    var lab = document.createElement("label");
    lab.style.cssText = "border:1px solid #000; padding:4px 9px; font-size:0.85rem;";
    var radio = document.createElement("input");
    radio.type = "radio"; radio.name = "type_" + i; radio.value = t.v;
    radio.checked = q.type === t.v;
    radio.style.marginRight = "5px";
    radio.onchange = function () { q.type = t.v; renderQuestions(); };
    lab.appendChild(radio); lab.appendChild(document.createTextNode(t.label));
    picker.appendChild(lab);
  });
  card.appendChild(picker);

  // question text
  var textInput = document.createElement("input");
  textInput.type = "text";
  textInput.value = q.text || "";
  textInput.placeholder = q.type === "task" ? "What should they do? e.g. 'Watch the video and think about the ending.'" : "Question text";
  textInput.oninput = function () { q.text = textInput.value; };
  card.appendChild(textInput);

  // type-specific extras
  if (q.type === "mc") {
    card.appendChild(renderMCOptions(q, i));
  } else if (q.type === "blank") {
    var hint = document.createElement("p");
    hint.className = "muted"; hint.style.marginTop = "6px";
    hint.textContent = "Use ___ where the blank goes. Student types the missing word.";
    card.appendChild(hint);
  } else if (q.type === "task") {
    var linkWrap = document.createElement("div");
    linkWrap.style.marginTop = "8px";
    var ll = document.createElement("label");
    ll.style.cssText = "font-weight:bold; font-size:0.85rem;";
    ll.textContent = "Optional link (student clicks it directly):";
    var linkInput = document.createElement("input");
    linkInput.type = "url"; linkInput.value = q.link || "";
    linkInput.placeholder = "https://youtu.be/… or a Google Doc";
    linkInput.style.marginTop = "3px";
    linkInput.oninput = function () { q.link = linkInput.value; };
    linkWrap.appendChild(ll); linkWrap.appendChild(linkInput);
    card.appendChild(linkWrap);
    var tn = document.createElement("p");
    tn.className = "muted"; tn.style.marginTop = "6px";
    tn.textContent = "Nothing to submit — student clicks the link and checks it off.";
    card.appendChild(tn);
  } else {
    var typedNote = document.createElement("p");
    typedNote.className = "muted"; typedNote.style.marginTop = "6px";
    typedNote.textContent = "Student gets a text box to type into.";
    card.appendChild(typedNote);
  }

  return card;
}

function renderMCOptions(q, i) {
  var wrap = document.createElement("div");
  wrap.style.marginTop = "8px";
  var note = document.createElement("p");
  note.className = "muted"; note.style.margin = "0 0 6px";
  note.textContent = "Options (tick the correct one — optional; leave unticked to grade by hand):";
  wrap.appendChild(note);

  (q.options || []).forEach(function (opt, oi) {
    var row = document.createElement("div");
    row.style.cssText = "display:flex; gap:6px; align-items:center; margin-bottom:5px;";
    var radio = document.createElement("input");
    radio.type = "radio"; radio.name = "correct_" + i; radio.checked = q.correct === oi;
    radio.style.width = "auto";
    radio.onchange = function () { q.correct = oi; };
    var txt = document.createElement("input");
    txt.type = "text"; txt.value = opt; txt.style.flex = "1";
    txt.oninput = function () { q.options[oi] = txt.value; };
    var del = mkBtn("✕", "", function () {
      q.options.splice(oi, 1);
      if (q.correct === oi) q.correct = -1;
      else if (q.correct > oi) q.correct--;
      renderQuestions();
    });
    row.appendChild(radio); row.appendChild(txt); row.appendChild(del);
    wrap.appendChild(row);
  });

  var add = mkBtn("+ Add option", "", function () {
    q.options = q.options || []; q.options.push(""); renderQuestions();
  });
  wrap.appendChild(add);
  return wrap;
}

function moveQ(i, dir) {
  var j = i + dir;
  if (j < 0 || j >= questions.length) return;
  var tmp = questions[i]; questions[i] = questions[j]; questions[j] = tmp;
  renderQuestions();
}

function wireButtons() {
  $("addQBtn").onclick = function () {
    questions.push(normalizeQ({ type: "typed" }));
    renderQuestions();
    window.scrollTo(0, document.body.scrollHeight);
  };
  $("cancelBtn").onclick = function () { location.href = "dashboard.html"; };
  $("previewBtn").onclick = function () {
    save(function () { location.href = "student.html?preview=" + wsId; });
  };
  $("saveBtn").onclick = function () { save(function () {
    $("savedMsg").textContent = "Saved ✓";
    setTimeout(function () { $("savedMsg").textContent = ""; }, 1800);
  }); };
}

function save(then) {
  var title = $("wsTitle").value.trim();
  if (!title) { alert("Give the worksheet a title."); return; }
  // strip empty options, keep clean copy
  var clean = questions.map(function (q) {
    var out = { label: q.label || "", type: q.type, text: q.text || "" };
    if (q.type === "mc") {
      out.options = (q.options || []).filter(function (o) { return o !== ""; });
      out.correct = (q.correct != null ? q.correct : -1);
    }
    if (q.type === "task") out.link = q.link || "";
    return out;
  });
  wsRef.set({
    title: title,
    slideshow: $("wsSlideshow").value.trim(),
    instructions: $("wsInstructions").value.trim(),
    allowPhotos: $("wsAllowPhotos").checked,
    questions: clean
  }, { merge: true }).then(function () { if (then) then(); })
    .catch(function (e) { alert("Save failed: " + e.message); });
}

// shared tiny helper (dashboard.js has its own copy; editor needs its own)
function mkBtn(label, cls, onclick) {
  var b = document.createElement("button");
  b.textContent = label; if (cls) b.className = cls; b.onclick = onclick;
  return b;
}
