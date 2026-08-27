# The landing page — brief for Claude Design

One screen. It is the **only page a stranger ever sees**, and the last one
still designed by nobody: it was ported from a mockup, its copy has been
corrected twice for accuracy, and its layout has been reworked once by hand —
but it has never been designed against the product that actually exists now.

**Everything is open.** Structure, section order, what sections there even are,
composition, imagery, type, the register. Do not treat what follows as a layout
to improve. Treat it as a description of what the product is, what the page
currently claims, and where it currently lies — and design the page.

---

## On the design system

You already have **Ink** from the auth, Garage, vehicle and add-record work.
Short version, because it constrains this page at one specific seam:

- Achromatic. **Chroma only ever means record status** — a coloured element in
  the app is always saying something about a record, never decorating.
- No drop shadows. Surfaces separate by tone and hairline.
- Source Serif 4 for headings only; Public Sans for everything else; JetBrains
  Mono for figures. All three are already loaded in `index.html`.
- Type and targets are deliberately larger than SaaS defaults, for a
  middle-aged owner audience: 16px body, 15px floor for secondary text, 52px
  controls.

**The genuine question this page raises, which the app never had to answer:**
Ink was designed for a signed-in owner reading their own records. A landing
page is a different job — it has to be *attractive* to someone who owes it
nothing. Nothing forbids the landing having a louder register than the app.

But there is one hard seam: **every CTA on this page lands on `/register` or
`/login`, and those screens are Ink.** Whatever the landing does, the handoff
into the auth screens must not read as walking into a different product. That
is the constraint. How much distance you take from Ink inside it is yours to
decide.

---

## Who it is for

Filipino vehicle owners — cars and motorcycles, both matter — who keep receipts
in the glovebox and cannot answer "when was the last time the brakes were done"
without digging. Not enthusiasts. Not fleet managers. Skew older than a typical
SaaS landing audience, and **arriving on a phone**.

Secondary reader: a mechanic who has been handed a link. They do not sign up,
and the page is not selling to them, but they may land here.

---

## What the product actually does — the truth constraints

The copy on this page has already been corrected twice for overclaiming
(a "Verified" confidence tier that does not exist, "bank-level encryption",
"PDF export", "resale ready", "AI-verified"). **Do not reintroduce a claim
without checking it.** Here is what is true as of Aug 2026:

**Adding a record** — three ways in: a photo of the receipt (the main path,
multi-page, page order matters), a voice note, or typing it. Receipt reading is
real OCR + extraction. Voice gives you a **raw transcript first**; translation
to English is a separate deliberate action, not instant magic.

**Checking it** — the owner reviews every extracted field before anything is
saved. Nothing is stored until they confirm. The itemised lines are added up
against the printed total, and the gap is shown without either side being
"corrected" — only the person holding the paper knows which figure is wrong.

**The confidence vocabulary on this page is obsolete.** The page's centrepiece
shows "High 94% / Medium 76% / Low 38% / Not found" with percentage bars. The
product does not do that any more and has not for some time. The real ladder is
worded, not scored, and ranks by *what it stops you doing*:

> Needed to save · Cannot be right · Two different values found · Not on
> receipt · Check this one · Read between the lines · Read from receipt ·
> Heard in your note · You entered this

Two of those block a save. There are no percentages anywhere in the product.
Whatever replaces this section must show the real thing — this is the single
biggest factual gap on the page.

**History** — one page per vehicle, three views: Timeline, Components (a drawn
side-profile map of the car or bike with numbered markers), Table. Plus a
cross-vehicle Records list. Component status is two states: has records / no
record found. **There is no due-date, interval or "next service" prediction**,
deliberately — do not let a design imply one.

**Mechanic handoff** — and the page currently gets the shape of this wrong.
It says you "generate a QR code that gives your mechanic access". Really: the
mechanic scans, **submits a request**, and the **owner approves it** before
anything is visible. Access is read-only, single-vehicle, and expires. The
approval step is not friction to hide — it is the reason to trust the feature,
and the page should probably be selling it rather than glossing it.

**Explanations** — confirmed records get a plain-language explanation: what was
done, why it matters, what to watch for. The mechanic view has an AI-backed
search over the shared records.

**Motorcycles are first-class.** Scooters, underbones and big bikes have their
own component taxonomy and their own artwork. The current page is 100% car —
one Toyota Vios, in three separate places. In this market that is a miss.

---

## What is on the page now

Nine blocks, top to bottom, all full-width, all one after another:

1. **Nav** — brand, three anchors (Features / How It Works / FAQ), Sign in,
   Get Started Free.
2. **Hero** — "Every service. Every detail. **Never forgotten.**", a paragraph,
   two buttons, and a fake three-pane app mockup on the right (mini sidebar +
   record fields + an "AI Explanation" pane). *The mockup does not resemble the
   app.* The app has a five-item sidebar and no third pane.
3. **Trust strip** — four inline items: no credit card, server-verified sign-in,
   private by default, totals checked line by line.
4. **How it works** — three numbered cards: capture → extract → forever.
5. **Features** — six cards on a dark section: Receipt OCR, Voice Capture,
   Confidence Scoring, Mechanic QR Access, Gap-Free History, Service Explained.
6. **Confidence section** — the obsolete percentage-bar panel described above,
   beside copy about knowing how confident the AI is.
7. **Mechanic section** — dark, with a hand-drawn CSS QR code (196 `<i>` cells
   generated by a modulo expression) and a "Try mechanic view" button that
   scrolls to the FAQ.
