/*!
 * GT Meal Plan System — pastel palette for the Tailwind pages
 * ------------------------------------------------------------------
 * Nine of the eleven bundled pages style themselves with the Tailwind Play
 * CDN, which reads `tailwind.config` at runtime. That gives us one lever that
 * reaches every utility class on those pages at once: remap the colour scales
 * and `text-gray-700`, `bg-blue-50`, `border-teal-600` and the ~1,400 other
 * colour utilities in this bundle all turn pastel together, with no per-page
 * edits and nothing for a future upstream sync to clobber.
 *
 * Two of those pages already ship a `tailwind.config` of their own, naming
 * colours the rest of their markup depends on (fbblue, brand, tablehd…).
 * Assigning over the top would break them, so this merges: their keys survive,
 * their named colours are re-pointed at pastel equivalents, and the standard
 * scales are replaced wholesale.
 *
 * Load order matters. This must run after the CDN script has defined the
 * `tailwind` global; the Play CDN re-renders when `tailwind.config` is
 * assigned, so a later assignment is picked up rather than ignored.
 */
(function (root) {
  'use strict';

  var P = root.GTPalette;
  if (!P) return;                        // palette missing: leave the page alone

  /** Merge `src` into `dst` one level deeper than Object.assign, so that a
   *  page's own `theme.extend.fontFamily` survives our `theme.extend.colors`. */
  function merge(dst, src) {
    Object.keys(src).forEach(function (k) {
      var a = dst[k], b = src[k];
      if (a && b && typeof a === 'object' && typeof b === 'object' &&
          !Array.isArray(a) && !Array.isArray(b)) merge(a, b);
      else dst[k] = b;
    });
    return dst;
  }

  function pastelConfig(existing) {
    var cfg = existing && typeof existing === 'object' ? existing : {};
    cfg.theme = cfg.theme || {};
    cfg.theme.extend = cfg.theme.extend || {};

    // The standard scales, replaced outright. Assigned per-scale rather than
    // through merge() so a page cannot leave a stray saturated step behind.
    var colors = cfg.theme.extend.colors = cfg.theme.extend.colors || {};
    Object.keys(P.tailwindColors).forEach(function (name) {
      colors[name] = P.tailwindColors[name];
    });

    // The names individual pages invented, re-pointed. Only overwrite a key the
    // page actually defined, so we never invent colours it does not use.
    Object.keys(P.legacyAliases).forEach(function (name) {
      if (name in colors) colors[name] = P.legacyAliases[name];
    });

    // The house accent, available to the shared chrome and to any page that
    // wants it by name.
    colors.gt = P.sage;
    colors.gtash = P.ash;

    merge(cfg.theme.extend, {
      fontFamily: { sans: ['Outfit', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { DEFAULT: '10px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px' },
      boxShadow: {
        sm: '0 1px 2px rgba(34,50,42,.05)',
        DEFAULT: '0 2px 8px rgba(34,50,42,.06)',
        md: '0 6px 20px rgba(34,50,42,.07)',
        lg: '0 14px 40px rgba(34,50,42,.09)',
        xl: '0 24px 60px rgba(34,50,42,.11)'
      }
    });

    return cfg;
  }

  function apply() {
    if (!root.tailwind) return false;
    try {
      root.tailwind.config = pastelConfig(root.tailwind.config);
    } catch (e) { return false; }
    return true;
  }

  if (!apply()) {
    // The CDN script is async or still in flight. Poll briefly rather than
    // racing it — a page that never loads Tailwind simply times out here and
    // keeps whatever styling it already had.
    var tries = 0;
    var t = setInterval(function () {
      if (apply() || ++tries > 120) clearInterval(t);
    }, 25);
  }
})(typeof window !== 'undefined' ? window : globalThis);
