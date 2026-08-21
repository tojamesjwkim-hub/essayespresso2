# EssayEspresso — setup

Practise a little, every day. A few short exercises, an optional game on top.

---

## 1. Firebase (once)

1. **Create a project** at console.firebase.google.com.
2. **Authentication → Sign-in method → Google → Enable.**
3. **Firestore Database → Create database** (production mode).
4. **Project settings → Your apps → Web app.** Copy `apiKey`, `authDomain`, `projectId`
   into the top of `config.js`.
5. In `config.js`, check `TEACHER_EMAIL` is your Google address.
6. **Authentication → Settings → Authorized domains → Add** your GitHub Pages domain
   (e.g. `yourname.github.io`).

## 2. Security rules — paste ALL of this into Firestore → Rules → Publish

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isTeacher() {
      return request.auth != null
        && request.auth.token.email == 'tojamesjwkim@gmail.com'
        && request.auth.token.email_verified == true;
    }
    function isApproved() {
      return request.auth != null
        && exists(/databases/$(database)/documents/students/$(request.auth.uid))
        && get(/databases/$(database)/documents/students/$(request.auth.uid)).data.status == 'approved';
    }
    function isMe(uid) { return request.auth != null && request.auth.uid == uid; }

    match /site/{doc} {
      allow read: if true;
      allow write: if isTeacher();
    }

    match /teacher/profile {
      allow read: if request.auth != null;
      allow write: if isTeacher();
    }

    // Worksheets: approved students read all; guests read only public demos.
    // NOTE: a guest's query must be .where('publicDemo','==',true) — the app does this.
    match /worksheets/{id} {
      allow read: if isTeacher() || isApproved() || resource.data.publicDemo == true;
      allow write: if isTeacher();
    }

    // Game content is your world, not anyone's data — readable by all so that
    // guests and not-yet-approved students can play. Only you can change it.
    match /game/config {
      allow read: if true;
      allow write: if isTeacher();
    }
    match /game/config/screens/{id} {
      allow read: if true;
      allow write: if isTeacher();
    }
    match /gamedrafts/{id} {
      allow read, write: if isTeacher();
    }

    // A parent record lists the students they may watch. Only you can write it.
    function watches(uid) {
      return request.auth != null
        && exists(/databases/$(database)/documents/parents/$(request.auth.uid))
        && uid in get(/databases/$(database)/documents/parents/$(request.auth.uid)).data.students;
    }
    function parentSeesAll(uid) {
      return watches(uid)
        && get(/databases/$(database)/documents/parents/$(request.auth.uid)).data.scope == 'full';
    }
    match /parents/{uid} {
      allow read: if isTeacher() || isMe(uid);
      allow write: if isTeacher();
    }

    match /students/{uid} {
      // A signed-in person may create their own pending record.
      allow create: if isMe(uid)
        && request.resource.data.status == 'pending';
      allow read: if isTeacher() || isMe(uid) || watches(uid);
      // Students may only change these fields; status/permissions are teacher-only.
      allow update: if isTeacher()
        || (isMe(uid) && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['name','photo','bg','opacity','tintProfile','tintPractice',
                       'ap','streak','lastPracticeDay','lastSeen','lastSeenDay',
                       'todayTitle','gameOn']));
      allow delete: if isTeacher();

      match /assignments/{wsId} {
        allow read: if isTeacher() || isMe(uid) || watches(uid);
        allow write: if isTeacher() || isMe(uid);
      }
      match /drafts/{wsId} {
        allow read, write: if isTeacher() || isMe(uid);
      }
      match /archive/{wsId} {
        allow read: if isTeacher() || isMe(uid) || watches(uid);
        allow write: if isTeacher() || isMe(uid);
        match /rows/{rowId} {
          // "Activity only" parents see the row count, not the answers.
          allow read: if isTeacher() || isMe(uid) || parentSeesAll(uid);
          allow create: if isTeacher() || isMe(uid);
          allow update, delete: if isTeacher();
        }
      }
      match /game/{docId} {
        allow read, write: if isTeacher() || isMe(uid);
      }
    }

    match /aplog/{id} {
      allow read: if isTeacher();
      allow create: if request.auth != null;
      allow update, delete: if isTeacher();
    }
  }
}
```

**Re-publish these rules whenever you're told to.** Most "it silently didn't save"
bugs are a rules problem.

## 3. Deploy

Public GitHub repo → upload all files → Settings → Pages → Deploy from branch →
`main` / root. Wait for the green tick, then open the URL.

## 4. First run

1. Open the site, **Log in with Google** as the teacher address.
   (If it says the email isn't verified, verify it with Google first.)
2. **Categories & sources** — add a category or two. Tick *self-serve* for the ones
   students may pick from.
3. **Word sources** — in Google Sheets: File → Share → **Publish to web** → pick the tab →
   **CSV** → copy the link. Paste it, name your columns (e.g. `A = words`, `B = meaning`),
   press **Test**. It should say how many rows loaded.
4. **Worksheets → + Create.** In the editor: set the archive columns, attach the source,
   write a question using a token like `{satwords.words}`, and map answers to columns.
5. **Approve** — students appear here after they try to log in. Approve them, then use
   **Mark** to assign worksheets.

## 5. The game (optional)

**Game editor** (button on the *Student game* tab):

- **Stats** first — Smarts, Strength, Gold, whatever you want.
- **Items** next, if you'll use them.
- **Screen map → + Add screen** for each place. Set the start screen on the Rules tab.
- **Edit a screen** → add buttons to the pool, each with conditions, chance, effects.
- **Endings** → one category per ending-page button; first match wins, so end with a catch-all.
- **Convert** → what ✨ can be exchanged for.
- **Rules & publish** → days per run, ✨ cost to skip a day, and **snapshots**.

**Take a named snapshot before any big rewrite.** "Save draft" writes live immediately;
snapshots are your undo.

## 6. How the pieces fit

- **✨ comes only from practice.** Submitting pays; the game only spends.
- **Options are seeded per day** — a student sees the same choices all day, and a new roll
  tomorrow. Reloading won't reroll.
- **Days roll at 12AM Pacific** for everyone, or a student can spend ✨ to skip ahead.
- **Game off** hides ✨ and the Game button but keeps counting quietly, so switching back
  loses nothing.

## 6b. Guests and public demos

A guest (nobody signed in) can only read worksheets ticked **Public demo** in the worksheet
editor. Firestore can't filter a query per-document, so the app asks specifically for
`publicDemo == true` when signed out. **If no worksheet is ticked as a public demo, a guest
sees an empty board** — tick at least one.

## 6b. Guest mode

The landing page sends first-time visitors straight into guest practice with the game on.
Guests can only see worksheets ticked **Public demo** in the worksheet editor — until you
tick at least one, a guest sees an empty board. Tick one or two before sharing the link.

## 7. Known limits

- ✨ is awarded by browser code, so a determined student could inflate it. `aplog` is the
  receipt if you ever want to check. A Cloud Function would close this properly.
- Published Google Sheets are **public by URL** — don't put anything private in a word source.
- Many sites (Google search, dictionary.com) refuse to be embedded and show blank in an
  iframe. Google Docs you own always work.
- Guest work lives in one browser on one device. Clearing browser data loses it.
- Some Google Docs/Sheets need to be shared "Anyone with the link" (or published) before
  they'll show inside an embed.

## 8. Files

| file | what it is |
|---|---|
| `config.js` | your Firebase keys + role resolver |
| `shared.js` | helpers: tokens, sheets, seeded rolls, embeds, rich text |
| `style.css` | all styling |
| `index.html` | landing / login / guest entry |
| `student.html` + `student.js` | dashboard, exercises, archives, test |
| `game.html` + `game.js` | the game |
| `teacher.html` + `teacher.js` | approve, mark, worksheets, categories, sources, rewards |
| `wseditor.html` + `wseditor.js` | worksheet editor |
| `gameeditor.html` + `gameeditor.js` | game editor |

When I hand you updates, the `?v=` number on every script bumps, so browsers fetch the
new files automatically — nobody needs to clear a cache.


---

## Parents (observers)

A parent is a read-only account linked to one or more students.

1. **Dashboard → Parents → Invite** with their email address.
2. They sign in with Google using **that same address**. They land on `parent.html`.
3. Link them to students from the Parents tab, or from a student's row under Approve.
4. Set what they see:
   - **Activity only** — streak, entry counts, which worksheets, when. No answers, no comments.
   - **Everything** — all of the above plus every answer and every comment you've written.

Parents never see the game, ✨ balances, or anything they could change. Use **👁 View as**
on their row to check exactly what they're looking at.

> The invite record is keyed by email until they first sign in. If they use a different
> Google address from the one you invited, they'll land on the student dashboard as a
> pending student instead — re-invite the address they actually used.

## Media sets

A **word list** is a sheet of words. A **media set** is a sheet of links — one image, PDF
or web page per row. It works the same way in every other respect, including "no repeats
until the list runs out" and same-row pairing.

**Drive folders cannot be listed by a web page**, so a media set needs a published sheet
with one link per row. Column A the link, column B a title, and so on.

1. **Dashboard → Categories & sources → + Add media set.** Paste the published CSV link.
2. Set each column's **Show it as**: Image, PDF, Web page, A link to click, or Plain text.
3. Press **Test**. For image sets it actually loads a sample and tells you which ones fail
   (nearly always a file that isn't shared with "anyone with the link").
4. In the worksheet editor, add the media set under Sources, then on a question pick a
   **media slot** and, importantly, set **Also save the media link to** an archive column.

That last step is what makes the archive worth keeping — the row records *which* item they
were looking at, so it still means something later, and the test can show it back to them
as picture-answers.

Drive share links are rewritten automatically when displayed (`/file/d/ID/view` becomes a
thumbnail for images, `/preview` for PDFs), so you can paste what Drive gives you.

> Some sites refuse to load inside a frame — most news sites, and anything behind a login.
> A set of 50 arbitrary websites will have a few that come up blank, and there's no way to
> detect that from here. Embedded PDFs are also awkward on phones; if your students are
> mostly on a phone, an image set behaves much better than a PDF set.
