# EssayEspresso — Setup

This is your tutoring worksheet app. Follow these once and you're live.
Everything routine (worksheets, students, assignments) is done by clicking in
the app afterward — you won't edit files again except to paste your keys below.

---

## 1. Firebase project
You already have the `essay-espresso` project. If not: console.firebase.google.com
→ Add project → skip Analytics.

## 2. Paste your keys (the one file edit)
Firebase console → ⚙ Project settings → "Your apps" → the web app → copy the
config values. Open **config.js** and replace the three `PASTE_ME` slots:
`apiKey`, `authDomain`, `projectId`. Your teacher email is already set.

## 3. Turn on Google login
Firebase → **Authentication** → Get started → Sign-in method → enable **Google**.
No accounts to create by hand — students sign in with Google and land in a
"pending" state until you approve them in your dashboard.

## 4. Turn on Firestore + paste the rules
Firebase → **Firestore** (the NoSQL one) → create the database if needed
(production mode, US region). Then the **Rules** tab → replace everything with
the block below → **Publish**. Your email is already in it.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isTeacher() {
      return request.auth != null
        && request.auth.token.email == 'tojamesjwkim@gmail.com';
    }
    function isSelf(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    function isApproved() {
      return request.auth != null
        && exists(/databases/$(database)/documents/students/$(request.auth.uid))
        && get(/databases/$(database)/documents/students/$(request.auth.uid)).data.status == 'approved';
    }

    // Site config + teacher profile: teacher writes, anyone signed-in can read.
    match /site/{doc} {
      allow read: if true;
      allow write: if isTeacher();
    }
    match /teacher/{doc} {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }

    // Worksheets: teacher manages; approved students (and teacher) can read.
    match /worksheets/{wsId} {
      allow read: if isTeacher() || isApproved();
      allow write: if isTeacher();
    }

    // Custom boxes: teacher manages; signed-in students read.
    match /boxes/{boxId} {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }

    // Student record: the student may create their own (pending) doc and edit
    // their name/photo/bg. Only the teacher can change status. Teacher reads all.
    match /students/{uid} {
      allow read: if isTeacher() || isSelf(uid);
      allow create: if isSelf(uid);
      allow update: if isTeacher() || isSelf(uid);
      allow delete: if isTeacher();

      // Assignments: teacher sets them; student may only flip "done".
      match /assignments/{wsId} {
        allow read: if isTeacher() || isSelf(uid);
        allow write: if isTeacher() || isSelf(uid);
      }

      // Answers/attempts: the student and the teacher.
      match /answers/{wsId}/attempts/{attemptId} {
        allow read: if isTeacher() || isSelf(uid);
        allow write: if isTeacher() || isSelf(uid);
      }
    }
  }
}
```

## 5. Authorize your web address
Firebase → Authentication → Settings → **Authorized domains** → Add your
GitHub Pages domain (e.g. `tojamesjwkim.github.io`). Without this, the Google
sign-in popup is blocked on the live site.

## 6. Put it online
Push this whole folder to a GitHub repo → Settings → Pages → deploy from `main`.
Your site is at `https://<you>.github.io/<repo>/`. (Public repo is fine — the
keys in config.js are not secrets; the rules above are what protect data.)

---

## Files (what's what)
- **index.html** — home / Google sign-in (editable by you when logged in)
- **dashboard.html / dashboard.js** — your teacher dashboard (6 tabs)
- **student.html / student.js** — what students see; also your "view as" + preview
- **editor.html / editor.js** — the worksheet editor
- **config.js** — your keys + teacher email (the only file you edit)
- **shared-ui.js / style.css** — shared helpers and the napkin styling

## First run
1. Sign in with your teacher Google account → you land on the dashboard.
2. My Profile → set your name, and (optional) your Good/Try-again stamp images.
3. Worksheets → Create one, add questions, Save.
4. Have a student sign in → approve them in Students → Assign them the worksheet.
5. Use "👁 View as" to see their dashboard exactly as they do.
```
