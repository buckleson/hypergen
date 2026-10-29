# Promo and launch videos

How to make a 20–40 s product promo, launch film, or announcement that moves like a motion-design piece, not a slide deck. Read alongside [editor.md](editor.md), [easings.md](../guides/motion/easings.md) and [html.md](../reference/jsx/html.md); where this page is more specific, it wins for promos only.

## When to use

- A product launch, feature launch, funding or milestone announcement, or social teaser.
- The picture is made, not shot: kinetic type, an animated recreation of the product's UI, numbers, logos. Footage is optional (an A-roll voice or a screen capture can run underneath).
- Not for long-form edits, talking heads, or tutorials. Those follow the editing loop in editor.md.

## The brief

Write `brief.md` before any JSX. Derive it from the product's own site, not from questions.

- **Colours.** Read the site's CSS (custom properties, button and background colours). Record background, text, secondary text, hairline, and the one accent. Most strong brands are near-monochrome plus one signature colour. Keep it that way.
- **Type.** Take the families from the site's `@font-face` or computed styles, with a fallback stack. Confirm each one with the `fonts` tool before you set it.
- **Logo.** Use the site's own SVG (header, favicon, OG image). Never redraw a logo, and never set the name in a font to stand in for it.
- **Real copy.** Lift the hero line, button labels, feature names, placeholder text, and real numbers. A mockup that says "Lorem" or "Click here" reads as fake.
- **Motif.** Note one recurring shape or texture (a gradient beam, grain, a pill, a grid) to use as the single "wow" device.
- **Structure.** List the beats with their second ranges (see below) and one sentence per beat saying what the viewer learns.

Ask only what the site cannot answer: length and aspect ratio, the CTA destination, whether a voice-over or music exists, and permission for any claim or figure that is not public. Everything else goes into the brief as a decision. The user can change it.

## Structure and pacing

A promo is a chain of beats, and each beat makes one point. Lengths for a 30 s, 16:9 piece (scale proportionally for 20 or 40 s):

| Beat | Range | Job |
| --- | --- | --- |
| Hook | 0–3 s | Motion on frame 1. A problem or promise in at most 5 words, or a cursor already typing. Never open on an empty frame or a fade-up logo. |
| Brand stamp | 2.5–5 s | The mark lands, then the name reveals off it. 1.5–2.5 s. |
| Demo 1 | 5–12 s | The core action in the UI: input, action, result. 4–7 s. |
| Demo 2–3 | 12–22 s | One feature per beat, 2.5–5 s each, each a different scale or angle on the UI. |
| Payoff/proof | 22–26 s | A number crash-zoom, a before/after, or a logo cascade. 2–4 s. |
| Lockup + CTA | 26–30 s | Logo, line, URL. The only long hold: 2–3 s readable, still drifting. |

- Shots last 1.5–4 s. Nothing sits fully static for more than about 1 s. A hold keeps a slow drift, counter, shimmer, or rotating gradient going (above one pixel per frame; see pixel snapping in easings.md).
- Overlap beats. The next shot sets off 100–300 ms before the last one is gone, so the film never rests at a seam.
- Keep the whole schedule in one timing module, in ms, each mark derived from the one before it. Retiming one beat then shifts everything after it:

```js
// timing.js — one clock for the whole film
export const FPS = 30, F = 1000 / FPS;
export const HOOK = 0,           HOOK_MS = 2600;
export const BRAND = HOOK + HOOK_MS - 6 * F;   // lapped, not butted
export const BRAND_MS = 2000;
export const DEMO = BRAND + BRAND_MS - 4 * F;
export const T_TYPE = DEMO + 500, CHAR_MS = 38;
```

## Building animated UI mockups

Rebuild the product UI in `<html>`. Don't paste a screenshot. Built UI stays sharp at any zoom, every part can move on its own, and the copy is real.

