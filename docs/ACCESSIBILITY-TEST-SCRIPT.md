# Accessibility test script — 313 Help

**For a person, not an agent.** Everything in [ACCESSIBILITY-AUDIT-2026-09-20.md](ACCESSIBILITY-AUDIT-2026-09-20.md)
that a test or a headless browser can settle is settled and guarded by tests. What is left needs a human being
with the tool in their hands, ideally a Detroit resident who uses it every day. This is that list, written so
somebody can run it in about an hour without knowing anything about the code.

Run it again after any change to the map, the top bar, the report flow or the crisis path.

## Before you start

- Any browser at `localhost:5173` (`pnpm --filter @313help/web dev`) or the deployed site.
- One screen reader from the table below, turned on before you open the page.
- Nothing about you is collected by the app. Nothing you do here is sent anywhere. You can stop at any point.
- Write down what you **heard**, in your own words, not what you think it meant to say.

| Tool | Platform | Turn it on |
|---|---|---|
| VoiceOver | iPhone / iPad | Settings → Accessibility → VoiceOver (or triple-click the side button) |
| VoiceOver | Mac | ⌘ + F5 |
| TalkBack | Android | Settings → Accessibility → TalkBack |
| NVDA | Windows | Ctrl + Alt + N |
| Switch Control | iPhone | Settings → Accessibility → Switch Control (a single switch, step scanning) |
| Voice Control | iPhone / Mac | Settings → Accessibility → Voice Control |
| High contrast | Windows | Settings → Accessibility → Contrast themes → Night sky |
| Increase contrast | iPhone / Mac | Settings → Accessibility → Display → Increase Contrast |

**Pass criteria, everywhere below:** you could finish the task, you were never stuck, and nothing was read out
that would give away what you were looking for to somebody standing next to you.

---

## 1. The crisis path, under a screen reader

Home → **"I am not safe at home"** → the hotline row → **Leave this page fast**.

Expected:
- The hotline and 911 are read **before** any list of places.
- The phone number is read as digits you could dial, in order, with the extension after the number and not
  before it. (In Arabic too.)
- "Leave this page fast" is reachable without walking the whole page, and pressing it leaves at once. Back does
  not bring the app back.

Say what you heard. Two things to watch for and write down either way:
- Did anything read out say what kind of screen it was in a way a person nearby could hear and understand?
- How many swipes from the top of the page to the quick exit?

## 2. Does the app's own voice land, and does it land twice?

This is the one we most need an answer to.

The app has a single polite live region. It speaks after: a report sent, a report queued offline, a place
saved, the key reset, a ZIP it does not know, location refused, a map layer switched on, the language changed,
**and the name of a screen that leaves no trace** (every "what do you need" screen, search, Saved, a private
listing, Urgent help — those windows are titled "Find help · 313 Help" and the like, so the window title cannot
name the screen and the live region does instead).

Do this: Home → **"Food"** → **"Today"** → on a card, **"Still open, info is right"**. Then go back and open
**"I am not safe at home"**.

Write down:
- Did you hear "Thanks. We got it." after the report, or did it get swallowed by whatever the reader was
  already saying?
- On the "I am not safe at home" screen, how many times did you hear the screen's name — **once, or twice**?
  (Once is right. Twice means the heading announcement and the live region are both landing, and we should drop
  the live one. Zero means the heading is doing the work and the live one is being dropped, which is also fine.)

## 3. The map, by keyboard and by switch

Map tab → Tab until the map picture itself has focus (you will hear the map's one-sentence description and
"Arrow keys move the map… Press N for the next place…").

Do this:
1. Press **N** five times. **P** twice.
2. Press **Enter**.
3. Come back, press **N**, then **Escape**.
4. Press **Tab**.
5. Open the map full screen (the ⤢ button), and do 1–3 again.

Expected:
- Each **N** names one thing on the map — a greenway stretch with what state it is in, or a place with what
  kind of help it is and whether it is open — and says "Press Enter for details."
- The order is the same every time: the greenway first, along the route, then places, nearest the middle first.
- You can **see** where you are: a ring you can find without hunting, that never sits half off the edge.
- **Enter** opens that place's own screen. **Escape** puts you back on the map, not out of it.
- **Tab** always leaves the map. You are never stuck in it.
- Full screen behaves the same, and **Urgent help** is still one action away inside it.

Then the real question: **did you use it, or did you go to "See this map as a list" instead?** Either answer is
useful. Say which, and why.

On a switch: can you reach and use N and P at all? (If your switch setup cannot send letters, say so — that is
the answer we need, and it means the list is doing the work.)

## 4. The map, to look at

Map tab, in daylight and in a dark room, both themes:
- Can you tell the small streets from the big ones?
- Can you tell where the four cities stop? (Outside them the ground is **hatched** — diagonal lines.)
- Do the coloured routes and the coloured dots still stand out over the streets, or has it gone flat?
- Turn on **Increase contrast** and look again. Then Windows high-contrast, and look again: every line should
  still be there, in the system's own colours, and the greenway's four states should still be told apart by
  their **dash patterns** and by the key underneath.

## 5. Voice Control

On any listing: say **"Tap Call"**, **"Tap Directions"**, **"Tap Save"**, **"Tap Urgent help"**, **"Tap
Language"**.

Expected: every one works on the first try. If you had to guess a different name for a control, write down what
you said and what is printed on it.

## 6. A Braille display, on a listing

Read a listing from the top. Write down the order the badge ("A person called them on…"), the open/closed pill
and the name come out in, and whether that order makes sense without sighted context.

## 7. Magnification

A laptop at **400 %** zoom, and a phone at the largest text size:
- Nothing runs off the side of the screen; you never scroll sideways.
- A phone number never breaks in the middle.
- The side rail has collapsed to the phone layout, and Urgent help is still there.
- The top bar is still one line: language, then Urgent help.

## 8. The overdose steps, under stress

Not a screen-reader task. Read Home → **"Someone may be overdosing"** out loud to somebody who has never seen
it, and watch. Six steps with 911 above them. Could they act on it? Which step did they re-read?

## 9. Reading level

Sit with somebody and have them read three screens out loud: Home, "A place to sleep", and Your privacy. Mark
every word they stumble on. A formula says these are below a 6th-grade level; that is not the same thing.

---

## What to do with the results

Anything that fails goes into `docs/ACCESSIBILITY-AUDIT-2026-09-20.md` §1 as a new row with the date and the
tool it was found with. Anything that passes gets ticked off in §5 with the date, the tool and the version of
the app (About → the line beginning "List version"), so the list of what is still owed keeps shrinking instead
of being re-run from the top every time.
