# Settings — brief for Claude Design

One screen: `/account-settings`, reached from the last item in the app sidebar.
It is the **last page in the signed-in app that was never designed**. Garage,
Vehicle, Records, add-record and the auth screens all went through Ink.
Settings did not — it still lives entirely in the legacy `styles.css` block at
lines 7329–7690 and inherited only the palette remap, never the type, weight,
spacing or shell decisions.

**Everything is open.** Section set, navigation model, what belongs on this page
at all, composition, phone layout. Treat what follows as a description of what
the screen does today and where it is wrong — not as a layout to polish.

---

## On the design system

You already have **Ink** from the auth, Garage, vehicle and add-record work.
This page is *inside* the app, so unlike the landing page there is no question
of how far it may drift: it must be Ink, straightforwardly.

- Achromatic. **Chroma only ever means record or access status** — never
  decoration.
- No drop shadows. Surfaces separate by tone and hairline.
- Source Serif 4 for headings only; Public Sans for everything else; JetBrains
  Mono for figures.
- 16px body, 15px floor for secondary text, 52px controls.

Tokens live at the top of `src/styles/ink-app.css` (`--paper`, `--surface`,
`--ink`, `--ink-muted`, `--ink-faint`, `--rule`, `--rule-faint`,
`--rule-hairline`, `--surface-sunken`, `--surface-head`, the `--status-*` ramp,
`--field-h`/`--button-h` at 52px, `--radius` 8 / `--radius-card` 12). The other
Ink sheets — `ink-auth.css`, `ink-garage.css`, `ink-vehicle.css`,
`ink-record.css` — are the precedent for how a screen is built in this system.
**A settings design should ship as a new `src/styles/ink-settings.css`**,
imported at the end of `main.jsx`, overriding the legacy block rather than
rewriting it in place (that file is shared with three other people).

---

## Who it is for

The signed-in vehicle owner. Filipino, cars and motorcycles, skews older than a
typical SaaS audience, and **often on a phone**. They come here rarely and for
one of three reasons: fix their name or photo, change their password, or — the
one that actually matters — **find out who can see their vehicle records and
cut them off.**

That third reason is the only urgent one, and today it is buried in the fourth
and fifth tabs of a five-tab menu.

---

## What the page does today

