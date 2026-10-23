# GTT Web

A browser version of **Guntram's Tabletweaving Thingy** (GTT), the Windows program by Eckhard Gartz for designing tablet-woven bands. GTT Web opens the `.gtt` pattern files GTT made and shows them the way GTT did, so those patterns stay usable on any modern computer, tablet or phone.

Everything runs in the browser. Files are read on your device and are never uploaded.

GTT Web is free and open source under the MIT License.

## What works now

- **Opens every GTT file type**: threaded-in, double-face (2 and 4 colour), 3/1 broken twill, brocade, twist-patterned, lettered bands and fonts. Files from GTT 1.05 through 1.17 are supported, including the older layouts (`Threaded`, `Reversals`, missing palettes).
- **Woven preview for every pattern type**, matching GTT's "real image": thread shapes, turning reversals, double turns, twists and idling cards.
- **Turning sequences worked out from block designs**, the way GTT does it: double-face (2 and 4 colour), 3/1 broken twill (with long floats, either colour-change method, S or Z background), twist-patterned (by direction change or by twists), brocade (with or without a ground weave), lettered bands and fonts, plus selvedge cards.
- **Turning boxes in Linda Hendrickson's style** beside the band: each pick reads from card 1, counting neighbouring cards that turn together, white for forwards and gray for backwards.
- **Block view** and the display options from GTT's toolbar: outlines, thread colours, twining direction, direction changes, card twists, idling cards, uppermost hole, turning direction (letters, lines or black and white blocks), pick and card numbers, threading under the band, and guide lines.
- **Front or back** of the band, **vertical or horizontal** layout, zoom, and GTT's display proportions (width, end height, centre height). Block designs can also be shown as GTT's design chart.
- **Turning sequence** in GTT's layout (forwards, backwards, twist, with card ranges like `1 - 3; 5`), plus pack names when a pattern uses packs.
- **Threading chart**, **pick-by-pick view** (what to do on each pick and which thread ends up on top of every card), and pattern details with notes and palette.
- **Save .gtt** in GTT 1.17 format (files open in the original GTT), **save image** as PNG, and **print**.
- Several patterns can be open at once. Files can be dropped onto the page.
- **Display profiles**: save a set of display choices under a name and switch between them, like GTT's.

## Editing

The Edit tab covers GTT's designers, with undo and redo (Ctrl+Z, Ctrl+Shift+Z) for every change.

- **New patterns** of every type: threaded-in (3 to 8 holes), double-face (2 or more colours), 3/1 broken twill, twist-patterned, brocade, fonts and lettered bands.
- **Threaded-in**: card setup (count, hole colours, S/Z threading with GTT's presets, select, move, insert and delete cards), a pick builder with forwards, backwards, idle and twists per card, packs (create, rename, choose cards, turn by pack, break up into cards), add, reverse, repeat and delete picks, and tools on the band to recolour a thread, swap a card's direction at a pick or add a twist.
- **Block designs** (double-face, twill, twist-patterned, brocade): draw by clicking or dragging on the design, resize, shift, invert, mirror, clear, import a black and white image, card colours and threading, selvedge cards, twill long floats, background twill and realign, brocade wefts and ground weave, and conversion of double-face or twill into brocade.
- **Fonts and lettered bands**: add, remove and reorder letters, draw each letter, set spacing, kerning, height and threading; type the band text, load a font file or use an open font, and save the band as a double-face pattern.
- **Palette**: first and second colours as in GTT, edit any palette colour, swap or replace colours across the pattern.
- **Join** two open patterns side by side or end to end.
- **Name and notes** for every pattern.

Patterns saved after editing open in the original GTT 1.17; every pattern type was checked that way.

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

The double-face, twill and twist-patterned generators were checked the same way, pick by pick, against turning directions and colours captured from GTT (`tests/expected`).

Not yet confirmed against GTT: the colours on the back of the band, the order of letters in lettered bands, and brocade over an imported ground weave.

One difference is deliberate. When GTT is set to make twist-patterned designs with card twists, it places each twist one card to the left and one row later than the design calls for. That looks like a bug in GTT, so GTT Web twists the card whose cell changes. GTT's default method (changing the turning direction) matches exactly.

## Credits

Guntram's Tabletweaving Thingy was written by Eckhard Gartz. The file format notes and manual are on [his site](https://www.guntram.co.za/tabletweaving/gtt.htm). GTT Web is an independent re-implementation and contains none of GTT's code.

## License

GTT Web is released under the [MIT License](LICENSE). You may use, copy, change and share it, including in other projects, as long as the copyright notice stays with it. The bundled sample patterns and the documentation are covered by the same license.

## Your patterns are yours

The license covers GTT Web itself, not the patterns you make or open with it. A pattern you design in GTT Web, or a `.gtt` file you open, belongs to whoever made it. GTT Web never claims any rights in it. If you open someone else's pattern, follow whatever terms its maker set.

GTT itself was released as freeware by Eckhard Gartz, who also published the file format. GTT Web follows that spirit.
