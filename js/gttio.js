/* Reading and writing GTT (.gtt) pattern files.
 *
 * GTT files are XML with a <TWData> root. The format is documented in
 * Guntram's "GTT File Formats" note, but GTT 1.17 differs from that note in
 * places (e.g. Type="Doubleface", <BrocadePicks>, <Selvedges>, <LongFloats>).
 * Everything here was checked against files saved by GTT 1.17 itself.
 */
(function (GTT) {
  'use strict';

  var colour = GTT.colour;
  var SOURCE = "Guntram's Tabletweaving Thingy";

  // ---------- small DOM helpers (work with browser DOM and xmldom) ----------

  function kids(el, name) {
    var out = [];
    if (!el) return out;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && (!name || n.nodeName === name)) out.push(n);
    }
    return out;
  }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function text(el) {
    if (!el) return '';
    var s = '';
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 || n.nodeType === 4) s += n.nodeValue;
      else if (n.nodeType === 1) s += text(n);
    }
    return s;
  }
  function kidText(el, name) { return text(kid(el, name)); }
  function attr(el, name) { return el && el.getAttribute(name) !== null ? el.getAttribute(name) : ''; }
  function int(v, dflt) { var n = parseInt(v, 10); return isNaN(n) ? dflt : n; }
  function cleanNotes(s) { return (s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\n+|\s+$/g, ''); }

  // ---------- kind detection ----------

  var KIND_BY_TYPE = {
    'threaded': 'threaded', 'threaded-in': 'threaded',
    'doubleface': 'doubleface',
    'brokentwill': 'twill',
    'brocade': 'brocade',
    'letteredband': 'letteredband',
    'twistpatterned': 'twist', 'warptwined': 'twist',
    'font': 'font'
  };

  var KIND_LABEL = {
    threaded: 'Threaded-in',
    doubleface: 'Double-face',
    twill: '3/1 broken twill',
    brocade: 'Brocade',
    letteredband: 'Lettered band',
    twist: 'Twist-patterned',
    font: 'Font'
  };

  // ---------- decoding bytes ----------

  // GTT wrote files without an XML declaration using the Windows ANSI code page.
  function decodeBytes(buf) {
    var bytes = new Uint8Array(buf);
    var head = '';
    for (var i = 0; i < Math.min(bytes.length, 200); i++) head += String.fromCharCode(bytes[i]);
    var m = /encoding=["']([^"']+)["']/i.exec(head);
    var enc = m ? m[1] : 'windows-1252';
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) enc = 'utf-8';
    try { return new TextDecoder(enc).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function parseXml(src) {
    var Parser = (typeof DOMParser !== 'undefined') ? DOMParser : GTT._DOMParser;
    var tryParse = function (s) {
      var errs = [];
      var p = GTT._DOMParser ? new Parser({ onError: function (lvl, msg) { if (lvl !== 'warning') errs.push(msg); } }) : new Parser();
      var doc = p.parseFromString(s, 'text/xml');
      var pe = doc.getElementsByTagName('parsererror');
      if (pe && pe.length) errs.push(text(pe[0]));
      return { doc: doc, errs: errs };
    };
    var r = tryParse(src);
    if (r.errs.length) {
      // Old files sometimes contain bare ampersands in names and notes.
      var fixed = src.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
      var r2 = tryParse(fixed);
      if (!r2.errs.length) return r2.doc;
      throw new Error('This file is not valid XML: ' + r.errs[0]);
    }
    return r.doc;
  }

  // ---------- section readers ----------

  function readPalette(el) {
    if (!el) return null;
    var pal = colour.defaultPalette();
    kids(el, 'Colour').forEach(function (c, i) {
      var idx = int(attr(c, 'Index'), i + 1) - 1;
      if (idx >= 0 && idx < 64) pal[idx] = colour.winToHex(text(c).trim());
    });
    return { name: attr(el, 'Name'), colours: pal };
  }

  function readCards(el) {
    return kids(el, 'Card').map(function (c, i) {
      var holesEl = kid(c, 'Holes');
      var holes = kids(holesEl, 'Colour').map(function (h) { return int(text(h).trim(), 0); });
      var n = int(attr(c, 'Holes'), holes.length || 4);
      while (holes.length < n) holes.push(0);
      var thr = (kidText(c, 'Threading').trim().toUpperCase() === 'Z') ? 'Z' : 'S';
      return { number: int(attr(c, 'Number'), i + 1), holes: holes, threading: thr };
    });
  }

  function readSelvedges(el) {
    var out = { left: [], right: [] };
    if (!el) return out;
    out.left = readCards(kid(kid(el, 'Left'), 'Cards'));
    out.right = readCards(kid(kid(el, 'Right'), 'Cards'));
    return out;
  }

  function readPacks(el) {
    return kids(el, 'Pack').map(function (p) {
      var list = kidText(p, 'Cards').split(/[,\s]+/).filter(Boolean).map(function (v) { return int(v, 0); }).filter(function (v) { return v > 0; });
      return { name: attr(p, 'Name'), comment: kidText(p, 'Comment'), cards: list };
    });
  }

  function readPicks(el) {
    var picks = kids(el, 'Pick').map(function (p, i) {
      var actions = kids(kid(p, 'Actions'), 'Action').map(function (a) {
        return {
          type: attr(a, 'Type') || 'Turn',
          target: attr(a, 'Target') || 'Card',
          id: attr(a, 'TargetID'),
          dir: (attr(a, 'Dir') || 'F').toUpperCase(),
          dist: int(attr(a, 'Dist'), 1)
        };
      });
      return { index: int(attr(p, 'Index'), i), actions: actions };
    });
    picks.sort(function (a, b) { return a.index - b.index; });
    return picks.map(function (p) { return p.actions; });
  }

  // <P1>..<Pn> rows; returned bottom-up (index 0 = P1).
  function readRows(el) {
    if (!el) return [];
    var rows = [];
    kids(el).forEach(function (r) {
      var m = /^P(\d+)$/.exec(r.nodeName);
      if (m) rows.push({ i: int(m[1], 0), s: text(r) });
    });
    rows.sort(function (a, b) { return a.i - b.i; });
    return rows.map(function (r) { return r.s; });
  }

  function readFontBody(el) {
    var font = {
      name: kidText(el, 'Name'),
      notes: cleanNotes(kidText(el, 'Notes')),
      height: int(kidText(el, 'Height'), 0),
      defCharWidth: int(kidText(el, 'DefCharWidth'), 0),
      kerning: int(kidText(el, 'Kerning'), 0),
      threading: kidText(el, 'Threading').trim() || 'AllS',
      selvedges: readSelvedges(kid(el, 'Selvedges')),
      chars: []
    };
    kids(kid(el, 'Data'), 'Character').forEach(function (c) {
      var pat = kid(c, 'Pattern');
      font.chars.push({
        letter: attr(c, 'Letter'),
        name: kidText(c, 'Name'),
        spaceBefore: int(kidText(c, 'SpaceBefore'), 0),
        spaceAfter: int(kidText(c, 'SpaceAfter'), 0),
        pattern: pat ? readBlockPattern(pat, {}) : null
      });
    });
    return font;
  }

  function readBlockPattern(el, p) {
    p.width = int(kidText(el, 'Width'), 0);
    p.length = int(kidText(el, 'Length'), 0);
    p.colourCount = int(kidText(el, 'ColourCount'), 2);
    p.data = readRows(kid(el, 'Data'));
    return p;
  }

  // ---------- main entry: parse ----------

  function parse(src, filename) {
    var doc = parseXml(src);
    var root = doc.documentElement;
    if (!root || root.nodeName !== 'TWData') throw new Error('This is not a GTT pattern file (no <TWData> element).');
    var source = kidText(root, 'Source').trim();
    var warnings = [];
    if (source && source !== SOURCE) warnings.push('The file says it came from "' + source + '", not GTT. It may not load correctly.');

    var p = {
      fileName: filename || '',
      version: kidText(root, 'Version').trim(),
      warnings: warnings
    };

    var fontEl = kid(root, 'Font');
    var patEl = kid(root, 'Pattern');

    if (!patEl && fontEl) {
      p.kind = 'font';
      p.typeAttr = 'Font';
      p.font = readFontBody(fontEl);
      p.name = p.font.name;
      p.notes = p.font.notes;
      p.palette = colour.defaultPalette();
      return finish(p);
    }
    if (!patEl) throw new Error('This GTT file has no <Pattern> section.');

    var type = attr(patEl, 'Type');
    p.typeAttr = type;
    p.kind = KIND_BY_TYPE[type.toLowerCase()];
    if (!p.kind) throw new Error('Unknown GTT pattern type "' + type + '".');

    p.name = kidText(patEl, 'Name');
    p.notes = cleanNotes(kidText(patEl, 'Notes'));
    var pal = readPalette(kid(patEl, 'Palette'));
    p.paletteName = pal ? pal.name : '';
    p.palette = pal ? pal.colours : colour.defaultPalette();
    p.paletteInFile = !!pal;
    p.cards = readCards(kid(patEl, 'Cards'));
    p.selvedges = readSelvedges(kid(patEl, 'Selvedges'));

    switch (p.kind) {
      case 'threaded':
        p.packs = readPacks(kid(patEl, 'Packs'));
        p.picks = readPicks(kid(patEl, 'Picks'));
        break;

      case 'doubleface':
        readBlockPattern(patEl, p);
        break;

      case 'twill':
        readBlockPattern(patEl, p);
        p.backgroundTwill = (kidText(patEl, 'BackgroundTwill').trim().toUpperCase() === 'Z') ? 'Z' : (kid(patEl, 'BackgroundTwill') ? 'S' : '');
        if (kid(patEl, 'LongFloats')) {
          p.longFloats = readRows(kid(patEl, 'LongFloats'));
        } else if (kid(patEl, 'Reversals')) {
          // GTT 1.11 stored long floats as "Reversals", top row first.
          var rev = readRows(kid(patEl, 'Reversals'));
          p.longFloats = rev.length ? rev : [];
          p.longFloatsFromReversals = true;
        } else {
          p.longFloats = [];
        }
        break;

      case 'twist':
        readBlockPattern(patEl, p);
        p.twistThreading = kidText(patEl, 'Threading').split(',')
          .map(function (s) { return s.trim().toUpperCase(); })
          .filter(function (s) { return s === 'S' || s === 'Z'; });
        break;

      case 'brocade':
        p.width = int(kidText(patEl, 'Width'), 0);
        p.groundWeaveAttr = attr(patEl, 'GroundWeave');
        var bp = kid(patEl, 'BrocadePicks') || kid(patEl, 'Picks');
        p.brocadePicks = kids(bp, 'Pick').map(function (pk) {
          return {
            index: int(attr(pk, 'Index'), 0),
            tieDowns: kidText(pk, 'TieDowns').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; }).map(function (s) { return int(s, 0); }),
            wefts: kidText(pk, 'Wefts').trim()
          };
        });
        p.brocadePicks.sort(function (a, b) { return a.index - b.index; });
        p.wefts = kids(kid(patEl, 'Wefts'), 'Thread').map(function (t) {
          return { name: kidText(t, 'Name'), description: kidText(t, 'Description'), colour: colour.winToHex(kidText(t, 'Colour').trim()) };
        });
        p.visual = readRows(kid(patEl, 'VisualPattern'));
        var gw = kid(patEl, 'GroundWeave');
        if (gw && kid(gw, 'Pattern')) {
          try {
            p.groundWeave = parsePatternElement(kid(gw, 'Pattern'));
          } catch (e) { warnings.push('The ground weave could not be read: ' + e.message); }
        }
        break;

      case 'letteredband':
        p.text = kids(kid(patEl, 'Text'), 'Char').map(function (c) { return text(c); });
        var fw = kid(patEl, 'Font');
        if (fw) {
          p.fontName = attr(fw, 'Name');
          var inner = kid(fw, 'Font') || fw;
          p.font = readFontBody(inner);
        }
        break;
    }
    return finish(p);
  }

  // Parse a nested <Pattern> (used for brocade ground weaves).
  function parsePatternElement(el) {
    var XS = (typeof XMLSerializer !== 'undefined') ? new XMLSerializer() : new GTT._XMLSerializer();
    var xml = '<TWData><Source>' + SOURCE + '</Source><Version>1.17</Version>' + XS.serializeToString(el) + '</TWData>';
    return parse(xml, '');
  }

  function finish(p) {
    p.kindLabel = KIND_LABEL[p.kind];
    if (!p.name) p.name = (p.fileName || '').replace(/\.gtt$/i, '') || 'Untitled pattern';
    return p;
  }

  // ---------- writing ----------

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cdata(s) { return '<![CDATA[' + String(s).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>'; }
  function notesXml(s) { return s ? esc(s).replace(/\n/g, '&#13;&#10;') : ''; }

  function Writer() { this.lines = []; this.depth = 0; }
  Writer.prototype.line = function (s) { this.lines.push(new Array(this.depth + 1).join('  ') + s); };
  Writer.prototype.open = function (s) { this.line(s); this.depth++; };
  Writer.prototype.close = function (s) { this.depth--; this.line(s); };
  Writer.prototype.leaf = function (tag, val, attrs) {
    var a = attrs || '';
    if (val === '' || val === null || val === undefined) this.line('<' + tag + a + '/>');
    else this.line('<' + tag + a + '>' + val + '</' + tag + '>');
  };
  Writer.prototype.toString = function () { return this.lines.join('\r\n') + '\r\n'; };

  function writeCards(w, cards, withCurrent) {
    if (!cards.length) { w.line('<Cards Count="0"/>'); return; }
    w.open('<Cards Count="' + cards.length + '">');
    cards.forEach(function (c, i) {
      w.open('<Card Holes="' + c.holes.length + '" Number="' + (i + 1) + '">');
      w.open('<Holes Count="' + c.holes.length + '">');
      c.holes.forEach(function (h) { w.leaf('Colour', h); });
      w.close('</Holes>');
      w.leaf('Threading', c.threading);
      if (withCurrent) {
        w.leaf('CurThread', c.threading);
        w.leaf('CurPos', 0);
        w.open('<CurHoles Count="' + c.holes.length + '">');
        c.holes.forEach(function (h) { w.leaf('Colour', h); });
        w.close('</CurHoles>');
      }
      w.close('</Card>');
    });
    w.close('</Cards>');
  }

  function writeSelvedges(w, s) {
    s = s || { left: [], right: [] };
    w.open('<Selvedges>');
    w.open('<Left>'); writeCards(w, s.left || [], false); w.close('</Left>');
    w.open('<Right>'); writeCards(w, s.right || [], false); w.close('</Right>');
    w.close('</Selvedges>');
  }

  function writePalette(w, p) {
    w.open('<Palette Name="' + esc(p.paletteName || '') + '" Size="16">');
    for (var i = 0; i < 16; i++) w.leaf('Colour', colour.hexToWin(p.palette[i] || '#000000'), ' Index="' + (i + 1) + '"');
    w.close('</Palette>');
  }

  function writeRows(w, tag, rows) {
    w.open('<' + tag + '>');
    for (var i = rows.length - 1; i >= 0; i--) w.leaf('P' + (i + 1), esc(rows[i]));
    w.close('</' + tag + '>');
  }

  function writeFontBody(w, f, tagOpen, tagClose) {
    w.open(tagOpen);
    w.leaf('Name', esc(f.name || ''));
    w.leaf('Notes', notesXml(f.notes));
    writeSelvedges(w, f.selvedges);
    w.leaf('Height', f.height);
    w.leaf('DefCharWidth', f.defCharWidth);
    w.leaf('Kerning', f.kerning);
    w.leaf('Threading', f.threading || 'AllS');
    w.open('<Data>');
    f.chars.forEach(function (c) {
      w.open('<Character Letter="' + esc(c.letter) + '">');
      w.leaf('Name', esc(c.name || ''));
      w.leaf('SpaceBefore', c.spaceBefore || 0);
      w.leaf('SpaceAfter', c.spaceAfter || 0);
      var cp = c.pattern || { width: f.height, length: 0, colourCount: 2, data: [] };
      w.open('<Pattern Type="Doubleface">');
      w.leaf('Name', ''); w.leaf('Notes', '');
      writeSelvedges(w, null);
      w.leaf('Width', cp.width); w.leaf('Length', cp.length); w.leaf('ColourCount', cp.colourCount || 2);
      writeRows(w, 'Data', cp.data);
      w.close('</Pattern>');
      w.close('</Character>');
    });
    w.close('</Data>');
    w.close(tagClose);
  }

  function writePatternBody(w, p) {
    switch (p.kind) {
      case 'threaded':
        w.open('<Pattern Type="Threaded-in">');
        w.leaf('Name', cdata(p.name || ''));
        w.leaf('Notes', notesXml(p.notes));
        writeCards(w, p.cards, true);
        if (!p.packs || !p.packs.length) w.line('<Packs Count="0"/>');
        else {
          w.open('<Packs Count="' + p.packs.length + '">');
          p.packs.forEach(function (pk) {
            w.open('<Pack Name="' + esc(pk.name) + '">');
            w.leaf('Comment', esc(pk.comment || ''));
            w.leaf('Size', pk.cards.length);
            w.leaf('Cards', pk.cards.join(','));
            w.close('</Pack>');
          });
          w.close('</Packs>');
        }
        w.open('<Picks Count="' + p.picks.length + '">');
        p.picks.forEach(function (acts, i) {
          w.open('<Pick Index="' + i + '">');
          w.open('<Actions Count="' + acts.length + '">');
          acts.forEach(function (a) {
            var s = '<Action Type="' + esc(a.type) + '" Target="' + esc(a.target) + '" TargetID="' + esc(a.id) + '" Dir="' + esc(a.dir) + '"';
            if (a.type === 'Turn') s += ' Dist="' + (a.dist || 1) + '"';
            w.line(s + '/>');
          });
          w.close('</Actions>');
          w.close('</Pick>');
        });
        w.close('</Picks>');
        writePalette(w, p);
        w.close('</Pattern>');
        break;

      case 'doubleface':
      case 'twill':
        w.open('<Pattern Type="' + (p.kind === 'twill' ? 'BrokenTwill' : 'Doubleface') + '">');
        w.leaf('Name', cdata(p.name || ''));
        w.leaf('Notes', notesXml(p.notes));
        writeSelvedges(w, p.selvedges);
        w.leaf('Width', p.width); w.leaf('Length', p.length); w.leaf('ColourCount', p.colourCount);
        writeCards(w, p.cards, false);
        writePalette(w, p);
        writeRows(w, 'Data', p.data);
        if (p.kind === 'twill') {
          w.leaf('BackgroundTwill', p.backgroundTwill || 'S');
          var lf = p.longFloats && p.longFloats.length ? p.longFloats : p.data.map(function (r) { return r.replace(/./g, '.'); });
          writeRows(w, 'LongFloats', lf);
        }
        w.close('</Pattern>');
        break;

      case 'twist':
        w.open('<Pattern Type="TwistPatterned">');
        w.leaf('Name', cdata(p.name || ''));
        w.leaf('Notes', notesXml(p.notes));
        w.leaf('Width', p.width); w.leaf('Length', p.length); w.leaf('ColourCount', p.colourCount);
        writeRows(w, 'Data', p.data);
        w.leaf('Threading', (p.twistThreading || []).join(', '));
        w.close('</Pattern>');
        break;

      case 'brocade':
        w.open('<Pattern Type="Brocade" GroundWeave="' + (p.groundWeave ? 'Yes' : 'No') + '">');
        w.leaf('Name', cdata(p.name || ''));
        w.leaf('Notes', notesXml(p.notes));
        w.leaf('Width', p.width);
        w.open('<BrocadePicks Count="' + p.brocadePicks.length + '">');
        p.brocadePicks.forEach(function (pk) {
          w.open('<Pick Index="' + pk.index + '">');
          w.leaf('TieDowns', pk.tieDowns.join(','));
          w.leaf('Wefts', esc(pk.wefts));
          w.close('</Pick>');
        });
        w.close('</BrocadePicks>');
        w.open('<Wefts Count="' + p.wefts.length + '">');
        p.wefts.forEach(function (t) {
          w.open('<Thread>');
          w.leaf('Description', esc(t.description || ''));
          w.leaf('Colour', colour.hexToWin(t.colour));
          w.leaf('Name', cdata(t.name || ''));
          w.close('</Thread>');
        });
        w.close('</Wefts>');
        writeCards(w, p.cards, false);
        writePalette(w, p);
        writeRows(w, 'VisualPattern', p.visual);
        if (p.groundWeave) {
          w.open('<GroundWeave>');
          writePatternBody(w, p.groundWeave);
          w.close('</GroundWeave>');
        }
        w.close('</Pattern>');
        break;

      case 'letteredband':
        w.open('<Pattern Type="LetteredBand">');
        w.leaf('Notes', notesXml(p.notes));
        w.open('<Text>');
        (p.text || []).forEach(function (c) { w.leaf('Char', esc(c)); });
        w.close('</Text>');
        w.open('<Font Name="' + esc(p.fontName || (p.font && p.font.name) || '') + '" Encapsulated="Yes">');
        if (p.font) writeFontBody(w, p.font, '<Font Type="Font">', '</Font>');
        w.close('</Font>');
        w.close('</Pattern>');
        break;
    }
  }

  function write(p) {
    var w = new Writer();
    w.open('<TWData>');
    w.leaf('Source', SOURCE);
    w.leaf('Version', '1.17');
    w.line('<Release/>');
    if (p.kind === 'font') writeFontBody(w, p.font, '<Font Type="Font">', '</Font>');
    else writePatternBody(w, p);
    w.close('</TWData>');
    return w.toString();
  }

  GTT.io = {
    decodeBytes: decodeBytes,
    parse: parse,
    write: write,
    KIND_LABEL: KIND_LABEL
  };
})(typeof window !== 'undefined' ? (window.GTT = window.GTT || {}) : (module.exports = global.GTT = global.GTT || {}));
