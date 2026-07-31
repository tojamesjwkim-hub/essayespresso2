// ============================================================
//  shared-ui.js — helpers used by more than one page.
// ============================================================

var siteRef = db.collection("site").doc("config");

var SITE_DEFAULTS = {
  title: "EssayEspresso",
  tagline: "A tutoring worksheet space",
  prompt: "Sign in with the Google account your tutor approved.",
  newNote: "New here? Sign in and your tutor will approve you shortly.",
  runner: "This is a version of EssayEspresso used by Jim the Tutor · Questions? tojamesjwkim@gmail.com",
  icon: "",
  bg: ""
};

var PASTELS = ["#eef6ef","#fdf0f5","#eef3fb","#fbf6e9","#f3eefb","#ffffff"];

// Apply a background (pastel hex or faded image url) to the page.
function applyBackground(bg) {
  document.body.classList.remove("has-bgimage");
  document.body.style.background = "";
  document.body.style.removeProperty("--bgimage");
  if (!bg) return;
  if (bg.charAt(0) === "#") {
    document.body.style.background = bg;
  } else {
    document.body.style.setProperty("--bgimage", "url('" + bg + "')");
    document.body.classList.add("has-bgimage");
  }
}

// Render the runner banners + site title/icon from a settings object.
function renderSiteChrome(s) {
  s = Object.assign({}, SITE_DEFAULTS, s || {});
  var r = s.runner || SITE_DEFAULTS.runner;
  if ($("runnerTop")) $("runnerTop").textContent = r;
  if ($("runnerBottom")) $("runnerBottom").textContent = r;
  if ($("siteTitle")) $("siteTitle").textContent = s.title || SITE_DEFAULTS.title;
  if ($("siteIcon") && s.icon) $("siteIcon").innerHTML = '<img src="' + s.icon + '" alt="">';
}

// Load site settings once, render chrome. Returns a promise of the settings.
function loadSite() {
  return siteRef.get().then(function (snap) {
    var s = snap.exists ? Object.assign({}, SITE_DEFAULTS, snap.data()) : Object.assign({}, SITE_DEFAULTS);
    renderSiteChrome(s);
    return s;
  }).catch(function () { renderSiteChrome(SITE_DEFAULTS); return Object.assign({}, SITE_DEFAULTS); });
}

// Simple tab switching for any .tabs > .tab[data-panel] structure.
function wireTabs() {
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      t.classList.add("active");
      var panel = $(t.getAttribute("data-panel"));
      if (panel) panel.classList.add("active");
    });
  });
}

// Shrink an image File to <= maxDim px, return a small data URL (JPEG).
// This keeps uploads tiny so they store free in Firestore.
function shrinkImage(file, maxDim, cb) {
  maxDim = maxDim || 240;
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = function () { cb(null); };
    img.src = e.target.result;
  };
  reader.onerror = function () { cb(null); };
  reader.readAsDataURL(file);
}

// Wire an "upload" button + hidden file input to fill a target text input
// with a shrunken data URL. maxDim controls size (photos bigger than avatars).
function wireImageUpload(btnId, fileId, targetInputId, maxDim) {
  var btn = $(btnId), file = $(fileId), target = $(targetInputId);
  if (!btn || !file) return;
  btn.onclick = function () { file.click(); };
  file.onchange = function () {
    if (!file.files || !file.files[0]) return;
    btn.textContent = "Shrinking…";
    shrinkImage(file.files[0], maxDim, function (dataUrl) {
      if (dataUrl && target) target.value = dataUrl;
      btn.textContent = "Choose file…";
    });
  };
}

// Render pastel swatch buttons into a container that set a target input's value.
function renderSwatches(containerId, targetInputId) {
  var c = $(containerId); if (!c) return;
  c.innerHTML = "";
  PASTELS.forEach(function (col) {
    var b = document.createElement("button");
    b.type = "button";
    b.style.cssText = "width:26px;height:26px;padding:0;margin-right:4px;background:" + col;
    b.onclick = function () { $(targetInputId).value = col; };
    c.appendChild(b);
  });
}

// escape text destined for innerHTML
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

// trigger a browser download of a JS object as pretty JSON
function downloadJSON(obj, filename) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
