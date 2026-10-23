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

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