A `page-header` ("Account Settings" / "Manage your account preferences and
security") over a two-column grid: a 220px vertical menu on the left, one card
on the right. The menu holds five items plus a red **Sign Out** at the bottom;
each has a leading lucide icon and a trailing `ChevronRight` that points
nowhere — the panel is beside it, not after it.

**1. Profile Information** — 64px round avatar (initials, or an uploaded photo),
name, the literal string "Vehicle Owner", a "Change photo" text button. Then
first/last name in a two-column grid, email, phone. Save writes to Supabase auth
metadata and syncs to the API. Avatar and phone are **localStorage only**
(`trevora.profileExtras`) — the photo is a base64 data URL in localStorage and
does not survive a different browser. The design should not imply it is stored
anywhere.

**2. Password & Security** — three password fields with eye/eye-off toggles,
capped at `max-width: 420px`. Changing the password re-authenticates by calling
`signInWithPassword` with the current password first. Despite the section name
there is **no other security content**: no session list, no 2FA, no "signed in
on these devices", no last-sign-in.

**3. Notification Preferences** — seven rows, each a full-width button with a
label and a 40×20 toggle. The seven: draft needs review, missing required
fields, record saved, mechanic requested access, mechanic access
approved/denied, temporary access expired, AI explanation unavailable. These are
**localStorage only** (`trevora.notificationPreferences`) and nothing reads them
— no email, no push, and the in-app `/notifications` page does not filter on
them. Toggling one fires a green success banner saying "Notification preference
saved," which is the strongest confirmation on the page for the action that does
the least.

**4. Privacy & Access History** — a flat list of every mechanic access request
ever made against the owner's vehicles: mechanic name, shop, vehicle, "Requested
{datetime}", and a status pill. Read-only. No filter, no grouping, no
pagination.

**5. Active Shared Sessions** — approved, unexpired sessions only. Clock icon,
mechanic and shop, vehicle, "1h 12m remaining", and a **Revoke** button. Footer
line: "All sessions automatically expire after the approved time limit."

Feedback for all five is a single shared `message` state rendered as one green
or red banner, cleared on every tab switch and every keystroke.

---

## Problems to design against

1. **The most important control is the least visible.** Revoking a live mechanic
   session — the one thing on this page with real consequences — is two clicks
   deep in a menu whose first item is "change your photo". Nothing on arrival
   tells the owner whether anyone can currently see their records.

2. **It duplicates a whole other screen.** `/access/requests` ("Shared Access")
   is its own sidebar item and calls the *same two endpoints* as tabs 4 and 5,
   with more features: filters, approve/deny, QR generation, a sessions view.
   Settings shows a weaker read-only copy of it under different names. Two
   screens for one idea, and the owner has no way to know which is
   authoritative. **Deciding what Settings keeps here is the biggest structural
   question in this brief** — it may be a summary that links out, or it may be
   nothing.

3. **Half the page is a preference that does nothing.** Seven notification
   toggles write to localStorage and are read by no code. Either the design
   accounts for that honestly, or these rows should not look like settings that
   take effect.

4. **"Password & Security" is only a password.** The name promises a security
   surface the page does not have. Either the section is called what it is, or
   the design proposes what genuinely belongs there — and note that *the real
   security content already exists on this page*, mislabelled as tabs 4 and 5.

5. **The phone layout is a stack and nothing else.** At ≤820px the two-column
   grid and the name grid collapse to one column, which means a ~300px-tall list
   of six menu buttons sits above every panel, on every visit, and the owner
   scrolls past the whole menu to reach any content. There is no back-to-menu
   step, no accordion, no anything. The most common device gets the least
   thought.

6. **It is the last non-Ink surface in the app.** White cards with
   `box-shadow: 0 14px 34px rgba(28,27,25,.04)` — Ink has no shadows anywhere
   else. Hardcoded hexes rather than tokens throughout the block. 10px radius
   where Ink uses 8 and 12. No serif heading treatment. `.status-pill` at
   `0.78rem` (~12.5px) and `.settings-footnote` at `0.85rem` — both under the
   product's own 15px floor.

7. **Chevrons that lie.** Every menu item carries a `ChevronRight`, the
   universal "this opens another screen" mark. On desktop it opens the panel
   beside it. On phone it opens a panel below it. It never means what it draws.

8. **The toggle is not a control.** `.toggle-switch` is a `<span>` inside a
   `<button>` — no `role="switch"`, no `aria-checked`, and the state is carried
   by a 40×20 pill whose only difference between on and off is dark vs. light
   beige. Under Ink's own rule (status is never colour-only) it should carry a
   word.

9. **One banner for five sections.** Success and error share a single slot that
   appears in a different place in each panel — inside the form in profile and
   security, below the list in notifications, above it in privacy — and is wiped
   by any keystroke. There is no per-field validation anywhere; "First name,
   last name, and email are required" appears as a banner after submit.

10. **Sign Out is styled as a menu item.** It sits in the same list as the five
    navigation targets, differing only by red text — the one item that leaves
    the app, drawn as if it were a sixth panel. It also has no confirmation.

---

## Truth constraints — do not design a claim the product cannot cash

- **Roles.** The only owner-facing role is `VEHICLE_OWNER`. The "Vehicle Owner"
  line under the avatar is a constant, not a setting. **Mechanics are never
  registered users** — there is no mechanic account to manage here.
- **No plan, billing, subscription or team.** Trevora has none. Do not design a
  plan card.
- **No 2FA, no device list, no login history.** Supabase Auth is configured with
  email/password only.
- **No data export, no account deletion, no "download my records".** Neither
  exists in the API. If the design proposes one, mark it clearly as proposed.
- **No theme, language or locale setting.** The app is English, one theme. Dates
  render `en-PH`, hardcoded.
- **Avatar and phone are browser-local**, per above.
- **Access is always single-vehicle, read-only, owner-approved and expiring.**
  Nothing here can grant standing access, and no design should imply a permanent
  "trusted mechanic".

---

## Open questions — yours to answer

1. **What is this page actually for, once `/access/requests` exists?** Is
   Settings the home of access control (and Shared Access folds into it), or does
   Settings hold identity + password only and point at Shared Access? Pick one
   and design it — the current answer, "both, badly", is the main problem.

2. **Is a five-item vertical menu the right model** for five sections, two of
   which are lists and three of which are short forms? A single scrolling page
   with section rules, an accordion, and an overview-first layout are all live
   options.

3. **What does the owner see first?** If someone can see their records right
   now, should that be the first thing on the screen rather than the fourth tab?

4. **What is the phone layout?** Design it first. Including what happens to the
   menu — a drawer, a list→detail push with a back control, an accordion, or no
   menu at all.

5. **How should a preference that does nothing be drawn** — or should the
   notification section be cut until something reads it?
