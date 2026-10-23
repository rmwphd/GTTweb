/* Drawing the band.
 *
 * Geometry follows GTT's "real image": each pick of each card is a
 * parallelogram with vertical sides. With display ratios Width / End / Centre
 * (GTT defaults 3 / 5 / 0) and a zoom of z pixels per unit:
 *   cell width  w = Width * z
 *   slant       s = End * z     (rise across one card)
 *   pick pitch  P = (End + Centre) * z
 * The boundary below pick k takes pick k's slant; the boundary above takes
 * pick k+1's slant. Where the turning direction changes, the two boundaries
 * disagree and the cell becomes a triangle, exactly as GTT draws it.
 *
 * Work happens in "band space" (u across the cards, v along the picks, v up)
 * and is mapped to the canvas for vertical or horizontal display. Horizontal
 * is GTT's rotation: 90 degrees anticlockwise, first pick on the right.
 */
(function (GTT) {
  'use strict';

  var MARK = {
    twist: '#0000ff',   // blue diamond
    change: '#ff0000',  // red dot
    idle: '#008000',
    twineS: '#ff0000',  // S-twined (\)
    twineZ: '#0000ff',  // Z-twined (/)
    highlight: '#ff0000'
  };

  var FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

  function fitText(ctx, size, weight) {
    ctx.font = (weight || 600) + ' ' + Math.round(size) + 'px ' + FONT;
  }

  function contrast(hex) { return GTT.colour.isDark(hex) ? '#ffffff' : '#000000'; }

  /* ---------- layout ---------- */

  // Margins around the band: pick numbers before it (left, or above when
  // horizontal), turning boxes after it (right, or below), card numbers and
  // the threading strip on the remaining side.
  function layout(nCards, nPicks, o, extra) {
    extra = extra || {};
    var z = o.zoom;
    var w = extra.cellWidth || o.ratios.width * z;
    var s = o.mode === 'block' ? 0 : o.ratios.end * z;
    var P = extra.pitch || (o.ratios.end + o.ratios.centre) * z;
    var bandU = nCards * w;
    var bandV = extra.bandV !== undefined ? extra.bandV : nPicks * P + s;
    var numbers = !!o.flags.numbers;
    var pickLabel = numbers ? (o.orient === 'h' ? 18 : Math.max(22, String(nPicks).length * 8 + 10)) : 0;
    var cardLabel = numbers ? (o.orient === 'h' ? Math.max(22, String(nCards).length * 8 + 10) : 18) : 0;
    var strip = 0;
    if (o.flags.threading && extra.holes) strip = (extra.holes + 1) * Math.min(w, 16) + 8;
    var boxes = extra.boxes || 0; // space needed after the band for turning boxes
    var pad = 10;
    var L = {
      z: z, w: w, s: s, P: P, nCards: nCards, nPicks: nPicks,
      bandU: bandU, bandV: bandV, pad: pad, pickLabel: pickLabel, cardLabel: cardLabel,
      strip: strip, boxes: boxes, orient: o.orient, reverse: !!o.reverse
    };
    if (o.orient === 'h') {
      L.ox = pad; L.oy = pad + pickLabel;
      L.width = pad * 2 + bandV + cardLabel + strip;
      L.height = L.oy + bandU + boxes + pad;
    } else {
      L.ox = pad + pickLabel; L.oy = pad;
      L.width = L.ox + bandU + boxes + pad;
      L.height = pad * 2 + bandV + cardLabel + strip;
    }
    return L;
  }

  // band space -> canvas
  function mapper(L) {
    var mirror = L.reverse;
    if (L.orient === 'h') {
      return function (u, v) {
        if (mirror) u = L.bandU - u;
        return [L.ox + (L.bandV - v), L.oy + (L.bandU - u)];
      };
    }
    return function (u, v) {
      if (mirror) u = L.bandU - u;
      return [L.ox + u, L.oy + (L.bandV - v)];
    };
  }

  function poly(ctx, map, pts) {
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      var c = map(pt[0], pt[1]);
      if (i) ctx.lineTo(c[0], c[1]); else ctx.moveTo(c[0], c[1]);
    });
    ctx.closePath();
  }

  function setup(canvas, L, bg) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(L.width * dpr);
    canvas.height = Math.ceil(L.height * dpr);
    canvas.style.width = Math.ceil(L.width) + 'px';
    canvas.style.height = Math.ceil(L.height) + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.width, L.height);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, L.width, L.height); }
    ctx.lineJoin = 'round';
    return ctx;
  }

  /* ---------- markers ---------- */

  function drawDiamond(ctx, x, y, r, fill, edge) {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.62, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.62, y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.lineWidth = 1; ctx.strokeStyle = edge; ctx.stroke(); }
  }
  function drawDot(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = Math.max(1, r / 5); ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }
  function drawSquare(ctx, x, y, r, fill) {
    ctx.fillStyle = fill; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = '#7fbf7f'; ctx.strokeRect(x - r + 0.5, y - r + 0.5, r * 2 - 1, r * 2 - 1);
  }

  /* ---------- threaded-in band ---------- */

  function drawThreaded(canvas, p, sim, o) {
    var holes = 0;
    p.cards.forEach(function (c) { holes = Math.max(holes, c.holes.length); });
    var box = o.flags.boxes ? boxMetrics(sim, o) : null;
    var L = layout(sim.nCards, sim.nPicks, o, { holes: holes, boxes: box ? box.space : 0 });
    var ctx = setup(canvas, L, o.background);
    var map = mapper(L);
    var w = L.w, s = L.s, P = L.P;
    var gridColour = o.gridColour || '#808080';

    function boundary(k, card) {
      // v at left and right edges of the boundary below pick k
      var row = sim.rows[Math.min(k, sim.nPicks - 1)];
      var slant = row ? row[card].slant : '/';
      var vc = k * P + s / 2;
      return slant === '/' ? [vc - s / 2, vc + s / 2] : [vc + s / 2, vc - s / 2];
    }

    function cellShape(k, c) {
      var u0 = c * w, u1 = u0 + w;
      if (o.mode === 'block') return [[u0, k * P], [u1, k * P], [u1, (k + 1) * P], [u0, (k + 1) * P]];
      var b = boundary(k, c);
      var t = (k + 1 < sim.nPicks) ? boundary(k + 1, c) : [b[0] + P, b[1] + P];
      return [[u0, b[0]], [u1, b[1]], [u1, t[1]], [u0, t[0]]];
    }

    function cellCentre(k, c) {
      var u = c * w + w / 2;
      var v = o.mode === 'block' ? k * P + P / 2 : k * P + s / 2 + P / 2;
      return map(u, v);
    }

    function markPoint(k, c) {
      var u = c * w + w / 2;
      return map(u, o.mode === 'block' ? k * P : k * P + s / 2);
    }

    var unit = Math.min(w, P);

    for (var k = 0; k < sim.nPicks; k++) {
      for (var c = 0; c < sim.nCards; c++) {
        var cell = sim.rows[k][c];
        var fill = !o.flags.colours ? '#ffffff' : (o.reverse ? cell.backColour : cell.colour);
        if (o.flags.turnDir && o.turnDirStyle === 'blocks') fill = cell.dir === 'B' ? '#000000' : (cell.dir === 'I' ? '#bfbfbf' : '#ffffff');
        poly(ctx, map, cellShape(k, c));
        ctx.fillStyle = fill;
        ctx.fill();
        if (o.flags.grid && (unit >= 4)) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = gridColour;
          ctx.stroke();
        }
      }
    }

    // Twining direction / diagonal turn lines (block view)
    if (o.mode === 'block' && (o.flags.twining || (o.flags.turnDir && o.turnDirStyle === 'lines'))) {
      ctx.lineWidth = Math.max(1, unit / 12);
      for (k = 0; k < sim.nPicks; k++) {
        for (c = 0; c < sim.nCards; c++) {
          var cl = sim.rows[k][c];
          var sl = o.reverse ? (cl.slant === '/' ? '\\' : '/') : cl.slant;
          var u0 = c * w, u1 = u0 + w, v0 = k * P, v1 = v0 + P;
          var a = sl === '/' ? map(u0, v0) : map(u0, v1);
          var bb = sl === '/' ? map(u1, v1) : map(u1, v0);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]);
          ctx.strokeStyle = o.flags.twining ? (sl === '/' ? MARK.twineZ : MARK.twineS) : '#000000';
          ctx.stroke();
        }
      }
    }

    // Grid highlights every X cards / Y picks
    if (o.flags.highlights && o.highlight) {
      ctx.lineWidth = o.highlight.width || 1;
      ctx.strokeStyle = o.highlight.colour || MARK.highlight;
      var hx = o.highlight.x, hy = o.highlight.y, p1, p2;
      if (hx > 0) for (c = hx; c < sim.nCards; c += hx) {
        p1 = map(c * w, 0); p2 = map(c * w, L.bandV);
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
      if (hy > 0) for (k = hy; k < sim.nPicks; k += hy) {
        var vv = k * P + (o.mode === 'block' ? 0 : s / 2);
        p1 = map(0, vv); p2 = map(L.bandU, vv);
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }
    }

    // Per-cell markers and text
    var r = Math.max(2, unit * 0.22);
    var textSize = Math.max(7, unit * 0.55);
    for (k = 0; k < sim.nPicks; k++) {
      for (c = 0; c < sim.nCards; c++) {
        var ce = sim.rows[k][c];
        var pt = cellCentre(k, c);
        var bgc = !o.flags.colours ? '#ffffff' : (o.reverse ? ce.backColour : ce.colour);
        if (o.flags.holeTags && unit >= 10) {
          fitText(ctx, textSize, 600);
          ctx.fillStyle = contrast(bgc); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(GTT.sim.holeLetter(ce.tag), pt[0], pt[1]);
        } else if (o.flags.turnDir && o.turnDirStyle === 'letters' && unit >= 10) {
          fitText(ctx, textSize, 700);
          ctx.fillStyle = contrast(bgc); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ce.dir === 'I' ? '-' : ce.dir, pt[0], pt[1]);
        }
        // GTT puts these markers on the boundary where the pick starts.
        var mk = markPoint(k, c);
        if (o.flags.dirChanges && ce.change) drawDot(ctx, mk[0], mk[1], r, MARK.change);
        if (o.flags.twists && ce.twist) drawDiamond(ctx, mk[0], mk[1], r * 1.6, MARK.twist, MARK.change);
        if (o.flags.idle && ce.idle) drawSquare(ctx, mk[0], mk[1], r * 0.8, MARK.idle);
      }
    }

    // Pick and card numbers
    if (o.flags.numbers) drawNumbers(ctx, L, map, o);

    // Turning boxes beside the band
    if (box) drawBoxes(ctx, L, map, sim, o, box);

    // Threading strip under the band
    if (o.flags.threading) drawThreadingStrip(ctx, L, p, o);

    L.hit = function (x, y) { return hitTest(L, x, y); };
    return L;
  }

  /* ---------- turning boxes (Linda Hendrickson's notation) ---------- */

  var BOX = { F: '#ffffff', B: '#b9b9b9', I: '#ececec', line: '#2b2b2b', text: '#111111' };

  function boxMetrics(sim, o) {
    var z = o.zoom;
    var P = (o.ratios.end + o.ratios.centre) * z;
    var maxRuns = 0, maxN = 1, twistW = 0;
    sim.summary.forEach(function (x) {
      maxRuns = Math.max(maxRuns, x.runs.length);
      x.runs.forEach(function (r) { maxN = Math.max(maxN, r.n); });
      if (x.twist.length) twistW = Math.max(twistW, 26 + 7 * GTT.sim.formatRanges(x.twist).length);
    });
    var font = Math.max(8, Math.min(16, P * 0.68));
    var digits = String(maxN).length;
    // boxes are about square, never narrower than their number
    var along = o.orient === 'h' ? Math.max(14, font * 1.45) : Math.max(P, digits * font * 0.62 + 8, 12);
    var gap = 12;
    return { font: font, along: along, gap: gap, maxRuns: maxRuns, twistW: twistW,
      space: gap + maxRuns * along + (o.orient === 'h' ? (twistW ? 18 : 0) : twistW) + 4 };
  }

  function drawBoxes(ctx, L, map, sim, o, box) {
    var showText = (o.orient === 'h' ? L.P : L.P) >= 9;
    fitText(ctx, box.font, 600);
    for (var k = 0; k < sim.nPicks; k++) {
      var v0 = k * L.P + (o.mode === 'block' ? 0 : L.s / 2), v1 = v0 + L.P;
      var a = map(0, v0), b = map(0, v1);
      var runs = sim.summary[k].runs;
      var pos = 0;
      for (var i = 0; i < runs.length; i++) {
        var r = runs[i], x, y, wdt, hgt;
        if (L.orient === 'h') {
          x = Math.min(a[0], b[0]); wdt = Math.abs(b[0] - a[0]);
          y = L.oy + L.bandU + box.gap + pos; hgt = box.along;
        } else {
          y = Math.min(a[1], b[1]); hgt = Math.abs(b[1] - a[1]);
          x = L.ox + L.bandU + box.gap + pos; wdt = box.along;
        }
        pos += box.along;
        ctx.fillStyle = BOX[r.dir] || BOX.F;
        ctx.fillRect(x, y, wdt, hgt);
        ctx.lineWidth = 1;
        ctx.strokeStyle = BOX.line;
        if (r.dir === 'I') ctx.setLineDash([3, 2]);
        ctx.strokeRect(x + 0.5, y + 0.5, wdt - 1, hgt - 1);
        ctx.setLineDash([]);
        if (r.dist > 1 && wdt > 6 && hgt > 6) {
          // a half turn: double edge
          ctx.strokeRect(x + 2.5, y + 2.5, wdt - 5, hgt - 5);
        }
        if (showText) {
          ctx.fillStyle = r.dir === 'I' ? '#6b6b6b' : BOX.text;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(r.n), x + wdt / 2, y + hgt / 2 + 0.5);
        }
      }
      var tw = sim.summary[k].twist;
      if (tw.length && showText) {
        fitText(ctx, Math.max(8, box.font * 0.8), 600);
        ctx.fillStyle = o.textColour || '#333';
        var label = 'tw ' + GTT.sim.formatRanges(tw).replace(/ /g, '');
        if (L.orient === 'h') {
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('tw', (a[0] + b[0]) / 2, L.oy + L.bandU + box.gap + pos + 3);
        } else {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(label, L.ox + L.bandU + box.gap + pos + 5, (a[1] + b[1]) / 2);
        }
        fitText(ctx, box.font, 600);
      }
    }
  }

  function drawNumbers(ctx, L, map, o) {
    var size = 11;
    fitText(ctx, size, 500);
    ctx.fillStyle = o.textColour || '#333';
    var every = Math.max(1, Math.ceil((size * 1.5) / L.P));
    every = every <= 1 ? 1 : (every <= 5 ? 5 : Math.ceil(every / 10) * 10);
    var vOff = L.s / 2 + L.P / 2;
    for (var k = 0; k < L.nPicks; k++) {
      var n = k + 1;
      if (n !== 1 && n % every) continue;
      var pt = map(0, k * L.P + vOff);
      if (L.orient === 'h') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(String(n), pt[0], L.oy - 4);
      } else {
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), L.ox - 6, pt[1]);
      }
    }
    var everyC = Math.max(1, Math.ceil((size * 1.8) / L.w));
    everyC = everyC <= 1 ? 1 : (everyC <= 5 ? 5 : 10);
    for (var c = 0; c < L.nCards; c++) {
      var m = c + 1;
      if (m !== 1 && m % everyC) continue;
      var q = map(c * L.w + L.w / 2, 0);
      if (L.orient === 'h') {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(String(m), L.ox + L.bandV + 5, q[1]);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(String(m), q[0], L.oy + L.bandV + 4);
      }
    }
  }

  // Thread colours of every card (hole A first) plus the S/Z threading,
  // drawn beside the band so each column lines up with its card.
  function drawThreadingStrip(ctx, L, p, o) {
    var sq = Math.min(L.w, 16);
    var nH = 0;
    p.cards.forEach(function (c) { nH = Math.max(nH, c.holes.length); });
    fitText(ctx, Math.max(8, sq * 0.7), 700);
    for (var ci = 0; ci < p.cards.length; ci++) {
      var card = p.cards[ci];
      var slot = L.reverse ? (p.cards.length - 1 - ci) : ci;
      for (var h = 0; h <= nH; h++) {
        var x, y, cw, chh;
        if (L.orient === 'h') {
          // cards run upwards (card 1 at the bottom); strip sits to the right
          x = L.ox + L.bandV + L.cardLabel + 8 + h * sq;
          y = L.oy + L.bandU - (slot + 1) * L.w;
          cw = sq; chh = L.w;
        } else {
          x = L.ox + slot * L.w;
          y = L.oy + L.bandV + L.cardLabel + 8 + h * sq;
          cw = L.w; chh = sq;
        }
        if (h < card.holes.length) {
          ctx.fillStyle = p.palette[card.holes[h]] || '#000';
          ctx.fillRect(x, y, cw, chh);
          ctx.strokeStyle = '#808080'; ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
        } else if (h === nH) {
          ctx.fillStyle = o.textColour || '#333';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(card.threading, x + cw / 2, y + chh / 2);
        }
      }
    }
  }

  function hitTest(L, x, y) {
    var u, v;
    if (L.orient === 'h') { v = L.bandV - (x - L.ox); u = L.bandU - (y - L.oy); }
    else { u = x - L.ox; v = L.bandV - (y - L.oy); }
    if (L.reverse) u = L.bandU - u;
    if (v < 0 || v >= L.bandV) return null;
    // clicks on the turning boxes beside the band also select the pick
    if (u < -0.5 * L.w || u >= L.bandU + L.boxes) return null;
    var card = Math.max(0, Math.min(L.nCards - 1, Math.floor(u / L.w)));
    var pick = Math.floor((v - L.s / 2) / L.P);
    if (pick < 0) pick = 0;
    if (pick >= L.nPicks) pick = L.nPicks - 1;
    return { card: card, pick: pick };
  }

  /* ---------- block design charts (double-face, twill, twist, brocade) ---------- */

  // grid: rows bottom-up, each a string; colourFor(char, col, row) -> hex
  function drawGrid(canvas, grid, o, colourFor, opts) {
    opts = opts || {};
    var nCols = grid.length ? grid[0].length : 0;
    var nRows = grid.length;
    var z = o.zoom;
    var cw = (opts.cellW || 2) * z * 1.5, ch = (opts.cellH || 2) * z * 1.5;
    var mode = { mode: 'block', zoom: z, ratios: { width: 1, end: 1, centre: 0 }, flags: o.flags, orient: o.orient, reverse: false };
    var L = layout(nCols, nRows, mode, { pitch: ch, cellWidth: cw, holes: opts.stripRows || 0, bandV: nRows * ch + (opts.stagger ? ch / 2 : 0) });
    var ctx = setup(canvas, L, o.background);
    var map = mapper(L);
    for (var r = 0; r < nRows; r++) {
      var row = grid[r];
      for (var c = 0; c < nCols; c++) {
        var off = opts.stagger ? opts.stagger(c) * ch : 0;
        var u0 = c * cw, v0 = r * ch + off;
        poly(ctx, map, [[u0, v0], [u0 + cw, v0], [u0 + cw, v0 + ch], [u0, v0 + ch]]);
        ctx.fillStyle = colourFor(row[c], c, r);
        ctx.fill();
        if (o.flags.grid && Math.min(cw, ch) >= 4) { ctx.strokeStyle = o.gridColour || '#808080'; ctx.lineWidth = 1; ctx.stroke(); }
        if (opts.mark && opts.mark(c, r)) {
          var m = map(u0 + cw / 2, v0 + ch / 2);
          drawDiamond(ctx, m[0], m[1], Math.min(cw, ch) * 0.3, opts.markColour || '#ff0000');
        }
      }
    }
    if (o.flags.highlights && o.highlight) {
      ctx.strokeStyle = o.highlight.colour; ctx.lineWidth = o.highlight.width || 1;
      for (var hc = o.highlight.x; hc > 0 && hc < nCols; hc += o.highlight.x) {
        var a = map(hc * cw, 0), b = map(hc * cw, L.bandV);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      for (var hr = o.highlight.y; hr > 0 && hr < nRows; hr += o.highlight.y) {
        var a2 = map(0, hr * ch), b2 = map(L.bandU, hr * ch);
        ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
      }
    }
    if (o.flags.numbers) {
      drawNumbers(ctx, L, map, o);
    }
    if (opts.strip) opts.strip(ctx, L, map);
    L.hit = function (x, y) {
      var u, v;
      if (L.orient === 'h') { v = L.bandV - (x - L.ox); u = L.bandU - (y - L.oy); }
      else { u = x - L.ox; v = L.bandV - (y - L.oy); }
      if (u < 0 || u >= L.bandU || v < 0 || v >= L.bandV) return null;
      return { card: Math.floor(u / cw), pick: Math.floor(v / ch) };
    };
    return L;
  }

  GTT.render = {
    drawThreaded: drawThreaded,
    drawGrid: drawGrid,
    MARK: MARK
  };
})(window.GTT = window.GTT || {});
