/* GTT Web: the Edit tab and the drawing tools on the band. */
(function (GTT) {
  'use strict';

  var E = function () { return GTT.edit; };
  var app = function () { return GTT.app; };
  var colours = { primary: 0, secondary: 15 };

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function letter(i) { return GTT.sim.holeLetter(i); }

  function ed(doc) {
    if (!doc.ed) {
      var k = doc.p.kind;
      doc.ed = {
        tool: k === 'threaded' ? 'select' : (k === 'font' || k === 'letteredband' ? 'none' : 'paint'),
        sel: [], spec: { mode: 'cards', items: {} }, weft: 1, letter: 0
      };
    }
    return doc.ed;
  }

  function commit(doc, fn) { app().commit(doc, fn); }

  /* ================= panel ================= */

  function panel(doc) {
    var p = doc.p, h = '';
    h += '<div class="ed">';
    h += section('Pattern', patternSection(doc));
    switch (p.kind) {
      case 'threaded': h += threadedPanels(doc); break;
      case 'doubleface': case 'twill': case 'twist': case 'brocade': h += blockPanels(doc); break;
      case 'font': h += fontPanels(doc); break;
      case 'letteredband': h += letteredPanels(doc); break;
    }
    h += section('Join with another open pattern', joinSection(doc), true);
    h += '</div>';
    return h;
  }

  // Sections remember whether they were open across redraws.
  var openState = {};
  function sectionKey(title) { return title.replace(/^Letter .*/, 'Letter'); }
  function section(title, body, collapsed) {
    var key = sectionKey(title);
    var open = key in openState ? openState[key] : !collapsed;
    return '<details class="ed-sec" data-sec="' + esc(key) + '"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div class="ed-body">' + body + '</div></details>';
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d && d.classList && d.classList.contains('ed-sec')) openState[d.dataset.sec] = d.open;
    }, true);
  }

  function patternSection(doc) {
    var p = doc.p;
    var name = p.kind === 'font' ? p.font.name : p.name;
    return '<label class="row">Name <input type="text" data-change="name" value="' + esc(name) + '"></label>' +
      '<label class="col">Notes <textarea rows="3" data-change="notes">' + esc(p.kind === 'font' ? p.font.notes : p.notes) + '</textarea></label>';
  }

  function paletteSection(doc) {
    var p = doc.p, h = '<p class="muted">Click a colour to paint with it. Right-click (or Shift-click) chooses the second colour.</p><div class="pal">';
    for (var i = 0; i < 16; i++) {
      var cls = (i === colours.primary ? ' pri' : '') + (i === colours.secondary ? ' sec' : '');
      h += '<button class="sw' + cls + '" style="background:' + p.palette[i] + '" data-act="pal" data-i="' + i + '" data-rclick title="Colour ' + (i + 1) + '"></button>';
    }
    h += '</div><div class="row chips"><span class="chip"><i style="background:' + p.palette[colours.primary] + '"></i>First</span>' +
      '<span class="chip"><i style="background:' + p.palette[colours.secondary] + '"></i>Second</span>' +
      '<button class="btn small" data-act="palswap">Swap</button>' +
      '<label class="row">Change first colour <input type="color" data-change="palcolour" value="' + p.palette[colours.primary] + '"></label></div>' +
      '<div class="row wrap"><button class="btn small" data-act="colswap">Swap them in the pattern</button>' +
      '<button class="btn small" data-act="colrep" data-arg="sec">Replace second with first</button>' +
      '<button class="btn small" data-act="colrep" data-arg="pri">Replace first with second</button>' +
      '<button class="btn small" data-act="palreset">GTT default palette</button></div>';
    return h;
  }

  /* ---------- threaded-in ---------- */

  function toolRadios(doc, tools) {
    var t = ed(doc).tool;
    return '<div class="seg tools" role="group">' + tools.map(function (x) {
      return '<button data-act="tool" data-arg="' + x[0] + '" aria-pressed="' + (t === x[0]) + '" title="' + esc(x[2] || '') + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div>';
  }

  function threadedPanels(doc) {
    var p = doc.p, e = ed(doc), h = '';
    h += section('Tools on the band', toolRadios(doc, [
      ['select', 'Select pick'], ['colour', 'Thread colour', 'Click a thread to set its colour (right-click for the second colour)'],
      ['direction', 'Direction', 'Click a cell to swap that card between forwards and backwards at that pick'],
      ['twist', 'Twist', 'Click a cell to add or remove a twist before that pick']]) +
      '<p class="muted">' + ({ select: 'Click the band to choose a pick.', colour: 'Click a thread on the band to give it the first colour; right-click gives the second.',
        direction: 'Click a cell to swap that card between forwards and backwards at that pick.', twist: 'Click a cell to add or remove a twist before that pick.' })[e.tool] + '</p>');
    h += section('Colours', paletteSection(doc));
    h += section('Cards', cardSection(doc, true));
    h += section('Weaving', weaveSection(doc));
    h += section('Packs', packSection(doc), !(p.packs && p.packs.length));
    return h;
  }

  function cardSection(doc, withPicks) {
    var p = doc.p, e = ed(doc), sel = e.sel;
    var nH = 0; p.cards.forEach(function (c) { nH = Math.max(nH, c.holes.length); });
    var h = '<div class="row wrap"><label class="row">Cards <input type="number" class="num" min="1" max="400" data-change="cardcount" value="' + p.cards.length + '"></label>';
    h += '<span class="muted">' + (sel.length ? sel.length + ' selected' : 'Click card numbers to select cards') + '</span></div>';
    h += '<div class="row wrap">Threading: ' + [['S', 'All S'], ['Z', 'All Z'], ['SZ', 'S/Z'], ['ZS', 'Z/S'], ['invert', 'Swap']].map(function (x) {
      return '<button class="btn small" data-act="thr" data-arg="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="row wrap">Set hole to first colour: ' + Array.apply(null, Array(nH)).map(function (_, i) {
      return '<button class="btn small" data-act="sethole" data-arg="' + i + '">' + letter(i) + '</button>';
    }).join('') + '</div>';
    h += '<div class="chart-scroll"><table class="thread-chart ed-cards"><tr><th></th>';
    p.cards.forEach(function (_, i) { h += '<th class="pick' + (sel.indexOf(i) >= 0 ? ' on' : '') + '" data-act="selcard" data-i="' + i + '">' + (i + 1) + '</th>'; });
    h += '</tr>';
    for (var r = 0; r < nH; r++) {
      h += '<tr><th>' + letter(r) + '</th>';
      p.cards.forEach(function (c, i) {
        if (r < c.holes.length) h += '<td class="hole" style="background:' + p.palette[c.holes[r]] + '" data-act="hole" data-card="' + i + '" data-hole="' + r + '" data-rclick title="Card ' + (i + 1) + ', hole ' + letter(r) + '"></td>';
        else h += '<td class="thr"></td>';
      });
      h += '</tr>';
    }
    h += '<tr><th></th>';
    p.cards.forEach(function (c, i) { h += '<td class="thr pick" data-act="togthr" data-card="' + i + '" title="Swap S and Z">' + c.threading + '</td>'; });
    h += '</tr>';
    if (withPicks && e.spec.mode === 'cards') {
      h += '<tr class="next"><th title="Turning for the next pick">Next</th>';
      p.cards.forEach(function (_, i) {
        var it = e.spec.items[i + 1] || { dir: 'F' };
        h += '<td class="thr pick dir-' + it.dir + '" data-act="specdir" data-card="' + (i + 1) + '" title="Click to change">' + (it.dir === 'I' ? '-' : it.dir) + '</td>';
      });
      h += '</tr><tr class="next"><th title="Twist before the next pick">Tw</th>';
      p.cards.forEach(function (_, i) {
        var it = e.spec.items[i + 1] || {};
        h += '<td class="thr pick" data-act="spectwist" data-card="' + (i + 1) + '">' + (it.twist ? '◆' : '·') + '</td>';
      });
      h += '</tr>';
    }
    h += '</table></div>';
    h += '<div class="row wrap"><button class="btn small" data-act="movecards" data-arg="-1">Move left</button>' +
      '<button class="btn small" data-act="movecards" data-arg="1">Move right</button>' +
      '<button class="btn small" data-act="insertcard">Insert card</button>' +
      '<button class="btn small" data-act="deletecards">Delete selected</button>' +
      '<button class="btn small" data-act="selnone">Clear selection</button></div>';
    return h;
  }

  function weaveSection(doc) {
    var p = doc.p, e = ed(doc), h = '';
    var hasPacks = p.packs && p.packs.length;
    if (hasPacks) {
      h += '<div class="seg" role="group"><button data-act="specmode" data-arg="cards" aria-pressed="' + (e.spec.mode === 'cards') + '">Turn cards</button>' +
        '<button data-act="specmode" data-arg="packs" aria-pressed="' + (e.spec.mode === 'packs') + '">Turn packs</button></div>';
    } else e.spec.mode = 'cards';
    if (e.spec.mode === 'packs') {
      h += '<table class="seq packspec"><tr><th>Pack</th><th>Turn</th><th>Twist</th></tr>';
      p.packs.forEach(function (pk) {
        var it = e.spec.items[pk.name] || { dir: 'F' };
        h += '<tr><td>' + esc(pk.name) + '</td><td><button class="btn small dir-' + it.dir + '" data-act="specdir" data-pack="' + esc(pk.name) + '">' + ({ F: 'Forwards', B: 'Backwards', I: 'Idle' })[it.dir] + '</button></td>' +
          '<td><input type="checkbox" data-change="spectwist" data-pack="' + esc(pk.name) + '"' + (it.twist ? ' checked' : '') + '></td></tr>';
      });
      h += '</table>';
    } else {
      h += '<p class="muted">Set each card in the Next row of the card chart (F, B or - for idle; Tw for a twist), then add the pick.</p>' +
        '<div class="row wrap"><button class="btn small" data-act="specall" data-arg="F">All F</button><button class="btn small" data-act="specall" data-arg="B">All B</button>' +
        '<button class="btn small" data-act="specall" data-arg="swap">Swap F and B</button></div>';
    }
    h += '<div class="row wrap"><button class="btn primary small" data-act="addpick">Add pick</button>' +
      '<button class="btn small" data-act="addpick" data-arg="rev">Add reversed pick</button>' +
      '<button class="btn small" data-act="poppick">Remove last pick</button>' +
      '<button class="btn small" data-act="clearpicks">Clear all picks</button></div>';
    var ps = doc.pickSel || [];
    h += '<p class="muted">Selected picks: ' + (ps.length ? ps.map(function (k) { return k + 1; }).join(', ') : 'none') +
      '. Select picks in the Turning tab (Ctrl- or Shift-click for several, in the order to repeat them).</p>' +
      '<div class="row wrap"><button class="btn small" data-act="repeatpicks"' + (ps.length ? '' : ' disabled') + '>Repeat selected</button>' +
      '<button class="btn small" data-act="deletepicks"' + (ps.length ? '' : ' disabled') + '>Delete selected</button>' +
      (hasPacks ? '<button class="btn small" data-act="breakpacks">Break up packs into cards</button>' : '') + '</div>';
    return h;
  }

  function packSection(doc) {
    var p = doc.p, h = '';
    if (!p.packs || !p.packs.length) h += '<p class="muted">Packs let you turn groups of cards together.</p>';
    else {
      h += '<div class="chart-scroll"><table class="thread-chart packs"><tr><th></th>';
      p.cards.forEach(function (_, i) { h += '<th>' + (i + 1) + '</th>'; });
      h += '<th></th></tr>';
      p.packs.forEach(function (pk) {
        h += '<tr><th><input type="text" class="packname" data-change="packname" data-pack="' + esc(pk.name) + '" value="' + esc(pk.name) + '"></th>';
        p.cards.forEach(function (_, i) {
          var on = pk.cards.indexOf(i + 1) >= 0;
          h += '<td class="thr pick' + (on ? ' on' : '') + '" data-act="packcard" data-pack="' + esc(pk.name) + '" data-card="' + (i + 1) + '">' + (on ? '✓' : '') + '</td>';
        });
        h += '<td class="thr"><button class="btn small" data-act="delpack" data-pack="' + esc(pk.name) + '" aria-label="Delete pack">×</button></td></tr>';
      });
      h += '</table></div>';
    }
    h += '<button class="btn small" data-act="addpack">Add pack' + (ed(doc).sel.length ? ' from selected cards' : '') + '</button>';
    return h;
  }

  /* ---------- block designs ---------- */

  function blockPanels(doc) {
    var p = doc.p, e = ed(doc), h = '';
    var tools = [['paint', 'Draw', 'Click or drag on the design to draw; right-click or Shift to erase']];
    if (p.kind === 'twill') tools.push(['float', 'Long floats', 'Mark the blocks that get a long float']);
    tools.push(['select', 'Select pick']);
    var t = toolRadios(doc, tools);
    if (p.kind === 'brocade') {
      t += '<div class="row wrap">Weft: ' + p.wefts.map(function (w, i) {
        return '<button class="btn small weft' + (e.weft === i + 1 ? ' on' : '') + '" data-act="weft" data-i="' + (i + 1) + '"><i style="background:' + w.colour + '"></i>' + esc(w.name || letter(i)) + '</button>';
      }).join('') + '</div>';
    }
    t += '<p class="muted">Drawing works on the Design view, which opens when you pick a drawing tool. Drag to paint; right-click or hold Shift to erase.</p>';
    h += section('Tools', t);
    var w = p.width, len = p.kind === 'brocade' ? p.visual.length : p.length;
    h += section('Size', '<div class="row wrap"><label class="row">Cards <input type="number" class="num" min="1" max="400" id="ed-w" value="' + w + '"></label>' +
      '<label class="row">' + (p.kind === 'brocade' ? 'Picks' : 'Rows') + ' <input type="number" class="num" min="1" max="2000" id="ed-h" value="' + len + '"></label>' +
      '<button class="btn small" data-act="resize">Apply</button></div>');
    var tr = '<div class="row wrap">' +
      '<button class="btn small" data-act="shift" data-arg="left">Shift left</button><button class="btn small" data-act="shift" data-arg="right">Shift right</button>' +
      '<button class="btn small" data-act="shift" data-arg="up">Shift up</button><button class="btn small" data-act="shift" data-arg="down">Shift down</button></div>' +
      '<div class="row wrap"><button class="btn small" data-act="invert">Invert</button>' +
      '<button class="btn small" data-act="mirror" data-arg="vertical">Mirror left to right</button>' +
      '<button class="btn small" data-act="mirror" data-arg="horizontal">Mirror top to bottom</button>' +
      (p.kind === 'twill' ? '<button class="btn small" data-act="realign">Realign</button><button class="btn small" data-act="clearfloats">Clear long floats</button>' : '') +
      '<button class="btn small" data-act="cleardesign">Clear design</button></div>' +
      '<label class="row">Import a black and white image <input type="file" accept="image/*" data-change="bitmap"></label>';
    h += section('Design', tr);
    if (p.kind === 'twill') {
      h += section('Background twill', '<div class="seg" role="group"><button data-act="bgtwill" data-arg="S" aria-pressed="' + (p.backgroundTwill !== 'Z') + '">S-twill</button>' +
        '<button data-act="bgtwill" data-arg="Z" aria-pressed="' + (p.backgroundTwill === 'Z') + '">Z-twill</button></div>');
    }
    if (p.kind === 'twist') {
      var th = '<div class="row wrap">' + [['S', 'All S'], ['Z', 'All Z'], ['SZ', 'S/Z'], ['ZS', 'Z/S'], ['half', 'S then Z']].map(function (x) {
        return '<button class="btn small" data-act="twthr" data-arg="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div><div class="chart-scroll"><table class="thread-chart"><tr>';
      p.twistThreading.forEach(function (_, i) { th += '<th>' + (i + 1) + '</th>'; });
      th += '</tr><tr>';
      p.twistThreading.forEach(function (t2, i) { th += '<td class="thr pick" data-act="twtog" data-card="' + i + '">' + t2 + '</td>'; });
      h += section('Threading', th + '</tr></table></div>');
    } else {
      var cb = paletteSection(doc);
      if (p.kind === 'doubleface' && p.colourCount === 2) {
        cb += '<div class="row wrap"><button class="btn small" data-act="dfcol" data-arg="front">Pattern colour = first colour</button>' +
          '<button class="btn small" data-act="dfcol" data-arg="back">Background = first colour</button></div>';
      } else if (p.kind === 'twill') {
        cb += '<div class="row wrap"><button class="btn small" data-act="twcol" data-arg="P">Pattern colour = first colour</button>' +
          '<button class="btn small" data-act="twcol" data-arg="B">Background = first colour</button></div>';
      }
      h += section(p.kind === 'brocade' ? 'Warp colours' : 'Colours', cb);
      h += section('Cards', cardSection(doc, false), p.kind !== 'doubleface' || p.colourCount === 2);
    }
    if (p.kind === 'brocade') h += section('Wefts and ground weave', brocadeSection(doc));
    if (p.kind === 'doubleface' || p.kind === 'twill') {
      var sv = p.selvedges || { left: [], right: [] };
      h += section('Selvedges', '<p class="muted">Selvedge cards sit outside the design and turn forwards on every pick. They use the first colour.</p>' +
        '<div class="row wrap"><label class="row">Left <input type="number" class="num" min="0" max="20" id="sv-l" value="' + sv.left.length + '"></label>' +
        '<label class="row">Right <input type="number" class="num" min="0" max="20" id="sv-r" value="' + sv.right.length + '"></label>' +
        '<select id="sv-t"><option value="S">All S</option><option value="Z">All Z</option><option value="alt">S/Z</option></select>' +
        '<button class="btn small" data-act="selvedges">Apply</button></div>', true);
      h += section('Convert', '<button class="btn small" data-act="tobrocade">Make a brocade with this as the ground weave</button>', true);
    }
    return h;
  }

  function brocadeSection(doc) {
    var p = doc.p, h = '<table class="seq"><tr><th>Weft</th><th>Name</th><th>Colour</th></tr>';
    p.wefts.forEach(function (w, i) {
      h += '<tr><td>' + letter(i) + '</td><td><input type="text" data-change="weftname" data-i="' + i + '" value="' + esc(w.name) + '"></td>' +
        '<td><input type="color" data-change="weftcolour" data-i="' + i + '" value="' + w.colour + '"></td></tr>';
    });
    h += '</table>';
    var others = app().docs().filter(function (d) { return d !== doc && ['threaded', 'doubleface', 'twill', 'twist'].indexOf(d.p.kind) >= 0; });
    h += '<p class="muted">' + (p.groundWeave ? 'Ground weave: ' + esc(p.groundWeave.name) + ' (' + esc(GTT.io.KIND_LABEL[p.groundWeave.kind]) + ').' : 'No ground weave: all cards turn forwards.') + '</p>';
    h += '<div class="row wrap">';
    if (others.length) h += '<select id="gw-src">' + others.map(function (d) { return '<option value="' + d.id + '">' + esc(d.p.name) + '</option>'; }).join('') + '</select><button class="btn small" data-act="setground">Use as ground weave</button>';
    else h += '<span class="muted">Open a threaded-in, double-face, twill or twist-patterned pattern to use it as the ground weave.</span>';
    if (p.groundWeave) h += '<button class="btn small" data-act="clearground">Remove ground weave</button>';
    return h + '</div>';
  }

  /* ---------- fonts and lettered bands ---------- */

  function fontPanels(doc) {
    var f = doc.p.font, e = ed(doc), h = '';
    if (e.letter >= f.chars.length) e.letter = Math.max(0, f.chars.length - 1);
    h += section('Font', '<div class="grid2">' +
      '<label>Letter height (cards) <input type="number" class="num" min="1" max="200" data-change="fheight" value="' + f.height + '"></label>' +
      '<label>Default width <input type="number" class="num" min="1" max="200" data-change="fdefw" value="' + f.defCharWidth + '"></label>' +
      '<label>Kerning <input type="number" class="num" min="0" max="50" data-change="fkern" value="' + f.kerning + '"></label>' +
      '<label>Threading <select data-change="fthr">' + ['AllS', 'AllZ', 'AltSZ'].map(function (t) { return '<option' + (f.threading === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label></div>');
    var list = '<div class="row wrap">' + f.chars.map(function (c, i) {
      return '<button class="btn small' + (i === e.letter ? ' on' : '') + '" data-act="letter" data-i="' + i + '">' + esc(c.letter || '?') + '</button>';
    }).join('') + '</div>' +
      '<div class="row wrap"><input type="text" id="new-letter" size="4" placeholder="Letter"><button class="btn small" data-act="addletter">Add letter</button>' +
      (f.chars.length ? '<button class="btn small" data-act="moveletter" data-arg="-1">Move up</button><button class="btn small" data-act="moveletter" data-arg="1">Move down</button><button class="btn small" data-act="delletter">Delete letter</button>' : '') + '</div>';
    h += section('Letters', list);
    var c = f.chars[e.letter];
    if (c) h += section('Letter ' + (c.letter || ''), letterEditor(c, f));
    return h;
  }

  function letterEditor(c, f) {
    var h = '<div class="grid2"><label>Letter <input type="text" data-change="lletter" value="' + esc(c.letter) + '"></label>' +
      '<label>Name <input type="text" data-change="lname" value="' + esc(c.name) + '"></label>' +
      '<label>Width <input type="number" class="num" min="1" max="200" data-change="lwidth" value="' + c.pattern.data.length + '"></label>' +
      '<label>Space before <input type="number" class="num" min="0" max="50" data-change="lbefore" value="' + (c.spaceBefore || 0) + '"></label>' +
      '<label>Space after <input type="number" class="num" min="0" max="50" data-change="lafter" value="' + (c.spaceAfter || 0) + '"></label></div>' +
      '<p class="muted">Draw the letter: cards run across, the band runs down the page. Drag to paint; right-click or Shift to erase.</p>';
    h += '<div class="chart-scroll"><table class="lgrid">';
    for (var r = c.pattern.data.length - 1; r >= 0; r--) {
      h += '<tr>';
      for (var col = 0; col < f.height; col++) h += '<td data-lc="' + r + ',' + col + '" class="' + (c.pattern.data[r].charAt(col) === 'X' ? 'x' : '') + '"></td>';
      h += '</tr>';
    }
    return h + '</table></div>';
  }

  function letteredPanels(doc) {
    var p = doc.p, f = p.font || { chars: [] }, h = '';
    var have = {}; f.chars.forEach(function (c) { have[c.letter] = true; });
    var missing = (p.text || []).filter(function (ch) { return !have[ch]; });
    var fontBody = '<p class="muted">' + (f.chars.length ? 'Font: ' + esc(f.name || p.fontName || 'unnamed') + ', ' + f.chars.length + ' letters, ' + f.height + ' cards high.' : 'Load a GTT font file to start.') + '</p>' +
      '<label class="row">Load a font <input type="file" accept=".gtt,.xml" data-change="loadfont"></label>';
    var others = app().docs().filter(function (d) { return d.p.kind === 'font'; });
    if (others.length) fontBody += '<div class="row wrap"><select id="font-src">' + others.map(function (d) { return '<option value="' + d.id + '">' + esc(d.p.font.name || d.p.name) + '</option>'; }).join('') + '</select><button class="btn small" data-act="usefont">Use this open font</button></div>';
    h += section('Font', fontBody);
    var txt = '<label class="col">Text <input type="text" data-change="lbtext" value="' + esc((p.text || []).join('')) + '"></label>' +
      '<p class="muted">Each character you type is one letter of the font. Letters with longer names can be added with the buttons.</p>' +
      '<div class="row wrap">' + f.chars.map(function (c) { return '<button class="btn small" data-act="lbadd" data-l="' + esc(c.letter) + '">' + esc(c.letter) + '</button>'; }).join('') +
      '<button class="btn small" data-act="lbback">Remove last</button></div>' +
      (missing.length ? '<p class="warn">Not in the font: ' + esc(missing.join(' ')) + '</p>' : '') +
      '<button class="btn small" data-act="lbtodf"' + (f.chars.length ? '' : ' disabled') + '>Save as a double-face pattern</button>';
    h += section('Band text', txt);
    return h;
  }

  function joinSection(doc) {
    var others = app().docs().filter(function (d) { return d !== doc && d.p.kind === doc.p.kind; });
    if (!others.length) return '<p class="muted">Open another ' + esc(doc.p.kindLabel.toLowerCase()) + ' pattern to join it to this one.</p>';
    return '<div class="row wrap"><select id="join-src">' + others.map(function (d) { return '<option value="' + d.id + '">' + esc(d.p.name) + '</option>'; }).join('') + '</select>' +
      '<button class="btn small" data-act="join" data-arg="side">Side by side</button><button class="btn small" data-act="join" data-arg="end">End to end</button></div>' +
      '<p class="muted">The result opens as a new pattern.</p>';
  }

  /* ================= events from the panel ================= */

  function afterRender(doc, body) { /* nothing yet: kept for future focus handling */ }

  function rerender() { app().renderSide(); }

  function handle(e, doc) {
    var p = doc.p, x = ed(doc);
    if (e.type === 'change' || e.type === 'input') return change(e, doc);
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act, arg = b.dataset.arg;
    var secondary = e.type === 'contextmenu' || e.shiftKey;
    var cardsSel = x.sel.slice();
    switch (act) {
      case 'tool':
        x.tool = arg;
        if ((arg === 'paint' || arg === 'float') && p.kind !== 'threaded') { app().view().mode = 'design'; app().saveView(); }
        if ((arg === 'colour' || arg === 'direction' || arg === 'twist') && app().view().mode === 'design') app().view().mode = 'real';
        app().redraw(); rerender(); break;
      case 'pal':
        if (secondary) colours.secondary = +b.dataset.i; else colours.primary = +b.dataset.i;
        rerender(); break;
      case 'palswap': var t = colours.primary; colours.primary = colours.secondary; colours.secondary = t; rerender(); break;
      case 'colswap': commit(doc, function (q) { E().swapColours(q, colours.primary, colours.secondary); }); break;
      case 'colrep': commit(doc, function (q) { if (arg === 'sec') E().replaceColour(q, colours.secondary, colours.primary); else E().replaceColour(q, colours.primary, colours.secondary); }); break;
      case 'palreset': commit(doc, function (q) { q.palette = GTT.colour.defaultPalette(); q.paletteName = ''; }); break;
      case 'selcard':
        var i = +b.dataset.i, at = x.sel.indexOf(i);
        if (at >= 0) x.sel.splice(at, 1); else x.sel.push(i);
        rerender(); break;
      case 'selnone': x.sel = []; rerender(); break;
      case 'hole': commit(doc, function (q) { E().setHole(q, +b.dataset.card, +b.dataset.hole, secondary ? colours.secondary : colours.primary); }); break;
      case 'sethole': commit(doc, function (q) { E().setAllHoles(q, cardsSel.length ? cardsSel : q.cards.map(function (_, j) { return j; }), [+arg], colours.primary); }); break;
      case 'togthr': commit(doc, function (q) { E().setThreading(q, [+b.dataset.card], 'toggle'); }); break;
      case 'thr': commit(doc, function (q) { E().setThreading(q, cardsSel, arg); }); break;
      case 'movecards':
        if (!x.sel.length) { app().toast('Select cards first by clicking their numbers.'); break; }
        commit(doc, function (q) { x.sel = E().moveCards(q, x.sel, +arg); }); break;
      case 'insertcard': commit(doc, function (q) { E().insertCard(q, cardsSel.length ? Math.max.apply(null, cardsSel) + 1 : q.cards.length); x.sel = []; }); break;
      case 'deletecards':
        if (!x.sel.length) { app().toast('Select cards first by clicking their numbers.'); break; }
        if (x.sel.length >= p.cards.length) { app().toast('A pattern needs at least one card.', true); break; }
        commit(doc, function (q) { E().deleteCards(q, cardsSel); x.sel = []; }); break;
      case 'specdir':
        var key = b.dataset.pack || b.dataset.card;
        var it = x.spec.items[key] || (x.spec.items[key] = { dir: 'F' });
        it.dir = it.dir === 'F' ? 'B' : (it.dir === 'B' ? 'I' : 'F');
        rerender(); break;
      case 'spectwist':
        var it2 = x.spec.items[b.dataset.card] || (x.spec.items[b.dataset.card] = { dir: 'F' });
        it2.twist = !it2.twist; rerender(); break;
      case 'specall':
        p.cards.forEach(function (_, j) {
          var it3 = x.spec.items[j + 1] || (x.spec.items[j + 1] = { dir: 'F' });
          if (arg === 'swap') it3.dir = it3.dir === 'F' ? 'B' : (it3.dir === 'B' ? 'F' : 'I'); else it3.dir = arg;
        });
        rerender(); break;
      case 'specmode': x.spec = { mode: arg, items: {} }; rerender(); break;
      case 'addpick':
        commit(doc, function (q) { E().addPick(q, x.spec, arg === 'rev'); });
        // twists are one-off, as in GTT's card actions; pack twist marks stay set
        if (x.spec.mode === 'cards') Object.keys(x.spec.items).forEach(function (k) { x.spec.items[k].twist = false; });
        doc.selectedPick = doc.p.picks.length - 1; app().renderSide(); break;
      case 'poppick': commit(doc, function (q) { E().removeLastPick(q); }); break;
      case 'clearpicks': if (window.confirm('Delete all picks of this pattern?')) commit(doc, function (q) { E().clearPicks(q); }); break;
      case 'repeatpicks': commit(doc, function (q) { E().repeatPicks(q, doc.pickSel); }); break;
      case 'deletepicks': commit(doc, function (q) { E().deletePicks(q, doc.pickSel); }); doc.pickSel = []; doc.selectedPick = null; app().renderSide(); break;
      case 'breakpacks': commit(doc, function (q) { E().breakUpPacks(q); }); x.spec = { mode: 'cards', items: {} }; break;
      case 'addpack': commit(doc, function (q) { E().addPack(q, null, cardsSel.map(function (j) { return j + 1; })); }); break;
      case 'delpack': commit(doc, function (q) { E().removePack(q, b.dataset.pack); }); break;
      case 'packcard': commit(doc, function (q) { E().togglePackCard(q, b.dataset.pack, +b.dataset.card); }); break;
      // block designs
      case 'weft': x.weft = +b.dataset.i; rerender(); break;
      case 'resize':
        var w = parseInt(document.getElementById('ed-w').value, 10), h = parseInt(document.getElementById('ed-h').value, 10);
        commit(doc, function (q) { E().resizeBlock(q, w, h); }); break;
      case 'shift': commit(doc, function (q) { E().shift(q, arg); }); break;
      case 'invert': commit(doc, function (q) { E().invert(q); }); break;
      case 'mirror': commit(doc, function (q) { E().mirror(q, arg); }); break;
      case 'realign': commit(doc, function (q) { E().realign(q); }); break;
      case 'cleardesign': commit(doc, function (q) { E().clearDesign(q); }); break;
      case 'clearfloats': commit(doc, function (q) { E().clearFloats(q); }); break;
      case 'bgtwill': commit(doc, function (q) { q.backgroundTwill = arg; }); break;
      case 'twthr': commit(doc, function (q) {
        var n = q.twistThreading.length;
        q.twistThreading = q.twistThreading.map(function (_, j) {
          return arg === 'S' || arg === 'Z' ? arg : arg === 'SZ' ? (j % 2 ? 'Z' : 'S') : arg === 'ZS' ? (j % 2 ? 'S' : 'Z') : (j < n / 2 ? 'S' : 'Z');
        });
      }); break;
      case 'twtog': commit(doc, function (q) { var j = +b.dataset.card; q.twistThreading[j] = q.twistThreading[j] === 'S' ? 'Z' : 'S'; }); break;
      case 'dfcol': commit(doc, function (q) { E().setAllHoles(q, cardsSel.length ? cardsSel : q.cards.map(function (_, j) { return j; }), arg === 'front' ? [0, 1] : [2, 3], colours.primary); }); break;
      case 'twcol': commit(doc, function (q) {
        var pat = q.cards[0].holes[0], bg = q.cards[0].holes[2];
        E().replaceColour(q, arg === 'P' ? pat : bg, colours.primary);
      }); break;
      case 'selvedges':
        var l = +document.getElementById('sv-l').value || 0, r = +document.getElementById('sv-r').value || 0, th = document.getElementById('sv-t').value;
        commit(doc, function (q) { E().setSelvedges(q, 'left', l, colours.primary, th); E().setSelvedges(q, 'right', r, colours.primary, th); }); break;
      case 'tobrocade': app().openPattern(E().toBrocade(p), 'edit'); break;
      case 'setground':
        var src = findDoc(+document.getElementById('gw-src').value);
        if (src) commit(doc, function (q) {
          q.groundWeave = E().clone(src.p); q.groundWeaveAttr = 'Yes';
          var g = GTT.gen.generate(q.groundWeave, {});
          E().resizeBlock(q, g.cards.length, Math.max(q.visual.length, g.picks.length));
          q.cards = E().clone(g.cards);
        });
        break;
      case 'clearground': commit(doc, function (q) { q.groundWeave = null; q.groundWeaveAttr = 'No'; }); break;
      // fonts
      case 'letter': x.letter = +b.dataset.i; rerender(); break;
      case 'addletter':
        var ltr = (document.getElementById('new-letter').value || '').trim();
        if (!ltr) { app().toast('Type the letter to add first.'); break; }
        if (p.font.chars.some(function (c) { return c.letter === ltr; })) { app().toast('The font already has the letter "' + ltr + '".', true); break; }
        commit(doc, function (q) { x.letter = E().addLetter(q.font, ltr); }); break;
      case 'delletter': commit(doc, function (q) { E().removeLetter(q.font, x.letter); x.letter = Math.max(0, x.letter - 1); }); break;
      case 'moveletter': commit(doc, function (q) { x.letter = E().moveLetter(q.font, x.letter, +arg); }); break;
      // lettered bands
      case 'lbadd': commit(doc, function (q) { q.text = (q.text || []).concat([b.dataset.l]); }); break;
      case 'lbback': commit(doc, function (q) { q.text = (q.text || []).slice(0, -1); }); break;
      case 'lbtodf': app().openPattern(E().letteredToDoubleface(p), 'edit'); break;
      case 'usefont':
        var fd = findDoc(+document.getElementById('font-src').value);
        if (fd) commit(doc, function (q) { q.font = E().clone(fd.p.font); q.fontName = q.font.name; });
        break;
      case 'join':
        var other = findDoc(+document.getElementById('join-src').value);
        if (!other) break;
        try { app().openPattern(E().join(p, other.p, arg), 'edit'); }
        catch (err) { app().toast(err.message, true); }
        break;
    }
  }

  function findDoc(id) { return app().docs().find(function (d) { return d.id === id; }); }

  function change(e, doc) {
    var el = e.target, what = el.dataset.change;
    if (!what) return;
    var p = doc.p, x = ed(doc), v = el.value, n = parseInt(v, 10);
    var ch = function (fn) { commit(doc, fn); };
    switch (what) {
      case 'name': ch(function (q) { if (q.kind === 'font') q.font.name = v; q.name = v; }); break;
      case 'notes': ch(function (q) { if (q.kind === 'font') q.font.notes = v; q.notes = v; }); break;
      case 'palcolour': ch(function (q) { E().setPaletteColour(q, colours.primary, v); }); break;
      case 'cardcount': if (n > 0) ch(function (q) { E().setCardCount(q, n); x.sel = []; }); break;
      case 'spectwist': var it = x.spec.items[el.dataset.pack] || (x.spec.items[el.dataset.pack] = { dir: 'F' }); it.twist = el.checked; break;
      case 'packname':
        var ok = true; ch(function (q) { ok = E().renamePack(q, el.dataset.pack, v.trim()); if (!ok) throw new Error('That pack name is empty or already used.'); });
        break;
      case 'weftname': ch(function (q) { q.wefts[+el.dataset.i].name = v; }); break;
      case 'weftcolour': ch(function (q) { q.wefts[+el.dataset.i].colour = v; }); break;
      case 'bitmap': if (el.files && el.files[0]) importImage(doc, el.files[0]); el.value = ''; break;
      case 'fheight': if (n > 0) ch(function (q) { E().setFontHeight(q.font, n); }); break;
      case 'fdefw': if (n > 0) ch(function (q) { q.font.defCharWidth = n; }); break;
      case 'fkern': if (n >= 0) ch(function (q) { q.font.kerning = n; }); break;
      case 'fthr': ch(function (q) { q.font.threading = v; }); break;
      case 'lletter': if (v.trim()) ch(function (q) { q.font.chars[x.letter].letter = v.trim(); }); break;
      case 'lname': ch(function (q) { q.font.chars[x.letter].name = v; }); break;
      case 'lwidth': if (n > 0) ch(function (q) { E().setLetterWidth(q.font, x.letter, n); }); break;
      case 'lbefore': if (n >= 0) ch(function (q) { q.font.chars[x.letter].spaceBefore = n; }); break;
      case 'lafter': if (n >= 0) ch(function (q) { q.font.chars[x.letter].spaceAfter = n; }); break;
      case 'lbtext': ch(function (q) { q.text = Array.from(v); }); break;
      case 'loadfont':
        if (el.files && el.files[0]) {
          el.files[0].arrayBuffer().then(function (buf) {
            var fp = GTT.io.parse(GTT.io.decodeBytes(buf), el.files[0].name);
            var font = fp.kind === 'font' ? fp.font : (fp.kind === 'letteredband' ? fp.font : null);
            if (!font) throw new Error('That file is not a GTT font.');
            commit(doc, function (q) { q.font = font; q.fontName = font.name; });
          }).catch(function (err) { app().toast('Could not load the font. ' + err.message, true); });
        }
        break;
    }
  }

  /* ---------- image import ---------- */

  function importImage(doc, file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var maxW = 200, maxH = 1000;
      var s = Math.min(1, maxW / img.width, maxH / img.height);
      var w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      var d = ctx.getImageData(0, 0, w, h).data, bits = [];
      for (var y = 0; y < h; y++) {
        var row = [];
        for (var x = 0; x < w; x++) { var i = (y * w + x) * 4; row.push((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < 128 ? 1 : 0); }
        bits.push(row);
      }
      URL.revokeObjectURL(url);
      commit(doc, function (q) { E().importBitmap(q, bits); });
      app().toast('Imported a ' + w + ' by ' + h + ' design.');
    };
    img.onerror = function () { URL.revokeObjectURL(url); app().toast('That image could not be read.', true); };
    img.src = url;
  }

  /* ================= drawing on the band ================= */

  var drag = null;

  function wantsPointer(doc) {
    var t = ed(doc).tool;
    if (doc.p.kind === 'threaded') return t === 'colour' || t === 'direction' || t === 'twist';
    if (doc.p.kind === 'font' || doc.p.kind === 'letteredband') return false;
    return (t === 'paint' || t === 'float') && app().view().mode === 'design';
  }

  function cellValue(doc, current, erase) {
    if (doc.p.kind === 'brocade') {
      var mine = letter(ed(doc).weft - 1);
      return erase || current === mine ? '.' : mine;
    }
    return erase || current === 'X' ? '.' : 'X';
  }

  function pointer(phase, doc, hit, e) {
    var x = ed(doc), p = doc.p;
    if (p.kind === 'threaded') {
      if (phase !== 'down' || !hit || !doc.sim) return;
      var erase = e.button === 2 || e.shiftKey;
      if (x.tool === 'colour') {
        var hole = doc.sim.rows[hit.pick][hit.card].hole;
        commit(doc, function (q) { E().setHole(q, hit.card, hole, erase ? colours.secondary : colours.primary); });
      } else if (x.tool === 'direction') {
        commit(doc, function (q) { E().flipDirection(q, hit.pick, hit.card); });
      } else if (x.tool === 'twist') {
        commit(doc, function (q) { E().toggleTwistAt(q, hit.pick, hit.card); });
      }
      return;
    }
    var layer = x.tool === 'float' ? 'float' : 'design';
    if (phase === 'down') {
      if (!hit) return;
      var cur = E().getCell(p, hit.pick, hit.card, layer);
      var v = layer === 'float' ? (e.button === 2 || e.shiftKey || cur === 'X' ? '.' : 'X') : cellValue(doc, cur, e.button === 2 || e.shiftKey);
      drag = { v: v, layer: layer, last: '' };
      app().beginLive(doc);
      paintAt(doc, hit);
    } else if (phase === 'move' && drag && hit) {
      paintAt(doc, hit);
    } else if (phase === 'up' && drag) {
      drag = null;
      app().endLive(doc);
    }
  }

  function paintAt(doc, hit) {
    var key = hit.pick + ',' + hit.card;
    if (drag.last === key) return;
    drag.last = key;
    app().live(doc, function (q) { return E().setCell(q, hit.pick, hit.card, drag.v, drag.layer); });
  }

  // Letter grid in the side panel
  var ldrag = null;
  function sidePointer(phase, e, doc) {
    if (phase === 'up') { if (ldrag) { ldrag = null; app().endLive(doc); } return; }
    var td = e.target.closest && e.target.closest('[data-lc]');
    if (!td || doc.p.kind !== 'font') return;
    var rc = td.dataset.lc.split(',').map(Number);
    var ch = doc.p.font.chars[ed(doc).letter]; if (!ch) return;
    if (phase === 'down') {
      e.preventDefault();
      var cur = ch.pattern.data[rc[0]].charAt(rc[1]);
      ldrag = { v: (e.button === 2 || e.shiftKey || cur === 'X') ? '.' : 'X' };
      app().beginLive(doc);
    }
    if (!ldrag) return;
    app().live(doc, function (q) {
      var c2 = q.font.chars[ed(doc).letter], row = c2.pattern.data[rc[0]];
      if (row.charAt(rc[1]) === ldrag.v) return false;
      c2.pattern.data[rc[0]] = row.slice(0, rc[1]) + ldrag.v + row.slice(rc[1] + 1);
    });
    td.className = ldrag.v === 'X' ? 'x' : '';
  }

  /* ================= new pattern dialog ================= */

  function initNewDialog() {
    var dlg = document.getElementById('new-dialog');
    var kind = document.getElementById('new-kind');
    function sync() {
      var k = kind.value;
      document.getElementById('new-holes-row').hidden = k !== 'threaded';
      document.getElementById('new-cards-row').hidden = k === 'letteredband';
      document.getElementById('new-length-row').hidden = k === 'threaded' || k === 'letteredband';
      document.getElementById('new-cards-label').textContent = k === 'font' ? 'Letter height (cards)' : 'Cards';
      document.getElementById('new-length-row').firstChild.textContent = k === 'font' ? 'Default letter width ' : (k === 'brocade' ? 'Picks ' : 'Rows ');
    }
    kind.addEventListener('change', sync);
    document.getElementById('btn-new').addEventListener('click', function () {
      sync();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
    dlg.addEventListener('close', function () {
      if (dlg.returnValue !== 'ok') return;
      var k = kind.value;
      var o = {
        cards: parseInt(document.getElementById('new-cards').value, 10) || 16,
        length: parseInt(document.getElementById('new-length').value, 10) || 24,
        holes: parseInt(document.getElementById('new-holes').value, 10) || 4,
        name: document.getElementById('new-name').value || 'New pattern'
      };
      if (k === 'font') o.charWidth = o.length;
      try {
        var p = E().create(k, o);
        app().openPattern(p, 'edit');
        var d = app().active();
        if (d && k !== 'threaded' && k !== 'font' && k !== 'letteredband') { app().view().mode = 'design'; app().saveView(); app().redraw(); }
      } catch (err) { app().toast(err.message, true); }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNewDialog);
    else initNewDialog();
  }

  GTT.editor = {
    panel: panel, afterRender: afterRender, handle: handle,
    wantsPointer: wantsPointer, pointer: pointer, sidePointer: sidePointer, colours: colours
  };
})(window.GTT = window.GTT || {});
