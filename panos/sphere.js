/* wemiller.com — 360° photo viewer. One file, no library.
 *
 * Draws an equirectangular photograph (2:1, the whole sphere) with one WebGL shader on a
 * full-screen triangle: every pixel works out which way it is looking and reads that point
 * of the photograph. Drag to look around, pinch / wheel / double-tap to zoom, with a little
 * glide after a flick (not when the visitor asks for reduced motion).
 *
 *   var s = PanoSphere(hostElement, 'photo.webp', { label, reduced, onload, onerror });
 *   s === null            -> WebGL is not available; show the flat image instead
 *   s.key(event)          -> true if the key was used (arrows look around, + - 0 zoom)
 *   s.zoom(factor)        -> zoom in (>1) or out (<1)
 *   s.destroy()
 */
(function () {
  'use strict';
  var RAD = Math.PI / 180, FOV0 = 100 * RAD, FOV_MIN = 25 * RAD, FOV_MAX = 120 * RAD;
  var VS = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v;uniform sampler2D t;uniform vec2 s;uniform vec4 r;', // s: half-view, r: cos/sin of yaw, pitch
    'void main(){',
    ' vec3 d=normalize(vec3(v*s,-1.));',
    ' d=vec3(d.x,d.y*r.z-d.z*r.w,d.y*r.w+d.z*r.z);',                     // pitch (about x)
    ' d=vec3(d.x*r.x-d.z*r.y,d.y,d.x*r.y+d.z*r.x);',                     // yaw (about y)
    ' gl_FragColor=texture2D(t,vec2(atan(d.x,-d.z)*.15915494+.5,acos(clamp(d.y,-1.,1.))*.31830989));',
    '}'
  ].join('\n');

  window.PanoSphere = function (host, src, o) {
    o = o || {};
    var cv = document.createElement('canvas'), gl = null, opts = { antialias: false, alpha: false };
    try { gl = cv.getContext('webgl2', opts) || cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts); } catch (e) {}
    if (!gl) return null;

    function shader(type, code) { var s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uS = gl.getUniformLocation(prog, 's'), uR = gl.getUniformLocation(prog, 'r');

    cv.className = 'pv__gl';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', o.label || '360° photo');
    host.appendChild(cv);

    var yaw = 0, pitch = 0, fov = FOV0, fovTo = FOV0, vYaw = 0, vPitch = 0;
    var ready = false, dead = false, raf = 0, last = 0;
    var pts = {}, count = 0, pinch = null, down = null, lastTap = null;

    function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
    function perPx() { return fov / Math.max(cv.clientWidth, cv.clientHeight, 1); }   // radians per CSS pixel

    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      var t = Math.tan(fov / 2);                       // fov spans the longer side of the screen
      gl.uniform2f(uS, w >= h ? t : t * w / h, w >= h ? t * h / w : t);
      gl.uniform4f(uR, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      raf = 0;
      if (dead || !ready) return;
      var dt = Math.min(now - (last || now), 50), moving = false; last = now;
      if (!count && (Math.abs(vYaw) > 1e-5 || Math.abs(vPitch) > 1e-5)) {
        yaw += vYaw * dt; pitch += vPitch * dt;
        var k = Math.pow(0.94, dt / 16); vYaw *= k; vPitch *= k; moving = true;
      }
      if (Math.abs(fovTo - fov) > 1e-4) { fov += (fovTo - fov) * (o.reduced ? 1 : Math.min(1, Math.max(dt, 16) / 90)); moving = true; }
      if (Math.abs(pitch) > Math.PI / 2) { pitch = clamp(pitch, -Math.PI / 2, Math.PI / 2); vPitch = 0; }
      draw();
      if (moving) paint(); else last = 0;
    }
    function paint() { if (!raf && !dead) raf = requestAnimationFrame(frame); }
    function still() { vYaw = vPitch = 0; }
    function zoomTo(f, now) { fovTo = clamp(f, FOV_MIN, FOV_MAX); if (now) fov = fovTo; paint(); }

    function spread() {
      var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]];
      return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    }
    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; count++;
      still();
      if (count === 1) down = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      if (count === 2) { pinch = { d: spread(), fov: fov }; if (down) down.moved = true; }
      cv.classList.add('is-held');
    }
    function onMove(e) {
      var p = pts[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (count >= 2) { if (pinch) zoomTo(pinch.fov * pinch.d / spread(), true); return; }
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
      var k = perPx(), dt = Math.max(8, e.timeStamp - (p.t || e.timeStamp - 16)), top = fov / 350;   // glide no faster than a brisk flick
      p.t = e.timeStamp;
      yaw -= dx * k; pitch += dy * k;                 // the photograph follows the finger
      vYaw = clamp(0.6 * vYaw + 0.4 * (-dx * k / dt), -top, top); vPitch = clamp(0.6 * vPitch + 0.4 * (dy * k / dt), -top, top);
      paint();
    }
    function onUp(e) {
      var p = pts[e.pointerId];
      if (!p) return;
      delete pts[e.pointerId]; count--;
      if (count < 2) pinch = null;
      if (count) { still(); return; }
      cv.classList.remove('is-held');
      if (o.reduced || !p.t || e.timeStamp - p.t > 80) still();   // a pause before letting go means stop here
      if (down && !down.moved && e.type === 'pointerup' && e.timeStamp - down.t < 350) {
        if (lastTap && e.timeStamp - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          lastTap = null; zoomTo(fovTo < 70 * RAD ? FOV0 : 45 * RAD);       // double-tap: in, then back out
        } else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      }
      down = null; last = 0;
      paint();
    }
    function onWheel(e) {
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      zoomTo(fovTo * Math.exp(d * (e.ctrlKey ? 0.01 : 0.0015)), e.ctrlKey);
    }
    function lost(e) { e.preventDefault(); if (!dead && o.onerror) o.onerror(); }
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('webglcontextlost', lost);
    window.addEventListener('resize', paint);

    var img = new Image();
    img.onload = function () {
      if (dead) return;
      try {
        // Keep the texture within what the device can hold; phones get a lighter one.
        var cap = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), matchMedia('(max-width: 900px)').matches ? 4096 : 8192);
        var source = img;
        if (img.naturalWidth > cap) {
          source = document.createElement('canvas');
          source.width = cap; source.height = Math.round(cap * img.naturalHeight / img.naturalWidth);
          source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
        }
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // Wrapping round the seam needs WebGL 2 for a size that is not a power of two.
        var gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('texture');
      } catch (x) { if (o.onerror) o.onerror(); return; }
      ready = true;
      draw();
      if (o.onload) o.onload();
    };
    img.onerror = function () { if (!dead && o.onerror) o.onerror(); };
    img.src = src;

    return {
      el: cv,
      zoom: function (f) { zoomTo(fovTo / f); },
      key: function (e) {
        var step = fov * 0.14;
        still();
        if (e.key === 'ArrowLeft') yaw -= step;
        else if (e.key === 'ArrowRight') yaw += step;
        else if (e.key === 'ArrowUp') pitch += step;
        else if (e.key === 'ArrowDown') pitch -= step;
        else if (e.key === '+' || e.key === '=') zoomTo(fovTo / 1.3);
        else if (e.key === '-' || e.key === '_') zoomTo(fovTo * 1.3);
        else if (e.key === '0') { yaw = pitch = 0; zoomTo(FOV0); }
        else return false;
        paint();
        return true;
      },
      // for tests and the curious: where it is looking, in degrees
      view: function () { return { yaw: yaw / RAD, pitch: pitch / RAD, fov: fov / RAD, ready: ready }; },
      destroy: function () {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        img.onload = img.onerror = null;
        window.removeEventListener('resize', paint);
        var x = gl.getExtension('WEBGL_lose_context');
        if (x) x.loseContext();
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      }
    };
  };
})();
