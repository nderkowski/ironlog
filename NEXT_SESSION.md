# Prompt for the next session

Copy everything below the line into a new chat.

---

I'm continuing work on Iron Log, a single-file lifting logbook PWA at
`nderkowski/ironlog`. It's live at https://nderkowski.github.io/ironlog/ and I
use it in the gym several times a week, so it's real software with a real user,
not a toy.

**Read these first, in this order, before writing any code:**

1. `PROJECT_STATE.md` — how it works and why. The **Traps** section is the
   important part; every entry cost real time to learn. Read it even if the task
   looks unrelated.
2. `ROADMAP.md` — the **"Next session starts here"** section at the top is your
   work queue.
3. `PRODUCT.md` — only if the question is commercial rather than technical.

**How this project works, so you don't have to rediscover it:**

- One HTML file, vanilla JS, no framework, no build step, no dependencies, no
  network calls. `index.html` is the whole app.
- GitHub Pages serves `main`. Work on a branch is invisible to my phone until
  it's merged — a whole test round was lost to that once. `BUILD` prints at the
  foot of the Plan tab; bump it and `CACHE` in `sw.js` in the same commit as any
  change, or my installed phone serves a cached old version.
- **Test by driving the real UI with Playwright, not by calling functions.**
  Chromium is at `/opt/pw-browsers`, Playwright at
  `/opt/node22/lib/node_modules/playwright`. Serve with
  `npx http-server -p 8117 -s -c-1 .` and use a 390×844 mobile context. Most of
  the genuine bugs in this codebase were invisible to function-level tests and
  obvious the moment a real click drove them. There are ~212 assertions across
  13 suites from previous sessions — I don't have them saved, so write fresh
  ones for whatever you touch.
- Ask before merging to `main`.

**The queue, in order.** Items 2–6 in `ROADMAP.md` are already diagnosed — each
says whether it was reproduced, and the ones I found while investigating include
the cause. Don't redo that work.

Start with **item 2**: the progression engine appears to always suggest more
weight when I hit the bottom of the rep range, instead of suggesting more reps
first. Double progression demonstrably works on a stock exercise, so it's
conditional on my data. The roadmap lists three candidate causes and the single
question that distinguishes them — ask me that question first rather than
guessing.

Then items 3, 5, 6, and finally 4 (A/B week variants), which is the biggest and
touches the data model — the roadmap has a design sketch, and I'd like to talk
it through before you build it.

**How I like to work:** tell me when something I've asked for is a bad idea, and
say so plainly rather than building it and hedging afterwards. If you can't
reproduce something I report, say that instead of inventing a fix. If a test
result surprises you, dig into why before moving on — that's caught several real
bugs here. Don't tell me something works until you've actually seen it work.
