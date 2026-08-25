# Add a service record, and check it before saving — brief for Claude Design

Two flows to redesign. They are the last screens still on the old tokens —
Garage, the vehicle page, Records and auth are already on Ink.

**On the design system:** you already have Ink from the auth and Garage work.
One correction — the screens as built deviated from that handoff and it was
never re-ratified: control heights are **52px** (not 60/62), input text
**16px** (not 18), labels **15/600** (not 17/700), button labels **16/600**,
form headings **32px** (not 40), and the type floor is "16px body, 15px minimum
for secondary" (not "nothing below 16"). The auth screens as built are the
reference now. Everything else — achromatic, chroma only ever means status, no
drop shadows, Source Serif 4 for headings only, larger-than-usual type and
targets for a middle-aged owner audience — is unchanged.

---

## The flow

```
1. Pick the vehicle          →  card grid, Proceed button
2. Pick the method           →  three cards: Receipt (recommended) / Voice / Manual
3. Capture                   →  one of three screens, depending on the method
4. Check the details         →  the validation screen
5. Confirm                   →  last look, tick a box, save
6. Saved                     →  confirmation
```

A progress indicator covers steps 1–3 only and reads "Pick the vehicle → Choose
how to add it → Add the details". Steps 4–6 have none.

Step 1 is skipped whenever the flow is entered from a vehicle page, which is the
normal way in.

---

## What each screen does

**1. Pick the vehicle** — grid of vehicle cards, one selectable, then Proceed.

**2. Pick the method** — three cards:
- *Photo of the receipt* — "Recommended". We read the details off it.
- *Voice note* — "Quick entry". Say what was done, we write it down.
- *Type it in* — "Your own words". Nothing is read or guessed.

**3a. Receipt capture** — the most important screen, and a phone screen in
practice. Two tabs (upload photos / use camera) that both add to **one** page
list. Camera mode has a live preview with corner guides and a lighting warning.
Uploaded and captured pages appear as a reorderable grid — page number,
thumbnail, remove / retake / replace / move. Blurry pages get flagged. Multi-page
receipts are normal and **page order matters**. Submitting shows a full-screen
two-step overlay: saving pages → reading.

**3b. Voice capture** — record, playback, re-record. Raw transcript appears
first, translation to English is a separate deliberate action. Transcript is
always editable.

**3c. Manual entry** — plain form: date, odometer, total cost, shop, location,
remarks, plus the service items editor.

**4. Check the details** — see below. This is the one that most needs solving.

**5. Confirm** — a summary of what will be saved, a required checkbox ("I have
checked these details and they match my receipt"), and Save to my records.

**6. Saved** — confirmation, then View History / Add Another.

---

## The validation screen, in detail

One route, but **two completely different layouts** depending on where the draft
came from:

- **Receipt drafts** — two columns. Left: the receipt image, plus a collapsed
  disclosure holding the raw text we read off it. Right: the fields. A bar
  across the top shows the vehicle and a count — *"3 fields to check"* or
  *"Nothing flagged"*.
- **Voice and manual drafts** — form on the left, a sidebar on the right
  carrying *Ready to save / Not ready to save yet*, the blocking problems, and
  warnings.

The split was practical, not designed: the receipt layout had no room for a
third column, so the sidebar was dropped.

**Fields**, in the order a receipt is read — date\*, odometer, total cost\*,
shop name, location, remarks. Plus a collapsed **coverage** toggle ("Insurance
or warranty covered part of this"), off by default because most records have
none.

**Every field carries one badge.** Seven possible states, most urgent wins:

| Badge | Means |
|---|---|
| **Needed to save** | required and blank |
| **Cannot be right** | present but impossible (e.g. a future date) |
| **Two different values found** | the receipt said two things |
| **Not on receipt** | never found, still blank |
| **Check this one** | found, but not confidently |
| **Read between the lines** | worked out rather than read off |
| **Read from receipt** / **Heard in your note** | read cleanly |
| **You entered this** | typed by the owner |

Under a field, where there is one, sits a **real quote from the receipt**
("Page 2: TOTAL AMOUNT DUE 4,500.00").

**Below the fields**, a "What was done" block: a live balance check — *lines add
up to X / receipt total says Y / short by Z* — over a list of services, each
holding the receipt's individual lines, each line tagged Labour / Part /
Supplies / Fee.

**Two buttons at the bottom:** Save changes, and Continue to confirm — the
second disabled until you've saved.

---

## Problems to design against

1. **Receipt drafts never show their warnings.** The sidebar was dropped from
   that layout, so plausibility warnings ("this odometer is below what's already
   recorded"), the possible-duplicate warning, and the summary are invisible on
   the most common path. The counter still counts them, so the bar can say
   "3 fields to check" on a screen showing nothing to check.
2. **A duplicate warning belongs to the whole record, not a field**, so no field
   badge can carry it. There is currently nowhere for it to go.
3. **Two layouts, two mental models** for the same task.
4. **The progress indicator covers three of six screens** — and hides the three
   where the owner does the actual checking.
5. **The line-item editor nests five levels deep**, inside the dense half of a
   two-column layout, on what is often a phone.
6. **Two screens for one decision** — which car, and how.
7. **Letter tiles standing in for icons** (`R`, `V`, `M`, `REC`, `OK`).

---

## Open questions

1. **How do seven badge states work in a system where chroma only ever means
   status?** This is the big one — whatever answers it applies to the rest of
   the product too.
2. **One layout for all three input methods, or keep the receipt split?** If
   one: where does the receipt image go, given it's the thing being checked
   against?
3. **Where do non-blocking warnings live**, and where does a record-level issue
   live?
4. **Does confirm stay its own screen?** It re-shows what you just reviewed. The
   checkbox is a deliberate moment of assent, but it's one decision across two
   screens.
5. **Do steps 1 and 2 merge?**
6. **Is there a progress device across all six screens?**
7. **What is the phone layout?** The receipt path is inherently a phone path and
   nothing here was designed for it first.

---

## Rules to keep

Each one replaced something that broke:

- **Every field on the review screen saves.** No editable field that silently
  discards.
- **The badge wording is identical on the review and confirm screens.**
- **Only real quotes from the receipt** — never an explanation of how the system
  works dressed up as evidence.
- **The balance shows the gap and never corrects either side** — only the person
  holding the receipt knows which figure is wrong.
- **A blank optional field is not a problem to fix**, and isn't counted as one.
- **No AI or provider names in anything the owner reads.**
- **Progress reflects what's actually happening**, never a timer.
- **Receipt lines stay in printed order**, so they can be read against the paper.
