/* Regression tests. Run with:  node tests/run.js
 * Expected values were read off GTT 1.17 (running under Wine) for the
 * fixture files in tests/fixtures, which were made for this purpose.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

global.GTT = {};
GTT._DOMParser = DOMParser;
GTT._XMLSerializer = XMLSerializer;
require('../js/colour.js');
require('../js/gttio.js');
require('../js/sim.js');
require('../js/gen.js');
require('../js/edit.js');

let failures = 0, passes = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passes++; return; }
  failures++;
  console.log('FAIL ' + label + '\n  expected ' + e + '\n  actual   ' + a);
}
function load(name) {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', name));
  return GTT.io.parse(GTT.io.decodeBytes(buf), name);
}
const L = (s) => s.split(',');
function column(sim, ci, key) {
  return sim.rows.map(r => key === 'hole' || key === 'tag' ? GTT.sim.holeLetter(r[ci][key]) : r[ci][key]);
}

// --- T1: all cards F x5, B x5, F x2 ---
{
  const p = load('t1.gtt');
  const s = GTT.sim.simulate(p);
  const want = L('D,C,B,A,D,D,A,B,C,D,D,C');
  for (let c = 0; c < 4; c++) {
    eq(column(s, c, 'hole'), want, 't1 card ' + (c + 1) + ' visible hole');
    eq(column(s, c, 'tag'), want, 't1 card ' + (c + 1) + ' uppermost-hole tag');
  }
}

// --- T2: double turns, twists, idles ---
{
  const p = load('t2.gtt');
  const s = GTT.sim.simulate(p);
  const colours = [
    'D,B,A,D,D,A,C,D', 'D,D,A,B,C,D,A,B', 'D,D,C,C,C,D,A,B', 'D,B,A,A,A,D,C,B', 'D,D,A,A,D,D,A,B'
  ];
  const tags = [
    'D,B,A,D,D,A,C,D', 'D,D,C,B,C,D,A,B', 'D,D,C,C,C,D,A,B', 'D,B,A,A,A,B,C,D', 'D,D,A,A,D,D,C,B'
  ];
  colours.forEach((c, i) => eq(column(s, i, 'hole'), L(c), 't2 card ' + (i + 1) + ' visible hole'));
  // Back face, captured from GTT's "Show Reverse Side" (card 1 is on the right
  // there). GTT Web agrees except on four cells of twisted cards, where GTT
  // shows the same thread on both faces; GTT Web shows the thread that is
  // really underneath (see docs/gtt-notes.md).
  const gttBack = ['B,D,C,B,B,C,A,B', 'B,B,A,D,A,B,C,D', 'B,B,A,A,A,B,C,D', 'B,D,C,C,C,D,A,B', 'B,B,C,C,B,B,A,D'];
  const differ = { '2,3': 'C', '4,6': 'B', '4,8': 'D', '5,7': 'C' }; // card,pick -> GTT Web's hole
  gttBack.forEach((c, i) => {
    const want = L(c).map((h, k) => differ[(i + 1) + ',' + (k + 1)] || h);
    eq(column(s, i, 'backHole').map(GTT.sim.holeLetter), want, 't2 card ' + (i + 1) + ' back face');
    column(s, i, 'backHole').forEach((h, k) => {
      if (h === s.rows[k][i].hole) eq('same thread on both faces', 'different', 't2 card ' + (i + 1) + ' pick ' + (k + 1));
    });
  });
  tags.forEach((c, i) => eq(column(s, i, 'tag'), L(c), 't2 card ' + (i + 1) + ' uppermost-hole tag'));
  eq(column(s, 0, 'slant').join(''), '////\\\\\\\\', 't2 card 1 slants');
  eq(column(s, 3, 'slant').slice(0, 3).join(''), '\\\\\\', 't2 card 4 (Z, F) slants');
  eq(column(s, 3, 'slant').slice(4).join(''), '\\\\\\\\', 't2 card 4 twisted to S, turned B');
  eq(column(s, 4, 'slant').slice(6).join(''), '//', 't2 card 5 twisted to S, turned F');
  eq(column(s, 2, 'idle'), [false, true, false, true, false, false, false, false], 't2 card 3 idles');
  eq(s.summary.map(x => GTT.sim.formatRanges(x.twist)), ['', '2', '', '4', '2', '5', '', ''], 't2 twist column');
  eq(GTT.sim.formatRanges(s.summary[3].F), '1 - 2; 4 - 5', 't2 pick 4 forwards');
}

// --- Hendrickson turning runs ---
{
  const row = [];
  for (let c = 1; c <= 30; c++) {
    const d = (c <= 5 || (c >= 11 && c <= 15)) ? 'F' : 'B';
    row.push({ dir: d, dist: 1 });
  }
  eq(GTT.sim.turningRuns(row).map(r => r.dir + r.n).join(' '), 'F5 B5 F5 B15', 'turning runs, Reed\'s example');
  const p = load('t2.gtt');
  const s = GTT.sim.simulate(p);
  eq(s.summary[1].runs.map(r => r.dir + r.n + (r.dist > 1 ? 'x2' : '')).join(' '), 'F1x2 F1 I1 F1x2 B1', 't2 pick 2 runs split by double turns and idle');
}

// --- generators against GTT 1.17 captures (K = backwards / black, W = forwards / white) ---
{
  const read = (n) => fs.readFileSync(path.join(__dirname, 'expected', n), 'utf8').trim().split('\n');
  const code = { '#000000': 'K', '#ffffff': 'W', '#ff0000': 'R', '#800000': 'M' };
  function check(fixture, prefix, opts, skipLast) {
    const p = load(fixture);
    const s = GTT.sim.simulate(GTT.gen.generate(p, opts));
    const colours = s.rows.map(r => r.map(c => code[c.colour] || '?').join(''));
    const dirs = s.rows.map(r => r.map(c => c.dir === 'B' ? 'K' : 'W').join(''));
    let ec = null, ed = read(prefix + '_dirs.txt');
    try { ec = read(prefix + '_colours.txt'); } catch (e) { /* twist-patterned has no colour capture */ }
    const n = ed.length - (skipLast ? 1 : 0);
    eq(dirs.slice(0, n), ed.slice(0, n), fixture + ' turning directions');
    if (ec) eq(colours.slice(0, n), ec.slice(0, n), fixture + ' woven colours');
    return s;
  }
  check('gen_df2.gtt', 'df2');
  check('gen_mdf.gtt', 'mdf');
  check('gen_twill.gtt', 'twill_small');
  // GTT reads past the top of the design on the final pick; that pick is skipped.
  check('twill_s.gtt', 'twill_s', {}, true);
  check('twill_z.gtt', 'twill_z', {}, true);
  const ts = check('twill_s.gtt', 'twill_s_twist', { interchange: 'twist' }, true);
  // one line per pick, pick 1 first; blank lines matter here
  const etw = fs.readFileSync(path.join(__dirname, 'expected', 'twill_s_twist_twists.txt'), 'utf8').split('\n');
  eq(ts.summary.slice(0, 31).map(x => x.twist.join(',')), etw.slice(0, 31), 'twill_s twist positions');
  check('twist_small.gtt', 'twist_small');
}

