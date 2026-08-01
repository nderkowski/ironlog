# Iron Log

A friction-free lifting logbook. One HTML file, no build step, no accounts, no ads,
no network calls. Your log lives in your phone's browser storage.

```
index.html                 the whole app
manifest.webmanifest       makes it installable
sw.js                      offline cache
icon-*.png                 home screen icons
tools/build-artifact.ps1   regenerates artifact-body.html (retired; kept for reference)

PROJECT_STATE.md           how it works, why, and the traps to avoid
ROADMAP.md                 what is built and what is next
PRODUCT.md                 what it would take to sell it
```

---

## Put it online (GitHub Pages)

> **Status: live at https://nderkowski.github.io/ironlog/** — the steps below are
> kept as the record of how it was set up, and for anyone forking this.
>
> To update a deployed copy, push the changed files and **bump `CACHE` in `sw.js`**
> in the same commit, or installed phones keep serving the cached old version.

Ten minutes, once.

1. Go to **github.com/new**. Name the repository `ironlog`. Set it to **Public**
   (Pages needs public on a free account). Don't add a README. Click
   **Create repository**.
2. On the next screen click **uploading an existing file**.
3. Drag in `index.html`, `manifest.webmanifest`, `sw.js`, and all four `icon-*.png`
   files. Skip `tools/`, `artifact-body.html`, and the `.md` files — none of them
   are part of the running app.
4. Click **Commit changes**.
5. Go to **Settings → Pages**. Under *Build and deployment*, set **Source** to
   *Deploy from a branch*, branch **main**, folder **/ (root)**. Click **Save**.
6. Wait about a minute, then open:

   **https://nderkowski.github.io/ironlog/**

That URL is then yours permanently. Send it to anyone — each person gets their own
private log on their own phone.

**Careful:** a public repo means anyone who finds it can read the *code*. That's
fine — there's nothing personal in it. Your training log never leaves your phone
and is never part of the repo.

**Updating later:** push the change, then bump **both** `BUILD` in `index.html`
and `CACHE` in `sw.js` in the same commit, so installed phones fetch the new copy
instead of serving the cached old one. The build number prints at the foot of the
Plan tab — check it on the phone before reporting a bug, because debugging a
version that isn't running is a very easy afternoon to lose.

### Other hosts

