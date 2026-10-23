/* Turning-sequence generators for GTT's block-designed pattern types.
 *
 * Each generator turns a design into a threaded-in style pattern
 * (cards + picks), which the normal simulation then weaves. The rules were
 * measured from GTT 1.17 by reading back the turning directions it shows for
 * test designs (see tests/run.js and docs/gtt-notes.md).
 */
(function (GTT) {
  'use strict';

  function turn(card, dir) { return { type: 'Turn', target: 'Card', id: String(card), dir: dir, dist: 1 }; }
  function twist(card) { return { type: 'Twist', target: 'Card', id: String(card), dir: 'V', dist: 1 }; }

  function base(p, cards, picks, extra) {
    var out = {
      kind: 'threaded', name: p.name, notes: p.notes, fileName: p.fileName,
      palette: p.palette, paletteName: p.paletteName || '', cards: cards, packs: [], picks: picks,
      selvedges: { left: [], right: [] }, warnings: [], generatedFrom: p.kind
    };
    for (var k in extra) out[k] = extra[k];
    return out;
  }

  /* Double-face (2 or 4 colours) and lettered bands.
   * Every design row is a block of two picks. Background cards turn
   * F F, B B, F F, B B ... block by block; a card under an X turns the other
   * way for that block. */
  function doubleface(p, rows, cards) {
    rows = rows || p.data || [];
    cards = cards || p.cards;
    var n = cards.length;
    var picks = [];
    rows.forEach(function (row, b) {
      var bg = (b % 2 === 0) ? 'F' : 'B';
      var acts = [];
      for (var c = 0; c < n; c++) {
        var x = row.charAt(c) === 'X';
        acts.push(turn(c + 1, x ? (bg === 'F' ? 'B' : 'F') : bg));
      }
      picks.push(acts, acts.map(function (a) { return Object.assign({}, a); }));
    });
    return base(p, cards, picks);
  }

  /* 3/1 broken twill, one-pack method, colour interchange by changing the
   * turning sequence (GTT's default).
   * Card c starts in the rhythm FFBB shifted by one pick per card, so its
   * direction changes every second pick. Odd cards' blocks start one pick
   * later, which is why GTT staggers alternate columns of the design.
   * At the start of each block the card either changes direction as usual
   * or, when that would show the wrong colour, keeps turning the same way
   * (four picks in one direction). A long float reverses the direction
   * between the two picks of its block. */
  function twill(p, opts) {
    var useTwists = !!(opts && opts.interchange === 'twist');
    var cards = p.cards, n = cards.length;
    var rows = p.data || [];
    var lf = p.longFloats || [];
    var nPicks = rows.length * 2;
    var S = (p.backgroundTwill || 'S') === 'S';
    var dirs = []; // dirs[card][pick]
    var twists = []; // twists[card][pick] = true
    for (var c = 0; c < n; c++) {
      var card = cards[c];
      var holes = card.holes, nh = holes.length;
      var phase = S ? -c : c; // Z: FFBB[(k - c) mod 4] (measured); S assumed mirrored
      var stagger = c % 2;
      var seq = [];
      var pos = 0, twisted = false, lastVis = null;
      // colours: background is what the plain rhythm shows
      var bgColour = null, patColour = null;
      (function () {
        var q = 0;
        var d0 = 'FFBB'[((0 - phase) % 4 + 4) % 4]; // first pick
        if (d0 === 'F') { q = (q - 1 + nh) % nh; bgColour = holes[q]; } else { bgColour = holes[(q + 1 - 1 + nh) % nh]; }
        holes.forEach(function (h) { if (h !== bgColour && patColour === null) patColour = h; });
        if (patColour === null) patColour = bgColour;
      })();
      function visAfter(state, d) {
        var q = state;
        if (d === 'F') { q = (q - 1 + nh) % nh; return { p: q, vis: q }; }
        q = (q + 1) % nh; return { p: q, vis: (q - 1 + nh) % nh };
      }
      function want(k) {
        var r = Math.floor((k + stagger) / 2);
        if (r < 0) r = 0;
        var row = rows[r] || '';
        return row.charAt(c) === 'X' ? patColour : bgColour;
      }
      function isFloat(k) {
        var r = Math.floor((k + stagger) / 2);
        return r >= 0 && (lf[r] || '').charAt(c) === 'X';
      }
      var dir = null, tw = [], twistedNow = false;
      for (var k = 0; k < nPicks; k++) {
        var blockStart = ((k - stagger) % 2 + 2) % 2 === 0;
        var d;
        if (k === 0) {
          d = 'FFBB'[((0 - phase) % 4 + 4) % 4];
        } else if (blockStart) {
          var normal = dir === 'F' ? 'B' : 'F';
          // effective turn = actual turn, inverted while the card is twisted
          var effNormal = twistedNow ? (normal === 'F' ? 'B' : 'F') : normal;
          var tryN = visAfter(pos, effNormal);
          if (holes[tryN.vis] === want(k)) d = normal;
          else if (useTwists && !isFloat(k)) { tw[k] = true; twistedNow = !twistedNow; d = normal; }
          else d = dir;
        } else {
          d = isFloat(k) ? (dir === 'F' ? 'B' : 'F') : dir;
        }
        var r2 = visAfter(pos, twistedNow ? (d === 'F' ? 'B' : 'F') : d);
        pos = r2.p;
        dir = d;
        seq.push(d);
      }
      dirs.push(seq);
      twists.push(tw);
    }
    var picks = [];
    for (var k2 = 0; k2 < nPicks; k2++) {
      var acts = [];
      for (var c2 = 0; c2 < n; c2++) {
        if (twists[c2][k2]) acts.push(twist(c2 + 1));
        acts.push(turn(c2 + 1, dirs[c2][k2]));
      }
      picks.push(acts);
    }
    return base(p, cards, picks);
  }

  /* Twist-patterned (warp-twined) bands. Every card carries one colour, so
   * the design shows only as the twining direction.
   * Default (GTT's "change of turning direction"): S cards turn forwards and
   * Z cards backwards, so the background twines one way; a card under an X
   * turns the other way for that row. Each design row is one pick.
   * Twist option: all cards turn forwards and a card is twisted at the start
   * of each row where its cell changes between X and blank. (GTT 1.17 places
   * these twists one card to the left and one row later, which looks like a
   * bug; GTT Web twists the card whose cell changes.) */
  function twistPatterned(p, opts) {
    var useTwists = !!(opts && opts.twistMode === 'twist');
    var rows = p.data || [];
    var n = p.width || (rows[0] || '').length;
    var thr = p.twistThreading || [];
    var cards = [];
    for (var c = 0; c < n; c++) cards.push({ number: c + 1, holes: [0, 0, 0, 0], threading: thr[c] || 'S' });
    var pal = (p.palette || GTT.colour.defaultPalette()).slice();
    pal[0] = '#ffffff'; // one warp colour; the twining carries the design
    // One pick per design row (as GTT does for this pattern type).
    var picks = [];
    var prev = rows.length ? rows[0].replace(/./g, '.') : '';
    rows.forEach(function (row) {
      var acts = [];
      for (var c = 0; c < n; c++) {
        var x = row.charAt(c) === 'X';
        if (useTwists) {
          if (x !== (prev.charAt(c) === 'X')) acts.push(twist(c + 1));
          acts.push(turn(c + 1, 'F'));
        } else {
          var sCard = (thr[c] || 'S') === 'S';
          acts.push(turn(c + 1, (sCard !== x) ? 'F' : 'B'));
        }
      }
      picks.push(acts);
      prev = row;
    });
    var out = base(p, cards, picks, { twining: true });
    out.palette = pal;
    return out;
  }

  /* Brocade. Without a ground weave every card turns forwards; with one, the
   * ground weave's own turning sequence is used (one pick per brocade pick).
   * The supplementary wefts are returned separately for drawing on top. */
  function brocade(p, opts) {
    var n = p.width || (p.cards || []).length;
    var nPicks = p.brocadePicks ? p.brocadePicks.length : (p.visual || []).length;
    var ground = null;
    if (p.groundWeave) {
      try { ground = generate(p.groundWeave, opts); } catch (e) { ground = null; }
    }
    var cards = (ground && ground.cards.length >= n) ? ground.cards : p.cards;
    var picks = [];
    for (var k = 0; k < nPicks; k++) {
      if (ground && ground.picks.length) picks.push(ground.picks[k % ground.picks.length]);
      else {
        var acts = [];
        for (var c = 0; c < cards.length; c++) acts.push(turn(c + 1, 'F'));
        picks.push(acts);
      }
    }
    var out = base(p, cards, picks);
    if (ground) { out.palette = ground.palette; }
    // weft floats: wefts[pick][card] = weft index (1-based) or 0
    var wefts = [];
    for (var k2 = 0; k2 < nPicks; k2++) {
      var bp = p.brocadePicks && p.brocadePicks[k2];
      var vis = (p.visual || [])[k2] || '';
      var row = [];
      for (var c2 = 0; c2 < cards.length; c2++) {
        var w = 0;
        if (bp && bp.wefts) w = parseInt(bp.wefts.charAt(c2), 10) || 0;
        else if (vis.charAt(c2) && vis.charAt(c2) !== '.') w = vis.charCodeAt(c2) - 64;
        row.push(w);
      }
      wefts.push(row);
    }
    out.brocade = { wefts: wefts, threads: p.wefts || [] };
    return out;
  }

  /* Lettered bands: the letters are laid out as a double-face design. The
   * text runs from the far end of the band, so weaving from pick 1 produces
   * the writing backwards, as GTT's manual describes. */
  function letterRows(font, text) {
    var H = font.height || 0, rows = [];
    var blank = new Array(H + 1).join('.');
    function pad(r) { return (r + blank).slice(0, H); }
    var chars = text.slice().reverse();
    chars.forEach(function (ch, i) {
      var c = font.chars.find(function (x) { return x.letter === ch; });
      if (!c) return;
      var j;
      for (j = 0; j < (c.spaceAfter || 0); j++) rows.push(blank);
      (c.pattern ? c.pattern.data : []).forEach(function (r) { rows.push(pad(r)); });
      for (j = 0; j < (c.spaceBefore || 0); j++) rows.push(blank);
      if (i < chars.length - 1) for (j = 0; j < (font.kerning || 0); j++) rows.push(blank);
    });
    return rows;
  }

  function fontCards(font) {
    var cards = [];
    for (var c = 0; c < (font.height || 0); c++) {
      var t = font.threading === 'AllZ' ? 'Z' : (font.threading === 'AltSZ' ? (c % 2 ? 'Z' : 'S') : 'S');
      cards.push({ number: c + 1, holes: [0, 0, 15, 15], threading: t });
    }
    return cards;
  }

  function lettered(p) {
    var font = p.font || { height: 0, chars: [] };
    var rows = letterRows(font, p.text || []);
    var q = Object.assign({}, p, { palette: p.palette || GTT.colour.defaultPalette() });
    return doubleface(q, rows, fontCards(font));
  }

  // All of a font's letters, first letter at the top, two blank rows apart.
  function fontRows(font) {
    var rows = [];
    var blank = new Array((font.height || 0) + 1).join('.');
    font.chars.slice().reverse().forEach(function (c, i) {
      if (i) rows.push(blank, blank);
      rows = rows.concat(letterRows(font, [c.letter]));
    });
    return rows;
  }

  function fontSheet(p) {
    var font = p.font;
    var rows = fontRows(font);
    var q = Object.assign({}, p, { palette: p.palette || GTT.colour.defaultPalette() });
    return doubleface(q, rows, fontCards(font));
  }

  // Selvedge cards (GTT's selvedge generator) sit outside the design and
  // turn forwards on every pick.
  function addSelvedges(out, sel) {
    var left = (sel && sel.left) || [], right = (sel && sel.right) || [];
    if (!left.length && !right.length) return out;
    var nl = left.length, nd = out.cards.length;
    out.cards = left.concat(out.cards, right).map(function (c, i) { return Object.assign({}, c, { number: i + 1 }); });
    out.picks = out.picks.map(function (acts) {
      var moved = acts.map(function (a) { return Object.assign({}, a, { id: String(parseInt(a.id, 10) + nl) }); });
      var l = [], r = [];
      for (var i = 0; i < nl; i++) l.push(turn(i + 1, 'F'));
      for (var j = 0; j < right.length; j++) r.push(turn(nl + nd + j + 1, 'F'));
      return l.concat(moved, r);
    });
    return out;
  }

  // Turn any pattern into something the threaded-in simulation can weave.
  function generate(p, opts) {
    switch (p.kind) {
      case 'threaded': return p;
      case 'doubleface': return addSelvedges(doubleface(p), p.selvedges);
      case 'twill': return addSelvedges(twill(p, opts), p.selvedges);
      case 'twist': return twistPatterned(p, opts);
      case 'brocade': return brocade(p, opts);
      case 'letteredband': return lettered(p);
      case 'font': return fontSheet(p);
    }
    return null;
  }

  GTT.gen = {
    generate: generate,
    doubleface: doubleface,
    twill: twill,
    twistPatterned: twistPatterned,
    brocade: brocade,
    lettered: lettered,
    letterRows: letterRows,
    fontRows: fontRows,
    _turn: turn,
    _twist: twist,
    _base: base
  };
})(typeof window !== 'undefined' ? (window.GTT = window.GTT || {}) : (module.exports = global.GTT = global.GTT || {}));
