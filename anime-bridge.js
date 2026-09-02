"use strict";

(function(){
  var A = window.anime;

  var missing = !A || typeof A.animate !== 'function';
  if (missing){
    console.warn('[keystamp] anime.js did not load; starting without animation.');
    window.cubicBezier  = function(){ return undefined; };
    window.steps        = function(){ return undefined; };
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

  window.spring         = A.spring;
  window.createSpring   = A.spring;
  window.stagger        = A.stagger;

  window.steps          = A.steps;
  window.aset           = A.utils.set;
})();
