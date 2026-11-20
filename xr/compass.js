// wemiller.com /xr/ — which way is north, when the device can say.
//
// WebXR itself has no compass: a session's "forward" is wherever the headset happened to be
// pointing. Phones (and phone-based viewers) do have one, through device orientation events, so
// when those arrive the sky can be turned to the real north. Standalone headsets generally do not
// expose a compass to web pages; there the visitor can set north by hand (see app.js).
//
//   const compass = createCompass();
//   compass.start();          // call inside a tap: iOS asks for permission there
//   compass.heading();        // radians clockwise from north of where the back of the device
//                             // points (the way you look through a viewer), or null
// Magnetic north, not true north: the difference is at most a few degrees in most places.
const D = Math.PI / 180;

export function createCompass() {
  let az = null, at = 0, started = false, seen = false;
  function on(e) {
    let alpha = null;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) alpha = 360 - e.webkitCompassHeading;   // iOS
    else if (e.absolute === true && e.alpha !== null) alpha = e.alpha;
    if (alpha === null || e.beta === null || e.gamma === null) return;
    const a = alpha * D, b = e.beta * D, g = e.gamma * D;
    const sA = Math.sin(a), cA = Math.cos(a), sB = Math.sin(b), cB = Math.cos(b), sG = Math.sin(g), cG = Math.cos(g);
    // The device's -Z axis (out of the back) in the earth frame (x east, y north, z up); W3C rotation Z-X'-Y''.
    const east = -(cG * sA * sB + cA * sG), north = -(sA * sG - cA * cG * sB);
    if (Math.hypot(east, north) < 0.35) return;          // pointing nearly straight up or down: no heading in that
    az = Math.atan2(east, north); at = performance.now(); seen = true;
  }
  return {
    get seen() { return seen; },
    start() {
      if (started) return;
      started = true;
      const listen = () => { addEventListener('deviceorientationabsolute', on); addEventListener('deviceorientation', on); };
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(listen, listen);
        else listen();
      } catch (err) { listen(); }
    },
    stop() { started = false; removeEventListener('deviceorientationabsolute', on); removeEventListener('deviceorientation', on); az = null; },
    heading() { return az !== null && performance.now() - at < 2000 ? az : null; },
  };
}
