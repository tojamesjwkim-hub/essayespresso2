// ============================================================
//  config.js — shared setup used by every page.
//  EDIT ONLY THE MARKED SECTION. Everything else is machinery.
// ============================================================

// ---- EDIT THIS: paste your Firebase web config (SETUP.md step 2) ----
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBmzSb3E2Hw1C0J3VnYcqRYRcHZkv0vGQo",
  authDomain: "essay-espresso.firebaseapp.com",
  projectId: "essay-espresso",
};

// ---- EDIT THIS: your teacher Google email ----
const TEACHER_EMAIL = "tojamesjwkim@gmail.com";

// ============================================================
//  No edits needed below this line.
// ============================================================

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ---- tiny helpers ----
function $(id) { return document.getElementById(id); }

function isTeacher(user) {
  return !!user && (user.email || "").toLowerCase() === TEACHER_EMAIL.toLowerCase();
}

// LA time, labelled "PT" so it's correct across daylight saving.
function fmtTime(ts) {
  if (!ts) return "";
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  var s = d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
  return s + " PT";
}

function loginWithGoogle() {
  return auth.signInWithPopup(googleProvider);
}

function logout() {
  auth.signOut().then(function () { window.location.href = "index.html"; });
}

// ---- student status lives in: students/{uid} ----
// status: "pending" (just signed in) or "approved". Teacher is auto-approved.
function studentDocRef(uid) { return db.collection("students").doc(uid); }

// Ensure a signed-in non-teacher has a student doc; create as pending on first sight.
function ensureStudentDoc(user) {
  var ref = studentDocRef(user.uid);
  return ref.get().then(function (snap) {
    if (!snap.exists) {
      return ref.set({
        email: user.email,
        name: user.displayName || user.email.split("@")[0],
        photo: "",
        status: "pending",
        bg: "",           // appearance: pastel hex or image url
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).then(function () { return ref.get(); });
    }
    return snap;
  });
}

// Gate a page. role = "teacher" | "student" | "any".
// Calls ok(user, studentData) if allowed; otherwise redirects appropriately.
function requireRole(role, ok) {
  auth.onAuthStateChanged(function (user) {
    if (!user) { window.location.href = "index.html"; return; }

    if (isTeacher(user)) {
      if (role === "student") { window.location.href = "dashboard.html"; return; }
      ok(user, { name: "Teacher", status: "approved", teacher: true });
      return;
    }

    // non-teacher
    if (role === "teacher") { window.location.href = "student.html"; return; }

    ensureStudentDoc(user).then(function (snap) {
      var data = snap.data();
      if (data.status !== "approved") {
        window.location.href = "student.html"; // student.html shows the pending screen
        return;
      }
      ok(user, data);
    });
  });
}
