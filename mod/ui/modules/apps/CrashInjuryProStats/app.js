var CIS_TEMPLATE_CACHE_BUST = Date.now();

(function () {
  var OUTLOOK_LABELS = {
    likelySurvivable: 'Likely survivable',
    seriousButLikelySurvivable: 'Serious, but likely survivable',
    critical: 'Critical',
    notSurvivable: 'Not survivable'
  };

  function defaultStats() {
    return {
      totalCrashes: 0, totalInjuries: 0, deaths: 0, worstIss: 0,
      byRegion: {}, bySeverity: {},
      medKitsUsed: 0, worstInjury: null,
      last: { survivalPercent: 100, outlook: 'likelySurvivable', costUsd: 0, recoveryWeeks: 0, recoveryHours: 0, hospitalDays: 0, permanent: false, dead: false }
    };
  }

  function formatRegionLabel(region) {
    if (!region) return region;
    var spaced = region.replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function formatRecovery(last) {
    if (!last || last.dead || (last.recoveryHours === null && last.recoveryWeeks === null)) return 'N/A (fatal)';
    if (last.permanent) return 'Lifelong';
    var h = typeof last.recoveryHours === 'number' ? last.recoveryHours : (last.recoveryWeeks || 0) * 168;
    if (!(h > 0)) return 'None';
    if (h < 24) { var hh = Math.max(1, Math.round(h)); return hh === 1 ? '1 hour' : hh + ' hours'; }
    var d = h / 24;
    if (d < 14) { var dd = Math.round(d); return dd === 1 ? '1 day' : dd + ' days'; }
    if (d < 63) { var ww = Math.round(d / 7); return ww === 1 ? '1 week' : ww + ' weeks'; }
    if (d < 350) { var mm = Math.round(d / 30.4); return mm === 1 ? '1 month' : mm + ' months'; }
    var yy = Math.round(d / 365 * 2) / 2;
    return yy === 1 ? '1 year' : yy + ' years';
  }

  function recoveryStay(last) {
    if (!last || last.dead) return null;
    if (last.permanent) return '(permanent disability)';
    var h = typeof last.recoveryHours === 'number' ? last.recoveryHours : 0;
    if (!(h > 0)) return null;
    var days = last.hospitalDays || 0;
    if (!days) return h >= 24 ? '(home the same day)' : null;
    return days === 1 ? '(1 day in hospital)' : '(' + days + ' days in hospital)';
  }

  function splitInjuryName(name) {
    var m = /^(.*?)\s*(\(.*\))\s*$/.exec(String(name || ''));
    if (!m || !m[1]) return { main: String(name || ''), sub: null };
    return { main: m[1], sub: m[2] };
  }

  var SURVIVAL_COLOR_STOPS = [
    { pct: 100, rgb: [143, 217, 160] },
    { pct: 60, rgb: [227, 201, 143] },
    { pct: 25, rgb: [255, 107, 107] },
    { pct: 0, rgb: [122, 16, 16] }
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function survivalColorForPercent(pct) {
    if (typeof pct !== 'number' || isNaN(pct)) pct = 100;
    pct = Math.max(0, Math.min(100, pct));
    for (var i = 0; i < SURVIVAL_COLOR_STOPS.length - 1; i++) {
      var hi = SURVIVAL_COLOR_STOPS[i];
      var lo = SURVIVAL_COLOR_STOPS[i + 1];
      if (pct <= hi.pct && pct >= lo.pct) {
        var t = (hi.pct === lo.pct) ? 0 : (hi.pct - pct) / (hi.pct - lo.pct);
        var r = Math.round(lerp(hi.rgb[0], lo.rgb[0], t));
        var g = Math.round(lerp(hi.rgb[1], lo.rgb[1], t));
        var b = Math.round(lerp(hi.rgb[2], lo.rgb[2], t));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
      }
    }
    var last = SURVIVAL_COLOR_STOPS[0].rgb;
    return 'rgb(' + last[0] + ',' + last[1] + ',' + last[2] + ')';
  }

  function defaultSettings() {
    return {
      showSurvival: true,
      showCost: true,
      showRecovery: true,
      showWorstInjury: true,
      showCrashesSurvived: true,
      showMedKits: true,
      survivalSeats: { driver: true, frontRight: false, rearLeft: false, rearRight: false },
      fontSizePx: 14,
      textColor: '#ffffff',
      figureScale: 1,
      textCaps: true,
      textBold: true,
      textOutline: true,
      textOutlineIntensity: 60
    };
  }

  function outlineTextShadow(intensityPct) {
    var t = Number(intensityPct);
    if (!isFinite(t)) t = 60;
    t = Math.max(0, Math.min(100, t)) / 100;
    if (t <= 0) return 'none';
    var w = 0.03 + t * 0.06;
    var alpha = 0.55 + t * 0.4;
    var c = 'rgba(0,0,0,' + alpha.toFixed(2) + ')';
    var blur = (w * 0.25).toFixed(3) + 'em';
    var parts = [];
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      parts.push((Math.cos(a) * w).toFixed(3) + 'em ' + (Math.sin(a) * w).toFixed(3) + 'em ' + blur + ' ' + c);
    }
    parts.push('0 ' + (w * 1.3).toFixed(3) + 'em ' + (w * 3).toFixed(3) + 'em rgba(0,0,0,' + (alpha * 0.6).toFixed(2) + ')');
    return parts.join(', ');
  }

  var TEXT_COLOR_PRESETS = ['#ffffff', '#000000', '#e8e8e8', '#ffd166', '#8fb3d9', '#ff6b6b'];

  angular.module('beamng.apps').directive('crashInjuryProStats', [function () {
    return {
      templateUrl: '/ui/modules/apps/CrashInjuryProStats/app.html?v=' + CIS_TEMPLATE_CACHE_BUST,
      restrict: 'EA',
      replace: false,
      scope: true,
      link: function (scope, element) {
        (function cisI18n(tries) {
          if (window.__cipI18n) { window.__cipI18n.attach(element[0]); return; }
          if (tries === 0 && !document.querySelector('script[data-cip-i18n]')) {
            window.__cipI18nVersion = window.__cipI18nVersion || String(Date.now());
            var s = document.createElement('script');
            s.src = '/ui/modules/apps/CrashInjuryPro/i18n.js?v=' + window.__cipI18nVersion;
            s.setAttribute('data-cip-i18n', '1');
            document.head.appendChild(s);
          }
          if (tries < 50) setTimeout(function () { cisI18n(tries + 1); }, 200);
        })(0);
        scope.settings = defaultSettings();
        scope.textColorPresets = TEXT_COLOR_PRESETS;

        scope.settings.showSurvival = true;

        var SEAT_KEYS = ['driver', 'frontRight', 'rearLeft', 'rearRight'];
        function fixSurvivalSeats() {
          var d = defaultSettings().survivalSeats;
          var cur = scope.settings.survivalSeats;
          if (!cur || typeof cur !== 'object') cur = {};
          SEAT_KEYS.forEach(function (k) { cur[k] = typeof cur[k] === 'boolean' ? cur[k] : d[k]; });
          scope.settings.survivalSeats = cur;
        }
        fixSurvivalSeats();

        scope.multiSeat = function () {
          var seats = scope.settings.survivalSeats || {};
          var on = SEAT_KEYS.filter(function (k) { return seats[k]; });
          return on.length > 1 || (on.length === 1 && on[0] !== 'driver');
        };
        function seatInfo(key) {
          var last = scope.stats && scope.stats.last ? scope.stats.last : {};
          var seats = last.seats;
          if (key === 'driver') return { pct: last.survivalPercent, dead: !!last.dead };
          if (!seats || seats[key] === undefined) return { pct: 100, dead: false };
          return seats[key];
        }
        scope.seatText = function (key) {
          var info = seatInfo(key);
          if (!info) return 'Empty';
          return scope.pct(info.pct) + '%';
        };
        scope.seatColor = function (key) {
          var info = seatInfo(key);
          if (!info) return '#8a8f96';
          return survivalColorForPercent(info.pct);
        };

        scope.survivalColor = function () {
          var pct = scope.stats && scope.stats.last ? scope.stats.last.survivalPercent : 100;
          return survivalColorForPercent(pct);
        };

        scope.fitFontPx = null;
        scope.panelStyle = function () {
          var px = scope.fitFontPx || scope.settings.fontSizePx;
          return {
            fontSize: px + 'px',
            color: scope.settings.textColor,
            fontWeight: scope.settings.textBold ? '700' : '400',
            textTransform: scope.settings.textCaps ? 'uppercase' : 'none',
            textShadow: scope.settings.textOutline ? outlineTextShadow(scope.settings.textOutlineIntensity) : 'none'
          };
        };

        var SETTINGS_MARGIN_PX = 4;
        var SETTINGS_ROOM_BELOW_PX = 160;
        scope.settingsBox = { top: SETTINGS_MARGIN_PX, maxHeight: 90 };
        function recomputeSettingsMaxHeight() {
          var appEl = element[0].querySelector('.cip-stats-app');
          var lineEl = element[0].querySelector('.cip-stats-survival-line');
          if (!appEl || !lineEl) return;
          var appRect = appEl.getBoundingClientRect();
          var lineRect = lineEl.getBoundingClientRect();
          var below = appRect.bottom - lineRect.bottom - SETTINGS_MARGIN_PX * 2;
          var top = below >= SETTINGS_ROOM_BELOW_PX ? lineRect.bottom - appRect.top + SETTINGS_MARGIN_PX : SETTINGS_MARGIN_PX;
          scope.settingsBox = { top: Math.max(SETTINGS_MARGIN_PX, top), maxHeight: Math.max(60, appRect.height - top - SETTINGS_MARGIN_PX) };
        }
        scope.settingsPanelStyle = function () {
          return { top: scope.settingsBox.top + 'px', maxHeight: scope.settingsBox.maxHeight + 'px' };
        };

        var MIN_FONT_PX = 6;
        var fitTimer = null;
        function fitToBox() {
          fitTimer = null;
          var appEl = element[0].querySelector('.cip-stats-app');
          var bodyEl = element[0].querySelector('.cip-stats-body');
          if (!appEl || !bodyEl) return;
          var want = Number(scope.settings.fontSizePx) || 14;
          var cs = window.getComputedStyle(appEl);
          var availW = appEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          var availH = appEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
          if (!(availW > 0) || !(availH > 0)) return;
          function fits(size) {
            appEl.style.fontSize = size + 'px';
            return bodyEl.scrollWidth <= availW + 0.5 && bodyEl.scrollHeight <= availH + 0.5;
          }
          var px = want;
          if (!fits(want)) {
            var lo = MIN_FONT_PX, hi = want;
            for (var i = 0; i < 12 && hi - lo > 0.2; i++) {
              var mid = (lo + hi) / 2;
              if (fits(mid)) lo = mid; else hi = mid;
            }
            px = Math.floor(lo * 10) / 10;
            appEl.style.fontSize = px + 'px';
          }
          if (scope.fitFontPx !== px) {
            scope.fitFontPx = px;
            if (!scope.$$phase && !(scope.$root && scope.$root.$$phase)) scope.$apply();
          }
        }
        function scheduleFit() {
          if (fitTimer) clearTimeout(fitTimer);
          fitTimer = setTimeout(fitToBox, 30);
        }
        scope.$watch(function () {
          return [scope.settings.fontSizePx, scope.settings.textCaps, scope.settings.textBold, scope.settings.showCost,
            scope.settings.showRecovery, scope.settings.showWorstInjury, scope.settings.showCrashesSurvived, scope.settings.showMedKits, JSON.stringify(scope.settings.survivalSeats)].join('|');
        }, scheduleFit);
        var fitResizeObserver = null;
        var fitMutationObserver = null;
        setTimeout(function () {
          var appEl = element[0].querySelector('.cip-stats-app');
          var bodyEl = element[0].querySelector('.cip-stats-body');
          if (appEl && typeof ResizeObserver === 'function') {
            fitResizeObserver = new ResizeObserver(scheduleFit);
            fitResizeObserver.observe(appEl);
          }
          if (bodyEl && typeof MutationObserver === 'function') {
            fitMutationObserver = new MutationObserver(scheduleFit);
            fitMutationObserver.observe(bodyEl, { childList: true, characterData: true, subtree: true });
          }
          scheduleFit();
        }, 0);

        scope.settingsOpen = false;
        scope.toggleSettings = function () {
          scope.settingsOpen = !scope.settingsOpen;
          if (scope.settingsOpen) recomputeSettingsMaxHeight();
          else scheduleFit();
        };

        var settingsResizeObserver = null;
        if (typeof ResizeObserver === 'function') {
          var appElForObserver = element[0].querySelector('.cip-stats-app');
          if (appElForObserver) {
            settingsResizeObserver = new ResizeObserver(function () {
              if (!scope.settingsOpen) return;
              recomputeSettingsMaxHeight();
              if (!scope.$$phase) scope.$apply();
            });
            settingsResizeObserver.observe(appElForObserver);
          }
        }

        function closeSettings() {
          if (!scope.$$phase) {
            scope.$apply(function () { scope.settingsOpen = false; });
          } else {
            scope.settingsOpen = false;
          }
          scheduleFit();
        }
        function onDocumentClick(e) {
          if (!scope.settingsOpen) return;
          var survivalLineEl = element[0].querySelector('.cip-stats-survival-line');

          if (survivalLineEl && survivalLineEl.contains(e.target)) return;
          closeSettings();
        }
        function onDocumentKeydown(e) {
          if (e.key !== 'Escape' && e.keyCode !== 27) return;
          closeSettings();
        }
        document.addEventListener('click', onDocumentClick);
        document.addEventListener('keydown', onDocumentKeydown);

        window.__crashInjuryProDisplaySettings = window.__crashInjuryProDisplaySettings || { figureScale: 1 };
        function pushFigureScaleToBridge() {
          window.__crashInjuryProDisplaySettings.figureScale = Number(scope.settings.figureScale) || 1;
          try {
            window.dispatchEvent(new CustomEvent('crashInjuryProDisplaySettingsUpdate', { detail: window.__crashInjuryProDisplaySettings }));
          } catch (e) {}
        }

        function persistStatsSettings() {
          if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
          window.bngApi.engineLua('settings.setValue(' + JSON.stringify('crashInjuryProStats_settings') + ', ' + JSON.stringify(JSON.stringify(scope.settings)) + ')');
        }
        function loadPersistedStatsSettings() {
          if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') {
            pushFigureScaleToBridge();
            return;
          }
          window.bngApi.engineLua('settings.getValue(' + JSON.stringify('crashInjuryProStats_settings') + ', "{}")', function (ret) {
            var loaded = null;
            try { loaded = JSON.parse(ret); } catch (e) {}
            if (loaded && typeof loaded === 'object') angular.extend(scope.settings, loaded);
            scope.settings.showSurvival = true;
            fixSurvivalSeats();
            fixNumbers();

            if (scope.settings.textColor === '#d7dade') scope.settings.textColor = defaultSettings().textColor;
            pushFigureScaleToBridge();
            if (!scope.$$phase) scope.$apply();
          });
        }

        function numberIn(v, lo, hi, fallback) {
          var n = Number(v);
          if (!isFinite(n)) return fallback;
          return Math.max(lo, Math.min(hi, n));
        }
        function fixNumbers() {
          var d = defaultSettings();
          scope.settings.fontSizePx = numberIn(scope.settings.fontSizePx, 10, 120, d.fontSizePx);
          scope.settings.textOutlineIntensity = numberIn(scope.settings.textOutlineIntensity, 0, 100, d.textOutlineIntensity);
          scope.settings.figureScale = numberIn(scope.settings.figureScale, 0.6, 2, d.figureScale);
        }

        scope.$watch('settings', function (newVal, oldVal) {
          if (newVal === oldVal) return;
          fixNumbers();
          persistStatsSettings();
          pushFigureScaleToBridge();
        }, true);
        pushFigureScaleToBridge();
        loadPersistedStatsSettings();

        scope.costLabel = function () {
          var v = scope.stats && scope.stats.last ? scope.stats.last.costUsd : 0;
          if (v === null || v === undefined || !isFinite(v)) return '\u2014';
          return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        };

        scope.pct = function (v) {
          var n = Number(v);
          if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return v;
          return Math.round(n * 10) / 10;
        };
        function applyStats(stats) {
          stats = stats || defaultStats();
          scope.stats = stats;

          scope.outlookLabel = OUTLOOK_LABELS[stats.last.outlook] || stats.last.outlook;
          scope.recoveryLabel = formatRecovery(stats.last);
          scope.recoverySub = recoveryStay(stats.last);

          if (stats.worstInjury) {
            var parts = splitInjuryName(stats.worstInjury.name);
            scope.worstInjuryLabel = parts.main;
            scope.worstInjurySub = parts.sub;
          } else {
            scope.worstInjuryLabel = null;
            scope.worstInjurySub = null;
          }
          scheduleFit();

          scope.crashesSurvived = Math.max(0, stats.totalCrashes - stats.deaths);
          scope.crashesNotSurvived = stats.deaths;
        }

        applyStats(window.__crashInjuryProStats);

        function onStatsUpdate(e) {
          applyStats(e.detail);
          if (!scope.$$phase) scope.$apply();
        }
        window.addEventListener('crashInjuryProStatsUpdate', onStatsUpdate);

        scope.$on('VehicleReset', function () {
          var oldSeats = window.__crashInjuryProStats && window.__crashInjuryProStats.last ? window.__crashInjuryProStats.last.seats : null;
          window.__crashInjuryProStats = defaultStats();
          if (oldSeats) {
            var keptSeats = {};
            Object.keys(oldSeats).forEach(function (k) { keptSeats[k] = oldSeats[k] ? { pct: 100, dead: false } : null; });
            window.__crashInjuryProStats.last.seats = keptSeats;
          }
          applyStats(window.__crashInjuryProStats);

          try {
            window.dispatchEvent(new CustomEvent('crashInjuryProStatsUpdate', { detail: window.__crashInjuryProStats }));
          } catch (e) {}
        });

        scope.$on('$destroy', function () {
          document.removeEventListener('click', onDocumentClick);
          document.removeEventListener('keydown', onDocumentKeydown);
          window.removeEventListener('crashInjuryProStatsUpdate', onStatsUpdate);
          if (settingsResizeObserver) settingsResizeObserver.disconnect();
          if (fitResizeObserver) fitResizeObserver.disconnect();
          if (fitMutationObserver) fitMutationObserver.disconnect();
          if (fitTimer) clearTimeout(fitTimer);
        });
      }
    };
  }]);
})();