8. **FAQ** — five items, accordion, one open by default.
9. **Final CTA + footer** — four footer columns, twelve links, **every one of
   them points at `#faq`.**

---

## Problems to design against

1. **It shows a product that does not exist.** The hero mockup, the confidence
   panel, and the badge vocabulary are all from an earlier build. A visitor who
   signs up meets a different application.

2. **On a phone, an existing user cannot sign in.** Below 760px the nav links
   are hidden with nothing replacing them — no menu, no drawer — and
   `.fig-signin` is set to `display: none` outright. The three section anchors
   and the sign-in link are simply gone on the device most people arrive on.

3. **Nothing below the hero was designed for a phone.** The hero mockup drops
   its third pane and shrinks; everything else just stacks. The most important
   viewport is the least considered one.

4. **Type collapses below the product's own floor.** Ink's floor is 16px body /
   15px secondary. This page has **39 font-size declarations under 15px**, the
   smallest at 0.68rem — under 11px — on an audience chosen for needing larger
   type than usual.

5. **Twelve dead footer links.** About, Contact, Privacy Policy, Terms of
   Service, Security — all scroll to the FAQ. So does "Try mechanic view", a
   primary-styled button that promises a demo and delivers an accordion. Either
   these destinations exist or the page should not offer them.

6. **Leftover chroma with nothing to say.** `.fig-pill.violet` has been
   neutralised to beige-on-ink but keeps its name; `.fig-pill.amber` still
   carries real amber; the base pill still has a blue `rgba(43, 92, 230, .2)`
   border from the original mockup. Under Ink's rule those colours are making
   claims about status they cannot cash.

7. **Twelve drop shadows**, which the rest of the product does not use. Not
   automatically wrong for a landing page — but currently it is drift, not a
   decision.

8. **Two competing sets of breakpoints.** 1050/760 in `styles.css`, 900/600 in
   `ink-landing.css`. The layout changes at four widths from two files, and the
   two sets disagree about when the same grids collapse.

9. **Seven sections, one rhythm.** The last pass fixed some of this by varying
   padding and grid ratios, but the page is still centred-heading-over-even-grid
   almost throughout. Nothing has weight because everything has the same weight.

10. **It never shows a real record.** Every screenshot-like element is a
    hand-built CSS diagram — an invented QR code, invented field rows, invented
    percentages. The product is genuinely good-looking; the page is a drawing
    of it from memory.

---

## Open questions — yours to answer

1. **Does the landing get to say "AI"?** The page leads with "AI-Powered
   Vehicle Intelligence". The product deliberately never names AI or any
   provider in anything an owner reads — the flow says "read from receipt",
   never "the AI extracted". Is the landing an exception, or should it hold the
   same line?

2. **How far from Ink can this page go** before the jump into `/register` reads
   as a different product?

3. **What is the phone layout?** Design it first, not last. Including what
   replaces the vanished nav.

4. **What does the page show instead of the fake mockup?** Real screens?
   Illustration? A single moment (the receipt-to-record instant) rather than a
   whole UI?

5. **How do you show the confidence ladder honestly** when it is nine worded
   states and no numbers — and when chroma is supposed to mean status? This is
   the same unsolved question the add-record brief raised; an answer here should
   agree with the one there.

6. **What is the actual argument?** Right now the page argues "we have
   features". The stronger one is probably a specific moment: the glovebox of
   receipts, or the mechanic asking a question you cannot answer, or the buyer
   asking for history you cannot produce.

7. **Do cars and motorcycles both appear?** And if so, where — one hero, or a
   choice?

8. **Is the mechanic story a section or the second half of the page?** It is the
   most differentiated thing here and currently sits seventh.

9. **How many sections should there be at all?** Nine is a guess, not a finding.

---

## Rules to keep

- **No claim the product cannot back.** If a design needs a feature to exist,
  say so rather than writing the copy as if it does.
- **No percentages, no numeric confidence scores.** They are gone from the
  product.
- **No due dates, intervals, or "next service" predictions.** Removed
  deliberately; a design that implies one reintroduces it.
- **Owner approval is part of the mechanic story**, not friction to hide.
- **The type floor is real**: 16px body, 15px for secondary. This audience is
  the reason it exists.
- **Every path out of this page leads to `/register` or `/login`.** There is no
  other conversion, no demo mode, no guest browse.
- **Motorcycles are not a footnote.**

---

## Practical notes for whoever implements it

Not constraints on the design — just the shape of the ground.

- Route `/`, single component `pages/LandingPage.jsx` (390 lines), no data
  fetching, no backend calls. `isLoggedIn()` swaps the CTA to "Open App".
- Its ~340 `.fig-*` rules live at the **bottom of the shared 11k-line
  `styles.css`**, which three other people have open. `styles/ink-landing.css`
  exists precisely to override them by load order instead of editing in place.
  A redesign should almost certainly **replace both** with one new sheet rather
  than continue the override stack.
- Tokens available: Ink's `--ink`/`--paper`/`--rule`/status ramp in
  `ink-app.css`. The landing's `--tv-*` names are legacy aliases already
  remapped onto Ink hexes — do not build new work on them.
- Icons are `lucide-react`, already a dependency.
- Fonts loaded: Public Sans, Source Serif 4, JetBrains Mono. Anything else is a
  new network request on the first page a stranger sees.
