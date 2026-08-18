"use strict";
/* keystamp — anime.js v4 bridge (classic script, deliberately not a module).

   This was an ES module with an importmap. That cannot work when the page
   is opened as a file: browsers fetch module scripts with CORS semantics,
   and a file:// page has an opaque origin, so every module request is
   rejected before it reaches the disk. The file was present the whole
   time — the error said "could not load", but the browser had refused to
   try. Opening it from inside a mounted .zip made it doubly impossible.

   So: the UMD build, loaded as an ordinary script, which has no origin
   requirements and works from file://, from a subdirectory, and from a
   server. Same v4 API, same version, no importmap, no build step.

   The UMD bundle publishes one global, `anime`, holding the v4 namespace.
   Note it is a namespace, not the v3 callable — anime(...) is not a
   function any more, anime.animate(...) is. */

(function(){
  var A = window.anime;

  /* v4 removed the string form of ease: 'cubicBezier(...)' — the curve has
     to be built by the factory and passed as a function. EASE tables are
     evaluated at the top level of 04-fx.js, so these globals must exist
     even when anime.js is missing, or that file throws on load and takes
     the whole app with it. Absent anime, they return undefined, which
     every call site already tolerates because Motion.off short-circuits
     before any of them are used. */
  var missing = !A || typeof A.animate !== 'function';
  if (missing){
    console.warn('[keystamp] anime.js did not load; starting without animation.');
    window.cubicBezier  = function(){ return undefined; };
    window.createSpring = function(){ return undefined; };
    window.spring      = function(){ return undefined; };
    return;
  }
  window.cubicBezier = A.cubicBezier;
  window.eases       = A.eases;
  window.animate        = A.animate;
  window.createTimeline = A.createTimeline;
  window.createTimer    = A.createTimer;
  window.createDrawable = A.svg.createDrawable;
  /* createSpring() is deprecated as of 4.5; spring() is the current name */
  window.spring         = A.spring;
  window.createSpring   = A.spring;
  window.stagger        = A.stagger;
  window.onScroll       = A.onScroll;
  window.splitText      = A.text.splitText;
  window.aset           = A.utils.set;
  window.aremove        = A.utils.remove;
  window.around         = A.utils.round;
})();
