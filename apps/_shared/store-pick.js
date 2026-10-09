/**
 * Store pick: lead with the store that fits the visitor's device.
 *
 * Load it synchronously in <head>, before the stylesheets, so the choice is made before the
 * first paint: no flash of the wrong button and no layout shift. It only sets
 * <html data-store="apple|play|both">; store-pick.css does the rest.
 *
 * Markup (store-pick.css):
 *   data-store-link="apple|play"  a store button; hidden when the OTHER store leads
 *   data-store-only="apple|play"  shown only when that store leads, e.g. the small
 *                                 "Also on Google Play" line under an App Store button
 *
 * Without JavaScript nothing is set and every store button shows, as before.
 *
 *   iPhone, iPad, Mac          → apple (iPadOS asks for desktop sites and reports itself as a
 *                                Mac; "Macintosh" with more than one touch point is an iPad)
 *   Android, ChromeOS          → play
 *   Windows, Linux, the rest   → both, side by side
 *
 * `?store=apple|play|both` overrides the guess, for testing.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var pick = 'both';
  try {
    var forced = /[?&]store=(apple|play|both)\b/.exec(location.search);
    if (forced) {
      pick = forced[1];
    } else {
      var ua = navigator.userAgent || '';
      var hint = (navigator.userAgentData && navigator.userAgentData.platform) || '';
      var ipadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
      if (/^(Android|Chrome OS|ChromeOS)$/i.test(hint)) pick = 'play';
      else if (/^(macOS|iOS)$/i.test(hint)) pick = 'apple';
      else if (hint) pick = 'both';
      else if (/iPhone|iPad|iPod/.test(ua) || ipadAsMac) pick = 'apple';
      else if (/Android|CrOS/.test(ua)) pick = 'play';
      else if (/Macintosh|Mac OS X/.test(ua)) pick = 'apple';
      if (ipadAsMac) root.setAttribute('data-store-device', 'ipad');
    }
  } catch (e) { /* keep "both" */ }
  root.setAttribute('data-store', pick);
})();
