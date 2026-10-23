/* Colour helpers.
 * GTT stores colours as Windows COLORREF integers (0x00BBGGRR).
 * Negative values are Windows system colours (e.g. clBtnFace).
 */
(function (GTT) {
  'use strict';

  // The 16-colour palette GTT 1.17 gives every new pattern.
  var DEFAULT_PALETTE_WIN = [
    0, 128, 32768, 32896, 8388608, 8388736, 8421376, 8421504,
    12632256, 255, 65280, 65535, 16711680, 16711935, 16776960, 16777215
  ];

  var SYSTEM_COLOURS = {
    '-2147483633': '#f0f0f0', // clBtnFace
    '-2147483643': '#ffffff', // clWindow
    '-2147483640': '#000000'  // clWindowText
  };

  function hex2(n) {
    var s = n.toString(16);
    return s.length < 2 ? '0' + s : s;
  }

  function winToHex(v) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return '#000000';
    if (n < 0) return SYSTEM_COLOURS[String(n)] || '#f0f0f0';
    var r = n & 0xff, g = (n >> 8) & 0xff, b = (n >> 16) & 0xff;
    return '#' + hex2(r) + hex2(g) + hex2(b);
  }

  function hexToWin(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (b << 16) | (g << 8) | r;
  }

  function defaultPalette() {
    return DEFAULT_PALETTE_WIN.map(winToHex);
  }

  // Relative luminance, used to pick a readable text colour over a thread colour.
  function isDark(hex) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  }

  GTT.colour = {
    DEFAULT_PALETTE_WIN: DEFAULT_PALETTE_WIN,
    winToHex: winToHex,
    hexToWin: hexToWin,
    defaultPalette: defaultPalette,
    isDark: isDark
  };
})(typeof window !== 'undefined' ? (window.GTT = window.GTT || {}) : (module.exports = global.GTT = global.GTT || {}));
