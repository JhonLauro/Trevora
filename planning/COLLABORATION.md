# Working on Trevora with other people

Written 2026-08-24, when the project went from one person to four. Read this
before starting work, and before pointing Claude Code at anything.

The goal is not process for its own sake. It is that four people and four AI
assistants can work the same week without spending Friday resolving conflicts
in an 11,000-line stylesheet.

---

## 1. Split by feature, not by layer

The backend is already packaged by feature (`features.auth`, `features.vehicle`,
`features.serviceinput`, …) and the frontend pages map onto those packages
almost one-to-one. **That is the seam to cut along.**

Take a feature end to end — its backend package, its API module, its pages —
rather than "you do backend, I do frontend". Two people in the same feature
conflict constantly; two people in different features almost never do.

| Area | Backend package | Frontend |
|---|---|---|
| Adding a service | `features.serviceinput` | `ReceiptUploadPage`, `VoiceInputPage`, `ManualEntryPage`, `ServiceInputMethodPage` |
| Checking and saving it | `features.validation`, `features.servicerecord` | `ServiceDraftReviewPage`, `ServiceRecordConfirmationPage`, `ServiceRecordSavedPage` |
| History and the vehicle page | `features.history` | `VehiclePage`, `VehicleServiceHistoryPage`, `RecordsPage`, `GaragePage` |
| Explanations | `features.ai` | `AIExplanationPanel` |
| Sharing and mechanic access | `features.sharing`, `features.mechanicaccess` | `QRSharingPage`, `OwnerAccessRequestsPage`, `Mechanic*Page` |
| Accounts | `features.auth` | `LoginPage`, `RegisterPage`, `AccountSettingsPage`, auth screens |

Record who has what in `planning/CONTEXT.md`. The "Person A/B/C/D" table there
is from the Module 4 push months ago and is **stale** — replace it, do not
inherit it.

---

## 2. The five things that will conflict anyway

These are shared by everyone regardless of how the features are split. Each has
a rule, and the rules are cheap.

### `frontend/trevora-web/src/styles.css` — 11,139 lines, one file

The worst offender in the repo. Two people adding styles at the same time will
collide, and the diff is unreadable.

- **Prefer a new file.** `src/styles/` already holds `ink-app.css`,
  `ink-garage.css`, `ink-vehicle.css`, `ink-auth.css`. Add
  `src/styles/<your-feature>.css` and import it in `main.jsx` — the import order
  there is deliberate and commented, so add yours at the end.
- If you must touch `styles.css`, add to the end under a comment naming the
  feature. Never reorder or reformat it; a whitespace pass would conflict with
  everything.

### `database/migrations/` — sequential numbers

`012_motorcycle_sub_types.sql` is the highest. Two people both writing `013_`
is not a merge conflict, it is two migrations with the same number applied in
whatever order Supabase gets them.

**Claim the number in chat before you write the file.** It costs one message.

### `frontend/trevora-web/src/App.jsx` — the route table

Everyone adds routes. Add yours next to the related ones, and do not reorder or
reformat the others. Conflicts here are trivial to resolve as long as nobody
rewrites the whole block.

### `backend/.../shared/dto/` — `ServiceItemResponse`, `ServiceLineEntryResponse`

These cross every module: drafts, records, history, mechanic access. Changing a
field here changes four features at once and can silently break a screen you
have never opened.

**Say so before changing them**, and grep for consumers first.

### `planning/DEFERRED.md` — the shared handoff

Seven of the last thirty commits touched it. It is the most valuable document in
the repo and the easiest to clobber.

- **Append a dated section. Never rewrite someone else's.**
- If you disagree with what is written there, add a note underneath saying so
  and why. Do not silently edit the claim away.

Also shared, lower risk: `components/ServiceItemsList.jsx` and
`ServiceItemsEditor.jsx` are imported by six pages, and `utils/serviceLines.js`,
`utils/fieldConfidence.js` and `utils/serviceText.js` are read across features.
Changing behaviour in any of them affects screens outside your area.

---

## 3. The golden set

`backend/trevora-api/src/test/resources/golden/` holds three real receipts, the
correct answer for each written out by hand, and a scorer that marks the
extractor against them. It is the only thing in this project that can tell you
whether a change to receipt extraction helped or hurt. Read its `README.md`
before touching anything in `features.serviceinput`.

```
./mvnw test              # unit tests, free and offline, run these always
./mvnw test -Pgolden     # calls the OpenAI API for real; needs OPENAI_API_KEY
```

**On cost:** about one or two US cents per full run — roughly 37k input and 8k
output tokens on `gpt-4o-mini`. It is not expensive and nobody needs permission
to run it. (An earlier version of this document said to coordinate runs to save
money. That was written without doing the arithmetic and was wrong.)

What is actually worth knowing:

1. **Do not change the extraction prompt without running it before and after.**
   Two prompt changes during the August audit looked like clear improvements in
   the diff and were regressions — line-kind accuracy went from 100% to 36%,
   twice, invisibly. This is the rule that matters.
2. **Without `OPENAI_API_KEY` the golden test skips rather than fails.** A green
   run does not prove it ran. Check the output for the scorecard.
3. **It is not deterministic.** Roughly one extraction in twenty comes back
   unusable even at temperature 0. One bad run is not a regression.
4. **Three cases is a small sample.** Anything under about six percentage points
   is noise. Do not claim an improvement you cannot reproduce across runs.

---

## 4. Branches and pull requests

- **One branch per piece of work**, off current `main`, named for the work
  (`receipt-flow-one-review-screen`, not `johns-branch`).
- **Pull `main` before you start and before you open the PR.** Most conflicts
  here are a day old, not structural.
- **Keep branches short.** The bigger the branch, the worse the merge. Six
  commits that each build is better than one commit that does everything.
- **Every commit should build.** `./mvnw test` for backend work, `npm run build`
  for frontend, both if you touched a DTO.
- Delete the branch after merging, locally and on GitHub.

Commit message rules are in `CLAUDE.md` and apply to everyone.

---

## 5. Rules for the AI assistants

Everyone is running Claude Code, so these matter as much as the human rules.

- **`CLAUDE.md` is loaded into every session automatically.** If a rule must be
  followed, it goes there — not in a document nobody opens. Keep it short enough
  that it stays read.
- **Tell your assistant what you own** at the start of a session. Otherwise it
  will happily refactor a file another person is rewriting.
- **Do not let three assistants audit the same thing.** Split the area first.
  Three overlapping audit reports is three times the reading and no more
  information.
- **`./mvnw test` passing is not the same as the application running.** The
  suite has no Spring context test — the real one needs Supabase — so a broken
  bean wiring passes every test and fails at boot. Start the app before you say
  something works.
- **Nobody can sign in as you.** An assistant cannot enter your password, so
  anything behind the login is unverified until a human clicks it. Treat "the
  build is clean" as a much weaker claim than it sounds.

---

## 6. Environment

`.env` files are gitignored and must never be committed. Each person needs their
own, with the variables listed in `CLAUDE.md`. If you add a new variable, say so
in chat and add it to `CLAUDE.md` — a variable only you have is a broken build
for everyone else.

Migrations are applied directly to Supabase. **There is one shared database.**
A destructive migration is destructive for all four of you, so say so before
running one.
