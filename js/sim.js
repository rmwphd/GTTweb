/* Threaded-in weaving simulation.
 *
 * These rules were measured from GTT 1.17 itself by loading test patterns with
 * a different colour in every hole and reading back what GTT draws:
 *
 *  - Each card keeps a position p (a hole index, 0 = A) and a "twisted" flag.
 *  - Holes are labelled counter-clockwise, so a forward turn moves p backwards:
 *      effective F:  p -= dist, the visible thread is hole p
 *      effective B:  p += dist, the visible thread is hole p - 1
 *    A reversal therefore shows the same thread twice, as in real weaving.
 *  - A twist (rotation about the vertical axis) flips the card's threading
 *    (S <-> Z) and inverts the turning sense: while twisted, F acts as B.
 *  - An idle card (Dir="I", or no action) repeats the previous thread.
 *  - The drawn slant follows the current threading and the actual turn:
 *      S+F and Z+B draw "/", S+B and Z+F draw "\".
 */
(function (GTT) {
  'use strict';

  var HOLE_LETTERS = 'ABCDEFGH';

  function mod(a, n) { return ((a % n) + n) % n; }

  // Expand one pick's actions into per-card instructions.
  function cardActions(actions, packsByName, nCards) {
    var per = {};
    function get(c) { return per[c] || (per[c] = { twist: 0, turn: null }); }
    actions.forEach(function (a) {
      var targets = [];
      if ((a.target || 'Card') === 'Pack') {
        var pk = packsByName[a.id];
        if (pk) targets = pk.cards.slice();
      } else {
        var c = parseInt(a.id, 10);
        if (!isNaN(c)) targets = [c];
      }
      targets.forEach(function (c) {
        if (c < 1 || c > nCards) return;
        var e = get(c);
        if (a.type === 'Twist') e.twist++;
        else if (a.type === 'Turn') e.turn = { dir: a.dir === 'B' ? 'B' : (a.dir === 'I' ? 'I' : 'F'), dist: a.dist || 1 };
      });
    });
    return per;
  }

  function slantOf(thread, dir) {
    // '/' or '\'
    return ((thread === 'S') === (dir === 'F')) ? '/' : '\\';
  }

  function simulate(p) {
    var cards = p.cards || [];
    var picks = p.picks || [];
    var nCards = cards.length;
    var packsByName = {};
    (p.packs || []).forEach(function (pk) { packsByName[pk.name] = pk; });

    var state = cards.map(function (c) {
      return {
        n: c.holes.length || 4,
        p: 0, twisted: false, thread: c.threading,
        lastVis: null, lastDraw: 'F', lastTurn: null,
        tagA: 1, tagB: 0 // uppermost-hole label = tagA * hole + tagB (mod n)
      };
    });

    var rows = [];
    var summary = [];

    picks.forEach(function (actions, pi) {
      var per = cardActions(actions, packsByName, nCards);
      var row = [];
      var sum = { F: [], B: [], I: [], twist: [], packs: actions.some(function (a) { return a.target === 'Pack'; }), actions: actions };
      for (var ci = 0; ci < nCards; ci++) {
        var s = state[ci], n = s.n, card = cards[ci];
        var act = per[ci + 1] || { twist: 0, turn: null };
        var cell = { twist: act.twist > 0, idle: false, change: false, dist: 1 };

        for (var t = 0; t < act.twist; t++) {
          var ref = (s.lastVis === null) ? s.p : s.lastVis;
          var T = mod(s.tagA * ref + s.tagB, n);
          s.tagA = -s.tagA;
          s.tagB = mod(2 * T - s.tagB, n);
          s.twisted = !s.twisted;
          s.thread = s.thread === 'S' ? 'Z' : 'S';
        }
        if (act.twist) sum.twist.push(ci + 1);

        var vis;
        if (act.turn && act.turn.dir !== 'I') {
          var dir = act.turn.dir, d = act.turn.dist;
          var effF = (dir === 'F') !== s.twisted;
          if (effF) { s.p = mod(s.p - d, n); vis = s.p; }
          else { s.p = mod(s.p + d, n); vis = mod(s.p - 1, n); }
          cell.change = s.lastTurn !== null && s.lastTurn !== dir;
          s.lastTurn = dir;
          s.lastDraw = dir;
          cell.dir = dir;
          cell.dist = d;
          sum[dir].push(ci + 1);
        } else {
          vis = (s.lastVis === null) ? s.p : s.lastVis;
          cell.dir = 'I';
          cell.idle = true;
          sum.I.push(ci + 1);
        }
        s.lastVis = vis;
        cell.drawDir = s.lastDraw;
        cell.thread = s.thread;
        cell.slant = slantOf(s.thread, s.lastDraw);
        cell.hole = vis;
        cell.colourIndex = card.holes[vis];
        cell.colour = p.palette[card.holes[vis]] || '#000000';
        cell.tag = mod(s.tagA * vis + s.tagB, n);
        // Reverse face: the thread opposite the visible one, seen mirrored.
        var back = mod(vis + Math.floor(n / 2), n);
        cell.backHole = back;
        cell.backColour = p.palette[card.holes[back]] || '#000000';
        row.push(cell);
      }
      rows.push(row);
      sum.runs = turningRuns(row);
      if (p.rhythm) sum.rhythmRuns = rhythmRuns(row, p.rhythm, pi);
      summary.push(sum);
    });

    return {
      nCards: nCards,
      nPicks: picks.length,
      rows: rows,          // rows[pick][card], pick 0 = first pick woven
      summary: summary,
      finalState: state.map(function (s) { return { p: s.p, twisted: s.twisted, thread: s.thread }; })
    };
  }

  // Linda Hendrickson's notation: read across the cards from card 1 and count
  // how many neighbouring cards turn the same way. Double turns and idle
  // cards form their own runs.
  function turningRuns(row) {
    var runs = [];
    row.forEach(function (c) {
      var dir = c.dir, dist = dir === 'I' ? 0 : (c.dist || 1);
      var last = runs[runs.length - 1];
      if (last && last.dir === dir && last.dist === dist) last.n++;
      else runs.push({ dir: dir, dist: dist, n: 1 });
    });
    return runs;
  }

  // The same notation for twill: count neighbouring cards that keep their
  // plain twill rhythm ('N') or turn against it ('R'). A blank area of the
  // design is then a single box.
  function rhythmRuns(row, rhythm, k) {
    var runs = [];
    row.forEach(function (c, ci) {
      var r = rhythm[ci] && rhythm[ci][k];
      var dir = c.dir === 'I' ? 'I' : (!r || c.dir === r) ? 'N' : 'R';
      var dist = dir === 'I' ? 0 : (c.dist || 1);
      var last = runs[runs.length - 1];
      if (last && last.dir === dir && last.dist === dist) last.n++;
      else runs.push({ dir: dir, dist: dist, n: 1 });
    });
    return runs;
  }

  // "1 - 3; 5; 7 - 8"
  function formatRanges(list) {
    if (!list.length) return '';
    var out = [], start = list[0], prev = list[0];
    for (var i = 1; i <= list.length; i++) {
      var v = list[i];
      if (v === prev + 1) { prev = v; continue; }
      out.push(start === prev ? String(start) : start + ' - ' + prev);
      start = prev = v;
    }
    return out.join('; ');
  }

  GTT.sim = {
    simulate: simulate,
    formatRanges: formatRanges,
    turningRuns: turningRuns,
    rhythmRuns: rhythmRuns,
    holeLetter: function (i) { return HOLE_LETTERS[i] || String(i + 1); },
    slantOf: slantOf
  };
})(typeof window !== 'undefined' ? (window.GTT = window.GTT || {}) : (module.exports = global.GTT = global.GTT || {}));
