(function loadPipelineBundle() {
  if (window.CrashInjuryProPipeline) return;
  if (document.querySelector('script[data-crash-injury-pipeline-pro]')) return;
  var script = document.createElement('script');
  script.src = '/ui/modules/apps/CrashInjuryPro/pipelineBundle.js';
  script.setAttribute('data-crash-injury-pipeline-pro', '1');
  script.async = false;
  script.onerror = function () {
    console.error('[CrashInjuryPro] failed to load pipelineBundle.js -- run `node build/build.mjs` in the mod folder to (re)generate it.');
  };
  document.head.appendChild(script);
})();

(function loadFreeCrashBundle() {
  if (window.CrashInjuryPipeline) return;
  if (document.querySelector('script[data-crash-injury-pipeline-free]')) return;
  var s = document.createElement('script');
  s.src = '/ui/modules/apps/CrashInjuryPro/freeBundle.js';
  s.setAttribute('data-crash-injury-pipeline-free', '1');
  s.async = false;
  s.onerror = function () {
    console.error('[CrashInjuryPro] freeBundle.js did not load -- crash findings will fall back to the pro layer.');
  };
  document.head.appendChild(s);
})();

(function loadI18n() {
  window.__cipI18nVersion = window.__cipI18nVersion || String(Date.now());
  if (window.__cipI18n || document.querySelector('script[data-cip-i18n]')) return;
  var s = document.createElement('script');
  s.src = '/ui/modules/apps/CrashInjuryPro/i18n.js?v=' + window.__cipI18nVersion;
  s.setAttribute('data-cip-i18n', '1');
  s.async = false;
  s.onerror = function () { console.error('[CrashInjuryPro] i18n.js did not load -- the app stays in English.'); };
  document.head.appendChild(s);
})();

var CIP_TEMPLATE_CACHE_BUST = Date.now();

angular.module('beamng.apps').directive('crashInjuryPro', ['$timeout', '$sce', '$interval', function ($timeout, $sce, $interval) {
  return {
    templateUrl: '/ui/modules/apps/CrashInjuryPro/app.html?v=' + CIP_TEMPLATE_CACHE_BUST,
    restrict: 'EA',
    replace: false,
    scope: true,
    link: function (scope, element) {
      var cipInstance = (window.__cipInstanceSeq = (window.__cipInstanceSeq || 0) + 1);
      window.__cipActiveInstance = cipInstance;
      function staleInstance() { return window.__cipActiveInstance !== cipInstance; }

      try {
        if (window.bngApi && typeof window.bngApi.engineLua === 'function') {
          window.bngApi.engineLua('extensions.crashInjuryPro.uiAppReady(' + JSON.stringify('crashInjuryPro') + ')');
        }
      } catch (e) {}

      var portalRoot = document.createElement('div');
      portalRoot.className = 'cip-portal-root';
      document.documentElement.appendChild(portalRoot);

      var appRootEl = element[0].querySelector('.cip-app');
      var appRootPlaceholder = document.createComment('cip-app-slot');
      appRootEl.parentNode.insertBefore(appRootPlaceholder, appRootEl);

      var realisticOverlayEls = appRootEl.querySelectorAll('.cip-realistic-overlay, .cip-settings-overlay, .cip-seat-overlay');
      for (var roi = 0; roi < realisticOverlayEls.length; roi++) {
        portalRoot.appendChild(realisticOverlayEls[roi]);
      }

      (function i18nAttach(tries) {
        if (window.__cipI18n) {
          window.__cipI18n.attach(element[0]);
          window.__cipI18n.attach(portalRoot);
          if (scope.settings && scope.settings.language) window.__cipI18n.setLang(scope.settings.language);
          return;
        }
        if (tries < 50) setTimeout(function () { i18nAttach(tries + 1); }, 200);
      })(0);

      function applyFullscreenDom(active) {
        if (active) {
          portalRoot.appendChild(appRootEl);
        } else if (appRootPlaceholder.parentNode) {
          appRootPlaceholder.parentNode.insertBefore(appRootEl, appRootPlaceholder);
        }

        if (!active) scope.viewingReportPostMortem = false;
      }

      var FIGURE_SEVERITY_COLOR = {
        0: '#5a606b',
        1: '#f5e6a3',
        2: '#e0b03c',
        3: '#e0722f',
        4: '#d1443f',
        5: '#8f2027',
        6: '#1c1010'
      };

      var FIGURE_SEVERITY_COLOR_RGB = {
        0: '90,96,107',
        1: '245,230,163',
        2: '224,176,60',
        3: '224,114,47',
        4: '209,68,63',
        5: '143,32,39',
        6: '28,16,16'
      };

      var SEVERITY_RAMP_STOPS = [
        { at: 0.0, rgb: [90, 96, 107] },
        { at: 0.8, rgb: [247, 240, 192] },
        { at: 1.5, rgb: [245, 230, 163] },
        { at: 2.0, rgb: [232, 210, 74] },
        { at: 2.5, rgb: [224, 176, 60] },
        { at: 3.0, rgb: [224, 114, 47] },
        { at: 3.5, rgb: [224, 90, 122] },
        { at: 4.0, rgb: [209, 68, 63] },
        { at: 5.0, rgb: [143, 32, 39] },
        { at: 6.0, rgb: [28, 16, 16] }
      ];

      function severityRampRgbTriple(value) {
        var v = typeof value === 'number' && isFinite(value) ? value : 0;
        if (v <= SEVERITY_RAMP_STOPS[0].at) return SEVERITY_RAMP_STOPS[0].rgb.slice();
        var last = SEVERITY_RAMP_STOPS[SEVERITY_RAMP_STOPS.length - 1];
        if (v >= last.at) return last.rgb.slice();
        for (var i = 0; i < SEVERITY_RAMP_STOPS.length - 1; i++) {
          var a = SEVERITY_RAMP_STOPS[i];
          var b = SEVERITY_RAMP_STOPS[i + 1];
          if (v >= a.at && v <= b.at) {
            var t = (v - a.at) / (b.at - a.at);
            return [
              Math.round(a.rgb[0] + t * (b.rgb[0] - a.rgb[0])),
              Math.round(a.rgb[1] + t * (b.rgb[1] - a.rgb[1])),
              Math.round(a.rgb[2] + t * (b.rgb[2] - a.rgb[2]))
            ];
          }
        }
        return last.rgb.slice();
      }

      function severityRampColor(value) {
        var rgb = severityRampRgbTriple(value);
        return '#' + rgb.map(function (c) {
          var h = Math.max(0, Math.min(255, c)).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('');
      }
      function severityRampColorRgb(value) {
        return severityRampRgbTriple(value).join(',');
      }

      var INJURY_TYPE_COLOR_HEX = {
        bone: '#e8eaed',
        organ: '#e0a04a',
        ribcage: '#e0a04a',
        droplet: '#e2453f',
        brain: '#b389e0',
        spine: '#b389e0',
        burn: '#e0722f'
      };
      var INJURY_TYPE_COLOR_RGB = {
        bone: '232,234,237',
        organ: '224,160,74',
        ribcage: '224,160,74',
        droplet: '226,69,63',
        brain: '179,137,224',
        spine: '179,137,224',
        burn: '224,114,47'
      };

      function injuryTypeColorHex(typeKey) {
        return INJURY_TYPE_COLOR_HEX[typeKey] || INJURY_TYPE_COLOR_HEX.bone;
      }
      function injuryTypeColorRgb(typeKey) {
        return INJURY_TYPE_COLOR_RGB[typeKey] || INJURY_TYPE_COLOR_RGB.bone;
      }

      var REGION_TO_BODY_FIGURE_REGION = {
        head: 'head',
        neck: 'neck',

        chest: 'torso',
        abdomen: 'torso',
        aorta: 'torso',
        thoracicSpine: 'torso',
        lumbarSpine: 'torso',
        lung: 'torso',
        diaphragm: 'torso',
        kidney: 'torso',
        bowel: 'torso',
        pancreas: 'torso',
        pelvis: ['thighs-left', 'thighs-right'],
        femur: ['thighs-left', 'thighs-right'],
        upperArm: ['arms-left', 'arms-right'],
        forearm: ['arms-left', 'arms-right'],
        wrist: ['arms-left', 'arms-right'],
        hand: ['arms-left', 'arms-right'],
        lowerLeg: ['lowerlegs-left', 'lowerlegs-right'],
        ankle: ['lowerlegs-left', 'lowerlegs-right'],
        foot: ['lowerlegs-left', 'lowerlegs-right'],

        knee: ['lowerlegs-left', 'lowerlegs-right']
      };

      function restrictToNamedSide(figureRegions, injury) {
        var name = (injury && injury.name) || '';
        var side = /\bleft\b/i.test(name) ? 'left' : (/\bright\b/i.test(name) ? 'right' : null);

        if (!side && /hepatic|liver/i.test(name)) side = 'right';
        if (!side && /splen/i.test(name)) side = 'left';
        if (!side) return figureRegions;
        var filtered = figureRegions.filter(function (r) { return r.indexOf('-' + side) !== -1; });
        return filtered.length ? filtered : figureRegions;
      }

      var FIGURE_REGIONS = ['head', 'neck', 'torso', 'thighs-left', 'thighs-right', 'lowerlegs-left', 'lowerlegs-right', 'arms-left', 'arms-right'];

      var BLEED_DARKENING_MAX = 2.2;
      var BLEED_DARKENING_CEILING = 6;

      function bleedingFigureRegions(injuries) {
        var out = {};
        (injuries || []).forEach(function (inj) {
          if (!inj || !inj.mechanism) return;
          if (/^(fire-|drowning-)/.test(inj.mechanism)) return;
          var region = inj.region;
          var bleeds = false;
          if (region === 'aorta') bleeds = true;
          else if ((region === 'abdomen' || region === 'pelvis' || region === 'kidney' || region === 'femur') && inj.aisSeverity >= 3) bleeds = true;
          else if (/laceration/i.test(inj.name || '')) bleeds = true;
          else if (region === 'circulatory' || /^haemorrhage-/.test(inj.mechanism)) {
            var m = /^haemorrhage-from-(.+)$/.exec(inj.mechanism);
            var sourceRegion = m ? m[1] : 'abdomen';
            var mappedSource = REGION_TO_BODY_FIGURE_REGION[sourceRegion] || REGION_TO_BODY_FIGURE_REGION.abdomen;
            (Array.isArray(mappedSource) ? mappedSource : [mappedSource]).forEach(function (fr) { if (fr) out[fr] = true; });
            return;
          }
          if (!bleeds) return;
          var mapped = REGION_TO_BODY_FIGURE_REGION[region];
          if (!mapped) return;
          restrictToNamedSide(Array.isArray(mapped) ? mapped : [mapped], inj)
            .forEach(function (fr) { out[fr] = true; });
        });
        return out;
      }

      function bleedFractionOf(bloodLostMl, massKg) {
        var kg = massKg > 0 ? massKg : 75;
        var terminalMl = kg * 70 * 0.6;
        if (!(terminalMl > 0) || !(bloodLostMl > 0)) return 0;
        return Math.min(1, bloodLostMl / terminalMl);
      }

      var FIRE_DARKENING_MAX = 2.6;
      var FIRE_FULL_DOSE_S = 75;
      var FIRE_SPREAD_FRACTION = 0.45;

      function burnFractionOf(fireDoseS) {
        if (!(fireDoseS > 0)) return 0;
        return Math.min(1, fireDoseS / FIRE_FULL_DOSE_S);
      }

      function burnFigureRegions(injuries, fraction) {
        var out = {};
        (injuries || []).forEach(function (inj) {
          if (!inj) return;
          var isBurn = /^fire-/.test(inj.mechanism || '') || /burn/i.test(inj.name || '');
          if (!isBurn) return;
          var mapped = REGION_TO_BODY_FIGURE_REGION[inj.region];
          if (!mapped) return;
          (Array.isArray(mapped) ? mapped : [mapped]).forEach(function (fr) { out[fr] = true; });
        });
        if (fraction >= FIRE_SPREAD_FRACTION) {
          FIGURE_REGIONS.forEach(function (r) { out[r] = true; });
        }
        return out;
      }

      function crushedBody(severities, survival) {
        var cause = survival && survival.deathCause && survival.deathCause.short;

        return severities;
      }

      function computeBodyFigureSeverities(injuries, bleedFraction, burnFraction) {
        var result = {};
        FIGURE_REGIONS.forEach(function (r) { result[r] = 0; });
        injuries.forEach(function (injury) {
          var mapped = REGION_TO_BODY_FIGURE_REGION[injury.region];
          if (!mapped) return;
          var figureRegions = restrictToNamedSide(Array.isArray(mapped) ? mapped : [mapped], injury);
          figureRegions.forEach(function (figureRegion) {
            if (injury.aisSeverity > result[figureRegion]) result[figureRegion] = injury.aisSeverity;
          });
        });
        var fraction = typeof bleedFraction === 'number' && bleedFraction > 0 ? Math.min(1, bleedFraction) : 0;
        if (fraction > 0) {
          var bleeding = bleedingFigureRegions(injuries);
          FIGURE_REGIONS.forEach(function (r) {
            if (!bleeding[r] || result[r] <= 0) return;

            result[r] = Math.min(BLEED_DARKENING_CEILING, result[r] + fraction * fraction * BLEED_DARKENING_MAX);
          });
        }

        var burn = typeof burnFraction === 'number' && burnFraction > 0 ? Math.min(1, burnFraction) : 0;
        if (burn > 0) {
          var burning = burnFigureRegions(injuries, burn);
          FIGURE_REGIONS.forEach(function (r) {
            if (!burning[r]) return;
            result[r] = Math.min(6, result[r] + burn * burn * FIRE_DARKENING_MAX);
          });
        }
        return result;
      }

      var GLYPH_PATHS = {
        bone: 'M4,10 C4,7.2 6,5.3 8,6.3 C9,4.3 12,4.3 13,6.3 C15,5.3 17,7.2 17,10 C17,12.8 15,14.7 13,13.7 C12,15.7 9,15.7 8,13.7 C6,14.7 4,12.8 4,10 Z',
        droplet: 'M10,3 C13,8 16,11.2 16,14 C16,17.3 13.3,19 10,19 C6.7,19 4,17.3 4,14 C4,11.2 7,8 10,3 Z',
        ribcage:
          'M10,3 L10,17 M6,6 C4.2,7 3,8 3,9.3 M14,6 C15.8,7 17,8 17,9.3 M6,10 C4.2,11 3,12 3,13.3 M14,10 C15.8,11 17,12 17,13.3 M6.4,14 C4.6,14.8 3.6,15.6 3.4,16.2 M13.6,14 C15.4,14.8 16.4,15.6 16.6,16.2',
        brain:
          'M10,3 C6.2,3 3,6 3,9.8 C3,12.6 4.8,14.4 5,15.6 C5.2,17 6.8,17.7 8,16.8 C8.6,17.8 11.4,17.8 12,16.8 C13.2,17.7 14.8,17 15,15.6 C15.2,14.4 17,12.6 17,9.8 C17,6 13.8,3 10,3 Z M6.4,7.2 C7.2,6.4 8.2,6.9 7.9,7.8 M12.1,7.8 C11.8,6.9 12.8,6.4 13.6,7.2 M6.6,11.2 C7.4,10.7 8.2,11.1 8,11.9',
        spine:
          'M10,3 C9,3 8.2,3.5 8.2,4.4 C8.2,5.3 9,5.8 10,5.8 C11,5.8 11.8,5.3 11.8,4.4 C11.8,3.5 11,3 10,3 Z M10,6.6 L10,7.6 M8.2,9.4 C8.1,9.7 8.1,10.1 8.1,10.4 C8.1,11.3 9,11.8 10,11.8 C11,11.8 11.9,11.3 11.9,10.4 C11.9,10.1 11.9,9.7 11.8,9.4 M10,12.6 L10,13.6 M8.2,15.4 C8.1,15.7 8.1,16.1 8.1,16.4 C8.1,17.3 9,17.8 10,17.8 C11,17.8 11.9,17.3 11.9,16.4 C11.9,16.1 11.9,15.7 11.8,15.4',
        organ:
          'M13.2,4.2 C16.2,5.3 17.5,8.3 16.5,11.3 C15.6,14.2 13,16.2 10,16.2 C6.8,16.2 4.5,14 4.5,11 C4.5,9 5.6,7.4 7.6,6.9 C6.9,5.7 8,4 10,4.1 C11,4.1 12.2,3.7 13.2,4.2 Z',

        burn: 'M10,2 C7,6 5,9 5,12.5 C5,15.5 7.2,18 10,18 C12.8,18 15,15.5 15,12.5 C15,10.5 14,9 12.7,8 C13,10 12,10.8 11.3,9.5 C10.8,8.3 11.3,7 10.8,5.5 C10.5,4.3 10.5,3 10,2 Z M10,10 C9.3,11.3 9.2,12.5 10,13.6 C10.8,12.5 10.7,11.3 10,10 Z'
      };

      function pickGlyph(injury) {
        if (injury.region === 'circulatory' || (injury.mechanism || '').indexOf('haemorrhage-') === 0) return 'droplet';
        if (/fracture/i.test(injury.name)) return 'bone';
        if (injury.region === 'chest') return 'ribcage';
        if (injury.region === 'head') return 'brain';
        if (injury.region === 'neck' || injury.region === 'thoracicSpine' || injury.region === 'lumbarSpine') return 'spine';
        if (injury.region === 'abdomen') return 'organ';
        if (injury.region === 'aorta') return 'droplet';
        return 'bone';
      }

      var INJURY_ICONS = {
        brain: '<path d="M12 4.2c-1.3-1.2-3.6-1-4.6.5-1.7-.1-3 1.3-2.8 3-1.4.7-1.9 2.5-1 3.8-.8 1.2-.4 3 1 3.6.1 1.7 1.7 2.9 3.4 2.4.9 1.2 2.7 1.4 4 .4 1.3 1 3.1.8 4-.4 1.7.5 3.3-.7 3.4-2.4 1.4-.6 1.8-2.4 1-3.6.9-1.3.4-3.1-1-3.8.2-1.7-1.1-3.1-2.8-3-1-1.5-3.3-1.7-4.6-.5z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 4.4v13.8M8.6 8.2c1 .3 1.6 1 1.7 2M15.4 8.2c-1 .3-1.6 1-1.7 2M7.6 12.8c1.1-.4 2.1 0 2.6.8M16.4 12.8c-1.1-.4-2.1 0-2.6.8" fill="none" stroke="{c}" stroke-width="1.2" stroke-linecap="round"/>',
        skull: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.3 1 3.8 2.4 4.8v2.4c0 .8.6 1.3 1.3 1.3h7.6c.7 0 1.3-.5 1.3-1.3v-2.4c1.4-1 2.4-2.5 2.4-4.8 0-4-3.1-7-7.5-7z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="9.2" cy="11.3" r="1.6" fill="{c}"/><circle cx="14.8" cy="11.3" r="1.6" fill="{c}"/><path d="M10.5 16.2v3M13.5 16.2v3M12 3.8l-1 3 1.6 1.6-.9 2" fill="none" stroke="{c}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
        face: '<circle cx="12" cy="12" r="8" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4"/><circle cx="9.2" cy="10.4" r="1.1" fill="{c}"/><circle cx="14.8" cy="10.4" r="1.1" fill="{c}"/><path d="M9 15.2c1.8 1.2 4.2 1.2 6 0M15.8 5.8l-1.6 2.6 1.4 1" fill="none" stroke="{c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
        helmet: '<path d="M4 14.5C4 9.2 7.6 5 12.6 5 17 5 20 8.3 20 12.4v3.1H11.5l-1.2 2.5H5.4C4.6 18 4 17.4 4 16.6z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M11 10.2h9M11 10.2c-.6 1.8-.6 3.5 0 5.3" fill="none" stroke="{c}" stroke-width="1.3" stroke-linecap="round"/>',
        spine: '<rect x="8.5" y="3" width="7" height="3.6" rx="1.3" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.3"/><rect x="8.2" y="8.3" width="7.6" height="3.6" rx="1.3" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.3"/><rect x="7.9" y="13.6" width="8.2" height="3.8" rx="1.3" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.3"/><path d="M6.3 4.8h2.2M15.5 4.8h2.2M6 10.1h2.2M15.8 10.1h2.2M5.7 15.5h2.2M16.1 15.5h2.2M12 17.4V21" fill="none" stroke="{c}" stroke-width="1.3" stroke-linecap="round"/>',
        ribs: '<path d="M12 3.5v17" stroke="{c}" stroke-width="1.6" stroke-linecap="round"/><path d="M11 6.5C8 6.3 5.4 7.6 4.8 10M13 6.5c3-.2 5.6 1.1 6.2 3.5M11 10C8.2 10 5.8 11.3 5.2 13.6M13 10c2.8 0 5.2 1.3 5.8 3.6M11 13.6c-2.4 0-4.4 1.1-5 3M13 13.6c2.4 0 4.4 1.1 5 3" fill="none" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/>',
        lungs: '<path d="M10.6 7.2c-1.7-2.4-5.8-1.3-6.4 3.4-.5 3.7-.4 7 .9 8 1.4 1 4.4-.1 5.5-1.9zM13.4 7.2c1.7-2.4 5.8-1.3 6.4 3.4.5 3.7.4 7-.9 8-1.4 1-4.4-.1-5.5-1.9z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 3v6.2M12 9.2l-2 2.2M12 9.2l2 2.2" fill="none" stroke="{c}" stroke-width="1.4" stroke-linecap="round"/>',
        heart: '<path d="M12 20s-7.5-4.6-7.5-10.2c0-2.6 2-4.6 4.4-4.6 1.4 0 2.5.7 3.1 1.7.6-1 1.7-1.7 3.1-1.7 2.4 0 4.4 2 4.4 4.6C19.5 15.4 12 20 12 20z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 11.5h2.6l1.3-2.2 1.9 4.4 1.3-2.2H17" fill="none" stroke="{c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
        vessel: '<path d="M12 3c3.3 4.6 6 8 6 11.2 0 3.4-2.7 5.8-6 5.8s-6-2.4-6-5.8C6 11 8.7 7.6 12 3z" fill="{c}" fill-opacity=".3" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.4 14.4c0 1.6 1.1 2.8 2.6 3" fill="none" stroke="{c}" stroke-width="1.3" stroke-linecap="round"/>',
        liver: '<path d="M3.8 9.3c0-2.7 2.6-4 6-3.8 3 .2 7 .1 9.4.3 1.8.2 1.5 2.4-.3 3.9-2.4 2-5 4.6-8 6.3-2.5 1.4-4.9.9-6-1.4-.8-1.6-1.1-3.4-1.1-5.3z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M11.8 5.8c-.4 2.6-1.4 5.6-3.2 8.4" fill="none" stroke="{c}" stroke-width="1.2" stroke-linecap="round"/>',
        kidney: '<path d="M9.5 4c-3 0-5 2.8-5 7.4 0 5 2.1 8.6 5.3 8.6 2.3 0 3.3-1.8 2.6-3.6-.6-1.4-1.8-2.3-1.8-4.2 0-1.8 1.4-2.6 1.9-4 .8-2.3-.6-4.2-3-4.2z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M11.7 12.2h3.3c1.5 0 2.5 1.2 2.5 2.7V20M15 12.2c1.4-.2 2.4-1.2 2.6-2.6" fill="none" stroke="{c}" stroke-width="1.3" stroke-linecap="round"/>',
        spleen: '<path d="M15.8 4.4c2.3 1.4 3.2 4.6 2.2 8.2-1.2 4.3-4.8 7.4-8.4 7.4-2.1 0-3.1-1.6-2.1-3.1.9-1.3 2.6-1.4 3-3.2.4-1.7-1.6-2.4-1.3-4.3.4-2.8 4-6.4 6.6-5z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/>',
        bowel: '<rect x="4" y="5" width="16" height="14" rx="5" fill="{c}" fill-opacity=".16" stroke="{c}" stroke-width="1.4"/><path d="M7.5 9h9M16.5 9c1.6 0 1.6 3 0 3h-9c-1.6 0-1.6 3 0 3h9" fill="none" stroke="{c}" stroke-width="1.4" stroke-linecap="round"/>',
        organ: '<path d="M6 6.5c2-2.3 7-2.5 10.5-.8 2.8 1.4 3.6 4.4 2.3 7.4-1.5 3.6-5 6-8.6 6-3.5 0-6-2.5-6-6 0-2.5.4-5 1.8-6.6z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 10.5c1.5-.8 3.4-.8 5 .3" fill="none" stroke="{c}" stroke-width="1.2" stroke-linecap="round"/>',
        pelvis: '<path d="M4 6.5c2.2-1.5 5.3-1.6 6.8.3.8 1 2 1 2.8 0 1.5-1.9 4.6-1.8 6.8-.3-.3 3.8-1.6 6.6-4 8.2l.3 3.8h-2.6l-1-2.6h-2.6l-1 2.6H6.9l.3-3.8C4.8 13.1 4.3 10.3 4 6.5z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8.6" cy="13.3" r="1.2" fill="none" stroke="{c}" stroke-width="1.2"/><circle cx="15.4" cy="13.3" r="1.2" fill="none" stroke="{c}" stroke-width="1.2"/>',
        bone: '<path d="M7.7 5.3a2.3 2.3 0 1 0-2.6 3.1l9.6 9.6a2.3 2.3 0 1 0 3.1 2.6 2.3 2.3 0 1 0 2.6-3.1L10.8 7.9a2.3 2.3 0 1 0-3.1-2.6z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/>',
        brokenBone: '<path d="M7.7 5.3a2.3 2.3 0 1 0-2.6 3.1l4.2 4.2 1.5-.8-.2-1.8 1.4-.6L7.7 5.3zM16.3 18.7a2.3 2.3 0 1 0 2.6-3.1l-4.2-4.2-1.4.7.1 1.8-1.4.7 4.3 4.1z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/>',
        hand: '<path d="M8 20c-2 0-3.3-1.6-3.6-3.6L3.6 12c-.2-1 1.2-1.5 1.7-.6L7 14V5.5c0-1.2 1.8-1.2 1.8 0V11V4c0-1.2 1.9-1.2 1.9 0v7-6c0-1.2 1.8-1.2 1.8 0v6.3-4.2c0-1.2 1.8-1.2 1.8 0v8.4C14.3 18 12.6 20 10.4 20z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.3" stroke-linejoin="round"/>',
        foot: '<path d="M9 3.5c-2 0-3 1.8-3 4.5 0 2.5.6 4.3.4 6.5-.2 2.5 1 5.5 4.3 5.5 3.5 0 4.5-2.4 4-4.6-.4-2-1.8-3.3-1.8-6.2 0-3.2-1.5-5.7-3.9-5.7z" fill="{c}" fill-opacity=".22" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="16.6" cy="5.2" r="1.2" fill="{c}"/><circle cx="18.6" cy="7.6" r="1" fill="{c}"/><circle cx="19.4" cy="10.3" r=".9" fill="{c}"/>',
        bruise: '<circle cx="12" cy="12" r="7.5" fill="{c}" fill-opacity=".3" stroke="{c}" stroke-width="1.4" stroke-dasharray="2.4 1.6"/><circle cx="12" cy="12" r="3.4" fill="{c}" fill-opacity=".55"/>',
        belt: '<path d="M6 3.5l12 17" stroke="{c}" stroke-width="3.2" stroke-linecap="round" opacity=".75"/><path d="M4 16h16" stroke="{c}" stroke-width="3" stroke-linecap="round" opacity=".75"/><rect x="10.3" y="14.2" width="4.2" height="3.6" rx=".8" fill="none" stroke="{c}" stroke-width="1.3"/>',
        water: '<path d="M12 3c2.6 3.6 4.8 6.3 4.8 8.8 0 2.7-2.1 4.5-4.8 4.5s-4.8-1.8-4.8-4.5C7.2 9.3 9.4 6.6 12 3z" fill="{c}" fill-opacity=".25" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/><path d="M3.5 19c1.4-1.2 2.8-1.2 4.2 0s2.8 1.2 4.2 0 2.8-1.2 4.2 0 2.8 1.2 4.2 0" fill="none" stroke="{c}" stroke-width="1.4" stroke-linecap="round"/>',
        flame: '<path d="M12 2.8c-3.6 4.2-6 7.4-6 11.2 0 3.6 2.7 6.2 6 6.2s6-2.6 6-6.2c0-2.4-1.1-4.2-2.6-5.4.3 2.2-.8 3.2-1.8 1.8-.8-1.2-.2-2.8-.7-4.6-.3-1.1-.5-2-.9-3z" fill="{c}" fill-opacity=".25" stroke="{c}" stroke-width="1.4" stroke-linejoin="round"/>',
        collapse: '<path d="M9.2 3.6l1.3 4.1 3.6-2.3-1 4.2 4.3.3-3.5 2.6 3.2 2.9-4.3.1.8 4.2-3.5-2.6-1.9 3.9-1-4.2-4 1.6 2.3-3.6L2 13.4l3.9-1.8-2.6-3.4 4.2.6z" fill="{c}" fill-opacity=".3" stroke="{c}" stroke-width="1.3" stroke-linejoin="round"/><path d="M17.6 5.2l2.6-1.3-.7 2.6zM19 10.6l3.2.2-2.2 2zM17.4 16.4l2.8 1.6-2.9.9z" fill="{c}" stroke="{c}" stroke-width=".9" stroke-linejoin="round"/><path d="M15.6 7.6l1.6-1M16.6 11.4h1.8M15.6 15.4l1.5.9" stroke="{c}" stroke-width="1.2" stroke-linecap="round"/>'
      };

      function injuryIconKey(injury) {
        var r = injury.region || '', n = String(injury.name || '') + ' ' + String(injury.mechanism || '');
        if (/drown|submers|water in the lungs|breath/i.test(n)) return 'water';
        if (/burn|fire|smoke/i.test(n)) return 'flame';
        if (/car collapsed|destroyed/i.test(n)) return 'collapse';
        if (/helmet/i.test(n) && (r === 'head' || r === 'face')) return 'helmet';
        if (/seatbelt|seat-belt|belt-contusion|harness/i.test(n)) return 'belt';
        if (r === 'circulatory' || r === 'aorta' || /haemorrhage-|hemorrhage|bleeding|artery/i.test(n)) return 'vessel';
        if (r === 'head') return /skull|crani|basilar/i.test(n) ? 'skull' : 'brain';
        if (r === 'face') return 'face';
        if (r === 'neck' || r === 'thoracicSpine' || r === 'lumbarSpine' || r === 'spine') return 'spine';
        if (r === 'lung' || /lung|pneumo|haemothorax|hemothorax/i.test(n)) return 'lungs';
        if (r === 'heart' || /heart|cardiac|myocard/i.test(n)) return 'heart';
        if (r === 'chest') return 'ribs';
        if (r === 'liver' || /liver|hepat/i.test(n)) return 'liver';
        if (r === 'kidney' || /kidney|renal/i.test(n)) return 'kidney';
        if (r === 'spleen' || /spleen|splen/i.test(n)) return 'spleen';
        if (/bowel|intestin|mesenter|colon/i.test(n)) return 'bowel';
        if (r === 'abdomen') return 'organ';
        if (r === 'pelvis') return 'pelvis';
        if (r === 'hand' || r === 'wrist') return 'hand';
        if (r === 'foot' || r === 'ankle') return 'foot';
        if (/fracture|broken|crushed|shattered/i.test(n)) return 'brokenBone';
        if ((injury.aisSeverity || 0) <= 1) return 'bruise';
        return 'bone';
      }

      function injuryIconColor(ais) {
        var a = Math.round(ais || 0);
        if (a >= 6) return '#d8d8dc';
        if (a >= 5) return '#c42b3a';
        return severityRampColor(Math.max(1, a));
      }
      function injuryIconSvg(injury) {
        var key = injuryIconKey(injury);
        var c = injuryIconColor(injury.aisSeverity);
        return '<svg viewBox="0 0 24 24" width="100%" height="100%" class="glyph" aria-hidden="true">' +
          INJURY_ICONS[key].replace(/\{c\}/g, c) + '</svg>';
      }

      function glyphSvg(key, sizePx, colorCssValue) {
        sizePx = sizePx || 20;
        colorCssValue = colorCssValue || 'currentColor';
        return (
          '<svg viewBox="0 0 20 20" width="100%" height="100%" class="glyph" aria-hidden="true">' +
          '<path d="' + GLYPH_PATHS[key] + '" fill="none" stroke="' + colorCssValue + '" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>'
        );
      }

      var RIGHT_SHOULDER = { x: 162, y: 104 };
      var ARM_ANGLE_DEG = -14;

      var RIGHT_ELBOW = { x: 181.4, y: 181.6 };
      var RIGHT_WRIST = { x: 198.3, y: 249.5 };

      var RIGHT_HIP = { x: 140, y: 222 };
      var RIGHT_KNEE = { x: 140, y: 332 };
      var RIGHT_ANKLE = { x: 140, y: 432 };

      var MIRROR = 'scale(-1,1) translate(-240,0)';

      function useEl(id, transform, extraAttrs) {
        var t = transform ? ' transform="' + transform + '"' : '';
        return '<use href="#' + id + '"' + t + (extraAttrs || '') + '/>';
      }

      function mirrored(inner) {
        return '<g transform="' + MIRROR + '">' + inner + '</g>';
      }

      var RIGHT_ARM_MARKUP =
        useEl('pro-shape-upperArm', 'translate(' + RIGHT_SHOULDER.x + ',' + RIGHT_SHOULDER.y + ') rotate(' + ARM_ANGLE_DEG + ')') +
        useEl('pro-shape-forearm', 'translate(' + RIGHT_ELBOW.x + ',' + RIGHT_ELBOW.y + ') rotate(' + ARM_ANGLE_DEG + ')') +
        useEl('pro-shape-hand', 'translate(' + RIGHT_WRIST.x + ',' + RIGHT_WRIST.y + ') rotate(' + ARM_ANGLE_DEG + ')');

      var RIGHT_LEG_MARKUP =
        useEl('pro-shape-thigh', 'translate(' + RIGHT_HIP.x + ',' + RIGHT_HIP.y + ')') +
        useEl('pro-shape-calf', 'translate(' + RIGHT_KNEE.x + ',' + RIGHT_KNEE.y + ')') +
        useEl('pro-shape-foot', 'translate(' + RIGHT_ANKLE.x + ',' + RIGHT_ANKLE.y + ')');

      var RIGHT_THIGH_ONLY = useEl('pro-shape-thigh', 'translate(' + RIGHT_HIP.x + ',' + RIGHT_HIP.y + ')');

      var RIGHT_LOWER_LEG_ONLY =
        useEl('pro-shape-calf', 'translate(' + RIGHT_KNEE.x + ',' + RIGHT_KNEE.y + ')') +
        useEl('pro-shape-foot', 'translate(' + RIGHT_ANKLE.x + ',' + RIGHT_ANKLE.y + ')');

      var BODY_FIGURE_SVG = '' +
        '<svg id="proBodyFigure" viewBox="0 0 240 480" role="img" aria-label="Body figure showing which regions were injured">' +
        '  <defs>' +
        '    <path id="pro-shape-head" d="M120,19 C132,19 140,29 140,42 C140,52 136,60 130,64 C127,66 124,67 120,67 C116,67 113,66 110,64 C104,60 100,52 100,42 C100,29 108,19 120,19 Z"/>' +
        '    <path id="pro-shape-neck" d="M111,60 L129,60 C129,70 131,77 137,84 L103,84 C109,77 111,70 111,60 Z"/>' +
        '    <path id="pro-shape-torso" d="M106,81 C94,82 82,84 75,90 C68,96 66,106 68,116 C70,128 77,138 82,150 C87,163 89,176 87,190 C85,203 80,212 82,226 C98,241 142,241 158,226 C160,212 155,203 153,190 C151,176 153,163 158,150 C163,138 170,128 172,116 C174,106 172,96 165,90 C158,84 146,82 134,81 C126,84 114,84 106,81 Z"/>' +
        '    <path id="pro-shape-upperArm" d="M-12,0 C-12,-9 12,-9 12,0 C13,18 12,40 10,62 C9,71 9,76 8,80 L-8,80 C-9,76 -9,71 -10,62 C-12,40 -13,18 -12,0 Z"/>' +
        '    <path id="pro-shape-forearm" d="M-8,0 C-8,-6 8,-6 8,0 C9,18 8,35 6.5,52 C6,61 5.5,66 5,70 L-5,70 C-5.5,66 -6,61 -6.5,52 C-8,35 -9,18 -8,0 Z"/>' +
        '    <path id="pro-shape-hand" d="M-5.5,-2 C-7,5 -8,13 -6,20 C-4,25 4,25 6,20 C8,13 7,5 5.5,-2 Z"/>' +
        '    <path id="pro-shape-thigh" d="M-17,0 C-19,30 -16,60 -13,85 C-11,95 -10,102 -10,110 L10,110 C10,102 11,95 13,85 C16,60 19,30 17,0 Z"/>' +
        '    <path id="pro-shape-calf" d="M-10,0 C-13,15 -12,28 -12,35 C-12,45 -10,55 -8,70 C-7,85 -6,95 -6,100 L6,100 C6,95 7,85 8,70 C10,55 12,45 12,35 C12,28 13,15 10,0 Z"/>' +
        '    <path id="pro-shape-foot" d="M-7,0 L7,0 C9,6 12,12 18,16 C20,20 15,22 6,21 L-7,20 C-9,12 -9,6 -7,0 Z"/>' +
        '' +
        '    <mask id="pro-mask-head" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      ' + useEl('pro-shape-head', undefined, ' fill="white"') +
        '    </mask>' +
        '    <mask id="pro-mask-neck" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      ' + useEl('pro-shape-neck', undefined, ' fill="white"') +
        '    </mask>' +
        '    <mask id="pro-mask-torso" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      ' + useEl('pro-shape-torso', undefined, ' fill="white"') +
        '    </mask>' +

        '    <mask id="pro-mask-thighs-right" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      <g fill="white">' + RIGHT_THIGH_ONLY + '</g>' + useEl('pro-shape-torso', undefined, ' fill="black"') +
        '    </mask>' +
        '    <mask id="pro-mask-thighs-left" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      <g fill="white">' + mirrored(RIGHT_THIGH_ONLY) + '</g>' + useEl('pro-shape-torso', undefined, ' fill="black"') +
        '    </mask>' +

        '    <mask id="pro-mask-lowerlegs-right" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      <g fill="white">' + RIGHT_LOWER_LEG_ONLY + '</g>' +
        '    </mask>' +
        '    <mask id="pro-mask-lowerlegs-left" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      <g fill="white">' + mirrored(RIGHT_LOWER_LEG_ONLY) + '</g>' +
        '    </mask>' +
        '    <mask id="pro-mask-arms-right" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      <g fill="white">' + RIGHT_ARM_MARKUP + '</g>' + useEl('pro-shape-torso', undefined, ' fill="black"') +
        '    </mask>' +
        '    <mask id="pro-mask-arms-left" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="480">' +
        '      <g fill="white">' + mirrored(RIGHT_ARM_MARKUP) + '</g>' + useEl('pro-shape-torso', undefined, ' fill="black"') +
        '    </mask>' +
        '  </defs>' +
        '' +
        '  <g id="proFigureBase" fill="#4a4f58" stroke="#33373f" stroke-width="1">' +
        '    ' + RIGHT_ARM_MARKUP +
        '    ' + mirrored(RIGHT_ARM_MARKUP) +
        '    ' + RIGHT_LEG_MARKUP +
        '    ' + mirrored(RIGHT_LEG_MARKUP) +
        '    ' + useEl('pro-shape-torso') +
        '    ' + useEl('pro-shape-neck') +
        '    ' + useEl('pro-shape-head') +
        '  </g>' +
        '' +
        '  <g mask="url(#pro-mask-head)"><rect id="pro-highlight-head" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-neck)"><rect id="pro-highlight-neck" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-torso)"><rect id="pro-highlight-torso" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-thighs-right)"><rect id="pro-highlight-thighs-right" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-thighs-left)"><rect id="pro-highlight-thighs-left" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-lowerlegs-right)"><rect id="pro-highlight-lowerlegs-right" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-lowerlegs-left)"><rect id="pro-highlight-lowerlegs-left" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-arms-right)"><rect id="pro-highlight-arms-right" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +
        '  <g mask="url(#pro-mask-arms-left)"><rect id="pro-highlight-arms-left" x="0" y="0" width="240" height="480" fill="#5a606b"/></g>' +

        '  <g id="proFigureSeatbelt" mask="url(#pro-mask-torso)" style="display: none;">' +
        '    <polygon id="proSeatbeltSash" points="146.4,87.9 157.6,92.1 103.6,234.1 92.4,229.9" fill="#000000"/>' +
        '    <rect id="proSeatbeltLap" x="84" y="224" width="72" height="11" rx="2" fill="#000000"/>' +
        '  </g>' +

        '  <g id="proFigureHarness" mask="url(#pro-mask-torso)" style="display: none;">' +
        '    <polygon points="98,84 109,84 115,226 104,226" fill="#000000"/>' +
        '    <polygon points="131,84 142,84 136,226 125,226" fill="#000000"/>' +
        '    <rect x="100" y="150" width="40" height="7" rx="2" fill="#000000"/>' +
        '    <rect x="84" y="224" width="72" height="11" rx="2" fill="#000000"/>' +
        '  </g>' +

        '  <g id="proFigureHelmet" style="display: none;">' +
        '    <path fill-rule="evenodd" fill="#0b0b0d" stroke="#2a2d33" stroke-width="1.2" d="' +
        'M120,13 C137,13 148,25 148,42 C148,51 146,58 142,64 C138,68 131,69 120,69 C109,69 102,68 98,64 C94,58 92,51 92,42 C92,25 103,13 120,13 Z ' +
        'M101,34 C112,31.5 128,31.5 139,34 C140.5,39 140.5,45 139,50 C128,52 112,52 101,50 C99.5,45 99.5,39 101,34 Z"/>' +
        '    <path d="M97,56 C104,58.5 136,58.5 143,56" fill="none" stroke="#2a2d33" stroke-width="1.2"/>' +
        '  </g>' +
        '</svg>';

      function figureIdPrefix(ns) {
        return ns === 'pro' ? 'pro' : ns + 'Pro';
      }

      var SASH_RIGHT_SHOULDER = 'points="146.4,87.9 157.6,92.1 103.6,234.1 92.4,229.9"';
      var SASH_LEFT_SHOULDER = 'points="93.6,87.9 82.4,92.1 136.4,234.1 147.6,229.9"';

      function seatSideForNs(ns) {
        for (var i = 0; i < SEAT_DEFS.length; i++) {
          if (SEAT_DEFS[i].ns === ns || SEAT_DEFS[i].reportNs === ns) return SEAT_DEFS[i].side;
        }
        return 'left';
      }

      function bodyFigureSvgFor(ns) {
        var svg = BODY_FIGURE_SVG;
        if (seatSideForNs(ns) === 'left') svg = svg.replace(SASH_RIGHT_SHOULDER, SASH_LEFT_SHOULDER);
        if (ns === 'pro') return svg;
        var p = figureIdPrefix(ns);
        return svg
          .replace(/id="pro/g, 'id="' + p)
          .replace(/url\(#pro/g, 'url(#' + p)
          .replace(/href="#pro/g, 'href="#' + p);
      }

      var NOTIF_EVENT_GAP_CAP_MS = 1400;

      var NOTIF_VISIBLE_MS = 1800;

      var NOTIF_FADE_MS = 700;

      var REPORT_SETTLE_DELAY_MS = 40;

      var NOTIF_ROW_STAGGER_MS = 260;

      var HUD_LABELS = {
        'Skull fracture': 'Skull fractured',
        'Concussion': 'Concussion',
        'Cerebral contusion': 'Brain bruised',
        'Subdural haematoma': 'Brain bleeding',
        'Diffuse axonal injury': 'Severe brain injury',
        'Sternal or single rib fracture': 'Rib fractured',
        'Multiple rib fractures': 'Ribs fractured',
        'Flail chest with pulmonary contusion': 'Flail chest',
        'Femoral shaft fracture (simple)': 'Femur fractured',
        'Femoral shaft fracture (displaced/comminuted)': 'Femur shattered',
        'Splenic contusion': 'Spleen bruised',
        'Splenic laceration': 'Spleen torn',
        'Splenic major laceration': 'Spleen ruptured',
        'Hepatic contusion': 'Liver bruised',
        'Hepatic laceration': 'Liver torn',
        'Hepatic major laceration': 'Liver ruptured',
        'Cervical sprain/strain': 'Neck sprained',
        'Cervical vertebral fracture': 'Neck fractured',
        'Cervical fracture with cord involvement': 'Neck broken',
        'Partial aortic tear': 'Aorta torn',
        'Aortic transection': 'Aorta severed',
        'Massive haemorrhage': 'Massive bleeding',
        'Internal haemorrhage': 'Internal bleeding',
        'Significant blood loss': 'Severe blood loss',

        'Stable pelvic fracture': 'Pelvis fractured',
        'Unstable pelvic ring fracture': 'Pelvis badly fractured',
        'Open-book pelvic fracture with major haemorrhage': 'Pelvis shattered',
        'Vertebral compression fracture': 'Spine fractured',
        'Vertebral burst fracture': 'Spine badly fractured',
        'Vertebral fracture with cord involvement': 'Spine broken',
        'Nasal fracture': 'Nose broken',
        'Orbital socket fracture': 'Eye socket fractured',
        'Dental injury': 'Teeth damaged',
        'Scalp laceration': 'Scalp cut',
        'Clavicle fracture': 'Collarbone fractured',
        'Splenic rupture': 'Spleen ruptured',
        'Hepatic rupture': 'Liver ruptured',
        'Major renal laceration': 'Kidney torn',
        'Renal rupture': 'Kidney ruptured',
        'Major abdominal organ laceration': 'Abdomen torn',
        'Abdominal organ rupture': 'Abdomen ruptured'
      };

      function hudLabel(injury) {
        var known = HUD_LABELS[injury.name];
        if (known) return known;
        var stripped = injury.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
        return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
      }

      var OUTLOOK_LABELS = {
        likelySurvivable: 'Likely survivable',
        seriousButLikelySurvivable: 'Serious, but likely survivable',
        critical: 'Critical',
        notSurvivable: 'Not survivable'
      };
      scope.outlookLabel = function (outlook) {
        return OUTLOOK_LABELS[outlook] || outlook;
      };

      var SURVIVAL_BANDS = [
        { key: 'minor',     minPercent: 95, label: 'Minor' },
        { key: 'likely',    minPercent: 80, label: 'Likely survivable' },
        { key: 'treatable', minPercent: 60, label: 'Survivable with treatment' },
        { key: 'serious',   minPercent: 45, label: 'Serious' },
        { key: 'severe',    minPercent: 30, label: 'Severe' },
        { key: 'critical',  minPercent: 20, label: 'Critical' },
        { key: 'urgent',    minPercent: 10, label: 'Needs help immediately' },
        { key: 'grave',     minPercent: 1,  label: 'Almost certainly fatal' },
        { key: 'fatal',     minPercent: 0,  label: 'Not survivable' }
      ];

      function survivalBandFor(percent) {
        var p = typeof percent === 'number' && isFinite(percent) ? percent : 0;
        for (var i = 0; i < SURVIVAL_BANDS.length; i++) {
          if (p >= SURVIVAL_BANDS[i].minPercent) return SURVIVAL_BANDS[i];
        }
        return SURVIVAL_BANDS[SURVIVAL_BANDS.length - 1];
      }

      scope.survivalBandKey = function (percent) { return scope.survival && scope.survival.outlook === 'critical' ? 'critical' : survivalBandFor(percent).key; };

      scope.seatBandKey = function (percent) { return survivalBandFor(percent).key; };
      scope.survivalBandLabel = function (percent) { return scope.survival && scope.survival.outlook === 'critical' ? 'Critical - urgent care needed' : survivalBandFor(percent).label; };

      scope.formatRecoveryWeeks = function (weeks) {
        if (weeks === null || weeks === undefined) return 'N/A (fatal)';
        if (weeks === 0) return 'None';
        if (weeks === 1) return '1 week';
        return weeks + ' weeks';
      };

      var SYSTEMIC_AXES = [
        { key: 'consciousness', label: 'consciousness', warn: 'confused', critical: 'unresponsive' },
        { key: 'shock', label: 'shock', warn: 'early', critical: 'decompensated' },
        { key: 'bloodLoss', label: 'blood loss', warn: 'moderate', critical: 'severe' },
        { key: 'breathing', label: 'breathing', warn: null, critical: 'laboured' },
        { key: 'pain', label: 'pain', warn: 'moderate', critical: 'excruciating' },
        { key: 'vision', label: 'vision', warn: 'blurred', critical: 'lost' },
        { key: 'hearing', label: 'hearing', warn: 'muffled', critical: 'lost' },
        { key: 'mobility', label: 'mobility', warn: 'limited', critical: 'unable' },
        { key: 'selfExtract', label: 'self-extract', warn: 'wouldStruggle', critical: 'unable' }
      ];

      var SYSTEMIC_LEVEL_TEXT = { wouldStruggle: 'would struggle', unable: 'cannot', unresponsive: 'unconscious',
        decompensated: 'severe', laboured: 'struggling', excruciating: 'extreme' };

      function injuryText(inj) { return String(inj.name || inj.medicalName || inj.title || ''); }
      function conditionView(effects, injuries, dead) {
        if (dead) {
          return [{ key: 'status', label: 'status', level: 'deceased', levelText: 'deceased', tint: 'critical',
            plainDescription: 'No signs of life.' }];
        }
        var view = buildSystemicEffectsView(effects);
        var list = injuries || [];
        var bleed = 0;
        var breath = 0;
        list.forEach(function (inj) {
          if (!inj) return;
          var r = inj.region, a = inj.aisSeverity || 0, t = injuryText(inj);
          if (r === 'aorta' && a >= 4) bleed = Math.max(bleed, 3);
          if (/massive (haemorrhage|hemorrhage|bleeding)/i.test(t)) bleed = Math.max(bleed, 3);
          if (r === 'circulatory') bleed = Math.max(bleed, a >= 4 ? 3 : (a >= 3 ? 2 : 1));
          if (r === 'pelvis' && /haemorrhage|hemorrhage|open-book|bleeding/i.test(t)) bleed = Math.max(bleed, 2);
          if ((r === 'abdomen' || r === 'kidney') && a >= 4) bleed = Math.max(bleed, 2);
          if ((r === 'abdomen' || r === 'kidney') && a === 3) bleed = Math.max(bleed, 1);
          if (r === 'femur' && (a >= 3 || /open|compound/i.test(t))) bleed = Math.max(bleed, 2);
          if (/open fracture|vascular|bone through/i.test(t)) bleed = Math.max(bleed, 1);
          if (r === 'chest' && a >= 5) breath = 2;
          if ((r === 'chest' && a >= 4) || r === 'lung' || /flail|pneumothorax/i.test(t)) breath = Math.max(breath, 1);
          if (r === 'neck' && /cord/i.test(t) && a >= 5) breath = 2;
        });
        var BLEED_TEXT = ['', 'bleeding', 'heavy bleeding', 'massive bleeding'];
        view.forEach(function (v) {
          if (v.key === 'bloodLoss' && bleed > 0 && (v.level === 'none' || (v.level === 'moderate' && bleed >= 2))) {
            v.levelText = BLEED_TEXT[bleed];
            v.tint = bleed >= 2 ? 'critical' : 'warn';
          }
          if (v.key === 'breathing' && breath > 0) {
            if (breath === 2) { v.levelText = 'failing'; v.tint = 'critical'; }
            else if (v.level !== 'laboured') { v.levelText = 'struggling'; v.tint = 'critical'; }
          }
        });
        return view;
      }

      function buildSystemicEffectsView(effects) {
        if (!effects) return [];
        return SYSTEMIC_AXES.map(function (axis) {
          var entry = effects[axis.key];
          if (!entry) return null;
          var tint = entry.level === axis.critical ? 'critical' : (axis.warn && entry.level === axis.warn) ? 'warn' : 'normal';
          var levelText = SYSTEMIC_LEVEL_TEXT[entry.level] ||
            String(entry.level || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
          return { key: axis.key, label: axis.label, level: entry.level, levelText: levelText, plainDescription: entry.plainDescription, tint: tint };
        }).filter(function (x) { return x !== null; });
      }

      var MED_KIT_HALVED_AXIS_LEVELS = {
        consciousness: ['alert', 'confused', 'unresponsive'],
        shock: ['none', 'early', 'decompensated'],
        bloodLoss: ['none', 'moderate', 'severe'],
        pain: ['none', 'moderate', 'severe', 'excruciating']
      };
      function halvedLevel(axisKey, level) {
        var levels = MED_KIT_HALVED_AXIS_LEVELS[axisKey];
        var idx = levels ? levels.indexOf(level) : -1;
        return idx < 0 ? level : levels[Math.floor(idx / 2)];
      }

      function medKitAdjustedSystemicEffects(effects) {
        if (scope.patientProgressActive) return effects;
        if (!effects || !medKitActive) return effects;
        var out = {};
        for (var k in effects) { if (Object.prototype.hasOwnProperty.call(effects, k)) out[k] = effects[k]; }
        ['consciousness', 'shock', 'bloodLoss', 'pain'].forEach(function (axisKey) {
          var entry = effects[axisKey];
          if (!entry) return;
          out[axisKey] = { level: halvedLevel(axisKey, entry.level), plainDescription: entry.plainDescription };
        });
        return out;
      }

      function medKitAdjustedSurvival(survival) {
        if (scope.patientProgressActive) return survival;
        if (!survival || !medKitActive) return survival;
        var boosted = Math.round(survival.survivalProbabilityPercent + (100 - survival.survivalProbabilityPercent) * 0.5);
        var out = {};
        for (var k in survival) { if (Object.prototype.hasOwnProperty.call(survival, k)) out[k] = survival[k]; }
        out.survivalProbabilityPercent = boosted;
        return out;
      }

      var RESTRAINT_CONFIGS = ['beltedAirbag', 'beltedOnly', 'unbelted'];
      var RESTRAINT_CONFIG_LABELS = {
        beltedAirbag: 'Belted + airbag',
        beltedOnly: 'Belted only',
        unbelted: 'Unbelted'
      };

      scope.restraintConfig = 'beltedAirbag';
      scope.restraintConfigLabel = RESTRAINT_CONFIG_LABELS[scope.restraintConfig];
      scope.cycleRestraintConfig = function () {
        var idx = RESTRAINT_CONFIGS.indexOf(scope.restraintConfig);
        scope.restraintConfig = RESTRAINT_CONFIGS[(idx + 1) % RESTRAINT_CONFIGS.length];
        if (scope.settings && scope.settings.gear) {
          scope.settings.gear.driver = gearFromTier('driver', scope.restraintConfig);
          scope.restraintConfig = tierForGear('driver');
        }
        scope.restraintConfigLabel = scope.settings && scope.settings.gear ? gearLabelFor('driver') : RESTRAINT_CONFIG_LABELS[scope.restraintConfig];

        updateSeatbeltVisual();
      };

      scope.reportRestraintConfigLabel = null;

      function currentOccupant() {
        return {
          massKg: 75,
          age: 35,
          belted: scope.restraintConfig !== 'unbelted',
          airbag: scope.restraintConfig === 'beltedAirbag' && vehicleHasAirbags(),
          helmet: occupantGearFlags('driver').helmet,
          harness: occupantGearFlags('driver').harness,
          hans: occupantGearFlags('driver').hans,
          seat: 'driver'
        };
      }

      function endsWithSuffix(text, suffix) {
        return text.length >= suffix.length && text.slice(text.length - suffix.length) === suffix;
      }

      function splitCaveatSuffix(plainDescription) {
        var P = window.CrashInjuryProPipeline;
        var hedgeSuffix = (P && P.HEDGE_SUFFIX) || ' (likely)';
        var possibleSuffix = (P && P.POSSIBLE_SUFFIX) || ' (possible)';
        var lowerFidelitySuffix = (P && P.LOWER_FIDELITY_SUFFIX) || ' (uncertain -- no direct measurement for this)';

        if (endsWithSuffix(plainDescription, lowerFidelitySuffix)) {
          return {
            base: plainDescription.slice(0, plainDescription.length - lowerFidelitySuffix.length),
            caveatKind: 'lowerFidelity',
            caveatShort: lowerFidelitySuffix.replace(/^\s+|\s+$/g, '')
          };
        }
        if (endsWithSuffix(plainDescription, hedgeSuffix)) {
          return {
            base: plainDescription.slice(0, plainDescription.length - hedgeSuffix.length),
            caveatKind: 'hedge',
            caveatShort: hedgeSuffix.replace(/^\s+|\s+$/g, '')
          };
        }

        if (endsWithSuffix(plainDescription, possibleSuffix)) {
          return {
            base: plainDescription.slice(0, plainDescription.length - possibleSuffix.length),
            caveatKind: 'hedge',
            caveatShort: possibleSuffix.replace(/^\s+|\s+$/g, '')
          };
        }
        return { base: plainDescription, caveatKind: null, caveatShort: null };
      }

      function toFlatInjury(ri) {
        if (ri && ri.technical) {
          return {
            region: ri.region,
            aisSeverity: ri.technical.aisSeverity,
            name: ri.technical.name,

            clinicalDescription: ri.technical.clinicalDescription,
            mechanism: ri.technical.mechanism,
            plainDescription: ri.plainDescription,
            probability: ri.technical.probability,
            caveat: ri.technical.caveat,
            lowerFidelity: ri.technical.lowerFidelity
          };
        }
        return ri;
      }

      var FREE_FLIGHT_MAX_G = 2.5;

      var SPIN_DV_MARGIN = 1.2;
      var SPIN_DV_SLACK_MS = 2.0;

      function buildCrashTrace(payload) {
        var n = payload.gx.length;

        var freeFlightSamples = 0;
        var t = new Float64Array(n);
        var ax = new Float64Array(n);
        var ay = new Float64Array(n);
        var az = new Float64Array(n);

        for (var i = 0; i < n; i++) {
          t[i] = payload.t[i];

          var bz = payload.baselineGz ? payload.baselineGz[i] : 1;

          ax[i] = -payload.gy[i];

          ay[i] = payload.gx[i];
          az[i] = payload.gz[i] - bz;

          var coasting = Math.sqrt(ax[i] * ax[i] + ay[i] * ay[i] + az[i] * az[i]);
          if (payload.supportG && payload.supportG[i] < 0.35 && coasting < FREE_FLIGHT_MAX_G) {
            ax[i] = ay[i] = az[i] = 0;
            freeFlightSamples++;
          }
        }

        var spinScale = 1;
        var trueDv = Number(payload.trueDvMaxMs);
        if (payload.trueDvMaxMs !== null && payload.trueDvMaxMs !== undefined && Number.isFinite(trueDv) && n > 1) {
          var ix = 0, iy = 0, iz = 0, accelDvMax = 0;
          for (var q = 0; q < n - 1; q++) {
            var dtq = t[q + 1] - t[q];
            if (!(dtq > 0)) continue;
            ix += 0.5 * (ax[q] + ax[q + 1]) * 9.80665 * dtq;
            iy += 0.5 * (ay[q] + ay[q + 1]) * 9.80665 * dtq;
            iz += 0.5 * (az[q] + az[q + 1]) * 9.80665 * dtq;
            var m = Math.sqrt(ix * ix + iy * iy + iz * iz);
            if (m > accelDvMax) accelDvMax = m;
          }
          var allowed = trueDv * SPIN_DV_MARGIN + SPIN_DV_SLACK_MS;
          if (accelDvMax > allowed && accelDvMax > 0) {
            spinScale = allowed / accelDvMax;
            for (var r = 0; r < n; r++) { ax[r] *= spinScale; ay[r] *= spinScale; az[r] *= spinScale; }
          }
          if (window.bngApi && window.bngApi.engineLua) window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
            JSON.stringify('TRUE DV: measured=' + (accelDvMax / 0.44704).toFixed(1) + 'mph real=' + (trueDv / 0.44704).toFixed(1) +
              'mph' + (spinScale < 1 ? ' -> pulse scaled x' + spinScale.toFixed(2) + ' (spin, not impact)' : ' ok')) + ')');
        }

        var peakLatG = 0;
        var peakLongG = 0;
        for (var k = 0; k < n; k++) {
          var la = Math.abs(ay[k]);
          var lo = Math.abs(ax[k]);
          if (la > peakLatG) peakLatG = la;
          if (lo > peakLongG) peakLongG = lo;
        }
        return {
          sampleRateHz: payload.sampleRateHz, t: t, ax: ax, ay: ay, az: az,
          peakLateralG: peakLatG, peakLongitudinalG: peakLongG,
          freeFlightMs: payload.sampleRateHz > 0
            ? freeFlightSamples * 1000 / payload.sampleRateHz : 0
        };
      }

      function buildIntrusionFromPayload(payload) {
        return {
          available: !!payload.intrusionTrackingAvailable,
          roofDepthM: payload.intrusionRoofDepthM || 0,
          roofVelocityMs: payload.intrusionRoofVelocityMs || 0,
          doorDepthM: payload.intrusionDoorDepthM || 0,
          doorVelocityMs: payload.intrusionDoorVelocityMs || 0,
          dashDepthM: payload.intrusionDashDepthM || 0,
          dashVelocityMs: payload.intrusionDashVelocityMs || 0,
        };
      }

      function buildRolloverFromPayload(payload) {
        return {
          available: !!payload.rolloverTrackingAvailable,
          contactConfirmed: payload.rolloverContactConfirmed === true,

          quarterTurns: Math.min(ROLLOVER_MAX_QUARTER_TURNS, payload.rolloverQuarterTurns || 0),
          peakRollRateDegS: Math.min(ROLLOVER_MAX_RATE_DEG_S, payload.rolloverPeakRollRateDegS || 0),
          rollCagePresent: !!payload.rollCagePresent,

          roofContact: payload.rolloverRoofContact === true,
          sideContact: payload.rolloverSideContact === -1 ? -1 : (payload.rolloverSideContact === 1 ? 1 : 0),
          worstUpZ: typeof payload.rolloverWorstUpZ === 'number' ? payload.rolloverWorstUpZ : 1,
        };
      }

      var VERTICAL_SEVERITY_SCALE = 0.72;

      var VERTICAL_INJURY_FLOOR_MS = 7;

      var VERTICAL_INJURY_MIN_SHARE = 0.45;

      function softenVerticalLoading(loading, verticalDeltaVMs, deltaV) {
        if (!loading || typeof loading.compressionIndex !== 'number') return loading;
        var share = 0;
        if (deltaV) {
          var x = deltaV.dvxMs || 0, y = deltaV.dvyMs || 0, z = deltaV.dvzMs || 0;
          var tot = x * x + y * y + z * z;
          share = tot > 0 ? (z * z) / tot : 0;
        }

        if (!hasFallCredit()
            || Math.abs(verticalDeltaVMs || 0) < VERTICAL_INJURY_FLOOR_MS
            || share < VERTICAL_INJURY_MIN_SHARE) {
          var flat = {};
          for (var f in loading) {
            if (Object.prototype.hasOwnProperty.call(loading, f)) flat[f] = loading[f];
          }
          flat.compressionIndex = 0;
          return flat;
        }
        var out = {};
        for (var k in loading) {
          if (Object.prototype.hasOwnProperty.call(loading, k)) out[k] = loading[k];
        }
        out.compressionIndex = loading.compressionIndex * VERTICAL_SEVERITY_SCALE;
        return out;
      }

      var PULSE_CORE_FRACTION = 0.25;
      var PULSE_CORE_FLOOR_G = 3;
      var PULSE_MIN_MS = 20;

      function pulseDurationMs(filtered, sampleRateHz, event) {
        var fallback = (event.endTimeS - event.startTimeS) * 1000;
        if (!filtered || !(sampleRateHz > 0)) return fallback;
        var lo0 = event.startIndex, hi0 = Math.min(event.endIndex, filtered.length - 1);
        if (!(hi0 > lo0)) return fallback;
        var peak = 0, peakIdx = lo0;
        for (var i = lo0; i <= hi0; i++) {
          if (filtered[i] > peak) { peak = filtered[i]; peakIdx = i; }
        }
        if (!(peak > 0)) return fallback;
        var level = Math.max(PULSE_CORE_FLOOR_G, peak * PULSE_CORE_FRACTION);
        var lo = peakIdx, hi = peakIdx;
        while (lo > lo0 && filtered[lo - 1] >= level) lo--;
        while (hi < hi0 && filtered[hi + 1] >= level) hi++;
        var ms = (hi - lo + 1) * 1000 / sampleRateHz;
        return Math.max(PULSE_MIN_MS, Math.min(fallback, ms));
      }

      var ABRUPTNESS_REFERENCE_G = 25;
      var ABRUPTNESS_EXPONENT = 0.30;
      var ABRUPTNESS_MIN = 0.78;
      var ABRUPTNESS_MAX = 1.14;

      function abruptnessFactor(deltaVMs, durationMs) {
        if (!(deltaVMs > 0) || !(durationMs > 0)) return 1;
        var meanG = (deltaVMs / (durationMs / 1000)) / 9.81;
        if (!(meanG > 0)) return 1;
        var raw = Math.pow(meanG / ABRUPTNESS_REFERENCE_G, ABRUPTNESS_EXPONENT);
        return Math.max(ABRUPTNESS_MIN, Math.min(ABRUPTNESS_MAX, raw));
      }

      function softenedDeltaV(deltaV, durationMs) {
        if (!deltaV) return deltaV;
        var f = abruptnessFactor(deltaV.magnitudeMs, durationMs);
        if (Math.abs(f - 1) < 0.001) return deltaV;
        return {
          dvxMs: deltaV.dvxMs * f,
          dvyMs: deltaV.dvyMs * f,
          dvzMs: deltaV.dvzMs * f,
          magnitudeMs: deltaV.magnitudeMs * f,
          magnitudeWithVerticalMs: deltaV.magnitudeWithVerticalMs * f
        };
      }

      var CRASH_CAP_REFERENCE_MODERATE = 0.20;
      var CRASH_CAP_REFERENCE_EXTREME = 0.09;
      var CRASH_CAP_REFERENCE_LOW_MS = 40 * 0.44704;
      var CRASH_CAP_REFERENCE_HIGH_MS = 85 * 0.44704;

      var RESTRAINT_CAP_RELIEF = { beltedAirbag: 1.4, beltedOnly: 1.1, unbelted: 1 };

      function crashCapReferenceFor(deltaVMs, restraint) {
        var relief = RESTRAINT_CAP_RELIEF[restraint] || 1;
        if (!(deltaVMs > 0)) return CRASH_CAP_REFERENCE_MODERATE * relief;
        var t = (deltaVMs - CRASH_CAP_REFERENCE_LOW_MS) / (CRASH_CAP_REFERENCE_HIGH_MS - CRASH_CAP_REFERENCE_LOW_MS);
        t = Math.max(0, Math.min(1, t));
        var base = CRASH_CAP_REFERENCE_MODERATE + t * (CRASH_CAP_REFERENCE_EXTREME - CRASH_CAP_REFERENCE_MODERATE);

        return base * (1 + (relief - 1) * (1 - t));
      }

      var FREE_RESTRAINT_RIDEDOWN = { beltedAirbag: 0.845, beltedOnly: 0.86, unbelted: 1.18 };

      var SIDE_IMPACT_SEVERITY = 1.24;
      var OBLIQUE_IMPACT_SEVERITY = 1.06;

      function directionalSeverity(impactSide) {
        if (impactSide === 'left' || impactSide === 'right') return SIDE_IMPACT_SEVERITY;
        if (impactSide === 'oblique') return OBLIQUE_IMPACT_SEVERITY;
        return 1;
      }

      var DIRECTIONAL_CRITERION_WEIGHT = {
        front:   { head: 1.00, chest: 1.00, femur: 1.00 },
        oblique: { head: 0.95, chest: 1.05, femur: 0.65 },

        side:    { head: 1.05, chest: 1.45, femur: 0.30 },
        rear:    { head: 0.60, chest: 0.35, femur: 0.15 }
      };

      function directionalWeights(impactSide) {
        if (impactSide === 'rear') return DIRECTIONAL_CRITERION_WEIGHT.rear;
        if (impactSide === 'left' || impactSide === 'right') return DIRECTIONAL_CRITERION_WEIGHT.side;
        if (impactSide === 'oblique') return DIRECTIONAL_CRITERION_WEIGHT.oblique;
        return DIRECTIONAL_CRITERION_WEIGHT.front;
      }

      var AORTA_MIN_DELTAV_MS = 22;

      var EMPTY_DRAW_FLOOR_MS = 13.5;

      var DERIVED_FINDING_SOURCE = { lung: 'chest', diaphragm: 'abdomen' };

      function dropOrphanedDerivedFindings(list) {
        var present = {};
        (list || []).forEach(function (inj) { if (inj && inj.region) present[inj.region] = true; });
        return (list || []).filter(function (inj) {
          if (!inj) return false;
          var src = DERIVED_FINDING_SOURCE[inj.region];
          if (src && !present[src]) return false;

          var bleedFrom = /^haemorrhage-from-(.+)$/.exec(inj.mechanism || '');
          if (bleedFrom && !present[bleedFrom[1]]) return false;
          return true;
        });
      }

      function drawRealisedFindings(injuries, seed, worstDeltaVMs) {
        var kept = dropOrphanedDerivedFindings(drawRealisedFindingsRaw(injuries, seed));
        if (kept.length || !(worstDeltaVMs > EMPTY_DRAW_FLOOR_MS)) return kept;
        var best = null;
        (injuries || []).forEach(function (inj) {
          if (!inj) return;

          if (inj.region === 'circulatory' || DERIVED_FINDING_SOURCE[inj.region]) return;
          if (/^haemorrhage-from-/.test(inj.mechanism || '')) return;
          var p = typeof inj.probability === 'number' ? inj.probability : 1;
          if (!(p > 0)) return;
          var bp = best && typeof best.probability === 'number' ? best.probability : -1;
          if (!best || p > bp) best = inj;
        });
        return best ? [best] : kept;
      }

      function drawRealisedFindingsRaw(injuries, seed) {
        return (injuries || []).filter(function (inj) {
          if (!inj) return false;
          var p = typeof inj.probability === 'number' ? inj.probability : 1;
          if (p >= 0.999) return true;
          if (p <= 0) return false;

          var key = inj.region || '';
          var bleedFrom = /^haemorrhage-from-(.+)$/.exec(inj.mechanism || '');
          if (bleedFrom) key = bleedFrom[1];

          if (DERIVED_FINDING_SOURCE[key]) key = DERIVED_FINDING_SOURCE[key];
          var h = 2166136261;
          for (var i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = (h * 16777619) >>> 0;
          }
          h = (h ^ (seed >>> 0)) >>> 0;
          h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
          h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
          return ((h >>> 8) / 16777216) < p;
        });
      }

      var LIMB_CRUSH_DELTAV_MS = 34;
      var LIMB_DESTROYED_DELTAV_MS = 44;
      var LIMB_CRUSH_RAMP_MS = 11;
      var LIMB_CRUSH_MAX_PROBABILITY = 0.55;
      var SIDE_LIMB_REGIONS = ['upperArm', 'forearm', 'wrist', 'hand'];
      var FRONT_LIMB_REGIONS = ['lowerLeg', 'ankle', 'foot', 'femur'];

      function addCrushFindings(injuries, worstDeltaVMs, impactSide, seatKey) {
        if (!(worstDeltaVMs >= LIMB_CRUSH_DELTAV_MS)) return injuries;
        var destroyed = worstDeltaVMs >= LIMB_DESTROYED_DELTAV_MS;
        var lateral = impactSide === 'left' || impactSide === 'right';
        var regions = lateral ? SIDE_LIMB_REGIONS : FRONT_LIMB_REGIONS;
        var out = [];
        var replaced = false;
        (injuries || []).forEach(function (inj) {
          if (!replaced && inj && regions.indexOf(inj.region) !== -1) {
            replaced = true;
            var part = lateral ? 'arm' : 'leg';
            var clone = {};
            for (var k in inj) {
              if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
            }
            clone.aisSeverity = destroyed ? 6 : 5;
            clone.continuousSeverity = clone.aisSeverity;

            var over = worstDeltaVMs - (destroyed ? LIMB_DESTROYED_DELTAV_MS : LIMB_CRUSH_DELTAV_MS);
            clone.probability = Math.max(0, Math.min(LIMB_CRUSH_MAX_PROBABILITY,
              LIMB_CRUSH_MAX_PROBABILITY * (over / LIMB_CRUSH_RAMP_MS)));

            if (!lateral && seatCornerExposure(seatKey ? seatDef(seatKey) : null, impactSide) < 0) {
              clone.probability *= 0.3;
            }
            if (!(clone.probability > 0)) { out.push(inj); replaced = false; return; }
            clone.name = destroyed
              ? ('Destroyed ' + part + ' (unsalvageable)')
              : ('Crush injury of the ' + part);
            clone.plainDescription = destroyed
              ? ('Your ' + part + ' has been crushed beyond saving.')
              : ('Your ' + part + ' was crushed by the structure coming in around you.');
            clone.mechanism = lateral ? 'door-intrusion-limb-crush' : 'footwell-intrusion-limb-crush';
            clone.lowerFidelity = true;
            out.push(clone);
            return;
          }
          out.push(inj);
        });
        return out;
      }

      var WHIPLASH_MIN_DELTAV_MS = 3.5;
      var WHIPLASH_SEVERE_DELTAV_MS = 7.5;

      function addRearWhiplash(injuries, worstDeltaVMs, impactSide, eventIndex) {
        if (impactSide !== 'rear') return injuries;
        if (!(worstDeltaVMs >= WHIPLASH_MIN_DELTAV_MS)) return injuries;
        var already = (injuries || []).some(function (inj) {
          return inj && (inj.region === 'neck' || inj.region === 'cervicalSpine');
        });
        if (already) return injuries;
        var severe = worstDeltaVMs >= WHIPLASH_SEVERE_DELTAV_MS;
        return (injuries || []).concat([{
          eventIndex: eventIndex || 0,
          region: 'neck',
          aisSeverity: severe ? 2 : 1,
          continuousSeverity: severe ? 2 : 1,
          probability: 1,
          name: severe ? 'Whiplash (cervical strain)' : 'Neck strain',
          plainDescription: severe
            ? 'Your neck was snapped backwards over the seat and is badly strained.'
            : 'Your neck is strained and stiff.',
          clinicalDescription: 'Cervical acceleration-deceleration injury from rearward loading.',
          mechanism: 'rear-impact-cervical-hyperextension',
          lowerFidelity: true
        }]);
      }

      var LOW_FIDELITY_BASE_CAP = 2;
      var LOW_FIDELITY_DELTAV_PER_EXTRA_MS = 14;
      var LOW_FIDELITY_MAX_CAP = 6;

      var EXTREMITY_REGIONS = {
        upperArm: 1, forearm: 1, wrist: 1, hand: 1,
        lowerLeg: 1, ankle: 1, foot: 1
      };

      var LIMB_ARM_REGIONS = { upperArm: 1, forearm: 1, wrist: 1, hand: 1 };
      var LIMB_LEG_REGIONS = { lowerLeg: 1, ankle: 1, foot: 1 };

      var ARM_FRONTAL_MIN_DELTAV_MS = 29;
      var LEG_FRONTAL_MIN_DELTAV_MS = 20;

      function limbFindingAllowed(region, impactSide, restraintTier, seatKey, worstDeltaVMs) {
        if (restraintTier === 'unbelted') return true;
        var lateral = impactSide === 'left' || impactSide === 'right';
        if (lateral) {
          var def = seatKey ? seatDef(seatKey) : null;
          if (!def) return true;
          var seatSide = SEAT_SIDE_MATCHES_IMPACT_SIDE
            ? def.side
            : (def.side === 'left' ? 'right' : 'left');
          return seatSide === impactSide;
        }
        if (LIMB_ARM_REGIONS[region]) return worstDeltaVMs >= ARM_FRONTAL_MIN_DELTAV_MS;
        if (LIMB_LEG_REGIONS[region]) {
          var legDef = seatKey ? seatDef(seatKey) : null;
          var corner = impactSide === 'front' ? seatCornerExposure(legDef, 'front') : 0;
          if (corner < 0) return worstDeltaVMs >= ARM_FRONTAL_MIN_DELTAV_MS;
          if (corner > 0 && legDef.row === 'front' &&
              seatCornerCrushM(legDef, 'front') >= CRUSH_FOOTWELL_M &&
              worstDeltaVMs >= CRUSH_FOOTWELL_MIN_DELTAV_MS) return true;
          return worstDeltaVMs >= LEG_FRONTAL_MIN_DELTAV_MS;
        }
        return true;
      }

      function lowFidelityCap(worstDeltaVMs) {
        var extra = Math.floor((worstDeltaVMs || 0) / LOW_FIDELITY_DELTAV_PER_EXTRA_MS);
        return Math.max(1, Math.min(LOW_FIDELITY_MAX_CAP, LOW_FIDELITY_BASE_CAP + extra));
      }

      function lateraliseLimbFindings(injuries, seatKey) {
        var seed = (scenarioSeed ^ seatSeedFor({ seatKey: seatKey })) >>> 0;

        var limbDef = seatKey ? seatDef(seatKey) : null;
        var forcedSide = null;
        if (limbDef) {
          var ca = crushAsymmetry();
          var phys = seatPhysicalSide(limbDef);

          var limbPdof = activeImpact ? activeImpact.pdofDeg : sessionImpactPdofDeg;
          var corner = Number.isFinite(limbPdof)
            ? endOffsetFor(impactDirection(limbPdof)) : ca.front;
          if (Math.abs(corner) >= CRUSH_NEAR_SIDE_MIN && phys * corner > 0) forcedSide = phys > 0 ? 'Right' : 'Left';
          else if (Math.abs(ca.side) >= CRUSH_SIDE_OVERRIDE && phys * ca.side > 0) forcedSide = phys > 0 ? 'Right' : 'Left';
        }
        return (injuries || []).map(function (inj) {
          if (!inj) return inj;

          var lateralisable = LIMB_ARM_REGIONS[inj.region] || LIMB_LEG_REGIONS[inj.region]
            || inj.region === 'femur';
          if (!lateralisable) return inj;
          var name = inj.name || '';
          if (/\b(left|right)\b/i.test(name)) return inj;
          var key = String(inj.region);
          var h = 2166136261;
          for (var i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = (h * 16777619) >>> 0;
          }
          h = (h ^ seed) >>> 0;
          h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
          var side = forcedSide || ((h >>> 8) % 2 ? 'Right' : 'Left');
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          clone.name = side + ' ' + name.charAt(0).toLowerCase() + name.slice(1);
          return clone;
        });
      }

      var TORSO_LATERAL_MIN_SHARE = 0.35;
      var TORSO_SIDED_REGIONS = { chest: 1, abdomen: 1, pelvis: 1, kidney: 1, lung: 1 };

      function withSideWord(inj, side) {
        var name = inj.name || '';
        if (/\b(left|right)\b/i.test(name) || /hepatic|liver|splen/i.test(name)) return inj;
        var clone = {};
        for (var k in inj) {
          if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
        }
        clone.name = name + ' (' + side + ' side)';
        return clone;
      }

      function lateraliseTorsoFindings(injuries, seatKey, lateralSide, restraintTier) {
        var def = seatKey ? seatDef(seatKey) : null;
        var side = lateralSide;
        if (!side && def) {
          var corner = seatCornerExposure(def, 'front');
          if (corner > 0) side = def.side;
        }
        var outboard = def ? def.side : null;
        return (injuries || []).map(function (inj) {
          if (!inj) return inj;
          if (side && TORSO_SIDED_REGIONS[inj.region]) return withSideWord(inj, side);
          if (!side && outboard && restraintTier !== 'unbelted' && /clavicle/i.test(inj.name || '')) {
            var clone = {};
            for (var k in inj) {
              if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
            }
            clone.name = (outboard === 'left' ? 'Left ' : 'Right ') + inj.name.charAt(0).toLowerCase() + inj.name.slice(1);
            return clone;
          }
          return inj;
        });
      }

      var BELT_CHEST_CERTAIN_DELTAV_MS = 15;

      var BELT_CHEST_PROBABILITY_FLOOR = 0.70;

      function floorBeltChestFinding(injuries, worstDeltaVMs, impactSide, restraintTier) {
        if (restraintTier === 'unbelted') return injuries;
        if (impactSide === 'rear') return injuries;
        if (!(worstDeltaVMs >= BELT_CHEST_CERTAIN_DELTAV_MS)) return injuries;
        return (injuries || []).map(function (inj) {
          if (!inj || inj.region !== 'chest') return inj;
          var p = typeof inj.probability === 'number' ? inj.probability : 1;

          var floorP = BELT_CHEST_PROBABILITY_FLOOR + (0.95 - BELT_CHEST_PROBABILITY_FLOOR) * rampP(worstDeltaVMs, 27, 36);
          if (p >= floorP) return inj;
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          clone.probability = floorP;
          return clone;
        });
      }

      function thinBandedFindings(injuries, worstDeltaVMs, impactSide, restraintTier, seatKey) {
        var cap = lowFidelityCap(worstDeltaVMs);

        var lateral = impactSide === 'left' || impactSide === 'right';
        var limbCap = (restraintTier === 'unbelted') ? cap : (lateral ? 2 : 1);
        var kept = [];
        var limbs = [];
        var torso = [];
        (injuries || []).forEach(function (inj) {
          if (!inj || !inj.lowerFidelity) { kept.push(inj); return; }

          if (inj.region === 'neck' || inj.region === 'chest') { kept.push(inj); return; }
          if (EXTREMITY_REGIONS[inj.region]) {
            if (limbFindingAllowed(inj.region, impactSide, restraintTier, seatKey, worstDeltaVMs)) {
              limbs.push(inj);
            }
            return;
          }
          torso.push(inj);
        });

        var bySeverity = function (a, b) {
          var av = (a.aisSeverity || 0) * 100 + (a.probability || 0) * 10;
          var bv = (b.aisSeverity || 0) * 100 + (b.probability || 0) * 10;
          return bv - av;
        };
        limbs.sort(bySeverity);
        torso.sort(bySeverity);
        return kept.concat(limbs.slice(0, limbCap)).concat(torso.slice(0, cap));
      }

      var AORTA_RARITY = 0.16;

      var AORTA_BELTED_RARITY = 0.35;
      var AORTA_AIRBAG_RARITY = 0.70;

      function rarifyAorticFindings(injuries, restraintTier) {
        return (injuries || []).map(function (inj) {
          if (!inj) return inj;
          var isAorta = inj.region === 'aorta'
            || /aorta/i.test(inj.mechanism || '');
          if (!isAorta) return inj;
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          var rarity = AORTA_RARITY;
          if (restraintTier !== 'unbelted') rarity *= AORTA_BELTED_RARITY;
          if (restraintTier === 'beltedAirbag') rarity *= AORTA_AIRBAG_RARITY;
          clone.probability = Math.max(0, Math.min(1,
            (typeof inj.probability === 'number' ? inj.probability : 1) * rarity));
          return clone;
        });
      }

      var REAL_WORLD_INCIDENCE = {
        femur: 0.16,
        lowerLeg: 0.30, ankle: 0.30, foot: 0.30,
        abdomen: 0.30, kidney: 0.30, bowel: 0.30, pancreas: 0.30,

        diaphragm: 0.03,
        head: 0.42,

        upperArm: 0.35, forearm: 0.35, wrist: 0.35, hand: 0.35,

        thoracicSpine: 0.15,
        lumbarSpine: 0.22
      };

      var SPINE_SEVERE_RARITY = 0.25;

      function softenSpineFractures(injuries, seatKey) {
        var seed = (scenarioSeed ^ seatSeedFor({ seatKey: seatKey }) ^ 0x51ed270b) >>> 0;
        var h = Math.imul(seed ^ 0x85ebca6b, 2246822507) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
        var roll = (h >>> 8) / 16777216;
        return (injuries || []).map(function (inj) {
          if (!inj || (inj.region !== 'thoracicSpine' && inj.region !== 'lumbarSpine')) return inj;
          if (/vertical/i.test(inj.mechanism || '')) return inj;
          if (!(inj.aisSeverity >= 3)) return inj;
          if (roll < SPINE_SEVERE_RARITY) return inj;
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          clone.aisSeverity = 2;
          clone.continuousSeverity = Math.min(inj.continuousSeverity || 2, 2.6);
          clone.name = 'Vertebral compression fracture';
          clone.clinicalDescription = 'Stable compression fracture of a ' +
            (inj.region === 'lumbarSpine' ? 'lumbar' : 'thoracic') + ' vertebral body (AIS 2).';
          clone.plainDescription = 'A bone in your spine is cracked. It is stable and your spinal cord is not involved.';
          return clone;
        });
      }

      var NECK_FRACTURE_RARITY = 0.12;

      function softenNeckFractures(injuries, seatKey) {
        var seed = (scenarioSeed ^ seatSeedFor({ seatKey: seatKey })) >>> 0;
        var h = Math.imul(seed ^ 0x9e3779b9, 2246822507) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
        var roll = (h >>> 8) / 16777216;
        return (injuries || []).map(function (inj) {
          if (!inj || inj.region !== 'neck') return inj;
          if (!(inj.aisSeverity >= 3)) return inj;
          if (roll < NECK_FRACTURE_RARITY) return inj;
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          clone.aisSeverity = 2;
          clone.continuousSeverity = Math.min(inj.continuousSeverity || 2, 2.6);
          clone.name = 'Cervical sprain/strain';
          clone.clinicalDescription = 'Cervical strain without fracture (AIS 2).';
          clone.plainDescription = 'Your neck was wrenched hard. It is not broken, but it will hurt for weeks.';
          return clone;
        });
      }

      var INCIDENCE_TOWARD_CERTAIN = { beltedAirbag: 0, beltedOnly: 0.25, unbelted: 0.75 };

      function applyRealWorldIncidence(injuries, restraintTier, seatDeltaVMs) {
        var toward = INCIDENCE_TOWARD_CERTAIN[restraintTier] || 0;

        toward = Math.max(toward, rampP(Math.max(sessionVehicleDeltaVMs, seatDeltaVMs || 0), 30, 40));
        return (injuries || []).map(function (inj) {
          if (!inj) return inj;
          var scale = REAL_WORLD_INCIDENCE[inj.region];
          if (!scale) return inj;

          if (inj.region !== 'diaphragm') scale = scale + (1 - scale) * toward;
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          clone.probability = Math.max(0, Math.min(1,
            (typeof inj.probability === 'number' ? inj.probability : 1) * scale));
          return clone;
        });
      }

      function gateImplausibleFindings(injuries, worstDeltaVMs) {
        if (worstDeltaVMs >= AORTA_MIN_DELTAV_MS) return injuries;
        return (injuries || []).filter(function (inj) {
          if (!inj) return false;
          if (inj.region === 'aorta') return false;
          if (/haemorrhage-from-aorta/.test(inj.mechanism || '')) return false;
          return true;
        });
      }

      function scaledDeltaV(deltaV, factor) {
        if (!deltaV || Math.abs(factor - 1) < 0.001) return deltaV;
        return {
          dvxMs: deltaV.dvxMs * factor,
          dvyMs: deltaV.dvyMs * factor,
          dvzMs: deltaV.dvzMs * factor,
          magnitudeMs: deltaV.magnitudeMs * factor,
          magnitudeWithVerticalMs: deltaV.magnitudeWithVerticalMs * factor
        };
      }

      function seatSeedFor(options) {
        var key = (options && options.seatKey) || 'driver';
        var h = 2166136261;
        for (var i = 0; i < key.length; i++) {
          h ^= key.charCodeAt(i);
          h = (h * 16777619) >>> 0;
        }
        return h >>> 0;
      }

      var ROLL_TUMBLE_MAX_DELTAV_MS = 13;
      var ROLL_TUMBLE_DAMPING = 0.35;

      function rollTumbleDamping(rollover, eventDeltaVMs) {
        if (!rollover || !rollover.available || !rollover.contactConfirmed) return 1;
        if (sessionRolloverQuarterTurns < 1) return 1;
        if (!(eventDeltaVMs > 0) || eventDeltaVMs >= ROLL_TUMBLE_MAX_DELTAV_MS) return 1;

        var t = eventDeltaVMs / ROLL_TUMBLE_MAX_DELTAV_MS;
        return ROLL_TUMBLE_DAMPING + (1 - ROLL_TUMBLE_DAMPING) * t * t;
      }

      var REAR_ROW_CRITERION_WEIGHT = {
        belted:   { head: 0.45, chest: 0.68, femur: 0.35 },

        unbelted: { head: 1.45, chest: 1.22, femur: 1.10 }
      };

      var FAR_SIDE_CRITERION_WEIGHT = { head: 1.60, chest: 0.85, femur: 0.80 };

      var LATERAL_HEAD_HIC_COEFF = 6.67;
      var LATERAL_HEAD_HIC_EXPONENT = 1.75;
      var FRONTAL_HEAD_HIC_COEFF = 0.833;
      var FRONTAL_HEAD_HIC_EXPONENT = 2.32;
      var HEAD_SURROGATE_MIN_DELTAV_MS = 5;

      function headHicSurrogate(deltaVMs, side) {
        var v = Math.abs(deltaVMs || 0);
        if (!(v > HEAD_SURROGATE_MIN_DELTAV_MS)) return 0;
        if (side === 'left' || side === 'right') {
          return LATERAL_HEAD_HIC_COEFF * Math.pow(v, LATERAL_HEAD_HIC_EXPONENT);
        }
        return FRONTAL_HEAD_HIC_COEFF * Math.pow(v, FRONTAL_HEAD_HIC_EXPONENT);
      }

      function farSideCriterionWeight(seatKey, impactSide) {
        if (impactSide !== 'left' && impactSide !== 'right') return null;
        var def = seatKey ? seatDef(seatKey) : null;
        if (!def) return null;
        var seatSide = SEAT_SIDE_MATCHES_IMPACT_SIDE
          ? def.side
          : (def.side === 'left' ? 'right' : 'left');
        return seatSide === impactSide ? null : FAR_SIDE_CRITERION_WEIGHT;
      }

      var CHEST_INDEX_CALIBRATION = 0.80;

      var FEMUR_INDEX_KNEE_N = 44000;
      var FEMUR_INDEX_KNEE_OUT_N = 6000;
      var FEMUR_INDEX_ABOVE_KNEE = 0.172;
      var FEMUR_INDEX_BELOW_KNEE = 6000 / 44000;

      function calibratedFemurN(rawN) {
        if (!(rawN > 0)) return 0;
        if (rawN <= FEMUR_INDEX_KNEE_N) return rawN * FEMUR_INDEX_BELOW_KNEE;
        return FEMUR_INDEX_KNEE_OUT_N + (rawN - FEMUR_INDEX_KNEE_N) * FEMUR_INDEX_ABOVE_KNEE;
      }

      var AIRBAG_CRITERION_RELIEF = { head: 0.55, chest: 0.92, femur: 1.00 };

      var DRIVER_CONTACT_WEIGHT = { head: 1.08, chest: 1.07, femur: 1.02 };

      function driverContactWeight(seatKey, impactSide, pdofDeg) {
        if (seatKey !== 'driver') return null;
        if (impactSide !== 'front' && impactSide !== 'oblique') return null;

        var share = Number.isFinite(pdofDeg) ? driverPenaltyShare(impactDirection(pdofDeg)) : 1;
        if (share >= 1) return DRIVER_CONTACT_WEIGHT;
        return {
          head: 1 + (DRIVER_CONTACT_WEIGHT.head - 1) * share,
          chest: 1 + (DRIVER_CONTACT_WEIGHT.chest - 1) * share,
          femur: 1 + (DRIVER_CONTACT_WEIGHT.femur - 1) * share
        };
      }

      function airbagRelief(seatKey, restraintTier, impactSide) {
        if (restraintTier !== 'beltedAirbag') return null;

        if (impactSide !== 'front' && impactSide !== 'oblique') return null;
        var def = seatKey ? seatDef(seatKey) : null;
        if (def && def.row === 'rear') return null;
        return AIRBAG_CRITERION_RELIEF;
      }

      var REAR_CHEST_FADE_FROM_MS = 22;
      var REAR_CHEST_FADE_TO_MS = 32;

      function rowCriterionWeight(seatKey, impactSide, restraintTier) {
        var def = seatKey ? seatDef(seatKey) : null;
        if (!def || def.row !== 'rear') return null;
        if (impactSide === 'rear') return null;
        if (restraintTier === 'unbelted') return REAR_ROW_CRITERION_WEIGHT.unbelted;
        var w = REAR_ROW_CRITERION_WEIGHT.belted;
        var fade = rampP(sessionVehicleDeltaVMs, REAR_CHEST_FADE_FROM_MS, REAR_CHEST_FADE_TO_MS);
        if (!(fade > 0)) return w;

        return { head: w.head + (0.6 - w.head) * fade, chest: w.chest + (1 - w.chest) * fade, femur: w.femur };
      }

      var OBLIQUE_COMPONENT_FLOOR = 0.12;

      function obliqueComponents(pdofInfo) {
        var side = pdofInfo ? pdofInfo.impactSide : 'front';
        var deg = pdofInfo ? pdofInfo.pdofDeg : 0;
        if ((side === 'left' || side === 'right') && Number.isFinite(deg)) {
          var sDir = impactDirection(deg);
          var sSign = struckLateralSign(sDir);
          if (sSign) side = sSign > 0 ? 'right' : 'left';
          return [{ side: side, share: 1 }];
        }
        if (side !== 'oblique' || !Number.isFinite(deg)) {
          return [{ side: side || 'front', share: 1 }];
        }
        var rad = deg * Math.PI / 180;
        var lon = Math.abs(Math.cos(rad));
        var lat = Math.abs(Math.sin(rad));
        var out = [];
        if (lon >= OBLIQUE_COMPONENT_FLOOR) {
          out.push({ side: Math.cos(rad) >= 0 ? 'front' : 'rear', share: lon });
        }
        if (lat >= OBLIQUE_COMPONENT_FLOOR) {
          var oSign = struckLateralSign(impactDirection(deg)) || (Math.sin(rad) >= 0 ? 1 : -1);
          out.push({ side: oSign > 0 ? 'right' : 'left', share: lat });
        }
        if (!out.length) out.push({ side: 'front', share: 1 });
        return out;
      }

      function computeCrashInjuries(trace, occupant, proEventInputs, restraintTier, bias, worstDeltaVMs, options, rollover) {
        var PRO = window.CrashInjuryProPipeline;
        var FREE = window.CrashInjuryPipeline;

        var proAll = PRO.computeInjuries(proEventInputs);
        var verticalOnly = proAll.filter(function (inj) {
          return inj && /vertical/i.test(inj.mechanism || '');
        });

        if (!FREE || typeof FREE.computeInjuries !== 'function') {
          return realiseCrashSeverity(proAll, worstDeltaVMs, bias, restraintTier);
        }

        var crash = [];
        try {
          var res = FREE.resultant(trace.ax, trace.ay, trace.az);
          var filtered = FREE.cfcLowpass(res, trace.sampleRateHz, FREE.CFC.CFC_180).signal;
          var events = FREE.segmentEvents(trace.t, trace.sampleRateHz, filtered);
          var ridedown = FREE_RESTRAINT_RIDEDOWN[restraintTier] || 1;
          var freeInputs = [];
          var torsoLateralSide = null;
          var torsoLateralShare = 0;
          events.forEach(function (event, i) {
            var response = FREE.computeOccupantResponse(trace, event, occupant);
            var len = response.head.ax.length;
            var te = trace.t.length === len
              ? trace.t
              : trace.t.slice(event.startIndex, event.startIndex + len);
            var dv = capDeltaV(trace, FREE.deltaVForEvent(trace, event));
            var pdofInfo = FREE.pdof(trace, event);

            var horizMs = Math.sqrt(dv.dvxMs * dv.dvxMs + dv.dvyMs * dv.dvyMs);
            var horizFrac = dv.magnitudeMs > 0 ? Math.min(1, horizMs / dv.magnitudeMs) : 1;
            var hic = FREE.computeHIC15(response.head, te, trace.sampleRateHz);
            var chest = FREE.computeChest3ms(response.chest, te, trace.sampleRateHz);
            var femur = FREE.computeFemurLoad(response.femur, te, trace.sampleRateHz);

            var durationMs = pulseDurationMs(filtered, trace.sampleRateHz, event);
            var softened = softenedDeltaV(dv, durationMs);

            obliqueComponents(pdofInfo).forEach(function (comp) {
              var side = comp.side;
              if ((side === 'left' || side === 'right') && comp.share > torsoLateralShare) {
                torsoLateralShare = comp.share;
                torsoLateralSide = side;
              }
              var w = directionalWeights(side);
              var row = rowCriterionWeight(options && options.seatKey, side, restraintTier);
              if (row) {
                w = { head: w.head * row.head, chest: w.chest * row.chest,
                      femur: w.femur * row.femur };
              }
              var far = farSideCriterionWeight(options && options.seatKey, side);
              if (far) {
                w = { head: w.head * far.head, chest: w.chest * far.chest,
                      femur: w.femur * far.femur };
              }
              var wheel = driverContactWeight(options && options.seatKey, side,
                pdofInfo ? pdofInfo.pdofDeg : NaN);
              if (wheel) {
                w = { head: w.head * wheel.head, chest: w.chest * wheel.chest,
                      femur: w.femur * wheel.femur };
              }
              var bag = airbagRelief(options && options.seatKey, restraintTier, side);
              if (bag) {
                w = { head: w.head * bag.head, chest: w.chest * bag.chest,
                      femur: w.femur * bag.femur };
              }

              var componentDeltaVMs = softened.magnitudeMs * comp.share * ridedown * horizFrac;
              var rawHic = Math.max(hic.hicIndex,
                headHicSurrogate(componentDeltaVMs, comp.side));
              var hicIndex = Math.max(0, rawHic * w.head * comp.share * horizFrac * horizFrac);
              var chest3msG = Math.max(0, chest.chest3msG * CHEST_INDEX_CALIBRATION * w.chest * comp.share * horizFrac);
              var femurN = Math.max(0, calibratedFemurN(femur.femurForceIndexN) * w.femur * comp.share * horizFrac);
              freeInputs.push({
              eventIndex: i,
              impactSide: side,
              deltaV: scaledDeltaV(
                softened,
                comp.share * ridedown * rollTumbleDamping(rollover, dv.magnitudeMs)
                  * directionalSeverity(side) * horizFrac
              ),
              restraint: restraintTier,

              risks: [
                FREE.headRiskCumulativeNormal(hicIndex, 2),
                FREE.headRiskCumulativeNormal(hicIndex, 3),
                FREE.headRiskCumulativeNormal(hicIndex, 4),
                FREE.chestRisk(chest3msG, 2),
                FREE.chestRisk(chest3msG, 3),
                FREE.chestRisk(chest3msG, 4),
                FREE.femurRisk(femurN)
              ]
              });
            });
          });
          var primarySide = freeInputs.length ? freeInputs[0].impactSide : 'front';
          crash = gateImplausibleFindings(FREE.computeInjuries(freeInputs), worstDeltaVMs);
          crash = thinBandedFindings(crash, worstDeltaVMs, primarySide, restraintTier,
            options && options.seatKey);
          crash = rarifyAorticFindings(crash, restraintTier);
          crash = floorBeltChestFinding(crash, worstDeltaVMs, primarySide, restraintTier);
          crash = applyRealWorldIncidence(crash, restraintTier, worstDeltaVMs);
          crash = softenNeckFractures(crash, options && options.seatKey);
          crash = softenSpineFractures(crash, options && options.seatKey);
          crash = lateraliseLimbFindings(crash, options && options.seatKey);
          crash = lateraliseTorsoFindings(crash, options && options.seatKey,
            torsoLateralShare >= TORSO_LATERAL_MIN_SHARE ? torsoLateralSide : null, restraintTier);
          crash = addRearWhiplash(crash, worstDeltaVMs, primarySide, 0);
          crash = addCrushFindings(crash, worstDeltaVMs, primarySide, options && options.seatKey);
        } catch (e) {
          console.error('[CrashInjuryPro] free crash layer failed, falling back to pro:', e);
          return realiseCrashSeverity(proAll, worstDeltaVMs, bias, restraintTier);
        }

        return crash.concat(verticalOnly);
      }

      function realiseCrashSeverity(injuries, deltaVMs, susceptibility, restraint) {
        var ref = crashCapReferenceFor(deltaVMs, restraint);
        var bias = typeof susceptibility === 'number' && susceptibility > 0 ? susceptibility : 1;
        return (injuries || []).map(function (inj) {
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          var ais = typeof inj.aisSeverity === 'number' ? inj.aisSeverity : 1;
          var cs = typeof inj.continuousSeverity === 'number' ? inj.continuousSeverity : ais;
          clone.continuousSeverity = Math.max(cs, ais);
          var p = typeof inj.probability === 'number' ? inj.probability : 1;
          clone.probability = Math.max(0, Math.min(1, (p / ref) * bias));
          return clone;
        });
      }

      var MOD_INJURY_INCLUSION_PROBABILITY_THRESHOLD = 0.10;

      var sessionRolloverQuarterTurns = 0;
      var sessionRolloverPeakRateDegS = 0;
      var sessionRollPeakG = 0;

      function rollIntensity() {
        var rate = Math.min(sessionRolloverPeakRateDegS || 0, 900);
        var byRate = Math.max(0, Math.min(1, (rate - 150) / 450));
        var byHit = Math.max(0, Math.min(1, (sessionRollPeakG - 6) / 22));
        return Math.max(0.2, Math.min(1, 0.55 * byRate + 0.45 * byHit + 0.1));
      }

      function effectiveRollTurns() {
        var qt = sessionRolloverQuarterTurns || 0;
        return qt * rollIntensity();
      }
      var sessionRollCagePresent = false;

      var sessionRolloverRoofContact = false;
      var sessionRolloverSideContact = 0;
      var sessionRolloverWorstUpZ = 1;
      var ROLLOVER_MAX_QUARTER_TURNS = 16;
      var ROLLOVER_MAX_RATE_DEG_S = 1200;

      var ROLLOVER_STRUCK_SIDE_RATE_SCALE = 1.28;
      var ROLLOVER_FAR_SIDE_RATE_SCALE = 0.82;

      function rolloverRateScaleFor(options) {
        if (effectiveRolloverSide() === 0) return 1;
        var def = options && options.seatKey ? seatDef(options.seatKey) : null;
        if (!def) return 1;
        return rolloverSideContactForSeat(def) !== 0
          ? ROLLOVER_STRUCK_SIDE_RATE_SCALE
          : ROLLOVER_FAR_SIDE_RATE_SCALE;
      }

      function rolloverSideContactFor(options) {
        var def = options && options.seatKey ? seatDef(options.seatKey) : null;
        if (def) return rolloverSideContactForSeat(def);
        if (typeof options.rolloverSideContact === 'number') return options.rolloverSideContact;
        return effectiveRolloverSide();
      }

      var ROLLOVER_LIMB_CAP_BELTED = 2;
      var ROLLOVER_LIMB_CAP_UNBELTED = 5;
      var ROLLOVER_BIG_ROLL_QT = 8;

      var ROLLOVER_SIDE_POSITIVE_IS_RIGHT = true;

      var ROOF_CONTACT_MIN_M = 0.06;
      var ROOF_HEADROOM_BELTED_M = 0.08;
      var ROOF_HEADROOM_REAR_M = 0.06;
      var ROOF_HARNESS_EXTRA_M = 0.03;
      var ROOF_OTHER_HALF_SHARE = 0.35;
      var ROOF_LEVEL_SELECT_P = 0.35;

      function roofCrushMaxM() {
        var c = sessionCrush;
        return c ? Math.max(c.ROOFL || 0, c.ROOFR || 0, c.ROOFRL || 0, c.ROOFRR || 0) : 0;
      }

      function rowRoofCrush(c, rear, right) {
        if (rear && c.hasRearRoof) return right ? (c.ROOFRR || 0) : (c.ROOFRL || 0);
        return right ? (c.ROOFR || 0) : (c.ROOFL || 0);
      }

      function seatRoofCrushM(def) {
        var c = sessionCrush;
        if (!c || !def) return 0;
        var rear = def.row === 'rear';
        var own = rowRoofCrush(c, rear, def.side === 'right');
        var other = rowRoofCrush(c, rear, def.side !== 'right');
        return Math.max(own, ROOF_OTHER_HALF_SHARE * other);
      }

      function rampP(x, lo, hi) {
        if (!(x > lo)) return 0;
        if (x >= hi) return 1;
        return (x - lo) / (hi - lo);
      }

      var ROOF_HEAD_LEVELS = [
        { ais: 2, lo: 0.00, hi: 0.06, name: 'Concussion (roof strike)',
          clinical: 'Concussion from the roof striking the head as it was crushed inward (AIS 2).',
          plain: 'The roof came down and hit your head. You have a concussion.' },
        { ais: 3, lo: 0.04, hi: 0.14, name: 'Cerebral contusion (roof crush)',
          clinical: 'Cerebral contusion from roof intrusion into the occupant headroom (AIS 3).',
          plain: 'The roof was crushed down onto your head and bruised your brain.' },
        { ais: 4, lo: 0.12, hi: 0.25, name: 'Depressed skull fracture (roof crush)',
          clinical: 'Depressed skull fracture with underlying brain injury from roof intrusion (AIS 4).',
          plain: 'The roof crushed down onto your head and broke your skull.' },
        { ais: 5, lo: 0.20, hi: 0.34, name: 'Severe crush injury of the head',
          clinical: 'Severe head crush from gross roof collapse into the occupant space (AIS 5).',
          plain: 'The roof collapsed onto your head. This is a critical injury.' },

        { ais: 6, lo: 0.30, hi: 0.40, name: 'Fatal crush injury of the head (roof collapse)',
          clinical: 'Unsurvivable head crush from the roof collapsing through the occupant headroom (AIS 6).',
          plain: 'The roof collapsed all the way onto you. This injury is not survivable.' }
      ];
      var ROOF_NECK_LEVELS = [
        { ais: 2, lo: 0.00, hi: 0.08, scale: 1, name: 'Cervical compression strain',
          clinical: 'Axial compression strain of the cervical spine from roof contact (AIS 2).',
          plain: 'The roof pushed your head down into your neck. Your neck is badly strained.' },
        { ais: 3, lo: 0.06, hi: 0.18, scale: 0.8, name: 'Cervical compression fracture',
          clinical: 'Compression fracture of a cervical vertebra from axial loading by the roof (AIS 3).',
          plain: 'The roof pushed down on your head hard enough to break a bone in your neck.' },
        { ais: 4, lo: 0.16, hi: 0.32, scale: 0.7, name: 'Cervical fracture with cord injury (roof crush)',
          clinical: 'Cervical burst fracture with spinal cord involvement from roof crush (AIS 4).',
          plain: 'The roof crushed down onto you and broke your neck. Your spinal cord may be damaged.' },
        { ais: 5, lo: 0.28, hi: 0.45, scale: 0.6, name: 'Crushed neck with spinal cord injury (roof collapse)',
          clinical: 'Cervical fracture-dislocation with spinal cord injury from the roof collapsing onto the head (AIS 5).',
          plain: 'The roof collapsed onto you and crushed your neck. Your spinal cord is badly damaged.' }
      ];

      function pickRoofLevel(levels, excessM, scale) {
        var chosen = null;
        for (var i = levels.length - 1; i >= 0; i--) {
          var p = Math.min(1, rampP(excessM, levels[i].lo, levels[i].hi) * (levels[i].scale || 1) * scale);
          if (p >= ROOF_LEVEL_SELECT_P) { chosen = { level: levels[i], p: p }; break; }
          if (!chosen && p >= MOD_INJURY_INCLUSION_PROBABILITY_THRESHOLD && i === 0) chosen = { level: levels[i], p: p };
        }
        return chosen;
      }

      var sessionRoofwardDvMs = 0;
      var ROOF_EXCURSION_BELTED_M_PER_MS = 0.015;
      var ROOF_EXCURSION_BELTED_FREE_MS = 2;
      var ROOF_EXCURSION_UNBELTED_M_PER_MS = 0.03;
      var ROOF_EXCURSION_BELTED_MAX_M = 0.06;
      var ROOF_EXCURSION_UNBELTED_MAX_M = 0.25;
      var ROOFWARD_DV_MAX_MS = 9;
      var ROOF_IMPACT_MIN_VERTICAL_SHARE = 0.5;
      var ROOF_IMPACT_INVERTED_UPZ = 0.2;

      var ROLLING_RATE_DEG_S = 500;
      var ROLLING_VERTICAL_MIN_PEAK_G = 20;
      var ROOFWARD_MIN_PEAK_G = 8;

      function tracePeakG(trace) {
        var peak = 0;
        if (!trace || !trace.ax) return 0;
        for (var i = 0; i < trace.ax.length; i++) {
          var g = Math.sqrt(trace.ax[i] * trace.ax[i] + trace.ay[i] * trace.ay[i] + trace.az[i] * trace.az[i]);
          if (g > peak) peak = g;
        }
        return peak;
      }

      function captureIsRolling(rollover) {
        return !!rollover && rollover.available && rollover.peakRollRateDegS >= ROLLING_RATE_DEG_S;
      }

      function noteRoofwardImpact(trace, rollover) {
        if (!rollover || !rollover.available) return;

        if (Number.isFinite(payloadPreImpactVz) && -payloadPreImpactVz < FALLING_MIN_MS) return;
        var peakG = tracePeakG(trace);
        if (peakG < (captureIsRolling(rollover) ? ROLLING_VERTICAL_MIN_PEAK_G : ROOFWARD_MIN_PEAK_G)) return;
        var inverted = rollover.roofContact || rollover.worstUpZ < ROOF_IMPACT_INVERTED_UPZ;
        if (!inverted) return;
        var m = rawTracePdofDeg(trace);
        if (!m || !Number.isFinite(m.dvzMs)) return;
        var x = m.dvxMs || 0, y = m.dvyMs || 0, z = m.dvzMs;
        var tot = x * x + y * y + z * z;
        if (!(tot > 0) || (z * z) / tot < ROOF_IMPACT_MIN_VERTICAL_SHARE) return;

        var roofward = Math.min(-z, ROOFWARD_DV_MAX_MS);
        if (z < 0 && roofward > sessionRoofwardDvMs) sessionRoofwardDvMs = roofward;
      }

      function roofExcursionM(belted, harness) {
        var v = sessionRoofwardDvMs;
        if (!(v > 0)) return 0;
        if (!belted) return Math.min(ROOF_EXCURSION_UNBELTED_MAX_M, v * ROOF_EXCURSION_UNBELTED_M_PER_MS);
        var m = Math.min(ROOF_EXCURSION_BELTED_MAX_M, Math.max(0, v - ROOF_EXCURSION_BELTED_FREE_MS) * ROOF_EXCURSION_BELTED_M_PER_MS);
        return harness ? m * 0.5 : m;
      }

      function roofCrushInjuries(seatKey, occupant) {
        var def = seatKey ? seatDef(seatKey) : null;
        if (!def) return [];
        var belted = !occupant || occupant.belted !== false;
        var gear = occupantGearFlags(seatKey);
        var crushM = seatRoofCrushM(def) + roofExcursionM(belted, gear.harness);
        if (!(crushM >= ROOF_CONTACT_MIN_M)) return [];
        var excess = crushM - (belted ? (def.row === 'rear' ? ROOF_HEADROOM_REAR_M : ROOF_HEADROOM_BELTED_M) : 0);
        var scale = belted ? 1 : 1.3;
        if (sessionRollCagePresent) scale *= 0.5;
        if (belted && gear.harness) excess -= ROOF_HARNESS_EXTRA_M;
        if (!(excess > 0)) return [];
        var out = [];
        [['head', ROOF_HEAD_LEVELS], ['neck', ROOF_NECK_LEVELS]].forEach(function (pair) {
          var pick = pickRoofLevel(pair[1], excess, scale);
          if (!pick) return;
          out.push({
            eventIndex: 0,
            region: pair[0],
            aisSeverity: pick.level.ais,
            continuousSeverity: pick.level.ais,
            probability: pick.p,
            name: pick.level.name,
            clinicalDescription: pick.level.clinical + ' Roof crush plus head travel toward the roof at this seat: ' + Math.round(crushM * 100) + ' cm.',
            plainDescription: pick.level.plain,
            mechanism: 'roof-crush-' + pair[0],
            lowerFidelity: true
          });
        });
        return out;
      }

      var GH_HEAD_CLEARANCE_BELTED_M = 0.20;
      var GH_HEAD_CLEARANCE_UNBELTED_M = 0.08;
      var GH_FATAL_EXCESS_M = 0.30;

      function greenhouseInjuries(seatKey, occupant) {
        var def = seatKey ? seatDef(seatKey) : null;
        var c = sessionCrush;
        if (!def || !c) return [];
        var right = def.side === 'right';
        var own = right ? (c.GHR || 0) : (c.GHL || 0);
        var other = right ? (c.GHL || 0) : (c.GHR || 0);

        var gh = Math.max(own, 0.25 * other);

        if (vehicleHasRollCage() || sessionRollCagePresent) gh *= 0.5;
        var belted = !occupant || occupant.belted !== false;

        var rowGap = def.row === 'rear' ? 0.80 : 0;
        var excess = gh - rowGap - (belted ? GH_HEAD_CLEARANCE_BELTED_M : GH_HEAD_CLEARANCE_UNBELTED_M);
        if (!(excess > 0)) return [];
        var note = ' Windscreen frame and pillars driven into the cabin at this seat: ' + Math.round(gh * 100) + ' cm.';
        var out = [];
        if (excess >= GH_FATAL_EXCESS_M) {
          out.push({ eventIndex: 0, region: 'head', aisSeverity: 6, continuousSeverity: 6, probability: 1,
            name: 'Fatal crush injury of the head (structure through the cabin)',
            clinicalDescription: 'Unsurvivable head crush from the vehicle structure entering the occupant space at head height (AIS 6).' + note,
            plainDescription: 'The structure came through the windscreen at head height. This injury is not survivable.',
            mechanism: 'greenhouse-intrusion-head', lowerFidelity: true });
        } else {
          var head = pickRoofLevel(ROOF_HEAD_LEVELS, excess, 1);
          if (head) out.push({ eventIndex: 0, region: 'head', aisSeverity: head.level.ais, continuousSeverity: head.level.ais,
            probability: head.p, name: head.level.name.replace('roof strike', 'windscreen frame').replace('roof crush', 'windscreen frame'),
            clinicalDescription: head.level.clinical + note, plainDescription: head.level.plain.replace('roof', 'windscreen frame'),
            mechanism: 'greenhouse-intrusion-head', lowerFidelity: true });
        }
        var neck = pickRoofLevel(ROOF_NECK_LEVELS, excess, 1);
        if (neck) out.push({ eventIndex: 0, region: 'neck', aisSeverity: neck.level.ais, continuousSeverity: neck.level.ais,
          probability: neck.p, name: neck.level.name, clinicalDescription: neck.level.clinical + note,
          plainDescription: neck.level.plain.replace('roof', 'windscreen frame'), mechanism: 'greenhouse-intrusion-neck', lowerFidelity: true });
        return out;
      }

      function thinRolloverLimbFindings(injuries, occupant, seatKey) {
        if (!injuries || !injuries.length) return injuries || [];
        var belted = !occupant || occupant.belted !== false;
        var rolls = sessionRolloverQuarterTurns || 0;
        var cap = belted ? (rolls >= ROLLOVER_BIG_ROLL_QT ? ROLLOVER_LIMB_CAP_BELTED + 1 : ROLLOVER_LIMB_CAP_BELTED) : ROLLOVER_LIMB_CAP_UNBELTED;
        var highSideScale = rolls >= 4 ? 1 : 0.3 + 0.7 * Math.max(0, rolls - 1) / 3;
        var rollBoost = belted ? 1 + Math.max(0, Math.min(rolls, 16) - 4) / 6 : 1;
        var sideContact = effectiveRolloverSide() || 0;

        var limbDefR = seatKey ? seatDef(seatKey) : null;
        var highSide = belted && sideContact !== 0 && limbDefR && rolloverSideContactForSeat(limbDefR) === 0;
        var sideWord = null;
        if (sideContact > 0) sideWord = ROLLOVER_SIDE_POSITIVE_IS_RIGHT ? 'Right' : 'Left';
        else if (sideContact < 0) sideWord = ROLLOVER_SIDE_POSITIVE_IS_RIGHT ? 'Left' : 'Right';

        var kept = [];
        var limbs = [];
        injuries.forEach(function (inj) {
          if (!inj) return;
          var isLimb = LIMB_ARM_REGIONS[inj.region] || LIMB_LEG_REGIONS[inj.region]
            || inj.region === 'knee';
          if (isLimb) limbs.push(inj); else kept.push(inj);
        });
        limbs.sort(function (a, b) {
          var av = (a.aisSeverity || 0) * 100 + (a.probability || 0) * 10;
          var bv = (b.aisSeverity || 0) * 100 + (b.probability || 0) * 10;
          return bv - av;
        });
        limbs = limbs.slice(0, cap).map(function (inj) {
          var name = inj.name || '';
          var clone = {};
          for (var k in inj) {
            if (Object.prototype.hasOwnProperty.call(inj, k)) clone[k] = inj[k];
          }
          var p0 = typeof inj.probability === 'number' ? inj.probability : 1;
          clone.probability = Math.min(1, p0 * rollBoost * (highSide ? highSideScale : 1));

          var bare = name.replace(/^(left|right)\s+/i, '');
          if (sideWord) clone.name = sideWord + ' ' + bare.charAt(0).toLowerCase() + bare.slice(1);
          return clone;
        });
        return kept.concat(limbs);
      }

      function rolloverInjuriesFor(rollover, occupant, eventIndex, opts) {
        var options = opts || {};
        var P = window.CrashInjuryProPipeline;
        if (!P || typeof P.computeRolloverInjuries !== 'function') return [];
        if (!rollover || !rollover.available || !rollover.contactConfirmed) return [];
        if (!options.rolloverReadOnly) {
          if (rollover.quarterTurns > sessionRolloverQuarterTurns) sessionRolloverQuarterTurns = rollover.quarterTurns;
          if (rollover.peakRollRateDegS > sessionRolloverPeakRateDegS) sessionRolloverPeakRateDegS = rollover.peakRollRateDegS;
          if (rollover.rollCagePresent || vehicleHasRollCage()) sessionRollCagePresent = true;
          if (rollover.roofContact) sessionRolloverRoofContact = true;

          if (rollover.sideContact !== 0 && sessionRolloverSideContact === 0) sessionRolloverSideContact = rollover.sideContact;
          if (rollover.worstUpZ < sessionRolloverWorstUpZ) sessionRolloverWorstUpZ = rollover.worstUpZ;
        }
        if (sessionRolloverQuarterTurns <= 0) return [];
        return P.computeRolloverInjuries({
          eventIndex: eventIndex,
          quarterTurns: Math.max(Math.min(sessionRolloverQuarterTurns, 1), effectiveRollTurns()),

          peakRollRateDegS: sessionRolloverPeakRateDegS * rolloverRateScaleFor(options),
          belted: !!occupant.belted,
          rollCage: sessionRollCagePresent,
          contactConfirmed: true,

          roofContact: sessionRolloverRoofContact || roofCrushMaxM() >= ROOF_CONTACT_MIN_M,

          sideContact: rolloverSideContactFor(options),
          worstUpZ: sessionRolloverWorstUpZ,
        });
      }

      var sessionFireSeconds = 0;
      var sessionFireIntensity = 0;
      var sessionSubmergedSeconds = 0;
      var sessionWasSubmerged = false;

      var DROWNING_STAGES = [

        [5, 'lung', 1, "Can't breathe (head under water)", 'Your head is under water. You cannot breathe.'],
        [15, 'lung', 2, 'Water coming in (holding breath)', 'Water is coming in and you are running out of breath.'],
        [30, 'lung', 3, 'Breathed in water', 'You could not hold your breath any longer and breathed in water.'],
        [45, 'lung', 4, 'Lungs filling with water', 'Your lungs are filling with water. You are about to pass out.'],
        [45, 'head', 3, 'Passed out (no oxygen)', 'You have passed out from lack of oxygen.'],
        [70, 'lung', 5, 'Lungs full of water', 'Your lungs are full of water.'],
        [70, 'head', 4, 'Brain damage (no oxygen)', 'Your brain has gone too long without oxygen and is being damaged.'],
        [95, 'head', 5, 'Severe brain damage (no oxygen)', 'Your brain has gone without oxygen for over a minute and a half.'],
        [120, 'head', 6, 'Drowned', 'Your heart stopped. You were under water too long to survive.']
      ];
      function drowningFindings(seconds, eventIndex) {
        var best = {};
        DROWNING_STAGES.forEach(function (st) {
          if (seconds >= st[0]) best[st[1]] = st;
        });
        return Object.keys(best).map(function (r) {
          var st = best[r];
          return { eventIndex: eventIndex || 0, region: st[1], aisSeverity: st[2], continuousSeverity: st[2],
            probability: 1, name: st[3], plainDescription: st[4],
            clinicalDescription: st[3] + ' after ' + Math.round(seconds) + ' s submerged (AIS ' + st[2] + ').',
            mechanism: 'drowning-' + st[1] };
        });
      }

      function exposureInjuriesFor(occupant, eventIndex) {
        var P = window.CrashInjuryProPipeline;
        if (!P || typeof P.computeFireInjuries !== 'function') return [];
        var out = [];
        if (sessionFireSeconds > 0) {
          var seatKey = occupant.seat || 'driver';
          var rowShare = (seatKey === 'rearLeft' || seatKey === 'rearRight') ? 0.82 : 1.0;
          var h = 0;
          for (var ci = 0; ci < seatKey.length; ci++) h = (h * 31 + seatKey.charCodeAt(ci)) >>> 0;
          var luck = 0.9 + 0.2 * (((h ^ (scenarioSeed >>> 0)) % 1000) / 1000);
          var dose = patientFireDoseS * rowShare * luck;
          var fire = P.computeFireInjuries({
            eventIndex: eventIndex,
            secondsExposed: dose,
            intensity: 1,
            occupantAge: occupant.age,
          });
          var skinAis = 0, skinP = 0, skinCs = 0;
          fire.forEach(function (inj) {
            if (/^fire-skin-/.test(inj.mechanism || '') && inj.aisSeverity > skinAis) { skinAis = inj.aisSeverity; skinP = inj.probability; skinCs = inj.continuousSeverity; }
          });
          if (skinAis > 0) {
            [['upperArm', 'upper arm'], ['femur', 'thigh'], ['abdomen', 'belly'], ['thoracicSpine', 'back'], ['neck', 'neck']].forEach(function (rp) {
              var a = rp[0] === 'thoracicSpine' || rp[0] === 'abdomen' ? Math.max(1, skinAis - 1) : skinAis;
              fire.push({ eventIndex: eventIndex, region: rp[0], aisSeverity: a, continuousSeverity: Math.min(skinCs, a), probability: skinP,
                name: a >= 3 ? 'Full-thickness burn (' + rp[1] + ')' : 'Burn to the ' + rp[1],
                clinicalDescription: (a >= 3 ? 'Full-thickness' : a === 2 ? 'Partial-thickness' : 'Superficial') + ' burn to the ' + rp[1] + ' (AIS ' + a + ').',
                plainDescription: a >= 3 ? 'The fire burned right through the skin on your ' + rp[1] + '.' : 'The fire burned the skin on your ' + rp[1] + '.',
                mechanism: 'fire-skin-' + rp[0], lowerFidelity: true });
            });
          }

          if (occupant.helmet) {
            fire = fire.map(function (inj) {
              if (inj && inj.region === 'head' && /^fire-skin-/.test(inj.mechanism || '') && inj.aisSeverity > 1) {
                var a2 = inj.aisSeverity - 1;
                return Object.assign({}, inj, { aisSeverity: a2, continuousSeverity: Math.min(inj.continuousSeverity, a2),
                  name: a2 >= 3 ? 'Full-thickness burn (face)' : 'Burn to the face' });
              }
              return inj;
            });
          }
          out = out.concat(fire);
        }
        if (sessionSubmergedSeconds > 0) out = out.concat(drowningFindings(sessionSubmergedSeconds, eventIndex));
        return out;
      }

      function computeCriteriaAndInjuries(trace, occupant, intrusion, rollover, opts) {
        var options = opts || {};
        var quiet = !!options.quiet;
        var P = window.CrashInjuryProPipeline;
        if (!P) {
          console.error('[CrashInjuryPro] pipelineBundle.js has not loaded yet (window.CrashInjuryProPipeline is undefined) -- cannot process this trace.');
          return null;
        }

        var validationPassed = true;
        var validationReason = 'ok';
        try {
          P.assertValidTrace(trace);
        } catch (e) {
          validationPassed = false;
          validationReason = e.message;
        }

        var res = P.resultant(trace.ax, trace.ay, trace.az);
        var rawPeakG = 0;
        for (var _i = 0; _i < res.length; _i++) {
          if (res[_i] > rawPeakG) rawPeakG = res[_i];
        }
        if (!quiet) {
          scope.debugValidationPassed = validationPassed;
          scope.debugValidationReason = validationReason;
          scope.debugRawPeakG = rawPeakG;
          scope.debugSampleCount = trace.t.length;
        }

        var filtered = P.cfcLowpass(res, trace.sampleRateHz, P.CFC.CFC_180).signal;
        var events = P.segmentEvents(trace.t, trace.sampleRateHz, filtered);

        if (events.length === 0) {
          var rollOnlyInjuries = rolloverInjuriesFor(rollover, occupant, 0, options);
          if (rollOnlyInjuries.length > 0 && !(intrusion && intrusion.available)) {
            var rollEvent = { startIndex: 0, endIndex: trace.t.length - 1, startTimeS: trace.t[0], endTimeS: trace.t[trace.t.length - 1] };
            var rollMeta = [{ impactSide: 'front', pdofDeg: 0, deltaVMs: 0, durationMs: (rollEvent.endTimeS - rollEvent.startTimeS) * 1000, peakG: rawPeakG }];
            var rollKept = rollOnlyInjuries.filter(function (inj) {
              return inj.probability >= MOD_INJURY_INCLUSION_PROBABILITY_THRESHOLD;
            });
            if (rollKept.length > 0) {
              return { events: [rollEvent], injuries: rollKept, eventMeta: rollMeta };
            }
          }

          if (intrusion && intrusion.available) {
            var measurements0 = [
              { zone: 'roof', depthM: intrusion.roofDepthM, peakVelocityMs: intrusion.roofVelocityMs },
              { zone: 'door', depthM: intrusion.doorDepthM, peakVelocityMs: intrusion.doorVelocityMs },
              { zone: 'dash', depthM: intrusion.dashDepthM, peakVelocityMs: intrusion.dashVelocityMs },
            ];

            var noAccelInjuries = P.computeIntrusionInjuriesForEvent(0, 'front', measurements0)
              .concat(rolloverInjuriesFor(rollover, occupant, 0, options));
            if (noAccelInjuries.length === 0) {
              return null;
            }
            var syntheticEvent = { startIndex: 0, endIndex: trace.t.length - 1, startTimeS: trace.t[0], endTimeS: trace.t[trace.t.length - 1] };
            var noAccelEventMeta = [{ impactSide: 'front', pdofDeg: 0, deltaVMs: 0, durationMs: (syntheticEvent.endTimeS - syntheticEvent.startTimeS) * 1000, peakG: rawPeakG }];
            var noAccelKept = noAccelInjuries.filter(function (inj) {
              return inj.probability >= MOD_INJURY_INCLUSION_PROBABILITY_THRESHOLD;
            });
            if (noAccelKept.length === 0) return null;
            return { events: [syntheticEvent], injuries: noAccelKept, eventMeta: noAccelEventMeta };
          }
          return null;
        }

        var eventMeta = [];

        var eventInputs = events.map(function (event, eventIndex) {
          var deltaV = capDeltaV(trace, P.deltaVForEvent(trace, event));
          var pdofResult = P.pdof(trace, event);

          var responseWindow = P.eventResponseWindow(trace, event);
          var tEvent = responseWindow.trace.t;
          var response = P.computeOccupantResponse(responseWindow.trace, responseWindow.event, occupant);
          var hic = P.computeHIC15(response.head, tEvent, trace.sampleRateHz);
          var chest = P.computeChest3ms(response.chest, tEvent, trace.sampleRateHz);
          var femur = P.computeFemurLoad(response.femur, tEvent, trace.sampleRateHz);
          var verticalLoading = softenVerticalLoading(
            P.computeVerticalLoading(response.seatVerticalG, tEvent),
            deltaV.dvzMs,
            deltaV
          );
          if (verticalLoading && verticalLoading.compressionIndex > 0) spendFallCredit();

          var durationMs = (event.endTimeS - event.startTimeS) * 1000;

          var eventPeakG = 0;
          for (var _j = event.startIndex; _j <= event.endIndex; _j++) {
            if (res[_j] > eventPeakG) eventPeakG = res[_j];
          }

          eventMeta[eventIndex] = { impactSide: pdofResult.impactSide, pdofDeg: pdofResult.pdofDeg, deltaVMs: deltaV.magnitudeMs, durationMs: durationMs, peakG: eventPeakG,
            verticalDeltaVMs: deltaV.dvzMs, hicIndex: hic.hicIndex, chest3msG: chest.chest3msG, femurForceIndexN: femur.femurForceIndexN };

          return {
            eventIndex: eventIndex,
            impactSide: pdofResult.impactSide,

            deltaV: softenedDeltaV(deltaV, durationMs),
            verticalLoading: verticalLoading,

            restraint: occupant.belted ? (occupant.airbag ? 'beltedAirbag' : 'beltedOnly') : 'unbelted',
            risks: [
              P.headRiskCumulativeNormal(hic.hicIndex, 2),
              P.headRiskCumulativeNormal(hic.hicIndex, 3),
              P.headRiskCumulativeNormal(hic.hicIndex, 4),
              P.chestRisk(chest.chest3msG, 2),
              P.chestRisk(chest.chest3msG, 3),
              P.chestRisk(chest.chest3msG, 4),
              P.femurRisk(femur.femurForceIndexN)
            ]
          };
        });

        try {
          if (!quiet && window.bngApi && typeof window.bngApi.engineLua === 'function') {
            var diag = 'PIPELINE: restraint=' + (occupant.belted ? (occupant.airbag ? 'belt+airbag' : 'belt') : 'UNBELTED') +
              ' events=' + events.length + ' rawPeakG=' + rawPeakG.toFixed(1) + ' samples=' + trace.t.length +
              ' freeFlightMs=' + (trace.freeFlightMs || 0).toFixed(0) +
              ' fallCredit=' + (hasFallCredit() ? 'yes' : 'no') +
              ' dvZ=' + sessionImpactDvZMs.toFixed(1) +
              ' dri=' + (function () { var d = traceDRI(trace); return d == null ? '?' : d.toFixed(1); })() +
              ' floor=' + (sessionFloorDvMs || 0).toFixed(1) +
              ' vertShare=' + Math.round(occupantExposure(SEAT_DEFS[0], currentImpact(sessionImpactPdofDeg || 0)).verticalShare * 100) + '%' +

              ' pdof=' + (sessionImpactPdofDeg == null ? '?' : sessionImpactPdofDeg.toFixed(0)) +
              ' lat=' + sessionImpactDvYMs.toFixed(1) +
              ' crush=' + crushSummary() +
              ' seats=' + SEAT_DEFS.map(function (def) {
                return def.short + occupantExposure(def, currentImpact(sessionImpactPdofDeg || 0)).scalar.toFixed(2);
              }).join(',');
            for (var _d = 0; _d < eventMeta.length; _d++) {
              var em = eventMeta[_d];
              diag += ' | ev' + _d + ' ' + em.impactSide +
                ' dV=' + (em.deltaVMs / 0.44704).toFixed(1) + 'mph' +
                ' dur=' + em.durationMs.toFixed(0) + 'ms' +
                ' peak=' + em.peakG.toFixed(0) + 'g' +
                ' HIC=' + em.hicIndex.toFixed(0) +
                ' chest=' + em.chest3msG.toFixed(0) + 'g' +
                ' femur=' + (em.femurForceIndexN / 1000).toFixed(1) + 'kN';
            }
            window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' + JSON.stringify(diag) + ')');
          }
        } catch (e) {}

        var occupantWorstDeltaVMs = 0;
        eventInputs.forEach(function (input) {
          var dv = input && input.deltaV ? input.deltaV.magnitudeMs : 0;
          if (dv > occupantWorstDeltaVMs) occupantWorstDeltaVMs = dv;
        });
        var occupantBias = 1;
        var restraintTier = eventInputs.length ? eventInputs[0].restraint : null;
        var inertialInjuries = computeCrashInjuries(
          trace, occupant, eventInputs, restraintTier, occupantBias, occupantWorstDeltaVMs,
          options, rollover
        );

        var rawInjuries = inertialInjuries;
        if (intrusion && intrusion.available) {
          var primaryEventIndex = 0;
          var primaryPeakG = -Infinity;
          eventMeta.forEach(function (m, i) {
            if (m.peakG > primaryPeakG) {
              primaryPeakG = m.peakG;
              primaryEventIndex = i;
            }
          });
          var measurements = [
            { zone: 'roof', depthM: intrusion.roofDepthM, peakVelocityMs: intrusion.roofVelocityMs },
            { zone: 'door', depthM: intrusion.doorDepthM, peakVelocityMs: intrusion.doorVelocityMs },
            { zone: 'dash', depthM: intrusion.dashDepthM, peakVelocityMs: intrusion.dashVelocityMs },
          ];
          var intrusionInjuries = P.computeIntrusionInjuriesForEvent(primaryEventIndex, eventMeta[primaryEventIndex].impactSide, measurements);
          if (intrusionInjuries.length > 0) {
            rawInjuries = P.mergeIntrusionInjuries(inertialInjuries, intrusionInjuries);
          }
        }

        var rolloverInjuries = thinRolloverLimbFindings(
          rolloverInjuriesFor(rollover, occupant, 0, options),
          occupant, options && options.seatKey);
        rawInjuries = rawInjuries.concat(rolloverInjuries);

        rawInjuries = rawInjuries.concat(roofCrushInjuries(options && options.seatKey, occupant));

        var injuries = rawInjuries.filter(function (inj) {
          return inj.probability >= MOD_INJURY_INCLUSION_PROBABILITY_THRESHOLD;
        });

        try {
          if (!quiet && window.bngApi && typeof window.bngApi.engineLua === 'function') {
            var rd = 'ROLLOVER-INJ: ';
            if (!rollover) {
              rd += 'no rollover object on payload';
            } else if (!rollover.available) {
              rd += 'tracking unavailable';
            } else if (!rollover.contactConfirmed) {
              rd += 'contactConfirmed=false (airborne or no ground strike) qt=' + rollover.quarterTurns.toFixed(2);
            } else {
              rd += 'qt=' + sessionRolloverQuarterTurns.toFixed(2) +
                ' rate=' + sessionRolloverPeakRateDegS.toFixed(0) +
                ' roof=' + sessionRolloverRoofContact +
                ' side=' + sessionRolloverSideContact + '/effective=' + effectiveRolloverSide() +
                ' roofCrush=' + roofCrushMaxM().toFixed(2) +
                ' roofwardDv=' + sessionRoofwardDvMs.toFixed(1) +
                ' cage=' + sessionRollCagePresent +
                ' belted=' + (!!occupant.belted) +
                ' -> ' + rolloverInjuries.length + ' findings:';
              for (var _r = 0; _r < rolloverInjuries.length; _r++) {
                rd += ' ' + rolloverInjuries[_r].region + '/AIS' + rolloverInjuries[_r].aisSeverity +
                  '/p' + rolloverInjuries[_r].probability.toFixed(2);
              }
            }
            window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' + JSON.stringify(rd) + ')');
          }
        } catch (e) {}

        return { events: events, injuries: injuries, eventMeta: eventMeta };
      }

      var sessionInjuries = [];
      var scenarioSeed = (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
      var patientState = { bloodLostM3: 0, lowestSurvivalPercent: 100, dead: false };
      var patientClockS = null;

      var patientTotalElapsedS = 0;
      var patientFireDoseS = 0;
      var patientExposureInjuries = [];

      var sessionVehicleDeltaVMs = 0;
      scope.patientProgressActive = true;

      function mergePatientInjuries(injuries) {
        var byKey = Object.create(null);
        injuries.forEach(function (inj) {
          var key = inj.region === 'circulatory' ? inj.region + ':' + inj.mechanism
            : (inj.minorExtra || /^minor-/.test(String(inj.mechanism || '')) ? 'minor:' + inj.region + ':' + inj.name : inj.region);
          var old = byKey[key];
          if (!old || inj.aisSeverity > old.aisSeverity || (inj.aisSeverity === old.aisSeverity && inj.probability > old.probability)) byKey[key] = inj;
        });
        return Object.keys(byKey).map(function (key) { return byKey[key]; });
      }

      var BLEED_SECONDARY_SHARE = 0.3;

      var BLEED_TIME_SCALE = 0.4;

      var BLEED_M3_PER_S = {
        aorta: 12e-6, abdomen: 4e-6, pelvis: 4e-6, kidney: 15e-7, femur: 1e-6, external: 1e-7
      };

      function bleedSourceRates(injuries) {
        var byRegion = Object.create(null);
        (injuries || []).forEach(function (inj) {
          if (!inj || !inj.mechanism) return;
          if (/^(fire-|drowning-|haemorrhage-)/.test(inj.mechanism)) return;
          if (inj.region === 'circulatory') return;
          var rate = 0;
          var ais = inj.aisSeverity;
          if (inj.region === 'aorta') rate = BLEED_M3_PER_S.aorta;
          else if (inj.region === 'abdomen' && ais >= 3) rate = BLEED_M3_PER_S.abdomen;
          else if (inj.region === 'pelvis' && ais >= 3) rate = BLEED_M3_PER_S.pelvis;
          else if (inj.region === 'kidney' && ais >= 3) rate = BLEED_M3_PER_S.kidney;
          else if (inj.region === 'femur' && ais >= 3) rate = BLEED_M3_PER_S.femur;
          else if (/laceration/i.test(inj.name || '')) rate = BLEED_M3_PER_S.external;
          if (rate <= 0) return;
          rate *= 1 + Math.max(0, ais - 3) * 0.5;
          if (rate > (byRegion[inj.region] || 0)) byRegion[inj.region] = rate;
        });
        var rates = [];
        for (var region in byRegion) {
          if (Object.prototype.hasOwnProperty.call(byRegion, region)) rates.push(byRegion[region]);
        }
        return rates;
      }

      var DANGEROUS_BLEED_M3_PER_S = 3.5e-6;

      function bleedElapsedScale(injuries) {
        var rates = bleedSourceRates(injuries);
        var worstRate = 0;
        rates.forEach(function (r) { if (r > worstRate) worstRate = r; });
        if (worstRate < DANGEROUS_BLEED_M3_PER_S) return 0;
        if (rates.length < 2) return BLEED_TIME_SCALE;
        var total = 0;
        var worst = 0;
        rates.forEach(function (r) { total += r; if (r > worst) worst = r; });
        if (!(total > 0)) return 1;
        var combined = worst + BLEED_SECONDARY_SHARE * (total - worst);
        return Math.max(0, Math.min(1, combined / total)) * BLEED_TIME_SCALE;
      }

      var SURVIVAL_DEATH_FLOOR_PERCENT = 6;

      var BREATHING_FAILURE_SECONDS = 420;
      var HEAD_DETERIORATION_SECONDS = 1500;

      function deteriorationReserves(injuries, totalElapsedS) {
        var elapsed = totalElapsedS > 0 ? totalElapsedS : 0;
        var worstChest = 0, worstHead = 0, worstNeck = 0;
        (injuries || []).forEach(function (inj) {
          if (!inj) return;
          if (inj.region === 'chest' && inj.aisSeverity > worstChest) worstChest = inj.aisSeverity;
          if (inj.region === 'head' && inj.aisSeverity > worstHead) worstHead = inj.aisSeverity;
          if ((inj.region === 'neck' || inj.region === 'cervicalSpine') && inj.aisSeverity > worstNeck) worstNeck = inj.aisSeverity;
        });

        var breathingSeverity = Math.max(worstChest >= 4 ? worstChest : 0, worstNeck >= 5 ? worstNeck : 0);
        var breathing = 1;
        if (breathingSeverity >= 4) {
          var tB = elapsed / (BREATHING_FAILURE_SECONDS / (1 + (breathingSeverity - 4) * 0.4));
          breathing = Math.max(0, 1 - tB * tB);
        }
        var head = 1;
        if (worstHead >= 5) {
          var tH = elapsed / (HEAD_DETERIORATION_SECONDS / (1 + (worstHead - 5) * 0.5));
          head = Math.max(0, 1 - tH * tH);
        }
        return { breathing: breathing, head: head };
      }

      function deathCauseFor(ctx) {
        var injuries = ctx.injuries || [];
        var worst = {};
        injuries.forEach(function (inj) {
          if (!inj) return;
          if (!(inj.region in worst) || inj.aisSeverity > worst[inj.region]) worst[inj.region] = inj.aisSeverity;
        });
        if (ctx.submergedS > 20 && ctx.waterReserveSpent) {
          return { short: 'Drowned', full: 'Drowning -- the occupant could not get out of a submerged car.' };
        }
        if (ctx.fireDoseS > 0 && ctx.fireReserveSpent) {
          return { short: 'Burns', full: 'Burns and smoke inhalation.' };
        }
        if (ctx.structuralCeiling === 0 && currentSeatDestroyed) {
          return { short: 'Crushed', full: 'The passenger compartment was destroyed -- there was no survival space left.' };
        }
        if (worst.aorta >= 5) {
          return { short: 'Aorta torn', full: 'Rupture of the aorta -- fatal internal bleeding within minutes.' };
        }

        if (worst.head >= 5) {
          return { short: 'Head injury', full: 'Unsurvivable brain injury.' };
        }

        if (worst.neck >= 4 || worst.cervicalSpine >= 4) {
          return { short: 'Neck broken', full: 'A broken neck with spinal cord involvement.' };
        }
        if (worst.chest >= 5) {
          return { short: 'Chest crushed', full: 'The chest was crushed -- the heart and lungs could not keep working.' };
        }
        if (ctx.bleedFraction >= 0.95) {
          return { short: 'Bled out', full: 'Blood loss -- the occupant bled out before help arrived.' };
        }
        if (ctx.breathingReserve <= 0.02) {
          return { short: 'Could not breathe', full: 'Respiratory failure -- a flail chest and collapsed lung stopped effective breathing.' };
        }
        if (ctx.headReserve <= 0.02) {
          return { short: 'Brain swelling', full: 'Rising pressure inside the skull from a severe brain injury.' };
        }
        if (ctx.bleedFraction >= 0.5) {
          return { short: 'Bled out', full: 'Blood loss on top of severe injuries elsewhere.' };
        }
        return { short: 'Injuries', full: 'The combination of injuries was not survivable.' };
      }

      function applyProgressiveDeterioration(report, injuries, totalElapsedS, patient, occupant, structuralCeiling, basePercent) {
        if (!report || !report.survival) return report;
        var reserves = deteriorationReserves(injuries, totalElapsedS);
        var survival = {};
        for (var k in report.survival) {
          if (Object.prototype.hasOwnProperty.call(report.survival, k)) survival[k] = report.survival[k];
        }
        var pct = survival.survivalProbabilityPercent;
        if (typeof pct === 'number') {
          var reference = typeof basePercent === 'number' ? basePercent : pct;
          var scaled = reference * reserves.breathing * reserves.head;
          survival.survivalProbabilityPercent = reserves.breathing <= 0 || reserves.head <= 0
            ? 0
            : Math.min(pct, Math.round(scaled));
          if (survival.survivalProbabilityPercent <= 0) survival.outlook = 'notSurvivable';
        }
        var bleedFraction = bleedFractionOf(
          patient ? patient.bloodLostM3 * 1000000 : 0,
          occupant ? occupant.massKg : 75
        );
        var dead = (patient && patient.dead)
          || survival.outlook === 'notSurvivable'
          || survival.survivalProbabilityPercent < SURVIVAL_DEATH_FLOOR_PERCENT;
        if (dead) {
          survival.deathCause = deathCauseFor({
            injuries: injuries,
            bleedFraction: bleedFraction,
            breathingReserve: reserves.breathing,
            headReserve: reserves.head,
            fireDoseS: patientFireDoseS,

            fireReserveSpent: patientFireDoseS >= 40,
            submergedS: sessionSubmergedSeconds,
            waterReserveSpent: sessionSubmergedSeconds >= 60,
            structuralCeiling: structuralCeiling
          });
        }
        var out = {};
        for (var j in report) {
          if (Object.prototype.hasOwnProperty.call(report, j)) out[j] = report[j];
        }
        out.survival = survival;
        return out;
      }

      function reportPipeline() {
        var FREE = window.CrashInjuryPipeline;
        return (FREE && typeof FREE.buildInjuryReport === 'function')
          ? FREE
          : window.CrashInjuryProPipeline;
      }

      var EXCESS_BURDEN_MAX = 0.28;
      var EXCESS_BURDEN_SCALE = 55;

      function excessInjuryBurden(injuries, issValue) {
        var full = 0;
        (injuries || []).forEach(function (inj) {
          if (!inj) return;
          var sev = typeof inj.continuousSeverity === 'number' ? inj.continuousSeverity
            : (typeof inj.aisSeverity === 'number' ? inj.aisSeverity : 0);
          if (!(sev > 0)) return;
          full += sev * sev;
        });
        return Math.max(0, full - (issValue > 0 ? issValue : 0));
      }

      var REGISTRY_SURVIVAL_BY_ISS = [
        [1, 100], [4, 99.5], [9, 99], [16, 95], [25, 85],
        [34, 75], [41, 60], [50, 45], [59, 34], [66, 25], [75, 8]
      ];

      var REGISTRY_BLEND = 0.60;

      function registrySurvivalPercent(iss) {
        var t = REGISTRY_SURVIVAL_BY_ISS;
        if (!(iss > 0)) return 100;
        if (iss <= t[0][0]) return t[0][1];
        for (var i = 1; i < t.length; i++) {
          if (iss <= t[i][0]) {
            var span = t[i][0] - t[i - 1][0];
            var f = span > 0 ? (iss - t[i - 1][0]) / span : 0;
            return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * f;
          }
        }
        return t[t.length - 1][1];
      }

      function burdenAdjustedReport(report, injuries) {
        if (!report || !report.survival) return report;
        var pct = report.survival.survivalProbabilityPercent;
        if (typeof pct !== 'number' || !(pct > 0)) return report;
        var issValue = report.iss && typeof report.iss.iss === 'number' ? report.iss.iss : 0;
        var excess = excessInjuryBurden(injuries, issValue);
        if (!(excess > 0)) return report;
        var penalty = EXCESS_BURDEN_MAX * (1 - Math.exp(-excess / EXCESS_BURDEN_SCALE));

        pct = pct * (1 - REGISTRY_BLEND)
            + registrySurvivalPercent(issValue) * REGISTRY_BLEND;
        var out = {};
        for (var k in report) {
          if (Object.prototype.hasOwnProperty.call(report, k)) out[k] = report[k];
        }
        var survival = {};
        for (var j in report.survival) {
          if (Object.prototype.hasOwnProperty.call(report.survival, j)) survival[j] = report.survival[j];
        }
        survival.survivalProbabilityPercent = pct * (1 - penalty);
        out.survival = survival;
        return out;
      }

      function severityConsistent(list) {
        return (list || []).map(function (inj) {
          if (!inj || !(inj.aisSeverity > 0)) return inj;
          var floor = inj.aisSeverity - 0.25;
          if (typeof inj.continuousSeverity === 'number' && inj.continuousSeverity >= floor) return inj;
          return Object.assign({}, inj, { continuousSeverity: floor });
        });
      }
      function buildReport(injuries, events, age) {
        injuries = severityConsistent(injuries);
        return burdenAdjustedReport(
          reportPipeline().buildInjuryReport(injuries, events, age), injuries);
      }

      var GEAR_STRUCTURAL = /roof|greenhouse|intrusion|structural|crush|footwell|pillar|vertical/i;
      function stepDown(inj, note) {
        var a = inj.aisSeverity || 0;
        var out = Object.assign({}, inj, { aisSeverity: Math.max(1, a - 1), continuousSeverity: Math.max(1, (inj.continuousSeverity || a) - 1) });
        out.clinicalDescription = (inj.clinicalDescription || '') + ' ' + note;
        return out;
      }
      function applyGearToFindings(list, occupant) {
        if (!occupant || !list || !list.length) return list || [];
        if (!occupant.helmet && !occupant.harness && !occupant.hans) return list;
        return list.map(function (inj) {
          if (!inj) return inj;
          var r = inj.region, a = inj.aisSeverity || 0, mech = String(inj.mechanism || '') + ' ' + String(inj.name || '');
          var structural = GEAR_STRUCTURAL.test(mech);
          if (occupant.helmet && (r === 'head' || r === 'face') && a < 6) {
            if (structural && /roof|greenhouse|pillar/i.test(mech)) return a >= 4 ? inj : stepDown(inj, 'Severity reduced by the helmet (the shell took the crush).');
            if (structural && a >= 5) return inj;
            if (structural && a >= 3) return stepDown(inj, 'Severity reduced by the helmet.');
            if (a <= 2) {
              return Object.assign({}, inj, { aisSeverity: 1, continuousSeverity: 1,
                name: r === 'face' ? 'Bruised face under the helmet' : 'Head knock (the helmet took it)',
                clinicalDescription: 'Blunt impact to the head absorbed by the helmet shell; soft-tissue contusion only (AIS 1).',
                plainDescription: 'Your head hit something hard, but the helmet took the blow.', mechanism: 'helmet-absorbed' });
            }

            if (/nerve fib|axonal|diffuse|rotation/i.test(mech)) return stepDown(inj, 'Severity reduced by the helmet.');
            var left = a - 2;
            if (left <= 1) {
              return Object.assign({}, inj, { aisSeverity: 1, continuousSeverity: 1,
                name: r === 'face' ? 'Bruised face under the helmet' : 'Head knock (the helmet took it)',
                clinicalDescription: 'Blunt impact to the head absorbed by the helmet shell; soft-tissue contusion only (AIS 1).',
                plainDescription: 'Your head hit something hard, but the helmet took the blow.', mechanism: 'helmet-absorbed' });
            }
            if (left === 2 && r === 'head') {
              return Object.assign({}, inj, { aisSeverity: 2, continuousSeverity: 2,
                name: 'Concussion (the helmet took most of it)',
                clinicalDescription: 'Concussion after a heavy blow largely absorbed by the helmet shell (AIS 2).',
                plainDescription: 'A heavy hit to the head. The helmet stopped the worst of it, but you were dazed.', mechanism: 'helmet-absorbed' });
            }
            return stepDown(stepDown(inj, ''), 'Severity reduced by the helmet.');
          }
          if (occupant.hans && r === 'neck' && !structural && a < 5 && !/roof|axial|compression|landing/i.test(mech)) {
            if (a <= 2) return Object.assign({}, inj, { aisSeverity: 1, continuousSeverity: 1,
              name: 'Neck strain (HANS held the head)', mechanism: 'hans-limited',
              clinicalDescription: 'Minor cervical strain; head excursion limited by the HANS device (AIS 1).',
              plainDescription: 'Your neck was jolted, but the HANS stopped your head flying forward.' });
            return stepDown(inj, 'Severity reduced by the HANS device.');
          }
          if (occupant.harness && !structural && r === 'aorta' && a >= 3 && a <= 5) {
            return stepDown(inj, 'Load spread by the racing harness.');
          }
          if (occupant.harness && !structural && a >= 2 && a <= 4 && (r === 'chest' || r === 'abdomen' || r === 'lung')) {
            if (a === 2 && r !== 'lung') return Object.assign({}, inj, { aisSeverity: 1, continuousSeverity: 1,
              name: r === 'chest' ? 'Harness bruising across the chest' : 'Harness bruising across the belly', mechanism: 'harness-contusion',
              clinicalDescription: 'Contusion under the harness straps; the load was spread over the shoulders and pelvis (AIS 1).',
              plainDescription: 'The harness straps left bruises where they held you.' });
            if (a === 2) return inj;
            return stepDown(inj, 'Load spread by the racing harness.');
          }
          if (occupant.harness && /rollover/i.test(mech) && (r === 'upperArm' || r === 'forearm' || r === 'wrist' || r === 'hand') && a <= 2) {
            return null;
          }
          return inj;
        }).filter(Boolean);
      }

      var LIMB_SIDE_FROM_CRUSH_MIN = 0.2;
      function limbsOnStruckSide(list, seat) {
        if (!list || !list.length || !seat) return list;
        var crush = crushAsymmetry();
        if (!crush.available || !(Math.abs(crush.side) >= LIMB_SIDE_FROM_CRUSH_MIN)) return list;
        var struckSign = crush.side > 0 ? 1 : -1;
        if (seatPhysicalSide(seat) !== struckSign) return list;
        var word = struckSign > 0 ? 'right' : 'left';
        var fix = function (t) { return typeof t === 'string' ? t.replace(/\b(left|right)\b/gi, function (m) { return m[0] === m[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word; }) : t; };
        return list.map(function (inj) {
          if (!inj || !(LIMB_ARM_REGIONS[inj.region] || LIMB_LEG_REGIONS[inj.region] || inj.region === 'femur' || inj.region === 'knee')) return inj;
          if (!/\b(left|right)\b/i.test(inj.name || '')) return inj;
          return Object.assign({}, inj, { name: fix(inj.name), clinicalDescription: fix(inj.clinicalDescription), plainDescription: fix(inj.plainDescription) });
        });
      }

      var AFTERMATH_MIN_MS = 4.5;
      var AFTERMATH_SHARE = 0.4;

      var SECOND_HIT_MIN_MS = 3.0;
      var SECOND_HIT_MIN_G = 6;

      var OWN_HIT_MIN_G = 5;
      function isOwnHit(dvMs, peakG) {
        if (dvMs >= Math.max(AFTERMATH_MIN_MS, AFTERMATH_SHARE * (sessionImpactDeltaVMs || 0)) && !(peakG < OWN_HIT_MIN_G)) return true;
        return dvMs >= SECOND_HIT_MIN_MS && peakG >= SECOND_HIT_MIN_G;
      }
      var currentSeatDestroyed = false;
      var destroyedLogged = {};
      function seatSpaceDestroyed(seat, occupant) {
        var why = seatSpaceDestroyedReason(seat, occupant);
        if (why && !destroyedLogged[seat.key]) {
          destroyedLogged[seat.key] = true;
          try {
            if (window.bngApi) window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
              JSON.stringify('SEAT DESTROYED: ' + seat.key + ' -- ' + why) + ')');
          } catch (e) {}
        }
        return !!why;
      }
      function seatSpaceDestroyedReason(seat, occupant) {
        var info = seatSpaceDestroyedInfo(seat, occupant);
        return info ? info.text : null;
      }
      function rearQuarterShareM(c, right) {
        if (!c) return 0;
        var mine = (right ? c.RR : c.RL) || 0, other = (right ? c.RL : c.RR) || 0;
        return Math.max(0, mine - other);
      }
      function seatSpaceDestroyedInfo(seat, occupant) {
        var c = sessionCrush;
        if (!c || !seat) return null;
        var right = seat.side === 'right';
        var f2 = function (v) { return (v || 0).toFixed(2); };
        var all = [];
        var foot = footwellIntoM(seat);
        if (seat.row === 'front' && foot > 0.50) all.push({ kind: 'footwell', text: 'footwell ' + f2(foot) + ' m in' });
        var boot = struckEnd(right ? 'RR' : 'RL') - BOOT_M;
        if (seat.row === 'rear' && boot > 0.50) all.push({ kind: 'boot', text: 'boot ' + f2(boot) + ' m into the seat' });
        var door = seat.row === 'front' ? (right ? c.SFR : c.SFL) : (right ? c.SRR : c.SRL);
        if (seat.row === 'rear') door = Math.max(door || 0, 0.7 * rearQuarterShareM(c, right) * (Math.abs((impactDirection(sessionImpactPdofDeg || 0) || { x: 0 }).x) > 0.5 ? 1 : 0));

        var caged = vehicleHasRollCage() || sessionRollCagePresent;

        var doorLimit = (seat.row === 'rear' ? 0.45 : 0.55) - (occupant && occupant.belted === false ? 0.08 : 0) + (caged ? 0.25 : 0);
        if ((door || 0) > doorLimit) all.push({ kind: 'door', text: 'door ' + f2(door) + ' m in' });

        var roof = rowRoofCrush(c, seat.row === 'rear', right);

        var roofLimit = (vehicleHasRollCage() || sessionRollCagePresent) ? 0.80 : 0.50;
        if (roof > roofLimit) all.push({ kind: 'roof', text: 'roof ' + f2(roof) + ' m down' });
        var gh = right ? (c.GHR || 0) : (c.GHL || 0);
        var belted = !occupant || occupant.belted !== false;
        var ghExcess = gh - (seat.row === 'rear' ? 0.80 : 0) - (belted ? GH_HEAD_CLEARANCE_BELTED_M : GH_HEAD_CLEARANCE_UNBELTED_M);

        if (ghExcess >= GH_FATAL_EXCESS_M * (caged ? 2 : 1)) all.push({ kind: 'pillars', text: 'pillars ' + f2(gh) + ' m in' });
        if (!all.length) return null;

        var first = all[0];
        return { kind: first.kind, text: all.map(function (a) { return a.text; }).join(', '), all: all,
          footIn: seat.row === 'front' ? foot : boot, doorIn: door || 0 };
      }

      function destroyedSpaceFindingsOne(info, seat) {
        var f = function (region, ais, name, plain) {
          return { eventIndex: 0, region: region, aisSeverity: ais, continuousSeverity: ais, probability: 1,
            name: name, plainDescription: plain, mechanism: 'structural-destroyed-' + region, lowerFidelity: true,
            clinicalDescription: name + ' -- the occupant space collapsed (AIS ' + ais + ').' };
        };
        var kind = info && info.kind;
        var side = seat && seat.side === 'right' ? 'right' : 'left';
        var Side = side === 'right' ? 'Right' : 'Left';
        if (kind === 'footwell') {
          return [
            f('chest', 6, 'Crushed chest (dashboard pushed in)', 'The dashboard and steering were pushed into your chest.'),
            f('abdomen', 4, 'Torn belly organs (dashboard pushed in)', 'Organs in your belly were torn as the front of the car came in.'),
            f('pelvis', 5, 'Crushed pelvis (footwell collapsed)', 'Your pelvis was crushed as the front of the car came in.'),
            f('femur', 6, 'Both thighs crushed (footwell collapsed)', 'Both thigh bones were crushed by the dashboard.'),
            f('lowerLeg', 6, 'Both lower legs crushed (footwell collapsed)', 'The engine came through the footwell and crushed both legs.')
          ];
        }
        if (kind === 'boot') {
          return [
            f('pelvis', 6, 'Crushed pelvis (back of the car collapsed)', 'The back of the car was pushed into your seat and crushed your pelvis.'),
            f('lumbarSpine', 5, 'Broken lower back (back of the car collapsed)', 'Your lower spine was broken as the seat was pushed forward.'),
            f('thoracicSpine', 5, 'Broken back (back of the car collapsed)', 'Your back was broken as the seat folded.'),
            f('abdomen', 5, 'Crushed belly (back of the car collapsed)', 'Your belly was crushed and the organs inside torn.'),
            f('femur', 6, 'Both thighs crushed (back of the car collapsed)', 'Both thigh bones were crushed.')
          ];
        }
        if (kind === 'door') {
          return [
            f('chest', 6, 'Crushed chest (' + side + ' side, door pushed in)', 'The door was pushed into you and crushed your chest.'),
            f('abdomen', 5, 'Crushed belly (' + side + ' side, door pushed in)', 'Your belly was crushed and the organs inside torn.'),
            f('pelvis', 5, 'Crushed pelvis (' + side + ' side, door pushed in)', 'Your pelvis was crushed from the side.'),
            f('upperArm', 6, Side + ' arm crushed (door pushed in)', 'Your ' + side + ' arm was crushed between the door and your body.'),
            f('femur', 6, Side + ' thigh crushed (door pushed in)', 'Your ' + side + ' thigh bone was crushed by the door.'),
            f('head', 4, 'Head injury (' + side + ' side, struck the door frame)', 'Your head hit the door frame hard.')
          ];
        }
        if (kind === 'roof') {
          return [
            f('head', 6, 'Crushed head (roof collapsed)', 'The roof came down onto your head. Nobody survives this.'),
            f('neck', 6, 'Broken neck (roof collapsed)', 'Your neck was broken as the roof came down.'),
            f('thoracicSpine', 5, 'Broken back (roof collapsed)', 'Your spine was compressed and broken.'),
            f('chest', 4, 'Chest injuries (roof collapsed)', 'Your chest was badly injured as you were pressed down into the seat.')
          ];
        }
        if (kind === 'pillars') {
          return [
            f('head', 6, 'Crushed head (' + side + ' side, pillars came in)', 'The side of the car came in at head height. Nobody survives this.'),
            f('neck', 5, 'Broken neck (pillars came in)', 'Your neck was broken as the pillars came in.'),
            f('chest', 4, 'Chest injuries (' + side + ' side, pillars came in)', 'Your chest was badly injured.'),
            f('upperArm', 5, Side + ' arm crushed (pillars came in)', 'Your ' + side + ' arm was crushed.')
          ];
        }
        return [
          f('chest', 6, 'Crushed chest (car collapsed)', 'Your chest was crushed as the car collapsed around you.'),
          f('head', 5, 'Head injury (car collapsed)', 'Your head was badly injured.')
        ];
      }

      function destroyedSpaceFindings(info, seat) {
        if (!info) return [];
        var list = [];
        (info.all && info.all.length ? info.all : [info]).forEach(function (one) {
          list = list.concat(destroyedSpaceFindingsOne(one, seat));
        });
        var kinds = (info.all || [info]).map(function (x) { return x.kind; });
        var mk = function (region, ais, name, plain) {
          return { eventIndex: 0, region: region, aisSeverity: ais, continuousSeverity: ais, probability: 1,
            name: name, plainDescription: plain, mechanism: 'structural-destroyed-' + region, lowerFidelity: true,
            clinicalDescription: name + ' -- the occupant space collapsed (AIS ' + ais + ').' };
        };
        if (kinds.indexOf('footwell') < 0 && kinds.indexOf('boot') < 0 && (info.footIn || 0) > 0.25) {
          list.push(mk('lowerLeg', info.footIn > 0.40 ? 5 : 4, 'Legs trapped and broken (floor pushed in)', 'The floor and the seat in front were pushed into your legs and broke them.'));
          list.push(mk('femur', info.footIn > 0.40 ? 4 : 3, 'Broken thigh (knees driven back)', 'Your knees were driven back and a thigh bone broke.'));
        }
        if (kinds.indexOf('door') < 0 && (info.doorIn || 0) > 0.30) {
          list.push(mk('pelvis', 4, 'Broken pelvis (door pushed in)', 'The door came in and broke your pelvis.'));
        }
        return list;
      }

      function computeOccupantOutcome(trace, seat, restraint, hazards, clock) {
        hazards = hazards || {};
        clock = clock || {};
        var P = window.CrashInjuryProPipeline;
        var occupant = restraint;
        var result = null;
        var exposure = { scalar: 1, verticalShare: 0 };
        if (trace) {
          var angle = tracePdofDeg(trace);
          exposure = occupantExposure(seat, currentImpact(angle));
          result = computeCriteriaAndInjuries(seatTraceFor(trace, seat, angle), occupant,
            seatIntrusionFor(hazards.intrusion, seat, angle), hazards.rollover,
            { quiet: seat.key !== 'driver', rolloverReadOnly: seat.key !== 'driver',
              seatKey: seat.key, rolloverSideContact: rolloverSideContactForSeat(seat) });
        }
        var previousEvents = clock.events || [];
        var events = previousEvents.concat(result ? result.events : []);
        var seed = (scenarioSeed ^ seatSeedFor({ seatKey: seat.key })) >>> 0;
        var candidates = result ? result.injuries.map(function (inj) {
          return Object.assign({}, inj, { eventIndex: inj.eventIndex + previousEvents.length });
        }) : [];

        var aftermathBuffer = false;
        if (trace && previousEvents.length > 0) {
          var mThis = rawTracePdofDeg(trace);
          var dvThis = mThis ? mThis.deltaVMs : 0;
          if (!isOwnHit(dvThis, tracePeakG(trace))) {
            candidates = [];

            aftermathBuffer = true;
            events = previousEvents;
          }
        }
        if (trace) candidates = calibrateLibraryCandidates(candidates, seat, occupant);
        var exposureCandidates = exposureInjuriesFor(occupant, 0);

        var worstCandidateDeltaVMs = 0;
        (result ? result.eventMeta || [] : []).forEach(function (m) {
          if (m && m.deltaVMs > worstCandidateDeltaVMs) worstCandidateDeltaVMs = m.deltaVMs;
        });
        var selected = drawRealisedFindings(candidates.concat(exposureCandidates), seed,
          worstCandidateDeltaVMs);
        var injuries = mergePatientInjuries((clock.injuries || []).concat(
          limbsOnStruckSide(applyGearToFindings(selected.filter(function (inj) { return candidates.indexOf(inj) >= 0; }), occupant), seat)));
        var exposureInjuries = mergePatientInjuries((clock.exposureInjuries || []).concat(
          selected.filter(function (inj) { return exposureCandidates.indexOf(inj) >= 0; }),

          exposureCandidates.filter(function (inj) { return /^drowning-/.test(inj.mechanism || ''); })));

        if (trace) injuries = mergePatientInjuries(injuries.concat(applyGearToFindings(
          structuralFindings(seat, occupant).concat(sideImpactFindings(seat, occupant)).concat(localContactFindings(seat, occupant)).concat(suddenStopBrainFindings(seat, occupant)).concat(helmetNeckFindings(seat, occupant)).concat(greenhouseInjuries(seat.key, occupant))

            .concat(roofCrushInjuries(seat.key, occupant).filter(function (r) { return r.probability >= ROOF_LEVEL_SELECT_P; })), occupant)));

        if (trace && occupant && occupant.belted !== false && !injuries.some(function (i) { return i && i.region === 'chest'; })) {
          var beltDir = impactDirection(activeImpact ? activeImpact.pdofDeg : sessionImpactPdofDeg);
          var beltDv = combinedVehicleDeltaVMs();

          var beltFromBehind = !!(beltDir && beltDir.y < -0.5);
          var beltMarks = (beltDir && beltDir.y > 0.5 && beltDv >= BELT_BRUISE_FRONTAL_MIN_DV_MS) ||
            beltDv >= (beltFromBehind ? 15 : BELT_BRUISE_ANY_MIN_DV_MS) || sessionFloorDvMs >= 6 || sessionRoofDvMs >= 5 ||
            (sessionRolloverQuarterTurns >= 2);
          if (beltMarks) {
            injuries = mergePatientInjuries(injuries.concat([{ eventIndex: 0, region: 'chest', aisSeverity: 1,
              continuousSeverity: 1, probability: 1, name: occupant.harness ? 'Harness bruising across the chest' : 'Seatbelt bruising across the chest',
              clinicalDescription: 'Diagonal chest-wall contusion along the path of the shoulder belt (seat-belt sign, AIS 1).',
              plainDescription: 'The seatbelt left a deep bruise across your chest where it stopped you.',
              mechanism: 'belt-contusion-chest', lowerFidelity: true }]));
          }
        }

        if (trace && occupant && occupant.belted === false) {
          var extraHead = [];
          extraHead = extraHead.concat(unbeltedThrowFindings(seat, occupant));
          extraHead = extraHead.concat(roofJoltFindings(seat));
          if (extraHead.length) injuries = mergePatientInjuries(injuries.concat(applyGearToFindings(extraHead, occupant)));
        }
        var rollBody = applyGearToFindings(rolloverBodyFindings(seat, occupant), occupant);
        if (rollBody.length) injuries = mergePatientInjuries(injuries.concat(rollBody));
        if (trace) {
          var minor = minorInjuryFindings(seat, occupant);
          if (minor.length) injuries = mergePatientInjuries(injuries.concat(minor));
          var second = secondSideHitFindings(seat, occupant);
          if (second.length) injuries = addExtraHitInjuries(injuries, applyGearToFindings(second, occupant));
        }

        currentSeatDestroyed = seatSpaceDestroyed(seat, occupant);
        var destroyedInfo = currentSeatDestroyed ? seatSpaceDestroyedInfo(seat, occupant) : null;

        if (currentSeatDestroyed) {
          injuries = mergePatientInjuries(injuries.concat(destroyedSpaceFindings(destroyedInfo, seat)));
        }
        if (trace) {
          var neckX = neckLoadFindings(seat, occupant, injuries, !!currentSeatDestroyed);
          if (neckX.length) injuries = mergePatientInjuries(injuries.concat(neckX));
        }
        var all = severityConsistent(mergePatientInjuries(injuries.concat(exposureInjuries)).map(function (inj) { return seatContextNames(inj, seat); }));
        var reportEvents = events.length ? events : [{ startIndex: 0, endIndex: 1, startTimeS: 0, endTimeS: 1 }];
        var base = buildReport(all, reportEvents, occupant.age);
        var elapsedS = Math.max(0, clock.elapsedS || 0);
        var totalElapsedS = (clock.totalElapsedS || 0) + elapsedS;
        var state = clock.patient || { bloodLostM3: 0, lowestSurvivalPercent: 100, dead: false };

        var next = P.progressPatient(base, all, state, {
          elapsedS: elapsedS * bleedElapsedScale(all), massKg: occupant.massKg,
          externalBleedingControlled: !!clock.externalBleedingControlled,
          fireDoseS: 0, submergedS: 0
        });
        var ceilingTier = structuralCeilingTier(seat, restraintTierOf(occupant));
        var ceiling = currentSeatDestroyed ? 0 : seatCeilingPercent(seat, occupant);
        var basePercent = base.survival ? base.survival.survivalProbabilityPercent : null;
        var progressed = applyProgressiveDeterioration(next.report, all, totalElapsedS,
          next.state, occupant, ceiling, basePercent);
        var report = applyStructuralLimit(progressed, sessionVehicleDeltaVMs,
          ceilingTier, next.state, basePercent, ceiling);
        currentSeatDestroyed = false;
        return { report: report, injuries: injuries, exposureInjuries: exposureInjuries,
          events: events, eventMeta: (clock.eventMeta || []).concat(result && !aftermathBuffer ? result.eventMeta : []),
          patient: next.state, totalElapsedS: totalElapsedS,
          bleedMlMin: next.bleedingRateM3S * 60000000, exposure: exposure,
          newEventCount: result && !aftermathBuffer ? result.events.length : 0, hasCapture: !!result };
      }

      var HEAD_STRIKE_FRONT_MPH = [12, 22, 35];
      var HEAD_STRIKE_SIDE_MPH = [12, 20, 30];
      function headStrikeFinding(ais, where, eventIndex) {
        var names = {
          1: 'Cut and bruised head (' + where + ')',
          2: 'Concussion (head ' + where + ')',
          3: 'Bruised brain (head ' + where + ')'
        };
        var plain = {
          1: 'Your head ' + where + '. Cuts and a bruise, no damage inside.',
          2: 'Your head ' + where + ' hard enough to knock you dizzy or out for a moment.',
          3: 'Your head ' + where + ' hard enough to bruise the brain inside.'
        };
        return { eventIndex: eventIndex || 0, region: 'head', aisSeverity: ais, continuousSeverity: ais,
          probability: 1, name: names[ais], mechanism: 'unbelted-head-strike',
          clinicalDescription: ['', 'Scalp laceration and contusion from an unrestrained head strike (AIS 1).',
            'Concussion from an unrestrained head strike (AIS 2).',
            'Cerebral contusion from an unrestrained head strike (AIS 3).'][ais],
          plainDescription: plain[ais], lowerFidelity: true };
      }
      function unbeltedHeadStrikeFinding(seat) {
        var pdof = Number.isFinite(sessionImpactPdofDeg) ? sessionImpactPdofDeg : null;
        var dir = impactDirection(pdof);
        if (!dir || !seat) return null;

        var mph = Math.hypot(sessionImpactDvXMs || 0, sessionImpactDvYMs || 0) / 0.44704;
        if (!(mph > 0)) return null;
        var steps = null, where = null;
        if (dir.y > 0.5) {
          steps = HEAD_STRIKE_FRONT_MPH;
          where = seat.row === 'front' ? 'hit the windscreen' : 'hit the seat in front';
        } else if (Math.abs(dir.x) > 0.7 && seatIsNearSide(seat, pdof)) {
          steps = HEAD_STRIKE_SIDE_MPH;
          where = 'hit the side window';
        }
        if (!steps) return null;
        var ais = mph >= steps[2] ? 3 : mph >= steps[1] ? 2 : mph >= steps[0] ? 1 : 0;
        return ais ? headStrikeFinding(ais, where) : null;
      }

      var UNB_FRONT_HEAD_MPH = [8, 15, 26, 36, 50];
      var UNB_REAR_HEAD_MPH = [8, 15, 26, 37, 52];
      var UNB_SIDE_NEAR_HEAD_MPH = [7, 12, 20, 28, 38];
      var UNB_SIDE_FAR_HEAD_MPH = [8, 14, 22, 30, 42];
      var UNB_FRONT_CHEST_MPH = [99, 22, 32, 44, 58];
      var UNB_REAR_CHEST_MPH = [99, 26, 36, 48, 62];
      var UNB_FAR_CHEST_MPH = [99, 20, 30, 42, 99];
      var UNB_AIRBAG_SHIFT_MPH = 8;
      function gradeBySteps(steps, v) {
        var a = 0;
        for (var i = 0; i < steps.length; i++) if (v >= steps[i]) a = i + 1;
        return a;
      }

      function unbeltedKinematics(seat, occupant) {
        var out = { frontMph: 0, latMph: 0, near: false, far: false, dir: null };
        if (!seat || !Number.isFinite(sessionImpactPdofDeg)) return out;
        var dir = impactDirection(sessionImpactPdofDeg);
        if (!dir) return out;
        out.dir = dir;
        var eff = seatEffectiveDeltaVMs(seat);
        if (dir.y > 0.35 && eff > 0) out.frontMph = eff / 0.44704;
        var lat = plausibleLateralMs() / 0.44704;
        if (Math.abs(dir.x) > 0.5 && lat > 0) {
          out.latMph = lat;
          out.near = seatIsNearSide(seat, sessionImpactPdofDeg);
          out.far = !out.near;
        }
        return out;
      }
      function neighbourInRow(seat) {
        var key = seat.row === 'front' ? (seat.side === 'right' ? 'driver' : 'frontRight') : (seat.side === 'right' ? 'rearLeft' : 'rearRight');
        if (key !== 'driver' && !seatIsOccupied(key)) return null;
        return { key: key, belted: seatRestraintTier(key) !== 'unbelted' };
      }
      var UNB_HEAD_NAMES = ['', 'Cut and bruised head', 'Concussion', 'Bruised brain', 'Bleeding on the brain', 'Critical brain injury'];
      var UNB_HEAD_PLAIN = ['', 'Cuts and a bruise, no damage inside.', 'You were knocked dizzy or out for a moment.',
        'The brain inside was bruised.', 'There is bleeding inside your skull.', 'The brain was badly damaged.'];
      var UNB_HEAD_CLIN = ['', 'Scalp laceration and contusion', 'Concussion', 'Cerebral contusion', 'Acute subdural haematoma', 'Severe traumatic brain injury'];
      function unbeltedHeadGraded(ais, where, whereSentence) {
        return { eventIndex: 0, region: 'head', aisSeverity: ais, continuousSeverity: ais, probability: 1,
          name: UNB_HEAD_NAMES[ais] + ' (' + where + ')', mechanism: 'unbelted-head-strike',
          clinicalDescription: UNB_HEAD_CLIN[ais] + ' from an unrestrained head strike (AIS ' + ais + ').',
          plainDescription: whereSentence + ' ' + UNB_HEAD_PLAIN[ais], lowerFidelity: true };
      }
      function unbeltedBodyFinding(region, ais, name, clinical, plain) {
        return { eventIndex: 0, region: region, aisSeverity: ais, continuousSeverity: ais, probability: 1,
          name: name, mechanism: 'unbelted-' + region, clinicalDescription: clinical, plainDescription: plain, lowerFidelity: true };
      }

      function unbeltedHasAirbag(seat) {
        if (!seat || seat.row !== 'front' || !vehicleHasAirbags()) return false;
        try { return !!seatGear(seat.key).airbag; } catch (e) { return false; }
      }
      function unbeltedLevels(seat, occupant) {
        var k = unbeltedKinematics(seat, occupant);
        var front = seat.row === 'front';
        var shift = unbeltedHasAirbag(seat) ? UNB_AIRBAG_SHIFT_MPH : 0;
        var hF = gradeBySteps(front ? UNB_FRONT_HEAD_MPH : UNB_REAR_HEAD_MPH, k.frontMph - shift);
        var cF = Math.max(0, gradeBySteps(front ? UNB_FRONT_CHEST_MPH : UNB_REAR_CHEST_MPH, k.frontMph - shift));
        var hS = k.near ? gradeBySteps(UNB_SIDE_NEAR_HEAD_MPH, k.latMph) : k.far ? gradeBySteps(UNB_SIDE_FAR_HEAD_MPH, k.latMph) : 0;
        var cS = k.far ? gradeBySteps(UNB_FAR_CHEST_MPH, k.latMph) : 0;
        return { k: k, headFront: hF, chestFront: cF, headSide: hS, chestSide: cS,
          head: Math.max(hF, hS), chest: Math.max(cF, cS) };
      }
      function unbeltedThrowFindings(seat, occupant) {
        if (!seat || !occupant || occupant.belted !== false) return [];
        var lv = unbeltedLevels(seat, occupant), k = lv.k, out = [];
        var front = seat.row === 'front';
        var driver = seat.key === 'driver';
        var sideWord = seat.side === 'right' ? 'right' : 'left';
        if (lv.headFront) {
          out.push(unbeltedHeadGraded(lv.headFront, front ? 'hit the windscreen' : 'hit the seat in front',
            front ? 'Nothing held you and your head went into the windscreen.' : 'Nothing held you and your head went into the seat in front.'));
        }
        if (lv.chestFront) {
          var c = lv.chestFront;
          var what = front ? (driver ? 'steering wheel' : 'dashboard') : 'seat in front';
          out.push(unbeltedBodyFinding('chest', c,
            (c >= 5 ? 'Crushed chest' : c === 4 ? 'Many broken ribs, bruised lung' : c === 3 ? 'Broken ribs' : 'Broken rib') + ' (hit the ' + what + ')',
            'Rib fractures' + (c >= 4 ? ' with pulmonary contusion' : '') + ' from the unrestrained chest striking the ' + what + ' (AIS ' + c + ').',
            'Your chest was thrown into the ' + what + '.'));
          if (c >= 4) out.push(unbeltedBodyFinding('lung', 3, 'Bruised lung (hit the ' + what + ')',
            'Pulmonary contusion beneath the rib fractures (AIS 3).', 'The lung under the broken ribs is bruised and bleeding.'));
        }
        if (k.frontMph > 0) {
          var m = k.frontMph - (unbeltedHasAirbag(seat) ? UNB_AIRBAG_SHIFT_MPH : 0);
          var kneeWhat = front ? 'dashboard' : 'seat in front';
          if (m >= (front ? 16 : 20)) out.push(unbeltedBodyFinding('knee', 2, 'Injured knees (hit the ' + kneeWhat + ')',
            'Knee contusion and ligament injury from striking the ' + kneeWhat + ' (AIS 2).', 'Your knees slammed into the ' + kneeWhat + '.'));
          if (m >= (front ? 32 : 36)) out.push(unbeltedBodyFinding('femur', 3, 'Broken thigh (knees hit the ' + kneeWhat + ')',
            'Femoral shaft fracture from axial knee loading against the ' + kneeWhat + ' (AIS 3).', 'Your knee hit the ' + kneeWhat + ' so hard that your thigh bone broke.'));
          if (front && m >= 40) out.push(unbeltedBodyFinding('pelvis', 3, 'Broken hip (knees driven into the dashboard)',
            'Acetabular fracture from the knee-thigh-hip load path (AIS 3).', 'The force went up your legs and broke your hip.'));

          var handWhat = driver ? 'gripping the steering wheel' : 'braced against the ' + kneeWhat;
          if (m >= 9 && m < 20) out.push(unbeltedBodyFinding('hand', 1, 'Bruised hands (' + handWhat + ')',
            driver ? 'Hand contusions from the steering wheel rim (AIS 1).' : 'Hand contusions from bracing against the ' + kneeWhat + ' (AIS 1).',
            driver ? 'Your hands were on the wheel and took the hit.' : 'You put your hands out and they took the hit.'));
          if (m >= 20) out.push(unbeltedBodyFinding('wrist', m >= 32 ? 3 : 2, (m >= 32 ? 'Badly broken wrist' : 'Broken wrist') + ' (' + handWhat + ')',
            (driver ? 'Distal radius fracture from hyperextension on the deforming steering wheel' : 'Distal radius fracture from bracing an unrestrained body against the ' + kneeWhat) + ' (AIS ' + (m >= 32 ? 3 : 2) + ').',
            driver ? 'The steering wheel bent your hands back and broke your wrist.' : 'You braced against the ' + kneeWhat + ' and your wrist broke.'));
          if (driver && m >= 25) out.push(unbeltedBodyFinding('hand', 2, 'Broken thumb (gripping the steering wheel)',
            'Thumb metacarpal fracture from the steering wheel being forced out of the grip (AIS 2).',
            'The wheel was torn out of your hands and broke your thumb.'));
          if (m >= 12 && m < (front ? 16 : 20)) out.push(unbeltedBodyFinding('knee', 1, 'Bruised knees (hit the ' + kneeWhat + ')',
            'Knee contusions against the ' + kneeWhat + ' (AIS 1).', 'Your knees hit the ' + kneeWhat + '.'));
          if (m >= 24) out.push(unbeltedBodyFinding('head', 2, 'Broken nose and cheekbone (face hit ' + (front ? 'the windscreen' : 'the seat in front') + ')',
            'Nasal and zygomatic fractures from an unrestrained facial impact (AIS 2).', 'Your face hit hard and the bones in it broke.'));

          var headInto = front ? 'the windscreen' : 'the seat in front';
          if (m >= 18 && m < 30) out.push(unbeltedBodyFinding('neck', 1, 'Neck strain (head thrown into ' + headInto + ')',
            'Cervical strain from the head striking ' + headInto + ' after the chest stopped (AIS 1).',
            'Your chest stopped first and your head kept going into ' + headInto + ', straining your neck.'));
          if (m >= 30) out.push(unbeltedBodyFinding('neck', m >= 45 ? 3 : 2, (m >= 45 ? 'Broken neck' : 'Neck sprain') + ' (head kept going after the chest stopped)',
            'Cervical ' + (m >= 45 ? 'fracture' : 'sprain') + ' from hyperflexion: the chest struck first and the head continued forward (AIS ' + (m >= 45 ? 3 : 2) + ').',
            'Your chest hit first and stopped, and your head kept going forward and bent your neck.'));
        }
        if (lv.headSide) {
          if (k.near) {
            out.push(unbeltedHeadGraded(lv.headSide, 'hit the side window', 'Nothing held you off the door and your head hit the side window.'));
          } else {
            var nb = neighbourInRow(seat);
            var into = nb ? (nb.key === 'driver' ? 'thrown into the driver' : 'thrown into the person next to you') : 'thrown across into the far door';
            out.push(unbeltedHeadGraded(lv.headSide, into, nb ? 'You were thrown across the car and your head hit the person next to you.'
              : 'You were thrown right across the car into the far door.'));
          }
        }
        if (k.far && lv.chestSide) {
          var hitWord = (sessionImpactPdofDeg > 180 ? 'left' : 'right');
          out.push(unbeltedBodyFinding('chest', lv.chestSide, (lv.chestSide >= 4 ? 'Many broken ribs, bruised lung' : lv.chestSide === 3 ? 'Broken ribs' : 'Broken rib') + ' (thrown across the car)',
            'Rib fractures from being thrown across the cabin (AIS ' + lv.chestSide + ').', 'You were thrown across the car and landed hard on your ' + hitWord + ' side.'));
          if (k.latMph >= 22) out.push(unbeltedBodyFinding('upperArm', k.latMph >= 32 ? 3 : 2, (k.latMph >= 32 ? 'Badly broken ' : 'Broken ') + hitWord + ' upper arm (thrown across the car)',
            'Humeral fracture from the arm striking the far side of the cabin (AIS ' + (k.latMph >= 32 ? 3 : 2) + ').', 'Your arm hit the other side of the car as you were thrown across.'));
        }
        return out;
      }

      var NEAR_ARM_MPH = [10, 16, 26];
      var NEAR_KNEE_MPH = 18;
      var NEAR_THIGH_MPH = 26;
      var FAR_BELTED_HEAD_MPH = [24, 34];
      function sideImpactFindings(seat, occupant) {
        if (!seat || !occupant || !Number.isFinite(sessionImpactPdofDeg)) return [];
        var dir = impactDirection(sessionImpactPdofDeg);
        if (!dir || !(Math.abs(dir.x) > 0.5)) return [];
        var lat = plausibleLateralMs() / 0.44704;
        if (!(lat > 0)) return [];
        var near = seatIsNearSide(seat, sessionImpactPdofDeg);
        var out = [];
        var sideWord = seat.side === 'right' ? 'right' : 'left';
        if (near) {
          var door = 0;
          if (sessionCrush) door = seat.row === 'front' ? (seat.side === 'right' ? sessionCrush.SFR : sessionCrush.SFL)
            : (seat.side === 'right' ? sessionCrush.SRR : sessionCrush.SRL);

          if (sessionCrush && seat.row === 'rear') door = Math.max(door || 0, 0.7 * rearQuarterShareM(sessionCrush, seat.side === 'right'));
          var L = lat * (sessionCrush ? 0.75 + 0.35 * Math.max(0, Math.min(1, (door || 0) / 0.25)) : 1);
          if (vehicleHasRollCage() || sessionRollCagePresent) L *= 0.85;
          var arm = gradeBySteps(NEAR_ARM_MPH, L);
          if (arm === 1) out.push(structuralFinding('upperArm', 1, 'Bruised ' + sideWord + ' arm (hit the door)',
            'Contusion of the near-side arm against the door panel (AIS 1).', 'Your ' + sideWord + ' arm hit the door.'));
          else if (arm >= 2) out.push(structuralFinding('upperArm', arm, (arm >= 3 ? 'Badly broken ' : 'Broken ') + sideWord + ' upper arm (door pushed into it)',
            'Humeral fracture from the intruding door loading the near-side arm (AIS ' + arm + ').',
            'The door was pushed into your ' + sideWord + ' arm and broke it.'));
          if (L >= NEAR_KNEE_MPH) out.push(structuralFinding('knee', 2, 'Injured ' + sideWord + ' knee (hit the door panel)',
            'Knee contusion and ligament injury against the door trim (AIS 2).', 'Your ' + sideWord + ' knee was hit by the door.'));
          if (L >= NEAR_THIGH_MPH) out.push(structuralFinding('femur', 3, 'Broken ' + sideWord + ' thigh (door pushed into it)',
            'Femoral fracture from the intruding door at hip and thigh height (AIS 3).',
            'The door came into your ' + sideWord + ' leg and broke your thigh bone.'));

          var dd = (door || 0) * (seat.row === 'rear' ? 1.15 : 1) * ((vehicleHasRollCage() || sessionRollCagePresent) ? 0.7 : 1);
          var ribA = (dd >= 0.28 || L >= 40) ? 4 : (dd >= 0.18 || L >= 32) ? 3 : (dd >= 0.10 || L >= 25) ? 2 : 0;
          if (ribA) out.push(structuralFinding('chest', ribA, (ribA >= 4 ? 'Many broken ribs, bruised lung' : ribA === 3 ? 'Broken ribs' : 'Broken rib') + ' (' + sideWord + ' side)',
            (ribA >= 3 ? 'Multiple rib fractures' : 'Single rib fracture') + ' (' + sideWord + ' side)',
            ribA >= 3 ? 'You broke several ribs.' : 'You broke a rib.'));
          if (dd >= 0.22 || L >= 36) out.push(structuralFinding('pelvis', 3, 'Broken pelvis (door pushed in)',
            'Pelvic fracture (door intrusion) (' + sideWord + ' side)', 'The door was pushed into you and broke your pelvis.'));
          else if (dd >= 0.06 || L >= 20) out.push(Object.assign(structuralFinding('pelvis', 1, 'Bruised ' + sideWord + ' hip (door panel)',
            'Hip contusion from the door armrest', 'The door panel hit your hip.'), { minorExtra: true, mechanism: 'minor-pelvis' }));
          if (!occupant.helmet) {
            var headA = (dd >= 0.30 || L >= 45) ? 3 : (dd >= 0.20 || L >= 35) ? 2 : 0;
            if (headA) out.push(structuralFinding('head', headA, (headA >= 3 ? 'Bruised brain' : 'Concussion') + ' (hit the side window)',
              (headA >= 3 ? 'Cerebral contusion' : 'Concussion') + ' from head contact with the side glass and B-pillar (AIS ' + headA + ').',
              'Your head hit the side window as the door came in.'));
          }
          var nb = neighbourInRow(seat);
          if (nb && !nb.belted && lat >= 18) {
            var a = lat >= 28 ? 3 : 2;
            out.push(structuralFinding('chest', a, (a >= 3 ? 'Broken ribs' : 'Broken rib') + ' (hit by the unbelted passenger next to you)',
              'Rib fractures from the unrestrained neighbouring occupant being thrown into this occupant (AIS ' + a + ').',
              'The unbelted person next to you was thrown into you.'));
          }
        } else if (occupant.belted !== false && !occupant.harness) {
          var h = gradeBySteps(FAR_BELTED_HEAD_MPH, lat);
          if (h) out.push(structuralFinding('head', h + 1, h >= 2 ? 'Bruised brain (head swung across the car)' : 'Concussion (head swung across the car)',
            (h >= 2 ? 'Cerebral contusion' : 'Concussion') + ' from far-side head excursion out of the shoulder belt (AIS ' + (h + 1) + ').',
            'Your body slid out of the shoulder belt and your head swung across the car.'));
        }
        return out;
      }

      function helmetNeckFindings(seat, occupant) {
        if (!seat || !occupant || !occupant.helmet || occupant.hans) return [];
        var out = [];
        var m = 0;
        if (Number.isFinite(sessionImpactPdofDeg)) {
          var dir = impactDirection(sessionImpactPdofDeg);
          if (dir && dir.y > 0.35) m = seatEffectiveDeltaVMs(seat) / 0.44704;
        }
        var land = (sessionFloorDvMs || 0) * landingSeatFactor(seat);
        var roll = (sessionRolloverQuarterTurns || 0) >= 2 ? effectiveRollTurns() : 0;

        var hg = seatPeakG(seat) || 0;
        var lvl = 0;
        if (m >= 22 || land >= 5 || roll >= 2 || hg >= 30) lvl = 1;
        if (m >= 32 || land >= 8 || roll >= 4 || hg >= 45) lvl = 2;
        if (m >= 48 || land >= 12 || roll >= 8 || hg >= 65) lvl = 3;
        if (!lvl) return out;
        var name = lvl >= 3 ? 'Broken neck (the helmet\'s weight whipped the head)' : lvl === 2 ? 'Whiplash (the helmet\'s weight pulled the head)' : 'Neck strain (heavy helmet)';
        out.push({ eventIndex: 0, region: 'neck', aisSeverity: lvl, continuousSeverity: lvl, probability: 1, name: name,
          mechanism: 'unbelted-neck-helmet', lowerFidelity: true,
          clinicalDescription: (lvl >= 3 ? 'Cervical fracture' : 'Cervical soft-tissue injury') + ' from the added inertia of the helmet without a head restraint (AIS ' + lvl + ').',
          plainDescription: lvl >= 3 ? 'The helmet made your head heavy and your neck broke when it was whipped.' :
            'The weight of the helmet pulled your head and strained your neck.' });
        return out;
      }

      function calibrateLibraryCandidates(list, seat, occupant) {
        if (!list || !list.length || !seat || !occupant) return list;

        if ((sessionRolloverQuarterTurns || 0) >= 1) {
          var qe = effectiveRollTurns();
          var unbR = occupant.belted === false;
          var capHead = unbR ? (qe >= 8 ? 6 : qe >= 4 ? 4 : qe >= 2 ? 3 : 2) : (qe >= 8 ? 5 : qe >= 4 ? 3 : 2);
          var capBody = unbR ? (qe >= 8 ? 6 : qe >= 4 ? 4 : 3) : (qe >= 8 ? 5 : qe >= 4 ? 3 : 2);
          list = list.filter(function (inj) {
            if (!inj || !/^rollover/i.test(String(inj.mechanism || ''))) return true;
            var a = inj.aisSeverity || 0;
            if (inj.region === 'head' || inj.region === 'neck') return a <= capHead;
            return a <= capBody;
          });
        }
        if (occupant.belted === false) {
          var lv = unbeltedLevels(seat, occupant);
          if (!lv.head && !lv.chest) return list;
          return list.filter(function (inj) {
            if (!inj) return false;
            var a = inj.aisSeverity || 0;
            if (/^(rollover|intrusion|vertical)/i.test(String(inj.mechanism || ''))) return true;
            if (lv.head && inj.region === 'head' && a > lv.head) return false;
            if (lv.chest && (inj.region === 'chest' || inj.region === 'lung') && a > lv.chest) return false;
            return true;
          });
        }
        var m = seatEffectiveDeltaVMs(seat) / 0.44704;
        var gate = occupant.airbag || occupant.harness ? 55 : 50;
        if (m >= gate) return list;
        if ((sessionRolloverQuarterTurns || 0) >= 2 || sessionFloorDvMs >= 8 || sessionRoofDvMs >= 6) return list;
        var latN = plausibleLateralMs() / 0.44704;
        if (latN >= 25 && seatIsNearSide(seat, Number.isFinite(sessionImpactPdofDeg) ? sessionImpactPdofDeg : 0)) return list;
        return list.map(function (inj) {
          if (!inj || !(inj.region === 'chest' || inj.region === 'lung') || !((inj.aisSeverity || 0) >= 4)) return inj;
          if (/^(rollover|intrusion)/i.test(String(inj.mechanism || ''))) return inj;
          if (inj.region === 'chest') return Object.assign({}, inj, { aisSeverity: 3, continuousSeverity: 3,
            name: 'Multiple rib fractures' + (/\bleft\b/i.test(inj.name || '') ? ' (left side)' : /\bright\b/i.test(inj.name || '') ? ' (right side)' : ''),
            clinicalDescription: 'Multiple rib fractures under the restraint (AIS 3).',
            plainDescription: 'Several ribs broke against the belt.' });
          return Object.assign({}, inj, { aisSeverity: 3, continuousSeverity: 3,
            clinicalDescription: String(inj.clinicalDescription || '').replace(/AIS 4/, 'AIS 3') });
        });
      }

      var ROOF_JOLT_STEPS = [
        [8, 3], [15, 4], [28, 6]
      ];
      var sessionJoltLevel = 0;
      function noteRoofJolt(peakG, dvzMs) {
        var lvl = 0;
        for (var i = 0; i < ROOF_JOLT_STEPS.length; i++) {
          if (peakG >= ROOF_JOLT_STEPS[i][0] && dvzMs >= ROOF_JOLT_STEPS[i][1]) lvl = i + 1;
        }
        if (lvl > sessionJoltLevel) sessionJoltLevel = lvl;
      }

      function rolloverBodyFindings(seat, occupant) {
        var rawQt = sessionRolloverQuarterTurns || 0;

        var qt = Math.max(effectiveRollTurns(), Math.min(rawQt, 1.5));
        if (!(qt >= 1)) return [];
        var harness = !!(occupant && occupant.harness);
        var unb = !!(occupant && occupant.belted === false);
        var f = function (region, ais, name, clinical, plain) {
          return { eventIndex: 0, region: region, aisSeverity: ais, continuousSeverity: ais, probability: 1,
            name: name, mechanism: 'rollover-body-' + region, lowerFidelity: true,
            clinicalDescription: clinical + ' (AIS ' + ais + ').', plainDescription: plain };
        };
        var out = [];
        var neck = harness ? (qt >= 4 ? 1 : 0) : (qt >= 4 ? 2 : 1) + (unb ? 1 : 0);
        if (neck > 0) {
          out.push(f('neck', neck, neck >= 2 ? 'Neck sprain (thrown about in the roll)' : 'Strained neck (thrown about in the roll)',
            'Cervical soft-tissue strain from repeated lateral head excursion during the rollover',
            neck >= 2 ? 'Your head was thrown from side to side as the car rolled and your neck is sprained.'
              : 'Your head was thrown about as the car rolled and your neck is strained.'));
        }
        if (qt >= 2) {
          var knee = harness ? 1 : (qt >= 6 ? 2 : 1) + (unb ? 1 : 0);
          out.push(f('knee', Math.min(3, knee), knee >= 2 ? (seat && seat.row === 'rear' ? 'Injured knees (legs thrown into the front seats)' : 'Injured knees (legs thrown into the dash)') : 'Bruised knees (legs thrown about in the roll)',
            'Knee contusion from flailing contact with the dashboard, console and door trim during the rollover',
            'Your legs were thrown about as the car rolled and your knees hit the inside of the car.'));
        }

        if (!unb && !harness) {
          if (qt >= 2) out.push(Object.assign(f('upperArm', 1, 'Bruised shoulder (thrown against the door in the roll)',
            'Shoulder contusion from contact with the door trim during the rollover', 'Your shoulder hit the door as the car rolled.'), { minorExtra: true }));
          if (qt >= 3) out.push(Object.assign(f('chest', 1, 'Bruised ribs (the belt held you as the car turned over)',
            'Chest-wall contusion from restraint loading during the rollover', 'The belt dug into your ribs as you hung in it while the car turned over.'), { minorExtra: true }));
          if (qt >= 4) out.push(f('forearm', qt >= 8 ? 3 : 2, qt >= 8 ? 'Badly broken forearm (arm flailed out in the roll)' : 'Broken forearm (arm flailed into the door in the roll)',
            'Forearm fracture from the arm flailing against the door and roof during the rollover', 'Your arm was thrown against the inside of the car as it rolled and broke.'));
          if (qt >= 4 && !(occupant && occupant.helmet)) out.push(f('head', 2, 'Concussion (head hit the side window in the roll)',
            'Concussion from head contact with the side glazing during the rollover', 'Your head hit the side window as the car rolled and you were concussed.'));
        }

        if (unb) {
          if (qt >= 1) out.push(f('head', qt >= 6 ? 4 : qt >= 2 ? 3 : 2,
            qt >= 6 ? 'Bleeding on the brain (thrown around the cabin)' : qt >= 2 ? 'Bruised brain (thrown against the roof)' : 'Concussion (head hit the side window)',
            'Head strikes against the roof, pillars and glazing of an unrestrained occupant during the rollover',
            'Nothing held you in your seat, and your head hit the inside of the car as it rolled.'));
          if (qt >= 2) out.push(f('upperArm', qt >= 4 ? 3 : 2, qt >= 4 ? 'Badly broken arm (thrown around the cabin)' : 'Broken arm (thrown around the cabin)',
            'Humeral fracture from flailing impacts of an unrestrained occupant during the rollover',
            'Your arm broke as you were thrown around the inside of the car.'));
          if (qt >= 2) out.push(f('chest', qt >= 4 ? 3 : 2, qt >= 4 ? 'Broken ribs (thrown around the cabin)' : 'Cracked ribs (thrown around the cabin)',
            'Rib fractures from repeated impacts against the interior during the rollover',
            'Your chest hit the inside of the car again and again as it rolled.'));
          if (qt >= 4) out.push(f('thoracicSpine', 3, 'Broken back (thrown against the roof)',
            'Thoracic vertebral fracture from an unrestrained occupant striking the roof during the rollover',
            'You landed on the roof with your back as the car turned over.'));
          if (qt >= 6) out.push(f('neck', 3, 'Broken neck (thrown against the roof)',
            'Cervical fracture from axial loading of the head against the roof during the rollover',
            'Your head was driven into the roof and your neck broke.'));
          if (qt >= 6) out.push(f('pelvis', 3, 'Broken pelvis (thrown around the cabin)',
            'Pelvic fracture from impacts against the interior during a prolonged rollover',
            'Your hips hit the inside of the car hard enough to break your pelvis.'));
        }

        if (seat && rolloverSideContactForSeat(seat) !== 0 && rawQt >= 1) {
          var sw = seat.side === 'right' ? 'right' : 'left';
          var hard = Math.min(1, rollIntensity() + 0.2);
          var shoulder = unb ? (hard > 0.6 ? 3 : 2) : (harness ? 1 : (hard > 0.6 ? 2 : 1));
          out.push(f('upperArm', shoulder, (shoulder >= 3 ? 'Broken ' + sw + ' shoulder' : shoulder === 2 ? 'Broken ' + sw + ' collarbone area' : 'Bruised ' + sw + ' shoulder') + ' (car came down on your side)',
            'Shoulder-girdle injury from contact with the door and pillar on the side the car landed on',
            'The car came down on your side and your shoulder took the weight.'));
          if (!harness) out.push(f('pelvis', unb && hard > 0.5 ? 3 : (hard > 0.7 ? 2 : 1), (unb && hard > 0.5 ? 'Broken pelvis' : hard > 0.7 ? 'Cracked hip bone' : 'Bruised hip') + ' (car came down on your side)',
            'Lateral pelvic loading against the door on the side the car landed on',
            'Your hip was driven into the door as the car landed on its side.'));
          if (!(occupant && occupant.helmet)) out.push(f('head', unb ? (hard > 0.6 ? 3 : 2) : (hard > 0.6 ? 2 : 1), (unb ? (hard > 0.6 ? 'Bruised brain' : 'Concussion') : (hard > 0.6 ? 'Concussion' : 'Bump on the head')) + ' (head hit the side window)',
            'Head contact with the side glazing on the side the car landed on',
            'Your head hit the side window as the car came down on your side.'));
        }
        if (qt >= 4 && !harness) {
          var shin = (qt >= 8 ? 2 : 1) + (unb ? 1 : 0);
          out.push(f('lowerLeg', Math.min(3, shin), shin >= 2 ? 'Cracked shin (legs thrown about in the roll)' : 'Bruised shins (legs thrown about in the roll)',
            'Lower-leg contusion from repeated contact with the footwell and door during the rollover',
            shin >= 2 ? 'A shin bone cracked as your legs hit the inside of the car again and again.'
              : 'Your shins were bruised hitting the inside of the car as it rolled.'));
        }
        return out;
      }

      function addExtraHitInjuries(injuries, extra) {
        var list = injuries.slice();
        var bumped = Object.create(null);
        extra.forEach(function (e) {
          if (!e || !e.region) return;
          var idx = -1, worst = 0;
          for (var i = 0; i < list.length; i++) {
            var it = list[i];
            if (it && it.region === e.region && !it.minorExtra && it.aisSeverity > worst) { worst = it.aisSeverity; idx = i; }
          }
          if (idx < 0 || e.aisSeverity > worst) { list.push(e); return; }

          if (list[idx].extraBumped) return;
          if (e.aisSeverity >= 2 && worst >= 2 && e.aisSeverity >= worst - 1 && worst < 5 && !bumped[e.region]) {
            bumped[e.region] = true;
            var up = Object.assign({}, list[idx]);
            up.aisSeverity = worst + 1;
            up.extraBumped = true;
            up.continuousSeverity = Math.max(up.continuousSeverity || 0, worst + 1 - 0.25);
            list[idx] = up;
            return;
          }
          list.push(Object.assign({}, e, { minorExtra: true, aisSeverity: Math.min(e.aisSeverity, worst) }));
        });
        return mergePatientInjuries(list);
      }

      function secondSideHitFindings(seat, occupant) {
        if (!seat || !occupant || !Number.isFinite(sessionImpactPdofDeg) || !sessionAllHits.length) return [];

        var mainDv = sessionImpactDeltaVMs || 0, mainSkipped = false;
        var extras = sessionAllHits.slice().sort(function (a, b) { return b.deltaVMs - a.deltaVMs; }).filter(function (h) {
          if (!mainSkipped && Math.abs(h.deltaVMs - mainDv) < 0.05) { mainSkipped = true; return false; }
          return true;
        }).slice(0, 4);
        if (!extras.length) return [];
        var keep = { p: sessionImpactPdofDeg, y: sessionImpactDvYMs, x: sessionImpactDvXMs, z: sessionImpactDvZMs,
          g: sessionImpactPeakLatG, lg: sessionImpactPeakLonG, v: sessionVehicleDeltaVMs, hh: sessionHardHits, d: sessionImpactDeltaVMs };
        var out = [];
        try {
          extras.forEach(function (h) {
            sessionImpactPdofDeg = h.pdofDeg; sessionImpactDvXMs = h.dvxMs; sessionImpactDvYMs = h.dvyMs; sessionImpactDvZMs = h.dvzMs;
            sessionImpactPeakLatG = h.peakLatG; sessionImpactPeakLonG = h.peakLonG;
            sessionVehicleDeltaVMs = h.deltaVMs; sessionImpactDeltaVMs = h.deltaVMs; sessionHardHits = [];
            var dir = impactDirection(h.pdofDeg);
            if (occupant.belted === false) out = out.concat(unbeltedThrowFindings(seat, occupant));
            if (dir && Math.abs(dir.x) > 0.5) {
              out = out.concat(sideImpactFindings(seat, occupant));
              if (seatIsNearSide(seat, h.pdofDeg)) out = out.concat(minorInjuryFindings(seat, occupant).filter(function (f) {
                return /hit the door|flying glass/i.test(f.name || '');
              }));
            } else {
              out = out.concat(minorInjuryFindings(seat, occupant));
            }
          });
        } finally {
          sessionImpactPdofDeg = keep.p; sessionImpactDvYMs = keep.y; sessionImpactDvXMs = keep.x; sessionImpactDvZMs = keep.z;
          sessionImpactPeakLatG = keep.g; sessionImpactPeakLonG = keep.lg; sessionVehicleDeltaVMs = keep.v;
          sessionHardHits = keep.hh; sessionImpactDeltaVMs = keep.d;
        }
        return out;
      }

      var REAR_NAME_MAP = [
        [/\(hit the lower dashboard\)/g, '(hit the front seat frame)'],
        [/\(hit the dashboard\)/g, '(hit the seat in front)'],
        [/\(hit the steering wheel\)/g, '(hit the seat in front)'],
        [/\(dashboard pushed in\)/g, '(front seat pushed back)'],
        [/\(dashboard and steering intrusion\)/g, '(front seat pushed back)'],
        [/\(footwell collapsed?\)/g, '(feet jammed under the front seat)'],
        [/\(floor pushed in\)/g, '(feet jammed under the front seat)'],
        [/\(hit the footwell\)/g, '(feet jammed under the front seat)'],
        [/\(braced against the impact\)/g, '(braced against the seat in front)'],
        [/\(braced against the dashboard\)/g, '(braced against the seat in front)'],
        [/\(struck A-pillar\)/g, '(hit the door frame)'],
        [/\(hit the windscreen\)/g, '(hit the seat in front)'],
        [/\(face hit the windscreen\)/g, '(face hit the seat in front)'],
        [/\(gripping the steering wheel\)/g, '(braced against the seat in front)'],
        [/\(hands on the wheel\)/g, '(braced against the seat in front)']
      ];
      var FRONT_PASSENGER_NAME_MAP = [
        [/\(hit the steering wheel\)/g, '(hit the dashboard)'],
        [/\(dashboard and steering intrusion\)/g, '(dashboard pushed in)'],
        [/\(braced against the impact\)/g, '(braced against the dashboard)'],
        [/\(gripping the steering wheel\)/g, '(braced against the dashboard)'],
        [/\(hands on the wheel\)/g, '(braced against the dashboard)']
      ];
      var REAR_PLAIN_MAP = [
        [/^The dashboard and steering were pushed into your chest\.$/, 'The front seat was pushed back into your chest.'],
        [/^The engine came through the footwell and crushed both legs\.$/, 'The front seat was pushed back onto your legs and crushed them.'],
        [/^The front of the car came into the footwell and crushed your legs\.$/, 'The front seat was pushed back onto your legs and crushed them.'],
        [/^Your shins hit the pedals and the underside of the dashboard\.$/, 'Your shins hit the front seat frame.'],
        [/the steering wheel/g, 'the seat in front'],
        [/the lower dashboard/g, 'the front seat frame'],
        [/the dashboard/g, 'the seat in front'],
        [/(into|hit) the windscreen/g, '$1 the seat in front']
      ];
      var FRONT_PASSENGER_PLAIN_MAP = [
        [/^The dashboard and steering were pushed into your chest\.$/, 'The dashboard was pushed into your chest.'],
        [/on the steering wheel/g, 'on the dashboard'],
        [/the steering wheel/g, 'the dashboard']
      ];
      function seatContextNames(inj, seat) {
        if (!inj || !seat || typeof inj.name !== 'string') return inj;
        var nameMap = seat.row === 'rear' ? REAR_NAME_MAP : (seat.key !== 'driver' ? FRONT_PASSENGER_NAME_MAP : null);
        var plainMap = seat.row === 'rear' ? REAR_PLAIN_MAP : (seat.key !== 'driver' ? FRONT_PASSENGER_PLAIN_MAP : null);
        var name = inj.name, plain = inj.plainDescription;
        if (nameMap) nameMap.forEach(function (r) { name = name.replace(r[0], r[1]); });
        if (seat.key === 'driver') name = name.replace(/\(braced against the impact\)/g, '(gripping the steering wheel)');
        if (plainMap && typeof plain === 'string') plainMap.forEach(function (r) { plain = plain.replace(r[0], r[1]); });
        if (/^Whiplash \(strained neck\)$/.test(name) && Number.isFinite(sessionImpactPdofDeg)) {
          var d = impactDirection(sessionImpactPdofDeg);
          if (d && d.y > 0.5) name = 'Whiplash (head whipped forward)';
          else if (d && d.y < -0.5) name = 'Whiplash (head snapped back)';
          else if (d && Math.abs(d.x) > 0.5) name = 'Whiplash (head thrown sideways)';
        }
        if (name === inj.name && plain === inj.plainDescription) return inj;
        return Object.assign({}, inj, { name: name, plainDescription: plain });
      }

      function minorInjuryFindings(seat, occupant) {
        if (!seat || !occupant) return [];
        var dvMph = (combinedVehicleDeltaVMs() || 0) / 0.44704;
        var latMph = Math.abs(sessionImpactDvYMs || 0) / 0.44704;
        var lonMph = Math.abs(sessionImpactDvXMs || 0) / 0.44704;
        var pdof = Number.isFinite(sessionImpactPdofDeg) ? sessionImpactPdofDeg : 0;
        var offRear = Math.abs(((pdof - 180) % 360 + 540) % 360 - 180);
        var fromBehind = offRear < 45;
        var near = latMph >= 8 && seatIsNearSide(seat, pdof);
        var front = seat.row === 'front', driver = seat.key === 'driver';
        var belted = occupant.belted !== false, helmet = !!occupant.helmet, harness = !!occupant.harness;
        var side = seat.side === 'right' ? 'right' : 'left';
        var f = function (region, name, clinical, plain) {
          return { eventIndex: 0, region: region, aisSeverity: 1, continuousSeverity: 1, probability: 1, minorExtra: true,
            name: name, mechanism: 'minor-' + region, lowerFidelity: true,
            clinicalDescription: clinical + ' (AIS 1).', plainDescription: plain };
        };
        var out = [];

        var js = (scenarioSeed ^ seatSeedFor({ seatKey: seat.key + ':minor' })) >>> 0;
        var jitter = 0.85 + 0.30 * (((js * 2654435761) >>> 0) / 4294967296);
        dvMph /= jitter; latMph /= jitter; lonMph /= jitter;
        var kneeMph = belted ? 22 : 12;
        if (!fromBehind && lonMph >= kneeMph && !harness) out.push(f('knee', front ? 'Bruised knees (hit the dashboard)' : 'Bruised knees (hit the seat in front)',
          'Knee contusion from contact with the ' + (front ? 'knee bolster / dashboard' : 'front seatback'),
          front ? 'Your knees hit the dashboard.' : 'Your knees hit the back of the seat in front of you.'));
        if (dvMph >= 22) out.push(f('lumbarSpine', 'Sore lower back (strained muscles)', 'Lumbar paraspinal muscle strain',
          'The muscles in your lower back were strained by the jolt.'));
        if (front && !fromBehind && lonMph >= 20 && occupant.airbag && belted) out.push(f('forearm', 'Airbag burns on the forearms',
          'Friction and chemical burns from airbag deployment', 'The airbag burst out and left burns on your forearms.'));
        if (!helmet && (dvMph >= 25 && front || near && latMph >= 15)) out.push(f('head', 'Cut on the forehead (flying glass)',
          'Superficial scalp laceration from shattered glazing', 'Broken glass flew through the car and cut your forehead.'));
        if (driver && !fromBehind && lonMph >= 25) out.push(f('hand', 'Sprained fingers (hands on the wheel)',
          'Finger sprains from bracing against the steering wheel', 'Your fingers were bent back on the steering wheel.'));
        if (seat.key === 'frontRight' && !fromBehind && lonMph >= 25) out.push(f('wrist', 'Sprained wrist (braced against the dash)',
          'Wrist sprain from bracing against the dashboard', 'You braced against the dashboard and sprained your wrist.'));
        if (belted && !fromBehind && dvMph >= 28) out.push(f('pelvis', harness ? 'Harness bruising across the hips' : 'Lap-belt bruise across the hips',
          'Pelvic soft-tissue contusion from the lap restraint', 'The belt dug into your hips as it held you.'));
        if (front && !fromBehind && lonMph >= 30) out.push(f('lowerLeg', 'Bruised shins (hit the footwell)',
          'Pretibial contusions from contact with the lower dashboard and pedals', 'Your shins hit the pedals and the underside of the dashboard.'));
        if (belted && !fromBehind && dvMph >= 35 && !harness) out.push(f('abdomen', 'Bruised belly (seatbelt)',
          'Abdominal wall contusion from the lap belt', 'The belt bruised the skin across your belly.'));
        if (near && latMph >= 12) out.push(f('upperArm', 'Bruised ' + side + ' shoulder (hit the door)',
          'Shoulder contusion from contact with the intruding door', 'Your shoulder was slammed against the door.'));
        if (near && latMph >= 20) out.push(f('pelvis', 'Bruised ' + side + ' hip (door panel)',
          'Hip contusion from the door armrest', 'The door panel hit your hip.'));
        if (fromBehind && dvMph >= 12) out.push(f('thoracicSpine', 'Sore upper back (pushed into the seat)',
          'Thoracic muscle strain from being driven into the seatback', 'You were pushed hard into your seat and your upper back is sore.'));
        if ((sessionRolloverQuarterTurns || 0) >= 1) out.push(f('forearm', 'Cuts from broken glass (rollover)',
          'Superficial lacerations from shattered side glass during the rollover', 'The side windows broke as the car rolled and the glass cut your arms.'));

        var land = (sessionFloorDvMs || 0) * landingSeatFactor(seat);
        if (land >= 4) out.push(f('lumbarSpine', 'Jarred back (hard landing)', 'Lumbar strain from axial loading on landing',
          'The landing came up through the seat and jarred your back.'));
        if (land >= 6) out.push(f('pelvis', 'Bruised tailbone (hard landing)', 'Coccygeal contusion from the seat pan on landing',
          'You came down hard on the seat and bruised your tailbone.'));
        if (land >= 6) out.push(f('neck', 'Stiff neck (head snapped down on landing)', 'Cervical strain from the head snapping down on landing',
          'Your head snapped down when the car landed.'));
        if (land >= 8 && !helmet) out.push(f('head', 'Bump on the head (landing)', 'Scalp contusion from head contact on landing',
          'Your head hit the inside of the car when it landed.'));
        if (dvMph >= 30 && !helmet) out.push(f('head', 'Bitten tongue', 'Tongue laceration from jaw clenching on impact', 'You bit your tongue when the car hit.'));
        return out;
      }

      function roofJoltFindings(seat) {
        var lvl = sessionJoltLevel;
        if (!lvl) return [];
        var out = [headStrikeFinding(lvl === 3 ? 3 : lvl, 'hit the roof')];
        if (lvl === 3) out[0] = Object.assign(out[0], { name: 'Cracked skull (head hit the roof)',
          clinicalDescription: 'Skull fracture from an unrestrained head strike against the roof (AIS 3).',
          plainDescription: 'You were thrown up into the roof hard enough to crack the skull.' });
        if (lvl >= 2) out.push({ eventIndex: 0, region: 'neck', aisSeverity: lvl - 1, continuousSeverity: lvl - 1,
          probability: 1, name: lvl === 3 ? 'Neck sprain (head hit the roof)' : 'Stiff neck (head hit the roof)',
          mechanism: 'unbelted-roof-jolt-neck',
          clinicalDescription: 'Cervical strain from axial loading of the head against the roof (AIS ' + (lvl - 1) + ').',
          plainDescription: 'Your head was driven into the roof and your neck took the jolt.', lowerFidelity: true });
        return out;
      }

      var STRUCTURAL_FINDINGS_FROM_CEILING = 35;
      var DECEL_FINDINGS_FROM_CEILING = 75;
      var BELT_BRUISE_MIN_DV_MS = 11;
      var BELT_BRUISE_FRONTAL_MIN_DV_MS = 7;
      var BELT_BRUISE_ANY_MIN_DV_MS = 9;
      var VERTICAL_FINDINGS_FROM_CEILING = 75;

      var ENGINE_BAY_M = 0.60;

      var TOE_PAN_FLEX_M = 0.05;
      var FOOTWELL_PILLAR_GAIN = 1.2;
      function footwellIntoM(seat) {
        if (!seat || seat.row !== 'front') return 0;
        var right = seat.side === 'right';
        var corner = struckEnd(right ? 'FR' : 'FL') - ENGINE_BAY_M;
        var c = sessionCrush || {};
        var measured = (c[right ? 'TPR' : 'TPL'] || 0) - TOE_PAN_FLEX_M;
        var viaPillar = corner > 0 ? corner + FOOTWELL_PILLAR_GAIN * (c[right ? 'GHR' : 'GHL'] || 0) : corner;
        return Math.max(corner, measured, viaPillar);
      }
      var CABIN_INTRUSION_M = 0.25;

      var FOOTWELL_STEPS_M = [0.08, 0.15, 0.24, 0.33];

      var BOOT_M = 0.62;

      var lastLocalHit = { ms: 0, g: 0, sideways: false };
      function noteLocalHit(trace, m) {
        if (!bufferCrush || !sessionCrush) return;
        var nowMs = Date.now();
        var pk = tracePeakG(trace);
        if (pk >= 6) {
          var dvx = Math.abs(m && m.dvxMs || 0), dvy = Math.abs(m && m.dvyMs || 0), dvz = Math.abs(m && m.dvzMs || 0);
          var tot = Math.hypot(dvx, dvy, dvz) || 1;

          var inward = Math.min(1, (dvy + dvz) / tot);
          lastLocalHit = { ms: nowMs, g: pk * Math.max(inward, (sessionRolloverQuarterTurns || 0) >= 1 ? 0.7 : 0),
            sideways: dvy >= 0.35 * tot || dvz >= 0.5 * tot || (sessionRolloverQuarterTurns || 0) >= 1 };
        }
        if (nowMs - lastLocalHit.ms > 1200) return;
        CRUSH_ZONE_KEYS.forEach(function (z) {
          if (!(bufferCrush[z] >= 0.015)) return;
          var isSide = z === 'SFL' || z === 'SFR' || z === 'SRL' || z === 'SRR';
          if (isSide && !lastLocalHit.sideways) return;
          zoneHitCrush[z] = Math.max(zoneHitCrush[z] || 0, sessionCrush[z] || 0);

          if (!(bufferCrush[z] < (zoneHitInc[z] || 0))) { zoneHitInc[z] = bufferCrush[z]; zoneHitG[z] = lastLocalHit.g; }
        });
      }

      function suddenStopBrainFindings(seat, occupant) {
        if (!seat || !occupant) return [];
        var pk = seatPeakG(seat) || 0;
        var dvMph = (seatEffectiveDeltaVMs(seat) || 0) / 0.44704;
        var score = Math.min(pk / 40, dvMph / 45);
        var steps = occupant.belted === false ? [0.85, 1.1, 1.4] : (occupant.harness && occupant.hans ? [1.2, 1.6, 2.0] : [1.0, 1.3, 1.6]);
        var ais = score >= steps[2] ? 4 : score >= steps[1] ? 3 : score >= steps[0] ? 2 : 0;
        if (!ais) return [];
        var name = ais >= 4 ? 'Bleeding on the brain (sudden stop)' : ais === 3 ? 'Bruised brain (sudden stop)' : 'Concussion (sudden stop)';
        return [{ eventIndex: 0, region: 'head', aisSeverity: ais, continuousSeverity: ais, probability: 1, name: name,
          clinicalDescription: 'Deceleration brain injury: the brain struck the inside of the skull in the violent stop (AIS ' + ais + ').',
          plainDescription: 'The car stopped so suddenly that your brain was thrown against the inside of your skull.',
          mechanism: 'sudden-stop-brain', lowerFidelity: true }];
      }

      function neckLoadFindings(seat, occupant, injuries, destroyed) {
        if (!seat || !occupant) return [];
        var head = 0;
        (injuries || []).forEach(function (i) {
          if (i && i.region === 'head' && !i.minorExtra && !/sudden-stop/.test(i.mechanism || '') && i.aisSeverity > head) head = i.aisSeverity;
        });
        var lvl = 0;
        if (head >= 6) lvl = 5; else if (head >= 5) lvl = 4; else if (head >= 4) lvl = 3;
        var dir = Number.isFinite(sessionImpactPdofDeg) ? impactDirection(sessionImpactPdofDeg) : null;
        var mph = (seatEffectiveDeltaVMs(seat) || 0) / 0.44704;
        var unb = occupant.belted === false;
        if (dir && Math.abs(dir.y) > 0.35) {
          var steps = dir.y < 0 ? (unb ? [55, 70, 85] : [65, 80, 95]) : (unb ? [40, 55, 70] : [55, 68, 80]);
          var d = mph >= steps[2] ? 5 : mph >= steps[1] ? 4 : mph >= steps[0] ? 3 : 0;
          if (d > lvl) lvl = d;
        }
        if (destroyed && lvl < 4) lvl = 4;
        if (occupant.hans && lvl > 0) lvl -= 1;
        if (lvl < 3) return [];
        var cord = lvl >= 5;
        return [{ eventIndex: 0, region: 'neck', aisSeverity: lvl, continuousSeverity: lvl, probability: 1,
          name: cord ? 'Broken neck, spinal cord damaged' : 'Broken neck',
          clinicalDescription: (cord ? 'Cervical fracture with cord injury' : 'Cervical fracture') + ' from the load of the head on the neck in the impact (AIS ' + lvl + ').',
          plainDescription: cord ? 'Your neck was broken and the spinal cord inside it was damaged.' : 'The force on your head was enough to break a bone in your neck.',
          mechanism: 'neck-load', lowerFidelity: true }];
      }

      function localContactFindings(seat, occupant) {
        if (!seat || !occupant || !sessionCrush) return [];
        var out = [];
        var right = seat.side === 'right', rear = seat.row === 'rear';
        var sideWord = right ? 'right' : 'left';
        var unb = occupant.belted === false, helmet = !!occupant.helmet;
        var doorZ = rear ? (right ? 'SRR' : 'SRL') : (right ? 'SFR' : 'SFL');
        var roofZ = rear && sessionCrush.hasRearRoof ? (right ? 'ROOFRR' : 'ROOFRL') : (right ? 'ROOFR' : 'ROOFL');
        var door = zoneHitCrush[doorZ] || 0, doorG = zoneHitG[doorZ] || 0;
        var cagedL = vehicleHasRollCage() || sessionRollCagePresent;
        if (cagedL) door *= 0.6;
        if (unb) door += 0.02;

        var mainDir = Number.isFinite(sessionImpactPdofDeg) ? impactDirection(sessionImpactPdofDeg) : null;
        if (mainDir && Math.abs(mainDir.x) > 0.5 && seatIsNearSide(seat, sessionImpactPdofDeg)) door = 0;
        var hard = doorG >= 20 ? 1 : 0;
        if (door >= 0.03) {
          var arm = Math.min(3, (door >= 0.18 ? 3 : door >= 0.10 ? 2 : 1) + hard);
          if (arm === 1) out.push(Object.assign(structuralFinding('upperArm', 1, 'Bruised ' + sideWord + ' shoulder (hit the door)',
            'Shoulder contusion from contact with the intruding door', 'Your shoulder was slammed against the door.'), { minorExtra: true, mechanism: 'minor-upperArm' }));
          else out.push(structuralFinding('upperArm', arm, (arm >= 3 ? 'Badly broken ' : 'Broken ') + sideWord + ' upper arm (door pushed into it)',
            'Humeral fracture from the intruding door loading the near-side arm (AIS ' + arm + ').',
            'The door was pushed into your ' + sideWord + ' arm and broke it.'));
        }
        if (door >= 0.05) {
          if (door >= 0.18) out.push(structuralFinding('pelvis', 3, 'Broken pelvis (door pushed in)', 'Pelvic fracture (door intrusion) (' + sideWord + ' side)',
            'The door was pushed into you and broke your pelvis.'));
          else out.push(Object.assign(structuralFinding('pelvis', 1, 'Bruised ' + sideWord + ' hip (door panel)', 'Hip contusion from the door armrest',
            'The door panel hit your hip.'), { minorExtra: true, mechanism: 'minor-pelvis' }));
        }
        if (door >= 0.09) {
          var rib = Math.min(4, (door >= 0.25 ? 4 : door >= 0.16 ? 3 : 2) + hard);
          out.push(structuralFinding('chest', rib, (rib >= 4 ? 'Many broken ribs, bruised lung' : rib === 3 ? 'Broken ribs' : 'Broken rib') + ' (' + sideWord + ' side)',
            (rib >= 3 ? 'Multiple rib fractures' : 'Single rib fracture') + ' (' + sideWord + ' side)', rib >= 3 ? 'You broke several ribs.' : 'You broke a rib.'));
        }
        var roof = zoneHitCrush[roofZ] || 0, roofG = zoneHitG[roofZ] || 0;
        if (cagedL) roof *= 0.5;
        if (unb) roof += 0.03;
        var head = roof >= 0.20 ? 3 : roof >= 0.13 ? 2 : roof >= 0.06 ? 1 : 0;
        if (head && roofG >= 25) head = Math.min(3, head + 1);
        if (head && helmet) head -= 1;
        if (head === 1) out.push(Object.assign(structuralFinding('head', 1, 'Cut and bruised head (hit the roof)',
          'Scalp laceration and contusion', 'Your head hit the roof. Cuts and a bruise, no damage inside.'), { minorExtra: true, mechanism: 'minor-head' }));
        else if (head === 2) out.push(structuralFinding('head', 2, 'Concussion (head hit the roof)', 'Concussion',
          'Your head hit the roof hard enough to knock you dizzy or out for a moment.'));
        else if (head >= 3) out.push(structuralFinding('head', 3, 'Cracked skull (head hit the roof)',
          'Skull fracture from an unrestrained head strike against the roof (AIS 3).', 'You were thrown up into the roof hard enough to crack the skull.'));
        if (head >= 2) out.push(structuralFinding('neck', head - 1, head >= 3 ? 'Neck sprain (head hit the roof)' : 'Stiff neck (head hit the roof)',
          'Cervical strain from axial loading of the head against the roof (AIS ' + (head - 1) + ').',
          'Your head was driven into the roof and your neck took the jolt.'));
        return out;
      }

      function structuralFinding(region, ais, name, clinical, plain) {
        return { eventIndex: 0, region: region, aisSeverity: ais, continuousSeverity: ais,
          probability: 1, name: name, clinicalDescription: clinical, plainDescription: plain,
          mechanism: 'structural-' + region, lowerFidelity: true };
      }

      var FLOOR_FINDING_STEPS_MS = [9.5, 13, 18];
      var FLOOR_MINOR_TOP_MS = 11.5;
      function verticalFindingsFor(roofward, occupant, out, seat) {
        var vCeil = verticalDirectionCeilingPercent(roofward, occupant, seat);
        var vs;
        if (roofward) {
          if (!(vCeil <= VERTICAL_FINDINGS_FROM_CEILING)) return;

          vs = vCeil <= 0 ? 2 : (vCeil <= STRUCTURAL_FINDINGS_FROM_CEILING ? 1 : 0);
        } else {
          var fv = sessionFloorDvMs * landingSeatFactor(seat) + (occupant && occupant.belted === false ? 3 : 0);
          if (!(fv >= FLOOR_FINDING_STEPS_MS[0])) return;
          vs = vCeil <= 0 ? 2 : (fv >= FLOOR_FINDING_STEPS_MS[2] ? 1 : 0);
          if (vs === 0 && fv >= FLOOR_FINDING_STEPS_MS[1]) vCeil = Math.min(vCeil, 50);
          else if (vs === 0) vCeil = Math.max(vCeil, 51);
        }
        var spineAis = [3, 4, 5][vs], pelvisAis = [3, 4, 4][vs], legAis = [2, 3, 3][vs];

        if (!roofward && vs === 0 && fv < FLOOR_MINOR_TOP_MS) {
          out.push(structuralFinding('lumbarSpine', 2, 'Cracked vertebra (hard landing)',
            'Minor wedge compression fracture of a lumbar vertebra from a hard landing through the seat (AIS 2).',
            'The landing jolted up through the seat and cracked one of the bones in your lower back.'));
          return;
        }
        if (roofward) {
          var headAis = [3, 4, 5][vs], neckAis = [3, 4, 5][vs];
          out.push(structuralFinding('head', headAis, 'Head injury (car landed on its roof)',
            'Head injury from axial impact against the roof as the vehicle landed inverted (AIS ' + headAis + ').',
            'The car landed on its roof and your head was driven into it.'));
          out.push(structuralFinding('neck', neckAis, 'Cervical compression fracture (car landed on its roof)',
            'Axial-loading fracture of the cervical spine from an inverted landing (AIS ' + neckAis + ').',
            'The weight of your body came down onto your head and broke your neck.'));
        } else {
          out.push(structuralFinding('lumbarSpine', spineAis, spineAis >= 4 ? 'Burst fracture of the spine (vertical impact)' : 'Spinal compression fracture (vertical impact)',
            'Thoracolumbar fracture from axial loading through the seat on a heavy landing (AIS ' + spineAis + ').',
            spineAis >= 4 ? 'The car hit the ground so hard your spine was crushed.' : 'The landing came up through the seat and cracked a bone in your spine.'));
          if (vCeil <= 50) out.push(structuralFinding('pelvis', pelvisAis, 'Pelvic fracture (vertical impact)',
            'Vertical-shear pelvic fracture from the impact coming up through the seat (AIS ' + pelvisAis + ').',
            'The impact came up through the seat and broke your pelvis.'));

          out.push(structuralFinding('head', vs >= 1 ? 3 : 2, vs >= 1 ? 'Bruised brain (violent landing)' : 'Concussion (hard landing)',
            'Brain injury from the head being thrown down on a heavy vertical landing (AIS ' + (vs >= 1 ? 3 : 2) + ').',
            vs >= 1 ? 'Your head was thrown down so hard when the car landed that your brain was bruised.' : 'Your head was thrown down when the car landed and you were concussed.'));
          out.push(structuralFinding('lowerLeg', legAis, 'Shin and heel fractures (vertical impact)',
            'Tibial and calcaneal fractures from the floor pan loading the legs on landing (AIS ' + legAis + ').',
            'The floor came up into your feet and broke the bones in your legs.'));
        }

        if (vs === 2) {
          if (roofward) {
            out.push(structuralFinding('thoracicSpine', 4, 'Spinal fracture (car landed on its roof)',
              'Thoracic vertebral fractures from the body being driven down onto the head and neck.',
              'The force went down through your neck into your back and broke it.'));
          } else {
            out.push(structuralFinding('head', 4, 'Head injury (violent landing)',
              'Brain injury from the head being thrown down and striking the interior on a fatal vertical impact (AIS 4).',
              'The landing threw your head against the inside of the car.'));
          }
          out.push(structuralFinding('chest', 4, 'Chest injuries (violent landing)',
            'Rib fractures with lung and heart contusion from the fatal vertical deceleration (AIS 4).',
            'The force of the landing crushed your chest.'));
          out.push(structuralFinding('aorta', 5, 'Aortic transection',
            'Traumatic transection of the thoracic aorta from extreme vertical deceleration (AIS 5).',
            'The main artery from your heart tore from the force of the landing.'));
        }
      }

      function worstDeltaVMsForIntrusion() {
        return Number.isFinite(sessionVehicleDeltaVMs) ? sessionVehicleDeltaVMs : 0;
      }

      function structuralFindings(seat, occupant) {
        if (!seat) return [];
        var ceiling = seatCeilingPercent(seat, occupant);
        var cz = sessionCrush;
        var intruded = !!cz && worstDeltaVMsForIntrusion() >= CRUSH_FOOTWELL_MIN_DELTAV_MS && (
          (seat.row === 'front' && footwellIntoM(seat) > FOOTWELL_STEPS_M[0]) ||
          (seat.row === 'rear' && struckEnd(seat.side === 'right' ? 'RR' : 'RL') - BOOT_M > 0.10) ||
          ((seat.row === 'front' ? (seat.side === 'right' ? cz.SFR : cz.SFL) : (seat.side === 'right' ? cz.SRR : cz.SRL)) > 0.20) ||
          frontSeatAheadCrushed(seat));
        if (!intruded && ceiling > DECEL_FINDINGS_FROM_CEILING && verticalCeilingPercent(occupant, seat) > VERTICAL_FINDINGS_FROM_CEILING &&
            !(sessionFloorDvMs * landingSeatFactor(seat) >= FLOOR_FINDING_STEPS_MS[0] - 2)) return [];
        var sideWord = seat.side === 'right' ? 'right' : 'left';
        var out = [];

        var hTier = structuralCeilingTier(seat, restraintTierOf(occupant));
        var hCeil = Math.min(structuralSurvivalCeilingPercent(seatEffectiveDeltaVMs(seat), hTier), sideCeilingPercent(seat, occupant));
        ceiling = hCeil;
        var fatal = ceiling <= 0;

        if (hCeil <= DECEL_FINDINGS_FROM_CEILING) {
          var chestAis = fatal ? 5 : hCeil <= 45 ? 4 : hCeil <= 70 ? 3 : 2;
          out.push(structuralFinding('chest', chestAis,
            chestAis === 5 ? 'Massive chest injuries (high-energy deceleration)'
              : chestAis === 4 ? 'Severe chest injuries (high-energy deceleration)'
              : chestAis === 3 ? 'Broken ribs (violent stop)' : 'Cracked ribs (hard stop)',
            (chestAis >= 4 ? 'Multiple bilateral rib fractures with lung and heart contusion' : chestAis === 3 ? 'Rib fractures' : 'One or two rib fractures') +
              ' from the extreme deceleration of the occupant compartment (AIS ' + chestAis + ').',
            chestAis === 5 ? 'The force of the crash crushed your chest. Your lungs and heart are badly damaged.'
              : chestAis === 4 ? 'The force of the crash badly injured your chest.'
              : chestAis === 3 ? 'The stop was so violent that your ribs broke against the restraint.'
              : 'The stop was hard enough to crack a rib against the restraint.'));

          if (hCeil <= 65) {
            out.push(structuralFinding('lung', hCeil <= 58 ? 3 : 2, hCeil <= 58 ? 'Badly bruised lung (violent stop)' : 'Bruised lung (violent stop)',
              'Pulmonary contusion from the deceleration of the thorax (AIS ' + (hCeil <= 58 ? 3 : 2) + ').',
              'Your lungs were thrown against your ribs. Breathing hurts and there is some bleeding inside.'));
          }

          if (hCeil <= 55) {
            out.push(structuralFinding('wrist', hCeil <= 30 ? 3 : 2, hCeil <= 30 ? 'Shattered wrist (braced against the impact)' : 'Broken wrist (braced against the impact)',
              'Distal radius fracture from bracing against the steering wheel or dashboard at impact (AIS ' + (hCeil <= 30 ? 3 : 2) + ').',
              'You braced against the impact and your wrist broke.'));
          }
          if (hCeil <= 35) {
            out.push(structuralFinding('upperArm', 3, 'Broken upper arm (arm flung into the cabin)',
              'Humeral shaft fracture from the arm striking the interior in a violent stop (AIS 3).',
              'Your arm was thrown into the inside of the car and the bone broke.'));
            out.push(structuralFinding('lowerLeg', 2, 'Broken shin (hit the lower dashboard)',
              'Tibial fracture from contact with the lower instrument panel (AIS 2).',
              'Your shin hit the lower dashboard and broke.'));
          }
          if (hCeil <= 68) {
            var abdAis = hCeil <= 60 ? 3 : 2;
            out.push(structuralFinding('abdomen', abdAis, abdAis >= 3 ? 'Torn spleen (violent stop)' : 'Bruised liver and spleen (violent stop)',
              abdAis >= 3 ? 'Splenic laceration from the deceleration of the abdominal organs (AIS 3).' : 'Hepatic and splenic contusion from the deceleration of the abdominal organs (AIS 2).',
              abdAis >= 3 ? 'Your spleen tore when the car stopped. You are bleeding inside.' : 'The organs in your belly were thrown forward and bruised. They are bleeding slowly inside.'));
          }
          if (hCeil <= 70 && hCeil > 58) {
            out.push(structuralFinding('head', 2, 'Concussion (violent stop)',
              'Cerebral concussion from the head\'s violent deceleration (AIS 2).',
              'Your head was thrown so hard that your brain was shaken.'));
          }
          if (hCeil <= 58) {
            var headAis2 = fatal ? 5 : hCeil <= 25 ? 4 : 3;
            out.push(structuralFinding('head', headAis2,
              headAis2 === 5 ? 'Severe traumatic brain injury (high-energy impact)'
                : headAis2 === 4 ? 'Traumatic brain injury (high-energy impact)' : 'Bruised brain (violent stop)',
              'Brain injury from the brain striking the inside of the skull at extreme deceleration (AIS ' + headAis2 + ').',
              'Your brain was thrown against your skull by the force of the crash.'));
          }

          if (fatal) {
            var lim0 = STRUCTURAL_LIMIT_MPH[hTier] || STRUCTURAL_LIMIT_MPH.beltedAirbag;
            var excessMph = seatEffectiveDeltaVMs(seat) / 0.44704 - lim0.gone;
            var latExcess = plausibleLateralMs() / 0.44704 - (seatIsNearSide(seat, sessionImpactPdofDeg || 0) ? SIDE_LIMIT_MPH.near.gone : SIDE_LIMIT_MPH.far.gone);
            excessMph = Math.max(excessMph, latExcess);
            if (excessMph >= 12) out.push(structuralFinding('chest', 6, 'Crushed chest (extreme impact)',
              'Unsurvivable thoracic crush from deceleration far beyond human tolerance (AIS 6).',
              'The impact was so violent that your chest was crushed.'));
            if (excessMph >= 25) out.push(structuralFinding('head', 6, 'Fatal head injury (extreme impact)',
              'Unsurvivable craniocerebral injury from deceleration far beyond human tolerance (AIS 6).',
              'The impact was so violent that nobody survives the injury to the head.'));
            if (excessMph >= 30) {
              out.push(structuralFinding('femur', 6, 'Both legs crushed (extreme impact)',
                'Bilateral lower-limb destruction from an impact far beyond human tolerance (AIS 6).',
                'Your legs were crushed in the impact.'));
              out.push(structuralFinding('upperArm', 6, 'Both arms crushed (extreme impact)',
                'Bilateral upper-limb destruction from an impact far beyond human tolerance (AIS 6).',
                'Your arms were crushed in the impact.'));
            }
          }
          if (fatal) {
            out.push(structuralFinding('aorta', 5, 'Aortic transection',
              'Traumatic transection of the thoracic aorta at the isthmus from extreme deceleration (AIS 5).',
              'The main artery from your heart tore from the force of the stop. This is fatal without immediate surgery.'));
          }
        }

        verticalFindingsFor(false, occupant, out, seat);
        verticalFindingsFor(true, occupant, out, seat);
        if (frontSeatAheadCrushed(seat)) {
          var unb = occupant && occupant.belted === false;
          out.push(structuralFinding('femur', 3, 'Broken ' + sideWord + ' thigh (front seat pushed back)',
            'Femoral shaft fracture from the front seat being driven rearward into the knees (AIS 3).',
            'The seat in front of you was pushed back into your knees and broke your thigh.'));
          out.push(structuralFinding('knee', 2, 'Injured knees (front seat pushed back)',
            'Knee injuries from contact with the displaced front seat (AIS 2).',
            'Your knees were hit hard by the seat in front.'));
          out.push(structuralFinding('head', unb ? 4 : 3, unb ? 'Head injury (hit the front seat)' : 'Bruised brain (hit the front seat)',
            'Head contact with the rearward-displaced front seatback (AIS ' + (unb ? 4 : 3) + ').',
            'Your head hit the seat in front as it came back at you.'));
        }

        var c = intruded ? sessionCrush : null;
        if (c) {
          var right = seat.side === 'right';
          if (seat.row === 'front') {
            var into = footwellIntoM(seat);

            var cm = Math.round(into * 100);
            if (into > FOOTWELL_STEPS_M[0]) {
              if (into <= FOOTWELL_STEPS_M[1]) {
                out.push(structuralFinding('foot', 2, 'Broken foot (footwell pushed in)',
                  'Foot fracture from the toe pan displacing into the footwell (' + cm + ' cm intrusion, AIS 2).',
                  'The front of the car pushed the floor into your feet and broke a bone in your foot.'));
              } else if (into <= FOOTWELL_STEPS_M[2]) {
                out.push(structuralFinding('lowerLeg', 3, 'Broken shin (footwell pushed in)',
                  'Tibial fracture from footwell intrusion loading the lower leg (' + cm + ' cm intrusion, AIS 3).',
                  'The footwell was pushed back into your legs and broke your shin.'));
              } else if (into <= FOOTWELL_STEPS_M[3]) {
                out.push(structuralFinding('lowerLeg', 3, 'Broken legs (footwell pushed in)',
                  'Bilateral lower-limb fractures from footwell intrusion (' + cm + ' cm intrusion, AIS 3).',
                  'The footwell was pushed back into you and broke both legs.'));
                out.push(structuralFinding('pelvis', 3, 'Cracked pelvis (knees pushed back)',
                  'Stable pelvic fracture from knee and footwell loading as the structure intruded (AIS 3).',
                  'Your knees were driven back and cracked your pelvis.'));
              } else {
                out.push(structuralFinding('lowerLeg', into > 0.55 ? 5 : 4, 'Crushed legs (footwell collapse)',
                  'Crush injury of both lower limbs from the footwell and dashboard collapsing into the occupant space (' + cm + ' cm intrusion).',
                  'The front of the car came into the footwell and crushed your legs.'));
                out.push(structuralFinding('pelvis', 4, 'Pelvic fracture (footwell collapse)',
                  'Pelvic ring fracture from knee and footwell loading as the structure intruded.',
                  'Your pelvis broke as the front of the car was pushed into you.'));
              }
            }
            if (into > CABIN_INTRUSION_M) {
              var dashAis = into > 0.55 ? 5 : into > 0.40 ? 4 : 3;
              var pillarAis = into > 0.55 ? 5 : into > 0.40 ? 4 : into > 0.32 ? 3 : 2;
              out.push(structuralFinding('chest', dashAis, (dashAis >= 4 ? 'Crushed chest' : 'Broken ribs') + ' (dashboard and steering intrusion) (' + sideWord + ' side)',
                'Rib fractures' + (dashAis >= 4 ? ' with lung contusion' : '') + ' from the instrument panel' + (seat.key === 'driver' ? ' and steering column' : '') + ' displacing into the occupant (' + cm + ' cm intrusion, AIS ' + dashAis + ').',
                dashAis >= 4 ? 'The dashboard was pushed back into your chest.' : 'The dashboard came back into you and broke ribs.'));
              out.push(structuralFinding('head', pillarAis, (pillarAis >= 4 ? 'Head injury' : pillarAis === 3 ? 'Bruised brain' : 'Concussion') + ' (struck A-pillar) (' + sideWord + ' side)',
                'Head strike against the rearward-displaced A-pillar and door frame (AIS ' + pillarAis + ').',
                'The front corner of the car was pushed in and your head hit the pillar.'));
            }
          }
          if (seat.row === 'rear') {
            var intoR = struckEnd(right ? 'RR' : 'RL') - BOOT_M;
            if (intoR > 0.10) {
              var deepR = intoR > 0.30;
              out.push(structuralFinding('pelvis', deepR ? 4 : 3, 'Pelvic fracture (boot pushed into the rear seat)',
                'Pelvic fracture from the rear structure displacing the seat cushion and occupant forward (' + Math.round(intoR * 100) + ' cm intrusion).',
                'The back of the car was pushed into your seat and broke your pelvis.'));
              out.push(structuralFinding('lumbarSpine', 3, 'Spinal fracture (boot pushed into the rear seat)',
                'Vertebral fracture from the seatback being driven forward into the occupant.',
                'Your seat was pushed into your back and broke a bone in your spine.'));
              if (deepR) out.push(structuralFinding('chest', 4, 'Chest crushed against the front seat',
                'Multiple rib fractures from being compressed between the intruding rear structure and the front seatback (AIS 4).',
                'You were crushed against the seat in front of you.'));
            }
          }
          var door = seat.row === 'front' ? (right ? c.SFR : c.SFL) : (right ? c.SRR : c.SRL);
          if (door > 0.20) {
            out.push(structuralFinding('pelvis', 4, 'Pelvic fracture (door intrusion) (' + sideWord + ' side)',
              'Lateral compression pelvic fracture from the door being pushed into the seat.',
              'The door was pushed into you and broke your pelvis.'));
          }
        }
        return out;
      }

      function driverClock(events, elapsedS) {
        return { injuries: sessionInjuries, exposureInjuries: patientExposureInjuries,
          events: events, eventMeta: sessionEventMeta, patient: patientState,
          totalElapsedS: patientTotalElapsedS, elapsedS: elapsedS,
          externalBleedingControlled: medKitActive };
      }

      function acceptDriverOutcome(outcome) {
        sessionInjuries = outcome.injuries;
        patientExposureInjuries = outcome.exposureInjuries;
        sessionEvents = outcome.events;
        sessionEventMeta = outcome.eventMeta;
        patientState = outcome.patient;
        patientTotalElapsedS = outcome.totalElapsedS;
        scope.patientBloodLostMl = patientState.bloodLostM3 * 1000000;
        scope.patientBleedMlMin = outcome.bleedMlMin;
        scope.patientSeed = scenarioSeed;
      }

      function makePatientReport(occupant, events, elapsedS) {
        var outcome = computeOccupantOutcome(null, seatDef('driver'), occupant, {}, driverClock(events, elapsedS));
        acceptDriverOutcome(outcome);
        return outcome.report;
      }
      var sessionEvents = [];

      var sessionEventMeta = [];

      var statsSessionInjurySnapshot = {};
      var statsSessionDeathCounted = false;

      function resetSessionState() {
        sessionInjuries = [];
        scenarioSeed = (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
        patientState = { bloodLostM3: 0, lowestSurvivalPercent: 100, dead: false };
        patientClockS = null;
        patientTotalElapsedS = 0;
        patientFireDoseS = 0;
        patientExposureInjuries = [];
        scope.patientBloodLostMl = scope.patientBleedMlMin = 0;
        sessionEvents = [];
        sessionEventMeta = [];
        sessionVehicleDeltaVMs = 0;
        sessionHardHits = [];
        sessionAllHits = [];
        destroyedLogged = {};
        statsSessionInjurySnapshot = {};
        statsSessionDeathCounted = false;

        sessionFireSeconds = 0;
        sessionFireIntensity = 0;
        sessionSubmergedSeconds = 0;
        sessionWasSubmerged = false;
        sessionRolloverQuarterTurns = 0;
        sessionRolloverPeakRateDegS = 0;
        sessionRollPeakG = 0;
        sessionCrashPeakG = 0;
        sessionRollCagePresent = false;
        sessionRolloverRoofContact = false;
        sessionRolloverSideContact = 0;
        sessionRolloverWorstUpZ = 1;
        sessionImpactPdofDeg = null;
        sessionImpactDeltaVMs = 0;
        sessionImpactPeakLatG = 0;
        sessionImpactPeakLonG = 0;
        sessionImpactDvXMs = 0;
        sessionImpactDvYMs = 0;
        sessionSideHit = null;
        sessionImpactDvZMs = 0;
        sessionFreeFlightSamples = 0;
        fallCreditSpendPending = false;
        sessionCrush = null;
        zoneHitCrush = {}; zoneHitG = {}; zoneHitInc = {}; lastLocalHit = { ms: 0, g: 0, sideways: false };
        struckEndCrush = null;
        lastStruckEnd = null;
        sessionRoofwardDvMs = 0;
        lastScoredRollQt = 0;
        sessionVerticalImpactDvMs = 0;
        sessionVerticalRoofward = false;
        sessionFloorDvMs = 0;
        fallTrack = { lastDv: null, buffers: 0, speed: 0, pending: 0, pendingLeft: 0, atMs: 0 };
        sessionRoofDvMs = 0;
        sessionLandingVec = null;
        sessionJoltLevel = 0;
        bufferCrush = null;
        lastCrushSeen = null;
        crushFlapRaw = {};
        activeImpact = null;
        lastCreditedFlightEndT = null;

        resetPassengerState();
      }

      function updateDebugSummary(report, eventMetaList) {
        try {
          if (window.bngApi && typeof window.bngApi.engineLua === 'function' && report) {
            var worst = {};
            (sessionInjuries || []).forEach(function (inj) {
              if (!worst[inj.region] || inj.aisSeverity > worst[inj.region]) worst[inj.region] = inj.aisSeverity;
            });
            var parts = Object.keys(worst).sort().map(function (r) { return r + '=' + worst[r]; });
            var rl = 'REPORT: ISS=' + (report.iss ? report.iss.iss : '?') +
              ' NISS=' + (report.iss ? report.iss.niss : '?') +
              ' surv=' + (report.survival ? report.survival.survivalProbabilityPercent : '?') + '%' +
              ' sessionInjuries=' + (sessionInjuries || []).length +
              ' | worst AIS per region: ' + (parts.length ? parts.join(' ') : '(none)');
            window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' + JSON.stringify(rl) + ')');
          }
        } catch (e) {}
        scope.debugEvents = eventMetaList.map(function (m, i) {
          return { index: i, impactSide: m.impactSide, deltaVMs: m.deltaVMs, durationMs: m.durationMs,
            verticalDeltaVMs: m.verticalDeltaVMs, hicIndex: m.hicIndex, chest3msG: m.chest3msG, femurForceIndexN: m.femurForceIndexN };
        });

        var aisByRegion = {};
        (report.events || []).forEach(function (er) {
          (er.injuries || []).forEach(function (ri) {
            var flat = toFlatInjury(ri);
            if (!(flat.region in aisByRegion) || flat.aisSeverity > aisByRegion[flat.region]) {
              aisByRegion[flat.region] = flat.aisSeverity;
            }
          });
        });
        scope.debugAisByRegion = Object.keys(aisByRegion).sort().map(function (region) {
          return { region: region, ais: aisByRegion[region] };
        });

        scope.debugIss = report.iss ? report.iss.iss : null;
        scope.debugIssMajorTrauma = !!(report.iss && report.iss.isMajorTrauma);
        scope.debugSurvivalOutlook = report.survival ? report.survival.outlook : null;
      }

      function ingestCapture(trace, occupant, intrusion, rollover) {
        var isNewSession = sessionEvents.length === 0;
        var outcome = computeOccupantOutcome(trace, seatDef('driver'), occupant,
          { intrusion: intrusion, rollover: rollover }, driverClock(sessionEvents, 0));
        acceptDriverOutcome(outcome);
        var result = null;
        if (outcome.hasCapture) {
          updateDebugSummary(outcome.report, sessionEventMeta);
          result = { report: outcome.report, newEventCount: outcome.newEventCount, isNewSession: isNewSession };
        }
        return result;
      }

      function defaultCrashInjuryProStats() {
        return {
          totalCrashes: 0,
          totalInjuries: 0,
          deaths: 0,
          worstIss: 0,
          byRegion: {},
          bySeverity: {},

          medKitsUsed: 0,
          worstInjury: null,

          last: { survivalPercent: 100, outlook: 'likelySurvivable', costUsd: 0, recoveryWeeks: 0 }
        };
      }

      window.__crashInjuryProStats = window.__crashInjuryProStats || defaultCrashInjuryProStats();

      function broadcastCrashInjuryProStats() {
        try {
          window.dispatchEvent(new CustomEvent('crashInjuryProStatsUpdate', { detail: window.__crashInjuryProStats }));
        } catch (e) {
          console.error('[CrashInjuryPro] broadcastCrashInjuryProStats: CustomEvent dispatch failed:', e);
        }
      }

      function recordCrashStats(report, isNewSession) {
        var stats = window.__crashInjuryProStats;
        if (isNewSession) stats.totalCrashes += 1;

        (report.events || []).forEach(function (er) {
          (er.injuries || []).forEach(function (ri) {
            var flat = toFlatInjury(ri);
            var key = flat.region + '|' + flat.name;
            var prevSeverity = statsSessionInjurySnapshot[key];
            if (prevSeverity !== undefined && flat.aisSeverity <= prevSeverity) return;

            if (prevSeverity === undefined) {
              stats.totalInjuries += 1;
              stats.byRegion[flat.region] = (stats.byRegion[flat.region] || 0) + 1;
            } else {
              stats.bySeverity[prevSeverity] = Math.max(0, (stats.bySeverity[prevSeverity] || 0) - 1);
            }
            stats.bySeverity[flat.aisSeverity] = (stats.bySeverity[flat.aisSeverity] || 0) + 1;
            statsSessionInjurySnapshot[key] = flat.aisSeverity;

            if (!stats.worstInjury || flat.aisSeverity > stats.worstInjury.aisSeverity) {
              stats.worstInjury = { name: plainInjuryTitle(flat) || flat.name, region: flat.region, aisSeverity: flat.aisSeverity };
            }
          });
        });

        if (report.iss && typeof report.iss.iss === 'number' && report.iss.iss > stats.worstIss) {
          stats.worstIss = report.iss.iss;
        }

        if (report.survival && report.survival.outlook === 'notSurvivable' && !statsSessionDeathCounted) {
          stats.deaths += 1;
          statsSessionDeathCounted = true;
        }

        if (report.survival) {
          var displaySurvival = deathAdjustedSurvival(medKitAdjustedSurvival(report.survival));
          stats.last.survivalPercent = displaySurvival.survivalProbabilityPercent;
          stats.last.outlook = displaySurvival.outlook;
        }
        var statDead = !!(report.survival && deathAdjustedSurvival(medKitAdjustedSurvival(report.survival)).outlook === 'notSurvivable');
        var statCare = careEstimate(flattenReportInjuries(report), statDead, report.iss ? report.iss.iss : null);
        stats.last.costUsd = statCare.costUsd;
        stats.last.recoveryWeeks = statCare.weeks;
        stats.last.recoveryHours = statCare.hours;
        stats.last.hospitalDays = statCare.hospitalDays;
        stats.last.permanent = statCare.permanent;
        stats.last.dead = statCare.dead;

        broadcastCrashInjuryProStats();
      }

      var SYNTHETIC_REPLAY_PEAK_G = 38;
      var SYNTHETIC_REPLAY_DURATION_MS = 110;

      var SYNTHETIC_REPLAY_TAIL_MS = 300;
      var SYNTHETIC_REPLAY_SAMPLE_RATE_HZ = 2000;

      function buildSyntheticFrontalTrace() {
        var sampleRateHz = SYNTHETIC_REPLAY_SAMPLE_RATE_HZ;
        var pulseS = SYNTHETIC_REPLAY_DURATION_MS / 1000;
        var totalS = pulseS + SYNTHETIC_REPLAY_TAIL_MS / 1000;
        var n = Math.round(totalS * sampleRateHz);
        var pulseSamples = Math.round(pulseS * sampleRateHz);
        var t = new Float64Array(n);
        var ax = new Float64Array(n);
        var ay = new Float64Array(n);
        var az = new Float64Array(n);

        for (var i = 0; i < n; i++) {
          t[i] = i / sampleRateHz;
          if (i < pulseSamples) {
            var phase = (i / pulseSamples) * 2 * Math.PI;
            ax[i] = -SYNTHETIC_REPLAY_PEAK_G * 0.5 * (1 - Math.cos(phase));
          }
        }

        return { sampleRateHz: sampleRateHz, t: t, ax: ax, ay: ay, az: az };
      }

      scope.hudState = 'idle';

      scope.notifications = [];
      scope.reportInjuries = [];

      scope.occupantStateText = '';
      scope.iss = null;
      scope.survival = null;
      scope.survivalBandHasContent = false;
      scope.cost = null;
      scope.recovery = null;

      scope.systemicEffects = null;
      scope.systemicEffectsView = [];
      scope.expanded = false;

      scope.fullscreen = false;

      scope.viewingReportPostMortem = false;

      scope.toggleFullscreen = function () {
        if (!scope.fullscreen && scope.realisticMode && scope.deathFadeActive) {
          if (scope.deathScreenDismissed) scope.openDeathReport();
          return;
        }
        if (scope.hudState !== 'report') return;
        if (!scope.fullscreen && scope.realisticMode && isCurrentlyUnconscious()) return;
        scope.fullscreen = !scope.fullscreen;
        applyFullscreenDom(scope.fullscreen);

        trackTimeout($timeout(paintReportFigures, 0));
      };

      scope.openDeathReport = function () {
        if (!scope.deathFadeActive) return;
        if (scope.hudState !== 'report') {
          if (!lastFullReport) return;
          pendingTimeouts.forEach(function (p) { $timeout.cancel(p); });
          pendingTimeouts = [];
          pendingSettleTimeout = null;

          flattenReportInjuries(lastFullReport).forEach(landInjury);
          enterReportState(lastFullReport);
        }
        scope.viewingReportPostMortem = true;

        scope.deathScreenDismissed = true;
        if (!scope.fullscreen) {
          scope.fullscreen = true;
          applyFullscreenDom(true);
        }
      };

      scope.dismissDeathScreen = function () {
        if (!scope.deathFadeActive) return;
        scope.deathScreenDismissed = true;
      };

      scope.debugLatencyMs = null;

      scope.debugFirstInjuryLatencyMs = null;

      scope.debugProvisionalBlackoutLatencyMs = null;

      scope.debugLuaCaptureMs = null;
      scope.debugHop1RelayMs = null;
      scope.debugPipelineComputeMs = null;
      scope.debugFirstInjuryScheduleMs = null;
      scope.debugEvents = [];
      scope.debugAisByRegion = [];
      scope.debugIss = null;
      scope.debugIssMajorTrauma = false;
      scope.debugSurvivalOutlook = null;

      scope.debugValidationPassed = null;
      scope.debugValidationReason = null;
      scope.debugRawPeakG = null;
      scope.debugSampleCount = null;

      scope.debugPanelVisible = false;

      var pendingTimeouts = [];

      var notifIdCounter = 0;
      var pendingSettleTimeout = null;

      var lastFullReport = null;

      var landedInjuries = {};

      var pendingImpactStartMs = null;

      var pendingProvisionalKnockoutMs = null;

      function trackTimeout(promise) {
        pendingTimeouts.push(promise);
        return promise;
      }

      function figureContainer() {
        var root = appRootEl || element[0];
        return root ? root.querySelector('.cip-figure-body-target') : null;
      }

      function paintFigureBase() {
        var container = figureContainer();
        if (!container) return;
        container.innerHTML = bodyFigureSvgFor('pro');

        paintOccupantFigures();

        updateSeatbeltVisual();
      }

      function updateSeatbeltVisual() {
        var container = figureContainer();
        var belt = container ? container.querySelector('#proFigureSeatbelt') : null;
        if (!belt) return;
        var gearOn = scope.settings && scope.settings.gear;
        var harnessOn = gearOn && occupantGearFlags('driver').harness;
        belt.style.display = scope.restraintConfig !== 'unbelted' && !harnessOn ? '' : 'none';
        var harnessEl = container.querySelector('#proFigureHarness');
        if (harnessEl) harnessEl.style.display = harnessOn ? '' : 'none';
        var helmet = container.querySelector('#proFigureHelmet');
        if (helmet) helmet.style.display = scope.settings && scope.settings.gear && occupantGearFlags('driver').helmet ? '' : 'none';
      }

      function updateFigureColors(injuries) {
        var container = figureContainer();
        if (!container) return;
        paintFigureSeverities(container, 'pro', crushedBody(computeBodyFigureSeverities(
          injuries, bleedFractionOf(scope.patientBloodLostMl, currentOccupant().massKg),
          burnFractionOf(patientFireDoseS)
        ), scope.survival));
      }

      function paintFigureSeverities(container, ns, severities) {
        if (!container) return;
        var p = figureIdPrefix(ns);
        FIGURE_REGIONS.forEach(function (region) {
          var rect = container.querySelector('#' + p + '-highlight-' + region);
          if (rect) rect.setAttribute('fill', severityRampColor(severities[region]));
        });
      }

      function displayInjuriesFor(report) {
        var arr = currentWorstInjuriesArray();
        if (report) arr = arr.concat(flattenReportInjuries(report));
        return mergePatientInjuries(arr);
      }

      function currentWorstInjuriesArray() {
        var arr = [];
        for (var key in landedInjuries) {
          if (Object.prototype.hasOwnProperty.call(landedInjuries, key)) arr.push(landedInjuries[key]);
        }
        return mergePatientInjuries(arr);
      }

      function resetToIdle() {
        pendingTimeouts.forEach(function (p) { $timeout.cancel(p); });
        pendingTimeouts = [];
        pendingSettleTimeout = null;
        pendingImpactStartMs = null;
        scope.hudState = 'idle';
        scope.impactLine = '';
        scope.notifications = [];
        scope.reportInjuries = [];
        scope.reportSeats = [];
        scope.occupantStateText = '';
        scope.reportRestraintConfigLabel = null;
        scope.fullscreen = false;
        applyFullscreenDom(false);
        scope.iss = null;
        scope.survival = null;
        scope.survivalBandHasContent = false;
        scope.cost = null;
        scope.recovery = null;
        scope.systemicEffects = null;
        scope.systemicEffectsView = [];
        scope.debugLatencyMs = null;
        scope.debugFirstInjuryLatencyMs = null;
        scope.debugProvisionalBlackoutLatencyMs = null;
        scope.debugLuaCaptureMs = null;
        scope.debugHop1RelayMs = null;
        scope.debugPipelineComputeMs = null;
        scope.debugFirstInjuryScheduleMs = null;
        pendingProvisionalKnockoutMs = null;
        scope.debugEvents = [];
        scope.debugAisByRegion = [];
        scope.debugIss = null;
        scope.debugIssMajorTrauma = false;
        scope.debugSurvivalOutlook = null;
        scope.debugValidationPassed = null;
        scope.debugValidationReason = null;
        scope.debugRawPeakG = null;
        scope.debugSampleCount = null;
        landedInjuries = {};
        resetSessionState();
        updateFigureColors([]);
        resetRealisticOverlay();
      }

      function resetUiForNewSequence() {
        pendingTimeouts.forEach(function (p) { $timeout.cancel(p); });
        pendingTimeouts = [];
        pendingSettleTimeout = null;
        scope.hudState = 'idle';
        scope.notifications = [];
        scope.reportInjuries = [];
        scope.reportSeats = [];
        scope.occupantStateText = '';
        scope.fullscreen = false;
        applyFullscreenDom(false);
        scope.iss = null;
        scope.survival = null;
        scope.survivalBandHasContent = false;
        scope.cost = null;
        scope.recovery = null;
        scope.systemicEffects = null;
        scope.systemicEffectsView = [];
        landedInjuries = {};
        updateFigureColors([]);

        var keepBlack = scope.realisticMode && scope.blackoutProvisional && scope.unconsciousFadeVisible;
        resetRealisticOverlay();
        if (keepBlack) {
          scope.unconsciousFadeVisible = true;
          scope.unconsciousFadeActive = true;
          scope.blackoutProvisional = true;
          sendRealisticAudioState({ dead: false, unconscious: true });
          sendRealisticControlState({ unconscious: true, armsBrokenSides: 0, legDegraded: false, shockSluggish: false });
        }
      }

      scope.openReport = function () {
        if (scope.hudState !== 'report') return;
        scope.toggleFullscreen();
      };

      function injuryKey(injury) {
        return injury.region + '|' + injury.name;
      }

      function addNotificationRow(injury) {
        if (Date.now() < suppressPopupsUntilMs) return;
        notifIdCounter += 1;
        var label = hudLabel(injury);

        var typeRgb = severityRampColorRgb(Math.max(1, injury.aisSeverity || 0));
        var glyphMarkup = injuryIconSvg(injury);

        var row = {
          id: notifIdCounter,
          label: label,
          glyphHtml: $sce.trustAsHtml(glyphMarkup),
          tintBorder: 'rgba(' + typeRgb + ',0.6)',
          visible: false,
          fading: false
        };

        scope.notifications.unshift(row);

        trackTimeout($timeout(function () {
          row.visible = true;
        }));

        trackTimeout($timeout(function () {
          row.fading = true;
          trackTimeout($timeout(function () {
            var idx = scope.notifications.indexOf(row);
            if (idx !== -1) scope.notifications.splice(idx, 1);
          }, NOTIF_FADE_MS));
        }, NOTIF_VISIBLE_MS));
      }

      function landAllInjuriesNow(eventReports) {
        (eventReports || []).forEach(function (er) {
          (er.injuries || []).forEach(function (ri) { landInjury(toFlatInjury(ri)); });
        });
      }

      function landInjury(injury) {
        var key = injuryKey(injury);
        var current = landedInjuries[key];
        if (current && injury.aisSeverity <= current.aisSeverity) return;
        landedInjuries[key] = injury;
        updateFigureColors(displayInjuriesFor(lastFullReport));

        addNotificationRow(injury);
      }

      var MECHANISM_QUALIFIER = /\s*\((?:[^()]*,\s*)?(?:minor|serious|severe)\)\s*$/i;
      var EJECTION_QUALIFIER = /\s*\(thrown from the vehicle\)\s*$/i;

      function whiplashTitle() {
        var d = Number.isFinite(sessionImpactPdofDeg) ? impactDirection(sessionImpactPdofDeg) : null;
        if (d && d.y > 0.5) return 'Whiplash (head whipped forward)';
        if (d && d.y < -0.5) return 'Whiplash (head snapped back)';
        if (d && Math.abs(d.x) > 0.5) return 'Whiplash (head thrown sideways)';
        return 'Whiplash (strained neck)';
      }
      function cleanInjuryName(name) {
        if (!name) return '';
        return String(name).replace(MECHANISM_QUALIFIER, '').replace(EJECTION_QUALIFIER, '').trim();
      }

      var SEVERITY_WORDS = ['', 'Minor', 'Moderate', 'Serious', 'Severe', 'Critical', 'Fatal'];
      var LIMB_PART_WORDS = [
        [/femoral|femur|thigh/i, 'thigh bone'], [/upper arm|humer/i, 'upper arm'],
        [/forearm/i, 'forearm'], [/wrist/i, 'wrist'], [/hand/i, 'hand'],
        [/ankle/i, 'ankle'], [/foot/i, 'foot'], [/lower leg|tibia|shin/i, 'shin'],
        [/knee/i, 'knee'], [/shoulder/i, 'shoulder']
      ];
      var REGION_PART_WORDS = { femur: 'thigh bone', upperArm: 'upper arm', forearm: 'forearm', wrist: 'wrist',
        hand: 'hand', ankle: 'ankle', foot: 'foot', lowerLeg: 'shin', knee: 'knee' };
      var GENERIC_BY_REGION = {
        head: ['Bump on the head', 'Bump on the head', 'Concussion', 'Bruised brain', 'Serious brain injury', 'Critical brain injury', 'Fatal head injury'],
        face: ['Cuts to the face', 'Cuts to the face', 'Broken bone in the face', 'Badly broken face', 'Badly broken face', 'Badly broken face', 'Badly broken face'],
        neck: ['Stiff neck', 'Stiff neck', 'Whiplash (strained neck)', 'Broken neck', 'Broken neck', 'Broken neck, spinal cord damaged', 'Broken neck, spinal cord destroyed'],
        chest: ['Bruised chest', 'Bruised chest', 'Broken rib', 'Broken ribs', 'Many broken ribs, bruised lung', 'Crushed chest', 'Crushed chest'],
        abdomen: ['Bruised belly', 'Bruised belly', 'Bruised organ in the belly', 'Torn organ in the belly', 'Ruptured organ in the belly', 'Ruptured organ in the belly', 'Ruptured organ in the belly'],
        pelvis: ['Bruised hip', 'Bruised hip', 'Cracked pelvis', 'Broken pelvis', 'Broken pelvis with heavy bleeding', 'Broken pelvis with heavy bleeding', 'Broken pelvis with heavy bleeding'],
        thoracicSpine: ['Sore upper back', 'Sore upper back', 'Cracked vertebra (upper back)', 'Broken upper back', 'Broken upper back', 'Broken upper back, spinal cord damaged', 'Broken upper back, spinal cord damaged'],
        lumbarSpine: ['Sore lower back', 'Sore lower back', 'Cracked vertebra (lower back)', 'Broken lower back', 'Broken lower back', 'Broken lower back, spinal cord damaged', 'Broken lower back, spinal cord damaged'],
        lung: ['Bruised lung', 'Bruised lung', 'Bruised lung', 'Collapsed lung', 'Collapsed lung', 'Both lungs collapsed', 'Both lungs collapsed'],
        circulatory: ['Some blood loss', 'Some blood loss', 'Some blood loss', 'Internal bleeding', 'Heavy blood loss', 'Massive bleeding', 'Massive bleeding']
      };
      var ORGAN_WORDS = [[/splen/i, 'spleen'], [/hepat|liver/i, 'liver'], [/renal|kidney/i, 'kidney'], [/bowel|intestin/i, 'bowel'], [/abdominal organ/i, 'organ in the belly']];

      function sideOfInjury(injury) {
        var n = String(injury.name || '');
        if (/\bleft\b/i.test(n)) return 'left';
        if (/\bright\b/i.test(n)) return 'right';
        return '';
      }

      function limbPartOf(injury) {
        var n = String(injury.name || '');
        for (var i = 0; i < LIMB_PART_WORDS.length; i++) if (LIMB_PART_WORDS[i][0].test(n)) return LIMB_PART_WORDS[i][1];
        return REGION_PART_WORDS[injury.region] || '';
      }

      function plainInjuryTitle(injury) {
        if (!injury) return '';
        var n = cleanInjuryName(injury.name || '');
        var ais = Math.max(0, Math.min(6, Math.round(injury.aisSeverity || 0)));
        var side = sideOfInjury(injury);
        var sideTag = side ? ' (' + side + ' side)' : '';
        var sidePre = side ? side + ' ' : '';
        var region = injury.region || '';
        var m;

        if (/^(unbelted-|drowning-|minor-|rollover-body-)/.test(String(injury.mechanism || '')) && injury.name) return injury.name;

        if (/^fire-/.test(String(injury.mechanism || '')) && injury.name) {
          var fm;
          if ((fm = /^Full-thickness burn \((.+)\)$/.exec(injury.name))) return 'Deep burn on the ' + fm[1];
          if ((fm = /^Deep burn into muscle \((.+)\)$/.exec(injury.name))) return 'Burn into the muscle (' + fm[1] + ')';
          if (/inhalation/i.test(injury.name)) return 'Burned throat and lungs (smoke)';
          return injury.name;
        }
        if (/footwell pushed in|knees pushed back|\(violent stop\)|\(car collapsed\)/i.test(n)) return injury.name;
        if (/\((hit by the unbelted|head swung across|hit the door|thrown across)/i.test(n)) return injury.name;
        if (/^(Broken ribs|Concussion|Bruised brain) \((dashboard|struck A-pillar)/.test(injury.name || '')) return injury.name;
        if (/helmet took most/i.test(n)) return 'Concussion (helmet took most of it)';
        if (/helmet took it/i.test(n)) return 'Head knock (helmet took the blow)';
        if (/under the helmet/i.test(n)) return 'Bruised face (under the helmet)';
        if (/HANS held/i.test(n)) return 'Neck strain (HANS held the head)';
        if (/harness bruising/i.test(n)) return /belly/i.test(n) ? 'Harness bruises across the belly' : 'Harness bruises across the chest';
        if (/fatal crush injury of the head/i.test(n)) return 'Head crushed (fatal)';
        if (/diffuse axonal/i.test(n)) return 'Severe brain damage (torn nerve fibres)';
        if (/subdural|epidural|haematoma|hematoma/i.test(n)) return 'Bleeding on the brain';
        if (/cerebral contusion/i.test(n)) return 'Bruised brain';
        if (/depressed skull/i.test(n)) return 'Skull broken inwards';
        if (/zygomatic|cheek/i.test(n)) return 'Broken cheekbone';
        if (/skull fracture \(hairline\)/i.test(n)) return 'Cracked skull';
        if (/skull fracture|basilar/i.test(n)) return ais <= 2 ? 'Cracked skull' : 'Broken skull';
        if (/concussion/i.test(n)) return 'Concussion';
        if (/traumatic brain injury/i.test(n)) return ais >= 5 ? 'Critical brain injury' : 'Serious brain injury';

        if (/cervical|whiplash/i.test(n) || region === 'neck') {
          if (/cord/i.test(n)) return 'Broken neck, spinal cord damaged';
          if (/fracture/i.test(n)) return 'Broken neck';
          if (/sprain|strain|whiplash/i.test(n)) return whiplashTitle();
        }
        if (region === 'thoracicSpine' || region === 'lumbarSpine' || /vertebra|spinal/i.test(n)) {
          var where = region === 'thoracicSpine' ? 'upper back' : 'lower back';
          if (/cord/i.test(n)) return 'Broken ' + where + ', spinal cord damaged';
          if (/burst/i.test(n)) return 'Shattered vertebra (' + where + ')';
          if (/compression|fracture/i.test(n)) return 'Cracked vertebra (' + where + ')';
        }

        if (/seatbelt bruis/i.test(n)) return 'Seatbelt bruise across the chest';
        if (/massive chest|crushed chest/i.test(n)) return 'Crushed chest' + sideTag;
        if (/severe chest injur/i.test(n)) return 'Broken ribs, bruised heart and lungs';
        if (/flail/i.test(n)) return 'Many broken ribs, bruised lung' + sideTag;
        if (/sternal|sternum/i.test(n)) return 'Broken breastbone';
        if (/single rib/i.test(n)) return 'Broken rib' + sideTag;
        if (/rib fracture/i.test(n)) return 'Broken ribs' + sideTag;
        if (/clavicle|collarbone/i.test(n)) return 'Broken ' + sidePre + 'collarbone';
        if (/pneumothorax/i.test(n)) return (/tension/i.test(n) ? 'Collapsed lung (life-threatening)' : 'Collapsed lung') + sideTag;
        if (/haemothorax|hemothorax/i.test(n)) return 'Bleeding into the chest' + sideTag;
        if (/pulmonary contusion/i.test(n)) return 'Bruised lung' + sideTag;
        if (/aort/i.test(n)) return 'Torn main artery (aorta)';
        if (/cardiac|heart/i.test(n)) return 'Bruised heart';
        if (/diaphragm/i.test(n)) return 'Torn diaphragm';

        if (/massive haemorrhage|massive hemorrhage/i.test(n)) return 'Massive bleeding';
        if (/significant blood loss/i.test(n)) return 'Heavy blood loss';
        if (/internal haemorrhage|internal hemorrhage/i.test(n)) return 'Internal bleeding';

        for (var o = 0; o < ORGAN_WORDS.length; o++) {
          if (!ORGAN_WORDS[o][0].test(n)) continue;
          var organ = ORGAN_WORDS[o][1];
          var own = organ === 'kidney' ? sidePre + organ : organ;
          if (/rupture|major/i.test(n)) return 'Ruptured ' + own;
          if (/laceration/i.test(n)) return 'Torn ' + own;
          if (/contusion/i.test(n)) return 'Bruised ' + own;
          return 'Injured ' + own;
        }

        if (region === 'pelvis' || /pelvi/i.test(n)) {
          if (/haemorrhage|hemorrhage|open-book/i.test(n)) return 'Broken pelvis with heavy bleeding';
          if (/stable/i.test(n)) return 'Cracked pelvis';
          if (/fracture/i.test(n)) return 'Broken pelvis';
        }

        if (/destroyed leg/i.test(n)) return 'Leg destroyed (cannot be saved)';
        if (/crushed legs/i.test(n)) return 'Both legs crushed';
        if (/crush injury of the leg/i.test(n)) return 'Crushed leg';
        if (/shin and heel/i.test(n)) return 'Broken shins and heels';

        var part = limbPartOf(injury);
        if (part && (m = /fracture|injury/i.exec(n))) {
          if (/open|compound/i.test(n)) return 'Broken ' + sidePre + part + ' (bone through the skin)';
          if (/hairline/i.test(n)) return 'Cracked ' + sidePre + part;
          if (/displaced|comminuted/i.test(n)) return 'Badly broken ' + sidePre + part;
          if (/fracture/i.test(n)) return 'Broken ' + sidePre + part;

          return (ais <= 1 ? 'Bruised ' : ais === 2 ? 'Broken ' : 'Badly broken ') + sidePre + part;
        }
        if (/dislocat/i.test(n) && part) return 'Dislocated ' + sidePre + part;
        if (/sprain/i.test(n) && part) return 'Sprained ' + sidePre + part;

        var gen = GENERIC_BY_REGION[region];
        if (gen) return gen[ais] + (region === 'chest' || region === 'lung' ? sideTag : '');
        return n;
      }

      var CAUSE_LABELS = [
        ['rollover-ejection', 'You were thrown out of the car as it rolled.'],
        ['rollover', 'The car rolling threw you against the inside of it.'],
        ['intrusion-roof', 'The roof was pushed down into the cabin onto you.'],
        ['intrusion-door', 'The door was pushed inwards into you.'],
        ['intrusion-dash', 'The dashboard was pushed back into you.'],
        ['intrusion', 'Part of the car was pushed into the space you were sitting in.'],
        ['haemorrhage-from', 'Bleeding from another injury you already have.'],
        ['secondary-to-rib-fracture', 'Caused by your own broken ribs moving.'],
        ['seatbelt-syndrome', 'The lap belt loaded across your abdomen.'],
        ['seatbelt-flexion-distraction', 'The lap belt held your hips while your upper body folded over it.'],
        ['frontal-restraint-compression', 'The belt pressed hard into you as you were thrown forward.'],
        ['frontal-epigastric-compression', 'Something pressed hard into your upper abdomen.'],
        ['blunt-chest-loading', 'Your chest was loaded hard -- belt, airbag or the wheel.'],
        ['blunt-facial-impact', 'Your face hit something.'],
        ['blunt-head-impact', 'Your head hit something.'],
        ['traumatic-brain-injury', 'Your brain was thrown against the inside of your skull.'],
        ['skull-fracture', 'Your head struck something hard enough to break bone.'],
        ['cervical-spine-deceleration', 'Your head kept moving after your body stopped.'],
        ['thoracic-spine-deceleration', 'Your upper spine took the deceleration.'],
        ['vertical-seat-spinal-compression', 'The seat drove up into you as the car landed.'],
        ['deceleration-aortic', 'Your heart and the vessels above it stopped at different rates.'],
        ['axial-femur-loading', 'Your knee was driven back into your thigh bone.'],
        ['lateral-compression', 'You were crushed sideways.'],
        ['blowout-diaphragm', 'The pressure in your abdomen spiked as you were compressed.'],
        ['fire', 'Burns from the fire.'],
        ['burn', 'Burns from the fire.'],
        ['drown', 'You could not breathe while the car was under water.'],
        ['submersion', 'You could not breathe while the car was under water.']
      ];

      function causeLabelFor(mechanism) {
        if (!mechanism) return '';
        var key = String(mechanism).toLowerCase();
        for (var i = 0; i < CAUSE_LABELS.length; i++) {
          if (key.indexOf(CAUSE_LABELS[i][0]) !== -1) return CAUSE_LABELS[i][1];
        }
        return '';
      }

      function buildReportRow(injury, idx) {
        var typeKey = pickGlyph(injury);
        var hex = severityRampColor(injury.aisSeverity);
        var rgb = severityRampColorRgb(injury.aisSeverity);
        var split = splitCaveatSuffix(injury.plainDescription || '');
        return {
          id: idx,
          region: injury.region,
          aisSeverity: injury.aisSeverity,

          name: injury.name,

          title: plainInjuryTitle(injury) || cleanInjuryName(injury.name) || split.base,
          medicalName: cleanInjuryName(injury.name),
          severityWord: SEVERITY_WORDS[Math.max(0, Math.min(6, Math.round(injury.aisSeverity || 0)))] || '',
          cause: causeLabelFor(injury.mechanism),
          whyOpen: false,
          clinicalDescription: injury.clinicalDescription || '',
          plainDescription: split.base,
          caveatKind: split.caveatKind,
          caveatShort: split.caveatShort,
          technicalCaveat: injury.caveat || '',
          glyphHtml: $sce.trustAsHtml(injuryIconSvg(injury)),
          tintBg: 'rgba(' + rgb + ',0.16)',
          tintBorder: 'rgba(' + rgb + ',0.6)'
        };
      }

      var REGION_PLAIN_LOCATION = {
        thoracicSpine: 'mid back',
        lumbarSpine: 'lower back',
        cervicalSpine: 'neck',
        neck: 'neck',
        upperArm: 'upper arm',
        forearm: 'forearm',
        lowerLeg: 'lower leg',
        thigh: 'thigh',
        abdomen: 'abdomen',
        chest: 'chest',
        thorax: 'chest',
        pelvis: 'pelvis',
        head: 'head',
        kidney: 'kidney',
        bowel: 'bowel',
        liver: 'liver',
        spleen: 'spleen'
      };

      function plainLocationFor(region) {
        if (!region) return '';
        if (REGION_PLAIN_LOCATION[region]) return REGION_PLAIN_LOCATION[region];

        return String(region).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      }

      function disambiguateRowTitles(rows, seatKey) {
        if (rows && rows.length) {
          var best = Object.create(null);
          rows.forEach(function (row, i) {
            if (!row || !row.title) return;
            var b = best[row.title];
            if (b === undefined || (row.aisSeverity || 0) > (rows[b].aisSeverity || 0)) best[row.title] = i;
          });
          for (var k = rows.length - 1; k >= 0; k--) {
            if (rows[k] && rows[k].title && best[rows[k].title] !== k) rows.splice(k, 1);
          }
        }
        restoreWhyState(rows, seatKey || 'driver');
        var counts = Object.create(null);
        (rows || []).forEach(function (row) {
          if (!row || !row.title) return;
          counts[row.title] = (counts[row.title] || 0) + 1;
        });
        (rows || []).forEach(function (row) {
          if (!row || !row.title) return;
          if (counts[row.title] > 1) {
            var where = plainLocationFor(row.region);
            if (where) row.title = row.title + ' (' + where + ')';
          }
        });
        return rows;
      }

      var openWhyKeys = Object.create(null);

      function restoreWhyState(rows, seatKey) {
        (rows || []).forEach(function (row) {
          if (!row) return;
          row.whyKey = seatKey + '|' + (row.medicalName || row.title);
          row.whyOpen = !!openWhyKeys[row.whyKey];
        });
      }

      scope.toggleWhy = function (row) {
        if (!row) return;
        row.whyOpen = !row.whyOpen;
        if (row.whyKey) {
          if (row.whyOpen) openWhyKeys[row.whyKey] = true;
          else delete openWhyKeys[row.whyKey];
        }
      };

      var ROTATING_PDOF_MIN_EVENTS = 2;

      var ROTATING_PDOF_MIN_DEGREES = 90;

      var KNOCKED_OUT_MIN_HEAD_AIS = 4;
      var CONCUSSED_MIN_HEAD_AIS = 2;
      var CANT_BREATHE_MIN_CHEST_AIS = 4;
      var BLEEDING_OUT_MIN_CIRCULATORY_AIS = 4;

      function angleDiffDeg(a, b) {
        var d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
      }

      function isRotatingPdofSignature(eventMetaList) {
        if (!eventMetaList || eventMetaList.length < ROTATING_PDOF_MIN_EVENTS) return false;

        var real = eventMetaList.filter(function (m) {
          return m && (m.deltaVMs || 0) >= 4 && (m.peakG || 0) >= 8;
        });
        if (real.length < ROTATING_PDOF_MIN_EVENTS) return false;
        for (var i = 1; i < real.length; i++) {
          var a = real[i - 1].pdofDeg;
          var b = real[i].pdofDeg;
          if (typeof a !== 'number' || typeof b !== 'number') continue;
          if (angleDiffDeg(a, b) >= ROTATING_PDOF_MIN_DEGREES) return true;
        }
        return false;
      }

      function deriveOccupantState(flatInjuries, survival, systemicEffects, eventMetaList, ctx) {
        var dead = ctx ? ctx.dead : patientState.dead;
        var bleedMlMin = ctx ? ctx.bleedMlMin : scope.patientBleedMlMin;
        var bloodLostMl = ctx ? ctx.bloodLostMl : scope.patientBloodLostMl;
        var massKg = ctx ? ctx.massKg : currentOccupant().massKg;
        var kitActive = ctx ? !!ctx.medKitActive : medKitActive;

        if (dead) {
          var cause = ctx && ctx.deathCause ? ctx.deathCause
            : (survival && survival.deathCause ? survival.deathCause : null);
          return cause && cause.short ? cause.short : 'Deceased';
        }
        if (bleedMlMin > 0) return bloodLostMl >= massKg * 70 * 0.3 ? 'Bleeding out' : 'Bleeding';
        var worstHeadAis = 0, worstChestAis = 0, worstCirculatoryAis = 0;
        flatInjuries.forEach(function (inj) {
          if (inj.region === 'head' && inj.aisSeverity > worstHeadAis) worstHeadAis = inj.aisSeverity;
          if (inj.region === 'chest' && inj.aisSeverity > worstChestAis) worstChestAis = inj.aisSeverity;
          if (inj.region === 'circulatory' && inj.aisSeverity > worstCirculatoryAis) worstCirculatoryAis = inj.aisSeverity;
        });

        if (kitActive) worstCirculatoryAis = Math.ceil(worstCirculatoryAis / 2);

        var shock = systemicEffects && systemicEffects.shock ? systemicEffects.shock.level : null;
        var breathing = systemicEffects && systemicEffects.breathing ? systemicEffects.breathing.level : null;
        var bloodLoss = systemicEffects && systemicEffects.bloodLoss ? systemicEffects.bloodLoss.level : null;
        var outlook = survival ? survival.outlook : null;

        if (outlook === 'notSurvivable') return 'Unresponsive';
        if (bloodLoss === 'severe' || worstCirculatoryAis >= BLEEDING_OUT_MIN_CIRCULATORY_AIS) return 'Bleeding out';

        if (shock === 'decompensated') return 'Without help, you will die';
        if (worstHeadAis >= KNOCKED_OUT_MIN_HEAD_AIS) return 'Knocked out';
        if (breathing === 'laboured' || worstChestAis >= CANT_BREATHE_MIN_CHEST_AIS) return "Can't breathe";
        if (worstHeadAis >= CONCUSSED_MIN_HEAD_AIS) return 'Concussed';
        if (shock === 'early') return 'In shock';
        if (isRotatingPdofSignature(eventMetaList)) return 'Dizzy';
        if (flatInjuries.length > 0) return 'Shaken but alert';
        return 'Fine';
      }

      function flattenReportInjuries(report) {
        var flat = [];
        (report.events || []).forEach(function (er) {
          (er.injuries || []).forEach(function (ri) { flat.push(toFlatInjury(ri)); });
        });
        return flat;
      }

      var lastOccupantStateFlatInjuries = [];
      var lastOccupantStateEventMeta = [];

      function updateOccupantState(flatInjuries, report, eventMetaList) {
        lastOccupantStateFlatInjuries = flatInjuries;
        lastOccupantStateEventMeta = eventMetaList;

        scope.occupantStateText = deriveOccupantState(flatInjuries, report.survival, medKitAdjustedSystemicEffects(report.systemicEffects), eventMetaList);
      }

      function deathAdjustedSurvival(survival) {
        if (survival && scope.patientProgressActive) {
          var current = Object.assign({}, survival);
          current.survivalProbabilityPercent = Math.min(current.survivalProbabilityPercent, patientState.lowestSurvivalPercent);
          if (patientState.dead) { current.outlook = 'notSurvivable'; current.plainSummary = 'The simulated occupant has died.'; }
          return current;
        }
        if (!survival || survival.outlook !== 'notSurvivable') return survival;
        var out = {};
        for (var k in survival) { if (Object.prototype.hasOwnProperty.call(survival, k)) out[k] = survival[k]; }
        out.survivalProbabilityPercent = 0;
        return out;
      }

      function reportHasAnyInjury(report) {
        var events = (report && report.events) || [];
        for (var i = 0; i < events.length; i++) {
          var injuries = events[i] && events[i].injuries;
          if (injuries && injuries.length > 0) return true;
        }
        return false;
      }

      function updateHeadlineSurvival(report) {
        scope.iss = report.iss || null;
        scope.survival = deathAdjustedSurvival(medKitAdjustedSurvival(report.survival || null));
        scope.survivalBandHasContent = reportHasAnyInjury(report) || !!(report.iss && report.iss.iss > 0);

        var headCare = careEstimate(flattenReportInjuries(report), !!(scope.survival && scope.survival.outlook === 'notSurvivable'), report.iss ? report.iss.iss : null);
        scope.cost = report.cost ? { costUsd: headCare.costUsd } : null;
        scope.recovery = report.recovery ? headCare : null;

        refreshSeatViewModels();
      }

      var HEAD_AIS_BLUR_PX = { 0: 0, 1: 1.2, 2: 2.8, 3: 5, 4: 8, 5: 12 };

      var HEAD_AIS_AUDIO_BLUR = { 0: 0, 1: 0, 2: 0.15, 3: 0.45, 4: 0.75, 5: 1.0 };
      var HEAD_AIS_MASTER_VOLUME_MULT = { 0: 1, 1: 1, 2: 0.9, 3: 0.7, 4: 0.5, 5: 0.3 };

      var BLOOD_LOSS_DESATURATE_TICK_MS = 250;

      var MED_KIT_USE_DURATION_MS = 4000;
      var MED_KIT_RECOVERY_TICK_MS = BLOOD_LOSS_DESATURATE_TICK_MS * 0.5;

      var SHOCK_PROGRESSION_TOTAL_MS = {
        none: null,
        moderate: 240000,
        severe: 50000
      };

      var SHOCK_STAGE2_START_FRACTION = 0.35;
      var SHOCK_STAGE3_START_FRACTION = 0.65;
      var SHOCK_STAGE4_START_FRACTION = 0.90;

      var SHOCK_STAGE2_BLACKOUT_MS = { start: 800, end: 2000 };
      var SHOCK_STAGE2_LUCID_MS = { start: 9000, end: 3000 };
      var SHOCK_STAGE3_BLACKOUT_MS = { start: 4000, end: 9000 };
      var SHOCK_STAGE3_LUCID_MS = { start: 3000, end: 800 };

      var VIGNETTE_MIN_INNER_PCT = 22;
      var VIGNETTE_MAX_OPACITY = 0.85;

      var DIZZY_HEAD_AIS_THRESHOLD = 3;

      var TINNITUS_HEAD_AIS_THRESHOLD = DIZZY_HEAD_AIS_THRESHOLD;

      var RINGING_DURATION_MS_MIN = 20000;
      var RINGING_DURATION_MS_MAX = 40000;

      var RINGING_TONE_PEAK_GAIN = 0.5;

      var gameMasterVolume = 1;
      var GAME_MASTER_VOLUME_POLL_INTERVAL_MS = 1000;
      var gameMasterVolumePollElapsedMs = GAME_MASTER_VOLUME_POLL_INTERVAL_MS;

      function refreshGameMasterVolume() {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
        window.bngApi.engineLua("VariableRegistry.get('$pref::SFX::AudioChannelMaster')", function (ret) {
          var vol = Number(ret);
          if (isFinite(vol)) gameMasterVolume = Math.max(0, Math.min(1, vol));
        });
      }

      var AUDIO_IMPAIRMENT_PEAK_BLUR = 1.0;
      var AUDIO_IMPAIRMENT_PEAK_VOLUME_MULT = 0.15;

      var WAKING_RECOVERY_MS_MIN = 10000;
      var WAKING_RECOVERY_MS_MAX = 20000;

      var VISION_WAKING_PEAK_BLUR_PX = 20;

      var DIZZY_ONSET_MS = 2000;
      var DIZZY_RECOVERY_MS = 12000;

      var PAIN_PULSE = {
        none: null,
        moderate: null,
        severe: { durationS: 2.6, peakOpacity: 0.18 },
        excruciating: { durationS: 1.3, peakOpacity: 0.3 }
      };

      var UNCONSCIOUS_BLACKOUT_MS = 4000;

      var UNCONSCIOUS_FADE_OUT_MS = 3600;

      var PROVISIONAL_CANCEL_FADE_MS = 500;

      scope.settings = {
        blackoutEnabled: true,
        blackoutOpacity: 100,
        blurEnabled: true,
        blurIntensity: 100,
        blurUiApps: false,
        shakeMode: 'always',
        shakeOn: true,
        shakeIntensity: 100,
        dynamicCamera: true,
        dynamicCameraStrength: 60,
        bodySway: 60,
        overlaysEnabled: true,
        language: 'en'
      };

      scope.languages = (window.__cipI18n && window.__cipI18n.languages) || [
        ['en', 'English'], ['ru', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439'], ['uk', '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430'], ['es', 'Espa\u00f1ol'],
        ['de', 'Deutsch'], ['fr', 'Fran\u00e7ais'], ['pt', 'Portugu\u00eas'], ['pl', 'Polski'],
        ['tr', 'T\u00fcrk\u00e7e'], ['zh', '\u4e2d\u6587'], ['ja', '\u65e5\u672c\u8a9e']];
      scope.setLanguage = function (code) { scope.settings.language = code; };
      function applyLanguage() {
        if (window.__cipI18n) window.__cipI18n.setLang(scope.settings.language || 'en');
      }

      var SEAT_DEFS = [

        { key: 'driver',     label: 'Driver',          short: 'Driver', row: 'front', side: 'left',  ns: 'pro',   reportNs: 'rptD' },
        { key: 'frontRight', label: 'Front passenger', short: 'Front',  row: 'front', side: 'right', ns: 'paxFr', reportNs: 'rptFr' },
        { key: 'rearLeft',   label: 'Rear left',       short: 'Rear L', row: 'rear',  side: 'left',  ns: 'paxRl', reportNs: 'rptRl' },
        { key: 'rearRight',  label: 'Rear right',      short: 'Rear R', row: 'rear',  side: 'right', ns: 'paxRr', reportNs: 'rptRr' }
      ];

      var FRONT_ROW_RESTRAINTS = ['beltedAirbag', 'beltedOnly', 'unbelted'];
      var REAR_ROW_RESTRAINTS = ['beltedOnly', 'unbelted'];

      function seatDef(key) {
        for (var i = 0; i < SEAT_DEFS.length; i++) if (SEAT_DEFS[i].key === key) return SEAT_DEFS[i];
        return null;
      }

      function restraintOptionsFor(def) {
        return def.row === 'rear' ? REAR_ROW_RESTRAINTS : FRONT_ROW_RESTRAINTS;
      }

      function defaultSeatSettings() {
        return {
          frontRight: { occupied: false, restraint: 'beltedAirbag' },
          rearLeft: { occupied: false, restraint: 'beltedOnly' },
          rearRight: { occupied: false, restraint: 'beltedOnly' }
        };
      }
      scope.settings.seats = defaultSeatSettings();

      var GEAR_OPTIONS = [
        { key: 'none', label: 'No belt', belt: false, helmet: false, harness: false },
        { key: 'belt', label: 'Seatbelt', belt: true, helmet: false, harness: false },
        { key: 'helmet', label: 'Helmet only', belt: false, helmet: true, harness: false },
        { key: 'beltHelmet', label: 'Belt + helmet', belt: true, helmet: true, harness: false },
        { key: 'harness', label: 'Race harness + helmet + HANS', belt: true, helmet: true, harness: true }
      ];
      scope.gearOptions = GEAR_OPTIONS;
      function gearDef(key) {
        for (var i = 0; i < GEAR_OPTIONS.length; i++) if (GEAR_OPTIONS[i].key === key) return GEAR_OPTIONS[i];
        return GEAR_OPTIONS[1];
      }
      function defaultGearSettings() {
        return {
          driver: { gear: 'belt', airbag: true },
          frontRight: { gear: 'belt', airbag: true },
          rearLeft: { gear: 'belt', airbag: false },
          rearRight: { gear: 'belt', airbag: false }
        };
      }
      scope.settings.gear = defaultGearSettings();

      function normaliseGearSettings() {
        var d = defaultGearSettings();
        if (!scope.settings.gear || typeof scope.settings.gear !== 'object') scope.settings.gear = d;
        Object.keys(d).forEach(function (k) {
          var e = scope.settings.gear[k];
          if (!e || typeof e !== 'object') { scope.settings.gear[k] = d[k]; return; }
          if (!GEAR_OPTIONS.some(function (g) { return g.key === e.gear; })) e.gear = d[k].gear;
          e.airbag = e.airbag !== false && seatDefByKey(k).row === 'front';
        });
      }

      function applyDriverSide(side) {
        var rhd = side === 'right';
        SEAT_DEFS.forEach(function (d) {
          if (d.key === 'driver') d.side = rhd ? 'right' : 'left';
          if (d.key === 'frontRight') { d.side = rhd ? 'left' : 'right'; }
        });
        scope.driverOnRight = rhd;
      }
      function seatDefByKey(k) {
        for (var i = 0; i < SEAT_DEFS.length; i++) if (SEAT_DEFS[i].key === k) return SEAT_DEFS[i];
        return SEAT_DEFS[0];
      }
      function seatGear(key) {
        var e = scope.settings.gear && scope.settings.gear[key];
        return e || defaultGearSettings()[key];
      }

      function seatAirbagAvailable(key) {
        return seatDefByKey(key).row === 'front' && vehicleHasAirbags();
      }
      scope.seatAirbagAvailable = seatAirbagAvailable;
      function tierForGear(key) {
        var e = seatGear(key), g = gearDef(e.gear);
        if (!g.belt) return 'unbelted';
        return e.airbag && seatDefByKey(key).row === 'front' ? 'beltedAirbag' : 'beltedOnly';
      }

      function syncTierFromGear(key) {
        var tier = tierForGear(key);
        if (key === 'driver') {
          scope.restraintConfig = tier;
          scope.restraintConfigLabel = gearLabelFor('driver');
          updateSeatbeltVisual();
        } else if (scope.settings.seats && scope.settings.seats[key]) {
          scope.settings.seats[key].restraint = tier;
        }
      }
      function gearLabelFor(key) {
        var e = seatGear(key), g = gearDef(e.gear);
        var airbag = e.airbag && seatAirbagAvailable(key) ? ' + airbag' : '';
        return g.label + airbag;
      }
      scope.gearLabelFor = gearLabelFor;
      scope.setSeatGear = function (key, gear) {
        var e = seatGear(key);
        scope.settings.gear[key] = { gear: gear, airbag: e.airbag };
        syncTierFromGear(key);
        refreshSeatViewModels();
      };
      scope.toggleSeatAirbag = function (key) {
        if (seatDefByKey(key).row !== 'front') return;
        var e = seatGear(key);
        scope.settings.gear[key] = { gear: e.gear, airbag: !e.airbag };
        syncTierFromGear(key);
        refreshSeatViewModels();
      };
      scope.seatGearKey = function (key) { return seatGear(key).gear; };

      scope.gearMenuOpen = null;
      scope.toggleGearMenu = function (key) { scope.gearMenuOpen = scope.gearMenuOpen === key ? null : key; };
      scope.pickGear = function (key, gear) { scope.gearMenuOpen = null; scope.setSeatGear(key, gear); };
      scope.gearLabelOnly = function (key) { return gearDef(seatGear(key).gear).label; };
      scope.seatAirbagOn = function (key) { return !!seatGear(key).airbag; };

      function gearFromTier(key, tier) {
        var e = seatGear(key), g = gearDef(e.gear);
        var helmet = g.helmet;
        if (tier === 'unbelted') return { gear: helmet ? 'helmet' : 'none', airbag: e.airbag };
        var gear = g.harness ? 'harness' : (helmet ? 'beltHelmet' : 'belt');
        return { gear: gear, airbag: tier === 'beltedAirbag' };
      }
      function occupantGearFlags(key) {
        var g = gearDef(seatGear(key).gear);
        return { helmet: g.helmet, harness: g.harness, hans: g.harness };
      }

      function normaliseSeatSettings() {
        var defaults = defaultSeatSettings();
        if (!scope.settings.seats || typeof scope.settings.seats !== 'object') {
          scope.settings.seats = defaults;
          return;
        }
        Object.keys(defaults).forEach(function (key) {
          var def = seatDef(key);
          var entry = scope.settings.seats[key];
          if (!entry || typeof entry !== 'object') {
            scope.settings.seats[key] = defaults[key];
            return;
          }
          entry.occupied = entry.occupied === true;
          if (restraintOptionsFor(def).indexOf(entry.restraint) === -1) entry.restraint = defaults[key].restraint;
        });
      }

      scope.vehicleInfo = null;
      var AIRBAG_FIRST_YEAR = 1990;
      var VEHICLE_AGE_ODDS = [
        [2010, 1.0], [2000, 1.1], [1990, 1.25], [1980, 1.4], [1968, 1.7], [0, 2.1]
      ];

      function vehicleYear() {
        var y = scope.vehicleInfo && Number(scope.vehicleInfo.year);
        return y > 1880 && y < 2100 ? y : null;
      }
      function vehicleHasAirbags() {
        var y = vehicleYear();
        return !(y && y < AIRBAG_FIRST_YEAR);
      }
      function vehicleAgeOdds() {
        var y = vehicleYear();
        if (!y) return 1;
        for (var i = 0; i < VEHICLE_AGE_ODDS.length; i++) if (y >= VEHICLE_AGE_ODDS[i][0]) return VEHICLE_AGE_ODDS[i][1];
        return 1;
      }
      function vehicleHasRollCage() { return !!(scope.vehicleInfo && scope.vehicleInfo.rollCage); }

      var seatOverride = {};
      var seatOverrideModel = null;
      function seatAvailable(key) {
        if (key === 'driver') return true;
        var v = scope.vehicleInfo;
        if (seatOverride[key]) return true;
        if (!v || !v.seatsKnown) return true;
        if (key === 'frontRight') return !(v.frontSeats === 1);

        if (!v.partsKnown) return true;
        if (v.rearSeats === 0) return false;
        if (key === 'rearRight') return v.rearSeats !== 1;
        return true;
      }
      scope.seatAvailable = seatAvailable;

      function effectiveRestraintLabel(tier, fallback) {
        if (tier === 'beltedAirbag' && !vehicleHasAirbags()) return RESTRAINT_CONFIG_LABELS.beltedOnly + ' (no airbags in a ' + vehicleYear() + ' car)';
        return fallback || RESTRAINT_CONFIG_LABELS[tier];
      }

      scope.vehicleSummary = function () {
        var v = scope.vehicleInfo;
        if (!v) return '';
        var parts = [];
        var y = vehicleYear();
        if (y) parts.push(y + (y < AIRBAG_FIRST_YEAR ? ' (no airbags)' : ''));
        if (v.seatsKnown) {
          var n = v.frontSeats + (v.partsKnown ? v.rearSeats : 0);
          parts.push(n + (v.partsKnown ? '' : '+') + (n === 1 && v.partsKnown ? ' seat' : ' seats'));
        }
        if (v.rollCage) parts.push('roll cage');
        return parts.join(' - ');
      };

      function seatRestraintTier(key) {
        if (key === 'driver') return scope.restraintConfig;
        var entry = scope.settings.seats[key];
        return entry ? entry.restraint : 'beltedOnly';
      }

      function seatIsOccupied(key) {
        if (key === 'driver') return true;
        if (!seatAvailable(key)) return false;
        var entry = scope.settings.seats[key];
        return !!(entry && entry.occupied);
      }

      function occupiedPassengerDefs() {
        return SEAT_DEFS.filter(function (def) { return def.key !== 'driver' && seatIsOccupied(def.key); });
      }

      scope.occupantCount = function () {
        return 1 + occupiedPassengerDefs().length;
      };

      function occupantGridLayout() {
        var occupied = SEAT_DEFS.filter(function (d) { return seatIsOccupied(d.key); });
        function used(field, values) {
          return values.filter(function (v) {
            return occupied.some(function (d) { return d[field] === v; });
          });
        }
        var sides = used('side', ['left', 'right']);
        var rows = used('row', ['front', 'rear']);

        return { sides: sides, rows: rows, cols: sides.length, rowCount: rows.length };
      }

      scope.seatCellVisible = function (key) {
        var def = seatDef(key);
        if (!def) return false;
        if (!scope.multiOccupant()) return key === 'driver';
        var layout = occupantGridLayout();
        return layout.sides.indexOf(def.side) !== -1 && layout.rows.indexOf(def.row) !== -1;
      };

      scope.seatCellStyle = function (key) {
        var def = seatDef(key);
        if (!def || !scope.multiOccupant()) return {};
        var layout = occupantGridLayout();
        return {
          gridColumn: String(layout.sides.indexOf(def.side) + 1),
          gridRow: String(layout.rows.indexOf(def.row) + 1)
        };
      };

      scope.occupantGridStyle = function () {
        if (!scope.multiOccupant()) return {};
        var layout = occupantGridLayout();
        return {
          gridTemplateColumns: 'repeat(' + layout.cols + ', 1fr)',
          gridTemplateRows: 'repeat(' + layout.rowCount + ', auto)'
        };
      };

      scope.compactBodiesOnly = function () {
        return scope.multiOccupant() && !scope.fullscreen;
      };

      scope.multiOccupant = function () {
        return scope.occupantCount() > 1;
      };

      function occupantForSeat(def) {
        var tier = seatRestraintTier(def.key);
        return {
          massKg: 75,
          age: 35,
          belted: tier !== 'unbelted',
          airbag: tier === 'beltedAirbag' && vehicleHasAirbags(),
          helmet: occupantGearFlags(def.key).helmet,
          harness: occupantGearFlags(def.key).harness,
          hans: occupantGearFlags(def.key).hans,
          seat: def.key
        };
      }

      var paxRecords = Object.create(null);

      function seatSeed(key) {
        var h = 2166136261;
        for (var i = 0; i < key.length; i++) {
          h ^= key.charCodeAt(i);
          h = Math.imul(h, 16777619) >>> 0;
        }
        return (scenarioSeed ^ h) >>> 0;
      }

      function newPaxRecord(def) {
        return {
          def: def,
          injuries: [],
          events: [],
          eventMeta: [],
          exposureInjuries: [],
          patient: { bloodLostM3: 0, lowestSurvivalPercent: 100, dead: false },
          bleedMlMin: 0,
          totalElapsedS: 0,
          seed: seatSeed(def.key),
          report: null
        };
      }

      function paxRecord(def) {
        if (!paxRecords[def.key]) paxRecords[def.key] = newPaxRecord(def);
        return paxRecords[def.key];
      }

      function resetPassengerState() {
        paxRecords = Object.create(null);
        refreshSeatViewModels();
      }

      var SEAT_OFFSET_LATERAL_M = 0.38;
      var SEAT_OFFSET_LONGITUDINAL_M = 0.45;

      var SEAT_LATERAL_GAIN = 0.30;

      var SEAT_LONGITUDINAL_GAIN_FRONTAL = 0.04;
      var SEAT_LONGITUDINAL_GAIN_REAR = 0.30;

      var SEAT_LATERAL_NOISE_FLOOR = 0.009;
      var SEAT_LATERAL_FULL = 0.052;
      var SEAT_LONGITUDINAL_SATURATION = 0.42;

      function lateralOffsetShare(dirX) {
        var m = Math.abs(dirX);
        if (m <= SEAT_LATERAL_NOISE_FLOOR) return 0;
        if (m >= SEAT_LATERAL_FULL) return 1;
        return (m - SEAT_LATERAL_NOISE_FLOOR) / (SEAT_LATERAL_FULL - SEAT_LATERAL_NOISE_FLOOR);
      }

      var DRIVER_FRONTAL_PENALTY = 1.03;
      var DRIVER_FRONTAL_PENALTY_MAX_DEG = 50;

      var SEAT_SIDE_MATCHES_IMPACT_SIDE = true;

      function impactDirection(pdofDeg) {
        if (!Number.isFinite(pdofDeg)) return null;
        var rad = pdofDeg * Math.PI / 180;
        return { x: Math.sin(rad), y: Math.cos(rad) };
      }

      function seatPosition(def) {
        var x = (def.side === 'right' ? 1 : -1) * SEAT_OFFSET_LATERAL_M;
        if (!SEAT_SIDE_MATCHES_IMPACT_SIDE) x = -x;
        return { x: x, y: (def.row === 'front' ? 1 : -1) * SEAT_OFFSET_LONGITUDINAL_M };
      }

      function seatImpactProximity(def, pdofDeg) {
        var dir = impactDirection(pdofDeg);
        if (!dir) return 0;
        var seat = seatPosition(def);
        var length = Math.sqrt(seat.x * seat.x + seat.y * seat.y) || 1;
        return (seat.x * dir.x + seat.y * dir.y) / length;
      }

      function seatIsNearSide(def, pdofDeg) {
        var dir = impactDirection(pdofDeg);

        var struck = struckLateralSign(dir);
        if (!struck) return true;
        return seatPosition(def).x * struck > 0;
      }

      function primaryImpact(eventMetaList) {
        var best = null;
        var bestG = -Infinity;
        (eventMetaList || []).forEach(function (m) {
          if (m && m.peakG > bestG) { bestG = m.peakG; best = m; }
        });
        return {
          impactSide: best ? best.impactSide : null,
          pdofDeg: best && Number.isFinite(best.pdofDeg) ? best.pdofDeg : null,
          tracePdofDeg: null
        };
      }

      function occupantPulseNormaliser(pdofDeg) {
        var sum = 0;
        SEAT_DEFS.forEach(function (def) {
          sum += seatPulseScaleRaw(def, pdofDeg, { excludeDriverPenalty: true });
        });
        var mean = sum / (SEAT_DEFS.length || 1);
        return mean > 0 ? mean : 1;
      }

      var VERTICAL_DOMINANCE_FULL = 2.5;

      function horizontalRelevance() {
        var vert = Math.abs(sessionImpactDvZMs);
        var horiz = Math.sqrt(
          sessionImpactDvXMs * sessionImpactDvXMs + sessionImpactDvYMs * sessionImpactDvYMs
        );
        if (!(vert > 0)) return 1;
        if (!(horiz > 0)) return 0;
        var dominance = vert / horiz;
        if (dominance <= 1) return 1;
        if (dominance >= VERTICAL_DOMINANCE_FULL) return 0;
        return 1 - (dominance - 1) / (VERTICAL_DOMINANCE_FULL - 1);
      }

      function currentImpact(pdofDeg) {
        if (activeImpact && activeImpact.pdofDeg === pdofDeg) {
          return { pdofDeg: pdofDeg, dvxMs: activeImpact.dvxMs,
            dvyMs: activeImpact.dvyMs, dvzMs: activeImpact.dvzMs };
        }
        return { pdofDeg: pdofDeg, dvxMs: sessionImpactDvXMs,
          dvyMs: sessionImpactDvYMs, dvzMs: sessionImpactDvZMs };
      }

      function occupantExposure(def, impact) {
        var x = impact.dvxMs || 0, y = impact.dvyMs || 0, z = impact.dvzMs || 0;
        var total = x * x + y * y + z * z;
        var verticalShare = total > 0 ? z * z / total : 0;
        var horizontal = seatPulseScaleRaw(def, impact.pdofDeg) / occupantPulseNormaliser(impact.pdofDeg);
        var position = seatPosition(def);

        var hMag = Math.hypot(x, y);
        var axisShare = function (c) {
          if (!(hMag > 0)) return 1;
          return Math.max(0, Math.min(1, (Math.abs(c) / hMag - 0.25) / 0.35));
        };
        var vertical = 1 + VERTICAL_SEAT_GAIN * (
          verticalTiltShare(x, z) * axisShare(x) * (-x * position.y >= 0 ? 1 : -1) +
          verticalTiltShare(y, z) * axisShare(y) * (y * position.x >= 0 ? 1 : -1));
        return {
          scalar: Math.max(0.55, Math.min(1.85,
            horizontal * (1 - verticalShare) + vertical * verticalShare)),
          verticalShare: verticalShare
        };
      }

      var sessionImpactPdofDeg = null;
      var sessionImpactDeltaVMs = 0;
      var sessionImpactPeakLatG = 0;
      var sessionImpactPeakLonG = 0;
      var sessionImpactDvXMs = 0;
      var sessionImpactDvYMs = 0;

      var sessionSideHit = null;
      var sessionImpactDvZMs = 0;

      var sessionFreeFlightSamples = 0;
      var FREE_FLIGHT_MIN_SAMPLES_MS = 90;

      function noteFreeFlight(trace) {
        if (trace && trace.freeFlightMs > 0) sessionFreeFlightSamples += trace.freeFlightMs;
      }

      var FLIGHT_CREDIT_MAX_AGO_S = 2.5;
      var lastCreditedFlightEndT = null;

      function noteFlightFromPayload(payload) {
        if (!payload) return;
        var flightS = Number(payload.flightBeforeS);
        var endT = Number(payload.flightEndT);
        var ago = Number(payload.flightEndedAgoS);
        if (!(flightS > 0) || !Number.isFinite(endT) || !(ago >= 0)) return;
        if (ago > FLIGHT_CREDIT_MAX_AGO_S) return;
        if (lastCreditedFlightEndT !== null && Math.abs(lastCreditedFlightEndT - endT) < 1e-6) return;
        lastCreditedFlightEndT = endT;
        sessionFreeFlightSamples += flightS * 1000;
      }

      function hasFallCredit() {
        return sessionFreeFlightSamples >= FREE_FLIGHT_MIN_SAMPLES_MS;
      }

      var fallCreditSpendPending = false;

      function spendFallCredit() {
        fallCreditSpendPending = true;
      }

      function settleFallCredit() {
        if (fallCreditSpendPending) sessionFreeFlightSamples = 0;
        fallCreditSpendPending = false;
      }

      var JOLT_WINDOW_S = 0.10;
      var JOLT_CAP_FACTOR = 2.0;
      var bufferRollingNow = false;
      function shortWindowDvMs(trace, windowS, upOnly) {
        if (!trace || !trace.ax || !trace.ax.length) return 0;
        var key = '__swdv' + windowS + (upOnly ? 'u' : '');
        if (typeof trace[key] === 'number') return trace[key];
        var n = trace.ax.length, rate = Number(trace.sampleRateHz) || 2000, dt = 1 / rate, g = 9.80665;
        var w = Math.max(1, Math.round(windowS * rate));
        var cx = new Float64Array(n + 1), cy = new Float64Array(n + 1), cz = new Float64Array(n + 1);
        for (var i = 0; i < n; i++) {
          cx[i + 1] = cx[i] + (upOnly ? 0 : (trace.ax[i] || 0)) * g * dt;
          cy[i + 1] = cy[i] + (upOnly ? 0 : (trace.ay[i] || 0)) * g * dt;
          cz[i + 1] = cz[i] + (upOnly ? Math.max(0, trace.az[i] || 0) : (trace.az[i] || 0)) * g * dt;
        }
        var best = 0;
        for (var j = 0; j + w <= n || j === 0; j++) {
          var e = Math.min(n, j + w);
          var m = Math.sqrt(Math.pow(cx[e] - cx[j], 2) + Math.pow(cy[e] - cy[j], 2) + Math.pow(cz[e] - cz[j], 2));
          if (m > best) best = m;
          if (e === n) break;
        }
        try { trace[key] = best; } catch (eK) {}
        return best;
      }

      var CONTACT_GAP_M = 0.30, CONTACT_HOLD_G = 0.7;
      function occupantContactSpeedMs(trace) {
        if (!trace || !trace.ax || !trace.ax.length) return 0;
        if (typeof trace.__vc === 'number') return trace.__vc;
        var n = trace.ax.length, dt = 1 / (Number(trace.sampleRateHz) || 2000), g = 9.80665;
        var vx = 0, vy = 0, px = 0, py = 0, vc = 0;
        for (var i = 0; i < n; i++) {
          var axs = (trace.ax[i] || 0) * g, ays = (trace.ay[i] || 0) * g;
          var am = Math.hypot(axs, ays);
          var k = am > CONTACT_HOLD_G * g ? (am - CONTACT_HOLD_G * g) / am : 0;
          vx -= axs * k * dt; vy -= ays * k * dt;
          px += vx * dt; py += vy * dt;
          if (Math.hypot(px, py) >= CONTACT_GAP_M) { vc = Math.hypot(vx, vy); break; }
        }
        try { trace.__vc = vc; } catch (eV) {}
        return vc;
      }
      function rawTracePdofDeg(trace) {
        var r = rawTracePdofDegMeasured(trace);
        if (!r || !(r.deltaVMs > 0)) return r;
        var horiz = Math.hypot(r.dvxMs || 0, r.dvyMs || 0), vert = Math.abs(r.dvzMs || 0);
        var hCap = horiz > 0 ? joltCapHoriz(trace, horiz) : horiz;
        var vCap = rollingCapVert(trace, vert);
        if (!(horiz > hCap) && !(vert > vCap)) return r;
        var k = horiz > 0 ? hCap / horiz : 1, kz = vert > 0 ? vCap / vert : 1;
        return Object.assign({}, r, {
          deltaVMs: Math.hypot(hCap, vCap), joltCapped: true,
          dvxMs: Number.isFinite(r.dvxMs) ? r.dvxMs * k : r.dvxMs,
          dvyMs: Number.isFinite(r.dvyMs) ? r.dvyMs * k : r.dvyMs,
          dvzMs: Number.isFinite(r.dvzMs) ? r.dvzMs * kz : r.dvzMs
        });
      }

      function rollingCapVert(trace, vert) {
        if (!bufferRollingNow || !(vert > 0)) return vert;
        var cap = shortWindowDvMs(trace, 0.08, false);
        var pk = tracePeakG(trace);
        if (pk < ROLLING_VERTICAL_MIN_PEAK_G) cap = Math.min(cap, pk * 9.80665 * 0.05);
        return Math.min(vert, cap);
      }

      function joltCapHoriz(trace, horiz) {
        var pkAll = tracePeakG(trace);
        var wHard = Math.max(0, Math.min(1, (pkAll - 10) / 10));
        var hCap = (occupantContactSpeedMs(trace) / 0.8 + 1.0) * (1 - wHard) + horiz * wHard;

        if (bufferRollingNow && pkAll < ROLLING_VERTICAL_MIN_PEAK_G) hCap = Math.min(hCap, pkAll * 9.80665 * 0.05);
        return Math.min(horiz, hCap);
      }
      function capDeltaV(trace, dv) {
        if (!dv) return dv;
        var h = Math.hypot(dv.dvxMs || 0, dv.dvyMs || 0);
        if (!(h > 0)) return dv;
        var hc = joltCapHoriz(trace, h);
        if (!(h > hc)) return dv;
        var k = hc / h, out = Object.assign({}, dv);
        if (Number.isFinite(dv.dvxMs)) out.dvxMs = dv.dvxMs * k;
        if (Number.isFinite(dv.dvyMs)) out.dvyMs = dv.dvyMs * k;
        if (Number.isFinite(dv.magnitudeMs)) out.magnitudeMs = dv.magnitudeMs * k;
        if (Number.isFinite(dv.magnitudeWithVerticalMs)) out.magnitudeWithVerticalMs = Math.hypot(hc, dv.dvzMs || 0);
        return out;
      }
      function rawTracePdofDegMeasured(trace) {
        var P = window.CrashInjuryProPipeline;
        if (!trace || !trace.ax || !trace.ax.length) return null;

        if (P && typeof P.segmentEvents === 'function' && typeof P.pdof === 'function') {
          try {
            var res = P.resultant(trace.ax, trace.ay, trace.az);
            var filtered = P.cfcLowpass(res, trace.sampleRateHz, P.CFC.CFC_180).signal;
            var events = P.segmentEvents(trace.t, trace.sampleRateHz, filtered);
            var best = null;
            var bestDv = -Infinity;
            for (var e = 0; e < events.length; e++) {
              var dvE = P.deltaVForEvent(trace, events[e]);
              var dv = Number.isFinite(dvE.magnitudeWithVerticalMs) ? dvE.magnitudeWithVerticalMs : dvE.magnitudeMs;
              if (dv > bestDv) { bestDv = dv; best = events[e]; }
            }
            if (best) {
              var dv3 = P.deltaVForEvent(trace, best);
              return {
                pdofDeg: P.pdof(trace, best).pdofDeg,
                deltaVMs: bestDv,
                dvxMs: dv3.dvxMs, dvyMs: dv3.dvyMs, dvzMs: dv3.dvzMs
              };
            }
          } catch (err) {}
        }
        var sumX = 0;
        var sumY = 0;
        for (var i = 0; i < trace.ax.length; i++) {
          sumX += trace.ax[i];
          sumY += trace.ay[i];
        }
        if (sumX === 0 && sumY === 0) return null;
        var bearing = Math.atan2(-sumY, sumX) * 180 / Math.PI;
        return { pdofDeg: ((bearing + 180) % 360 + 360) % 360, deltaVMs: 0 };
      }

      var OWN_IMPACT_MIN_DV_MS = 4.5;
      var activeImpact = null;

      function measuredIsLaunch(measured) {
        if (!measured || !Number.isFinite(payloadPreImpactVz) || !(-payloadPreImpactVz < FALLING_MIN_MS)) return false;
        var mz = measured.dvzMs || 0, mh = Math.hypot(measured.dvxMs || 0, measured.dvyMs || 0);
        return mz * mz > 1.5 * mh * mh;
      }

      var bufferIsLaunch = false;
      function traceWithoutVertical(trace) {
        var n = trace.t.length, az = new Float64Array(n);
        return Object.assign({}, trace, { az: az });
      }

      function correctPdofByCrush(measured) {
        if (!measured || !Number.isFinite(measured.pdofDeg) || !bufferCrush) return measured;
        var pd = ((measured.pdofDeg % 360) + 360) % 360;
        var frontHalf = pd <= 70 || pd >= 290, rearHalf = pd >= 110 && pd <= 250;
        var L, R;
        if (frontHalf) { L = bufferCrush.FL || 0; R = bufferCrush.FR || 0; }
        else if (rearHalf) { L = bufferCrush.RL || 0; R = bufferCrush.RR || 0; }
        else return measured;
        var hi = Math.max(L, R), lo = Math.min(L, R);
        if (!(hi >= 0.25) || lo > 0.35 * hi) return measured;
        var crushRight = R > L;
        var saysRight = pd > 0 && pd < 180;
        if (saysRight === crushRight || pd === 0 || pd === 180) return measured;
        return Object.assign({}, measured, { pdofDeg: (360 - pd) % 360,
          dvyMs: Number.isFinite(measured.dvyMs) ? -measured.dvyMs : measured.dvyMs, crushCorrected: true });
      }

      function tracePdofDeg(trace) {
        var measured = correctPdofByCrush(rawTracePdofDeg(trace));
        activeImpact = null;
        if (measured && measured.deltaVMs >= OWN_IMPACT_MIN_DV_MS && Number.isFinite(measured.pdofDeg)) {
          activeImpact = {
            pdofDeg: measured.pdofDeg, deltaVMs: measured.deltaVMs,
            dvxMs: Number.isFinite(measured.dvxMs) ? measured.dvxMs : 0,
            dvyMs: Number.isFinite(measured.dvyMs) ? measured.dvyMs : 0,
            dvzMs: Number.isFinite(measured.dvzMs) ? measured.dvzMs : 0
          };
        }

        var launch = bufferIsLaunch || measuredIsLaunch(measured);
        if (launch) activeImpact = null;
        if (measured && !launch && measured.deltaVMs >= sessionImpactDeltaVMs) {
          sessionImpactDeltaVMs = measured.deltaVMs;
          sessionImpactPdofDeg = measured.pdofDeg;

          if (trace) {
            sessionImpactPeakLatG = Number.isFinite(trace.peakLateralG) ? trace.peakLateralG : 0;
            sessionImpactPeakLonG = Number.isFinite(trace.peakLongitudinalG) ? trace.peakLongitudinalG : 0;
          }
          sessionImpactDvXMs = Number.isFinite(measured.dvxMs) ? measured.dvxMs : 0;
          sessionImpactDvYMs = Number.isFinite(measured.dvyMs) ? measured.dvyMs : 0;
          sessionImpactDvZMs = Number.isFinite(measured.dvzMs) ? measured.dvzMs : 0;
        }
        if (measured && !launch && Number.isFinite(measured.pdofDeg) && Number.isFinite(measured.dvyMs)) {
          var sdy = Math.abs(measured.dvyMs), sdx = Math.abs(measured.dvxMs || 0);
          var spk = trace && Number.isFinite(trace.peakLateralG) ? Math.abs(trace.peakLateralG) : 0;
          if (sdy >= SECOND_HIT_MIN_MS && sdy >= sdx && spk >= SECOND_HIT_MIN_G * 0.8 &&
              (!sessionSideHit || sdy > Math.abs(sessionSideHit.dvyMs))) {
            sessionSideHit = { pdofDeg: measured.pdofDeg, dvyMs: measured.dvyMs, peakLatG: spk };
          }
        }
        if (activeImpact) return activeImpact.pdofDeg;
        if (Number.isFinite(sessionImpactPdofDeg)) return sessionImpactPdofDeg;
        return measured ? measured.pdofDeg : null;
      }

      var CRUSH_ZONE_KEYS = ['FL', 'FR', 'RL', 'RR', 'SFL', 'SFR', 'SRL', 'SRR', 'ROOFL', 'ROOFR', 'GHL', 'GHR', 'ROOFRL', 'ROOFRR', 'TPL', 'TPR'];
      var CRUSH_PAYLOAD_FIELDS = {
        FL: 'crushFrontLeftM', FR: 'crushFrontRightM',
        RL: 'crushRearLeftM', RR: 'crushRearRightM',
        SFL: 'crushSideFrontLeftM', SFR: 'crushSideFrontRightM',
        SRL: 'crushSideRearLeftM', SRR: 'crushSideRearRightM',
        ROOFL: 'crushRoofLeftM', ROOFR: 'crushRoofRightM',
        GHL: 'crushGreenhouseLeftM', GHR: 'crushGreenhouseRightM',

        ROOFRL: 'crushRoofRearLeftM', ROOFRR: 'crushRoofRearRightM',

        TPL: 'crushFootwellLeftM', TPR: 'crushFootwellRightM'
      };
      var CRUSH_END_NOISE_M = 0.05;
      var CRUSH_END_FULL_M = 0.25;
      var CRUSH_SIDE_NOISE_M = 0.04;
      var CRUSH_SIDE_FULL_M = 0.18;

      var CRUSH_OFFSET_GAIN = 0.28;
      var CRUSH_OFFSET_OTHER_ROW = 0.45;
      var CRUSH_SIDE_ROW_GAIN = 0.60;
      var CRUSH_SIDE_OVERRIDE = 0.45;
      var CRUSH_NEAR_SIDE_MIN = 0.35;
      var CRUSH_END_ON_DIRX = 0.5;
      var CRUSH_FOOTWELL_M = 0.30;
      var CRUSH_FOOTWELL_MIN_DELTAV_MS = 13;

      var sessionCrush = null;

      var zoneHitCrush = {}, zoneHitG = {}, zoneHitInc = {};

      var bufferCrush = null;
      var lastCrushSeen = null;
      var CRUSH_FLAP_ZONES = { FL: 1, FR: 1, RL: 1, RR: 1, GHL: 1, GHR: 1, TPL: 1, TPR: 1 };

      var CRUSH_SOFT_FLAP_ZONES = { SFL: 1, SFR: 1, SRL: 1, SRR: 1, ROOFL: 1, ROOFR: 1, ROOFRL: 1, ROOFRR: 1 };
      var CRUSH_GROWTH_PER_G_M = 0.025;
      var crushFlapRaw = {};

      var GH_CONFIRM_ZONES = { GHL: 1, GHR: 1 };

      var CRUSH_HARD_BUFFER_G = 15;

      var CRUSH_QUIET_TAIL_MS = 700;
      var CRUSH_QUIET_MAX_GROWTH_M = 0.02;
      var lastHardBufferMs = -Infinity;
      function payloadPeakG(payload) {
        if (Number.isFinite(payload.peakResultantG)) return payload.peakResultantG;
        var gx = payload.gx || [], gy = payload.gy || [], gz = payload.gz || [], pk = 0;
        for (var i = 0; i < gx.length; i++) {
          var r = Math.hypot(gx[i] || 0, gy[i] || 0, (gz[i] || 1) - 1);
          if (r > pk) pk = r;
        }
        return pk;
      }
      var ROOF_ZONES = { ROOFL: true, ROOFR: true, ROOFRL: true, ROOFRR: true };
      var OBJECT_HIT_MIN_G = 15;
      var ROOF_HELD_MIN_M = 0.12;
      function noteCrush(payload, trace) {
        bufferCrush = null;
        if (!payload || !payload.crushTrackingAvailable) return;
        var nowMs = Date.now();
        var hardBuffer = payloadPeakG(payload) >= CRUSH_HARD_BUFFER_G;
        if (hardBuffer) lastHardBufferMs = nowMs;
        var quietLimit = !hardBuffer && nowMs - lastHardBufferMs > CRUSH_QUIET_TAIL_MS;
        if (!sessionCrush) {
          sessionCrush = {};
          CRUSH_ZONE_KEYS.forEach(function (z) { sessionCrush[z] = 0; });
        }
        if (typeof payload.crushRoofRearLeftM === 'number') sessionCrush.hasRearRoof = true;
        bufferCrush = {};
        var ghNow = Math.max(Number(payload.crushGreenhouseLeftM) || 0, Number(payload.crushGreenhouseRightM) || 0);
        var roofEvidence = (Number(payload.rolloverQuarterTurns) || 0) >= 1 || (sessionRolloverQuarterTurns || 0) >= 1 ||
          (Number.isFinite(Number(payload.impactUpZ)) && payload.impactUpZ !== null && Number(payload.impactUpZ) < 0.5) ||
          (Number.isFinite(Number(payload.rolloverWorstUpZ)) && payload.rolloverWorstUpZ !== null && Number(payload.rolloverWorstUpZ) < 0.5) ||
          sessionRoofDvMs > 2 || (sessionRoofwardDvMs || 0) > 0 || ghNow >= 0.15 || payloadPeakG(payload) >= OBJECT_HIT_MIN_G;
        var hitPkForCrush = payloadPeakG(payload);
        var hitDvForCrush = 0;
        try { var mC = trace ? rawTracePdofDeg(trace) : null; hitDvForCrush = mC ? (mC.deltaVMs || 0) : 0; } catch (eC) { hitDvForCrush = 0; }
        CRUSH_ZONE_KEYS.forEach(function (z) {
          var v = Number(payload[CRUSH_PAYLOAD_FIELDS[z]]);
          if (!Number.isFinite(v)) v = 0;
          var before = lastCrushSeen && Number.isFinite(lastCrushSeen[z]) ? lastCrushSeen[z] : 0;
          var flapped = false;

          if (CRUSH_FLAP_ZONES[z] || CRUSH_SOFT_FLAP_ZONES[z]) {
            var hadFlap = crushFlapRaw[z] != null;
            var acc = hadFlap ? sessionCrush[z] : Math.max(before, sessionCrush[z]);

            var perG = GH_CONFIRM_ZONES[z] ? 0.015 : CRUSH_GROWTH_PER_G_M;

            var allow = Math.max(hitPkForCrush >= 6 ? perG * hitPkForCrush : 0.03, 0.06 * hitDvForCrush);

            var rolledNow = (Number(payload.rolloverQuarterTurns) || 0) >= 1 || (sessionRolloverQuarterTurns || 0) >= 1;
            if (ROOF_ZONES[z] && roofEvidence && (hitPkForCrush >= 6 || rolledNow)) allow = Math.max(allow * 1.5, rolledNow ? 0.35 : 0.10);
            var stillThere = hadFlap && v >= crushFlapRaw[z] - 0.08;
            if (stillThere || v - acc > Math.max(0.10, allow)) {
              if (!stillThere || v > crushFlapRaw[z]) crushFlapRaw[z] = v;
              flapped = true;
            }
          }

          if (GH_CONFIRM_ZONES[z]) v = Math.min(v, before);

          var heldRoof = ROOF_ZONES[z] && v >= ROOF_HELD_MIN_M && before >= v - 0.05;
          if (ROOF_ZONES[z] && !roofEvidence && !heldRoof) v = Math.min(v, Math.max(before, sessionCrush[z]) + 0.03);
          var rollingRoof = ROOF_ZONES[z] && roofEvidence && ((Number(payload.rolloverQuarterTurns) || 0) >= 1 || (sessionRolloverQuarterTurns || 0) >= 1);
          if (quietLimit && !rollingRoof && !heldRoof) v = Math.min(v, Math.max(before, sessionCrush[z]) + CRUSH_QUIET_MAX_GROWTH_M);
          if (flapped) v = Math.min(v, sessionCrush[z]);
          bufferCrush[z] = Math.max(0, v - before);
          var held = ROOF_ZONES[z] ? Math.min(v, before) : v;
          if (held > sessionCrush[z]) sessionCrush[z] = held;
        });

        lastCrushSeen = {};
        CRUSH_ZONE_KEYS.forEach(function (z) {
          var v = Number(payload[CRUSH_PAYLOAD_FIELDS[z]]);
          lastCrushSeen[z] = Number.isFinite(v) ? v : 0;
        });
      }

      var crushForSessionScoring = false;
      function activeCrush() {
        if (!crushForSessionScoring && activeImpact && bufferCrush) return bufferCrush;
        return sessionCrush;
      }

      var STRUCK_END_CONE_DEG = 65;
      var STRUCK_END_MIN_DV_MS = 4.5;
      var struckEndCrush = null;
      var lastStruckEnd = null;

      function noteStruckEnds(trace) {
        if (!bufferCrush) return;
        if (!struckEndCrush) struckEndCrush = { FL: 0, FR: 0, RL: 0, RR: 0 };
        var m = rawTracePdofDeg(trace);
        var end = null;
        if (m && m.deltaVMs >= STRUCK_END_MIN_DV_MS && Number.isFinite(m.pdofDeg)) {
          var offFront = Math.abs(((m.pdofDeg % 360) + 540) % 360 - 180);
          end = offFront <= STRUCK_END_CONE_DEG ? 'front' : (180 - offFront <= STRUCK_END_CONE_DEG ? 'rear' : 'side');
          lastStruckEnd = end;
        } else {
          end = lastStruckEnd;
        }
        if (end === 'front') {
          struckEndCrush.FL += bufferCrush.FL || 0;
          struckEndCrush.FR += bufferCrush.FR || 0;
        } else if (end === 'rear') {
          struckEndCrush.RL += bufferCrush.RL || 0;
          struckEndCrush.RR += bufferCrush.RR || 0;
        }
      }

      function struckEnd(zone) {
        if (!struckEndCrush || !sessionCrush) return 0;
        return Math.min(sessionCrush[zone] || 0, struckEndCrush[zone] || 0);
      }

      function crushBias(a, b, noise, full) {
        a = a > 0 ? a : 0;
        b = b > 0 ? b : 0;
        var hi = Math.max(a, b);
        if (!(hi > noise)) return 0;
        var conf = Math.min(1, (hi - noise) / (full - noise));
        return (b - a) / (a + b) * conf;
      }

      function crushAsymmetry() {
        var c = activeCrush();
        if (!c) return { available: false, front: 0, rear: 0, side: 0, sideRow: 0 };
        var sideL = Math.max(c.SFL, c.SRL);
        var sideR = Math.max(c.SFR, c.SRR);
        var side = crushBias(sideL, sideR, CRUSH_SIDE_NOISE_M, CRUSH_SIDE_FULL_M);
        var sf = side >= 0 ? c.SFR : c.SFL;
        var sr = side >= 0 ? c.SRR : c.SRL;

        var dvMph = (sessionVehicleDeltaVMs || 0) / 0.44704;
        function endRelevance(a, b) {
          var expected = 0.011 * dvMph;
          if (!(expected > 0.2)) return 1;
          var r = Math.max(0, Math.min(1, Math.max(a || 0, b || 0) / (0.6 * expected)));
          return r * r;
        }
        return {
          available: true,
          front: crushBias(c.FL, c.FR, CRUSH_END_NOISE_M, CRUSH_END_FULL_M) * endRelevance(c.FL, c.FR),
          rear: crushBias(c.RL, c.RR, CRUSH_END_NOISE_M, CRUSH_END_FULL_M) * endRelevance(c.RL, c.RR),
          side: side,
          sideRow: crushBias(sr, sf, CRUSH_SIDE_NOISE_M, CRUSH_SIDE_FULL_M)
        };
      }

      function seatPhysicalSide(def) {
        return def && def.side === 'right' ? 1 : -1;
      }

      function struckLateralSign(dir) {
        if (!dir) return 0;
        var crush = crushAsymmetry();
        var endOffset = dir.y >= 0 ? crush.front : crush.rear;
        if (Math.abs(dir.x) < CRUSH_END_ON_DIRX && Math.abs(endOffset) >= CRUSH_NEAR_SIDE_MIN) {
          return endOffset > 0 ? 1 : -1;
        }
        if (Math.abs(crush.side) >= CRUSH_SIDE_OVERRIDE) return crush.side > 0 ? 1 : -1;
        if (Math.abs(dir.x) <= SEAT_LATERAL_NOISE_FLOOR) return 0;
        return dir.x > 0 ? 1 : -1;
      }

      var CRUSH_PROXY_MAX = 0.6;
      var CRUSH_PROXY_FULL_DIRX = 0.5;

      function endOffsetFor(dir) {
        if (!dir) return 0;
        var crush = crushAsymmetry();
        if (crush.available) return dir.y >= 0 ? crush.front : crush.rear;
        var m = Math.abs(dir.x);
        if (m <= SEAT_LATERAL_NOISE_FLOOR) return 0;
        return (dir.x > 0 ? 1 : -1) * CRUSH_PROXY_MAX * Math.min(1, m / CRUSH_PROXY_FULL_DIRX);
      }

      var DRIVER_PENALTY_FADE_OFFSET = 0.35;

      function driverPenaltyShare(dir) {
        var off = endOffsetFor(dir);
        if (!(off > 0)) return 1;
        return Math.max(0, 1 - off / DRIVER_PENALTY_FADE_OFFSET);
      }

      function seatCornerExposure(def, impactSide) {
        if (!def) return 0;
        var crush = crushAsymmetry();
        var endOffset = impactSide === 'rear' ? crush.rear : crush.front;
        if (Math.abs(endOffset) < CRUSH_NEAR_SIDE_MIN) return 0;
        return seatPhysicalSide(def) * endOffset > 0 ? 1 : -1;
      }

      function seatCornerCrushM(def, impactSide) {
        var c = activeCrush();
        if (!c || !def) return 0;
        var right = def.side === 'right';
        if (impactSide === 'rear') return right ? c.RR : c.RL;
        return right ? c.FR : c.FL;
      }

      function crushSummary() {
        if (!sessionCrush) return 'n/a';
        var c = sessionCrush;
        var a = crushAsymmetry();
        var f = function (x) { return (x || 0).toFixed(2); };
        var s = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(2); };
        return 'F' + f(c.FL) + '/' + f(c.FR) + ' R' + f(c.RL) + '/' + f(c.RR) +
          ' sideF' + f(c.SFL) + '/' + f(c.SFR) + ' sideR' + f(c.SRL) + '/' + f(c.SRR) +
          ' roof' + f(c.ROOFL) + '/' + f(c.ROOFR) +
          (c.hasRearRoof ? ' roofRear' + f(c.ROOFRL) + '/' + f(c.ROOFRR) : '') +
          ' pillars' + f(c.GHL) + '/' + f(c.GHR) +
          (activeImpact ? ' [own impact pdof ' + activeImpact.pdofDeg.toFixed(0) + ' dV ' + (activeImpact.deltaVMs / 0.44704).toFixed(1) + 'mph]' : ' [aftermath]') +
          ' bias F' + s(a.front) + ' R' + s(a.rear) + ' S' + s(a.side) + ' row' + s(a.sideRow);
      }

      function crushImpactText() {
        if (!sessionCrush) return '';
        var c = sessionCrush;
        var parts = [];

        var f = function (x) { return (x || 0).toFixed(2).replace(/^0/, ''); };
        if (c.FL > CRUSH_END_NOISE_M || c.FR > CRUSH_END_NOISE_M) parts.push('F' + f(c.FL) + '/' + f(c.FR));
        if (c.RL > CRUSH_END_NOISE_M || c.RR > CRUSH_END_NOISE_M) parts.push('R' + f(c.RL) + '/' + f(c.RR));
        var sl = Math.max(c.SFL, c.SRL), sr = Math.max(c.SFR, c.SRR);
        if (sl > CRUSH_SIDE_NOISE_M || sr > CRUSH_SIDE_NOISE_M) parts.push('S' + f(sl) + '/' + f(sr));
        if (c.ROOFL > CRUSH_SIDE_NOISE_M || c.ROOFR > CRUSH_SIDE_NOISE_M) parts.push('roof' + f(c.ROOFL) + '/' + f(c.ROOFR));
        if ((c.GHL || 0) > CRUSH_SIDE_NOISE_M || (c.GHR || 0) > CRUSH_SIDE_NOISE_M) parts.push('pillars' + f(c.GHL) + '/' + f(c.GHR));
        return parts.length ? 'crush ' + parts.join(' ') : 'crush 0';
      }

      function seatPulseScaleRaw(def, pdofDeg, options) {
        var dir = impactDirection(pdofDeg);
        if (!dir) return 1;
        var seat = seatPosition(def);

        var latEnergy = dir.x * dir.x;
        var lonEnergy = dir.y * dir.y;
        var totalEnergy = latEnergy + lonEnergy;
        if (!(totalEnergy > 0)) return 1;
        latEnergy /= totalEnergy;
        lonEnergy /= totalEnergy;

        var struckSign = struckLateralSign(dir);
        var lateralNear = seat.x * (struckSign || dir.x) >= 0 ? 1 : -1;
        var longitudinalNear = seat.y * dir.y >= 0 ? 1 : -1;
        var crush = crushAsymmetry();

        var longitudinalGain = dir.y >= 0
          ? SEAT_LONGITUDINAL_GAIN_FRONTAL
          : SEAT_LONGITUDINAL_GAIN_REAR;

        var sideRowTerm = 1;
        if (lateralNear > 0 && crush.sideRow && struckSign && struckSign * crush.side > 0) {
          sideRowTerm = 1 + CRUSH_SIDE_ROW_GAIN * crush.sideRow * (def.row === 'front' ? 1 : -1);
        }
        var lateralTerm = 1 + SEAT_LATERAL_GAIN * lateralOffsetShare(dir.x) * lateralNear *
          (lateralNear > 0 ? sideRowTerm : 1);
        var longitudinalTerm = 1 + longitudinalGain * longitudinalNear;

        var endOffset = endOffsetFor(dir);
        var struckRow = dir.y >= 0 ? 'front' : 'rear';
        var offsetTerm = 1 + CRUSH_OFFSET_GAIN * endOffset * seatPhysicalSide(def) *
          (def.row === struckRow ? 1 : CRUSH_OFFSET_OTHER_ROW);
        var scale = lonEnergy * longitudinalTerm * offsetTerm + latEnergy * lateralTerm;

        if (!options || !options.excludeDriverPenalty) {
          if (def.key === 'driver') {
            var offAxisDeg = Math.abs(((pdofDeg + 180) % 360 + 360) % 360 - 180);
            if (offAxisDeg <= DRIVER_FRONTAL_PENALTY_MAX_DEG) {
              scale *= 1 + (DRIVER_FRONTAL_PENALTY - 1) * driverPenaltyShare(dir);
            }
          }
        }
        return scale;
      }

      var VERTICAL_TILT_NOISE = 0.06;
      var VERTICAL_TILT_FULL = 0.45;
      var VERTICAL_SEAT_GAIN = 0.45;

      function verticalTiltShare(horizontalMs, verticalMs) {
        var v = Math.abs(verticalMs);
        if (!(v > 0)) return 0;
        var ratio = Math.abs(horizontalMs) / v;
        if (ratio <= VERTICAL_TILT_NOISE) return 0;
        if (ratio >= VERTICAL_TILT_FULL) return 1;
        return (ratio - VERTICAL_TILT_NOISE) / (VERTICAL_TILT_FULL - VERTICAL_TILT_NOISE);
      }

      function seatTraceFor(trace, def, pdofDeg) {
        var exposure = occupantExposure(def, currentImpact(pdofDeg));
        var scale = exposure.scalar;
        if (Math.abs(scale - 1) < 0.000001) return trace;
        var n = trace.t.length;
        var ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
        for (var i = 0; i < n; i++) {
          ax[i] = trace.ax[i] * scale;
          ay[i] = trace.ay[i] * scale;
          az[i] = trace.az[i] * scale;
        }
        return { sampleRateHz: trace.sampleRateHz, t: trace.t, ax: ax, ay: ay, az: az };
      }

      function seatIntrusionFor(intrusion, def, pdofDeg) {
        if (!intrusion || !intrusion.available) return intrusion;

        var doorApplies = seatIsNearSide(def, pdofDeg);

        var dashApplies = def.row === 'front';
        return {
          available: true,
          roofDepthM: intrusion.roofDepthM,
          roofVelocityMs: intrusion.roofVelocityMs,
          doorDepthM: doorApplies ? intrusion.doorDepthM : 0,
          doorVelocityMs: doorApplies ? intrusion.doorVelocityMs : 0,
          dashDepthM: dashApplies ? intrusion.dashDepthM : 0,
          dashVelocityMs: dashApplies ? intrusion.dashVelocityMs : 0
        };
      }

      function effectiveRolloverSide() {
        var c = sessionCrush;
        if (c) {
          var leftM = Math.max(c.SFL || 0, c.SRL || 0) + 0.7 * (c.ROOFL || 0);
          var rightM = Math.max(c.SFR || 0, c.SRR || 0) + 0.7 * (c.ROOFR || 0);
          var bias = crushBias(leftM, rightM, CRUSH_SIDE_NOISE_M, CRUSH_SIDE_FULL_M);
          if (Math.abs(bias) >= CRUSH_SIDE_OVERRIDE) return bias > 0 ? 1 : -1;
        }
        return sessionRolloverSideContact;
      }

      function rolloverSideContactForSeat(def) {
        var sideNow = effectiveRolloverSide();
        if (sideNow === 0) return 0;
        var struckSide = sideNow === -1 ? 'left' : 'right';
        if (!SEAT_SIDE_MATCHES_IMPACT_SIDE) struckSide = struckSide === 'left' ? 'right' : 'left';
        return def.side === struckSide ? sideNow : 0;
      }

      var STRUCTURAL_LIMIT_MPH = {
        beltedAirbag: { intact: 32, gone: 78 },
        beltedOnly: { intact: 32, gone: 76 },

        unbelted: { intact: 25, gone: 58 },

        rearIntact: { intact: 33, gone: 80 },

        harness: { intact: 44, gone: 90 }
      };

      var STRUCTURAL_DEATH_FLOOR_PERCENT = 12;

      function structuralSurvivalCeilingPercent(deltaVMs, tier) {
        var limits = STRUCTURAL_LIMIT_MPH[tier] || STRUCTURAL_LIMIT_MPH.beltedAirbag;
        if (!(deltaVMs > 0)) return 100;
        var mph = deltaVMs / 0.44704;
        if (mph <= limits.intact) return 100;
        var t = (mph - limits.intact) / (limits.gone - limits.intact);
        if (t >= 1) return 0;
        var ceiling = Math.max(0, Math.round(100 * (1 - t * t)));
        return ceiling < STRUCTURAL_DEATH_FLOOR_PERCENT ? 0 : ceiling;
      }

      function worstDeltaVMs(eventMetaList) {
        var worst = 0;
        (eventMetaList || []).forEach(function (m) {
          if (m && m.deltaVMs > worst) worst = m.deltaVMs;
        });
        return worst;
      }

      function structuralCeilingTier(seat, tier) {
        if (tier === 'harness') return tier;
        if (seat && seat.row === 'rear' && tier !== 'unbelted' && rearSurvivalSpaceIntact(seat)) return 'rearIntact';
        if (seat && seat.row === 'rear' && tier === 'beltedOnly') return 'beltedAirbag';
        return tier;
      }

      function frontSeatAheadCrushed(seat) {
        if (!seat || seat.row !== 'rear') return false;
        var ahead = { row: 'front', side: seat.side, key: seat.side === 'right' ? 'frontRight' : 'driver' };
        var info = seatSpaceDestroyedInfo(ahead, null);
        return !!info && info.kind === 'footwell';
      }

      function rearSurvivalSpaceIntact(seat) {
        if (frontSeatAheadCrushed(seat)) return false;
        var pdof = Number.isFinite(sessionImpactPdofDeg) ? sessionImpactPdofDeg : 0;
        var offRear = Math.abs(((pdof - 180) % 360 + 540) % 360 - 180);
        if (offRear < 45) return false;
        var c = sessionCrush;
        if (!c) return true;
        var right = seat.side === 'right';
        var intrusion = Math.max(
          (right ? c.RR : c.RL) - 0.60,
          (right ? c.SRR : c.SRL) - 0.12,
          Math.max(c.FL, c.FR) - 1.70,
          rowRoofCrush(c, true, right) - 0.10);
        return intrusion < 0.20;
      }

      var CEILING_WEIGHT_MIN = 0.35;
      var CEILING_WEIGHT_FULL_ISS = 25;

      function occupantCeilingFactor(ceilingPercent, iss) {
        if (!(ceilingPercent < 100)) return 1;
        if (!(ceilingPercent > 0)) return 0;
        var loss = 1 - ceilingPercent / 100;
        var byIss = CEILING_WEIGHT_MIN + (1 - CEILING_WEIGHT_MIN) *
          Math.max(0, Math.min(1, ((iss || 0) - 4) / (CEILING_WEIGHT_FULL_ISS - 4)));
        var weight = byIss + (1 - byIss) * loss * loss;
        return 1 - loss * weight;
      }

      var SIDE_LIMIT_MPH = {
        near: { intact: 16, gone: 50 },
        far: { intact: 30, gone: 72 }
      };

      var SIDE_PULSE_EFFECTIVE_S = 0.09;
      function plausibleLateralMs() {
        var lat = Math.abs(sessionImpactDvYMs || 0);
        var pk = Math.abs(sessionImpactPeakLatG || 0);
        if (!(pk > 0)) return lat;
        return Math.min(lat, pk * 9.81 * SIDE_PULSE_EFFECTIVE_S + 4);
      }
      function sideCeilingPercent(seat, occupant) {
        var latMph = plausibleLateralMs() / 0.44704;
        if (!(latMph > 0) || !seat) return 100;
        var pdof = Number.isFinite(sessionImpactPdofDeg) ? sessionImpactPdofDeg : 0;
        var near = seatIsNearSide(seat, pdof);
        var lim = near ? SIDE_LIMIT_MPH.near : SIDE_LIMIT_MPH.far;

        var shift = occupant && occupant.belted === false ? (near ? 6 : 12) : 0;

        if (near && seat.row === 'rear') shift += 4;

        if (near && (vehicleHasRollCage() || sessionRollCagePresent)) shift -= 8;

        if (near && sessionCrush) {
          var door = seat.row === 'front' ? (seat.side === 'right' ? sessionCrush.SFR : sessionCrush.SFL)
            : (seat.side === 'right' ? sessionCrush.SRR : sessionCrush.SRL);
          if (seat.row === 'rear') door = Math.max(door || 0, 0.7 * ((seat.side === 'right' ? sessionCrush.RR : sessionCrush.RL) || 0));
          shift -= 12 * (1 - Math.max(0, Math.min(1, (door || 0) / 0.35)));
        }
        var intact = lim.intact - shift, gone = lim.gone - shift;
        if (latMph <= intact) return 100;
        var t = (latMph - intact) / (gone - intact);
        if (t >= 1) return 0;
        var c = Math.max(0, Math.round(100 * (1 - t * t)));
        return c < STRUCTURAL_DEATH_FLOOR_PERCENT ? 0 : c;
      }

      var VERTICAL_LIMIT_MS = { intact: 10, gone: 24 };
      var ROOFWARD_LIMIT_MS = { intact: 7, gone: 18 };
      var ROOFWARD_CAGE_LIMIT_MS = { intact: 12, gone: 28 };
      var VERTICAL_IMPACT_MIN_PEAK_G = 20;

      var BIG_DROP_MIN_DV_MS = 13;
      var LONG_FALL_MS = 800;
      var LONG_FALL_MIN_PEAK_G = 15;
      var BIG_DROP_MIN_PEAK_G = 10;
      var sessionVerticalImpactDvMs = 0;
      var sessionVerticalRoofward = false;
      var sessionFloorDvMs = 0;
      var sessionRoofDvMs = 0;

      var payloadImpactUpZ = null;

      var payloadPreImpactVz = null;
      var payloadPostImpactVz = null;

      function landingStoppedMs(fallMs, zAbs) {
        var stopped = fallMs;
        if (Number.isFinite(payloadPostImpactVz)) stopped = Math.min(stopped, fallMs - Math.max(0, -payloadPostImpactVz));
        if (Number.isFinite(zAbs)) stopped = Math.min(stopped, zAbs + 2);
        return Math.max(0, stopped);
      }

      function landingCushion(peakG) {
        if (!(peakG > 0)) return 1;
        return Math.max(0.12, Math.min(1, (peakG - 6) / 14));
      }

      var DRI_OMEGA = 52.9, DRI_ZETA = 0.224;
      function traceDRI(trace) {
        if (!trace || !trace.az || !trace.az.length) return null;
        if (typeof trace.__dri === 'number') return trace.__dri;
        var rate = Number(trace.sampleRateHz) || 2000;
        var dt = 1 / rate, sub = Math.max(1, Math.ceil(dt / 0.00025)), h = dt / sub;
        var w = DRI_OMEGA, c = 2 * DRI_ZETA * w, k = w * w;
        var x = 0, v = 0, mx = 0, xn = 0, vn = 0, mxn = 0;
        for (var i = 0; i < trace.az.length; i++) {
          var a = (trace.az[i] || 0) * 9.80665;
          for (var j = 0; j < sub; j++) {
            v += (a - c * v - k * x) * h;
            x += v * h;
            if (x > mx) mx = x;
            vn += (-a - c * vn - k * xn) * h;
            xn += vn * h;
            if (xn > mxn) mxn = xn;
          }
        }
        var dri = k * Math.max(mx, mxn) / 9.80665;
        try { trace.__dri = dri; } catch (e) {}
        return dri;
      }
      function landingCushionFor(trace, peakG) {
        var byPeak = landingCushion(peakG);
        var dri = traceDRI(trace);
        if (!(dri >= 0)) return byPeak;
        return Math.min(byPeak, Math.max(0.1, Math.min(1, (dri - 12) / 10)));
      }
      var FALLING_MIN_MS = 4;
      var FREE_FALL_MAX_G = 1.5;
      var FREE_FALL_MIN_SHARE = 0.6;
      var FREE_FALL_MAX_GZ = 0.35;
      var FREE_FALL_MAX_GAP_S = 8;
      var FREE_FALL_MAX_MS = 50;

      function meanAbsGz(payload) {
        var gz = payload.gz || [];
        if (!gz.length) return 1;
        var sum = 0;
        for (var i = 0; i < gz.length; i++) sum += Math.abs(Number(gz[i]) || 0);
        return sum / gz.length;
      }

      function bigFallCushion(fallMs) {
        return Math.max(0, Math.min(1, (fallMs - 5) / 10));
      }

      var fallTrack = { lastDv: null, buffers: 0, speed: 0, pending: 0, pendingLeft: 0, atMs: 0 };
      function noteFreeFall(payload) {
        var dv = Number(payload.trueDvMaxMs);
        var dur = payload.sampleRateHz > 0 ? (Number(payload.samplesBuffered) || 0) / payload.sampleRateHz : 0;
        if (!Number.isFinite(dv) || !(dur > 0)) return 0;
        var pk = payloadPeakG(payload);
        if (pk < FREE_FALL_MAX_G && meanAbsGz(payload) < FREE_FALL_MAX_GZ) {
          var gained = fallTrack.lastDv === null ? 0 : dv - fallTrack.lastDv;
          if (gained >= FREE_FALL_MIN_SHARE * 9.80665 * dur) {
            fallTrack.buffers++;
            fallTrack.speed = dv + 0.5 * 9.80665 * dur;
            fallTrack.atMs = Date.now();
          } else if (fallTrack.lastDv !== null) {
            fallTrack.buffers = 0;
            fallTrack.speed = 0;
          }
          fallTrack.lastDv = dv;
          return 0;
        }
        fallTrack.lastDv = dv;
        if (fallTrack.buffers >= 2 && fallTrack.speed > 0) {
          var gapS = (Date.now() - (fallTrack.atMs || Date.now())) / 1000 - dur;
          if (gapS <= FREE_FALL_MAX_GAP_S) {
            fallTrack.pending = Math.min(FREE_FALL_MAX_MS, fallTrack.speed + 9.80665 * Math.max(0, gapS));
            fallTrack.pendingLeft = 2;
          }
        }
        fallTrack.buffers = 0;
        fallTrack.speed = 0;
        if (fallTrack.pendingLeft > 0) {
          fallTrack.pendingLeft--;
          return fallTrack.pending;
        }
        return 0;
      }
      var FALL_IMPACT_MIN_PEAK_G = 8;

      function noteVerticalImpact(trace, rollover) {
        if (!trace || !trace.ax) return;
        var rolling = captureIsRolling(rollover);
        var m = rawTracePdofDeg(trace);
        if (!m || !Number.isFinite(m.dvzMs)) return;
        var x = m.dvxMs || 0, y = m.dvyMs || 0, z = m.dvzMs;
        var tot = x * x + y * y + z * z;

        if (!(tot > 0) || (z * z) / tot < 0.25) return;
        var peak = tracePeakG(trace);

        if ((z * z) / tot >= 0.4 && !rolling) noteRoofJolt(peak, shortWindowDvMs(trace, 0.06, true));

        if (Number.isFinite(payloadPreImpactVz)) {
          var fallMs = landingStoppedMs(-payloadPreImpactVz, Math.abs(z));

          var invertedNow = Number.isFinite(payloadImpactUpZ) && payloadImpactUpZ < -0.3;
          if (!(fallMs >= FALLING_MIN_MS) && invertedNow && peak >= VERTICAL_IMPACT_MIN_PEAK_G && (z * z) / tot >= 0.5) {
            noteLandingVec(x, y, Math.abs(z));
            sessionRoofDvMs = Math.max(sessionRoofDvMs, Math.abs(z));
            sessionVerticalImpactDvMs = Math.max(sessionFloorDvMs, sessionRoofDvMs);
            sessionVerticalRoofward = sessionRoofDvMs > sessionFloorDvMs;
            return;
          }
          if (!(fallMs >= FALLING_MIN_MS) || !(peak >= FALL_IMPACT_MIN_PEAK_G)) return;
          var fallRoof = Number.isFinite(payloadImpactUpZ) ? payloadImpactUpZ < -0.3 : z < 0 && !(rollover && rollover.available && !rollover.roofContact && !(rollover.worstUpZ < ROOF_IMPACT_INVERTED_UPZ));
          noteLandingVec(x, y, fallMs);
          if (fallRoof) sessionRoofDvMs = Math.max(sessionRoofDvMs, fallMs);
          else sessionFloorDvMs = Math.max(sessionFloorDvMs, fallMs * Math.max(landingCushionFor(trace, peak), bigFallCushion(fallMs)));
          sessionVerticalImpactDvMs = Math.max(sessionFloorDvMs, sessionRoofDvMs);
          sessionVerticalRoofward = sessionRoofDvMs > sessionFloorDvMs;
          return;
        }

        if (payloadPreImpactVz === 'later-chunk') { if (!(peak >= VERTICAL_IMPACT_MIN_PEAK_G)) return; }

        if (rolling && !(sessionFreeFlightSamples >= LONG_FALL_MS && peak >= LONG_FALL_MIN_PEAK_G)) {
          if (!(peak >= ROLLING_VERTICAL_MIN_PEAK_G)) return;
        }
        else if (rolling) {}
        else if (!(peak >= VERTICAL_IMPACT_MIN_PEAK_G) && !hasFallCredit() &&
                 !(Math.abs(z) >= BIG_DROP_MIN_DV_MS && peak >= BIG_DROP_MIN_PEAK_G)) return;

        var upAtPeak = payloadImpactUpZ;
        if (Number.isFinite(upAtPeak) && Math.abs(upAtPeak) >= 0.3) {
          noteLandingVec(x, y, Math.abs(z));
          if (upAtPeak < 0) sessionRoofDvMs = Math.max(sessionRoofDvMs, Math.abs(z));
          else sessionFloorDvMs = Math.max(sessionFloorDvMs, Math.abs(z) * landingCushionFor(trace, peak));
          sessionVerticalImpactDvMs = Math.max(sessionFloorDvMs, sessionRoofDvMs);
          sessionVerticalRoofward = sessionRoofDvMs > sessionFloorDvMs;
          return;
        }
        if (Math.abs(z) > sessionVerticalImpactDvMs) {
          sessionVerticalImpactDvMs = Math.abs(z);

          var roofward = z < 0;
          if (roofward && rollover && rollover.available && !rollover.roofContact &&
              !(rollover.worstUpZ < ROOF_IMPACT_INVERTED_UPZ) && roofCrushMaxM() < 0.20) roofward = false;
          sessionVerticalRoofward = roofward;
        }
        noteLandingVec(x, y, Math.abs(z));
        if (sessionVerticalRoofward) sessionRoofDvMs = Math.max(sessionRoofDvMs, Math.abs(z));
        else sessionFloorDvMs = Math.max(sessionFloorDvMs, Math.abs(z) * landingCushionFor(trace, peak));
      }

      var sessionLandingVec = null;
      function noteLandingVec(x, y, zAbs) {
        if (!(zAbs > 0)) return;
        if (!sessionLandingVec || zAbs >= sessionLandingVec.z) sessionLandingVec = { x: x || 0, y: y || 0, z: zAbs };
      }
      var LANDING_SEAT_GAIN = 0.15;
      function landingSeatFactor(seat) {
        var L = sessionLandingVec;
        if (!seat || !L) return 1;
        var pos = seatPosition(seat);
        var hMag = Math.hypot(L.x, L.y);
        var share = function (c) { return hMag > 0 ? Math.max(0, Math.min(1, (Math.abs(c) / hMag - 0.25) / 0.35)) : 0; };

        var tilt = function (c) { var r = Math.abs(c) / L.z; return Math.max(0, Math.min(1, (r - 0.2) / 0.5)); };
        var f = 1 + LANDING_SEAT_GAIN * (
          tilt(L.x) * share(L.x) * (-L.x * pos.y >= 0 ? 1 : -1) +
          tilt(L.y) * share(L.y) * (L.y * pos.x >= 0 ? 1 : -1));
        return Math.max(0.8, Math.min(1.25, f));
      }

      function verticalCeilingPercent(occupant, seat) {
        var c = Math.round(verticalDirectionCeilingPercent(false, occupant, seat) *
          verticalDirectionCeilingPercent(true, occupant, seat) / 100);
        return c < STRUCTURAL_DEATH_FLOOR_PERCENT ? 0 : c;
      }

      function verticalDirectionCeilingPercent(roofward, occupant, seat) {
        var v = (roofward ? sessionRoofDvMs : sessionFloorDvMs) * landingSeatFactor(seat);
        if (!(v > 0)) return 100;
        var lim = roofward ? ROOFWARD_LIMIT_MS : VERTICAL_LIMIT_MS;

        if (roofward && (vehicleHasRollCage() || sessionRollCagePresent)) lim = ROOFWARD_CAGE_LIMIT_MS;
        var shift = occupant && occupant.belted === false ? 2 : 0;
        var intact = lim.intact - shift, gone = lim.gone - shift;
        if (v <= intact) return 100;
        var t = (v - intact) / (gone - intact);
        if (t >= 1) return 0;
        var c = Math.max(0, Math.round(100 * (1 - t * t)));
        return c < STRUCTURAL_DEATH_FLOOR_PERCENT ? 0 : c;
      }

      var CEILING_EXPOSURE_SHARE = 0.6;
      var CEILING_EXPOSURE_SHARE_AWAY = 0.25;

      function seatEffectiveDeltaVMs(seat) {
        var dv = combinedVehicleDeltaVMs();
        if (!seat || !(dv > 0) || !Number.isFinite(sessionImpactPdofDeg)) return dv;

        var scalar;
        crushForSessionScoring = true;
        try {
          scalar = occupantExposure(seat, {
            pdofDeg: sessionImpactPdofDeg, dvxMs: sessionImpactDvXMs,
            dvyMs: sessionImpactDvYMs, dvzMs: sessionImpactDvZMs }).scalar;
        } finally { crushForSessionScoring = false; }
        if (!Number.isFinite(scalar)) return dv;

        var ageScale = 1 + 0.08 * (vehicleAgeOdds() - 1);

        var hx = Math.abs(sessionImpactDvXMs || 0), hy = Math.abs(sessionImpactDvYMs || 0);
        var longShare = hx + hy > 0 ? Math.pow(hx / Math.hypot(hx, hy), 0.75) : 1;

        var share = scalar >= 1 ? CEILING_EXPOSURE_SHARE : CEILING_EXPOSURE_SHARE_AWAY;

        var offRearDeg = Math.abs(((sessionImpactPdofDeg - 180) % 360 + 540) % 360 - 180);
        if (seat.row === 'rear' && offRearDeg < 45 && scalar >= 1) share = 1;
        return ageScale * dv * longShare * (1 + share * (scalar - 1));
      }

      function rollCeilingPercent(occupant) {
        var qt = effectiveRollTurns();
        if (!(qt > 2)) return 100;
        var k = occupant && occupant.belted === false ? 0.095 : (occupant && occupant.harness ? 0.012 : 0.032);
        if (vehicleHasRollCage() || sessionRollCagePresent) k *= 0.5;
        return Math.max(0, Math.round(100 * Math.exp(-k * (qt - 2))));
      }

      function seatCeilingPercent(seat, occupant) {
        var tier = structuralCeilingTier(seat, restraintTierOf(occupant));

        var cf = structuralSurvivalCeilingPercent(seatEffectiveDeltaVMs(seat), tier);
        var cs = sideCeilingPercent(seat, occupant);
        var cv = verticalCeilingPercent(occupant, seat);
        var cr = rollCeilingPercent(occupant);
        var c = Math.round(cf * cs * cv * cr / 1000000);
        return c < STRUCTURAL_DEATH_FLOOR_PERCENT ? 0 : c;
      }

      function applyStructuralLimit(report, deltaVMs, tier, patient, basePercent, explicitCeiling) {
        if (!report || !report.survival) return report;
        var ceiling = typeof explicitCeiling === 'number' ? explicitCeiling : structuralSurvivalCeilingPercent(deltaVMs, tier);
        var ceilingIss = report.iss && typeof report.iss.iss === 'number' ? report.iss.iss : 0;
        var survival = {};
        for (var k in report.survival) {
          if (Object.prototype.hasOwnProperty.call(report.survival, k)) survival[k] = report.survival[k];
        }

        var ageOdds = vehicleAgeOdds();
        function aged(pct) {
          if (!(ageOdds > 1) || !(pct > 0) || !(pct < 100)) return pct;
          var sp = pct / 100;
          return Math.round(100 * sp / (sp + ageOdds * (1 - sp)));
        }
        var reference = typeof basePercent === 'number' ? basePercent : survival.survivalProbabilityPercent;
        if (ceiling <= 0) {
          survival.survivalProbabilityPercent = 0;
        } else {
          var target = ceiling < 100 ? Math.round(reference * occupantCeilingFactor(ceiling, ceilingIss)) : reference;
          survival.survivalProbabilityPercent = Math.min(survival.survivalProbabilityPercent, aged(target));
        }

        if (ceilingIss >= 45 && survival.survivalProbabilityPercent > 0) {
          var issCap = Math.max(5, Math.round(25 - (ceilingIss - 45) * 20 / 21));

          var extraBurden = 0;
          try {
            var aisList = [];
            (report.events || []).forEach(function (ev) {
              (ev.injuries || []).forEach(function (inj) { if (inj && inj.aisSeverity >= 3) aisList.push(inj.aisSeverity); });
            });
            aisList.sort(function (a, b) { return b - a; });
            for (var bi = 3; bi < aisList.length; bi++) extraBurden += (aisList[bi] - 2) * (aisList[bi] - 2);
          } catch (eB) { extraBurden = 0; }
          issCap = Math.max(3, issCap - Math.min(12, Math.round(extraBurden * 0.8)));
          survival.survivalProbabilityPercent = Math.min(survival.survivalProbabilityPercent, issCap);
        }
        if (patient) survival.survivalProbabilityPercent = Math.min(survival.survivalProbabilityPercent, patient.lowestSurvivalPercent);

        var dead = (patient && patient.dead)
          || survival.outlook === 'notSurvivable'
          || survival.survivalProbabilityPercent < SURVIVAL_DEATH_FLOOR_PERCENT;
        if (dead) {
          survival.survivalProbabilityPercent = 0;
          survival.outlook = 'notSurvivable';

          if (!survival.deathCause) {
            survival.deathCause = ceiling <= 0
              ? (currentSeatDestroyed
                ? { short: 'Crushed', full: 'The passenger compartment was destroyed -- there was no survival space left.' }
                : { short: 'Fatal injuries', full: 'The force of the crash caused injuries nobody survives.' })
              : { short: 'Injuries', full: 'The combination of injuries was not survivable.' };
          }
          survival.plainSummary = survival.deathCause.full;
        } else if (survival.survivalProbabilityPercent < 50) {
          survival.outlook = 'critical';
          survival.plainSummary = 'Critical condition: urgent rescue and trauma care are needed.';
        }

        if (ceiling < 100) {
          survival.survivalProbabilityCaveat += ' An UNVERIFIED impact-severity gameplay ceiling also limits this estimate; cabin collapse is not inferred as a measured fact.';
        }
        if (patient) {
          patient.lowestSurvivalPercent = survival.survivalProbabilityPercent;
          patient.dead = !!dead;
        }
        var out = {};
        for (var j in report) {
          if (Object.prototype.hasOwnProperty.call(report, j)) out[j] = report[j];
        }
        out.survival = survival;
        if (dead) {
          out.systemicEffects = Object.assign({}, report.systemicEffects, {
            consciousness: { level: 'unresponsive', plainDescription: 'The simulated occupant is unresponsive.' },
            selfExtract: { level: 'unable', plainDescription: 'The occupant cannot get out without assistance.' }
          });
          out.recovery = Object.assign({}, report.recovery, { weeks: null });
        }
        return out;
      }

      function recordVehicleImpact(trace) {
        var P = window.CrashInjuryProPipeline;
        var res = P.resultant(trace.ax, trace.ay, trace.az);
        var filtered = P.cfcLowpass(res, trace.sampleRateHz, P.CFC.CFC_180).signal;
        P.segmentEvents(trace.t, trace.sampleRateHz, filtered).forEach(function (event) {
          sessionVehicleDeltaVMs = Math.max(sessionVehicleDeltaVMs, capDeltaV(trace, P.deltaVForEvent(trace, event)).magnitudeMs);
        });

        var m = rawTracePdofDeg(trace);
        if (m && m.deltaVMs >= SECOND_IMPACT_MIN_MS && Number.isFinite(m.pdofDeg)) {
          sessionHardHits.push({ dv: m.deltaVMs, pdof: m.pdofDeg });
        }
        noteLocalHit(trace, m);

        if (m && !bufferIsLaunch && Number.isFinite(m.pdofDeg) && isOwnHit(m.deltaVMs, tracePeakG(trace))) {
          sessionAllHits.push({ pdofDeg: m.pdofDeg, deltaVMs: m.deltaVMs,
            dvxMs: Number.isFinite(m.dvxMs) ? m.dvxMs : 0, dvyMs: Number.isFinite(m.dvyMs) ? m.dvyMs : 0,
            dvzMs: Number.isFinite(m.dvzMs) ? m.dvzMs : 0,
            peakLatG: Number.isFinite(trace.peakLateralG) ? Math.abs(trace.peakLateralG) : 0,
            peakLonG: Number.isFinite(trace.peakLongitudinalG) ? Math.abs(trace.peakLongitudinalG) : 0 });
          if (sessionAllHits.length > 12) {
            sessionAllHits.sort(function (a, b) { return b.deltaVMs - a.deltaVMs; });
            sessionAllHits.length = 12;
          }
        }
      }
      var sessionAllHits = [];

      var SECOND_IMPACT_MIN_MS = 11;
      var SECOND_IMPACT_MIN_ANGLE = 60;
      var sessionHardHits = [];
      function combinedVehicleDeltaVMs() {
        var main = sessionVehicleDeltaVMs || 0;
        if (!Number.isFinite(sessionImpactPdofDeg) || !sessionHardHits.length) return main;
        var extra = 0, seenDirs = [sessionImpactPdofDeg];
        sessionHardHits.slice().sort(function (a, b) { return b.dv - a.dv; }).forEach(function (h) {
          for (var i = 0; i < seenDirs.length; i++) {
            var d = Math.abs(((h.pdof - seenDirs[i]) % 360 + 540) % 360 - 180);
            if (d < SECOND_IMPACT_MIN_ANGLE) return;
          }
          seenDirs.push(h.pdof);
          extra += h.dv * h.dv;
        });
        return Math.sqrt(main * main + extra);
      }

      function restraintTierOf(occupant) {
        if (occupant.belted && occupant.harness) return 'harness';
        return occupant.belted ? (occupant.airbag ? 'beltedAirbag' : 'beltedOnly') : 'unbelted';
      }

      function rebuildPassengerReport(rec, elapsedS) {
        if (!window.CrashInjuryProPipeline) return;
        var clock = Object.assign({}, rec, { elapsedS: elapsedS || 0 });
        var outcome = computeOccupantOutcome(null, rec.def, occupantForSeat(rec.def), {}, clock);
        Object.assign(rec, outcome);
      }

      function ingestPassengers(trace, intrusion, rollover, driverEventMeta) {
        if (!window.CrashInjuryProPipeline) return;
        occupiedPassengerDefs().forEach(function (def) {
          try {
            var rec = paxRecord(def);
            var beforeNames = {};
            (rec.injuries || []).forEach(function (i) { if (i) beforeNames[i.region + '|' + i.name] = i.aisSeverity; });
            var beforePct = (scope.seats || []).filter(function (v) { return v.key === def.key; }).map(function (v) { return v.survivalPercent; })[0];
            var outcome = computeOccupantOutcome(trace, def, occupantForSeat(def),
              { intrusion: intrusion, rollover: rollover }, Object.assign({}, rec, { elapsedS: 0 }));
            Object.assign(rec, outcome);

            try {
              var added = (rec.injuries || []).filter(function (i) {
                return i && i.aisSeverity >= 3 && !(beforeNames[i.region + '|' + i.name] >= i.aisSeverity);
              });
              if (added.length && !cipReplaying && window.bngApi && window.bngApi.engineLua) {
                window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
                  JSON.stringify('NEW SERIOUS: ' + def.key + ' (was ' + beforePct + '%) <- ' + added.map(function (i) {
                    return i.name + ' AIS' + i.aisSeverity + ' [' + (i.mechanism || '?') + ']';
                  }).join(' ; ')) + ')');
              }
            } catch (eLog) {}
          } catch (e) {
            console.error('[CrashInjuryPro] passenger ' + def.key + ' failed:', e);
          }
        });
        refreshSeatViewModels();

        try {
          if (window.bngApi && typeof window.bngApi.engineLua === 'function') {
            var parts = (scope.seats || []).map(function (v) {
              var inj = (v.key === 'driver' ? sessionInjuries : (paxRecords[v.key] && paxRecords[v.key].injuries)) || [];
              var worst = inj.filter(function (i) { return i && i.aisSeverity >= 2; }).map(function (i) { return i.region + i.aisSeverity; });
              return v.key + ' ' + v.survivalPercent + '% n' + inj.length + (worst.length ? ' [' + worst.join(',') + ']' : '');
            });
            var zl = Object.keys(zoneHitCrush).filter(function (z) { return zoneHitCrush[z] >= 0.02; })
              .map(function (z) { return z + '=' + zoneHitCrush[z].toFixed(2) + '@' + Math.round(zoneHitG[z] || 0) + 'g'; });
            window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
              JSON.stringify('SEATS: ' + parts.join(' | ') + ' || hit zones: ' + (zl.join(' ') || 'none')) + ')');
          }
        } catch (e) {}
      }

      function tickPassengerExposure(elapsedS) {
        var defs = occupiedPassengerDefs();
        if (defs.length === 0) return;
        defs.forEach(function (def) {
          try {
            rebuildPassengerReport(paxRecord(def), elapsedS);
          } catch (e) {
            console.error('[CrashInjuryPro] passenger exposure tick failed for ' + def.key + ':', e);
          }
        });
        refreshSeatViewModels();
      }

      function updateImpactLine(trace) {
        try {
          var bufferPdof = tracePdofDeg(trace);

          var pdofDeg = Number.isFinite(sessionImpactPdofDeg) ? sessionImpactPdofDeg : bufferPdof;
          if (!Number.isFinite(pdofDeg)) { scope.impactLine = ''; return; }
          var lat = sessionImpactPeakLatG;
          var lon = sessionImpactPeakLonG;

          var line = pdofDeg.toFixed(0) + '\u00b0 ' + impactDirectionName(pdofDeg) +
            ' \u00b7 lat' + (sessionImpactDvYMs >= 0 ? '+' : '') + sessionImpactDvYMs.toFixed(1) +
            ' \u00b7 ' + lat.toFixed(1) + '/' + lon.toFixed(1) + 'g';

          if (Math.abs(sessionImpactDvZMs) > 1) {
            line += ' \u00b7 dn ' + Math.abs(sessionImpactDvZMs).toFixed(0) + ' tilt ' +
              (sessionImpactDvXMs >= 0 ? '+' : '') + sessionImpactDvXMs.toFixed(0) + '/' +
              (sessionImpactDvYMs >= 0 ? '+' : '') + sessionImpactDvYMs.toFixed(0);
          }

          if (horizontalRelevance() > 0.2) {
            var nearNames = SEAT_DEFS.filter(function (def) {
              return seatIsOccupied(def.key) && seatIsNearSide(def, pdofDeg);
            }).map(function (def) { return def.short; });
            line += ' \u00b7 hit: ' + (nearNames.length ? nearNames.join('+') : 'none');
          }
          var crushText = crushImpactText();
          if (crushText) line += ' \u00b7 ' + crushText;

          var vShare = Math.round(occupantExposure(SEAT_DEFS[0], currentImpact(pdofDeg)).verticalShare * 100);
          if (vShare >= 10) line += ' \u00b7 vertical ' + vShare + '%';
          line += ' \u00b7';
          SEAT_DEFS.forEach(function (def) {
            if (!seatIsOccupied(def.key)) return;
            var exposure = occupantExposure(def, currentImpact(pdofDeg));
            line += ' ' + def.key.charAt(0).toUpperCase() +
              (def.key === 'rearRight' ? 'R' : def.key === 'rearLeft' ? 'L' : '') +
              exposure.scalar.toFixed(2);
          });
          scope.impactLine = line;
        } catch (e) { scope.impactLine = ''; }
      }

      function impactDirectionName(pdofDeg) {
        var a = ((pdofDeg % 360) + 360) % 360;
        if (a < 12 || a >= 348) return 'front';
        if (a < 78) return 'front-right';
        if (a < 102) return 'right';
        if (a < 168) return 'rear-right';
        if (a < 192) return 'rear';
        if (a < 258) return 'rear-left';
        if (a < 282) return 'left';
        return 'front-left';
      }

      function seatDiagnostics(impact) {
        try {
          if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
          var pdofUsed = Number.isFinite(impact.tracePdofDeg) ? impact.tracePdofDeg : impact.pdofDeg;
          var line = 'SEATS: impactSide=' + (impact.impactSide || '?') +
            ' pdof=' + (Number.isFinite(impact.pdofDeg) ? impact.pdofDeg.toFixed(0) : '?') + 'deg' +
            ' traceP=' + (Number.isFinite(pdofUsed) ? pdofUsed.toFixed(0) : '?') + 'deg' +
            ' occupants=' + scope.occupantCount();
          SEAT_DEFS.forEach(function (def) {
            if (!seatIsOccupied(def.key)) return;
            var rec = def.key === 'driver' ? null : paxRecords[def.key];
            var survival = def.key === 'driver'
              ? (scope.survival ? scope.survival.survivalProbabilityPercent : 100)
              : (rec && rec.report && rec.report.survival ? rec.report.survival.survivalProbabilityPercent : 100);
            var count = def.key === 'driver' ? sessionInjuries.length : (rec ? rec.injuries.length : 0);
            var dvMs = sessionVehicleDeltaVMs;
            line += ' | ' + def.key +
              ' prox=' + seatImpactProximity(def, pdofUsed).toFixed(2) +
              ' pulse=x' + occupantExposure(def, currentImpact(pdofUsed)).scalar.toFixed(2) +
              ' dV=' + (dvMs / 0.44704).toFixed(1) + 'mph' +
              ' ceil=' + Math.min(structuralSurvivalCeilingPercent(dvMs, structuralCeilingTier(def, seatRestraintTier(def.key))),
                sideCeilingPercent(def, { belted: seatRestraintTier(def.key) !== 'unbelted' })) + '%' +
              ' ' + seatRestraintTier(def.key) +
              ' inj=' + count + ' surv=' + Math.round(survival) + '%';
          });
          window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' + JSON.stringify(line) + ')');
        } catch (e) {}
      }

      var SHORT_STATE_TEXT = {
        'Deceased': 'Dead',
        'Without help, you will die': 'Critical',
        'Shaken but alert': 'Shaken',

        'Could not breathe': 'Suffocated',
        'Brain swelling': 'Brain injury',
        'Chest crushed': 'Chest crush'
      };

      function shortStateText(text) {
        if (!text) return '';
        return SHORT_STATE_TEXT[text] || text;
      }

      function passengerStateText(rec) {
        if (!rec.report) return 'Fine';
        var flat = flattenReportInjuries(rec.report);
        var occupant = occupantForSeat(rec.def);
        return deriveOccupantState(flat, rec.report.survival, rec.report.systemicEffects, rec.eventMeta, {
          dead: rec.patient.dead,
          bleedMlMin: rec.bleedMlMin,
          bloodLostMl: rec.patient.bloodLostM3 * 1000000,
          massKg: occupant.massKg,
          medKitActive: false
        });
      }

      function passengerSurvivalPercent(rec) {
        if (!rec.report || !rec.report.survival) return 100;
        var pct = rec.report.survival.survivalProbabilityPercent;

        pct = Math.min(pct, rec.patient.lowestSurvivalPercent);
        if (rec.patient.dead) pct = 0;
        return Math.round(pct);
      }

      scope.seats = [];
      scope.seatByKey = {};

      function refreshSeatViewModels() {
        scope.seats = SEAT_DEFS.map(function (def) {
          var isDriver = def.key === 'driver';
          var occupied = seatIsOccupied(def.key);
          var tier = seatRestraintTier(def.key);
          var vm = {
            key: def.key,
            label: def.label,
            short: def.short,
            row: def.row,
            side: def.side,
            ns: def.ns,
            isDriver: isDriver,
            occupied: occupied,
            helmet: occupantGearFlags(def.key).helmet,
            harness: occupantGearFlags(def.key).harness,
            gearKey: seatGear(def.key).gear,
            airbagOn: !!seatGear(def.key).airbag,
            airbagAvailable: seatAirbagAvailable(def.key),
            available: seatAvailable(def.key),
            restraint: tier,
            restraintLabel: RESTRAINT_CONFIG_LABELS[tier],
            belted: tier !== 'unbelted'
          };
          if (!occupied) {
            vm.survivalPercent = null;
            vm.stateText = '';
            vm.injuryCount = 0;
            vm.dead = false;
            vm.severities = {};
            return vm;
          }
          if (isDriver) {
            vm.survivalPercent = scope.survival ? Math.round(scope.survival.survivalProbabilityPercent) : null;
            vm.stateText = shortStateText(scope.occupantStateText);
            vm.injuryCount = sessionInjuries.length;

            vm.dead = !!patientState.dead || !!(scope.survival && scope.survival.outlook === 'notSurvivable');

            vm.severities = computeBodyFigureSeverities(
              displayInjuriesFor(lastFullReport),
              bleedFractionOf(scope.patientBloodLostMl, currentOccupant().massKg),
              burnFractionOf(patientFireDoseS)
            );
            vm.severities = crushedBody(vm.severities, scope.survival);
            return vm;
          }
          var rec = paxRecord(def);

          var crashed = rec.events.length > 0;
          vm.survivalPercent = rec.report ? passengerSurvivalPercent(rec) : (crashed ? 100 : null);
          vm.stateText = rec.report ? shortStateText(passengerStateText(rec)) : (crashed ? 'Fine' : '');
          vm.injuryCount = rec.report ? flattenReportInjuries(rec.report).length : 0;

          vm.dead = !!rec.patient.dead
            || !!(rec.report && rec.report.survival && rec.report.survival.outlook === 'notSurvivable')
            || vm.survivalPercent === 0;
          vm.severities = rec.report ? computeBodyFigureSeverities(
            flattenReportInjuries(rec.report),
            bleedFractionOf(rec.patient ? rec.patient.bloodLostM3 * 1000000 : 0, occupantForSeat(def).massKg),
            burnFractionOf(patientFireDoseS)
          ) : {};
          if (rec.report) vm.severities = crushedBody(vm.severities, rec.report.survival);
          return vm;
        });

        scope.seatByKey = {};
        scope.seats.forEach(function (vm) { scope.seatByKey[vm.key] = vm; });
        paintOccupantFigures();
        updateSeatbeltVisual();
        publishSeatSurvival();
      }

      function publishSeatSurvival() {
        var stats = window.__crashInjuryProStats;
        if (!stats || !stats.last) return;
        var out = {};
        scope.seats.forEach(function (vm) {
          out[vm.key] = vm.occupied ? { pct: vm.survivalPercent === null ? 100 : vm.survivalPercent, dead: !!vm.dead } : null;
        });
        var changed = JSON.stringify(out) !== JSON.stringify(stats.last.seats || null);
        stats.last.seats = out;
        var drv = out.driver;
        if (drv) {
          if (drv.dead && !stats.last.dead) {
            stats.last.survivalPercent = 0;
            stats.last.outlook = 'notSurvivable';
            stats.last.dead = true;
            stats.last.costUsd = null;
            stats.last.recoveryWeeks = null;
            stats.last.recoveryHours = null;
            stats.last.hospitalDays = null;
            stats.last.permanent = false;
            if (!statsSessionDeathCounted) {
              stats.deaths += 1;
              statsSessionDeathCounted = true;
            }
            changed = true;
          } else if (!drv.dead && Math.abs((stats.last.survivalPercent || 0) - drv.pct) >= 1) {
            stats.last.survivalPercent = drv.pct;
            changed = true;
          }
        }
        if (changed) broadcastCrashInjuryProStats();
      }

      function passengerFigureContainer(key) {
        var root = appRootEl || element[0];
        return root ? root.querySelector('[data-cip-seat-figure="' + key + '"]') : null;
      }

      function paintReportFigures() {
        var root = appRootEl || element[0];
        if (!root) return;
        SEAT_DEFS.forEach(function (def) {
          var container = root.querySelector('[data-cip-report-figure="' + def.key + '"]');
          if (!container) return;
          var vm = scope.seatByKey[def.key];
          if (!vm || !vm.occupied) {
            container.innerHTML = '';
            container.removeAttribute('data-cip-report-painted');
            return;
          }
          if (container.getAttribute('data-cip-report-painted') !== def.key) {
            container.innerHTML = bodyFigureSvgFor(def.reportNs);
            container.setAttribute('data-cip-report-painted', def.key);
          }
          var belt = container.querySelector('#' + figureIdPrefix(def.reportNs) + 'FigureSeatbelt');
          if (belt) belt.style.display = vm.belted && !vm.harness ? '' : 'none';
          var harnessR = container.querySelector('#' + figureIdPrefix(def.reportNs) + 'FigureHarness');
          if (harnessR) harnessR.style.display = vm.harness ? '' : 'none';
          var helmetR = container.querySelector('#' + figureIdPrefix(def.reportNs) + 'FigureHelmet');
          if (helmetR) helmetR.style.display = vm.helmet ? '' : 'none';
          paintFigureSeverities(container, def.reportNs, vm.severities || {});
        });
      }

      function paintOccupantFigures() {
        paintReportFigures();
        SEAT_DEFS.forEach(function (def) {
          if (def.key === 'driver') return;
          var container = passengerFigureContainer(def.key);
          if (!container) return;
          var vm = null;
          for (var i = 0; i < scope.seats.length; i++) if (scope.seats[i].key === def.key) vm = scope.seats[i];
          if (!vm || !vm.occupied) {
            container.innerHTML = '';
            container.removeAttribute('data-cip-seat-painted');
            return;
          }

          if (container.getAttribute('data-cip-seat-painted') !== def.key) {
            container.innerHTML = bodyFigureSvgFor(def.ns);
            container.setAttribute('data-cip-seat-painted', def.key);
          }
          var belt = container.querySelector('#' + figureIdPrefix(def.ns) + 'FigureSeatbelt');
          if (belt) belt.style.display = vm.belted && !vm.harness ? '' : 'none';
          var harnessP = container.querySelector('#' + figureIdPrefix(def.ns) + 'FigureHarness');
          if (harnessP) harnessP.style.display = vm.harness ? '' : 'none';
          var helmetP = container.querySelector('#' + figureIdPrefix(def.ns) + 'FigureHelmet');
          if (helmetP) helmetP.style.display = vm.helmet ? '' : 'none';
          paintFigureSeverities(container, def.ns, vm.severities || {});
        });
      }

      scope.seatPanelOpen = false;

      scope.toggleSeatPanel = function () {
        scope.gearMenuOpen = null;
        scope.seatPanelOpen = !scope.seatPanelOpen;
      };

      scope.toggleSeatOccupied = function (key) {
        if (key === 'driver') return;
        var entry = scope.settings.seats[key];
        if (!entry) return;
        if (!seatAvailable(key)) {
          seatOverride[key] = true;
          entry.occupied = true;
          delete paxRecords[key];
          refreshSeatViewModels();
          return;
        }
        entry.occupied = !entry.occupied;

        delete paxRecords[key];
        refreshSeatViewModels();
      };

      scope.cycleSeatRestraint = function (key) {
        if (key === 'driver') { scope.cycleRestraintConfig(); refreshSeatViewModels(); return; }
        var def = seatDef(key);
        var entry = scope.settings.seats[key];
        if (!def || !entry) return;
        var options = restraintOptionsFor(def);
        var idx = options.indexOf(entry.restraint);
        entry.restraint = options[(idx + 1) % options.length];
        scope.settings.gear[key] = gearFromTier(key, entry.restraint);
        syncTierFromGear(key);
        refreshSeatViewModels();
      };

      scope.seatRestraintLabel = function (key) {
        return gearLabelFor(key);
      };

      var CARE_DAYS_BY_REGION = {
        head: [0, 1, 21, 120, 365, 730], neck: [0, 3, 42, 120, 270, 540], chest: [0, 4, 42, 70, 120, 200],
        lung: [0, 3, 21, 42, 90, 160], aorta: [0, 5, 30, 90, 180, 300], abdomen: [0, 3, 28, 56, 120, 200],
        kidney: [0, 3, 21, 56, 120, 200], bowel: [0, 3, 28, 56, 120, 200], pelvis: [0, 4, 56, 120, 240, 365],
        femur: [0, 4, 56, 120, 200, 300], lowerLeg: [0, 3, 56, 112, 180, 270], knee: [0, 3, 42, 120, 180, 270],
        ankle: [0, 4, 49, 100, 160, 240], foot: [0, 3, 42, 90, 150, 220], upperArm: [0, 3, 49, 90, 150, 220],
        forearm: [0, 3, 42, 80, 130, 200], wrist: [0, 4, 42, 70, 120, 180], hand: [0, 3, 35, 60, 100, 160],
        thoracicSpine: [0, 4, 56, 120, 270, 540], lumbarSpine: [0, 4, 56, 120, 270, 540]
      };
      var CARE_MINOR_HOURS = [
        [/bitten tongue/i, 48], [/bump on the head|head knock/i, 20], [/stiff neck|jarred|strained muscles|sore /i, 36],
        [/seatbelt|lap-belt|harness bruis|belt bruis/i, 96], [/cut|graze|glass/i, 144], [/burn/i, 168],
        [/sprain/i, 240], [/whiplash/i, 400], [/bruis/i, 110]
      ];
      var CARE_TREATMENT_USD = [0, 160, 4300, 27500, 71000, 148000];
      var CARE_REGION_COST = { head: 1.45, neck: 1.3, thoracicSpine: 1.5, lumbarSpine: 1.5, aorta: 1.7, pelvis: 1.25, femur: 1.15, chest: 1.0, lung: 1.1, abdomen: 1.2 };
      function careHash(list) {
        var h = 2166136261;
        list.forEach(function (i) {
          var t = String(i.region) + String(i.name) + String(i.aisSeverity);
          for (var c = 0; c < t.length; c++) { h ^= t.charCodeAt(c); h = Math.imul(h, 16777619) >>> 0; }
        });
        return (h % 1000) / 1000;
      }
      function careEstimate(flat, dead, iss) {
        if (dead) return { costUsd: null, weeks: null, hours: null, hospitalDays: null, permanent: false, dead: true };
        var list = (flat || []).filter(function (i) { return i && i.aisSeverity > 0 && i.region !== 'circulatory'; });
        if (!list.length) return { costUsd: 0, weeks: 0, hours: 0, hospitalDays: 0, permanent: false, dead: false };
        var jitter = 0.9 + careHash(list) * 0.22;
        var maxAis = 0, serious = 0, permanent = false, hours = [], costs = [];
        list.forEach(function (i) {
          var a = Math.min(5, i.aisSeverity);
          if (a > maxAis) maxAis = a;
          if (a >= 3) serious++;
          var name = String(i.name || '');
          try { name += ' ' + plainInjuryTitle(i); } catch (e) {}
          var h = null;
          if (a === 1) {
            for (var m = 0; m < CARE_MINOR_HOURS.length; m++) {
              if (CARE_MINOR_HOURS[m][0].test(name)) { h = CARE_MINOR_HOURS[m][1]; break; }
            }
          }
          if (h === null) {
            var t = CARE_DAYS_BY_REGION[i.region] || [0, 3, 28, 70, 150, 270];
            h = t[a] * 24;
          }
          hours.push(h);
          costs.push(CARE_TREATMENT_USD[a] * (CARE_REGION_COST[i.region] || 1));
          if (/cord|paraly/i.test(name) || (i.region === 'head' && a >= 5)) permanent = true;
        });
        hours.sort(function (x, y) { return y - x; });
        costs.sort(function (x, y) { return y - x; });
        var total = hours[0];
        for (var k = 1; k < hours.length; k++) if (hours[k] >= 24 * 14) total += hours[k] * 0.12;
        total = Math.min(total, hours[0] * 1.5);
        var hospital = 0;
        if (maxAis >= 5) hospital = 28;
        else if (maxAis === 4) hospital = 12;
        else if (maxAis === 3) hospital = 3 + serious;
        else if (maxAis === 2 && list.some(function (i) { return i.aisSeverity >= 2 && /femur|pelvis|Spine|head/.test(i.region); })) hospital = 1;
        if ((iss || 0) >= 9) hospital = Math.max(hospital, Math.round((iss - 4) * 0.45));
        hospital = Math.round(hospital * jitter);
        total = Math.max(total, hospital * 24) * jitter;
        var cost = maxAis >= 2 ? 1350 + 2900 : 1100;
        cost += costs[0];
        for (var c = 1; c < costs.length; c++) cost += costs[c] * 0.4;
        var icu = maxAis >= 4 ? Math.round(hospital * 0.4) : 0;
        cost += (hospital - icu) * 3400 + icu * 9800;
        if (maxAis >= 4) cost += 38000;
        var rehabWeeks = total / 168 - hospital / 7;
        if (rehabWeeks > 4) cost += Math.min(80, Math.round(rehabWeeks * 2)) * 185;
        cost = Math.round(cost * jitter / 10) * 10;
        return { costUsd: cost, weeks: Math.round(total / 168), hours: Math.round(total), hospitalDays: hospital, permanent: permanent, dead: false };
      }
      function formatCareTime(care) {
        if (!care) return '';
        if (care.dead || care.hours === null || care.hours === undefined) return 'N/A (fatal)';
        if (care.permanent) return 'Lifelong';
        var h = care.hours;
        if (!(h > 0)) return 'None';
        if (h < 24) { var hh = Math.max(1, Math.round(h)); return hh === 1 ? '1 hour' : hh + ' hours'; }
        var d = h / 24;
        if (d < 14) { var dd = Math.round(d); return dd === 1 ? '1 day' : dd + ' days'; }
        if (d < 63) { var ww = Math.round(d / 7); return ww === 1 ? '1 week' : ww + ' weeks'; }
        if (d < 350) { var mm = Math.round(d / 30.4); return mm === 1 ? '1 month' : mm + ' months'; }
        var yy = Math.round(d / 365 * 2) / 2;
        return yy === 1 ? '1 year' : yy + ' years';
      }
      function formatCareStay(care) {
        if (!care || care.dead || !(care.hours > 0)) return '';
        if (care.permanent) return '(permanent disability)';
        if (!(care.hospitalDays > 0)) return care.hours >= 24 ? '(home the same day)' : '';
        return care.hospitalDays === 1 ? '(1 day in hospital)' : '(' + care.hospitalDays + ' days in hospital)';
      }
      scope.formatCareTime = formatCareTime;
      scope.formatCareStay = formatCareStay;
      function careLevel(pct, iss, dead, flat) {
        if (dead) return { key: 'dead', text: 'Dead' };
        var maxAis = 0, bleedingHard = false;
        (flat || []).forEach(function (i) {
          if (!i) return;
          if (i.aisSeverity > maxAis) maxAis = i.aisSeverity;
          if (i.region === 'circulatory' && i.aisSeverity >= 3) bleedingHard = true;
        });
        if ((pct !== null && pct < 50) || (iss || 0) >= 25 || maxAis >= 5 || bleedingHard) return { key: 'critical', text: 'Critical -- needs a trauma team now' };
        if ((pct !== null && pct < 80) || (iss || 0) >= 16 || maxAis >= 4) return { key: 'serious', text: 'Serious -- get to hospital fast' };
        if (maxAis >= 2) return { key: 'injured', text: 'Injured -- needs a doctor' };
        if (maxAis >= 1) return { key: 'minor', text: 'Minor -- a check-up' };
        return { key: 'fine', text: 'Unhurt' };
      }

      var sessionCrashPeakG = 0;
      function seatPeakG(def) {
        if (!(sessionCrashPeakG > 0)) return null;
        var scale = 1;
        try {
          if (Number.isFinite(sessionImpactPdofDeg)) {
            crushForSessionScoring = true;
            var ex = occupantExposure(def, { pdofDeg: sessionImpactPdofDeg, dvxMs: sessionImpactDvXMs, dvyMs: sessionImpactDvYMs, dvzMs: sessionImpactDvZMs });
            if (ex && ex.scalar > 0) scale = ex.scalar;
          }
        } catch (e) {} finally { crushForSessionScoring = false; }
        return Math.round(sessionCrashPeakG * scale);
      }

      scope.reportSeats = [];

      function refreshReportSeats() {
        scope.reportSeats = SEAT_DEFS.filter(function (def) { return seatIsOccupied(def.key); }).map(function (def) {
          if (def.key === 'driver') {
            var driverDead = !!(scope.survival && scope.survival.outlook === 'notSurvivable');
            var driverFlat = lastFullReport ? flattenReportInjuries(lastFullReport) : [];
            var driverCare = careEstimate(driverFlat, driverDead, scope.iss ? scope.iss.iss : null);
            return {
              key: def.key,
              label: def.label,
              restraintLabel: gearLabelFor('driver'),
              helmet: occupantGearFlags('driver').helmet,
              survivalPercent: scope.survival ? Math.round(scope.survival.survivalProbabilityPercent) : null,
              stateText: scope.occupantStateText,
              iss: scope.iss ? scope.iss.iss : null,
              costUsd: driverCare.costUsd,
              recoveryWeeks: driverCare.weeks,
              careTime: driverCare,
              permanent: driverCare.permanent,
              care: careLevel(scope.survival ? Math.round(scope.survival.survivalProbabilityPercent) : null, scope.iss ? scope.iss.iss : null, driverDead, driverFlat),
              bleedMlMin: driverDead ? 0 : (scope.patientBleedMlMin || 0),
              bloodLostMl: scope.patientBloodLostMl || 0,
              peakG: seatPeakG(def),
              dead: driverDead,
              deathCause: scope.survival && scope.survival.deathCause ? scope.survival.deathCause.full : null,
              condition: conditionView(scope.systemicEffects, scope.reportInjuries || [], !!(scope.survival && scope.survival.outlook === 'notSurvivable')),
              injuries: scope.reportInjuries || []
            };
          }
          var rec = paxRecord(def);
          var paxDead = !!(rec.report && rec.report.survival && rec.report.survival.outlook === 'notSurvivable') || (rec.patient && rec.patient.dead);
          var paxFlat = rec.report ? flattenReportInjuries(rec.report) : [];
          var paxCare = careEstimate(paxFlat, paxDead, rec.report && rec.report.iss ? rec.report.iss.iss : null);
          var rows = [];
          if (rec.report) {
            flattenReportInjuries(rec.report)
              .slice()
              .sort(function (a, b) { return b.aisSeverity - a.aisSeverity; })
              .forEach(function (inj, i) { rows.push(buildReportRow(inj, i)); });
            disambiguateRowTitles(rows, def.key);
          }
          return {
            key: def.key,
            label: def.label,
            restraintLabel: gearLabelFor(def.key),
            helmet: occupantGearFlags(def.key).helmet,
            survivalPercent: rec.report ? passengerSurvivalPercent(rec) : 100,
            stateText: rec.report ? passengerStateText(rec) : 'Fine',
            iss: rec.report && rec.report.iss ? rec.report.iss.iss : null,
            costUsd: paxCare.costUsd,
            recoveryWeeks: paxCare.weeks,
            careTime: paxCare,
            permanent: paxCare.permanent,
            care: careLevel(rec.report ? passengerSurvivalPercent(rec) : 100, rec.report && rec.report.iss ? rec.report.iss.iss : null, paxDead, paxFlat),
            bleedMlMin: paxDead ? 0 : (rec.bleedMlMin || 0),
            bloodLostMl: rec.patient ? (rec.patient.bloodLostM3 || 0) * 1000000 : 0,
            peakG: rec.report ? seatPeakG(def) : null,
            dead: paxDead,
            deathCause: rec.report && rec.report.survival && rec.report.survival.deathCause
              ? rec.report.survival.deathCause.full : null,
            condition: rec.report ? conditionView(rec.report.systemicEffects, flattenReportInjuries(rec.report),
              !!(rec.report.survival && rec.report.survival.outlook === 'notSurvivable')) : [],
            injuries: rows
          };
        });

        trackTimeout($timeout(paintReportFigures, 0));
      }

      scope.settingsOpen = false;
      scope.toggleSettings = function () {
        scope.settingsOpen = !scope.settingsOpen;
      };

      scope.blackoutFraction = function () {
        return scope.settings.blackoutEnabled ? scope.settings.blackoutOpacity / 100 : 0;
      };

      var FIGURE_BASE_WIDTH_EM = 14;
      var FIGURE_BASE_SVG_HEIGHT_EM = 13;
      var FIGURE_CONTENT_GAP_EM = 0.5;
      var FIGURE_FULLSCREEN_MULTIPLIER = 1.6;
      var CONTROLS_MIN_WIDTH_EM = 7;
      var CONTENT_MIN_WIDTH_EM = 11;
      var BASE_APP_MAX_HEIGHT_EM = 30;

      window.__crashInjuryProDisplaySettings = window.__crashInjuryProDisplaySettings || { figureScale: 1 };

      function currentFigureScale() {
        var s = window.__crashInjuryProDisplaySettings && window.__crashInjuryProDisplaySettings.figureScale;
        var n = Number(s);
        return n > 0 ? n : 1;
      }

      var MULTI_ROW_HEIGHT_EM = 18;
      var MULTI_GRID_HEADROOM = 0.93;
      var MULTI_FIGURE_AREA_MAX_WIDTH_EM = 24;

      var MULTI_READOUT_WIDTH_EM = 5.2;
      var MULTI_CONTROLS_FALLBACK_EM = 6.5;

      var MULTI_FULLSCREEN_FIGURE_FRACTION = 0.38;

      var BODY_FIGURE_ASPECT = 240 / 480;

      var MULTI_MIN_CELL_WIDTH_EM = 4.6;
      var MULTI_OCCUPANT_CELL_GAP_EM = 0.4;

      var MULTI_OCCUPANT_ROW_CHROME_EM = 0.3;

      var MULTI_OCCUPANT_MAX_CELL_SCALE = 1.15;

      function appFrameEm() {
        if (!appRootEl) return null;
        var fontSizePx = parseFloat(window.getComputedStyle(appRootEl).fontSize);
        if (!(fontSizePx > 0)) return null;
        var widthEm = appRootEl.clientWidth / fontSizePx;
        var heightEm = appRootEl.clientHeight / fontSizePx;
        if (!(widthEm > 0) || !(heightEm > 0)) return null;
        return { widthEm: widthEm, heightEm: heightEm };
      }

      function controlsHeightEm() {
        var root = appRootEl || element[0];
        var el = root ? root.querySelector('.cip-figure-controls') : null;
        if (!el || !appRootEl) return MULTI_CONTROLS_FALLBACK_EM;
        var fontSizePx = parseFloat(window.getComputedStyle(appRootEl).fontSize);
        if (!(fontSizePx > 0)) return MULTI_CONTROLS_FALLBACK_EM;
        var heightEm = el.getBoundingClientRect().height / fontSizePx;
        var impactEl = root.querySelector('.cip-impact-line');
        if (impactEl) {
          var impactRect = impactEl.getBoundingClientRect();
          var impactStyle = window.getComputedStyle(impactEl);
          heightEm += (impactRect.height
            + parseFloat(impactStyle.marginTop || 0)
            + parseFloat(impactStyle.marginBottom || 0)) / fontSizePx;
        }
        if (!(heightEm > 0)) return MULTI_CONTROLS_FALLBACK_EM;

        return Math.max(3, Math.min(14, heightEm + MULTI_OCCUPANT_CELL_GAP_EM));
      }

      function multiRowHeightEm() {
        var layout = occupantGridLayout();
        var frame = appFrameEm();
        if (!frame) return MULTI_ROW_HEIGHT_EM;
        var available = frame.heightEm
          - controlsHeightEm()
          - MULTI_OCCUPANT_CELL_GAP_EM * (layout.rowCount - 1);

        available *= MULTI_GRID_HEADROOM;
        return Math.max(3, Math.min(MULTI_ROW_HEIGHT_EM, available / layout.rowCount));
      }

      function multiGridWidthEm() {
        var frame = appFrameEm();
        var total = frame ? frame.widthEm : MULTI_FIGURE_AREA_MAX_WIDTH_EM;
        if (scope.fullscreen) total *= MULTI_FULLSCREEN_FIGURE_FRACTION;
        return Math.max(CONTROLS_MIN_WIDTH_EM, total);
      }

      function occupantCellBoxWidthEm() {
        var layout = occupantGridLayout();
        return (multiGridWidthEm() - MULTI_OCCUPANT_CELL_GAP_EM * (layout.cols - 1)) / layout.cols;
      }

      function occupantCellScale() {
        if (!scope.multiOccupant()) return 1;
        var layout = occupantGridLayout();
        var widthForFigure = occupantCellBoxWidthEm() - MULTI_READOUT_WIDTH_EM - MULTI_OCCUPANT_CELL_GAP_EM;
        var heightForFigure = multiRowHeightEm() - MULTI_OCCUPANT_ROW_CHROME_EM;

        var byWidth = widthForFigure / (FIGURE_BASE_SVG_HEIGHT_EM * BODY_FIGURE_ASPECT);
        var byHeight = heightForFigure / FIGURE_BASE_SVG_HEIGHT_EM;

        return Math.max(0.2, Math.min(MULTI_OCCUPANT_MAX_CELL_SCALE, byWidth, byHeight));
      }

      function occupantGridHeightEm() {
        var cell = FIGURE_BASE_SVG_HEIGHT_EM * currentFigureScale() * occupantCellScale();
        if (!scope.multiOccupant()) return cell;
        var layout = occupantGridLayout();
        return (cell + MULTI_OCCUPANT_ROW_CHROME_EM) * layout.rowCount
          + MULTI_OCCUPANT_CELL_GAP_EM * (layout.rowCount - 1);
      }

      function multiAppMaxHeightEm() {
        var layout = occupantGridLayout();
        return MULTI_ROW_HEIGHT_EM * layout.rowCount
          + MULTI_OCCUPANT_CELL_GAP_EM * (layout.rowCount - 1)
          + MULTI_CONTROLS_FALLBACK_EM;
      }

      function occupantFigureWidthEm() {
        var figureHeight = FIGURE_BASE_SVG_HEIGHT_EM * currentFigureScale() * occupantCellScale();
        return Math.max(MULTI_MIN_CELL_WIDTH_EM, figureHeight * BODY_FIGURE_ASPECT);
      }

      scope.figureWidthEm = function () {
        var w = FIGURE_BASE_WIDTH_EM * currentFigureScale();
        if (scope.multiOccupant()) {
          return multiGridWidthEm();
        }

        return scope.fullscreen ? w * FIGURE_FULLSCREEN_MULTIPLIER : w;
      };
      scope.figureColStyle = function () {
        return { width: scope.figureWidthEm() + 'em' };
      };

      scope.figureBodyTargetStyle = function () {
        var h = FIGURE_BASE_SVG_HEIGHT_EM * currentFigureScale() * occupantCellScale();
        if (scope.multiOccupant()) {
          return { height: h + 'em', width: occupantFigureWidthEm() + 'em' };
        }
        if (scope.fullscreen) h *= FIGURE_FULLSCREEN_MULTIPLIER;
        return { height: h + 'em' };
      };

      scope.contentColStyle = function () {
        return { left: (scope.figureWidthEm() + FIGURE_CONTENT_GAP_EM) + 'em' };
      };

      scope.appSizingStyle = function () {
        var normalWidthEm = FIGURE_BASE_WIDTH_EM * currentFigureScale();
        if (scope.multiOccupant()) {
          normalWidthEm = CONTROLS_MIN_WIDTH_EM;
        }

        var style = { minWidth: (scope.compactBodiesOnly() ? normalWidthEm : normalWidthEm + FIGURE_CONTENT_GAP_EM + CONTENT_MIN_WIDTH_EM) + 'em' };
        if (!scope.fullscreen) {
          if (scope.multiOccupant()) {
            style.maxHeight = Math.max(BASE_APP_MAX_HEIGHT_EM, multiAppMaxHeightEm()) + 'em';
          } else {
            var extraSvgHeightEm = Math.max(0, occupantGridHeightEm() - FIGURE_BASE_SVG_HEIGHT_EM);
            style.maxHeight = (BASE_APP_MAX_HEIGHT_EM + extraSvgHeightEm) + 'em';
          }
        }
        return style;
      };

      function onDisplaySettingsUpdate() {
        if (!scope.$$phase) scope.$apply();
      }
      window.addEventListener('crashInjuryProDisplaySettingsUpdate', onDisplaySettingsUpdate);

      function sendShakeSettingsToGE() {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;

        window.bngApi.engineLua('extensions.crashInjuryPro.setShakeSettings(' +
          JSON.stringify(scope.settings.shakeOn === false ? 'off' : 'always') + ', ' + (scope.settings.shakeIntensity / 100) + ', ' +
          (scope.settings.dynamicCamera ? 'true' : 'false') + ', ' + ((Number(scope.settings.dynamicCameraStrength) || 0) / 100) + ', ' +
          ((Number(scope.settings.bodySway) || 0) / 100) + ', ' + driverRestraintLevel() + ')');
      }

      function driverRestraintLevel() {
        var g = gearDef(seatGear('driver').gear);
        return g.harness ? 2 : (g.belt ? 1 : 0);
      }

      function persistSettings() {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
        window.bngApi.engineLua('settings.setValue(' + JSON.stringify('crashInjuryPro_settings') + ', ' + JSON.stringify(JSON.stringify(scope.settings)) + ')');
      }

      function loadPersistedSettings() {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
        window.bngApi.engineLua('settings.getValue(' + JSON.stringify('crashInjuryPro_settings') + ', "{}")', function (ret) {
          var loaded = null;
          try { loaded = JSON.parse(ret); } catch (e) {}
          if (loaded && typeof loaded === 'object') {
            angular.extend(scope.settings, loaded);

            if (loaded.shakeMode === undefined && loaded.shakeEnabled !== undefined) {
              scope.settings.shakeMode = loaded.shakeEnabled ? 'realisticOnly' : 'off';
            }
            delete scope.settings.shakeEnabled;

            if (loaded.shakeOn === undefined) scope.settings.shakeOn = scope.settings.shakeMode !== 'off';
            if (loaded.dynamicCamera === undefined) scope.settings.dynamicCamera = true;
            if (loaded.bodySway === undefined) scope.settings.bodySway = 60;
            scope.settings.shakeMode = scope.settings.shakeOn ? 'always' : 'off';
          }

          normaliseSeatSettings();
          normaliseGearSettings();
          ['driver', 'frontRight', 'rearLeft', 'rearRight'].forEach(syncTierFromGear);
          refreshSeatViewModels();
          recomputeVisionStyle();
          sendShakeSettingsToGE();

          if (!restoredOnce) { restoredOnce = true; restoreFromReplayStore(); }
          if (!scope.$$phase) scope.$apply();
        });
      }
      var restoredOnce = false;

      setTimeout(function () {
        if (restoredOnce || staleInstance()) return;
        restoredOnce = true;
        restoreFromReplayStore();
      }, 1200);
      try {
        var stLink = window.__cipReplayStore;
        if (window.bngApi && window.bngApi.engineLua) window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
          JSON.stringify('LINK: app (re)started, saved crash has ' + (stLink && stLink.items ? stLink.items.length : 0) + ' buffers.') + ')');
      } catch (e) {}

      scope.$watch('settings', function (newVal, oldVal) {
        if (newVal === oldVal) return;
        if (!oldVal || newVal.language !== oldVal.language) applyLanguage();
        recomputeVisionStyle();
        sendShakeSettingsToGE();
        persistSettings();
      }, true);

      scope.pct = function (v) {
        var n = Number(v);
        if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return v;
        return Math.round(n * 10) / 10;
      };
      scope.realisticMode = false;
      scope.deathFadeActive = false;
      scope.fatalInjuryText = '';

      scope.deathScreenDismissed = false;
      scope.unconsciousFadeActive = false;
      scope.unconsciousFadeVisible = false;

      scope.blackoutProvisional = false;

      scope.unconsciousCancelling = false;
      scope.visionBlurStyle = {};
      scope.visionVignetteStyle = {};
      scope.painPulseActive = false;
      scope.painPulseStyle = {};
      scope.dizzyActive = false;

      scope.dizzyFraction = 0;
      scope.dizzyStyle = {};
      scope.bloodLossDesaturateFraction = 0;

      scope.shockStage = 0;
      scope.shockBlackoutVisible = false;

      scope.medKitAvailable = true;
      scope.medKitBusy = false;

      var currentBloodLoss = 'none';
      var currentHeadAisForBlur = 0;

      var currentArmsBrokenSides = 0;
      var currentLegDegraded = false;
      var currentShockSluggish = false;

      var ringingFraction = 0;
      var wakingRecoveryFraction = 0;

      var bloodLossDesaturateIntervalPromise = null;

      var shockElapsedMs = 0;
      var shockBlackoutPhase = 'lucid';
      var shockPhaseRemainingMs = 0;
      var medKitActive = false;

      function scaleByHeadAis(ais, minMs, maxMs, floorAis) {
        var t = Math.max(0, Math.min(1, (ais - floorAis) / (5 - floorAis)));
        return minMs + t * (maxMs - minMs);
      }

      function lerpRange(range, t) {
        t = Math.max(0, Math.min(1, t));
        return range.start + t * (range.end - range.start);
      }

      function localShockStageFraction(stageFraction, stage) {
        if (stage === 2) return (stageFraction - SHOCK_STAGE2_START_FRACTION) / (SHOCK_STAGE3_START_FRACTION - SHOCK_STAGE2_START_FRACTION);
        if (stage === 3) return (stageFraction - SHOCK_STAGE3_START_FRACTION) / (SHOCK_STAGE4_START_FRACTION - SHOCK_STAGE3_START_FRACTION);
        return 0;
      }

      function blackoutDurationForShockStage(stage, stageFraction) {
        var t = localShockStageFraction(stageFraction, stage);
        return stage === 2 ? lerpRange(SHOCK_STAGE2_BLACKOUT_MS, t) : lerpRange(SHOCK_STAGE3_BLACKOUT_MS, t);
      }

      function lucidDurationForShockStage(stage, stageFraction) {
        var t = localShockStageFraction(stageFraction, stage);
        return stage === 2 ? lerpRange(SHOCK_STAGE2_LUCID_MS, t) : lerpRange(SHOCK_STAGE3_LUCID_MS, t);
      }

      function tickShockBlackoutCycle(stageFraction) {
        shockPhaseRemainingMs -= BLOOD_LOSS_DESATURATE_TICK_MS;
        if (shockPhaseRemainingMs > 0) return;
        if (shockBlackoutPhase === 'black') {
          shockBlackoutPhase = 'lucid';
          scope.shockBlackoutVisible = false;
          shockPhaseRemainingMs = lucidDurationForShockStage(scope.shockStage, stageFraction);
        } else {
          shockBlackoutPhase = 'black';
          scope.shockBlackoutVisible = true;
          shockPhaseRemainingMs = blackoutDurationForShockStage(scope.shockStage, stageFraction);
        }
        pushCombinedUnconsciousState();
      }

      function triggerShockDeath() {
        if (scope.deathFadeActive) return;
        clearUnconsciousTimers();
        scope.deathFadeActive = true;
        scope.unconsciousFadeActive = false;
        scope.unconsciousFadeVisible = false;
        scope.blackoutProvisional = false;
        scope.unconsciousCancelling = false;
        scope.shockBlackoutVisible = true;
        scope.fatalInjuryText = 'Fatal injury: blood loss (hypovolemic shock).';
        sendRealisticAudioState({ dead: true, unconscious: true });
        sendRealisticControlState({ unconscious: true, armsBrokenSides: 0, legDegraded: false, shockSluggish: false });
      }

      function isCurrentlyUnconscious() {
        return scope.unconsciousFadeVisible || scope.shockBlackoutVisible;
      }

      function isBleeding() {
        if (scope.patientProgressActive) return scope.patientBleedMlMin > 0;
        return currentBloodLoss !== 'none';
      }

      scope.canUseMedKit = function () {
        return scope.realisticMode
          && scope.medKitAvailable
          && !scope.medKitBusy
          && isBleeding()
          && !scope.unconsciousFadeVisible
          && !scope.deathFadeActive;
      };

      var pendingMedKitTimeout = null;

      scope.useMedKit = function () {
        if (!scope.canUseMedKit()) return;
        scope.medKitBusy = true;
        pushCombinedUnconsciousState();
        pendingMedKitTimeout = trackTimeout($timeout(function () {
          scope.medKitBusy = false;
          scope.medKitAvailable = false;
          medKitActive = true;

          var shockTotalMsNow = SHOCK_PROGRESSION_TOTAL_MS[currentBloodLoss];
          if (shockTotalMsNow) {
            var stage2CapMs = shockTotalMsNow * SHOCK_STAGE2_START_FRACTION * 0.9;
            shockElapsedMs = Math.min(shockElapsedMs * 0.5, stage2CapMs);
          } else {
            shockElapsedMs *= 0.5;
          }
          scope.shockStage = 0;
          scope.shockBlackoutVisible = false;
          shockBlackoutPhase = 'lucid';
          shockPhaseRemainingMs = 0;
          scope.bloodLossDesaturateFraction = Math.min(scope.bloodLossDesaturateFraction, 0.5);
          recomputeVisionStyle();

          if (scope.systemicEffects) {
            scope.systemicEffects = medKitAdjustedSystemicEffects(scope.systemicEffects);
            scope.systemicEffectsView = buildSystemicEffectsView(scope.systemicEffects);
          }
          scope.survival = medKitAdjustedSurvival(scope.survival);

          scope.occupantStateText = deriveOccupantState(lastOccupantStateFlatInjuries, scope.survival, scope.systemicEffects, lastOccupantStateEventMeta);

          pendingMedKitTimeout = null;
          pushCombinedUnconsciousState();

          window.__crashInjuryProStats.medKitsUsed += 1;
          broadcastCrashInjuryProStats();
        }, MED_KIT_USE_DURATION_MS));
      };

      scope.medKitTip = function () {
        if (scope.medKitBusy) return 'Applying med kit\u2026';
        if (!scope.medKitAvailable) return 'Med kit used';
        if (scope.deathFadeActive) return 'Too late';
        if (scope.unconsciousFadeVisible) return 'Knocked out';
        if (!isBleeding()) return 'No bleeding';
        return 'Use med kit';
      };

      scope.medKitTitle = function () {
        if (scope.medKitBusy) return 'Applying the med kit… no vehicle control until this finishes.';
        if (!scope.medKitAvailable) return 'Med kit already used this life -- replenishes on vehicle reset or repair.';
        if (scope.deathFadeActive) return 'Cannot use a med kit -- too late.';
        if (scope.unconsciousFadeVisible) return 'Cannot use a med kit while knocked out.';
        if (!isBleeding()) return 'No bleeding to treat right now.';
        return 'Use med kit -- controls modeled external bleeding. Cannot stop internal organ bleeding, replace lost blood, or heal fractures/head injury. Takes a few seconds with no vehicle control.';
      };

      function pushCombinedUnconsciousState() {
        sendRealisticAudioState({ dead: scope.deathFadeActive, unconscious: isCurrentlyUnconscious() });
        sendRealisticControlState({
          unconscious: isCurrentlyUnconscious(),
          armsBrokenSides: currentArmsBrokenSides,
          legDegraded: currentLegDegraded,
          shockSluggish: currentShockSluggish,
          medKitBusy: scope.medKitBusy
        });
      }

      function recomputeVisionStyle() {
        var standingBlurPx = HEAD_AIS_BLUR_PX[currentHeadAisForBlur] || 0;

        var blurPx = standingBlurPx + wakingRecoveryFraction * (VISION_WAKING_PEAK_BLUR_PX - standingBlurPx);

        var grayscalePct = Math.round(scope.bloodLossDesaturateFraction * 100);

        var blurFraction = scope.settings.blurEnabled ? scope.settings.blurIntensity / 100 : 0;
        blurPx *= blurFraction;
        grayscalePct = Math.round(grayscalePct * blurFraction);

        var hit = (impactBlurFraction || 0) * blurFraction;
        blurPx += hit * IMPACT_BLUR_MAX_PX;
        var dazed = Math.max(hit, (wakingRecoveryFraction || 0) * blurFraction * 0.6);
        var bright = 1 + hit * 0.35;
        var contrast = 1 - dazed * 0.25;
        var sat = 1 - dazed * 0.45;
        grayscalePct = Math.min(100, grayscalePct + Math.round(dazed * 25));
        var filterValue = 'blur(' + blurPx.toFixed(2) + 'px) grayscale(' + grayscalePct + '%)';
        if (dazed > 0.02) filterValue += ' brightness(' + bright.toFixed(2) + ') contrast(' + contrast.toFixed(2) + ') saturate(' + sat.toFixed(2) + ')';

        if (blurPx < 0.05 && grayscalePct === 0 && dazed <= 0.02) {
          scope.visionBlurStyle = NO_STYLE;
        } else {
          var hole = uiHoleClipPath();
          scope.visionBlurStyle = { backdropFilter: filterValue, WebkitBackdropFilter: filterValue };
          if (hole) { scope.visionBlurStyle.clipPath = hole; scope.visionBlurStyle.WebkitClipPath = hole; }
        }

        var tunnel = Math.max(scope.bloodLossDesaturateFraction, dazed * 0.8);
        var innerPct = 100 - tunnel * (100 - VIGNETTE_MIN_INNER_PCT);
        var vignetteOpacity = Math.max(scope.bloodLossDesaturateFraction * VIGNETTE_MAX_OPACITY, dazed * 0.85);
        if (vignetteOpacity <= 0.001) { scope.visionVignetteStyle = NO_STYLE; return; }
        scope.visionVignetteStyle = {
          background: 'radial-gradient(ellipse at center, transparent ' + innerPct.toFixed(1) + '%, rgba(0,0,0,' + vignetteOpacity.toFixed(3) + ') 100%)'
        };
        if (vignetteOpacity > 0.001) {
          var vhole = uiHoleClipPath();
          if (vhole) { scope.visionVignetteStyle.clipPath = vhole; scope.visionVignetteStyle.WebkitClipPath = vhole; }
        }
      }
      var NO_STYLE = {};

      var IMPACT_BLUR_MAX_PX = 10;
      var IMPACT_JOLT_MIN_G = 9;
      var IMPACT_BLUR_DECAY_MS = 2600;
      var impactBlurFraction = 0;
      var lastUiHoleKey = '';
      var lastUiHolePath = null;
      function uiHoleRects() {
        var rects = [];
        var els = [];
        try {
          var app = element[0].querySelector('.cip-app') || document.querySelector('.cip-app');
          if (app) els.push(app);
          var st = document.querySelectorAll('.cip-stats-app');
          for (var i = 0; i < st.length; i++) els.push(st[i]);
        } catch (e) { return rects; }
        for (var j = 0; j < els.length; j++) {
          var r = els[j].getBoundingClientRect();
          if (r.width > 2 && r.height > 2) rects.push(r);
        }
        return rects;
      }
      function uiHoleClipPath() {
        var rects = uiHoleRects();
        if (!rects.length) return null;
        var pad = 6;
        var key = rects.map(function (r) {
          return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(',');
        }).join('|');
        if (key === lastUiHoleKey) return lastUiHolePath;
        var pts = ['0 0', '100% 0', '100% 100%', '0 100%', '0 0'];
        rects.forEach(function (r) {
          var l = Math.round(r.left - pad) + 'px', t = Math.round(r.top - pad) + 'px';
          var rr = Math.round(r.right + pad) + 'px', b = Math.round(r.bottom + pad) + 'px';
          pts.push(l + ' ' + t, rr + ' ' + t, rr + ' ' + b, l + ' ' + b, l + ' ' + t, '0 0');
        });
        lastUiHoleKey = key;
        lastUiHolePath = 'polygon(evenodd, ' + pts.join(', ') + ')';
        return lastUiHolePath;
      }
      var impactBlurPeak = 0, impactBlurAt = 0, impactBlurHoldMs = IMPACT_BLUR_DECAY_MS;
      function kickImpactBlur(peakG) {
        if (!(peakG > 5)) return;

        var f = Math.min(1, 0.25 + 0.75 * (peakG - 5) / 30);
        if (f <= impactBlurFraction) return;
        impactBlurPeak = f;
        impactBlurFraction = f;
        impactBlurAt = Date.now();
        impactBlurHoldMs = 1500 + f * IMPACT_BLUR_DECAY_MS;
        startRealisticEffectsTicker();
      }

      scope.visionOverlaysVisible = function () {
        if (!scope.realisticMode || scope.viewingReportPostMortem) return false;

        if (scope.fullscreen) return false;
        return true;
      };

      function computeAudioBlurAndVolume() {
        var standingBlur = HEAD_AIS_AUDIO_BLUR[currentHeadAisForBlur] || 0;
        var standingVolumeMult = HEAD_AIS_MASTER_VOLUME_MULT[currentHeadAisForBlur];
        if (standingVolumeMult == null) standingVolumeMult = 1;
        var impairment = Math.max(ringingFraction, wakingRecoveryFraction);
        return {
          blur: standingBlur + impairment * (AUDIO_IMPAIRMENT_PEAK_BLUR - standingBlur),
          volumeMult: standingVolumeMult + impairment * (AUDIO_IMPAIRMENT_PEAK_VOLUME_MULT - standingVolumeMult)
        };
      }

      var ringingAudioCtx = null;
      var ringingAudioBuffer = null;
      var ringingAudioBufferLoadPromise = null;
      var ringingSourceNode = null;
      var ringingGainNode = null;

      function ensureRingingAudioContext() {
        if (ringingAudioCtx) return ringingAudioCtx;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ringingAudioCtx = new AC({ latencyHint: 'playback' });
        } catch (e) {
          console.warn('[CrashInjuryPro] AudioContext creation failed:', e);
          ringingAudioCtx = null;
        }
        return ringingAudioCtx;
      }

      function loadRingingBuffer() {
        var ctx = ensureRingingAudioContext();
        if (!ctx) return Promise.resolve(null);
        if (ringingAudioBuffer) return Promise.resolve(ringingAudioBuffer);
        if (ringingAudioBufferLoadPromise) return ringingAudioBufferLoadPromise;
        ringingAudioBufferLoadPromise = new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.onload = function () {
            if (xhr.status !== 200 && xhr.status !== 0) { reject(new Error('tinnitus WAV XHR status ' + xhr.status)); return; }
            ctx.decodeAudioData(xhr.response, function (buffer) {
              ringingAudioBuffer = buffer;
              resolve(buffer);
            }, function (err) { reject(err || new Error('decodeAudioData failed')); });
          };
          xhr.onerror = function () { reject(new Error('tinnitus WAV XHR network error')); };
          xhr.responseType = 'arraybuffer';
          xhr.open('GET', '/art/sound/crashInjuryProTinnitus.wav', true);
          xhr.send();
        }).catch(function (err) {
          console.warn('[CrashInjuryPro] failed to load tinnitus tone:', err);
          ringingAudioBufferLoadPromise = null;
          return null;
        });
        return ringingAudioBufferLoadPromise;
      }

      function startRingingTone() {
        if (ringingSourceNode) return;
        var ctx = ensureRingingAudioContext();
        if (!ctx) return;
        loadRingingBuffer().then(function (buffer) {
          if (!buffer || ringingSourceNode) return;
          var source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          var gain = ctx.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start(0);
          ringingSourceNode = source;
          ringingGainNode = gain;
          updateRingingGain(ringingFraction);
        });
      }

      function updateRingingGain(fraction) {
        if (!ringingGainNode || !ringingAudioCtx) return;
        var target = Math.max(0, Math.min(1, fraction)) * RINGING_TONE_PEAK_GAIN * gameMasterVolume;

        ringingGainNode.gain.linearRampToValueAtTime(target, ringingAudioCtx.currentTime + BLOOD_LOSS_DESATURATE_TICK_MS / 1000);
      }

      function stopRingingTone() {
        if (ringingSourceNode) {
          try { ringingSourceNode.stop(0); } catch (e) {}
          ringingSourceNode.disconnect();
          ringingSourceNode = null;
        }
        if (ringingGainNode) {
          ringingGainNode.disconnect();
          ringingGainNode = null;
        }
      }

      function realisticEffectsTick() {
        var visionDirty = false;
        var audioDirty = false;
        if (impactBlurFraction > 0) {
          var ibT = (Date.now() - impactBlurAt) / impactBlurHoldMs;
          impactBlurFraction = ibT >= 1 ? 0 : impactBlurPeak * (1 - ibT) * (1 - ibT);
          visionDirty = true;
        }
        if (scope.realisticMode && scope.visionBlurStyle && scope.visionBlurStyle.backdropFilter && uiHoleClipPath() !== scope.visionBlurStyle.clipPath) visionDirty = true;

        var shockTotalMs = SHOCK_PROGRESSION_TOTAL_MS[currentBloodLoss];
        if (shockTotalMs && !scope.deathFadeActive) {
          if (scope.patientProgressActive) {
            shockElapsedMs = shockTotalMs * Math.min(1, patientState.bloodLostM3 / (currentOccupant().massKg * 0.00007 * 0.6));
          } else if (medKitActive) {
            shockElapsedMs = Math.max(0, shockElapsedMs - MED_KIT_RECOVERY_TICK_MS);
          } else {
            shockElapsedMs += BLOOD_LOSS_DESATURATE_TICK_MS;
          }
          var stageFraction = Math.min(1, shockElapsedMs / shockTotalMs);

          var stage1Fraction = Math.min(1, stageFraction / SHOCK_STAGE2_START_FRACTION);
          if (scope.bloodLossDesaturateFraction !== stage1Fraction) {
            scope.bloodLossDesaturateFraction = stage1Fraction;
            visionDirty = true;
          }

          var newShockStage = stageFraction >= SHOCK_STAGE4_START_FRACTION ? 4
            : stageFraction >= SHOCK_STAGE3_START_FRACTION ? 3
            : stageFraction >= SHOCK_STAGE2_START_FRACTION ? 2
            : 1;
          if (newShockStage !== scope.shockStage) {
            var enteringStage2Or3 = (newShockStage === 2 || newShockStage === 3) && scope.shockStage < 2;
            scope.shockStage = newShockStage;
            if (newShockStage === 4) {
              triggerShockDeath();
            } else if (enteringStage2Or3) {
              shockBlackoutPhase = 'lucid';
              shockPhaseRemainingMs = lucidDurationForShockStage(newShockStage, stageFraction);
            }
          }

          if ((scope.shockStage === 2 || scope.shockStage === 3) && !scope.deathFadeActive) {
            tickShockBlackoutCycle(stageFraction);
          }
        }

        if (ringingFraction > 0) {
          var ringingDurationMs = scaleByHeadAis(currentHeadAisForBlur, RINGING_DURATION_MS_MIN, RINGING_DURATION_MS_MAX, TINNITUS_HEAD_AIS_THRESHOLD);
          ringingFraction = Math.max(0, ringingFraction - BLOOD_LOSS_DESATURATE_TICK_MS / ringingDurationMs);
          audioDirty = true;

          gameMasterVolumePollElapsedMs += BLOOD_LOSS_DESATURATE_TICK_MS;
          if (gameMasterVolumePollElapsedMs >= GAME_MASTER_VOLUME_POLL_INTERVAL_MS) {
            gameMasterVolumePollElapsedMs = 0;
            refreshGameMasterVolume();
          }
          updateRingingGain(ringingFraction);
          if (ringingFraction <= 0) stopRingingTone();
        }

        if (wakingRecoveryFraction > 0) {
          var wakingDurationMs = scaleByHeadAis(currentHeadAisForBlur, WAKING_RECOVERY_MS_MIN, WAKING_RECOVERY_MS_MAX, 0);
          wakingRecoveryFraction = Math.max(0, wakingRecoveryFraction - BLOOD_LOSS_DESATURATE_TICK_MS / wakingDurationMs);
          visionDirty = true;
          audioDirty = true;
        }

        var dizzyTarget = scope.dizzyActive ? 1 : 0;
        if (scope.dizzyFraction !== dizzyTarget) {
          var dizzyRateMs = scope.dizzyFraction < dizzyTarget ? DIZZY_ONSET_MS : DIZZY_RECOVERY_MS;
          var dizzyStep = BLOOD_LOSS_DESATURATE_TICK_MS / dizzyRateMs;
          scope.dizzyFraction = scope.dizzyFraction < dizzyTarget
            ? Math.min(dizzyTarget, scope.dizzyFraction + dizzyStep)
            : Math.max(dizzyTarget, scope.dizzyFraction - dizzyStep);
          scope.dizzyStyle = { opacity: scope.dizzyFraction };
        }

        if (visionDirty) recomputeVisionStyle();

        if (audioDirty) sendRealisticAudioState({ dead: scope.deathFadeActive, unconscious: isCurrentlyUnconscious() });
      }

      function repaintSoon() {
        if (typeof scope.$applyAsync === 'function') scope.$applyAsync();
        else if (!scope.$$phase && !(scope.$root && scope.$root.$$phase)) { try { scope.$apply(); } catch (e) {} }
      }
      var simPaused = false;
      var pauseStartMs = 0;
      var heldTimerFns = [];
      function pauseSafe(fn) {
        return function () {
          if (simPaused) { heldTimerFns.push({ fn: fn, left: Math.max(0, Date.now() - pauseStartMs) }); return; }
          fn();
        };
      }
      function dropHeldTimers() { heldTimerFns = []; }
      function setSimPaused(paused) {
        paused = !!paused;
        if (paused === simPaused) return;
        simPaused = paused;
        if (paused) {
          pauseStartMs = Date.now();
          portalRoot.classList.add('cip-sim-paused');
          updateRingingGain(0);
        } else {
          portalRoot.classList.remove('cip-sim-paused');
          var held = heldTimerFns;
          heldTimerFns = [];
          held.forEach(function (h) { trackTimeout($timeout(pauseSafe(h.fn), h.left)); });
          if (ringingFraction > 0) updateRingingGain(ringingFraction);
        }
      }
      scope.$on('physicsStateChanged', function (event, running) {
        if (staleInstance()) return;
        setSimPaused(running === false || running === 0 || running === 'false');
      });

      var lastImpactJoltMs = 0, lastImpactJoltG = 0;
      scope.$on('CrashInjuryProImpact', function (event, payload) {
        if (staleInstance() || simPaused || !scope.realisticMode) return;
        var g = payload && Number(payload.peakG);
        if (!(g >= IMPACT_JOLT_MIN_G)) return;

        var now = Date.now();
        if (now - lastImpactJoltMs < 900 && g < lastImpactJoltG * 1.5) return;
        lastImpactJoltMs = now;
        lastImpactJoltG = g;
        kickImpactBlur(g);
        recomputeVisionStyle();
        repaintSoon();
        if (!scope.settings || !scope.settings.overlaysEnabled) return;
        var el = portalRoot.querySelector('.cip-impact-overlay');
        if (!el) return;
        var inner = el.querySelector('.cip-impact-inner');
        var strength = Math.max(0.35, Math.min(0.9, (g - IMPACT_JOLT_MIN_G) / 30 + 0.35));
        if (inner) inner.style.opacity = strength.toFixed(2);
        el.classList.remove('cip-hit');
        void el.offsetWidth;
        el.classList.add('cip-hit');
      });

      function tickSignature() {
        return [scope.shockStage, scope.shockBlackoutVisible, scope.bloodLossDesaturateFraction, scope.dizzyFraction,
          scope.deathFadeActive, scope.unconsciousFadeVisible, scope.unconsciousFadeActive, scope.visionBlurStyle,
          scope.visionVignetteStyle, scope.dizzyStyle, scope.painPulseActive, scope.medKitBusy, scope.medKitAvailable];
      }
      function tickAndRepaint() {
        if (simPaused || staleInstance()) return;
        var before = tickSignature();
        realisticEffectsTick();
        var after = tickSignature();
        for (var i = 0; i < before.length; i++) {
          if (before[i] !== after[i]) { repaintSoon(); return; }
        }
      }
      function startRealisticEffectsTicker() {
        if (bloodLossDesaturateIntervalPromise) return;
        bloodLossDesaturateIntervalPromise = $interval(tickAndRepaint, BLOOD_LOSS_DESATURATE_TICK_MS, 0, false);
      }
      function stopRealisticEffectsTicker() {
        if (!bloodLossDesaturateIntervalPromise) return;
        $interval.cancel(bloodLossDesaturateIntervalPromise);
        bloodLossDesaturateIntervalPromise = null;
      }

      function sendRealisticModeEnabledToGE() {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
        window.bngApi.engineLua('extensions.crashInjuryPro.setRealisticModeEnabled(' + (scope.realisticMode ? 'true' : 'false') + ')');
      }

      scope.toggleRealisticMode = function () {
        scope.realisticMode = !scope.realisticMode;
        sendRealisticModeEnabledToGE();
        if (scope.realisticMode) {
          startRealisticEffectsTicker();

          ensureRingingAudioContext();
          loadRingingBuffer();
          refreshGameMasterVolume();
        } else {
          stopRealisticEffectsTicker();
          stopRingingTone();

          sendRealisticAudioState({ dead: false, unconscious: false });
          sendRealisticControlState({ unconscious: false, armsBrokenSides: 0, legDegraded: false, shockSluggish: false });
        }
      };

      var tinnitusTriggeredThisSession = false;

      function sendRealisticAudioState(state) {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') {
          return;
        }
        var audio = state.dead ? { blur: 0, volumeMult: 0 } : computeAudioBlurAndVolume();
        var payload = {
          dead: !!state.dead,
          unconscious: !!state.unconscious,
          blur: audio.blur,
          volumeMult: audio.volumeMult
        };
        var jsonStr = JSON.stringify(payload);

        window.bngApi.engineLua('extensions.crashInjuryPro.setRealisticAudioState(' + JSON.stringify(jsonStr) + ')');
      }

      var ARM_REGIONS = { upperArm: 1, forearm: 1, wrist: 1, hand: 1 };
      var LEG_REGIONS = { femur: 1, lowerLeg: 1, ankle: 1, foot: 1 };
      var CONTROL_MIN_AIS = 2;

      function countBrokenArmSides(flatInjuries) {
        var sides = {};
        flatInjuries.forEach(function (inj) {
          if (!ARM_REGIONS[inj.region] || inj.aisSeverity < CONTROL_MIN_AIS) return;
          var text = (inj.plainDescription || '').toLowerCase();
          if (text.indexOf('left') !== -1) sides.left = true;
          else if (text.indexOf('right') !== -1) sides.right = true;
          else sides.unknown = true;
        });
        var count = (sides.left ? 1 : 0) + (sides.right ? 1 : 0) + (sides.unknown ? 1 : 0);
        return Math.min(2, count);
      }

      function hasLegInjury(flatInjuries) {
        return flatInjuries.some(function (inj) {
          return LEG_REGIONS[inj.region] && inj.aisSeverity >= CONTROL_MIN_AIS;
        });
      }

      function sendRealisticControlState(state) {
        if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
        var payload = {
          unconscious: !!state.unconscious,
          armsBrokenSides: state.armsBrokenSides || 0,
          legDegraded: !!state.legDegraded,
          shockSluggish: !!state.shockSluggish,

          medKitBusy: !!state.medKitBusy
        };
        var jsonStr = JSON.stringify(payload);
        window.bngApi.engineLua('extensions.crashInjuryPro.setRealisticControlState(' + JSON.stringify(jsonStr) + ')');
      }

      var pendingUnconsciousRecoverTimeout = null;
      var pendingUnconsciousHideTimeout = null;

      function clearUnconsciousTimers() {
        if (typeof clearRelapses === 'function') clearRelapses();
        if (typeof dropHeldTimers === 'function') dropHeldTimers();
        if (pendingUnconsciousRecoverTimeout) {
          $timeout.cancel(pendingUnconsciousRecoverTimeout);
          var idx1 = pendingTimeouts.indexOf(pendingUnconsciousRecoverTimeout);
          if (idx1 !== -1) pendingTimeouts.splice(idx1, 1);
          pendingUnconsciousRecoverTimeout = null;
        }
        if (pendingUnconsciousHideTimeout) {
          $timeout.cancel(pendingUnconsciousHideTimeout);
          var idx2 = pendingTimeouts.indexOf(pendingUnconsciousHideTimeout);
          if (idx2 !== -1) pendingTimeouts.splice(idx2, 1);
          pendingUnconsciousHideTimeout = null;
        }
      }

      function cancelPendingMedKitUse() {
        if (pendingMedKitTimeout) {
          $timeout.cancel(pendingMedKitTimeout);
          var idx = pendingTimeouts.indexOf(pendingMedKitTimeout);
          if (idx !== -1) pendingTimeouts.splice(idx, 1);
          pendingMedKitTimeout = null;
        }
        scope.medKitBusy = false;
      }

      function resetRealisticOverlay() {
        clearUnconsciousTimers();
        cancelPendingMedKitUse();
        scope.medKitAvailable = true;
        medKitActive = false;
        scope.deathFadeActive = false;
        scope.fatalInjuryText = '';
        scope.deathScreenDismissed = false;
        scope.unconsciousFadeActive = false;
        scope.unconsciousFadeVisible = false;
        scope.blackoutProvisional = false;
        scope.unconsciousCancelling = false;
        pendingProvisionalKnockoutMs = null;
        scope.visionBlurStyle = {};
        scope.visionVignetteStyle = {};
        scope.painPulseActive = false;
        scope.painPulseStyle = {};
        scope.dizzyActive = false;
        scope.dizzyFraction = 0;
        scope.dizzyStyle = {};
        scope.bloodLossDesaturateFraction = 0;

        scope.shockStage = 0;
        scope.shockBlackoutVisible = false;
        shockElapsedMs = 0;
        shockBlackoutPhase = 'lucid';
        shockPhaseRemainingMs = 0;
        currentBloodLoss = 'none';
        currentHeadAisForBlur = 0;

        ringingFraction = 0;
        wakingRecoveryFraction = 0;
        stopRingingTone();
        currentArmsBrokenSides = 0;
        currentLegDegraded = false;
        currentShockSluggish = false;
        tinnitusTriggeredThisSession = false;

        if (scope.realisticMode) {
          sendRealisticAudioState({ dead: false, unconscious: false });
          sendRealisticControlState({ unconscious: false, armsBrokenSides: 0, legDegraded: false, shockSluggish: false });
        }
      }

      function triggerProvisionalBlackout() {
        if (scope.deathFadeActive) return;
        if (scope.unconsciousFadeVisible) return;
        clearUnconsciousTimers();
        scope.unconsciousFadeVisible = true;
        scope.unconsciousFadeActive = true;
        scope.blackoutProvisional = true;
        scope.unconsciousCancelling = false;

        wakingRecoveryFraction = 0;

        sendRealisticAudioState({ dead: false, unconscious: true });
        sendRealisticControlState({ unconscious: true, armsBrokenSides: 0, legDegraded: false, shockSluggish: false });
      }

      var provisionalCancelTimer = null;
      var PROVISIONAL_SETTLE_MS = 1200;
      var NEAR_DEATH_PERCENT = 12;
      var NEAR_DEATH_MAX_EXTRA_MS = 15000;
      function nearDeath() {
        var s = scope.survival ? Number(scope.survival.survivalProbabilityPercent) : 100;
        if (!isFinite(s)) s = 100;
        var lowest = patientState && isFinite(patientState.lowestSurvivalPercent) ? patientState.lowestSurvivalPercent : 100;
        return Math.min(s, lowest) < NEAR_DEATH_PERCENT;
      }
      function scheduleProvisionalCancel() {
        if (provisionalCancelTimer) $timeout.cancel(provisionalCancelTimer);
        provisionalCancelTimer = trackTimeout($timeout(pauseSafe(function () {
          provisionalCancelTimer = null;
          if (!scope.blackoutProvisional || scope.deathFadeActive) return;
          if (Date.now() - lastBufferMs < PROVISIONAL_SETTLE_MS - 50 || bufferQueue.length) { scheduleProvisionalCancel(); return; }
          cancelProvisionalBlackout();
        }), PROVISIONAL_SETTLE_MS));
      }
      function cancelProvisionalBlackout() {
        if (!scope.blackoutProvisional) return;
        if (scope.realisticMode && nearDeath()) { triggerUnconsciousness(); return; }
        clearUnconsciousTimers();
        scope.blackoutProvisional = false;
        scope.unconsciousCancelling = true;
        scope.unconsciousFadeActive = false;
        sendRealisticAudioState({ dead: false, unconscious: false });
        sendRealisticControlState({ unconscious: false, armsBrokenSides: currentArmsBrokenSides, legDegraded: currentLegDegraded, shockSluggish: currentShockSluggish });
        pendingUnconsciousHideTimeout = trackTimeout($timeout(pauseSafe(function () {
          scope.unconsciousFadeVisible = false;
          scope.unconsciousCancelling = false;
        }), PROVISIONAL_CANCEL_FADE_MS));
      }

      function triggerUnconsciousness() {
        if (scope.deathFadeActive) return;

        if (scope.unconsciousFadeVisible && !scope.blackoutProvisional) return;
        clearUnconsciousTimers();
        scope.unconsciousFadeVisible = true;
        scope.unconsciousFadeActive = true;
        scope.blackoutProvisional = false;
        scope.unconsciousCancelling = false;
        wakingRecoveryFraction = 0;

        sendRealisticAudioState({ dead: false, unconscious: true });

        sendRealisticControlState({ unconscious: true, armsBrokenSides: 0, legDegraded: false, shockSluggish: false });
        var extraHoldMs = 0;
        pendingUnconsciousRecoverTimeout = trackTimeout($timeout(pauseSafe(function wake() {
          if (scope.deathFadeActive) return;
          if (nearDeath() && extraHoldMs < NEAR_DEATH_MAX_EXTRA_MS) {
            extraHoldMs += 1500;
            pendingUnconsciousRecoverTimeout = trackTimeout($timeout(pauseSafe(wake), 1500));
            return;
          }
          scope.unconsciousFadeActive = false;

          wakingRecoveryFraction = 1;
          recomputeVisionStyle();

          if (scope.realisticMode) { ringingFraction = Math.max(ringingFraction, 1); startRingingTone(); }

          scheduleKnockoutRelapses();

          sendRealisticAudioState({ dead: false, unconscious: false });
          sendRealisticControlState({ unconscious: false, armsBrokenSides: currentArmsBrokenSides, legDegraded: currentLegDegraded, shockSluggish: currentShockSluggish });
          pendingUnconsciousHideTimeout = trackTimeout($timeout(pauseSafe(function () {
            scope.unconsciousFadeVisible = false;
          }), UNCONSCIOUS_FADE_OUT_MS));
        }), knockoutHoldMs()));
      }

      function knockoutHoldMs() {
        var a = currentHeadAisForBlur || 0;
        return Math.max(UNCONSCIOUS_BLACKOUT_MS, Math.min(16000, 3000 + 2500 * Math.max(0, a - 1)));
      }
      var relapseTimers = [];
      function clearRelapses() {
        relapseTimers.forEach(function (p) { $timeout.cancel(p); });
        relapseTimers = [];
      }
      function scheduleKnockoutRelapses() {
        clearRelapses();
        var a = currentHeadAisForBlur || 0;
        var n = a >= 4 ? 2 : a >= 2 ? 1 : 0;
        var at = 4500;
        for (var i = 0; i < n; i++) {
          (function (delay, hold) {
            relapseTimers.push(trackTimeout($timeout(pauseSafe(function () {
              if (scope.deathFadeActive || !scope.realisticMode) return;
              if (pendingUnconsciousHideTimeout) { $timeout.cancel(pendingUnconsciousHideTimeout); pendingUnconsciousHideTimeout = null; }
              scope.unconsciousFadeVisible = true;
              scope.unconsciousFadeActive = true;
              sendRealisticAudioState({ dead: false, unconscious: true });
              relapseTimers.push(trackTimeout($timeout(pauseSafe(function () {
                if (scope.deathFadeActive) return;
                scope.unconsciousFadeActive = false;
                wakingRecoveryFraction = Math.max(wakingRecoveryFraction, 0.9);
                recomputeVisionStyle();
                sendRealisticAudioState({ dead: false, unconscious: false });
                pendingUnconsciousHideTimeout = trackTimeout($timeout(pauseSafe(function () {
                  scope.unconsciousFadeVisible = false;
                }), UNCONSCIOUS_FADE_OUT_MS));
              }), hold)));
            }), delay)));
          })(at, 1600 + 900 * i);
          at += 6500;
        }
      }

      function worstAisForRegion(flatInjuries, region) {
        var worst = 0;
        flatInjuries.forEach(function (inj) {
          if (inj.region === region && inj.aisSeverity > worst) worst = inj.aisSeverity;
        });
        return worst;
      }

      function updateRealisticOverlay(report, flatInjuries) {
        if (!scope.realisticMode) {
          resetRealisticOverlay();
          return;
        }

        var outlook = report.survival ? report.survival.outlook : null;
        var effects = report.systemicEffects || {};
        var consciousness = effects.consciousness ? effects.consciousness.level : 'alert';
        var bloodLoss = effects.bloodLoss ? effects.bloodLoss.level : 'none';
        var pain = effects.pain ? effects.pain.level : 'none';
        var shock = effects.shock ? effects.shock.level : 'none';

        if (outlook === 'notSurvivable') {
          clearUnconsciousTimers();
          scope.deathFadeActive = true;
          scope.unconsciousFadeActive = false;
          scope.unconsciousFadeVisible = false;
          var worst = null;
          flatInjuries.forEach(function (inj) {
            if (!worst || inj.aisSeverity > worst.aisSeverity) worst = inj;
          });
          scope.fatalInjuryText = worst ? ('Fatal injury: ' + hudLabel(worst)) : 'This crash was not survivable.';
        } else {
          scope.deathFadeActive = false;
          scope.fatalInjuryText = '';
          scope.deathScreenDismissed = false;

          if (consciousness === 'unresponsive') {
            triggerUnconsciousness();
          } else if (scope.blackoutProvisional) {
            scheduleProvisionalCancel();
          }
        }

        var headAis = worstAisForRegion(flatInjuries, 'head');
        currentHeadAisForBlur = headAis;
        currentBloodLoss = bloodLoss;
        recomputeVisionStyle();

        scope.dizzyActive = (isRotatingPdofSignature(sessionEventMeta) || headAis >= DIZZY_HEAD_AIS_THRESHOLD) &&
          !scope.deathFadeActive && !scope.unconsciousFadeVisible;

        var pulse = PAIN_PULSE[pain];
        if (pulse) {
          scope.painPulseActive = true;
          scope.painPulseStyle = {
            animationDuration: pulse.durationS + 's',
            background: 'radial-gradient(ellipse at center, transparent 55%, rgba(139,20,20,' + pulse.peakOpacity + ') 100%)'
          };
        } else {
          scope.painPulseActive = false;
          scope.painPulseStyle = {};
        }

        if (headAis >= TINNITUS_HEAD_AIS_THRESHOLD && !tinnitusTriggeredThisSession) {
          tinnitusTriggeredThisSession = true;
          ringingFraction = 1;
          refreshGameMasterVolume();
          startRingingTone();
        }

        sendRealisticAudioState({ dead: scope.deathFadeActive, unconscious: scope.unconsciousFadeVisible });

        currentArmsBrokenSides = countBrokenArmSides(flatInjuries);
        currentLegDegraded = hasLegInjury(flatInjuries);
        currentShockSluggish = shock === 'decompensated';
        sendRealisticControlState({
          unconscious: scope.unconsciousFadeVisible,
          armsBrokenSides: currentArmsBrokenSides,
          legDegraded: currentLegDegraded,
          shockSluggish: currentShockSluggish
        });
      }

      function enterReportState(report) {
        scope.hudState = 'report';

        scope.notifications = [];

        var dedupedInjuries = displayInjuriesFor(report);

        scope.reportInjuries = disambiguateRowTitles(dedupedInjuries.slice().sort(function (a, b) {
          return (b.aisSeverity || 0) - (a.aisSeverity || 0);
        }).map(buildReportRow));

        var adjustedSystemicEffects = medKitAdjustedSystemicEffects(report.systemicEffects);
        scope.systemicEffects = adjustedSystemicEffects || null;
        scope.systemicEffectsView = conditionView(adjustedSystemicEffects, dedupedInjuries,
          !!(scope.survival && scope.survival.outlook === 'notSurvivable'));

        updateFigureColors(dedupedInjuries);

        refreshReportSeats();

        if (pendingImpactStartMs !== null) {
          var latencyMs = Date.now() - pendingImpactStartMs;
          scope.debugLatencyMs = latencyMs;
          pendingImpactStartMs = null;
        }
      }

      function playEventNotifications(eventReports, onSettle, impactStartMs, eventMetaList) {
        if (scope.multiOccupant()) {
          landAllInjuriesNow(eventReports);
          if (typeof onSettle === 'function') onSettle();
          return;
        }
        var elapsedMs = 0;
        var prevEventStartS = null;

        var NOTIF_TOTAL_BUDGET_MS = 2600;
        var totalRowCount = 0;
        eventReports.forEach(function (er) {
          totalRowCount += ((er && er.injuries) || []).length;
        });
        var rowStaggerMs = totalRowCount > 0
          ? Math.min(NOTIF_ROW_STAGGER_MS, NOTIF_TOTAL_BUDGET_MS / totalRowCount)
          : NOTIF_ROW_STAGGER_MS;

        var impactStartMsSnapshot = impactStartMs != null ? impactStartMs : null;
        var firstInjuryLatencyCaptured = false;

        eventReports.forEach(function (er, eventListIdx) {
          var flatInjuries = (er.injuries || []).map(toFlatInjury);
          if (flatInjuries.length === 0) return;

          var startTimeS = er.event ? er.event.startTimeS : 0;
          if (prevEventStartS !== null) {
            var gapMs = (startTimeS - prevEventStartS) * 1000;
            elapsedMs += Math.min(Math.max(gapMs, 0), NOTIF_EVENT_GAP_CAP_MS);
          }
          prevEventStartS = startTimeS;

          flatInjuries.forEach(function (injury, j) {
            var delay = elapsedMs + j * rowStaggerMs;
            var isFirstInjuryOfBatch = !firstInjuryLatencyCaptured;
            if (isFirstInjuryOfBatch) {
              firstInjuryLatencyCaptured = true;

              scope.debugFirstInjuryScheduleMs = delay;
            }
            trackTimeout($timeout(function () {
              if (isFirstInjuryOfBatch && impactStartMsSnapshot !== null) {
                scope.debugFirstInjuryLatencyMs = Date.now() - impactStartMsSnapshot;
              }
              landInjury(injury);
            }, delay));
          });
          elapsedMs += flatInjuries.length * rowStaggerMs;
        });

        if (pendingSettleTimeout) {
          $timeout.cancel(pendingSettleTimeout);
          var idx = pendingTimeouts.indexOf(pendingSettleTimeout);
          if (idx !== -1) pendingTimeouts.splice(idx, 1);
        }

        pendingSettleTimeout = trackTimeout($timeout(onSettle, elapsedMs + NOTIF_VISIBLE_MS + NOTIF_FADE_MS + REPORT_SETTLE_DELAY_MS));
      }

      function startNewSequence(report, impactStartMs) {
        resetUiForNewSequence();
        scope.hudState = 'notifying';

        var flat = flattenReportInjuries(report);
        updateOccupantState(flat, report, sessionEventMeta);
        lastFullReport = report;
        updateHeadlineSurvival(report);
        updateRealisticOverlay(report, flat);

        updateFigureColors(displayInjuriesFor(report));

        playEventNotifications(report.events, function () { enterReportState(lastFullReport || report); }, impactStartMs, sessionEventMeta);
      }

      function appendToSequence(report, newEventCount, impactStartMs) {
        var anyNew = newEventCount > 0 && report.events.slice(report.events.length - newEventCount)
          .some(function (er) { return er && er.injuries && er.injuries.length; });
        if (!anyNew) {
          var flat0 = flattenReportInjuries(report);
          updateOccupantState(flat0, report, sessionEventMeta);
          lastFullReport = report;
          updateHeadlineSurvival(report);
          updateRealisticOverlay(report, flat0);
          if (scope.hudState === 'report') enterReportState(report);
          else if (scope.hudState === 'idle') startNewSequence(report, impactStartMs);

          return;
        }
        var newEvents = report.events.slice(report.events.length - newEventCount);

        var newEventMeta = sessionEventMeta.slice(sessionEventMeta.length - newEventCount);
        scope.hudState = 'notifying';
        var flat = flattenReportInjuries(report);
        updateOccupantState(flat, report, sessionEventMeta);
        lastFullReport = report;
        updateHeadlineSurvival(report);
        updateRealisticOverlay(report, flat);

        updateFigureColors(displayInjuriesFor(report));
        playEventNotifications(newEvents, function () { enterReportState(lastFullReport || report); }, impactStartMs, newEventMeta);
      }

      function handleIngestResult(result, impactStartMs) {
        if (!result) return;
        if (result.isNewSession) {
          startNewSequence(result.report, impactStartMs);
        } else {
          appendToSequence(result.report, result.newEventCount, impactStartMs);
        }
      }

      paintFigureBase();

      scope.$on('CrashInjuryProProvisionalKnockout', function (event, payload) {
        if (staleInstance()) return;

        pendingProvisionalKnockoutMs = Date.now();
        if (!scope.realisticMode) return;
        triggerProvisionalBlackout();
      });

      var pendingExposureS = 0;
      var lastExposureRunMs = 0;
      var exposureHandler = function (event, payload) {
        if (staleInstance()) return;
        if (!payload) return;
        recordForReplay('x', payload);
        try {
          var P = window.CrashInjuryProPipeline;
          if (!P || typeof P.computeFireInjuries !== 'function') return;
          var elapsedS = 0;
          if (Number.isFinite(payload.simulationTimeS)) {
            if (patientClockS !== null && payload.simulationTimeS >= patientClockS) elapsedS = payload.simulationTimeS - patientClockS;
            patientClockS = payload.simulationTimeS;
          }
          if (Number.isFinite(payload.fireDoseS)) patientFireDoseS = Math.max(patientFireDoseS, payload.fireDoseS);

          pendingExposureS += elapsedS;
          var hazardNow = (payload.fireAvailable && (payload.fireSecondsExposed || 0) > 0) || (payload.waterAvailable && (payload.submergedSeconds || 0) > 0);
          if (!cipReplaying && !hazardNow) {
            var nowX = Date.now();
            if (nowX - lastBufferMs < 1200 || bufferQueue.length || nowX - lastExposureRunMs < 1500) return;
            lastExposureRunMs = nowX;
          }
          elapsedS = pendingExposureS;
          pendingExposureS = 0;

          if (payload.fireAvailable && (payload.fireSecondsExposed || 0) > sessionFireSeconds) {
            sessionFireSeconds = payload.fireSecondsExposed;
          }
          if (payload.fireAvailable && (payload.fireIntensity || 0) > sessionFireIntensity) {
            sessionFireIntensity = payload.fireIntensity;
          }
          if (payload.waterAvailable && (payload.submergedSeconds || 0) > sessionSubmergedSeconds) {
            sessionSubmergedSeconds = payload.submergedSeconds;
            sessionWasSubmerged = !!payload.fullySubmerged;
          }

          try { tickPassengerExposure(elapsedS); } catch (paxErr) { console.error('[CrashInjuryPro] passenger exposure pass failed:', paxErr); }
          if (scope.fullscreen) refreshReportSeats();
          if (sessionFireSeconds <= 0 && sessionSubmergedSeconds <= 0 && sessionInjuries.length === 0) return;

          var occupant = currentOccupant();
          var exposureInjuries = exposureInjuriesFor(occupant, 0);
          if (exposureInjuries.length === 0 && sessionInjuries.length === 0) return;

          var events = sessionEvents.length > 0 ? sessionEvents : [{ startIndex: 0, endIndex: 1, startTimeS: 0, endTimeS: 1 }];

          var report = makePatientReport(occupant, events, elapsedS);
          var kept = patientExposureInjuries;

          for (var i = 0; i < kept.length; i++) landInjury(kept[i]);

          var flat = flattenReportInjuries(report);
          updateOccupantState(flat, report, sessionEventMeta);
          updateHeadlineSurvival(report);
          updateRealisticOverlay(report, flat);
          lastFullReport = report;

          if (scope.hudState !== 'notifying') enterReportState(report);
        } catch (e) {
          console.error('[CrashInjuryPro] exposure tick failed:', e);
        }
      };
      scope.$on('CrashInjuryProExposure', exposureHandler);

      var lastScoredRollQt = 0;

      var replayFinalItem = false;
      function quietBufferCanSkip(trace, payload, rollover, vertBefore) {
        if ((cipReplaying && replayFinalItem) || !sessionEvents.length) return false;
        var vertNow = (sessionFloorDvMs || 0) + (sessionRoofDvMs || 0) + (sessionRoofwardDvMs || 0);
        if (vertNow > vertBefore + 0.01) return false;
        if (payloadPeakG(payload) >= 15) return false;
        var m0 = rawTracePdofDeg(trace);

        if (isOwnHit(m0 ? m0.deltaVMs : 0, tracePeakG(trace))) return false;
        if (drainBacklog || cipReplaying) {
          if (bufferCrush) {
            for (var zb in bufferCrush) {
              if (Object.prototype.hasOwnProperty.call(bufferCrush, zb) && bufferCrush[zb] > 0.08) return false;
            }
          }
          return true;
        }
        var m = rawTracePdofDeg(trace);
        var dv = m ? m.deltaVMs : 0;
        if (isOwnHit(dv, tracePeakG(trace))) return false;
        if (bufferCrush) {
          for (var z in bufferCrush) {
            if (Object.prototype.hasOwnProperty.call(bufferCrush, z) && bufferCrush[z] > 0.05) return false;
          }
        }
        var qt = rollover && rollover.available ? (rollover.quarterTurns || 0) : 0;
        if (qt >= lastScoredRollQt + 0.25) return false;
        return true;
      }

      var lastChunk = null;
      function mergeContinuationChunk(payload) {
        var nowMs = Date.now();
        var pk = payloadPeakG(payload);
        var prev = lastChunk;
        var cont = payload && payload.firstChunkOfCapture === false && prev && nowMs - prev.ms < 800 &&
          prev.peak >= 10 && pk >= 8 && prev.payload.gx.length + payload.gx.length <= 2400;
        if (!cont) {
          lastChunk = pk >= 10 ? { payload: payload, ms: nowMs, peak: pk } : null;
          return payload;
        }
        var a = prev.payload, n = a.gx.length;
        var merged = Object.assign({}, payload);
        var rate = Number(payload.sampleRateHz) || 2000;
        Object.keys(payload).forEach(function (k) {
          var va = a[k], vb = payload[k];
          if (!va || !vb || typeof va.length !== 'number' || typeof vb.length !== 'number') return;
          if (va.length !== n || vb.length !== payload.gx.length || typeof va === 'string') return;
          var out = new Array(n + vb.length);
          for (var i = 0; i < n; i++) out[i] = va[i];
          if (k === 't') {
            var shift = (va[n - 1] + 1 / rate) - vb[0];
            for (var j = 0; j < vb.length; j++) out[n + j] = vb[j] + shift;
          } else {
            for (var j2 = 0; j2 < vb.length; j2++) out[n + j2] = vb[j2];
          }
          merged[k] = out;
        });
        merged.samplesBuffered = merged.gx.length;
        merged.firstChunkOfCapture = a.firstChunkOfCapture;
        if (typeof a.preImpactVzMs === 'number') merged.preImpactVzMs = a.preImpactVzMs;
        merged.mergedChunks = (a.mergedChunks || 1) + 1;
        lastChunk = { payload: merged, ms: nowMs, peak: Math.max(prev.peak, pk) };
        return merged;
      }

      var bufferHandler = function (event, payload) {
        if (staleInstance()) return;
        if (!payload || !payload.gx || payload.gx.length === 0) return;
        recordForReplay('b', payload);
        try {
          var bufferReceivedAtMs = Date.now();
          var luaCaptureMs = (payload.samplesBuffered && payload.sampleRateHz)
            ? (payload.samplesBuffered / payload.sampleRateHz) * 1000
            : 0;
          var impactStartMs = bufferReceivedAtMs - luaCaptureMs;

          scope.debugLuaCaptureMs = luaCaptureMs;
          scope.debugHop1RelayMs = typeof payload.hop1RelayMs === 'number' ? payload.hop1RelayMs : null;

          if (pendingProvisionalKnockoutMs !== null) {
            scope.debugProvisionalBlackoutLatencyMs = pendingProvisionalKnockoutMs - impactStartMs;
            pendingProvisionalKnockoutMs = null;
          }

          payload = mergeContinuationChunk(payload);
          var trace = buildCrashTrace(payload);
          try { bufferRollingNow = captureIsRolling(buildRolloverFromPayload(payload)); } catch (eR) { bufferRollingNow = false; }

          settleFallCredit();
          noteFreeFlight(trace);
          noteFlightFromPayload(payload);

          noteCrush(payload, trace);
          noteStruckEnds(trace);
          var bufferRollover = buildRolloverFromPayload(payload);
          bufferRollingNow = captureIsRolling(bufferRollover);
          payloadImpactUpZ = Number.isFinite(Number(payload.impactUpZ)) && payload.impactUpZ !== null ? Number(payload.impactUpZ) : null;
          payloadPreImpactVz = payload.firstChunkOfCapture === true && typeof payload.preImpactVzMs === 'number' &&
            Number.isFinite(payload.preImpactVzMs) ? payload.preImpactVzMs
            : (payload.firstChunkOfCapture === false ? 'later-chunk' : null);
          var fallSpeed = noteFreeFall(payload);
          if (fallSpeed > 0 && !(Number.isFinite(payloadPreImpactVz) && -payloadPreImpactVz >= fallSpeed)) payloadPreImpactVz = -fallSpeed;
          var vertBefore = (sessionFloorDvMs || 0) + (sessionRoofDvMs || 0) + (sessionRoofwardDvMs || 0);
          payloadPostImpactVz = Number.isFinite(Number(payload.postImpactVzMs)) && payload.postImpactVzMs !== null ? Number(payload.postImpactVzMs) : null;
          noteRoofwardImpact(trace, bufferRollover);
          noteVerticalImpact(trace, bufferRollover);
          var cpk = tracePeakG(trace);
          if (cpk > sessionCrashPeakG) sessionCrashPeakG = cpk;
          if (scope.realisticMode) { kickImpactBlur(cpk); recomputeVisionStyle(); }
          if (bufferRollover && bufferRollover.available && (bufferRollover.quarterTurns || 0) >= 1) {
            var rpk = tracePeakG(trace);
            if (rpk > sessionRollPeakG) sessionRollPeakG = rpk;
          }

          bufferIsLaunch = measuredIsLaunch(rawTracePdofDeg(trace));
          if (bufferIsLaunch) trace = traceWithoutVertical(trace);
          recordVehicleImpact(trace);
          updateImpactLine(trace);

          if (quietBufferCanSkip(trace, payload, bufferRollover, vertBefore)) return;
          if (bufferRollover && bufferRollover.available) lastScoredRollQt = Math.max(lastScoredRollQt, bufferRollover.quarterTurns || 0);
          var occupant = currentOccupant();
          var usedRestraintLabel = scope.restraintConfigLabel;

          var pipelineStartMs = Date.now();

          var result = ingestCapture(trace, occupant,
            buildIntrusionFromPayload(payload), buildRolloverFromPayload(payload));
          scope.debugPipelineComputeMs = Date.now() - pipelineStartMs;

          if (result) recordCrashStats(result.report, result.isNewSession);

          try {
            ingestPassengers(trace, buildIntrusionFromPayload(payload), buildRolloverFromPayload(payload), sessionEventMeta);
          } catch (paxErr) {
            console.error('[CrashInjuryPro] passenger pass failed:', paxErr);
          }

          handleIngestResult(result, impactStartMs);

          scope.reportRestraintConfigLabel = usedRestraintLabel;
          pendingImpactStartMs = impactStartMs;
        } catch (e) {
          console.error('[CrashInjuryPro] pipeline run failed:', e);
        }

        if (!scope.$$phase && !(scope.$root && scope.$root.$$phase)) { try { scope.$apply(); } catch (e2) {} }
      };

      var bufferQueue = [];
      var bufferDrainScheduled = false;
      var drainBacklog = false;
      var lastBufferMs = 0;
      function drainBuffers() {
        bufferDrainScheduled = false;
        if (!bufferQueue.length) return;
        var p = bufferQueue.shift();
        drainBacklog = bufferQueue.length > 0;
        try { bufferHandler(null, p); } finally { drainBacklog = false; }
        if (bufferQueue.length) { bufferDrainScheduled = true; setTimeout(drainBuffers, 0); }
      }
      scope.$on('CrashInjuryProBufferTest', function (event, payload) {
        if (staleInstance()) return;
        lastBufferMs = Date.now();
        bufferQueue.push(payload);
        if (!bufferDrainScheduled) { bufferDrainScheduled = true; setTimeout(drainBuffers, 0); }
      });

      var REPLAY_MAX_BUFFERS = 150;
      var cipReplaying = false;
      var suppressPopupsUntilMs = 0;
      function replayStore() {
        if (!window.__cipReplayStore) window.__cipReplayStore = { seed: null, items: [], lastExposure: null, snap: null, vehId: null };
        return window.__cipReplayStore;
      }
      function clearReplayStore() {
        window.__cipReplayStore = { seed: null, items: [], lastExposure: null, snap: null, vehId: null };
      }
      function recordForReplay(kind, payload) {
        if (cipReplaying) return;
        var st = replayStore();
        if (kind === 'x') { st.lastExposure = payload; snapshotClocks(); return; }
        if (!st.items.length) {
          st.seed = scenarioSeed;
          st.vehId = scope.vehicleInfo && scope.vehicleInfo.objID != null ? scope.vehicleInfo.objID : null;
        }
        if (st.items.length < REPLAY_MAX_BUFFERS) st.items.push(payload);
      }
      function cloneJson(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; } }
      function snapshotClocks() {
        var st = replayStore();
        var pax = {};
        Object.keys(paxRecords).forEach(function (k) {
          var r = paxRecords[k];
          if (r) pax[k] = { patient: cloneJson(r.patient), totalElapsedS: r.totalElapsedS };
        });
        st.snap = { patient: cloneJson(patientState), totalS: patientTotalElapsedS, clockS: patientClockS,
          fireDoseS: patientFireDoseS, fireS: sessionFireSeconds, fireI: sessionFireIntensity,
          subS: sessionSubmergedSeconds, sub: sessionWasSubmerged, pax: pax };
      }
      function restoreFromReplayStore() {
        var st = window.__cipReplayStore;
        if (!st || !st.items || !st.items.length) return false;
        cipReplaying = true;
        suppressPopupsUntilMs = Date.now() + 4000;
        try {
          resetSessionState();
          if (st.seed != null) scenarioSeed = st.seed;
          st.items.forEach(function (p, i) { replayFinalItem = i === st.items.length - 1; bufferHandler(null, p); });
          replayFinalItem = false;
          var sn = st.snap;
          if (sn) {
            if (sn.patient) patientState = cloneJson(sn.patient);
            patientTotalElapsedS = sn.totalS || 0;
            patientClockS = sn.clockS;
            patientFireDoseS = sn.fireDoseS || 0;
            sessionFireSeconds = sn.fireS || 0;
            sessionFireIntensity = sn.fireI || 0;
            sessionSubmergedSeconds = sn.subS || 0;
            sessionWasSubmerged = !!sn.sub;
            Object.keys(sn.pax || {}).forEach(function (k) {
              var r = paxRecords[k];
              if (r && sn.pax[k]) { r.patient = cloneJson(sn.pax[k].patient); r.totalElapsedS = sn.pax[k].totalElapsedS || 0; }
            });
          }
          if (st.lastExposure) exposureHandler(null, st.lastExposure);
          refreshSeatViewModels();
          try {
            if (window.bngApi && window.bngApi.engineLua) window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
              JSON.stringify('RESTORED the crash after a UI reload (' + st.items.length + ' buffers replayed).') + ')');
          } catch (e) {}
        } catch (e) {
          console.error('[CrashInjuryPro] restore after UI reload failed:', e);
        } finally {
          cipReplaying = false;
        }
        return true;
      }
      scope.__restoreFromReplayStore = restoreFromReplayStore;

      scope.$on('CrashInjuryProReportUpdate', function (event, report) {
        if (staleInstance()) return;
        if (report) startNewSequence(report);
      });

      function resetIdOf(data) {
        if (data == null) return null;
        if (typeof data === 'number') return data;
        if (typeof data === 'object' && data.objID != null) return Number(data.objID);
        return null;
      }
      function resetNowFor(event, data) {
        var id = resetIdOf(data);
        if (id != null && currentVehId != null && id !== currentVehId) return;
        resetNow();
        try {
          if (window.bngApi && window.bngApi.engineLua) window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' +
            JSON.stringify('RESET: injuries cleared for car ' + id + (data && data.reload ? ' (reloaded)' : '')) + ')');
        } catch (e) {}
      }
      function resetNow() {
        if (staleInstance()) return;
        bufferQueue = [];
        lastChunk = null;
        impactBlurFraction = 0; impactBlurPeak = 0;
        pendingExposureS = 0;
        if (currentVehId != null) delete vehStash()[currentVehId];
        clearReplayStore();
        resetToIdle();
        if (!scope.$$phase && !(scope.$root && scope.$root.$$phase)) { try { scope.$apply(); } catch (e) {} }
      }
      scope.$on('VehicleReset', function (event, data) {
        if (window.bngApi && typeof window.bngApi.engineLua === 'function') return;
        resetNowFor(event, data);
      });
      scope.$on('CrashInjuryProVehicleReset', resetNowFor);

      var currentVehId = null;
      function vehStash() {
        if (!window.__cipVehStash) window.__cipVehStash = {};
        return window.__cipVehStash;
      }
      function switchVehicle(info) {
        if (!info || info.objID == null) return false;
        if (String(info.model) === 'unicycle') return 'onFoot';
        if (currentVehId === null) {
          var kept0 = window.__cipReplayStore;
          currentVehId = kept0 && kept0.items && kept0.items.length && kept0.vehId != null ? kept0.vehId : info.objID;
        }
        if (info.objID === currentVehId) return false;
        snapshotClocks();
        var st = replayStore();
        if (st.items && st.items.length) { st.vehId = currentVehId; vehStash()[currentVehId] = st; }
        var back = vehStash()[info.objID] || null;
        delete vehStash()[info.objID];
        window.__cipReplayStore = back || { seed: null, items: [], lastExposure: null, snap: null, vehId: info.objID };
        currentVehId = info.objID;
        resetToIdle();
        if (back && back.items && back.items.length) restoreFromReplayStore();
        return true;
      }
      scope.$on('VehicleChange', function () {
        if (staleInstance()) return;
        requestVehicleInfo();
      });

      function requestVehicleInfo() {
        try {
          if (window.bngApi && window.bngApi.engineLua) window.bngApi.engineLua('extensions.crashInjuryPro.requestVehicleInfo()');
        } catch (e) {}
      }

      scope.$on('CrashInjuryProVehicleInfo', function (event, info) {
        if (staleInstance()) return;
        scope.$evalAsync(function () {
          if (info && String(info.model) === 'unicycle') return;
          scope.vehicleInfo = info || null;
          applyDriverSide(info && info.driverSide);
          switchVehicle(info);
          if (info && window.bngApi && window.bngApi.engineLua) {
            try {
              window.bngApi.engineLua('log(' + JSON.stringify('I') + ',' + JSON.stringify('crashInjuryProApp') + ',' + JSON.stringify(
                'VEHICLE: ' + info.model + ' year=' + info.year + ' seats ' + info.frontSeats + '+' + info.rearSeats +
                ' known=' + info.seatsKnown + ' parts=' + info.partsKnown + ' cage=' + info.rollCage +
                ' -> airbags ' + vehicleHasAirbags() + ', age odds x' + vehicleAgeOdds()) + ')');
            } catch (e) {}
          }

          var model = info ? String(info.model) + ':' + String(info.objID) : null;
          if (model !== seatOverrideModel) { seatOverride = {}; seatOverrideModel = model; }

          ['frontRight', 'rearLeft', 'rearRight'].forEach(function (k) {
            if (!seatAvailable(k) && scope.settings.seats[k]) {
              if (scope.settings.seats[k].occupied) delete paxRecords[k];
            }
          });
          refreshSeatViewModels();
        });
      });
      requestVehicleInfo();
      scope.$on('VehicleFocusChanged', function (event, data) {
        if (staleInstance()) return;
        if (data && data.mode === true) requestVehicleInfo();
      });

      scope.replayDemo = function () {
        try {
          clearReplayStore();
          resetSessionState();
          var impactStartMs = Date.now();
          var trace = buildSyntheticFrontalTrace();
          var occupant = currentOccupant();
          var usedRestraintLabel = scope.restraintConfigLabel;
          var result = ingestCapture(trace, occupant);
          if (result) {
            handleIngestResult(result, impactStartMs);
            scope.reportRestraintConfigLabel = usedRestraintLabel;
            pendingImpactStartMs = impactStartMs;
          } else {
            console.warn('[CrashInjuryPro] synthetic replay trace produced no events -- try a bigger SYNTHETIC_REPLAY_PEAK_G.');
          }
        } catch (e) {
          console.error('[CrashInjuryPro] replay failed:', e);
        }
      };

      scope.toggleExpanded = function () {
        scope.expanded = !scope.expanded;
      };

      function onFullscreenKeydown(e) {
        if (e.key !== 'Escape' && e.keyCode !== 27) return;
        if (!scope.fullscreen) return;
        scope.fullscreen = false;
        applyFullscreenDom(false);
        if (!scope.$$phase) scope.$apply();
      }
      document.addEventListener('keydown', onFullscreenKeydown);

      scope.$on('$destroy', function () {
        pendingTimeouts.forEach(function (p) { $timeout.cancel(p); });
        pendingTimeouts = [];
        stopRealisticEffectsTicker();
        stopRingingTone();
        document.removeEventListener('keydown', onFullscreenKeydown);
        window.removeEventListener('crashInjuryProDisplaySettingsUpdate', onDisplaySettingsUpdate);

        if (portalRoot.parentNode) portalRoot.parentNode.removeChild(portalRoot);
      });

      resetToIdle();

      normaliseSeatSettings();
      refreshSeatViewModels();
      loadPersistedSettings();

      sendRealisticModeEnabledToGE();
    }
  };
}]);
