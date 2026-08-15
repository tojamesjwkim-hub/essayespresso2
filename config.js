/* ---- Firebase config: paste your 3 keys here ---- */
var firebaseConfig = {
apiKey: "AIzaSyBmzSb3E2Hw1C0J3VnYcqRYRcHZkv0vGQo",
  authDomain: "essay-espresso.firebaseapp.com",
  projectId: "essay-espresso",
};
var TEACHER_EMAIL = "tojamesjwkim@gmail.com";
var VERSION = "1";

firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var siteRef      = db.collection("site").doc("config");
var teacherRef   = db.collection("teacher").doc("profile");
var wsCol        = db.collection("worksheets");
var studentsCol  = db.collection("students");
var gameCfgRef   = db.collection("game").doc("config");
var screensCol   = db.collection("game").doc("config").collection("screens");
var draftsCol    = db.collection("gamedrafts");

function isTeacherUser(u){ return u && u.email === TEACHER_EMAIL && u.emailVerified; }

/* Resolve where a signed-in user belongs. cb(role, extra) */
function resolveRole(user, cb){
  if(!user){ cb("guest"); return; }
  if(isTeacherUser(user)){ cb("teacher"); return; }
  studentsCol.doc(user.uid).get().then(function(d){
    if(d.exists && d.data().status === "approved") cb("student", d.data());
    else cb("pending", d.exists ? d.data() : null);
  }).catch(function(){ cb("pending", null); });
}

function signIn(){
  var p = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(p);
}
function signOutNow(){ return auth.signOut(); }
