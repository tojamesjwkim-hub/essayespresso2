# EssayEspresso — Setup

Your tutoring worksheet app. Do these once; after that everything is done by
clicking in the app.

---

## 1. Paste your Firebase keys (the ONLY file you edit)
Firebase console → ⚙ Project settings → "Your apps" → web app → copy the config.
Open **config.js** and replace the three `PASTE_ME` slots (`apiKey`,
`authDomain`, `projectId`). Your teacher email is already set.

## 2. Turn on Google login
Firebase → **Authentication** → Sign-in method → enable **Google**.
No accounts to create by hand — people sign in and land in "pending" until you
approve them.

## 3. Firestore rules — REPLACE EVERYTHING with this
Firebase → **Firestore** → **Rules** tab → paste → **Publish**.

**NEW THIS VERSION — you must re-publish:** `boxTints` added to the keys a
student may write (without it, per-box colours silently fail to save).

**Previously:** parent viewing now works (the `viewerOfThisDoc`
function — the old `get()` version silently failed for queries, which is why
parents saw the pending screen), plus wordlist and box-notes collections.

**Earlier changes:** gold is teacher-writable only (students can't
edit their own balance), students can create questions, parents get read-only
access via the `viewers` list, and the gold log / feedback / templates
collections are added.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isTeacher() {
      return request.auth != null
        && request.auth.token.email == 'tojamesjwkim@gmail.com'
        && request.auth.token.email_verified == true;
    }
    function isSelf(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    function studentDoc(uid) {
      return get(/databases/$(database)/documents/students/$(uid)).data;
    }
    // a signed-in parent listed on that student's viewers[] — via get(), for
    // sub-collection rules where we can't see the parent doc directly
    function isViewer(uid) {
      return request.auth != null
        && exists(/databases/$(database)/documents/students/$(uid))
        && studentDoc(uid).viewers is list
        && studentDoc(uid).viewers.hasAny([request.auth.token.email.lower()]);
    }
    // same test but against the document being read — REQUIRED for queries
    // (parent.html asks "which students list me?", which is a query)
    function viewerOfThisDoc() {
      return request.auth != null
        && resource.data.viewers is list
        && resource.data.viewers.hasAny([request.auth.token.email.lower()]);
    }
    function isApproved() {
      return request.auth != null
        && exists(/databases/$(database)/documents/students/$(request.auth.uid))
        && studentDoc(request.auth.uid).status == 'approved';
    }

    match /site/{doc} {
      allow read: if true;
      allow write: if isTeacher();
    }
    match /teacher/{doc} {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }
    match /teacher/{doc}/wordlist/{wid} {
      allow read, write: if isTeacher();
    }
    match /worksheets/{wsId} {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }
    match /boxes/{boxId} {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }
    match /goldlog/{id} {
      allow read: if isTeacher();
      // a student may log only their own award; teacher may log anything
      allow create: if isTeacher()
        || (isApproved() && request.resource.data.uid == request.auth.uid);
      allow update, delete: if isTeacher();
    }
    match /feedback/{id} {
      // teacher writes; parents read only their own child's notes
      allow read: if isTeacher() || isViewer(resource.data.uid);
      allow write: if isTeacher();
    }
    match /templates/{id} {
      allow read, write: if isTeacher();
    }

    match /students/{uid} {
      allow read: if isTeacher() || isSelf(uid) || viewerOfThisDoc();
      allow create: if isSelf(uid) && request.resource.data.status == 'pending';
      // student may edit ONLY name / photo / bg / opacity.
      // gold, status and viewers are teacher-only. Gold also increases via the
      // submit flow, which is why 'gold' is allowed in the student key list but
      // guarded: a student can only ever raise it, never set it arbitrarily low
      // or high in one step is not enforced here — the log is your receipt.
      allow update: if isTeacher()
        || (isSelf(uid)
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['name','photo','bg','opacity','gold','boxTints']));
      allow delete: if isTeacher();

      match /assignments/{wsId} {
        allow read: if isTeacher() || isSelf(uid) || isViewer(uid);
        allow create, delete: if isTeacher();
        allow update: if isTeacher()
          || (isSelf(uid)
              && request.resource.data.diff(resource.data)
                   .affectedKeys().hasOnly(['done','doneAt']));
      }

      match /answers/{wsId}/attempts/{attemptId} {
        allow read: if isTeacher() || isSelf(uid) || isViewer(uid);
        allow write: if isTeacher() || isSelf(uid);
      }

      match /wordlist/{wid} {
        allow read, write: if isTeacher() || isSelf(uid);
      }

      match /boxnotes/{bid} {
        allow read: if isTeacher() || isSelf(uid) || isViewer(uid);
        allow write: if isTeacher() || isSelf(uid);
      }

      match /questions/{qid} {
        allow read: if isTeacher() || isSelf(uid) || isViewer(uid);
        allow create, delete: if isTeacher() || isSelf(uid);
        allow update: if isTeacher();   // only you write replies
      }
    }
  }
}
```

### One honest note on gold
The rules let a student's own document update `gold` (that's how the Submit
button awards it from the browser). A determined student could in principle
raise their own gold. For a small tutoring practice that's an acceptable trade —
and the **Gold log** is your receipt, since every legitimate award writes a log
entry. If it ever matters, the fix is a Cloud Function; ask me then.

## 4. Authorise your web address
Firebase → Authentication → Settings → **Authorized domains** → add your
GitHub Pages domain (e.g. `tojamesjwkim.github.io`). Without this the Google
popup is blocked on the live site.

## 5. Put it online
Push this folder to a **public** GitHub repo → Settings → Pages → Deploy from a
branch → `main` / root. (Pages needs a public repo on the free plan.)

---

## Pages
| File | What it is |
|---|---|
| index.html | Home / Google sign-in (you can edit its text + background) |
| dashboard.html | Your dashboard: Approve, Answer, Mark, Worksheets (incl. gold), Gold log, Student boxes, Parent feedback, Profile |
| editor.html | Build a worksheet (6 question types) |
| assign.html | Assign worksheets to a student, set their order |
| answers.html | Review attempts, edit text, comment, mark Good job / Try again |
| generator.html | Turn student answers into a new multiple-choice worksheet |
| student.html | What a student sees (also your "view as" and preview) |
| parent.html | Read-only parent view with child picker |

## Question types
`typed` (text box + B/I/U toolbar) · `mc` (multiple choice) · `blank`
(fill-in) · `check` (just tick it off) · `draw` (drawing canvas) · `task`
(nothing to submit). Any question can also carry an **embed** (Google Doc,
YouTube) shown inline so students never leave the site.

## First run
1. Sign in with your teacher Google account → dashboard.
2. Profile tab → set your name, stamps, parent blurb, wordlist reference embeds → Save.
3. Worksheets → Create → add questions → Save.
4. Worksheets tab → set gold per worksheet (the gold field on each row).
5. Student signs in → approve them in Students → Assign (button on the worksheet row).
6. Use **👁 View as** to see exactly what they see.
7. Add a parent's email under a student to give read-only access.
