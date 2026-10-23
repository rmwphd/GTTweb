# Notes on GTT 1.17

Findings from running the original GTT 1.17 under Wine and reading its files. These guide the port.

## File format differences from Guntram's spec

- Root is `<TWData>` with `<Source>`, `<Version>` and (1.17) an empty `<Release/>`.
- Pattern types written by 1.17: `Threaded-in` (1.05 and 1.12 wrote `Threaded`), `Doubleface` (lowercase f), `BrokenTwill`, `Brocade`, `LetteredBand`, `TwistPatterned`. Font files use `<Font Type="Font">` in place of `<Pattern>`.
- Hole colours are 0-based indexes into the palette. Palette `<Colour Index>` is 1-based. Colours are Windows COLORREF integers (0x00BBGGRR).
- The default palette is the 16 standard Windows colours, in the order black, maroon, green, olive, navy, purple, teal, grey, silver, red, lime, yellow, blue, fuchsia, aqua, white.
- Double-face, twill and twist-patterned designs use `<Data>` rows `<P1>` to `<Pn>`. P1 is the first (bottom) row. `X` marks the pattern colour and `.` the background.
- 1.17 adds `<Selvedges><Left><Cards/></Left><Right><Cards/></Right></Selvedges>` to block patterns.
- Twill: `<BackgroundTwill>S|Z</BackgroundTwill>` then `<LongFloats>` rows in the same layout as `<Data>`. GTT 1.11 used `<Reversals>`.
- Brocade (1.17): `<Pattern Type="Brocade" GroundWeave="No">`, `<BrocadePicks>` with `<Pick Index>` (1-based, matches `<Pn>`), `<TieDowns>` (0-based card list) and `<Wefts>` (one digit per card, 0 = none, 1 = weft A). `<Wefts>` thread list, `<Cards>`, `<Palette>`, `<VisualPattern>` rows using letters A to E, and an optional `<GroundWeave><Pattern ...>` holding a whole nested pattern.
- Twist-patterned: `<Threading>` is a comma separated S/Z list, one per card.
- Files are CRLF, two-space indented, no XML declaration, Windows-1252.
- Settings live in `settings.xml` beside GTT.exe, including default display ratios: image Width 3, Centre 0, End 5; double-face 2 by 4; brocade 2 by 2; 3/1 twill 2 by 6; twist-patterned 2 by 3.

## Threaded-in simulation rules (verified)

See `js/sim.js`. Tested by `tests/run.js` against fixtures `t1.gtt` and `t2.gtt`.

## Display (verified)

- Vertical: card 1 on the left, pick 1 at the bottom. Horizontal is a 90 degree anticlockwise rotation (pick 1 on the right, card 1 at the bottom).
- Direction change marker: red dot. Twist marker: blue diamond with a red edge. Idle marker: green square. All sit on the boundary where the pick starts.
- Uppermost-hole tags: for an untwisted card the tag equals the visible hole; each twist reflects the labelling about the last visible hole.
- Twining marker colours: S-twined (\) red, Z-twined (/) blue.

## Not yet verified

- Colours on the reverse face.
- How GTT turns double-face, twill (one-pack method, FFBB starting offsets, long floats), twist-patterned, brocade and lettered designs into turning sequences and woven images. GTT can be driven under Wine to capture these (Create menu, then Real Image tab).

## Full feature list (from GTT.exe's forms)

File: load, save, print, browse, settings. Create: threaded-in (3 to 8 holes), double-face (simple, multiple colours, 6-hole), 3/1 broken twill, font, lettered band, brocade, twist-patterned. Edit: palettes, join patterns (side by side, end to end), convert double-face or twill to brocade, pattern details, pattern size, card list, selvedges, clear, undo, area selection, copy and cut. View: threading diagram, notes, display flags, rotate, display ratios, grid colour, reverse side, card list, clipboard, display profiles. Design: save, print and copy image, import monochrome bitmap, shift, invert, mirror, realign, import and remove ground weave, zoom.