- **Design units, one scale.** Build the panel at its designed size, place it with a single scale `S`, and centre it by arithmetic: `left = (1920 - PW*S) / 2`. A panel fills 60–80 % of the frame width. On-screen UI text renders at 32 px or more after scaling.
- **Product colours only where the product uses them.** The submit button and focus ring get the product's blue. Your accent does not leak into the chrome.
- **Cursor.** Use an SVG arrow placed by its hotspot (the tip), not its box. Move it on a bowed path (a quadratic through an offset midpoint), not a straight line, with an `AIM`-style ease that ends gently. Lean it into the travel (rotate −6° to −20°) and let it right itself as it stops. Press means scale 0.9 for about 3 frames, then release. Give the target a hover state 2–4 frames before the press. A ripple or glow from the press point sells the click.
- **Typing.** Derive the text from time so it is deterministic under scrub. Typing accelerates slightly, with about one glyph per frame through the middle, and a caret blinks only while idle.
- **Panels and chips.** Bring the panel up from below the frame in one move. Then stagger its parts (chips, placeholder, button) in by 60–100 ms, so the UI assembles instead of appearing whole.
- **Placeholder → prompt.** Fade the placeholder out, then rise the real words in at the same origin. A highlight band sweeping across the text (a mask over a lit copy) draws the eye before the swap.
- **Results.** Output rows, cards, or tokens arrive one per 40–80 ms in reading order. The newest few can glow in the product colour and cool to ink.

```jsx
import { createTimeline, stagger, cubicBezier } from "animejs";
import { useTicker } from "@hypergen/jsx";
import { createEffect, onMount } from "solid-js";
import { DEMO, T_TYPE, CHAR_MS } from "./timing.js";

const snappyOut = cubicBezier(0, 0.6, 0.4, 1);
const inOut = cubicBezier(0.7, 0, 0.3, 1);
const PROMPT = "Summarise last week's churn";   // real copy from the product

export function Demo() {
  const { time } = useTicker();
  let panel, chips = [], cursor, btn, tl;
  const local = () => time() * 1000 - DEMO;

  // typing is a pure function of time: scrubbing and export always agree
  const typed = () => {
    const k = Math.min(Math.max((time() * 1000 - T_TYPE) / (PROMPT.length * CHAR_MS), 0), 1);
    return PROMPT.slice(0, Math.round(cubicBezier(0.3, 0, 0.75, 0.55)(k) * PROMPT.length));
  };

  onMount(() => {
    tl = createTimeline({ autoplay: false })
      .add(panel, { y: { from: 1080, to: 0 }, duration: 600, ease: snappyOut }, 0)
      .add(chips, { opacity: { from: 0, to: 1 }, y: { from: 16, to: 0 }, duration: 400,
                    delay: stagger(80), ease: snappyOut }, 300)
      .add(cursor, { x: { from: 1500, to: 1385 }, y: { from: 980, to: 655 },
                     rotate: { from: -8, to: -20 }, duration: 600, ease: inOut }, 1900)
      .add(btn, { scale: [{ to: 0.9, duration: 90 }, { to: 1, duration: 160 }] }, 2550);
  });
  createEffect(() => tl?.seek(Math.max(local(), 0)));

  return (
    <html name="Demo" width={1920} height={1080} start={DEMO / 1000} end={(DEMO + 6000) / 1000}>
      {/* panel, chips, <span>{typed()}</span>, button ref={btn}, cursor ref={cursor} */}
    </html>
  );
}
```

Mind the rasteriser rules in html.md. Animate with `translate` and `opacity`, and use `scale` only on small leaf elements with no clip inside. Give decorated boxes `rgba()` colours instead of `opacity` when an ancestor fades. Put a word mask (`overflow:hidden` plus inner `translateY`) only where no ancestor carries a transform.

## Kinetic typography (1920×1080)

| Role | Size | Words per line |
| --- | ---: | ---: |
| Hero word or slam | 220–400, may bleed off one edge on purpose | 1–2 |
| Headline | 120–160 | 3–5 |
| Support line | 56–72 | ≤ 7 |
| Label, eyebrow, small print | 28–36 | ≤ 4 |

- One idea per frame and at most two text elements per shot (design.md). Rewrite long copy instead of shrinking it.
- Keep text 96 px from every edge (5 %), and never closer than the house 64. Large hero type may cross an edge deliberately, cropped hard against it. "Almost inside" reads as a mistake.
- Kinetic lines stand alone on a plain ground, so centre them optically: measure the line and set `left = (1920 - w) / 2`, and set the vertical position from cap height, not the line box. Copy beside UI or footage follows design.md (left-aligned, anchored low).
- Reveal type by word or by character. Each word rises through its own clip box, staggered 30–60 ms in reading order. Opacity finishes before movement, so the word reads before it settles. Blur 8–14 px → 0 alongside the rise adds weight.
- Vary the entrance between beats: a rise, a slide-from-edge slam, a crash-zoom (scale 3 → 1 with an `expoOut`-style ease), a character recolour wave. Use one flourish per beat (video.md).
- Tight tracking (−0.02em) on display sizes, mixed case for statements, caps only for short labels.

