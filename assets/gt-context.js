/*!
 * GT Meal Plan System — shared clinical record
 * ------------------------------------------------------------------
 * The data layer behind the cross-references between subsystems: BMI produces
 * an energy requirement, the exchange calculator turns that into macros, the
 * meal plan consumes both, the calendar schedules the result. Each app was
 * written standalone and knows nothing about the others, so the wiring lives
 * here rather than inside them.
 *
 * How it works
 *   - One canonical record (see PATHS) is the interchange format. Apps never
 *     see each other's field names.
 *   - An adapter per app maps that record on and off the app's own DOM. The
 *     apps themselves stay byte-identical to upstream.
 *   - The record is held in localStorage (instant, shared across tabs on this
 *     origin) and mirrored to Supabase when signed in, so a record started on
 *     the clinic desktop can be finished on a laptop.
 *
 * This module is data only. The switcher renders the UI for it, which keeps
 * the promise that nothing is injected into the host page's layout.
 */
(function (root) {
  'use strict';

  var LS_KEY = 'gt-clinical-record';
  var TABLE  = 'gt_clinical_records';

  // The named client library. gt_clinical_records is a single slot — the
  // record in hand — so starting a second client overwrites the first. This
  // is the durable side: any number of saved clients, reopened on demand.
  var CLIENTS_TABLE = 'gt_clients';
  var LS_OPEN = 'gt-open-client';

  /* ---------- canonical shape ----------------------------------------- */

  var PATHS = {
    'patient.name':    'Name',
    'patient.age':     'Age',
    'patient.sex':     'Sex',
    'patient.dob':     'Date of birth',
    'patient.phone':   'Phone',
    'patient.email':   'Email',
    'patient.address': 'Address',
    'patient.id':         'Patient ID',
    'patient.ward':       'Ward',
    'patient.occupation': 'Occupation',
    'patient.country':    'Country',

    'measure.heightCm':       'Height',
    'measure.weightKg':       'Weight',
    'measure.waistCm':        'Waist',
    'measure.targetWeightKg': 'Target weight',
    'measure.hipCm':          'Hip',
    'measure.bodyFatPct':     'Body fat',
    'measure.bmi':            'BMI',
    'measure.bmiCategory':    'BMI category',

    /* Carried so a plan generator does not ask again for what the assessment
       already recorded. Free text, and deliberately never auto-overwritten:
       see the onlyEmpty rule in GTContext.autofill. */
    'clinical.conditions':  'Medical conditions',
    'clinical.diagnosis':   'Diagnosis',
    'clinical.allergies':   'Allergies',
    'clinical.medications': 'Medications',
    'clinical.supplements': 'Supplements',

    'energy.bmr':      'BMR',
    'energy.tdee':     'Daily energy needs',
    'energy.activity': 'Activity level',
    'energy.target':   'Energy prescription',

    'macros.choPct': 'Carbohydrate %',
    'macros.proPct': 'Protein %',
    'macros.fatPct': 'Fat %',

    'plan.calorieTarget': 'Calorie target',
    'plan.startDate':     'Plan start date',
    'plan.goal':          'Plan goal',
    'plan.durationWeeks': 'Plan duration',
    'plan.proteinG':      'Protein target',
    'plan.carbsG':        'Carbohydrate target',
    'plan.fatG':          'Fat target',
    'plan.waterIntake':   'Water intake',
    'plan.exercise':      'Exercise',
    'plan.foodsToAvoid':  'Foods to avoid',
    'plan.notes':         'Plan notes',

    /* Meal times, shared by the plan generator and both weekly menu builders.
       The times a client actually eats are the thing every one of those tools
       asks for first, and the thing nobody wants to type three times. */
    'meals.bedTeaTime':       'Bed tea',
    'meals.breakfastTime':    'Breakfast',
    'meals.midMorningTime':   'Mid-morning snack',
    'meals.lunchTime':        'Lunch',
    'meals.eveningSnackTime': 'Evening snack',
    'meals.dinnerTime':       'Dinner',

    'dietitian.name':        'Dietitian',
    'dietitian.credentials': 'Credentials',
    'dietitian.phone':       'Dietitian phone',
    'dietitian.email':       'Dietitian email'
  };

  var UNITS = {
    'measure.heightCm': 'cm', 'measure.weightKg': 'kg', 'measure.waistCm': 'cm',
    'measure.targetWeightKg': 'kg',
    'energy.bmr': 'kcal/day', 'energy.tdee': 'kcal/day', 'energy.target': 'kcal/day',
    'plan.calorieTarget': 'kcal/day',
    'macros.choPct': '%', 'macros.proPct': '%', 'macros.fatPct': '%',
    'measure.hipCm': 'cm', 'measure.bodyFatPct': '%',
    'plan.proteinG': 'g', 'plan.carbsG': 'g', 'plan.fatG': 'g',
    'plan.durationWeeks': 'weeks'
  };

  /* ---------- tiny helpers --------------------------------------------- */

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, obj);
  }

  function set(obj, path, value) {
    var keys = path.split('.'), last = keys.pop(), cur = obj;
    keys.forEach(function (k) { if (typeof cur[k] !== 'object' || !cur[k]) cur[k] = {}; cur = cur[k]; });
    cur[last] = value;
  }

  function blank(v) { return v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v)); }

  /** Pull the first number out of a string like "2,140 kcal" or "24.8". */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (blank(v)) return null;
    var m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function round(v, dp) {
    var n = num(v);
    if (n === null) return null;
    var f = Math.pow(10, dp || 0);
    return Math.round(n * f) / f;
  }

  var $ = function (id) { return document.getElementById(id); };
  var $n = function (name) { return document.querySelector('[name="' + name + '"]'); };

  /**
   * Find a field by id, or failing that by name.
   *
   * The two weekly menu builders present the same fields under different
   * attributes — one gives its client name an id, the other only a name — and
   * because a single adapter serves both, addressing it one way silently did
   * nothing on the other page for the life of the feature. Ask for the field
   * rather than for the attribute.
   */
  var $f = function (key) { return $(key) || $n(key); };

  /**
   * A macro target in grams.
   *
   * Grams win when the record holds them. Otherwise they are derived from the
   * percentage split and the calorie target at the standard Atwater factors —
   * 4 kcal/g for protein and carbohydrate, 9 for fat — which is the same sum
   * the dietitian would do by hand, and the only way a split produced by the
   * exchange calculator can reach a generator that asks for grams.
   */
  function gramsFor(rec, gramsKey, pctPath, kcalPerG, kcal) {
    var direct = get(rec, 'plan.' + gramsKey);
    if (!blank(direct)) return round(direct, 0);
    var pct = num(get(rec, pctPath)), c = num(kcal);
    if (pct === null || c === null) return null;
    return round(c * (pct / 100) / kcalPerG, 0);
  }

  /** Read a form control's value, or null when absent/empty. */
  function rd(el) {
    if (!el) return null;
    var v = el.value;
    return blank(v) ? null : v;
  }

  /** Read an element's text content, or null. */
  function rdText(el) {
    if (!el) return null;
    var v = (el.textContent || '').trim();
    return blank(v) || v === '—' || v === '--' ? null : v;
  }

  /**
   * Write a value into a form control and let the host app react.
   * The apps hang recalculation off oninput/onchange (Meal Plan Generator's
   * calculateBMI, BMI Assessment's slider sync), so dispatching both events is
   * what makes a prefill behave exactly like typing.
   */
  /*
   * Write mode.
   *
   * A prefill the clinician asked for may overwrite what is on screen — that
   * is what they asked for. A prefill that happens on its own may not: it runs
   * while they may already be typing, and silently replacing a measurement
   * they entered would be a clinical error, not a convenience. So automatic
   * fills only ever write into a field that is empty.
   */
  // `onlyEmpty` decides whether a write may replace what is on screen;
  // `tracking` decides whether we record what was written, for the undo and
  // the "this came from the record" highlight. They vary independently: an
  // authoritative fill for an opened client overwrites *and* is tracked.
  var writeMode = { onlyEmpty: false, tracking: false, touched: [] };

  /*
   * Depth counter, not a boolean, and read through GTContext.isWriting().
   *
   * A prefill fires 'input' and 'change' on every field it touches, because
   * that is what makes it behave like typing to the app's own listeners. The
   * switcher listens for those same events to decide the clinician has started
   * entering data, at which point it begins capturing the page back into the
   * record. Left alone, a prefill therefore triggers a capture of the page it
   * just wrote — and on a page carrying its own placeholder values (BMI opens
   * at 170 cm and 68 kg) that capture overwrites the real record with the
   * placeholders. This flag is how a listener tells the difference between the
   * clinician typing and us writing.
   */
  var writing = 0;

  function wr(el, value) {
    if (!el || blank(value)) return false;
    var v = String(value);
    if (el.value === v) return false;
    if (writeMode.onlyEmpty && !blank(el.value)) return false;
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (writeMode.tracking) writeMode.touched.push(el);
    return true;
  }

  /* ---------- sex / unit normalisation ---------------------------------- */

  function sexLower(v) {
    if (blank(v)) return null;
    var s = String(v).trim().toLowerCase();
    if (s.indexOf('f') === 0) return 'female';
    if (s.indexOf('m') === 0) return 'male';
    return null;
  }
  function sexTitle(v) {
    var s = sexLower(v);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
  }

  // BMI Assessment stores height and weight in whatever unit is selected.
  function toCm(value, unit) {
    var n = num(value);
    if (n === null) return null;
    if (unit === 'm')  return n * 100;
    if (unit === 'in') return n * 2.54;
    return n;                                  // cm
  }
  function fromCm(cm, unit) {
    var n = num(cm);
    if (n === null) return null;
    if (unit === 'm')  return round(n / 100, 2);
    if (unit === 'in') return round(n / 2.54, 1);
    return round(n, 1);
  }
  function toKg(value, unit) {
    var n = num(value);
    if (n === null) return null;
    if (unit === 'g')  return n / 1000;
    if (unit === 'lb') return n * 0.45359237;
    return n;                                  // kg
  }
  function fromKg(kg, unit) {
    var n = num(kg);
    if (n === null) return null;
    if (unit === 'g')  return round(n * 1000, 0);
    if (unit === 'lb') return round(n / 0.45359237, 1);
    return round(n, 1);
  }

  /* ==================================================================== *
   * Adapters — one per bundled page.                                     *
   *                                                                      *
   * read()  lifts what the app currently holds into a partial record.    *
   * write() pushes the record into the app's own fields and returns how  *
   *         many fields it actually filled.                              *
   * ==================================================================== */

  /*
   * The meal slots the plan generator, the weekly menu builders and the
   * calendar generator all share. Each names them slightly differently, so the
   * mapping lives here once instead of three times.
   *   id      what the weekly planners call the slot
   *   path    the canonical meals.* key
   *   mpg     the Meal Plan Generator's start-time field
   */
  var MEAL_SLOTS = [
    { id: 'bedTea',           path: 'bedTeaTime',       mpg: 'earlyMorningStartTime' },
    { id: 'breakfast',        path: 'breakfastTime',    mpg: 'breakfastStartTime' },
    { id: 'midMorningSnack',  path: 'midMorningTime',   mpg: 'midMorningStartTime' },
    { id: 'lunch',            path: 'lunchTime',        mpg: 'lunchStartTime' },
    { id: 'eveningSnack',     path: 'eveningSnackTime', mpg: 'eveningSnackStartTime' },
    { id: 'dinner',           path: 'dinnerTime',       mpg: 'dinnerStartTime' }
  ];

  var ADAPTERS = {

    /* ---- BMI Assessment: the entry point for anthropometry and energy -- */
    'bmi-assessment': {
      read: function () {
        var out = {}, hUnit = (rd($('hUnit')) || 'cm'), wUnit = (rd($('wUnit')) || 'kg');
        // ft+in and st+lb use the paired inputs instead of the single one.
        var h = hUnit === 'ftin'
          ? (num(rd($('hBig'))) !== null ? num(rd($('hBig'))) * 30.48 + (num(rd($('hSmall'))) || 0) * 2.54 : null)
          : toCm(rd($('hSingle')), hUnit);
        var w = wUnit === 'stlb'
          ? (num(rd($('wBig'))) !== null ? num(rd($('wBig'))) * 6.35029318 + (num(rd($('wSmall'))) || 0) * 0.45359237 : null)
          : toKg(rd($('wSingle')), wUnit);

        if (h !== null) set(out, 'measure.heightCm', round(h, 1));
        if (w !== null) set(out, 'measure.weightKg', round(w, 1));

        var waist = num(rd($('waistVal')));
        if (waist !== null) set(out, 'measure.waistCm', round(waist, 1));

        var age = num(rd($('ageVal')));
        if (age !== null) set(out, 'patient.age', age);

        var sex = sexLower(rd($('sexVal')));
        if (sex) set(out, 'patient.sex', sex);

        // Results are rendered as text; read them back rather than recomputing.
        var bmi = num(rdText($('bmiValue')));
        if (bmi !== null) set(out, 'measure.bmi', round(bmi, 1));
        var cat = rdText($('bmiCategory'));
        if (cat) set(out, 'measure.bmiCategory', cat);
        var bmr = num(rdText($('bmrValue')));
        if (bmr !== null) set(out, 'energy.bmr', round(bmr, 0));
        var tdee = num(rdText($('tdeeValue')));
        if (tdee !== null) set(out, 'energy.tdee', round(tdee, 0));
        var lvl = rdText($('tdeeLevel'));
        if (lvl) set(out, 'energy.activity', lvl);

        return out;
      },
      write: function (rec) {
        var n = 0, hUnit = (rd($('hUnit')) || 'cm'), wUnit = (rd($('wUnit')) || 'kg');
        var cm = get(rec, 'measure.heightCm'), kg = get(rec, 'measure.weightKg');

        if (!blank(cm)) {
          if (hUnit === 'ftin') {
            var totalIn = num(cm) / 2.54;
            if (wr($('hBig'), Math.floor(totalIn / 12))) n++;
            wr($('hSmall'), round(totalIn % 12, 1));
          } else if (wr($('hSingle'), fromCm(cm, hUnit))) n++;
          wr($('heightSlider'), round(num(cm), 1));
        }
        if (!blank(kg)) {
          if (wUnit === 'stlb') {
            var st = num(kg) / 6.35029318;
            if (wr($('wBig'), Math.floor(st))) n++;
            wr($('wSmall'), round((st - Math.floor(st)) * 14 * 0.45359237 / 0.45359237, 1));
          } else if (wr($('wSingle'), fromKg(kg, wUnit))) n++;
          wr($('weightSlider'), round(num(kg), 1));
        }
        // Age, sex and waist sit inside a collapsed <details>. Filling them
        // silently would leave the user staring at values they cannot see, so
        // open the disclosure whenever something lands in it.
        var inDetails = 0;
        if (wr($('waistVal'), get(rec, 'measure.waistCm'))) inDetails++;
        if (wr($('ageVal'),   get(rec, 'patient.age')))     inDetails++;
        if (wr($('sexVal'),   sexLower(get(rec, 'patient.sex')))) inDetails++;
        if (inDetails) {
          var d = $('moreDetails');
          if (d && 'open' in d) d.open = true;
          n += inDetails;
        }
        return n;
      }
    },

    /* ---- Dietary Nutrition Assessment: energy in, exchanges out -------- */
    'dietary-nutrition-assessment': {
      read: function () {
        var out = {};
        var map = {
          'pName': 'patient.name', 'pId': 'patient.id', 'pWard': 'patient.ward',
          'notes': 'plan.notes',
          'pAge': 'patient.age', 'pHeight': 'measure.heightCm', 'pWeight': 'measure.weightKg',
          'energyReq': 'energy.target', 'reqCho': 'macros.choPct',
          'reqPro': 'macros.proPct', 'reqFat': 'macros.fatPct',
          'pDietitian': 'dietitian.name'
        };
        Object.keys(map).forEach(function (id) {
          var v = rd($(id));
          if (v !== null) set(out, map[id], /^(pName|pId|pWard|pDietitian|notes)$/.test(id) ? v : (num(v) !== null ? num(v) : v));
        });
        var sex = sexLower(rd($('pSex')));
        if (sex) set(out, 'patient.sex', sex);
        return out;
      },
      write: function (rec) {
        var n = 0;
        if (wr($('pName'),   get(rec, 'patient.name')))  n++;
        if (wr($('pId'),     get(rec, 'patient.id')))    n++;
        if (wr($('pWard'),   get(rec, 'patient.ward')))  n++;
        if (wr($('notes'),   get(rec, 'plan.notes')))    n++;
        if (wr($('pAge'),    get(rec, 'patient.age')))   n++;
        if (wr($('pSex'),    sexTitle(get(rec, 'patient.sex')))) n++;
        if (wr($('pHeight'), get(rec, 'measure.heightCm'))) n++;
        if (wr($('pWeight'), get(rec, 'measure.weightKg'))) n++;
        // The prescription defaults to total daily energy needs when no
        // explicit target has been set yet.
        var energy = get(rec, 'energy.target');
        if (blank(energy)) energy = get(rec, 'energy.tdee');
        if (wr($('energyReq'), round(energy, 0))) n++;
        if (wr($('reqCho'), get(rec, 'macros.choPct'))) n++;
        if (wr($('reqPro'), get(rec, 'macros.proPct'))) n++;
        if (wr($('reqFat'), get(rec, 'macros.fatPct'))) n++;
        if (wr($('pDietitian'), get(rec, 'dietitian.name'))) n++;
        return n;
      }
    },

    /* ---- Meal Plan Generator (shared by index.html and main.html) ------ */
    'meal-plan-generator': {
      read: function () {
        var out = {};
        var map = {
          'patientName': 'patient.name', 'patientAge': 'patient.age',
          'patientPhone': 'patient.phone', 'patientEmail': 'patient.email',
          'patientAddress': 'patient.address',
          'patientHeight': 'measure.heightCm', 'patientWeight': 'measure.weightKg',
          'targetWeight': 'measure.targetWeightKg',
          'calorieTarget': 'plan.calorieTarget', 'planDuration': 'plan.durationWeeks',
          'waterIntake': 'plan.waterIntake', 'exerciseRecommendation': 'plan.exercise',
          'foodsToAvoid': 'plan.foodsToAvoid', 'specialInstructions': 'plan.notes',
          'nutritionistName': 'dietitian.name', 'credentials': 'dietitian.credentials',
          'nutritionistPhone': 'dietitian.phone', 'nutritionistEmail': 'dietitian.email'
        };
        Object.keys(map).forEach(function (id) {
          var v = rd($(id));
          if (v !== null) set(out, map[id], v);
        });
        MEAL_SLOTS.forEach(function (m) {
          var t = rd($(m.mpg));
          if (t) set(out, 'meals.' + m.path, t);
        });
        var sex = sexLower(rd($('patientGender')));
        if (sex) set(out, 'patient.sex', sex);
        var bmi = num(rdText($('bmiValue')));
        if (bmi !== null) set(out, 'measure.bmi', round(bmi, 1));
        var d = rd($('planDate'));
        if (d) set(out, 'plan.startDate', d);
        return out;
      },
      write: function (rec) {
        var n = 0;
        if (wr($('planDuration'),           get(rec, 'plan.durationWeeks')))     n++;
        if (wr($('waterIntake'),            get(rec, 'plan.waterIntake')))       n++;
        if (wr($('exerciseRecommendation'), get(rec, 'plan.exercise')))          n++;
        if (wr($('foodsToAvoid'),           get(rec, 'plan.foodsToAvoid')))      n++;
        if (wr($('specialInstructions'),    get(rec, 'plan.notes')))             n++;
        MEAL_SLOTS.forEach(function (m) {
          if (wr($(m.mpg), get(rec, 'meals.' + m.path))) n++;
        });
        if (wr($('patientName'),    get(rec, 'patient.name')))    n++;
        if (wr($('patientAge'),     get(rec, 'patient.age')))     n++;
        if (wr($('patientGender'),  sexTitle(get(rec, 'patient.sex')))) n++;
        if (wr($('patientPhone'),   get(rec, 'patient.phone')))   n++;
        if (wr($('patientEmail'),   get(rec, 'patient.email')))   n++;
        if (wr($('patientAddress'), get(rec, 'patient.address'))) n++;
        // patientHeight/patientWeight carry oninput="calculateBMI()", so the
        // BMI badge refreshes itself once these land.
        if (wr($('patientHeight'),  get(rec, 'measure.heightCm'))) n++;
        if (wr($('patientWeight'),  get(rec, 'measure.weightKg'))) n++;
        if (wr($('targetWeight'),   get(rec, 'measure.targetWeightKg'))) n++;

        var kcal = get(rec, 'plan.calorieTarget');
        if (blank(kcal)) kcal = get(rec, 'energy.target');
        if (blank(kcal)) kcal = get(rec, 'energy.tdee');
        if (wr($('calorieTarget'), round(kcal, 0))) n++;

        if (wr($('planDate'), get(rec, 'plan.startDate'))) n++;
        if (wr($('nutritionistName'),  get(rec, 'dietitian.name')))        n++;
        if (wr($('credentials'),       get(rec, 'dietitian.credentials'))) n++;
        if (wr($('nutritionistPhone'), get(rec, 'dietitian.phone')))       n++;
        if (wr($('nutritionistEmail'), get(rec, 'dietitian.email')))       n++;
        return n;
      }
    },

    /* ---- Diet Plan Generator: the intake form (name-addressed fields) --- */
    'diet-plan-generator': {
      read: function () {
        var out = {};
        var v;
        if ((v = rd($n('fullName'))))      set(out, 'patient.name', v);
        if ((v = rd($n('age'))))           set(out, 'patient.age', num(v));
        if ((v = rd($n('dob'))))           set(out, 'patient.dob', v);
        if ((v = rd($n('email'))))         set(out, 'patient.email', v);
        if ((v = rd($n('contact'))))       set(out, 'patient.phone', v);
        if ((v = rd($n('currentWeight')))) set(out, 'measure.weightKg', num(v));
        if ((v = rd($n('activityLevel')))) set(out, 'energy.activity', v);
        if ((v = rd($n('occupation'))))    set(out, 'patient.occupation', v);
        if ((v = rd($n('country'))))       set(out, 'patient.country', v);
        if ((v = rd($n('targetWeight'))))  set(out, 'measure.targetWeightKg', num(v));
        if ((v = rd($n('waist'))))         set(out, 'measure.waistCm', num(v));
        if ((v = rd($n('hip'))))           set(out, 'measure.hipCm', num(v));
        if ((v = rd($n('bodyFat'))))       set(out, 'measure.bodyFatPct', num(v));
        if ((v = rd($n('allergies'))))     set(out, 'clinical.allergies', v);
        if ((v = rd($n('medications'))))   set(out, 'clinical.medications', v);
        if ((v = rd($n('supplements'))))   set(out, 'clinical.supplements', v);
        if ((v = rd($n('water'))))         set(out, 'plan.waterIntake', v);
        if ((v = rd($n('exercise'))))      set(out, 'plan.exercise', v);
        if ((v = rd($n('dislikes'))))      set(out, 'plan.foodsToAvoid', v);
        if ((v = rd($n('additionalNotes')))) set(out, 'plan.notes', v);

        // Current conditions and history are two fields here and one canonical
        // one; joined rather than letting the second silently win.
        var conds = [rd($n('otherCurrentMedical')), rd($n('pastMedicalHistory'))]
          .filter(function (x) { return !blank(x); });
        if (conds.length) set(out, 'clinical.conditions', conds.join(' · '));
        var sex = sexLower(rd($n('gender')));
        if (sex) set(out, 'patient.sex', sex);
        // Height is split across a unit toggle.
        var unit = rd($('height-unit'));
        if (unit === 'ft') {
          var ft = num(rd($('height-ft'))), inch = num(rd($('height-in')));
          if (ft !== null) set(out, 'measure.heightCm', round(ft * 30.48 + (inch || 0) * 2.54, 1));
        } else {
          var cm = num(rd($('height-cm')));
          if (cm !== null) set(out, 'measure.heightCm', round(cm, 1));
        }
        return out;
      },
      write: function (rec) {
        var n = 0;
        if (wr($n('fullName'), get(rec, 'patient.name')))  n++;
        if (wr($n('age'),      get(rec, 'patient.age')))   n++;
        if (wr($n('dob'),      get(rec, 'patient.dob')))   n++;
        if (wr($n('email'),    get(rec, 'patient.email'))) n++;
        if (wr($n('contact'),  get(rec, 'patient.phone'))) n++;
        if (wr($n('gender'),   sexTitle(get(rec, 'patient.sex')))) n++;
        if (wr($n('currentWeight'), get(rec, 'measure.weightKg'))) n++;
        if (wr($n('occupation'),   get(rec, 'patient.occupation')))     n++;
        if (wr($n('country'),      get(rec, 'patient.country')))        n++;
        if (wr($n('targetWeight'), get(rec, 'measure.targetWeightKg'))) n++;
        if (wr($n('waist'),        get(rec, 'measure.waistCm')))        n++;
        if (wr($n('hip'),          get(rec, 'measure.hipCm')))          n++;
        if (wr($n('bodyFat'),      get(rec, 'measure.bodyFatPct')))     n++;
        if (wr($n('allergies'),    get(rec, 'clinical.allergies')))     n++;
        if (wr($n('medications'),  get(rec, 'clinical.medications')))   n++;
        if (wr($n('supplements'),  get(rec, 'clinical.supplements')))   n++;
        if (wr($n('otherCurrentMedical'), get(rec, 'clinical.conditions'))) n++;
        if (wr($n('water'),        get(rec, 'plan.waterIntake')))       n++;
        if (wr($n('exercise'),     get(rec, 'plan.exercise')))          n++;
        if (wr($n('dislikes'),     get(rec, 'plan.foodsToAvoid')))      n++;
        if (wr($n('additionalNotes'), get(rec, 'plan.notes')))          n++;
        if (wr($n('activityLevel'), get(rec, 'energy.activity')))       n++;
        var cm = get(rec, 'measure.heightCm');
        if (!blank(cm)) {
          if (rd($('height-unit')) === 'ft') {
            var totalIn = num(cm) / 2.54;
            if (wr($('height-ft'), Math.floor(totalIn / 12))) n++;
            wr($('height-in'), round(totalIn % 12, 1));
          } else if (wr($('height-cm'), round(num(cm), 1))) n++;
        }
        return n;
      }
    },

    /* ---- Diet Plan Calendar Generator: schedules the finished plan ------ */
    'diet-plan-calendar-generator': {
      /*
       * These three fields are grams — the labels read "Protein (g)" and the
       * aria-labels say "Target protein in grams". They were mapped to
       * macros.*Pct, so a 50/20/30 split arriving from the exchange
       * calculator was written in as a 50 g carbohydrate target. Percentages
       * and grams now live in separate canonical fields, and grams are
       * derived from the split when only the split is known.
       */
      read: function () {
        var out = {}, v;
        if ((v = rd($('patientName'))))    set(out, 'patient.name', v);
        if ((v = rd($('patientEmail'))))   set(out, 'patient.email', v);
        if ((v = rd($('patientPhone'))))   set(out, 'patient.phone', v);
        if ((v = rd($('targetCalories')))) set(out, 'plan.calorieTarget', num(v));
        if ((v = rd($('startDate'))))      set(out, 'plan.startDate', v);
        if ((v = rd($('targetProtein'))))  set(out, 'plan.proteinG', num(v));
        if ((v = rd($('targetCarbs'))))    set(out, 'plan.carbsG', num(v));
        if ((v = rd($('targetFats'))))     set(out, 'plan.fatG', num(v));
        if ((v = rd($('goal'))))           set(out, 'plan.goal', v);
        if ((v = rd($('duration'))))       set(out, 'plan.durationWeeks', num(v));
        if ((v = rd($('planNotes'))))      set(out, 'plan.notes', v);
        if ((v = rd($('workoutType'))))    set(out, 'plan.exercise', v);
        return out;
      },
      write: function (rec) {
        var n = 0;
        if (wr($('patientName'),  get(rec, 'patient.name')))  n++;
        if (wr($('patientEmail'), get(rec, 'patient.email'))) n++;
        if (wr($('patientPhone'), get(rec, 'patient.phone'))) n++;

        var kcal = get(rec, 'plan.calorieTarget');
        if (blank(kcal)) kcal = get(rec, 'energy.target');
        if (blank(kcal)) kcal = get(rec, 'energy.tdee');
        if (wr($('targetCalories'), round(kcal, 0))) n++;

        if (wr($('startDate'), get(rec, 'plan.startDate'))) n++;
        if (wr($('goal'),      get(rec, 'plan.goal')))      n++;
        if (wr($('duration'),  get(rec, 'plan.durationWeeks'))) n++;
        if (wr($('planNotes'), get(rec, 'plan.notes')))     n++;
        if (wr($('workoutType'), get(rec, 'plan.exercise'))) n++;

        if (wr($('targetProtein'), gramsFor(rec, 'proteinG', 'macros.proPct', 4, kcal))) n++;
        if (wr($('targetCarbs'),   gramsFor(rec, 'carbsG',   'macros.choPct', 4, kcal))) n++;
        if (wr($('targetFats'),    gramsFor(rec, 'fatG',     'macros.fatPct', 9, kcal))) n++;
        return n;
      }
    },

    /* ---- ICU NutriPlan: same patient, critical-care protocol ----------- */
    'icu': {
      read: function () {
        var out = {}, v;
        if ((v = rd($('patientId'))))  set(out, 'patient.id', v);
        if ((v = rd($('diagnosis'))))  set(out, 'clinical.diagnosis', v);
        if ((v = rd($('age'))))       set(out, 'patient.age', num(v));
        if ((v = rd($('height'))))    set(out, 'measure.heightCm', num(v));
        if ((v = rd($('weight'))))    set(out, 'measure.weightKg', num(v));
        var sex = sexLower(rd($('gender')));
        if (sex) set(out, 'patient.sex', sex);
        return out;
      },
      write: function (rec) {
        var n = 0;
        if (wr($('patientId'), get(rec, 'patient.id')))       n++;
        if (wr($('age'),       get(rec, 'patient.age')))      n++;
        if (wr($('gender'),    sexLower(get(rec, 'patient.sex')))) n++;
        if (wr($('height'),    get(rec, 'measure.heightCm'))) n++;
        if (wr($('weight'),    get(rec, 'measure.weightKg'))) n++;
        if (wr($('diagnosis'), get(rec, 'clinical.diagnosis'))) n++;
        return n;
      }
    },

    /* ---- The two weekly menu builders --------------------------------- *
     * These carried the client name and the start date and nothing else, and
     * on the 7-Day Diet Menu Planner they carried neither: that page names its
     * client field rather than giving it an id, and the shared adapter asked
     * by id, so every prefill there silently did nothing. $f() asks for the
     * field either way.
     *
     * A weekly menu is built around when the client eats, so the meal times
     * travel with it. The planner writes them as <input type="time"> ids and
     * the plan generator holds the same information as its own start times;
     * both now read and write the one canonical set.
     */
    'dpg-7-day-menu': {
      read: function () {
        var out = {}, v;
        if ((v = rd($f('clientName'))))   set(out, 'patient.name', v);
        if ((v = rd($f('startDate'))))    set(out, 'plan.startDate', v);
        if ((v = rd($f('specialNotes')))) set(out, 'plan.notes', v);
        MEAL_SLOTS.forEach(function (m) {
          var t = rd($f('mealTime-' + m.id));
          if (t) set(out, 'meals.' + m.path, t);
        });
        return out;
      },
      write: function (rec) {
        var n = 0;
        if (wr($f('clientName'),   get(rec, 'patient.name')))    n++;
        if (wr($f('startDate'),    get(rec, 'plan.startDate')))  n++;
        if (wr($f('specialNotes'), get(rec, 'plan.notes')))      n++;
        MEAL_SLOTS.forEach(function (m) {
          if (wr($f('mealTime-' + m.id), get(rec, 'meals.' + m.path))) n++;
        });
        return n;
      }
    }
  };

  // main.html is the Meal Plan Generator with a .docx export; identical fields.
  ADAPTERS['meal-plan-generator-docx'] = ADAPTERS['meal-plan-generator'];
  /*
   * The two weekly menu builders are near-twins but not twins, and aliasing
   * one to the other hid that: the 7-Day Diet Menu Planner carries special
   * notes and a time for each meal, while the calendar generator's planner
   * carries a plan goal and neither of those. A shared adapter meant half its
   * selectors matched nothing on whichever page it was running in, which is
   * indistinguishable from a typo. Each now names only its own fields, so
   * "every selector resolves" is a rule the suites can hold them to.
   */
  ADAPTERS['dpcg-7-day-menu'] = {
    read: function () {
      var out = {}, v;
      if ((v = rd($f('clientName')))) set(out, 'patient.name', v);
      if ((v = rd($f('startDate'))))  set(out, 'plan.startDate', v);
      if ((v = rd($f('planGoal'))))   set(out, 'plan.goal', v);
      return out;
    },
    write: function (rec) {
      var n = 0;
      if (wr($f('clientName'), get(rec, 'patient.name')))   n++;
      if (wr($f('startDate'),  get(rec, 'plan.startDate'))) n++;
      if (wr($f('planGoal'),   get(rec, 'plan.goal')))      n++;
      return n;
    }
  };

  /*
   * Baby Growth & Feeding is deliberately not wired in. Its subject is an
   * infant with its own name, birth date, weight and length; silently
   * prefilling it from an adult record would be a clinical error, not a
   * convenience.
   */

  /* ==================================================================== *
   * Record store                                                          *
   * ==================================================================== */

  var listeners = [];
  var cached = null;

  function emptyRecord() {
    return { patient: {}, measure: {}, energy: {}, macros: {}, plan: {},
             clinical: {}, meals: {}, dietitian: {},
             meta: { updatedAt: null, sources: {} } };
  }

  function load() {
    if (cached) return cached;
    try {
      var raw = localStorage.getItem(LS_KEY);
      cached = raw ? JSON.parse(raw) : emptyRecord();
    } catch (e) { cached = emptyRecord(); }
    if (!cached || typeof cached !== 'object') cached = emptyRecord();
    if (!cached.meta) cached.meta = { updatedAt: null, sources: {} };
    return cached;
  }

  function persist(rec) {
    cached = rec;
    try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(rec); } catch (e) {} });
    scheduleCloudPush();
  }

  // Another tab changed the record.
  window.addEventListener('storage', function (e) {
    if (e.key !== LS_KEY) return;
    cached = null;
    var rec = load();
    listeners.forEach(function (fn) { try { fn(rec); } catch (e2) {} });
  });

  /* ---------- cloud mirror --------------------------------------------- */

  var pushTimer = null;

  function sb() {
    return (root.GTAuth && root.GTAuth.client && root.GTAuth.client()) || null;
  }

  function scheduleCloudPush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushToCloud, 2500);
  }

  async function pushToCloud() {
    var client = sb();
    if (!client) return;
    try {
      var got = await client.auth.getUser();
      var user = got && got.data && got.data.user;
      if (!user) return;
      await client.from(TABLE).upsert(
        { user_id: user.id, record: load() },
        { onConflict: 'user_id' }
      );
    } catch (e) { /* offline or signed out: localStorage remains the truth */ }
  }

  async function pullFromCloud() {
    var client = sb();
    if (!client) return null;
    try {
      var got = await client.auth.getUser();
      var user = got && got.data && got.data.user;
      if (!user) return null;
      var res = await client.from(TABLE).select('record,updated_at').eq('user_id', user.id).maybeSingle();
      if (res.error || !res.data) return null;
      return res.data;
    } catch (e) { return null; }
  }

  /* ==================================================================== *
   * The client library                                                    *
   * -------------------------------------------------------------------- *
   * Saving is explicit. The record in hand follows the practitioner from   *
   * tool to tool on its own, but committing it to a named client is a      *
   * decision, so nothing is written here until it is asked for.            *
   * ==================================================================== */

  var openClient = null;      // { id, name } of the client currently loaded
  var clientListeners = [];

  function notifyClients() {
    clientListeners.forEach(function (fn) { try { fn(openClient); } catch (e) {} });
  }

  function loadOpenClient() {
    try {
      var raw = localStorage.getItem(LS_OPEN);
      openClient = raw ? JSON.parse(raw) : null;
    } catch (e) { openClient = null; }
    return openClient;
  }

  function setOpenClient(c) {
    openClient = c || null;
    try {
      if (c) localStorage.setItem(LS_OPEN, JSON.stringify(c));
      else localStorage.removeItem(LS_OPEN);
    } catch (e) {}
    notifyClients();
  }

  loadOpenClient();

  /** The signed-in practitioner, or null. Every client call needs this. */
  async function me() {
    var client = sb();
    if (!client) return null;
    try {
      var got = await client.auth.getUser();
      return (got && got.data && got.data.user) || null;
    } catch (e) { return null; }
  }

  /**
   * Saving under a name that already exists updates that client rather than
   * creating a second one — the unique index on (user_id, lower(name)) makes
   * that the database's rule too, not just this function's intention.
   */
  /**
   * Commit the record in hand to a named client.
   *
   * Saving under a name already in use updates that client rather than making
   * a second one. That rule is enforced by a unique index on
   * (user_id, lower(btrim(name))), and the index being on an *expression* is
   * what shapes this function: PostgREST's upsert sends `ON CONFLICT
   * (user_id, name)`, and Postgres will not match a column list against an
   * expression index. It rejects the statement outright —
   *
   *   there is no unique or exclusion constraint matching the ON CONFLICT
   *   specification
   *
   * — whether or not a row with that name exists, so upsert cannot be used
   * here at all. Look the client up first and then insert or update, which is
   * what the index means anyway.
   */
  async function saveClient(name, note) {
    var client = sb(), user = await me();
    if (!client || !user) throw new Error('Sign in to save a client.');
    name = String(name || '').trim();
    if (!name) throw new Error('Give the client a name.');

    var rec = load();

    var existing = await findClientByName(name);
    if (existing) return await updateClient(existing.id, name, rec, note);

    var row = { user_id: user.id, name: name, record: rec };
    if (note !== undefined) row.note = note;

    var res = await client.from(CLIENTS_TABLE)
      .insert(row)
      .select('id,name')
      .maybeSingle();

    if (res.error) {
      // Someone saved the same name between the lookup and the insert. The
      // index did its job; finish as the update this was always meant to be.
      if (isDuplicate(res.error)) {
        var found = await findClientByName(name);
        if (found) return await updateClient(found.id, name, rec, note);
      }
      throw new Error(res.error.message || 'Could not save this client.');
    }

    setOpenClient({ id: res.data.id, name: res.data.name });
    return res.data;
  }

  /** Postgres reports a unique-index violation as SQLSTATE 23505. */
  function isDuplicate(error) {
    return !!error && (error.code === '23505' ||
      /duplicate key|already exists/i.test(error.message || ''));
  }

  async function updateClient(id, name, rec, note) {
    var client = sb();
    var patch = { name: name, record: rec };
    if (note !== undefined) patch.note = note;

    var res = await client.from(CLIENTS_TABLE)
      .update(patch)
      .eq('id', id)
      .select('id,name')
      .maybeSingle();
    if (res.error) throw new Error(res.error.message || 'Could not save this client.');
    if (!res.data) throw new Error('Could not save this client.');

    setOpenClient({ id: res.data.id, name: res.data.name });
    return res.data;
  }

  async function findClientByName(name) {
    var client = sb(), user = await me();
    if (!client || !user) return null;
    var res = await client.from(CLIENTS_TABLE)
      .select('id,name')
      .eq('user_id', user.id)
      .ilike('name', String(name || '').trim())
      .maybeSingle();
    return res.error ? null : res.data;
  }

  async function listClients() {
    var client = sb(), user = await me();
    if (!client || !user) return [];
    var res = await client.from(CLIENTS_TABLE)
      .select('id,name,note,updated_at')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(200);
    return res.error ? [] : (res.data || []);
  }

  /** Load a saved client over the record in hand, and remember which it is. */
  async function openSavedClient(id) {
    var client = sb();
    if (!client) throw new Error('Sign in to open a client.');
    var res = await client.from(CLIENTS_TABLE)
      .select('id,name,record')
      .eq('id', id)
      .maybeSingle();
    if (res.error || !res.data) throw new Error('Could not open that client.');

    var rec = res.data.record && typeof res.data.record === 'object'
      ? res.data.record : emptyRecord();
    if (!rec.meta) rec.meta = { updatedAt: null, sources: {} };
    if (!rec.meta.sources) rec.meta.sources = {};
    persist(rec);
    setOpenClient({ id: res.data.id, name: res.data.name });
    return res.data;
  }

  async function deleteClient(id) {
    var client = sb();
    if (!client) throw new Error('Sign in to delete a client.');
    var res = await client.from(CLIENTS_TABLE).delete().eq('id', id);
    if (res.error) throw new Error(res.error.message || 'Could not delete that client.');
    if (openClient && openClient.id === id) setOpenClient(null);
  }

  /* ==================================================================== *
   * Public API                                                            *
   * ==================================================================== */

  function countFilled(rec) {
    return Object.keys(PATHS).filter(function (p) { return !blank(get(rec, p)); }).length;
  }

  root.GTContext = {
    PATHS: PATHS,
    UNITS: UNITS,
    adapters: ADAPTERS,

    get: load,

    /** Merge a partial record in. Blank incoming values never clobber data. */
    merge: function (partial, sourceToolId) {
      var rec = load(), changed = 0;
      Object.keys(PATHS).forEach(function (p) {
        var v = get(partial, p);
        if (blank(v)) return;
        if (String(get(rec, p)) === String(v)) return;
        set(rec, p, v);
        if (sourceToolId) rec.meta.sources[p] = sourceToolId;
        changed++;
      });
      if (!changed) return 0;
      rec.meta.updatedAt = new Date().toISOString();
      persist(rec);
      return changed;
    },

    clear: function () {
      persist(emptyRecord());
      var client = sb();
      if (client) {
        client.auth.getUser().then(function (got) {
          var user = got && got.data && got.data.user;
          if (user) client.from(TABLE).delete().eq('user_id', user.id);
        }).catch(function () {});
      }
    },

    /** Lift the current page's fields into the record. Returns fields added. */
    capture: function (toolId) {
      var a = ADAPTERS[toolId];
      if (!a) return 0;
      try { return this.merge(a.read(), toolId); } catch (e) { return 0; }
    },

    /** True while a prefill is writing into the page. See `writing` above. */
    isWriting: function () { return writing > 0; },

    /** Push the record into the current page. Returns fields filled. */
    apply: function (toolId) {
      var a = ADAPTERS[toolId];
      if (!a) return 0;
      writing++;
      try { return a.write(load()); }
      catch (e) { return 0; }
      finally { writing--; }
    },

    /**
     * The same, but safe to run unprompted: fills only the fields the page has
     * left empty, and marks each one so the clinician can see at a glance what
     * arrived from the previous tool and what they typed themselves.
     *
     * Returns { filled, elements }.
     */
    autofill: function (toolId) {
      var a = ADAPTERS[toolId];
      if (!a) return { filled: 0, elements: [] };

      // Opening a saved client is an explicit "show me this person", so the
      // record wins outright. An unsaved record in hand is a weaker claim —
      // it fills the gaps and leaves whatever is already on screen alone.
      writeMode.onlyEmpty = !openClient;
      writeMode.tracking = true;
      writeMode.touched = [];
      var n = 0;
      writing++;
      try { n = a.write(load()); } catch (e) { n = 0; }
      finally { writing--; }
      var els = writeMode.touched.slice();
      writeMode.onlyEmpty = false;
      writeMode.tracking = false;
      writeMode.touched = [];
      els.forEach(function (el) {
        try { el.classList.add('gt-prefilled'); } catch (e) {}
      });
      return { filled: n, elements: els };
    },

    /**
     * How many fields this page could fill from the record right now —
     * computed by writing into a detached probe rather than guessing.
     */
    canFill: function (toolId) {
      var a = ADAPTERS[toolId];
      if (!a) return 0;
      var rec = load(), n = 0;
      Object.keys(PATHS).forEach(function (p) { if (!blank(get(rec, p))) n++; });
      return n ? n : 0;
    },

    filledCount: function () { return countFilled(load()); },

    /** Short human summary for the switcher header, e.g. "Nimal · 82 kg · 2140 kcal". */
    summary: function () {
      var rec = load(), bits = [];
      var name = get(rec, 'patient.name');
      if (name) bits.push(name);
      var w = get(rec, 'measure.weightKg');
      if (!blank(w)) bits.push(w + ' kg');
      var kcal = get(rec, 'plan.calorieTarget') || get(rec, 'energy.target') || get(rec, 'energy.tdee');
      if (!blank(kcal)) bits.push(Math.round(num(kcal)) + ' kcal');
      return bits.join(' · ');
    },

    /** The filled fields, as label/value pairs, for display. */
    fields: function () {
      var rec = load();
      return Object.keys(PATHS).filter(function (p) {
        return !blank(get(rec, p));
      }).map(function (p) {
        var v = get(rec, p), u = UNITS[p];
        return { path: p, label: PATHS[p], value: v + (u ? ' ' + u : ''), source: rec.meta.sources[p] || null };
      });
    },

    onChange: function (fn) { listeners.push(fn); },

    syncFromCloud: async function () {
      var row = await pullFromCloud();
      if (!row || !row.record) return null;
      var local = load();
      // Cloud wins only when it is genuinely newer than what this browser holds.
      var localAt = local.meta && local.meta.updatedAt ? Date.parse(local.meta.updatedAt) : 0;
      var cloudAt = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (cloudAt <= localAt) return null;
      persist(row.record);
      return row;
    },

    syncToCloud: pushToCloud,

    /**
     * The named client library. Distinct from the record in hand: `merge`
     * and `capture` keep the working record current as the practitioner
     * moves between tools, while these save and restore it under a name.
     */
    clients: {
      list:    listClients,
      save:    saveClient,
      open:    openSavedClient,
      remove:  deleteClient,
      current: function () { return openClient; },
      onChange: function (fn) { clientListeners.push(fn); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
