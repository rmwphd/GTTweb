/* GTT Web: user interface. */
(function (GTT) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ZOOMS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20];
  var BASE_ZOOM = 4;
  var STORE_KEY = 'gttweb.view.v1';

  var DEFAULT_VIEW = {
    mode: 'real', reverse: false, orient: 'v', zoom: BASE_ZOOM,
    ratios: { width: 3, end: 5, centre: 0 },
    flags: { colours: true, grid: true, numbers: true, boxes: true, threading: false, highlights: false,
      dirChanges: false, twists: false, idle: false, holeTags: false, turnDir: false, twining: false },
    turnDirStyle: 'letters',
    highlight: { x: 4, y: 4, colour: '#ff0000', width: 1 },
    tab: 'turning'
  };

  var state = { docs: [], active: null, view: loadView(), seq: 0 };

  /* ---------- persistence (per-browser conveniences only) ---------- */

  function loadView() {
    var v = JSON.parse(JSON.stringify(DEFAULT_VIEW));
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        Object.keys(v).forEach(function (k) {
          if (saved[k] === undefined) return;
          if (typeof v[k] === 'object' && v[k] !== null) Object.assign(v[k], saved[k]);
          else v[k] = saved[k];
        });
      }
    } catch (e) { /* storage unavailable: use defaults */ }
    return v;
  }
  function saveView() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.view)); } catch (e) { /* ignore */ }
  }

  /* ---------- messages ---------- */

  var toastTimer = null;
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 7000 : 3200);
  }

  /* ---------- documents ---------- */

  function activeDoc() {
    for (var i = 0; i < state.docs.length; i++) if (state.docs[i].id === state.active) return state.docs[i];
    return null;
  }

  function addDoc(p) {
    var doc = { id: ++state.seq, p: p, sim: null, selectedPick: null };
    if (p.kind === 'threaded') doc.sim = GTT.sim.simulate(p);
    state.docs.push(doc);
    state.active = doc.id;
    fitZoom(doc);
    if (p.warnings && p.warnings.length) toast(p.warnings[0]);
    refresh();
  }

  // Pick a zoom so the band fills the viewing area without being tiny.
  function fitZoom(doc) {
    var p = doc.p, v = state.view;
    var wrap = $('band-wrap');
    var availH = (wrap && wrap.clientHeight) || (window.innerHeight - 160);
    var availW = (wrap && wrap.clientWidth) || (window.innerWidth - 420);
    if (availH < 200) availH = Math.max(320, window.innerHeight * 0.55);
    if (availW < 200) availW = window.innerWidth - 32;
    var across, along;
    if (p.kind === 'threaded') {
      across = p.cards.length * v.ratios.width;
      along = (p.picks.length + 1) * (v.ratios.end + v.ratios.centre);
    } else {
      across = (p.width || (p.font ? p.font.height : 20)) * 3;
      along = Math.max(1, (p.length || (p.visual ? p.visual.length : 20))) * 4.5;
    }
    if (v.orient === 'h') { var t = across; across = along; along = t; }
    var best = ZOOMS[0];
    ZOOMS.forEach(function (z) {
      if (z <= 10 && across * z + 60 <= availW && (along * z + 60 <= availH || z <= 3)) best = z;
    });
    v.zoom = best;
  }

  function closeDoc(id) {
    var i = state.docs.findIndex(function (d) { return d.id === id; });
    if (i < 0) return;
    state.docs.splice(i, 1);
    if (state.active === id) state.active = state.docs.length ? state.docs[Math.max(0, i - 1)].id : null;
    refresh();
  }

  function openText(text, fileName) {
    try {
      addDoc(GTT.io.parse(text, fileName));
      return true;
    } catch (e) {
      toast('Could not open ' + (fileName || 'the file') + '. ' + e.message, true);
      return false;
    }
  }

  function openFiles(fileList) {
    Array.prototype.forEach.call(fileList, function (f) {
      f.arrayBuffer().then(function (buf) {
        openText(GTT.io.decodeBytes(buf), f.name);
      }).catch(function (e) { toast('Could not read ' + f.name + '. ' + e.message, true); });
    });
  }

  /* ---------- rendering ---------- */

  function renderOptions(doc) {
    var v = state.view;
    var css = getComputedStyle(document.documentElement);
    return {
      zoom: v.zoom, ratios: v.ratios, mode: v.mode, orient: v.orient, reverse: v.reverse,
      flags: v.flags, turnDirStyle: v.turnDirStyle, highlight: v.highlight,
      gridColour: '#808080',
      background: css.getPropertyValue('--band-bg').trim() || '#f7f8f5',
      textColour: css.getPropertyValue('--ink').trim() || '#222',
      selectedPick: doc ? doc.selectedPick : null
    };
  }

  function patternColour(p, card, which) {
    var c = p.cards[card] || p.cards[0];
    if (!c) return which === 'X' ? '#000000' : '#ffffff';
    if (p.kind === 'twill') {
      // Twill cards carry two colours; the pattern colour is the first card's hole A.
      var pc = p.cards[0].holes[0];
      var other = c.holes.find(function (h) { return h !== pc; });
      return p.palette[which === 'X' ? pc : (other === undefined ? pc : other)];
    }
    return p.palette[which === 'X' ? c.holes[0] : c.holes[Math.min(2, c.holes.length - 1)]];
  }

  function letteredRows(font, chars) {
    // Build a double-face design from the font's letters, in band order.
    var rows = [], H = font.height || 0;
    var blank = new Array(H + 1).join('.');
    function pushBlank(n) { for (var i = 0; i < n; i++) rows.push(blank); }
    chars.forEach(function (ch, i) {
      var c = font.chars.find(function (x) { return x.letter === ch; });
      if (!c) return;
      pushBlank(c.spaceBefore || 0);
      (c.pattern ? c.pattern.data : []).forEach(function (r) { rows.push((r + blank).slice(0, H)); });
      pushBlank(c.spaceAfter || 0);
      if (i < chars.length - 1) pushBlank(font.kerning || 0);
    });
    return rows;
  }

  function drawDoc(doc) {
    var canvas = $('band');
    var p = doc.p, o = renderOptions(doc);
    var note = $('band-note');
    note.hidden = true;
    var L;
    if (p.kind === 'threaded') {
      L = GTT.render.drawThreaded(canvas, p, doc.sim, o);
      if (doc.selectedPick !== null) drawSelection(canvas, L, doc.selectedPick, o);
    } else {
      var grid = [], opts = { cellW: 2, cellH: 2 }, colourFor;
      var dark = '#1c1c1c', light = '#ffffff';
      switch (p.kind) {
        case 'doubleface':
          grid = p.data; opts = { cellW: 2, cellH: 4 };
          colourFor = function (ch, c) { return patternColour(p, c, ch === 'X' ? 'X' : '.'); };
          break;
        case 'twill':
          grid = p.data; opts = { cellW: 2, cellH: 6, stagger: function (c) { return (c % 2) ? 0 : 0.5; } };
          var lf = p.longFloats || [];
          opts.mark = function (c, r) { return lf[r] && lf[r][c] === 'X'; };
          opts.markColour = '#ff0000';
          colourFor = function (ch, c) { return patternColour(p, c, ch === 'X' ? 'X' : '.'); };
          break;
        case 'twist':
          grid = p.data; opts = { cellW: 2, cellH: 3 };
          colourFor = function (ch) { return ch === 'X' ? dark : light; };
          break;
        case 'brocade':
          grid = p.visual; opts = { cellW: 2, cellH: 2 };
          colourFor = function (ch) {
            if (ch === '.' || !ch) return '#e9e4d8';
            var wi = ch.charCodeAt(0) - 65;
            return (p.wefts[wi] && p.wefts[wi].colour) || dark;
          };
          break;
        case 'letteredband':
          grid = p.font ? letteredRows(p.font, p.text || []) : [];
          opts = { cellW: 2, cellH: 4 };
          colourFor = function (ch) { return ch === 'X' ? dark : light; };
          break;
        case 'font':
          var all = [];
          p.font.chars.forEach(function (c, i) {
            all = all.concat(letteredRows(p.font, [c.letter]));
            if (i < p.font.chars.length - 1) all.push(new Array(p.font.height + 1).join('.'), new Array(p.font.height + 1).join('.'));
          });
          grid = all; opts = { cellW: 2, cellH: 4 };
          colourFor = function (ch) { return ch === 'X' ? dark : light; };
          break;
      }
      if (!grid.length) {
        var ctx = canvas.getContext('2d'); canvas.width = canvas.height = 1; ctx.clearRect(0, 0, 1, 1);
        note.textContent = 'This pattern has no design to show yet.'; note.hidden = false;
        return;
      }
      L = GTT.render.drawGrid(canvas, grid, o, colourFor, opts);
      note.textContent = 'You are looking at the design chart. A woven preview and turning sequence for ' +
        p.kindLabel.toLowerCase() + ' patterns are not available yet.';
      note.hidden = false;
    }
    doc.layout = L;
  }

  function drawSelection(canvas, L, k, o) {
    var ctx = canvas.getContext('2d');
    var css = getComputedStyle(document.documentElement);
    var weld = css.getPropertyValue('--weld').trim() || '#d4a72c';
    var v0 = k * L.P + (o.mode === 'block' ? 0 : L.s / 2), v1 = v0 + L.P;
    var x, y, wd, ht;
    if (L.orient === 'h') {
      x = L.ox + L.bandV - v1; wd = L.P;
      y = L.oy; ht = L.bandU + L.boxes;
    } else {
      x = L.ox; wd = L.bandU + L.boxes;
      y = L.oy + L.bandV - v1; ht = L.P;
    }
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = weld;
    ctx.strokeRect(x - 2, y, wd + 4, ht);
    ctx.restore();
  }

  /* ---------- side panels ---------- */

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function packSummary(acts) {
    var out = [];
    acts.forEach(function (a) {
      if (a.target !== 'Pack') return;
      var verb = a.type === 'Twist' ? 'twist' : (a.dir === 'B' ? 'B' : (a.dir === 'I' ? 'idle' : 'F'));
      out.push(a.id + ' ' + verb);
    });
    return out.join(', ');
  }

  function turningPanel(doc) {
    var p = doc.p;
    if (p.kind !== 'threaded') {
      return '<p class="muted">The turning sequence for ' + esc(p.kindLabel.toLowerCase()) + ' patterns is worked out from the design. That part of GTT Web is still being built.</p>';
    }
    var s = doc.sim;
    if (!s.nPicks) return '<p class="muted">This pattern has no picks yet.</p>';
    var usesPacks = s.summary.some(function (x) { return x.packs; });
    var anyIdle = s.summary.some(function (x) { return x.I.length && x.I.length < s.nCards; });
    var h = state.view.flags.boxes ? '<p class="muted legend"><span class="bx f">5</span> turn forwards <span class="bx b">5</span> turn backwards <span class="bx i">5</span> idle <span class="bx d">5</span> double turn. Beside the band, each pick reads from card 1: the numbers count neighbouring cards that turn together.</p>' : '';
    h += '<table class="seq"><thead><tr><th class="n">Pick</th><th>Forwards</th><th>Backwards</th>' +
      (anyIdle ? '<th>Idle</th>' : '') + '<th>Twist</th>' + (usesPacks ? '<th>Packs</th>' : '') + '</tr></thead><tbody>';
    for (var k = s.nPicks - 1; k >= 0; k--) {
      var x = s.summary[k];
      h += '<tr data-pick="' + k + '"' + (doc.selectedPick === k ? ' class="sel"' : '') + '><td class="n">' + (k + 1) + '</td><td>' +
        GTT.sim.formatRanges(x.F) + '</td><td>' + GTT.sim.formatRanges(x.B) + '</td>' +
        (anyIdle ? '<td>' + (x.I.length < s.nCards ? GTT.sim.formatRanges(x.I) : 'all') + '</td>' : '') +
        '<td>' + GTT.sim.formatRanges(x.twist) + '</td>' +
        (usesPacks ? '<td>' + esc(packSummary(x.actions)) + '</td>' : '') + '</tr>';
    }
    return h + '</tbody></table>';
  }

  function threadingPanel(doc) {
    var p = doc.p;
    var cards = p.cards || [];
    if (p.kind === 'twist') {
      var t = '<p class="muted">Twist-patterned bands use one colour per card. Threading for each card:</p><div class="chart-scroll"><table class="thread-chart"><tr>';
      (p.twistThreading || []).forEach(function (_, i) { t += '<th>' + (i + 1) + '</th>'; });
      t += '</tr><tr>';
      (p.twistThreading || []).forEach(function (th) { t += '<td class="thr">' + th + '</td>'; });
      return t + '</tr></table></div>';
    }
    if (!cards.length) return '<p class="muted">This pattern has no cards.</p>';
    var nH = 0;
    cards.forEach(function (c) { nH = Math.max(nH, c.holes.length); });
    var h = '<p class="muted">Each column is a card, numbered from the left. Rows are holes A to ' + GTT.sim.holeLetter(nH - 1) + '.</p>';
    h += '<div class="chart-scroll"><table class="thread-chart"><tr><th></th>';
    cards.forEach(function (_, i) { h += '<th>' + (i + 1) + '</th>'; });
    h += '</tr>';
    for (var r = 0; r < nH; r++) {
      h += '<tr><th>' + GTT.sim.holeLetter(r) + '</th>';
      cards.forEach(function (c) {
        if (r < c.holes.length) {
          var col = p.palette[c.holes[r]] || '#000';
          h += '<td style="background:' + col + '" title="Card hole ' + GTT.sim.holeLetter(r) + ': colour ' + (c.holes[r] + 1) + ' ' + col + '"></td>';
        } else h += '<td class="thr"></td>';
      });
      h += '</tr>';
    }
    h += '<tr><th></th>';
    cards.forEach(function (c) { h += '<td class="thr">' + c.threading + '</td>'; });
    h += '</tr></table></div>';
    var sel = p.selvedges;
    if (sel && (sel.left.length || sel.right.length)) {
      h += '<p class="muted">Selvedges: ' + sel.left.length + ' cards on the left, ' + sel.right.length + ' on the right.</p>';
    }
    h += '<h3>Colours</h3>' + swatches(p);
    return h;
  }

  function swatches(p) {
    var used = {};
    (p.cards || []).forEach(function (c) { c.holes.forEach(function (x) { used[x] = (used[x] || 0) + 1; }); });
    var keys = Object.keys(used).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return '<p class="muted">No thread colours are set.</p>';
    return '<div class="swatches">' + keys.map(function (k) {
      return '<span class="swatch"><i style="background:' + p.palette[k] + '"></i>' + (k + 1) + ' <span class="muted">(' + used[k] + ' threads)</span></span>';
    }).join('') + '</div>';
  }

  function pickPanel(doc) {
    var p = doc.p;
    if (p.kind !== 'threaded') return '<p class="muted">Pick-by-pick details are available for threaded-in patterns.</p>';
    var s = doc.sim;
    if (!s.nPicks) return '<p class="muted">This pattern has no picks yet.</p>';
    var k = doc.selectedPick === null ? 0 : doc.selectedPick;
    var x = s.summary[k];
    var h = '<div class="pick-nav"><button class="btn small" data-pick-step="-1" aria-label="Previous pick">Previous</button>' +
      '<label>Pick <input type="number" id="pick-input" min="1" max="' + s.nPicks + '" value="' + (k + 1) + '"></label>' +
      '<span class="muted">of ' + s.nPicks + '</span>' +
      '<button class="btn small" data-pick-step="1" aria-label="Next pick">Next</button></div>';
    var lines = [];
    function cardsText(list) { return list.length === s.nCards ? 'all cards' : (list.length === 1 ? 'card ' : 'cards ') + GTT.sim.formatRanges(list); }
    if (x.twist.length) lines.push('First twist ' + cardsText(x.twist) + '.');
    if (x.F.length) lines.push('Turn forwards: ' + cardsText(x.F) + '.');
    if (x.B.length) lines.push('Turn backwards: ' + cardsText(x.B) + '.');
    if (x.I.length) lines.push('Leave idle: ' + cardsText(x.I) + '.');
    var dist2 = s.rows[k].map(function (c, i) { return c.dist > 1 && c.dir !== 'I' ? i + 1 : 0; }).filter(Boolean);
    if (dist2.length) { var t2 = cardsText(dist2); lines.push(t2.charAt(0).toUpperCase() + t2.slice(1) + ' turn twice (a half turn).'); }
    h += '<p>' + lines.map(esc).join('<br>') + '</p>';
    h += '<h3>Top thread on each card after this pick</h3><div class="cards-now">';
    s.rows[k].forEach(function (c, i) {
      var col = c.colour;
      h += '<div class="card-now dir-' + c.dir + '"><b>' + (i + 1) + '</b><span class="dot" style="background:' + col + ';color:' + (GTT.colour.isDark(col) ? '#fff' : '#000') + '">' +
        GTT.sim.holeLetter(c.tag) + '</span>' + (c.dir === 'I' ? 'idle' : c.dir) + ' ' + c.thread + '</div>';
    });
    return h + '</div><p class="muted">Letters show the uppermost hole, as in GTT. Cards with a dark edge turn backwards.</p>';
  }

  function detailsPanel(doc) {
    var p = doc.p;
    var h = '<h2>' + esc(p.name) + '</h2>';
    h += '<dl class="facts"><dt>Type</dt><dd>' + esc(p.kindLabel) + '</dd>';
    if (p.fileName) h += '<dt>File</dt><dd>' + esc(p.fileName) + '</dd>';
    if (p.version) h += '<dt>Saved by</dt><dd>GTT ' + esc(p.version) + '</dd>';
    if (p.kind === 'threaded') {
      var holes = {};
      p.cards.forEach(function (c) { holes[c.holes.length] = 1; });
      h += '<dt>Cards</dt><dd>' + p.cards.length + ' (' + Object.keys(holes).join(', ') + ' holes)</dd>';
      h += '<dt>Picks</dt><dd>' + p.picks.length + '</dd>';
      if (p.packs.length) h += '<dt>Packs</dt><dd>' + p.packs.map(function (pk) { return esc(pk.name) + ' (' + pk.cards.length + ')'; }).join(', ') + '</dd>';
    } else if (p.kind === 'font') {
      h += '<dt>Letters</dt><dd>' + p.font.chars.length + '</dd><dt>Height</dt><dd>' + p.font.height + ' cards</dd>';
    } else if (p.kind === 'letteredband') {
      h += '<dt>Text</dt><dd>' + esc((p.text || []).join('')) + '</dd><dt>Font</dt><dd>' + esc(p.fontName || '') + '</dd>';
    } else {
      h += '<dt>Size</dt><dd>' + (p.width || 0) + ' cards by ' + (p.length || (p.brocadePicks ? p.brocadePicks.length : 0)) + (p.kind === 'brocade' ? ' picks' : ' rows') + '</dd>';
      if (p.kind === 'doubleface' || p.kind === 'twill') h += '<dt>Colours</dt><dd>' + p.colourCount + '</dd>';
      if (p.kind === 'twill' && p.backgroundTwill) h += '<dt>Background</dt><dd>' + p.backgroundTwill + '-twill</dd>';
    }
    h += '</dl>';
    h += '<h3>Notes</h3>' + (p.notes ? '<div class="notes">' + esc(p.notes) + '</div>' : '<p class="muted">No notes.</p>');
    if (p.kind !== 'font' && p.kind !== 'twist') h += '<h3>Palette' + (p.paletteName ? ': ' + esc(p.paletteName) : '') + '</h3>' +
      '<div class="swatches">' + p.palette.slice(0, 16).map(function (c, i) { return '<span class="swatch"><i style="background:' + c + '"></i>' + (i + 1) + '</span>'; }).join('') + '</div>';
    if (p.warnings && p.warnings.length) h += '<h3>Warnings</h3>' + p.warnings.map(function (w) { return '<p class="warn">' + esc(w) + '</p>'; }).join('');
    return h;
  }

  function renderSide(doc) {
    var tab = state.view.tab;
    document.querySelectorAll('.side-tabs [role=tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    var body = $('side-body');
    var f = { turning: turningPanel, threading: threadingPanel, pick: pickPanel, details: detailsPanel }[tab] || turningPanel;
    body.innerHTML = f(doc);
  }

  /* ---------- toolbar state ---------- */

  function syncToolbar(doc) {
    var v = state.view;
    var threaded = doc && doc.p.kind === 'threaded';
    document.querySelectorAll('[data-set]').forEach(function (b) {
      var kv = b.dataset.set.split(':');
      var val = kv[1] === 'true' ? true : kv[1] === 'false' ? false : kv[1];
      b.setAttribute('aria-pressed', String(v[kv[0]] === val));
      b.disabled = !threaded && (kv[0] === 'mode' || kv[0] === 'reverse');
    });
    document.querySelectorAll('[data-flag]').forEach(function (c) { c.checked = !!v.flags[c.dataset.flag]; });
    $('turn-style').value = v.turnDirStyle;
    $('hl-x').value = v.highlight.x; $('hl-y').value = v.highlight.y;
    $('r-width').value = v.ratios.width; $('r-end').value = v.ratios.end; $('r-centre').value = v.ratios.centre;
    $('zoom-val').textContent = Math.round(v.zoom / BASE_ZOOM * 100) + '%';
  }

  function renderTabs() {
    var nav = $('doc-tabs');
    nav.innerHTML = '';
    state.docs.forEach(function (d) {
      var b = document.createElement('div');
      b.className = 'doc-tab';
      b.setAttribute('aria-current', String(d.id === state.active));
      b.innerHTML = '<span></span><button class="x" aria-label="Close">&times;</button>';
      b.querySelector('span').textContent = d.p.name;
      b.title = d.p.fileName || d.p.name;
      b.tabIndex = 0;
      b.addEventListener('click', function (e) {
        if (e.target.classList.contains('x')) { closeDoc(d.id); return; }
        state.active = d.id; refresh();
      });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter') { state.active = d.id; refresh(); } });
      nav.appendChild(b);
    });
  }

  function refresh() {
    var doc = activeDoc();
    var has = !!doc;
    $('workspace').classList.toggle('is-empty', !has);
    $('welcome').hidden = has;
    $('viewer').hidden = !has;
    ['btn-save', 'btn-png', 'btn-print'].forEach(function (id) { $(id).disabled = !has; });
    renderTabs();
    if (!has) { drawWelcome(); document.title = 'GTT Web'; return; }
    document.title = doc.p.name + ' | GTT Web';
    syncToolbar(doc);
    drawDoc(doc);
    renderSide(doc);
  }

  function redraw() {
    var doc = activeDoc();
    if (!doc) return;
    syncToolbar(doc);
    drawDoc(doc);
  }

  function selectPick(doc, k, scroll) {
    if (!doc || !doc.sim) return;
    k = Math.max(0, Math.min(doc.sim.nPicks - 1, k));
    doc.selectedPick = k;
    drawDoc(doc);
    renderSide(doc);
    if (scroll) {
      var row = document.querySelector('table.seq tr[data-pick="' + k + '"]');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- welcome band ---------- */

  function drawWelcome() {
    var c = $('welcome-canvas');
    if (!c || !GTT.samples || !GTT.samples.length) return;
    var p = GTT.io.parse(GTT.samples[0].text, GTT.samples[0].file);
    var wrap = c.parentElement;
    var width = wrap.clientWidth || window.innerWidth;
    var z = window.innerWidth < 600 ? 3 : 4;
    var P = 5 * z;
    var need = Math.ceil(width / P) + 2;
    var picks = [];
    while (picks.length < need) picks = picks.concat(p.picks);
    p.picks = picks.slice(0, need);
    var sim = GTT.sim.simulate(p);
    var css = getComputedStyle(document.documentElement);
    GTT.render.drawThreaded(c, p, sim, {
      zoom: z, ratios: { width: 3, end: 5, centre: 0 }, mode: 'real', orient: 'h', reverse: false,
      flags: { colours: true, grid: true }, background: css.getPropertyValue('--band-bg').trim()
    });
  }

  /* ---------- saving and printing ---------- */

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function baseName(doc) {
    var n = doc.p.fileName ? doc.p.fileName.replace(/\.(gtt|xml)$/i, '') : doc.p.name;
    return (n || 'pattern').replace(/[\\/:*?"<>|]+/g, '-');
  }

  function saveGtt() {
    var doc = activeDoc(); if (!doc) return;
    var text = GTT.io.write(doc.p);
    download(new Blob([text], { type: 'application/octet-stream' }), baseName(doc) + '.gtt');
    toast('Saved ' + baseName(doc) + '.gtt in GTT 1.17 format.');
  }

  function savePng() {
    var doc = activeDoc(); if (!doc) return;
    $('band').toBlob(function (b) { if (b) download(b, baseName(doc) + '.png'); }, 'image/png');
  }

  function printDoc() {
    var doc = activeDoc(); if (!doc) return;
    var prev = state.view.tab;
    var extra = document.getElementById('print-extra');
    if (!extra) {
      extra = document.createElement('div');
      extra.id = 'print-extra';
      extra.className = 'print-only';
      $('viewer').appendChild(extra);
    }
    extra.innerHTML = '<h2>' + esc(doc.p.name) + '</h2>' + threadingPanel(doc) + '<h3>Turning sequence</h3>' + turningPanel(doc);
    $('side').hidden = true;
    window.print();
    $('side').hidden = false;
    state.view.tab = prev;
  }

  /* ---------- wiring ---------- */

  function bind() {
    $('file-input').addEventListener('change', function (e) { openFiles(e.target.files); e.target.value = ''; });
    $('btn-sample').addEventListener('click', function () {
      GTT.samples.forEach(function (s) { openText(s.text, s.file); });
      state.active = state.docs.length ? state.docs[state.docs.length - GTT.samples.length].id : null;
      refresh();
    });
    $('btn-save').addEventListener('click', saveGtt);
    $('btn-png').addEventListener('click', savePng);
    $('btn-print').addEventListener('click', printDoc);

    document.querySelectorAll('[data-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        var kv = b.dataset.set.split(':');
        state.view[kv[0]] = kv[1] === 'true' ? true : kv[1] === 'false' ? false : kv[1];
        saveView(); redraw();
      });
    });
    document.querySelectorAll('[data-flag]').forEach(function (c) {
      c.addEventListener('change', function () { state.view.flags[c.dataset.flag] = c.checked; saveView(); redraw(); });
    });
    $('turn-style').addEventListener('change', function (e) { state.view.turnDirStyle = e.target.value; state.view.flags.turnDir = true; saveView(); redraw(); });
    ['hl-x', 'hl-y'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        state.view.highlight.x = Math.max(0, parseInt($('hl-x').value, 10) || 0);
        state.view.highlight.y = Math.max(0, parseInt($('hl-y').value, 10) || 0);
        state.view.flags.highlights = true; saveView(); redraw();
      });
    });
    ['r-width', 'r-end', 'r-centre'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var w = parseFloat($('r-width').value), e = parseFloat($('r-end').value), c = parseFloat($('r-centre').value);
        state.view.ratios = { width: Math.max(1, w || 3), end: Math.max(1, e || 5), centre: Math.max(0, c || 0) };
        saveView(); redraw();
      });
    });
    $('r-reset').addEventListener('click', function () { state.view.ratios = { width: 3, end: 5, centre: 0 }; saveView(); redraw(); });

    function zoomBy(step) {
      var i = ZOOMS.indexOf(state.view.zoom);
      if (i < 0) i = ZOOMS.indexOf(BASE_ZOOM);
      state.view.zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + step))];
      saveView(); redraw();
    }
    $('zoom-in').addEventListener('click', function () { zoomBy(1); });
    $('zoom-out').addEventListener('click', function () { zoomBy(-1); });

    // Close the floating menus when clicking elsewhere
    document.addEventListener('click', function (e) {
      document.querySelectorAll('details.menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
    });

    document.querySelectorAll('.side-tabs [role=tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.view.tab = b.dataset.tab; saveView(); var d = activeDoc(); if (d) renderSide(d); });
    });

    $('side-body').addEventListener('click', function (e) {
      var doc = activeDoc(); if (!doc) return;
      var tr = e.target.closest('tr[data-pick]');
      if (tr) { selectPick(doc, parseInt(tr.dataset.pick, 10), false); return; }
      var st = e.target.closest('[data-pick-step]');
      if (st) selectPick(doc, (doc.selectedPick || 0) + parseInt(st.dataset.pickStep, 10), false);
    });
    $('side-body').addEventListener('change', function (e) {
      if (e.target.id === 'pick-input') { var doc = activeDoc(); selectPick(doc, (parseInt(e.target.value, 10) || 1) - 1, false); }
    });

    $('band').addEventListener('click', function (e) {
      var doc = activeDoc(); if (!doc || !doc.layout || !doc.layout.hit) return;
      var r = $('band').getBoundingClientRect();
      var hit = doc.layout.hit(e.clientX - r.left, e.clientY - r.top);
      if (hit && doc.sim) selectPick(doc, hit.pick, true);
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, textarea')) return;
      var doc = activeDoc(); if (!doc) return;
      if (e.key === '+' || e.key === '=') zoomBy(1);
      else if (e.key === '-' || e.key === '_') zoomBy(-1);
      else if (doc.sim && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && doc.selectedPick !== null) {
        e.preventDefault();
        var up = (e.key === 'ArrowUp') === (state.view.orient === 'v');
        selectPick(doc, doc.selectedPick + (up ? 1 : -1), true);
      }
    });

    // Drag and drop anywhere
    var depth = 0;
    window.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { depth++; $('drop-veil').hidden = false; } });
    window.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) $('drop-veil').hidden = true; });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; $('drop-veil').hidden = true;
      if (e.dataTransfer && e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
    });

    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { if (!activeDoc()) drawWelcome(); }, 150); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { refresh(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (activeDoc()) redraw(); });
  }

  bind();
  refresh();

  // Small hook for automated tests and the browser console.
  GTT.app = { view: function () { return state.view; }, redraw: redraw, active: activeDoc };
})(window.GTT = window.GTT || {});