## Camera and transitions

- **Camera = one transform over the whole shot.** Push in on the thing being clicked (1.3–2× about its centre), pull back to reveal context, drift 20–60 px across a hold. Inside `<html>`, avoid `scale()` on a full-frame wrapper (it blanks in captures). Instead keyframe an `<adjustmentLayer>` over the HTML node, with `pivotX`/`pivotY` on the target. For a deep push, author the HTML box at 2× and start the node at `scale` 0.5, so the zoom never upsamples.

```jsx
<html id="demo-ui" start={5} end={12} width={1920} height={1080}>…</html>
<adjustmentLayer name="Push to submit" start={9.2} end={12} pivotX={1385} pivotY={655}>
  <keyframeTrack property="scale">
    <keyframe time={0} value={1} easing="cubicBezier(0.7,0,0.3,1)" />
    <keyframe time={0.7} value={1.8} />
  </keyframeTrack>
</adjustmentLayer>
```

- **Hand-over.** The outgoing shot accelerates out (ease-in, 400–500 ms) along the direction it was already moving. The incoming shot arrives from that side at the same speed and decelerates (ease-out), overlapping by 100–300 ms. Both are fastest at the seam, so it reads as one swing.
- **Match cut / carry.** Turn one object into the next shot: the cursor arrow becomes a text caret at frame centre, a code block pulls back onto the exact rect the next video occupies and crossfades into it, the logo tile slides aside and its edge wipes the name in.
- **Hard cut on action** for energy, with the motion still moving on both sides. **Hold cut** for the lockup.
- Don't put the same text legible on both sides of a seam at two sizes. It reads as a duplicate.
- Keep preset `transition` and `<animation>` types for utility only: a 300 ms dissolve between two shots of the same subject, and `fadeToBlack` at the very end (video.md).

## Easing

Start from easings.md and name every curve after the gesture it serves. Don't use one global ease.

| Gesture | Curve |
| --- | --- |
| Arrivals, chips, words | `snappyOut` or the house Entrance `cubicBezier(0.2,0.75,0.34,0.94)` |
| Slams, crash-zooms, counters, logo set-down | `expoOut` |
| Leaving into a cut | `snappyIn` / `expoIn` / Exit `cubicBezier(1,0.02,0.54,0.42)` |
| Cursor reach, camera A→B at rest both ends | `inOut` |
| Motion carried through a cut, whips | `outIn` |
| Typing, accelerating sweeps | an ease-in such as `cubicBezier(0.3,0,0.75,0.55)` |

Entrances run 300–600 ms and exits about 200 ms (video.md). Camera moves and hand-overs may run 500–900 ms. Continuous drifts span the beat. Ease out on reveal, ease in on exit, so velocity peaks at the cut. `linear` is only for mechanical things: a rotating gradient, a ticker, a progress fill.

## `@inspect` structure

Hoist the look and the copy, not the plumbing:

```jsx
/** @inspect color path="Brand/Accent" */      const accent = "#3B82F6";
/** @inspect font path="Brand/Font" */         const font = "Inter";
/** @inspect text path="Copy/Hook" */          const hook = "Reports in seconds";
/** @inspect text path="Copy/CTA" */           const cta = "acme.app";
/** @inspect number path="Pacing/Demo seconds" min=3 max=10 step=0.5 */ const demoSec = 6;
/** @inspect boolean path="Pacing/Stagger" */  const staggerOn = true;
```

Derive everything else (sizes, marks, layout) from these with plain consts and one `type(size)` helper. Changing the hook, font, or a beat length then reflows the film. Let layout respond to content: fit a gallery to its box, and shorten a line instead of letting it wrap.

## Anti-patterns