// --- editing operations ---
{
  const E = GTT.edit;
  const cards = (p) => p.cards.map(c => c.holes.join('') + c.threading).join(' ');
  // new patterns of every type survive a save and reload
  ['threaded', 'doubleface', 'doubleface4', 'twill', 'twist', 'brocade', 'font', 'letteredband'].forEach(k => {
    const p = E.create(k, { cards: 6, length: 5 });
    let again;
    try { again = GTT.io.parse(GTT.io.write(p), 'new.gtt'); } catch (e) { eq(e.message, '', 'new ' + k + ' saves'); return; }
    eq(again.kind, p.kind, 'new ' + k + ' saves and reloads');
  });

  // threaded: picks, packs and card moves keep actions pointing at the right cards
  const t = E.create('threaded', { cards: 4 });
  E.setHole(t, 0, 0, 1); E.setHole(t, 3, 2, 9);
  E.addPick(t, { mode: 'cards', items: { 1: { dir: 'F' }, 2: { dir: 'B', twist: true }, 3: { dir: 'I' }, 4: { dir: 'F' } } });
  E.addPick(t, { mode: 'cards', items: { 1: { dir: 'F' }, 2: { dir: 'B' }, 3: { dir: 'F' }, 4: { dir: 'F' } } }, true);
  eq(t.picks.map(a => a.map(x => (x.type === 'Twist' ? 't' : x.dir) + x.id).join(' ')), ['F1 t2 B2 F4', 'B1 F2 B3 B4'], 'pick builder and reverse pick');
  const moved = E.moveCards(t, [3], -1);
  eq([moved, cards(t)], [[2], '1151515S 15151515Z 1515915Z 15151515S'], 'move card left');
  eq(t.picks[0].map(x => (x.type === 'Twist' ? 't' : x.dir) + x.id).join(' '), 'F1 t2 B2 F3', 'actions follow moved cards');
  E.addPack(t, 'Odd', [1, 3]); E.addPack(t, 'Even', [2, 4]);
  E.addPick(t, { mode: 'packs', items: { Odd: { dir: 'F' }, Even: { dir: 'B' } } });
  E.renamePack(t, 'Odd', 'Outer');
  eq(t.picks[2].map(x => x.id + x.dir).join(' '), 'OuterF EvenB', 'pack pick and rename');
  E.flipDirection(t, 2, 1);
  eq(t.picks[2].map(x => x.dir + x.id).join(' '), 'F1 F2 F3 B4', 'flipping a direction breaks up that pick');
  E.repeatPicks(t, [1, 0]);
  eq(t.picks.length, 5, 'repeat picks');
  E.deletePicks(t, [3, 4]);
  E.setCardCount(t, 6);
  eq([t.cards.length, t.picks[0].filter(a => a.type === 'Turn').length], [6, 5], 'adding cards copies the last card turning');
  E.deleteCards(t, [0]);
  eq(t.picks[0].map(x => (x.type === 'Twist' ? 't' : x.dir) + x.id).join(' '), 't1 B1 F2 F4 F5', 'deleting a card renumbers actions');
  GTT.sim.simulate(t);

  // block tools
  const d = E.create('doubleface', { cards: 4, length: 3 });
  E.setCell(d, 0, 0, 'X'); E.setCell(d, 2, 3, 'X');
  E.shift(d, 'right'); eq(d.data, ['.X..', '....', 'X...'], 'shift right wraps');
  E.shift(d, 'up'); eq(d.data, ['X...', '.X..', '....'], 'shift up wraps');
  E.mirror(d, 'vertical'); eq(d.data, ['...X', '..X.', '....'], 'mirror around vertical axis');
  E.mirror(d, 'horizontal'); eq(d.data, ['....', '..X.', '...X'], 'mirror around horizontal axis');
  E.invert(d); eq(d.data[0], 'XXXX', 'invert');
  E.resizeBlock(d, 6, 2); eq([d.data, d.cards.length], [['XXXX..', 'XX.X..'], 6], 'resize design and cards');
  E.importBitmap(d, [[1, 0], [0, 1], [1, 1]]); eq(d.data, ['XX', '.X', 'X.'], 'bitmap import (top row of image is the far end)');

  // brocade keeps tie-downs in step with the drawing
  const b = E.create('brocade', { cards: 8, length: 2 });
  ['.AA.AA..'].forEach((r, i) => { for (let c = 0; c < 8; c++) E.setCell(b, i, c, r[c]); });
  eq([b.brocadePicks[0].wefts, b.brocadePicks[0].tieDowns], ['01101100', [0, 3, 6, 7]], 'brocade tie-downs match GTT');

  // join and convert
  const j1 = E.create('doubleface', { cards: 2, length: 2 }), j2 = E.create('doubleface', { cards: 3, length: 1 });
  E.setCell(j2, 0, 2, 'X');
  eq(E.join(j1, j2, 'side').data, ['....X', '.....'], 'join side by side');
  eq(E.joinable(j1, j2, 'end'), 'Joining end to end needs the same width.', 'end-to-end width check');
  const br = E.toBrocade(load('gen_df2.gtt'));
  const brAgain = GTT.io.parse(GTT.io.write(br), 'b.gtt');
  eq([brAgain.kind, !!brAgain.groundWeave, brAgain.groundWeave && brAgain.groundWeave.kind], ['brocade', true, 'doubleface'], 'convert double-face to brocade');
  eq(GTT.sim.simulate(GTT.gen.generate(brAgain, {})).nPicks, 24, 'brocade weaves its ground pattern');

  // fonts
  const f = E.create('font', { cards: 5 });
  const li = E.addLetter(f.font, 'A', 'Letter A', 3);
  f.font.chars[li].pattern.data[1] = 'XXXXX';
  E.setFontHeight(f.font, 7);
  eq(f.font.chars[0].pattern.data, ['.......', 'XXXXX..', '.......'], 'font height change keeps letters');
  const lb = E.create('letteredband'); lb.font = f.font; lb.text = ['A', 'A'];
  eq(E.letteredToDoubleface(lb).data.length, 3 + 1 + 3, 'lettered band as double-face, with kerning');
}

