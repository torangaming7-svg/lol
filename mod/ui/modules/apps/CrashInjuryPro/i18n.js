(function () {
  'use strict';
  if (window.__cipI18n) return;

  var BASE = '/ui/modules/apps/CrashInjuryPro/lang/';
  var LANGS = [
    ['en', 'English'], ['ru', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439'], ['uk', '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430'], ['es', 'Espa\u00f1ol'],
    ['de', 'Deutsch'], ['fr', 'Fran\u00e7ais'], ['pt', 'Portugu\u00eas'], ['pl', 'Polski'],
    ['tr', 'T\u00fcrk\u00e7e'], ['zh', '\u4e2d\u6587'], ['ja', '\u65e5\u672c\u8a9e']
  ];
  var ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip'];
  var NUM_RE = /\d+(?:[.,]\d+)?/g;
  var HAS_WORD = /[A-Za-z]{2,}/;

  window.__cipI18nDicts = window.__cipI18nDicts || {};
  var lang = 'en';
  var cache = {};
  var roots = [];
  var observer = null;
  var lastSet = typeof WeakMap === 'function' ? new WeakMap() : null;
  var origText = typeof WeakMap === 'function' ? new WeakMap() : null;
  var loading = {};
  var listeners = [];

  var recordSet = null;

  function dict() { return window.__cipI18nDicts[lang] || null; }

  var tplCache = {};
  function templatesFor(d) {
    if (tplCache[lang]) return tplCache[lang];
    var list = [];
    for (var k in d) {
      if (k.indexOf('{*}') < 0 || typeof d[k] !== 'string') continue;
      var parts = k.split('{*}').map(function (p) { return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
      try { list.push({ re: new RegExp('^' + parts.join('(.+?)') + '$'), to: d[k] }); } catch (e) {}
    }
    tplCache[lang] = list;
    return list;
  }
  function fillTemplate(to, vals) {
    var i = 0;
    return to.replace(/\{(\*|\d)\}/g, function (m, g) {
      if (g === '*') return i < vals.length ? vals[i++] : '';
      var n = parseInt(g, 10) - 1;
      return n >= 0 && n < vals.length ? vals[n] : '';
    });
  }
  function lookup(d, core) {
    var r = d[core];
    if (typeof r === 'string') return r;

    var nums = [];
    var tpl = core.replace(NUM_RE, function (m) { nums.push(m); return '{#}'; });
    if (nums.length) {
      r = d[tpl];
      if (typeof r === 'string') {
        var i = 0;
        return r.replace(/\{#\}/g, function () { return i < nums.length ? nums[i++] : ''; });
      }
    }
    return null;
  }

  var SPLITTERS = [' \u00b7 ', ' | ', ' -- ', ' \u2014 ', ' / '];
  function translateCore(d, core, depth) {
    var r = lookup(d, core);
    if (r !== null) return r;
    if (depth > 2) return null;
    for (var i = 0; i < SPLITTERS.length; i++) {
      var sp = SPLITTERS[i];
      if (core.indexOf(sp) < 0) continue;
      var parts = core.split(sp), any = false;
      var out = parts.map(function (p) {
        var t = translateCore(d, p.trim(), depth + 1);
        if (t !== null) { any = true; return t; }
        return p.trim();
      });
      if (any) return out.join(sp);
    }

    var sentences = core.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
    if (sentences && sentences.length > 1) {
      var any2 = false;
      var out2 = sentences.map(function (s) {
        var t = translateCore(d, s.trim(), depth + 1);
        if (t !== null) { any2 = true; return t; }
        return s.trim();
      });
      if (any2) return out2.join(' ');
    }

    var tps = templatesFor(d);
    for (var ti = 0; ti < tps.length; ti++) {
      var mm = tps[ti].re.exec(core);
      if (!mm) continue;
      var vals = [];
      for (var vi = 1; vi < mm.length; vi++) {
        var tv = translateCore(d, mm[vi].trim(), depth + 1);
        vals.push(tv !== null ? tv : mm[vi]);
      }
      var filled = fillTemplate(tps[ti].to, vals);

      if (filled !== core) return filled;
    }

    var m = /^(.+?) \(([^()]+)\)$/.exec(core);
    if (m) {
      var a = translateCore(d, m[1], depth + 1), b = translateCore(d, '(' + m[2] + ')', depth + 1);

      if (a !== null && b !== null) return a + (/^[\uff08\u3010]/.test(b) ? '' : ' ') + b;
    }
    return null;
  }

  function translate(s) {
    if (typeof s !== 'string' || !HAS_WORD.test(s)) return s;
    var core = s.replace(/\s+/g, ' ').trim();
    if (recordSet) recordSet[core] = true;
    if (lang === 'en') return s;
    var d = dict();
    if (!d) return s;
    var c = cache[lang] || (cache[lang] = {});
    if (Object.prototype.hasOwnProperty.call(c, s)) return c[s];
    var r = translateCore(d, core, 0);
    var out = s;
    if (r !== null) {
      var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
      out = lead + r + trail;
    }
    c[s] = out;
    return out;
  }

  function skipped(el) {
    while (el && el.nodeType === 1) {
      if (el.classList && el.classList.contains('cip-notranslate')) return true;
      var t = el.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA') return true;
      el = el.parentNode;
    }
    return false;
  }

  function doText(n) {
    var v = n.nodeValue;
    if (!v || !HAS_WORD.test(v)) return;
    if (lastSet && lastSet.get(n) === v) return;

    if (origText) origText.set(n, v);
    var t = translate(v);
    if (lastSet) lastSet.set(n, t);
    if (t !== v) n.nodeValue = t;
  }
  function doAttrs(el) {
    if (!el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (!v || !HAS_WORD.test(v)) continue;
      var store = el.__cipI18nAttr || (el.__cipI18nAttr = {});
      if (store['set:' + a] === v) continue;
      store[a] = v;
      var t = translate(v);
      store['set:' + a] = t;
      if (t !== v) el.setAttribute(a, t);
    }
  }
  var FILTER = { acceptNode: function (n) {
    if (n.nodeType === 1 && ((n.classList && n.classList.contains('cip-notranslate')) || n.tagName === 'SCRIPT' || n.tagName === 'STYLE')) return 2;
    return 1;
  } };
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      if (!skipped(node.parentNode)) doText(node);
      return;
    }
    if (node.nodeType !== 1 || skipped(node)) return;
    doAttrs(node);
    var tw = document.createTreeWalker(node, 1 | 4, FILTER, false);
    var cur = tw.nextNode();
    while (cur) {
      if (cur.nodeType === 1) doAttrs(cur);
      else if (cur.nodeType === 3) doText(cur);
      cur = tw.nextNode();
    }
  }

  function retranslateAll() {
    roots.forEach(function (root) {
      if (!root) return;
      if (skipped(root)) return;
      var tw = document.createTreeWalker(root, 1 | 4, FILTER, false);
      var cur = root;
      while (cur) {
        if (cur.nodeType === 3) {
          var o = origText && origText.get(cur);
          if (typeof o === 'string' && lastSet && lastSet.get(cur) === cur.nodeValue) {
            var t = translate(o);
            lastSet.set(cur, t);
            if (cur.nodeValue !== t) cur.nodeValue = t;
          } else if (!skipped(cur.parentNode)) doText(cur);
        } else if (cur.nodeType === 1 && cur.__cipI18nAttr) {
          var st = cur.__cipI18nAttr;
          for (var i = 0; i < ATTRS.length; i++) {
            var a = ATTRS[i];
            if (typeof st[a] !== 'string' || cur.getAttribute(a) !== st['set:' + a]) continue;
            var ta = translate(st[a]);
            st['set:' + a] = ta;
            cur.setAttribute(a, ta);
          }
        } else if (cur.nodeType === 1 && !skipped(cur)) {
          doAttrs(cur);
        }
        cur = tw.nextNode();
      }
    });
  }

  function onMutations(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') {
        if (!skipped(r.target.parentNode)) doText(r.target);
      } else if (r.type === 'childList') {
        for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      } else if (r.type === 'attributes') {
        if (!skipped(r.target)) doAttrs(r.target);
      }
    }
  }

  function attach(root) {
    if (!root || roots.indexOf(root) >= 0) return;
    roots.push(root);
    if (typeof MutationObserver === 'function') {
      if (!observer) observer = new MutationObserver(onMutations);
      observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    walk(root);
  }

  function loadLang(code, done) {
    if (code === 'en' || window.__cipI18nDicts[code]) { done(); return; }
    if (loading[code]) { loading[code].push(done); return; }
    loading[code] = [done];
    var s = document.createElement('script');
    s.src = BASE + code + '.js?v=' + (window.__cipI18nVersion || '1');
    var finish = function () {
      var cbs = loading[code] || [];
      delete loading[code];
      cbs.forEach(function (f) { try { f(); } catch (e) {} });
    };
    s.onload = finish;
    s.onerror = function () {
      console.error('[CrashInjuryPro] language file lang/' + code + '.js did not load -- staying in English.');
      finish();
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function setLang(code) {
    code = String(code || 'en');
    if (!LANGS.some(function (l) { return l[0] === code; })) code = 'en';
    loadLang(code, function () {
      if (!window.__cipI18nDicts[code] && code !== 'en') code = 'en';
      if (code === lang) return;
      lang = code;
      try { document.documentElement.setAttribute('data-cip-lang', code); } catch (e) {}
      retranslateAll();
      listeners.forEach(function (f) { try { f(code); } catch (e) {} });
    });
  }

  function loadSaved() {
    try {
      if (!window.bngApi || typeof window.bngApi.engineLua !== 'function') return;
      window.bngApi.engineLua('settings.getValue("crashInjuryPro_settings", "{}")', function (ret) {
        try {
          var o = JSON.parse(ret);
          if (o && typeof o.language === 'string' && lang === 'en' && o.language !== 'en') setLang(o.language);
        } catch (e) {}
      });
    } catch (e) {}
  }

  window.__cipI18n = {
    languages: LANGS,
    attach: attach,
    setLang: setLang,
    getLang: function () { return lang; },
    t: translate,
    onChange: function (f) { listeners.push(f); },
    record: function (on) { recordSet = on ? (recordSet || {}) : null; },
    recorded: function () { return recordSet ? Object.keys(recordSet) : []; }
  };
  loadSaved();
})();
