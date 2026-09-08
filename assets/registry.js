/*!
 * GT Meal Plan System — application registry
 * ------------------------------------------------------------------
 * Single source of truth for every subsystem bundled in this portal.
 * Consumed by both the hub (index.html) and the cross-app switcher
 * (assets/gt-switcher.js), so a tool only ever has to be described once.
 *
 * Adding a subsystem:
 *   1. Drop its files under apps/<slug>/
 *   2. Append an entry below
 *   3. Run scripts/inject-nav.sh to wire the switcher into the new pages
 */
(function (root) {
  'use strict';

  // Function-oriented groupings. Order here is the order shown in the UI.
  var CATEGORIES = [
    { id: 'assessment', name: 'Assessment',        blurb: 'Measure, screen and quantify before planning.' },
    { id: 'planning',   name: 'Plan Generation',   blurb: 'Turn assessment data into a client-ready plan.' },
    { id: 'menus',      name: 'Menus & Scheduling',blurb: 'Day-by-day menus and calendar delivery.' },
    { id: 'specialist', name: 'Specialist Care',   blurb: 'Protocols for paediatric and critical care.' },
    { id: 'practice',   name: 'Practice',          blurb: 'The public face of the practice.' }
  ];

  // Provenance: which upstream repository each tool was bundled from.
  var SOURCES = {
    'about-dietitian':              'GT-Nutri-Life/About-Dietitian',
    'bmi-assessment':               'AshenWijesingha/BMI-Assessment',
    'dietary-nutrition-assessment': 'AshenWijesingha/Dietary-Nutrition-Assessment',
    'meal-plan-generator':          'AshenWijesingha/Meal-Plan-Generator',
    'diet-plan-generator':          'AshenWijesingha/Diet-Plan-Generator',
    'diet-plan-calendar-generator': 'AshenWijesingha/Diet-Plan-Calendar-Generator'
  };

  /* Icons are inline SVG path data (24x24 grid, stroke-based) so they render
     identically everywhere without an icon font or network request. */
  var ICONS = {
    gauge:    '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-3"/><path d="M12 5V3"/>',
    exchange: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
    plan:     '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 10h8M8 14h5"/>',
    doc:      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h6"/>',
    form:     '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    menu:     '<path d="M5 5h14v14H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    baby:     '<circle cx="12" cy="9" r="5"/><path d="M9 8.5h.01M15 8.5h.01M10 12c1.2 1 2.8 1 4 0"/><path d="M5 21c1.5-3 4-4.5 7-4.5S17.5 18 19 21"/>',
    pulse:    '<path d="M3 12h4l2.5-7 4 14L16 12h5"/>',
    person:   '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'
  };

  /*
   * Each tool is one navigable page.
   *   id       stable key, also used for the "you are here" highlight
   *   path     relative to the portal root (no leading slash)
   *   system   human name of the parent project
   *   source   upstream repo slug (key of SOURCES)
   *   tags     extra search terms; name/summary are searched automatically
   */
  var TOOLS = [
    {
      id: 'bmi-assessment',
      name: 'BMI Assessment',
      system: 'BMI Assessment',
      source: 'bmi-assessment',
      category: 'assessment',
      path: 'apps/bmi-assessment/index.html',
      icon: 'gauge',
      summary: 'Body mass index, healthy weight range, BMR and daily energy needs.',
      detail: 'Accepts cm, m, inches or feet-and-inches and kg, g, pounds or stone. Reports BMI with category, healthy weight range, basal metabolic rate (Mifflin–St Jeor), energy requirement by activity level, waist-to-height ratio, body surface area and ideal body weight.',
      tags: ['bmi', 'bmr', 'mifflin', 'energy', 'calorie', 'waist', 'body surface area', 'ideal body weight', 'screening']
    },
    {
      id: 'dietary-nutrition-assessment',
      name: 'Dietary Nutrition Assessment',
      system: 'Dietary Nutrition Assessment',
      source: 'dietary-nutrition-assessment',
      category: 'assessment',
      path: 'apps/dietary-nutrition-assessment/index.html',
      icon: 'exchange',
      summary: 'Food exchange calculator built on the Sri Lankan T2DM exchange list.',
      detail: 'Converts a prescribed energy allowance into food exchanges across the Sri Lankan Type 2 Diabetes Mellitus exchange groups, with the macronutrient split shown alongside.',
      tags: ['exchange', 'diabetes', 't2dm', 'sri lanka', 'macronutrient', 'carbohydrate', 'portion']
    },
    {
      id: 'meal-plan-generator',
      name: 'Meal Plan Generator',
      system: 'Meal Plan Generator',
      source: 'meal-plan-generator',
      category: 'planning',
      path: 'apps/meal-plan-generator/index.html',
      icon: 'plan',
      summary: 'The flagship five-step generator with branded PDF output.',
      detail: 'Guided five-step intake covering client details, anthropometry, clinical history, preferences and meal structure, ending in a print-ready PDF on the practice letterhead.',
      primary: true,
      tags: ['pdf', 'letterhead', 'client', 'intake', 'flagship', 'wizard']
    },
    {
      id: 'meal-plan-generator-docx',
      name: 'Meal Plan Generator — Word export',
      system: 'Meal Plan Generator',
      source: 'meal-plan-generator',
      category: 'planning',
      path: 'apps/meal-plan-generator/main.html',
      icon: 'doc',
      summary: 'The same generator with an editable .docx export path.',
      detail: 'Identical intake flow to the flagship generator, plus Word (.docx) export so a plan can be edited after generation. Use this when the plan needs manual adjustment before it reaches the client.',
      tags: ['docx', 'word', 'editable', 'export', 'office']
    },
    {
      id: 'diet-plan-generator',
      name: 'Diet Plan Generator',
      system: 'Diet Plan Generator',
      source: 'diet-plan-generator',
      category: 'planning',
      path: 'apps/diet-plan-generator/index.html',
      icon: 'form',
      summary: 'Client information-gathering form that feeds the diet plan.',
      detail: 'The GT Nutri Life intake form. Collects lifestyle, medical and dietary preference data as the starting point for a personalised plan.',
      tags: ['intake', 'form', 'information gathering', 'client', 'questionnaire', 'onboarding']
    },
    {
      id: 'diet-plan-calendar-generator',
      name: 'Diet Plan Calendar Generator',
      system: 'Diet Plan Calendar Generator',
      source: 'diet-plan-calendar-generator',
      category: 'planning',
      path: 'apps/diet-plan-calendar-generator/index.html',
      icon: 'calendar',
      summary: 'Schedules a plan and exports it to any calendar as .ics.',
      detail: 'Builds a meal schedule and exports standards-compliant .ics files, so meals land as reminders in Google Calendar, Apple Calendar or Outlook. Includes templates and PDF export.',
      tags: ['ics', 'calendar', 'sync', 'google calendar', 'outlook', 'apple', 'reminder', 'schedule', 'pdf']
    },
    {
      id: 'dpg-7-day-menu',
      name: '7-Day Diet Menu Planner',
      system: 'Diet Plan Generator',
      source: 'diet-plan-generator',
      category: 'menus',
      path: 'apps/diet-plan-generator/7-day-menu.html',
      icon: 'menu',
      summary: 'A full week of menus in the GT Nutri Life house style.',
      detail: 'Lays out a seven-day menu for a client, matching the branding used across the practice’s written plans.',
      tags: ['7 day', 'weekly', 'menu', 'week']
    },
    {
      id: 'dpcg-7-day-menu',
      name: '7-Day Menu — multiple options',
      system: 'Diet Plan Calendar Generator',
      source: 'diet-plan-calendar-generator',
      category: 'menus',
      path: 'apps/diet-plan-calendar-generator/7day-diet-menu.html',
      icon: 'menu',
      summary: 'A week of menus offering several choices per meal.',
      detail: 'Builds a seven-day plan where each meal carries multiple interchangeable options, giving clients variety without leaving the prescription.',
      tags: ['7 day', 'weekly', 'options', 'variety', 'choice', 'alternatives']
    },
    {
      id: 'babies',
      name: 'Baby Growth & Feeding Plan',
      system: 'Meal Plan Generator',
      source: 'meal-plan-generator',
      category: 'specialist',
      path: 'apps/meal-plan-generator/babies.html',
      icon: 'baby',
      summary: 'Growth tracking and feeding plans for infants under two.',
      detail: 'Paediatric feeding planner for children under two years, covering growth monitoring alongside age-appropriate feeding guidance and weaning stages.',
      tags: ['baby', 'infant', 'paediatric', 'pediatric', 'weaning', 'growth', 'under 2', 'child']
    },
    {
      id: 'icu',
      name: 'ICU NutriPlan',
      system: 'Meal Plan Generator',
      source: 'meal-plan-generator',
      category: 'specialist',
      path: 'apps/meal-plan-generator/icu.html',
      icon: 'pulse',
      summary: 'Critical care nutrition planning for ICU patients.',
      detail: 'Diet plan generator for the intensive care setting, sized for critically ill patients where requirements and delivery route differ from outpatient practice.',
      tags: ['icu', 'critical care', 'intensive care', 'enteral', 'hospital', 'inpatient', 'acute']
    },
    {
      id: 'about-dietitian',
      name: 'About the Dietitian',
      system: 'About Dietitian',
      source: 'about-dietitian',
      category: 'practice',
      path: 'apps/about-dietitian/index.html',
      icon: 'person',
      summary: 'Profile and practice site for Gayathri Thakshila Dissanayaka.',
      detail: 'The public-facing profile covering medical nutrition therapy, clinical diet planning and community health education, with contact routes for new clients.',
      tags: ['profile', 'gayathri', 'dissanayaka', 'contact', 'about', 'bio', 'practice', 'credentials']
    }
  ];

  root.GTRegistry = {
    categories: CATEGORIES,
    sources: SOURCES,
    icons: ICONS,
    tools: TOOLS,

    /** Tools belonging to a category id, in registry order. */
    byCategory: function (id) {
      return TOOLS.filter(function (t) { return t.category === id; });
    },

    /** Look up a tool by its id. */
    get: function (id) {
      for (var i = 0; i < TOOLS.length; i++) {
        if (TOOLS[i].id === id) return TOOLS[i];
      }
      return null;
    },

    /** Upstream GitHub URL for a tool, for provenance links. */
    repoUrl: function (tool) {
      return 'https://github.com/' + SOURCES[tool.source];
    },

    /**
     * Free-text search over name, system, summary and tags.
     * Returns every tool when the query is blank.
     */
    search: function (query) {
      var q = String(query || '').trim().toLowerCase();
      if (!q) return TOOLS.slice();
      var terms = q.split(/\s+/);
      return TOOLS.filter(function (t) {
        var hay = (t.name + ' ' + t.system + ' ' + t.summary + ' ' +
                   (t.detail || '') + ' ' + (t.tags || []).join(' ')).toLowerCase();
        return terms.every(function (term) { return hay.indexOf(term) !== -1; });
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
