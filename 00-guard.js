"use strict";

window.Guard = (function(){
  var lifted = false, watchdog = null, reported = 0;

  function lift(){
    if (lifted) return;
    lifted = true;
    clearTimeout(watchdog);
    var b = document.getElementById('boot');
    if (b) b.classList.add('is-done');
  }

  function report(msg, where){
    lift();
    if (++reported > 3) return;
    var bar = document.getElementById('guardbar');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'guardbar';
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.textContent = 'Keystamp error — ' + msg + (where ? '  [' + where + ']' : '');
    console.error('[keystamp]', msg, where || '');
  }

  function ours(url){
    try { return new URL(url, location.href).origin === location.origin; }
    catch (_) { return false; }
  }

  window.addEventListener('error', function(e){
    var t = e.target;
    if (t && t.tagName === 'IMG') return;

    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')){
      var url = t.src || t.href || '';

      if (!ours(url)){
        console.warn('[keystamp] third-party file did not load:', url,
                     '— the app still runs, it just loses that piece.');
        return;
      }
      report('could not load ' + url + ' — check that the file is there ' +
             'and the path in index.html matches.');
      return;
    }
    report(e.message, (e.filename || '').split('/').pop() + ':' + e.lineno);
  }, true);

  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason;
    report(String((r && r.message) || r));
  });

  watchdog = setTimeout(function(){
    var b = document.getElementById('boot');
    if (b && !b.classList.contains('is-done')){
      console.warn('[keystamp] boot animation never finished; watchdog lifted the curtain.');
      lift();
    }
  }, 4000);

  return { lift: lift, report: report };
})();
