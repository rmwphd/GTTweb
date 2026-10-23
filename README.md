# GTT Web

A browser version of **Guntram's Tabletweaving Thingy** (GTT), the Windows program by Eckhard Gartz for designing tablet-woven bands. GTT Web opens the `.gtt` pattern files GTT made and shows them the way GTT did, so those patterns stay usable on any modern computer, tablet or phone.

Everything runs in the browser. Files are read on your device and are never uploaded.

## What works now

- **Opens every GTT file type**: threaded-in, double-face (2 and 4 colour), 3/1 broken twill, brocade, twist-patterned, lettered bands and fonts. Files from GTT 1.05 through 1.17 are supported, including the older layouts (`Threaded`, `Reversals`, missing palettes).
- **Woven preview for threaded-in patterns**, matching GTT's "real image": thread shapes, turning reversals, double turns, twists and idling cards.
- **Block view** and the display options from GTT's toolbar: outlines, thread colours, twining direction, direction changes, card twists, idling cards, uppermost hole, turning direction (letters, lines or black and white blocks), pick and card numbers, threading under the band, and guide lines.
- **Front or back** of the band, **vertical or horizontal** layout, zoom, and GTT's display proportions (width, end height, centre height).
- **Turning sequence** in GTT's layout (forwards, backwards, twist, with card ranges like `1 - 3; 5`), plus pack names when a pattern uses packs.
- **Threading chart**, **pick-by-pick view** (what to do on each pick and which thread ends up on top of every card), and pattern details with notes and palette.
- **Save .gtt** in GTT 1.17 format (files open in the original GTT), **save image** as PNG, and **print**.
- Several patterns can be open at once. Files can be dropped onto the page.

For double-face, twill, brocade, twist-patterned and lettered patterns, GTT Web currently shows the design chart. Generating their turning sequences and woven previews is the next stage of work.

## Using it

Open `index.html` in a browser. No build step and no server are needed, although it also works from any static host such as GitHub Pages.

To publish on GitHub Pages, push this folder to a repository and turn on Pages for the main branch (root folder).

## How the simulation was checked

The weaving rules were measured from GTT 1.17 itself, running under Wine, using test patterns with a different colour in every hole. The fixtures in `tests/fixtures` are those test patterns, and `tests/run.js` checks GTT Web against what GTT drew:

- Holes are labelled counter-clockwise, so a forward turn brings up the previous hole (A, D, C, B).
- On a reversal the same thread shows twice.
- A twist flips the card's threading and its turning sense.
- An idle card repeats the previous thread.
- The thread slant follows the card's current threading and the actual turn.

Run the tests with Node:

```
npm install
node tests/run.js
```

`node tests/make-samples.js` rebuilds the two bundled sample patterns.

One part is not yet confirmed against GTT: the colours shown on the back of the band.

## Credits

Guntram's Tabletweaving Thingy was written by Eckhard Gartz. The file format notes and manual are on [his site](https://www.guntram.co.za/tabletweaving/gtt.htm). GTT Web is an independent re-implementation and contains none of GTT's code.
