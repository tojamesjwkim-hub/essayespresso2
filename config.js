/* ---- Firebase config: paste your 3 keys here ---- */
var firebaseConfig = {
apiKey: "AIzaSyBmzSb3E2Hw1C0J3VnYcqRYRcHZkv0vGQo",
  authDomain: "essay-espresso.firebaseapp.com",
  projectId: "essay-espresso",
};
var TEACHER_EMAIL = "tojamesjwkim@gmail.com";
var VERSION = "2";

firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var siteRef      = db.collection("site").doc("config");
var teacherRef   = db.collection("teacher").doc("profile");
var wsCol        = db.collection("worksheets");
var studentsCol  = db.collection("students");
var parentsCol   = db.collection("parents");
var gameCfgRef   = db.collection("game").doc("config");
var screensCol   = db.collection("game").doc("config").collection("screens");
var draftsCol    = db.collection("gamedrafts");

function isTeacherUser(u){ return u && u.email === TEACHER_EMAIL && u.emailVerified; }

/* Resolve where a signed-in user belongs.
   cb(role, extra)
     "guest"    nobody signed in
     "teacher"  it's you
     "parent"   linked to one or more students, read-only
     "student"  approved
     "pending"  signed in, not approved yet — they stay in guest mode with a banner
     "removed"  access revoked                                                     */
function resolveRole(user, cb){
  if(!user){ cb("guest"); return; }
  if(isTeacherUser(user)){ cb("teacher"); return; }
  studentsCol.doc(user.uid).get().then(function(d){
    if(d.exists && d.data().status === "approved"){ cb("student", d.data()); return; }
    if(d.exists && d.data().status === "removed"){ cb("removed", d.data()); return; }
    /* not a student record — could be a parent */
    return parentsCol.doc(user.uid).get().then(function(p){
      if(p.exists && (p.data().students||[]).length){ cb("parent", p.data()); return; }
      cb("pending", d.exists ? d.data() : null);
    }).catch(function(){ cb("pending", d.exists ? d.data() : null); });
  }).catch(function(){ cb("pending", null); });
}

/* Make sure a signed-in non-teacher has a record waiting for approval. */
function ensurePendingRecord(user){
  if(!user || isTeacherUser(user)) return Promise.resolve();
  return studentsCol.doc(user.uid).get().then(function(d){
    if(d.exists) return;
    return studentsCol.doc(user.uid).set({
      status:"pending",
      name: user.displayName || (user.email||"").split("@")[0] || "Student",
      email: user.email || "",
      photo: user.photoURL || "",
      joined: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).catch(function(){});
}

function signIn(){
  var p = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(p).then(function(res){
    return ensurePendingRecord(res.user).then(function(){ return res; });
  });
}
function signOutNow(){ return auth.signOut(); }
