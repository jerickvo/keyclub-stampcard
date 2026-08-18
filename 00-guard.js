"use strict";
/* keystamp — boot guard. Loads before everything else.

   The black boot curtain is a fixed, full-screen, pure black layer at
   z-index 200, and the only thing that ever removed it was the complete
   callback of the boot animation. So any script that failed to load or
   threw on the way there left the page permanently black with nothing
   on it to explain why.

   This file removes that failure mode. Two jobs:
     1. anything throws  -> lift the curtain, print the error on screen
     2. nothing throws but the boot animation never finishes
                         -> lift the curtain anyway after 4 seconds
   Neither is meant to fire. If one does, you get a readable message
   instead of a black rectangle. */

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
    if (++reported > 3) return;                 /* one cascade is enough */
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

  /* capture phase, because resource load failures do not bubble */
  window.addEventListener('error', function(e){
    var t = e.target;
    if (t && t.tagName === 'IMG') return;       /* missing artwork is fine */

    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')){
      var url = t.src || t.href || '';
      /* A third-party file failing is survivable and not worth a red
         bar: the fonts fall back, and without anime.js Motion.off turns
         every animation into an instant state change. One of our own
         files failing is not survivable, so that one gets shouted. */
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