- **Slide deck.** Text fades in, sits, fades out, then the next card. Every beat needs motion in, motion through the hold, and a motivated exit or carry.
- **Off-centre by accident.** A block parked top-left with a void beside it. Centre lone type arithmetically. Bleed only on purpose.
- **Small text, empty space.** 40 px copy in a 1920 frame. If it matters, it is 120 px or more. If it doesn't, cut it.
- **Static screenshot as "demo."** Rebuild the UI so the cursor, typing, and result can act.
- **Same entrance everywhere.** Vary by beat (rise, slam, crash-zoom, wipe).
- **Everything moves at once.** Lead with one element and stagger the rest by 3 frames.
- **Cutting at rest.** Both shots are stationary at the seam, which reads as a slideshow.
- **Accent spray.** The brand colour on titles, fills, and underlines. Keep it to one moment per shot.
- **Flat vector gradients.** Add grain or noise, or keep colour to narrow beams and lines.
- **Fake copy and redrawn logos.** Use the site's own copy and logo.
- **Non-determinism.** `Math.random()`, wall-clock timers, or looping child animations in a seeked timeline. Use ramps read modulo, seeded noise, and `hold()` around async GPU setup.
- **Sub-pixel drifts** that stutter, and **`<html>` with no `end`**, which vanishes at 16 s.

## Sound

- Use the audio supplied with the brief, or audio from the brand library (`docs/brand/assets/audio`). Don't invent or fetch tracks. With none available, deliver silent and say so.
- With music: find downbeats with `waveform` and `listen`, and land cuts, slams, and the logo set-down on them. Bed at about −14 to −18 dB under voice, with `gain` in at 1 s and out at 2 s.
- With a voice-over or A-roll: speech wins. Pace beats to the transcript's word times and mute duplicate audio from on-screen copies.
- Put SFX (click, whoosh, tick) on the exact frame of the visual action, only if supplied.

## Verification

After each beat is built, not only at the end:

- `check <scene>`: no black spans, no clips that never appear, no `<html>` cut off at 16 s, every asset loaded.
- `capture <scene> -t …` at every beat. Capture the entrance midpoint, the settled frame, the hold's last frame, and the frames either side of each seam (`hypergen capture main -t 0.2 1.4 2.5 2.6 …`). Read the contact sheet:
  - Is something moving on frame 1, and does each seam have motion on both sides?
  - Is lone type centred and inside 96 px, with hero type 120 px or larger and nothing under 28 px?
  - Is any HTML subtree blank mid-fade or mid-zoom? (See the rasteriser rules.)
  - Is real copy, the real logo, and the brand palette in use, with at most one accent per shot?
  - Can each beat's point be read in the time it is on screen?
- Fix the largest problem first, then recapture the neighbouring beats. Pacing is relational.
- Don't export to check. Export only when asked.

## Worked outline: 30 s SaaS promo, 16:9

Product: an analytics app. The brief is lifted from its site: near-black `#0B0B0C`, white text, one blue accent from its primary button, Inter, its SVG logo, and the hero line "Answers, not dashboards."

1. **0.0–2.6 s, Hook.** Frame 1: a caret blinks at centre. "Still building dashboards?" types in at 140 px, centred, accelerating. Camera drifts 40 px left. Exit: the line sweeps left on `snappyIn`.
2. **2.4–4.6 s, Brand.** The logo tile drops in from 4× to 1× (`expoOut`, 450 ms) on the dark ground, then slides left as its trailing edge wipes the wordmark in. Hold with a slow 1.0 → 1.03 drift.
3. **4.4–11 s, Demo 1.** The product's prompt panel rises from below (600 ms), chips stagger in, and the placeholder shimmers once. The cursor arcs in from bottom-right, hovers, and clicks. The real query types in. Push-in 1.8× to the submit button. The press, a ripple, and a match cut: the arrow becomes a caret at frame centre.
4. **11–16 s, Demo 2.** A chart card builds bar by bar, 60 ms apart, with the newest bar in the accent. A counter rolls to "+38 %" at 120 px.
5. **16–21 s, Demo 3.** Pull back to reveal a three-card grid. Each card answers a real question from the site's feature list, rising 40 px with blur → 0, staggered from centre.
6. **21–25 s, Proof.** "2,000 teams" crash-zooms from 3× to 1×, with a 10-frame accent/ink flicker as it becomes readable. Customer logos cascade beneath on a hairline that draws from the left.
7. **25–30 s, Lockup.** A hard cut to the logo lockup centred at 1.0, the hero line at 64 px below, and the URL at 36 px. The grain-textured accent beam opens behind it once. Hold 2.5 s with the beam still flowing, then `fadeToBlack` over the last 0.5 s.

Before each step moves on: `check`, then `capture` at its marks and seams.

Patterns informed by the MIT-licensed open-projects examples.
