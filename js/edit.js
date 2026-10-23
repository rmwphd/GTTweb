/* Editing operations. Each takes a pattern object and changes it in place.
 * The UI wraps them with undo history (GTT.edit.History).
 * Block designs store rows bottom-up as strings of 'X' (pattern) and '.'.
 */
(function (GTT) {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function blankRow(n) { return new Array(n + 1).join('.'); }

  /* ---------- undo history ---------- */

  function History(limit) { this.undo = []; this.redo = []; this.limit = limit || 200; }
  History.prototype.record = function (p) {
    this.undo.push(clone(p));
    if (this.undo.length > this.limit) this.undo.shift();
    this.redo = [];
  };
  History.prototype.back = function (p) {
    if (!this.undo.length) return null;
    this.redo.push(clone(p));
    return this.undo.pop();
  };
  History.prototype.forward = function (p) {
    if (!this.redo.length) return null;
    this.undo.push(clone(p));
    return this.redo.pop();
  };

  /* ---------- new patterns ---------- */

  var TWILL_HOLES = [[0, 0, 1, 1], [1, 0, 0, 1], [1, 1, 0, 0], [1, 0, 0, 1]];

  function defaultCards(n, holes, pattern, back, threadingStyle) {
    var cards = [];
    for (var i = 0; i < n; i++) {
      var h = [];
      for (var j = 0; j < holes; j++) h.push(j < holes / 2 ? pattern : back);
      var t = threadingStyle === 'alt' ? (i % 2 ? 'Z' : 'S') : (threadingStyle === 'Z' ? 'Z' : 'S');
      cards.push({ number: i + 1, holes: h, threading: t });
    }
    return cards;
  }

  // kind: threaded | doubleface | doubleface4 | twill | twist | brocade | font | letteredband
  function create(kind, o) {
    o = o || {};
    var pal = GTT.colour.defaultPalette();
    var BLACK = 0, WHITE = 15;
    var w = Math.max(1, o.cards || 8), len = Math.max(1, o.length || 12);
    var rows = []; for (var r = 0; r < len; r++) rows.push(blankRow(w));
    var base = { fileName: '', version: '1.17', warnings: [], name: o.name || 'New pattern', notes: '', palette: pal, paletteName: '', paletteInFile: true, selvedges: { left: [], right: [] } };
    var p;
    switch (kind) {
      case 'threaded':
        p = Object.assign(base, { kind: 'threaded', cards: defaultCards(w, o.holes || 4, BLACK, WHITE, 'alt'), packs: [], picks: [] });
        p.cards.forEach(function (c) { for (var j = 0; j < c.holes.length; j++) c.holes[j] = WHITE; });
        break;
      case 'doubleface':
      case 'doubleface4':
        p = Object.assign(base, { kind: 'doubleface', width: w, length: len, colourCount: kind === 'doubleface4' ? 4 : 2, data: rows, cards: defaultCards(w, 4, BLACK, WHITE, 'alt') });
        break;
      case 'twill':
        p = Object.assign(base, { kind: 'twill', width: w, length: len, colourCount: 2, data: rows, longFloats: rows.slice(), backgroundTwill: 'S', cards: [] });
        for (var c = 0; c < w; c++) p.cards.push({ number: c + 1, threading: 'S', holes: TWILL_HOLES[c % 4].map(function (x) { return x ? WHITE : BLACK; }) });
        break;
      case 'twist':
        p = Object.assign(base, { kind: 'twist', width: w, length: len, colourCount: 2, data: rows, twistThreading: [], cards: [] });
        for (var t = 0; t < w; t++) p.twistThreading.push(t < w / 2 ? 'S' : 'Z');
        break;
      case 'brocade':
        p = Object.assign(base, { kind: 'brocade', width: w, cards: defaultCards(w, 4, WHITE, WHITE, 'alt'), visual: rows, brocadePicks: [],
          wefts: [['Weft A', '#000000'], ['Weft B', '#0000ff'], ['Weft C', '#ff0000'], ['Weft D', '#008000'], ['Weft E', '#ffff00']].map(function (x) { return { name: x[0], colour: x[1], description: '' }; }) });
        syncBrocade(p);
        break;
      case 'font':
        p = Object.assign(base, { kind: 'font', font: { name: o.name || 'New font', notes: '', height: Math.max(1, o.cards || 12), defCharWidth: o.charWidth || 8, kerning: 1, threading: 'AllS', selvedges: { left: [], right: [] }, chars: [] } });
        break;
      case 'letteredband':
        p = Object.assign(base, { kind: 'letteredband', text: [], fontName: '', font: { name: '', notes: '', height: 0, defCharWidth: 0, kerning: 1, threading: 'AllS', selvedges: { left: [], right: [] }, chars: [] } });
        break;
      default:
        throw new Error('Unknown pattern type ' + kind);
    }
    p.kindLabel = GTT.io.KIND_LABEL[p.kind];
    return p;
  }

  /* ---------- threaded-in: cards ---------- */

  // Card renumbering: map[oldNumber] = newNumber (or 0 if removed)
  function remapCards(p, map) {
    p.picks = p.picks.map(function (acts) {
      return acts.filter(function (a) {
        if (a.target === 'Pack') return true;
        return map[parseInt(a.id, 10)] > 0;
      }).map(function (a) {
        if (a.target === 'Pack') return a;
        return Object.assign({}, a, { id: String(map[parseInt(a.id, 10)]) });
      });
    });
    (p.packs || []).forEach(function (pk) {
      pk.cards = pk.cards.map(function (c) { return map[c] || 0; }).filter(Boolean).sort(function (a, b) { return a - b; });
    });
    p.cards.forEach(function (c, i) { c.number = i + 1; });
  }

  function setCardCount(p, n, holes) {
    n = Math.max(1, Math.min(400, n | 0));
    var cur = p.cards.length;
    if (n > cur) {
      var tmpl = p.cards[cur - 1] || { holes: new Array(holes || 4).fill(15), threading: 'S' };
      var added = [];
      for (var i = cur; i < n; i++) {
        var c = { number: i + 1, holes: tmpl.holes.slice(), threading: (p.cards.length + added.length) % 2 ? 'Z' : 'S' };
        if (holes && holes !== c.holes.length) c.holes = new Array(holes).fill(c.holes[0]);
        added.push(c);
      }
      p.cards = p.cards.concat(added);
      if (p.kind === 'threaded') {
        // new cards follow the last card's turning in every pick
        p.picks = p.picks.map(function (acts) {
          var last = null;
          acts.forEach(function (a) { if (a.target !== 'Pack' && a.type === 'Turn' && parseInt(a.id, 10) === cur) last = a; });
          var extra = [];
          for (var j = cur + 1; j <= n; j++) extra.push({ type: 'Turn', target: 'Card', id: String(j), dir: last ? last.dir : 'F', dist: last ? last.dist : 1 });
          return acts.concat(extra);
        });
      }
    } else if (n < cur) {
      var map = {};
      for (var k = 1; k <= cur; k++) map[k] = k <= n ? k : 0;
      p.cards = p.cards.slice(0, n);
      if (p.kind === 'threaded') remapCards(p, map);
    }
  }

  function setHole(p, card, hole, colour) {
    var c = p.cards[card];
    if (c && hole < c.holes.length) c.holes[hole] = colour;
  }

  function setAllHoles(p, cards, holes, colour) {
    cards.forEach(function (ci) {
      var c = p.cards[ci]; if (!c) return;
      holes.forEach(function (h) { if (h < c.holes.length) c.holes[h] = colour; });
    });
  }

  // style: 'S' | 'Z' | 'SZ' | 'ZS' | 'invert' | 'toggle'
  function setThreading(p, cards, style) {
    var list = cards && cards.length ? cards : p.cards.map(function (_, i) { return i; });
    list.forEach(function (ci, k) {
      var c = p.cards[ci]; if (!c) return;
      if (style === 'S' || style === 'Z') c.threading = style;
      else if (style === 'SZ') c.threading = k % 2 ? 'Z' : 'S';
      else if (style === 'ZS') c.threading = k % 2 ? 'S' : 'Z';
      else c.threading = c.threading === 'S' ? 'Z' : 'S';
    });
  }

  function moveCards(p, sel, delta) {
    var n = p.cards.length;
    var set = {}; sel.forEach(function (i) { set[i] = true; });
    var order = p.cards.map(function (_, i) { return i; });
    if (delta < 0) {
      for (var i = 1; i < n; i++) if (set[order[i]] && !set[order[i - 1]]) { var t = order[i - 1]; order[i - 1] = order[i]; order[i] = t; }
    } else {
      for (var j = n - 2; j >= 0; j--) if (set[order[j]] && !set[order[j + 1]]) { var u = order[j + 1]; order[j + 1] = order[j]; order[j] = u; }
    }
    applyCardOrder(p, order);
    return sel.map(function (i) { return order.indexOf(i); });
  }

  function applyCardOrder(p, order) {
    var map = {};
    order.forEach(function (old, nu) { map[old + 1] = nu + 1; });
    p.cards = order.map(function (i) { return p.cards[i]; });
    if (p.kind === 'threaded') remapCards(p, map);
    else if (p.kind === 'twist') p.twistThreading = order.map(function (i) { return p.twistThreading[i]; });
  }

  function deleteCards(p, sel) {
    if (sel.length >= p.cards.length) return;
    var set = {}; sel.forEach(function (i) { set[i] = true; });
    var map = {}, n = 0;
    p.cards.forEach(function (_, i) { map[i + 1] = set[i] ? 0 : ++n; });
    p.cards = p.cards.filter(function (_, i) { return !set[i]; });
    if (p.kind === 'threaded') remapCards(p, map);
  }

  function insertCard(p, at) {
    at = Math.max(0, Math.min(p.cards.length, at));
    var src = p.cards[Math.max(0, at - 1)] || { holes: [15, 15, 15, 15], threading: 'S' };
    var map = {};
    p.cards.forEach(function (_, i) { map[i + 1] = i < at ? i + 1 : i + 2; });
    p.cards.splice(at, 0, { number: at + 1, holes: src.holes.slice(), threading: src.threading });
    if (p.kind === 'threaded') {
      remapCards(p, map);
      // the new card copies its left neighbour's turning
      p.picks = p.picks.map(function (acts) {
        var ref = null;
        acts.forEach(function (a) { if (a.target !== 'Pack' && a.type === 'Turn' && parseInt(a.id, 10) === at) ref = a; });
        return acts.concat([{ type: 'Turn', target: 'Card', id: String(at + 1), dir: ref ? ref.dir : 'F', dist: ref ? ref.dist : 1 }]);
      });
    }
  }

  /* ---------- threaded-in: picks and packs ---------- */

  // spec: { mode: 'cards'|'packs', items: { key: { dir: 'F'|'B'|'I', twist: bool } } }
  function makePick(p, spec, reverse) {
    var acts = [];
    var flip = function (d) { return !reverse ? d : (d === 'F' ? 'B' : (d === 'B' ? 'F' : d)); };
    if (spec.mode === 'packs') {
      (p.packs || []).forEach(function (pk) {
        var it = spec.items[pk.name] || { dir: 'F' };
        if (it.dir === 'I') return;
        if (it.twist) acts.push({ type: 'Twist', target: 'Pack', id: pk.name, dir: 'V', dist: 1 });
        acts.push({ type: 'Turn', target: 'Pack', id: pk.name, dir: flip(it.dir), dist: it.dist || 1 });
      });
    } else {
      p.cards.forEach(function (_, i) {
        var it = spec.items[i + 1] || { dir: 'F' };
        if (it.twist) acts.push({ type: 'Twist', target: 'Card', id: String(i + 1), dir: 'V', dist: 1 });
        if (it.dir === 'I') return;
        acts.push({ type: 'Turn', target: 'Card', id: String(i + 1), dir: flip(it.dir), dist: it.dist || 1 });
      });
    }
    return acts;
  }

  function addPick(p, spec, reverse) { p.picks.push(makePick(p, spec, reverse)); }
  function removeLastPick(p) { p.picks.pop(); }
  function clearPicks(p) { p.picks = []; }
  function deletePicks(p, list) {
    var set = {}; list.forEach(function (k) { set[k] = true; });
    p.picks = p.picks.filter(function (_, k) { return !set[k]; });
  }
  // GTT repeats selected picks in the order they were selected.
  function repeatPicks(p, list) { list.forEach(function (k) { if (p.picks[k]) p.picks.push(clone(p.picks[k])); }); }

  function packCardsAction(p, a) {
    var pk = (p.packs || []).find(function (x) { return x.name === a.id; });
    return pk ? pk.cards : [];
  }

  function breakUpPick(p, k) {
    var acts = p.picks[k];
    if (!acts.some(function (a) { return a.target === 'Pack'; })) return;
    var out = [];
    acts.forEach(function (a) {
      if (a.target !== 'Pack') { out.push(a); return; }
      packCardsAction(p, a).forEach(function (c) { out.push(Object.assign({}, a, { target: 'Card', id: String(c) })); });
    });
    out.sort(function (a, b) { return (parseInt(a.id, 10) - parseInt(b.id, 10)) || (a.type === 'Twist' ? -1 : 1); });
    p.picks[k] = out;
  }

  function breakUpPacks(p) { for (var k = 0; k < p.picks.length; k++) breakUpPick(p, k); }

  // Change one card's turning direction at one pick (GTT's design tool).
  function flipDirection(p, k, card) {
    if (!p.picks[k]) return;
    breakUpPick(p, k);
    var acts = p.picks[k], found = false;
    acts.forEach(function (a) {
      if (a.type === 'Turn' && a.target === 'Card' && parseInt(a.id, 10) === card + 1) {
        found = true;
        a.dir = a.dir === 'F' ? 'B' : 'F'; // idle cards start turning forwards
      }
    });
    if (!found) acts.push({ type: 'Turn', target: 'Card', id: String(card + 1), dir: 'F', dist: 1 });
  }

  function toggleTwistAt(p, k, card) {
    if (!p.picks[k]) return;
    breakUpPick(p, k);
    var acts = p.picks[k];
    var i = acts.findIndex(function (a) { return a.type === 'Twist' && parseInt(a.id, 10) === card + 1; });
    if (i >= 0) acts.splice(i, 1);
    else acts.unshift({ type: 'Twist', target: 'Card', id: String(card + 1), dir: 'V', dist: 1 });
  }

  function addPack(p, name, cards) {
    p.packs = p.packs || [];
    var base = name || 'Pack ' + (p.packs.length + 1), nm = base, n = 2;
    while (p.packs.some(function (x) { return x.name === nm; })) nm = base + ' ' + (n++);
    p.packs.push({ name: nm, comment: '', cards: (cards || []).slice().sort(function (a, b) { return a - b; }) });
    return nm;
  }
  function removePack(p, name) {
    breakUpPacksNamed(p, name);
    p.packs = p.packs.filter(function (x) { return x.name !== name; });
  }
  function breakUpPacksNamed(p, name) {
    p.picks.forEach(function (acts, k) { if (acts.some(function (a) { return a.target === 'Pack' && a.id === name; })) breakUpPick(p, k); });
  }
  function renamePack(p, name, nu) {
    if (!nu || p.packs.some(function (x) { return x.name === nu; })) return false;
    p.packs.forEach(function (x) { if (x.name === name) x.name = nu; });
    p.picks.forEach(function (acts) { acts.forEach(function (a) { if (a.target === 'Pack' && a.id === name) a.id = nu; }); });
    return true;
  }
  function togglePackCard(p, name, card) {
    var pk = p.packs.find(function (x) { return x.name === name; }); if (!pk) return;
    var i = pk.cards.indexOf(card);
    if (i >= 0) pk.cards.splice(i, 1); else { pk.cards.push(card); pk.cards.sort(function (a, b) { return a - b; }); }
  }

  /* ---------- block designs ---------- */

  function gridOf(p) {
    if (p.kind === 'brocade') return 'visual';
    return 'data';
  }

  function resizeBlock(p, w, h) {
    w = Math.max(1, Math.min(400, w | 0)); h = Math.max(1, Math.min(2000, h | 0));
    function fit(rows) {
      var out = [];
      for (var r = 0; r < h; r++) out.push(((rows && rows[r]) || '').slice(0, w).padEnd(w, '.'));
      return out;
    }
    var key = gridOf(p);
    p[key] = fit(p[key]);
    if (p.kind === 'twill') p.longFloats = fit(p.longFloats);
    p.width = w; p.length = h;
    if (p.kind === 'twist') {
      var t = p.twistThreading || [];
      while (t.length < w) t.push(t.length ? t[t.length - 1] : 'S');
      p.twistThreading = t.slice(0, w);
    } else if (p.cards) {
      if (p.kind === 'twill') {
        while (p.cards.length < w) {
          var i = p.cards.length, src = p.cards[i % 4] || p.cards[0];
          p.cards.push({ number: i + 1, threading: src ? src.threading : 'S', holes: src ? src.holes.slice() : [0, 0, 15, 15] });
        }
        p.cards = p.cards.slice(0, w);
      } else setCardCount(p, w);
    }
    if (p.kind === 'brocade') syncBrocade(p);
  }

  function getCell(p, r, c, layer) { var rows = layer === 'float' ? p.longFloats : p[gridOf(p)]; return (rows[r] || '').charAt(c); }
  function setCell(p, r, c, v, layer) {
    var key = layer === 'float' ? 'longFloats' : gridOf(p);
    var rows = p[key]; if (!rows || r < 0 || r >= rows.length || c < 0 || c >= rows[r].length) return false;
    var row = rows[r];
    if (row.charAt(c) === v) return false;
    rows[r] = row.slice(0, c) + v + row.slice(c + 1);
    if (p.kind === 'brocade') syncBrocade(p);
    return true;
  }

  function mapRows(p, fn, withFloats) {
    var key = gridOf(p);
    p[key] = fn(p[key]);
    if (withFloats && p.kind === 'twill' && p.longFloats) p.longFloats = fn(p.longFloats);
    if (p.kind === 'brocade') syncBrocade(p);
  }

  function shift(p, dir) {
    mapRows(p, function (rows) {
      if (!rows.length) return rows;
      if (dir === 'up') return [rows[rows.length - 1]].concat(rows.slice(0, -1));
      if (dir === 'down') return rows.slice(1).concat([rows[0]]);
      return rows.map(function (r) {
        if (!r.length) return r;
        return dir === 'right' ? r.slice(-1) + r.slice(0, -1) : r.slice(1) + r.charAt(0);
      });
    }, true);
  }

  function invert(p) {
    mapRows(p, function (rows) {
      return rows.map(function (r) {
        if (p.kind === 'brocade') return r.replace(/[^.]/g, '.');
        return r.replace(/./g, function (ch) { return ch === 'X' ? '.' : 'X'; });
      });
    });
  }

  // vertical axis: left-right; horizontal axis: top-bottom
  function mirror(p, axis) {
    mapRows(p, function (rows) {
      if (axis === 'vertical') return rows.map(function (r) { return r.split('').reverse().join(''); });
      return rows.slice().reverse();
    }, true);
    if (axis === 'vertical' && p.cards && p.kind !== 'twill') p.cards.reverse().forEach(function (c, i) { c.number = i + 1; });
    if (axis === 'vertical' && p.kind === 'twist') p.twistThreading.reverse();
  }

  // Twill: move every second column by one row, undoing the half-row offset
  // that an odd shift creates (GTT's "Realign pattern").
  function realign(p) {
    function fix(rows) {
      var h = rows.length; if (!h) return rows;
      var w = rows[0].length;
      var grid = rows.map(function (r) { return r.split(''); });
      for (var c = 1; c < w; c += 2) {
        var col = grid.map(function (r) { return r[c]; });
        col = col.slice(1).concat([col[0]]);
        for (var r = 0; r < h; r++) grid[r][c] = col[r];
      }
      return grid.map(function (r) { return r.join(''); });
    }
    p.data = fix(p.data);
    if (p.longFloats) p.longFloats = fix(p.longFloats);
  }

  function clearDesign(p) {
    mapRows(p, function (rows) { return rows.map(function (r) { return r.replace(/./g, '.'); }); }, true);
  }
  function clearFloats(p) { if (p.longFloats) p.longFloats = p.longFloats.map(function (r) { return r.replace(/./g, '.'); }); }

  // bits[r][c] (r = 0 top row of the image)
  function importBitmap(p, bits) {
    var h = bits.length, w = h ? bits[0].length : 0;
    if (!h || !w) return;
    var rows = [];
    for (var r = h - 1; r >= 0; r--) rows.push(bits[r].map(function (b) { return b ? (p.kind === 'brocade' ? 'A' : 'X') : '.'; }).join(''));
    resizeBlock(p, w, h);
    p[gridOf(p)] = rows;
    if (p.kind === 'brocade') syncBrocade(p);
  }

  /* ---------- brocade ---------- */

  // Rebuild <BrocadePicks> from the visual pattern: a weft floats over every
  // card marked with its letter and is tied down on the others.
  function syncBrocade(p) {
    var rows = p.visual || [];
    p.brocadePicks = rows.map(function (row, k) {
      var tie = [], wefts = '';
      for (var c = 0; c < p.width; c++) {
        var ch = row.charAt(c);
        var n = (ch && ch !== '.') ? (ch.charCodeAt(0) - 64) : 0;
        wefts += String(Math.max(0, Math.min(9, n)));
        if (!n) tie.push(c);
      }
      return { index: k + 1, tieDowns: tie, wefts: wefts };
    });
  }

  /* ---------- palette ---------- */

  function setPaletteColour(p, i, hex) { p.palette[i] = hex; }

  function usedColourKeys(p) {
    var out = [];
    (p.cards || []).forEach(function (c) { out.push(c.holes); });
    (p.selvedges ? p.selvedges.left.concat(p.selvedges.right) : []).forEach(function (c) { out.push(c.holes); });
    return out;
  }

  // GTT's colour manipulation buttons
  function swapColours(p, a, b) {
    usedColourKeys(p).forEach(function (holes) { for (var i = 0; i < holes.length; i++) { if (holes[i] === a) holes[i] = b; else if (holes[i] === b) holes[i] = a; } });
  }
  function replaceColour(p, from, to) {
    usedColourKeys(p).forEach(function (holes) { for (var i = 0; i < holes.length; i++) if (holes[i] === from) holes[i] = to; });
  }

  /* ---------- selvedges, join, convert ---------- */

  function setSelvedges(p, side, count, colour, threading) {
    p.selvedges = p.selvedges || { left: [], right: [] };
    var list = [];
    for (var i = 0; i < count; i++) list.push({ number: i + 1, holes: [colour, colour, colour, colour], threading: threading === 'alt' ? (i % 2 ? 'Z' : 'S') : threading });
    p.selvedges[side] = list;
  }

  function joinable(a, b, how) {
    if (a.kind !== b.kind) return 'Both patterns must be the same type.';
    if (a.kind === 'font' || a.kind === 'letteredband') return 'Fonts and lettered bands cannot be joined.';
    if (a.kind === 'twill' && a.backgroundTwill !== b.backgroundTwill) return 'Twill patterns with different background twill cannot be joined.';
    if (how === 'end') {
      if (a.kind === 'threaded' && a.cards.length !== b.cards.length) return 'Joining end to end needs the same number of cards.';
      if (a.kind !== 'threaded' && a.width !== b.width) return 'Joining end to end needs the same width.';
    }
    return '';
  }

  function join(a, b, how) {
    var err = joinable(a, b, how);
    if (err) throw new Error(err);
    var p = clone(a);
    p.name = a.name + ' + ' + b.name;
    p.fileName = '';
    if (a.kind === 'threaded') {
      if (how === 'end') {
        p.picks = a.picks.concat(clone(b.picks));
      } else {
        var n = a.cards.length;
        var bb = clone(b);
        var map = {}; bb.cards.forEach(function (_, i) { map[i + 1] = i + 1 + n; });
        // rename b's packs so the names stay unique
        (bb.packs || []).forEach(function (pk) { var nu = pk.name; while (p.packs.some(function (x) { return x.name === nu; })) nu += "'"; renamePack(bb, pk.name, nu); });
        remapCards(bb, map);
        p.cards = a.cards.concat(bb.cards).map(function (c, i) { return Object.assign({}, c, { number: i + 1 }); });
        p.packs = (a.packs || []).concat(bb.packs || []);
        var len = Math.max(a.picks.length, bb.picks.length);
        p.picks = [];
        for (var k = 0; k < len; k++) p.picks.push((a.picks[k] || []).concat(bb.picks[k] || []));
      }
      return p;
    }
    var key = gridOf(a);
    if (how === 'end') {
      p[key] = a[key].concat(b[key]);
      if (a.kind === 'twill') p.longFloats = a.longFloats.concat(b.longFloats);
      p.length = p[key].length;
    } else {
      var h = Math.max(a[key].length, b[key].length);
      var wa = a.width, wb = b.width;
      p[key] = []; if (a.kind === 'twill') p.longFloats = [];
      for (var r = 0; r < h; r++) {
        p[key].push(((a[key][r] || blankRow(wa))) + (b[key][r] || blankRow(wb)));
        if (a.kind === 'twill') p.longFloats.push((a.longFloats[r] || blankRow(wa)) + (b.longFloats[r] || blankRow(wb)));
      }
      p.width = wa + wb; p.length = h;
      if (a.kind === 'twist') p.twistThreading = a.twistThreading.concat(b.twistThreading);
      else p.cards = a.cards.concat(clone(b.cards)).map(function (c, i) { return Object.assign({}, c, { number: i + 1 }); });
    }
    if (p.kind === 'brocade') syncBrocade(p);
    return p;
  }

  // GTT's "Convert double-face/twill to brocade": the design becomes the
  // ground weave of a new brocade pattern of the same size.
  function toBrocade(src) {
    var woven = GTT.gen.generate(src, {});
    var p = create('brocade', { cards: woven.cards.length, length: woven.picks.length, name: src.name + ' (brocade)' });
    p.cards = clone(woven.cards);
    p.palette = src.palette.slice();
    p.groundWeave = clone(src);
    p.groundWeaveAttr = 'Yes';
    return p;
  }

  /* ---------- fonts and lettered bands ---------- */

  function addLetter(font, letter, name, width) {
    var w = width || font.defCharWidth || 8;
    var rows = []; for (var r = 0; r < w; r++) rows.push(blankRow(font.height));
    font.chars.push({ letter: letter, name: name || ('Letter ' + letter), spaceBefore: 0, spaceAfter: 0, pattern: { width: font.height, length: w, colourCount: 2, data: rows } });
    return font.chars.length - 1;
  }
  function removeLetter(font, i) { font.chars.splice(i, 1); }
  function moveLetter(font, i, d) {
    var j = i + d; if (j < 0 || j >= font.chars.length) return i;
    var t = font.chars[i]; font.chars[i] = font.chars[j]; font.chars[j] = t; return j;
  }
  function setLetterWidth(font, i, w) {
    var ch = font.chars[i]; if (!ch) return;
    w = Math.max(1, Math.min(200, w | 0));
    var rows = ch.pattern.data;
    while (rows.length < w) rows.push(blankRow(font.height));
    ch.pattern.data = rows.slice(0, w); ch.pattern.length = w;
  }
  function setFontHeight(font, h) {
    h = Math.max(1, Math.min(200, h | 0));
    font.height = h;
    font.chars.forEach(function (c) {
      c.pattern.width = h;
      c.pattern.data = c.pattern.data.map(function (r) { return r.slice(0, h).padEnd(h, '.'); });
    });
  }
  // The letter pattern is a double-face design: rows run along the band,
  // characters across the cards.
  function letterPattern(ch) { return ch.pattern; }

  // A lettered band saved as a plain double-face pattern (GTT's button).
  function letteredToDoubleface(p) {
    var font = p.font;
    var rows = GTT.gen.letterRows(font, p.text || []);
    var w = font.height;
    var out = create('doubleface', { cards: w, length: Math.max(1, rows.length), name: (p.text || []).join('') || 'Lettered band' });
    out.data = rows.length ? rows : [blankRow(w)];
    out.length = out.data.length;
    out.cards = GTT.gen.generate(p, {}).cards;
    return out;
  }

  GTT.edit = {
    clone: clone, History: History, create: create,
    setCardCount: setCardCount, setHole: setHole, setAllHoles: setAllHoles, setThreading: setThreading,
    moveCards: moveCards, deleteCards: deleteCards, insertCard: insertCard,
    makePick: makePick, addPick: addPick, removeLastPick: removeLastPick, clearPicks: clearPicks,
    deletePicks: deletePicks, repeatPicks: repeatPicks, breakUpPacks: breakUpPacks, breakUpPick: breakUpPick,
    flipDirection: flipDirection, toggleTwistAt: toggleTwistAt,
    addPack: addPack, removePack: removePack, renamePack: renamePack, togglePackCard: togglePackCard,
    resizeBlock: resizeBlock, getCell: getCell, setCell: setCell, shift: shift, invert: invert, mirror: mirror,
    realign: realign, clearDesign: clearDesign, clearFloats: clearFloats, importBitmap: importBitmap,
    syncBrocade: syncBrocade, setPaletteColour: setPaletteColour, swapColours: swapColours, replaceColour: replaceColour,
    setSelvedges: setSelvedges, joinable: joinable, join: join, toBrocade: toBrocade,
    addLetter: addLetter, removeLetter: removeLetter, moveLetter: moveLetter, setLetterWidth: setLetterWidth,
    setFontHeight: setFontHeight, letterPattern: letterPattern, letteredToDoubleface: letteredToDoubleface
  };
})(typeof window !== 'undefined' ? (window.GTT = window.GTT || {}) : (module.exports = global.GTT = global.GTT || {}));
