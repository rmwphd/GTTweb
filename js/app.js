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
    tab: 'turning',
    weave: { interchange: 'turn', twistMode: 'turn' }
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

  // Work out the turning sequence (for block designs) and weave it.
  function rebuild(doc) {
    try {
      doc.woven = GTT.gen.generate(doc.p, state.view.weave) || doc.p;
    } catch (e) {
      doc.woven = null;
      toast('The turning sequence for this pattern could not be worked out. ' + e.message, true);
    }
    doc.sim = doc.woven ? GTT.sim.simulate(doc.woven) : null;
    if (doc.sim && doc.selectedPick !== null && doc.selectedPick >= doc.sim.nPicks) doc.selectedPick = null;
  }

  function addDoc(p) {
    var doc = { id: ++state.seq, p: p, sim: null, woven: null, selectedPick: null,
      history: new GTT.edit.History(), dirty: false, pickSel: [] };
    rebuild(doc);
    state.docs.push(doc);
    state.active = doc.id;
    fitZoom(doc);
    if (p.warnings && p.warnings.length) toast(p.warnings[0]);
    refresh();
  }

  // Pick a zoom so the band fills the viewing area without being tiny.
  function fitZoom(doc) {
    var p = doc.woven || doc.p, v = state.view;
    var wrap = $('band-wrap');
    var availH = (wrap && wrap.clientHeight) || (window.innerHeight - 160);
    var availW = (wrap && wrap.clientWidth) || (window.innerWidth - 420);
    if (availH < 200) availH = Math.max(320, window.innerHeight * 0.55);
    if (availW < 200) availW = window.innerWidth - 32;
    var across, along;
    if (p.kind === 'threaded' && p.cards) {
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
    if (state.docs[i].dirty && !window.confirm('"' + state.docs[i].p.name + '" has changes that are not saved. Close it anyway?')) return;
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

  function drawDoc(doc) {
    var canvas = $('band');
    var p = doc.p, o = renderOptions(doc);
    var note = $('band-note');
    note.hidden = true;
    var L;
    var showDesign = p.kind !== 'threaded' && (state.view.mode === 'design' || !doc.sim);
    if (!showDesign) {
      if (o.mode === 'design') o.mode = 'real';
      o.twiningReal = !!doc.woven.twining;
      o.brocade = doc.woven.brocade || null;
      L = GTT.render.drawThreaded(canvas, doc.woven, doc.sim, o);
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
          grid = p.font ? GTT.gen.letterRows(p.font, p.text || []) : [];
          opts = { cellW: 2, cellH: 4 };
          colourFor = function (ch) { return ch === 'X' ? dark : light; };
          break;
        case 'font':
          var all = GTT.gen.fontRows(p.font);
          grid = all; opts = { cellW: 2, cellH: 4 };
          colourFor = function (ch) { return ch === 'X' ? dark : light; };
          break;
      }
      if (!grid.length) {
        var ctx = canvas.getContext('2d'); canvas.width = canvas.height = 1; ctx.clearRect(0, 0, 1, 1);
        note.textContent = 'This pattern has no design to show yet.'; note.hidden = false;
        return;
      }
      L = GTT.render.drawGrid(canvas, grid, Object.assign({}, o, { mode: 'block' }), colourFor, opts);
    }
    doc.layout = L;
  }

  function drawSelection(canvas, L, k, o) {
    var ctx = canvas.getContext('2d');
    var css = getComputedStyle(document.documentElement);
    var weld = css.getPropertyValue('--weld').trim() || '#d4a72c';
    var v0 = k * L.P + L.s / 2, v1 = v0 + L.P;
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
    var s = doc.sim;
    if (!s) return '<p class="muted">No turning sequence is available for this pattern.</p>';
    if (!s.nPicks) return '<p class="muted">This pattern has no picks yet.</p>';
    var gen = p.kind !== 'threaded' ? '<p class="muted">Worked out from the ' + esc(p.kindLabel.toLowerCase()) + ' design, the same way GTT does it.</p>' : '';
    var usesPacks = s.summary.some(function (x) { return x.packs; });
    var anyIdle = s.summary.some(function (x) { return x.I.length && x.I.length < s.nCards; });
    var h = gen + (state.view.flags.boxes ? '<p class="muted legend"><span class="bx f">5</span> turn forwards <span class="bx b">5</span> turn backwards <span class="bx i">5</span> idle <span class="bx d">5</span> double turn. Beside the band, each pick reads from card 1: the numbers count neighbouring cards that turn together.</p>' : '');
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
    var p = doc.woven || doc.p;
    var cards = p.cards || [];
    if (doc.p.kind === 'twist') {
      p = doc.p;
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
    var s = doc.sim;
    if (!s) return '<p class="muted">Pick-by-pick details are not available for this pattern.</p>';
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
    var f = { turning: turningPanel, threading: threadingPanel, pick: pickPanel, details: detailsPanel, edit: GTT.editor.panel }[tab] || turningPanel;
    var keep = body.scrollTop;
    body.innerHTML = f(doc);
    if (tab === 'edit') { body.scrollTop = keep; GTT.editor.afterRender(doc, body); }
  }

  /* ---------- toolbar state ---------- */

  function syncToolbar(doc) {
    var v = state.view;
    var threaded = doc && doc.p.kind === 'threaded';
    var mode = (threaded && v.mode === 'design') ? 'real' : v.mode;
    document.querySelectorAll('[data-set]').forEach(function (b) {
      var kv = b.dataset.set.split(':');
      var val = kv[1] === 'true' ? true : kv[1] === 'false' ? false : kv[1];
      var cur = kv[0] === 'mode' ? mode : v[kv[0]];
      b.setAttribute('aria-pressed', String(cur === val));
      b.disabled = (kv[1] === 'design' && threaded) || (kv[0] === 'reverse' && mode === 'design');
    });
    var kind = doc ? doc.p.kind : '';
    $('menu-weave').hidden = !(kind === 'twill' || kind === 'twist');
    $('weave-twill').hidden = kind !== 'twill';
    $('weave-twist').hidden = kind !== 'twist';
    document.querySelectorAll('[name=interchange]').forEach(function (r) { r.checked = r.value === v.weave.interchange; });
    document.querySelectorAll('[name=twistMode]').forEach(function (r) { r.checked = r.value === v.weave.twistMode; });
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
      b.querySelector('span').textContent = (d.dirty ? '\u2022 ' : '') + d.p.name;
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
    ['btn-save', 'btn-png', 'btn-print', 'btn-undo', 'btn-redo'].forEach(function (id) { $(id).disabled = !has; });
    if (has) { $('btn-undo').disabled = !doc.history.undo.length; $('btn-redo').disabled = !doc.history.redo.length; }
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
    if (!doc.p.fileName) doc.p.fileName = baseName(doc) + '.gtt';
    download(new Blob([text], { type: 'application/octet-stream' }), baseName(doc) + '.gtt');
    doc.dirty = false; renderTabs();
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
    $('btn-undo').addEventListener('click', function () { undo(activeDoc()); });
    $('btn-redo').addEventListener('click', function () { redo(activeDoc()); });
    window.addEventListener('beforeunload', function (e) {
      if (state.docs.some(function (d) { return d.dirty; })) { e.preventDefault(); e.returnValue = ''; }
    });

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
    document.querySelectorAll('[name=interchange], [name=twistMode]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.view.weave[r.name] = r.value; saveView();
        state.docs.forEach(rebuild);
        var d = activeDoc(); if (d) { redraw(); renderSide(d); }
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
      if (tr) {
        var k = parseInt(tr.dataset.pick, 10);
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          var at = doc.pickSel.indexOf(k);
          if (at >= 0) doc.pickSel.splice(at, 1); else doc.pickSel.push(k);
        } else doc.pickSel = [k];
        selectPick(doc, k, false);
        return;
      }
      if (state.view.tab === 'edit') GTT.editor.handle(e, doc);
      var st = e.target.closest('[data-pick-step]');
      if (st) selectPick(doc, (doc.selectedPick || 0) + parseInt(st.dataset.pickStep, 10), false);
    });
    $('side-body').addEventListener('change', function (e) {
      var doc = activeDoc(); if (!doc) return;
      if (e.target.id === 'pick-input') { selectPick(doc, (parseInt(e.target.value, 10) || 1) - 1, false); return; }
      if (state.view.tab === 'edit') GTT.editor.handle(e, doc);
    });
    $('side-body').addEventListener('contextmenu', function (e) {
      var doc = activeDoc(); if (!doc || state.view.tab !== 'edit') return;
      if (e.target.closest('[data-rclick]')) { e.preventDefault(); GTT.editor.handle(e, doc); }
    });
    $('side-body').addEventListener('pointerdown', function (e) {
      var doc = activeDoc(); if (doc && state.view.tab === 'edit') GTT.editor.sidePointer('down', e, doc);
    });
    $('side-body').addEventListener('pointerover', function (e) {
      var doc = activeDoc(); if (doc && state.view.tab === 'edit') GTT.editor.sidePointer('over', e, doc);
    });
    window.addEventListener('pointerup', function (e) {
      var doc = activeDoc(); if (doc) GTT.editor.sidePointer('up', e, doc);
    });

    function bandHit(e, doc) {
      if (!doc || !doc.layout || !doc.layout.hit) return null;
      var r = $('band').getBoundingClientRect();
      return doc.layout.hit(e.clientX - r.left, e.clientY - r.top);
    }
    var bandDrag = null;
    $('band').addEventListener('pointerdown', function (e) {
      var doc = activeDoc(); if (!doc) return;
      var hit = bandHit(e, doc);
      if (state.view.tab === 'edit' && GTT.editor.wantsPointer(doc)) {
        e.preventDefault();
        bandDrag = { doc: doc };
        $('band').setPointerCapture(e.pointerId);
        GTT.editor.pointer('down', doc, hit, e);
        return;
      }
      if (hit && doc.sim && !(state.view.mode === 'design' && doc.p.kind !== 'threaded')) selectPick(doc, hit.pick, true);
    });
    $('band').addEventListener('pointermove', function (e) {
      if (!bandDrag) return;
      GTT.editor.pointer('move', bandDrag.doc, bandHit(e, bandDrag.doc), e);
    });
    function endDrag(e) {
      if (!bandDrag) return;
      var d = bandDrag; bandDrag = null;
      GTT.editor.pointer('up', d.doc, bandHit(e, d.doc), e);
    }
    $('band').addEventListener('pointerup', endDrag);
    $('band').addEventListener('pointercancel', endDrag);
    $('band').addEventListener('contextmenu', function (e) { if (state.view.tab === 'edit') e.preventDefault(); });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, textarea')) return;
      var doc = activeDoc(); if (!doc) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        if (e.key === 'y' || e.shiftKey) redo(doc); else undo(doc);
        return;
      }
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

  /* ---------- display profiles (GTT's "capture display profile") ---------- */

  var PROF_KEY = 'gttweb.profiles.v1';
  function loadProfiles() { try { return JSON.parse(localStorage.getItem(PROF_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveProfiles(o) { try { localStorage.setItem(PROF_KEY, JSON.stringify(o)); } catch (e) { toast('Profiles cannot be saved in this browser.', true); } }
  function profileFields(v) {
    return JSON.parse(JSON.stringify({ mode: v.mode, reverse: v.reverse, orient: v.orient, zoom: v.zoom, ratios: v.ratios, flags: v.flags, turnDirStyle: v.turnDirStyle, highlight: v.highlight }));
  }
  function renderProfiles() {
    var list = $('prof-list'), all = loadProfiles(), names = Object.keys(all).sort();
    list.innerHTML = names.length ? names.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') : '<option value="">No profiles yet</option>';
    $('prof-apply').disabled = $('prof-del').disabled = !names.length;
  }
  function bindProfiles() {
    renderProfiles();
    $('prof-save').addEventListener('click', function () {
      var n = $('prof-name').value.trim();
      if (!n) { toast('Give the profile a name first.'); return; }
      var all = loadProfiles(); all[n] = profileFields(state.view); saveProfiles(all);
      $('prof-name').value = ''; renderProfiles(); toast('Saved the display profile "' + n + '".');
    });
    $('prof-apply').addEventListener('click', function () {
      var pr = loadProfiles()[$('prof-list').value]; if (!pr) return;
      Object.keys(pr).forEach(function (k) { state.view[k] = JSON.parse(JSON.stringify(pr[k])); });
      saveView(); redraw();
    });
    $('prof-del').addEventListener('click', function () {
      var all = loadProfiles(); delete all[$('prof-list').value]; saveProfiles(all); renderProfiles();
    });
  }

  /* ---------- editing ---------- */

  function afterEdit(doc, quick) {
    doc.dirty = true;
    rebuild(doc);
    redraw();
    if (!quick) { renderSide(doc); renderTabs(); }
    $('btn-undo').disabled = !doc.history.undo.length;
    $('btn-redo').disabled = !doc.history.redo.length;
  }
  // Record an undo step, change the pattern, and redraw.
  function commit(doc, fn) {
    if (!doc) return;
    doc.history.record(doc.p);
    try { fn(doc.p); }
    catch (e) { doc.p = doc.history.undo.pop(); toast(e.message, true); return; }
    afterEdit(doc);
  }
  // For drags: one undo step, many small changes.
  function beginLive(doc) { doc.history.record(doc.p); }
  function live(doc, fn) { if (fn(doc.p) !== false) afterEdit(doc, true); }
  function endLive(doc) { afterEdit(doc); }
  function undo(doc) {
    if (!doc) return;
    var prev = doc.history.back(doc.p); if (!prev) return;
    doc.p = prev; afterEdit(doc);
  }
  function redo(doc) {
    if (!doc) return;
    var nxt = doc.history.forward(doc.p); if (!nxt) return;
    doc.p = nxt; afterEdit(doc);
  }
  function openPattern(p, tab) {
    addDoc(p);
    var d = activeDoc();
    d.dirty = true;
    if (tab) { state.view.tab = tab; saveView(); }
    refresh();
  }

  bind();
  bindProfiles();
  refresh();

  // Hooks for the editor, automated tests and the browser console.
  GTT.app = {
    view: function () { return state.view; }, saveView: saveView, redraw: redraw, refresh: refresh, active: activeDoc,
    docs: function () { return state.docs; }, commit: commit, beginLive: beginLive, live: live, endLive: endLive,
    undo: undo, redo: redo, openPattern: openPattern, toast: toast, renderSide: function () { var d = activeDoc(); if (d) renderSide(d); },
    selectPick: selectPick, fitZoom: fitZoom
  };
})(window.GTT = window.GTT || {});