Any static host works, and the files are identical. Drag the folder onto
[netlify.com/drop](https://app.netlify.com/drop) for an instant URL, or use
Cloudflare Pages or Vercel. It needs **HTTPS** — installability and offline mode
both require it. Opening `index.html` straight off your phone's storage works too,
but you lose install and offline.

---

## Install it on your phone

Open the URL in Chrome → menu (⋮) → **Add to home screen** / **Install app**.

It then launches full screen with no browser chrome, works with no signal, and
shows up in your app drawer like anything else you've installed.

---

## Moving your existing log over

Your data is tied to the web address it was created on. Moving to a new URL does
**not** bring it along — you have to carry it across once:

1. On the old page: **Plan → Back up now → Save file to this device**.
2. On the new page: **Plan → Import**, pick that file, tap **Import**.

Do this before you get attached to the new URL.

---

## Backing up

Nothing leaves your phone unless you send it.

**It backs itself up.** Finishing a workout writes a file to your downloads — no
extra tap, nothing to remember. That's the backup that actually happens, because
it rides a button you were already pressing. Turn it off under Plan → Session if
you'd rather it didn't.

**Plan → Back up now** also gives you:

- **Send a copy…** — opens the Android share sheet, so you can drop the file
  straight into Drive, Gmail, or anything else that syncs.
- **Save file to this device** — plain download.
- **Copy as text** — paste it into a note if that's easier.

If sharing ever fails it says so, names the error, and saves a file anyway — you
can't end up with nothing. There's a **"Sharing not working? Test it"** link that
works out which file type your phone will accept and remembers it.

**Getting it back.** A new phone or a cleared browser opens on an empty app with
a **Restore from a backup** button right there on Today. Importing restores
everything exactly: split, history, PRs, settings.

The app also nags you on Today after 8 sessions or a month without a copy.

---

## How the progression works

Each exercise gets a rep range (default 8–12) and a weight step. Before every
session the app reads what you actually did last time and prescribes today's
numbers, with the reason shown on the card:

| What happened last time | What you get today |
|---|---|
| Every set hit the top of the range | Weight goes up one step, reps reset to the bottom |
| Sets landed inside the range | Same weight, one more rep |
| You fell short of the bottom | Same weight and reps again |
| The lift has slid for 3 sessions | Weight drops ~10%, rounded to your step — **once**, then it holds until you beat it |

Leave the top of the range empty and that exercise runs straight sets instead:
hit your target on every set and the weight goes up.

**Warm-ups.** Tap a set's number to flag it a warm-up (it shows **W**), or use
⋯ → *Add a warm-up set*. Warm-ups carry forward to next session so you don't
retype them, and they're invisible to volume, records, trends and the
progression maths — a heavy single before your working sets can't set a fake PR
or convince the app you're lifting less than you are.

**Bodyweight and assisted lifts.** Set ⋯ → *Load type* to Bodyweight (the number
is weight you added) or Assisted (the number is help you took). Fill in your
bodyweight under Plan → Session and pull-ups score properly: they climb by reps
first, then by added weight, and assisted work progresses by *removing*
assistance. Each set stores the load it actually meant, so changing your
bodyweight later never rewrites history.

**RPE.** Off by default. Turn it on under Plan → Session and a small tag appears
on each set *after* you log it — never before, so it can't slow you down. If a
session averages RPE 9.5 or higher, the next prescription repeats the weight
instead of adding to it. Leave it off and nothing changes.

**Deload weeks.** Start one from the banner or Plan → Progression. For seven days
everything is prescribed lighter and shorter on purpose, and those sessions are
excluded from every trend — so a deliberate easy week can't read as a decline and
trigger further cuts.

The **deload call** works one level up. Per lift, it compares the mean estimated
1RM of your last 3 sessions against the 3 before (Epley: `w × (1 + reps/30)`), and
tags each lift CLIMBING, FLAT, or SLIPPING. Once 60% of the lifts in your split
have stopped climbing, Today and Progress both tell you a deload week is due. It
stays quiet until a lift has at least 4 sessions of history behind it.

---

## The rest of it

**Rest timer that reaches you.** The countdown keeps running with the screen off
and your phone in a pocket, then beeps, vibrates and (optionally) shows a
lock-screen notification. It does this by playing a tone too low for a phone
speaker to reproduce, which stops the browser freezing the page — there's a
self-test under Plan → *Test the alarm with the screen off* if you ever doubt it.

**Plates.** Give an exercise a bar weight and every set row shows what to load
per side. Set your actual plate inventory under Plan → Barbell; if a weight isn't
achievable with the plates you own, it tells you what you'd actually get.

**Weekly sets per muscle.** Progress shows how many sets each muscle got this
week, with last week marked on the bar. A set counts 1 toward its main muscle and
½ toward each helper — counting bench as a full set of triceps is how other
trackers end up claiming you did 40 a week. Muscles are guessed from the exercise
name and editable in two taps.

**Records and consistency.** A board of every lift's best set, and a month grid
of the days you trained.

**Supersets.** ⋯ → *Superset with the one above* pairs two exercises as A1/A2.
The rest timer then only fires after the second one.

**Planks and carries.** ⋯ → *Measured in* switches an exercise to time or
distance. An unloaded plank progresses by holding longer rather than being told
to add weight to a bar it doesn't have.

**Templates.** Plan → *Start from a template* for Push/Pull/Legs, Upper/Lower or
3-day Full Body, so setup isn't twenty minutes of typing.

**Undo.** Deleting a session, an exercise or a training day gives you ten seconds
to take it back.

---

## Notes

- **Fixing a mistake:** Progress → tap any session → **Edit**. Change weights and
  reps, add the set you forgot, delete one you didn't do, move the date, or mark
  the whole session a deload. Records are recalculated across your entire history
  on save, so correcting a typo also erases the phantom PR it created.
- Set the rep range per exercise under **Plan → ⋯ → Rep range**, or change the
  default for new exercises under **Plan → Progression**.
- Renaming an exercise renames it everywhere, including past sessions, so its
  history and chart stay in one piece.
- Adding an exercise mid-workout keeps it as a one-off. The finish screen asks
  whether to keep it in that day for good.
- Clearing your browser's site data deletes the log. That's what the backups are for.
