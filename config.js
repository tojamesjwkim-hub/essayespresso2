// ============================================================
//  config.js — shared setup for every page.
//  EDIT ONLY THE MARKED SECTION.
// ============================================================

// ---- EDIT: paste your Firebase web config (SETUP.md step 2) ----
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBmzSb3E2Hw1C0J3VnYcqRYRcHZkv0vGQoE",
  authDomain: "essay-espresso.firebaseapp.com",
  projectId: "essay-espresso",
};

// ---- EDIT: your teacher Google email ----
const TEACHER_EMAIL = "tojamesjwkim@gmail.com";

// ============================================================
//  No edits needed below.
// ============================================================

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const studentsCol = db.collection("students");
const wsCol       = db.collection("worksheets");
const boxesCol    = db.collection("boxes");
const siteRef     = db.collection("site").doc("config");
const teacherRef  = db.collection("teacher").doc("profile");
const goldLogCol  = db.collection("goldlog");
const feedbackCol = db.collection("feedback");
const templatesCol= db.collection("templates");

function $(id) { return document.getElementById(id); }

function isTeacher(user) {
  return !!user && (user.email || "").toLowerCase() === TEACHER_EMAIL.toLowerCase();
}

// LA time, labelled PT (correct across daylight saving)
function fmtTime(ts) {
  if (!ts) return "";
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit"
  }) + " PT";
}

function loginWithGoogle() { return auth.signInWithPopup(googleProvider); }
function logout() { auth.signOut().then(function () { location.href = "index.html"; }); }

// Create a pending student doc on first sign-in.
function ensureStudentDoc(user) {
  var ref = studentsCol.doc(user.uid);
  return ref.get().then(function (snap) {
    if (snap.exists) return snap;
    return ref.set({
      email: user.email,
      name: user.displayName || (user.email || "").split("@")[0],
      photo: "", bg: "", opacity: 90,
      gold: 0,
      status: "pending",
      viewers: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(function () { return ref.get(); });
  });
}

// Find which students (if any) this email is a parent-viewer for.
function findViewableStudents(email) {
  return studentsCol.where("viewers", "array-contains", (email || "").toLowerCase())
    .get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) { out.push(Object.assign({ uid: d.id }, d.data())); });
      return out;
    }).catch(function () { return []; });
}

// Resolve a signed-in user to a role, then route/callback.
// cb({ role: 'teacher'|'student'|'parent'|'pending'|'none', user, data, children })
function resolveRole(cb) {
  auth.onAuthStateChanged(function (user) {
    if (!user) { cb({ role: "none", user: null }); return; }

    if (isTeacher(user)) { cb({ role: "teacher", user: user }); return; }

    ensureStudentDoc(user).then(function (snap) {
      var data = snap.data();
      if (data && data.status === "approved") {
        cb({ role: "student", user: user, data: data });
        return;
      }
      // Not an approved student — maybe a parent viewer?
      findViewableStudents(user.email).then(function (kids) {
        if (kids.length) { cb({ role: "parent", user: user, children: kids }); return; }
        cb({ role: "pending", user: user, data: data });
      });
    });
  });
}