// --- every fixture parses and survives a write/parse round trip ---
fs.readdirSync(path.join(__dirname, 'fixtures')).filter(f => f.endsWith('.gtt')).forEach(f => {
  let p;
  try { p = load(f); } catch (e) { failures++; console.log('FAIL parse ' + f + ': ' + e.message); return; }
  passes++;
  const again = GTT.io.parse(GTT.io.write(p), f);
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'version' || k === 'warnings' || k === 'typeAttr' || k === 'paletteInFile' || k === 'groundWeaveAttr') ? undefined : v));
  eq(strip(again), strip(p), 'round trip ' + f);
});

// --- format details ---
{
  const df = load('gen_df2.gtt');
  eq([df.kind, df.width, df.length, df.colourCount, df.data[0], df.data[11]], ['doubleface', 8, 12, 2, 'XX......', 'X.......'], 'doubleface rows are bottom-up');
  eq(df.palette[1], '#800000', 'palette index 2 is maroon (BGR decoding)');
  const tw = load('gen_twill.gtt');
  eq([tw.kind, tw.backgroundTwill, tw.longFloats[4]], ['twill', 'Z', '..X.....'], 'twill long floats');
  const br = load('gen_broc.gtt');
  eq([br.kind, br.brocadePicks.length, br.brocadePicks[5].tieDowns, br.wefts[1].colour], ['brocade', 10, [0, 3, 6, 7], '#0000ff'], 'brocade picks and wefts');
  const ft = load('gen_font.gtt');
  eq([ft.kind, ft.font.height, ft.font.chars.length, ft.font.chars[0].pattern.width], ['font', 30, 1, 30], 'font file');
}

// --- lettered band: letter order and spacing, as GTT 1.17 generates it ---
{
  const p = load('lettered_order.gtt');
  const want = fs.readFileSync(path.join(__dirname, 'expected', 'lettered_order_rows.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
  eq(GTT.gen.letterRows(p.font, p.text), want, 'lettered band rows (text LTT, pick 1 first)');
  const df = GTT.edit.letteredToDoubleface(p);
  eq(df.data, want, 'lettered band saved as double-face');
}

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
