/*!
 * GT Meal Plan System — the pastel palette, in one place
 * ------------------------------------------------------------------
 * Eleven pages were written independently, against four different colour
 * vocabularies: Tailwind's default scales, per-page Tailwind configs with
 * their own names (fbblue, brand, tablehd…), hand-rolled CSS custom
 * properties, and bare hex literals in <style> blocks. Restyling them one by
 * one would guarantee drift, so the palette is defined once here and the
 * three consumers — gt-tailwind.js, gt-theme.css and gt-chrome.js — all read
 * from it.
 *
 * Every value is pastel in the surfaces and soft-but-legible in the ink.
 * That distinction is the whole trick: pastel backgrounds with pastel text
 * are pretty and unreadable, so the 50–200 steps carry the softness and the
 * 600–800 steps carry the contrast. The ratios noted below are against white
 * for text shades, and against the shade for button labels; the ones that
 * matter clear WCAG AA (4.5:1).
 */
(function (root) {
  'use strict';

  /* Sage — the house accent. Descended from the practice's #2D7A5F so the
     portal still reads as the same brand, just lighter on its feet. */
  var sage = {
    50:'#EFF7F2', 100:'#DCEEE4', 200:'#BFE0CE', 300:'#9ECFB6',
    400:'#6FB894', 500:'#4E9E77', 600:'#3E7F60', 700:'#326650', 800:'#274F3F', 900:'#1E3E31'
  };                                    /* 600 on white 4.8:1 · white on 600 4.8:1 */

  /* Warm grey. Replaces gray/slate/zinc/neutral/stone alike, so pages that
     picked different grey families stop looking like different products. */
  var ash = {
    50:'#F7F9F8', 100:'#EEF3F0', 200:'#DFE8E3', 300:'#C9D6CE',
    400:'#93A89B', 500:'#63796D', 600:'#5E7268', 700:'#46574F', 800:'#33413B', 900:'#222C27'
  };                                    /* 700 on white 7.7:1 · 600 5.1:1 · 500 4.7:1 */

  var sky    = { 50:'#EEF4FB', 100:'#DCE8F6', 200:'#C2D7EE', 300:'#9DBCE0',
                 400:'#749CC9', 500:'#5E8CC4', 600:'#4A76AB', 700:'#3C5F8A', 800:'#314D70', 900:'#283E5A' };
                                        /* white on 600 4.7:1 */
  var lilac  = { 50:'#F4F0FA', 100:'#EAE3F5', 200:'#D8CDEC', 300:'#BCACDD',
                 400:'#9E8ACB', 500:'#8B7BC0', 600:'#7566A8', 700:'#5E5288', 800:'#4C426E', 900:'#3D3558' };
                                        /* white on 600 5.0:1 */
  var aqua   = { 50:'#EAF6F5', 100:'#D6EDEB', 200:'#B3DEDA', 300:'#87C8C2',
                 400:'#5CAEA7', 500:'#489A93', 600:'#3B7C76', 700:'#31655F', 800:'#28514D', 900:'#20403D' };
                                        /* white on 600 4.9:1 */
  var blush  = { 50:'#FCEFF0', 100:'#F8DFE1', 200:'#F1C4C8', 300:'#E5A0A7',
                 400:'#D27E87', 500:'#B5555F', 600:'#A44E58', 700:'#873F48', 800:'#6E333A', 900:'#58292F' };
                                        /* 500 on white 4.6:1 · white on 600 5.5:1 */
  /* Butter runs darker than the other 600s on purpose: amber is the one hue
     where a pastel fill cannot carry a white label at AA. */
  var butter = { 50:'#FDF6EA', 100:'#FAEDD4', 200:'#F4DBA9', 300:'#E9C277',
                 400:'#D8A752', 500:'#B08442', 600:'#8A6737', 700:'#71542D', 800:'#5C4525', 900:'#4A381E' };

  var PALETTE = {
    sage: sage, ash: ash, sky: sky, lilac: lilac, aqua: aqua, blush: blush, butter: butter,

    /* Surfaces. The page ground is a very low-saturation three-stop wash —
       enough to feel warm, far too faint to fight the content on top. */
    surface: {
      page:     '#F7FAF8',
      wash:     'linear-gradient(155deg,#F2F8F4 0%,#FAF8F4 48%,#F1F5FC 100%)',
      card:     '#FFFFFF',
      soft:     '#F1F7F3',
      sunken:   '#EDF3EF',
      border:   '#DDEAE2',
      borderStrong: '#C9DBD1',
      ink:      '#22322A',
      ink2:     '#46574F',
      ink3:     '#63796D'
    },

    font: {
      body: "'Outfit',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      display: "'Playfair Display',Georgia,serif",
      mono: "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace"
    }
  };

  /* The standard Tailwind scales every bundled page draws from, remapped onto
     the pastels above. Hues that carry meaning stay distinguishable — an error
     is still red-ish, a warning still amber-ish — they are just quieter. */
  PALETTE.tailwindColors = {
    gray: ash, slate: ash, zinc: ash, neutral: ash, stone: ash,
    green: sage, emerald: sage, lime: sage,
    blue: sky, indigo: lilac, violet: lilac, purple: lilac, fuchsia: lilac,
    teal: aqua, cyan: aqua,
    red: blush, rose: blush, pink: blush,
    amber: butter, yellow: butter, orange: butter
  };

  /* The named colours the individual pages invented for themselves. Left
     unmapped they would be the only saturated things on the screen. */
  PALETTE.legacyAliases = {
    fbblue: sky[600], fbblue2: sky[700], fbblue3: sky[50],
    fbbg: ash[100], fbcard: '#FFFFFF',
    fbtext: PALETTE.surface.ink, fbsub: ash[600], fbsub2: ash[500],
    fbline: ash[300], fbline2: ash[200], fbhover: ash[100],
    fbgreen: sage[500], fbgreen2: sage[600],
    fbyellow: butter[400], fborange: butter[500],
    fbred: blush[500], fbred2: blush[600],
    fbpurple: lilac[500],

    brand: sky[600], section: lilac[600], tablehd: sage[500], lime: sage[300],
    cho: sage[600], pro: sky[600], fat: butter[600], ink: PALETTE.surface.ink
  };

  root.GTPalette = PALETTE;

  if (typeof module !== 'undefined' && module.exports) module.exports = PALETTE;
})(typeof window !== 'undefined' ? window : globalThis);
