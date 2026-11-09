# Notices

This folder is a modified copy of the phone door generator in
[CardboardXR](https://github.com/brenpoly/CardboardXR) by brenpoly, Apache License 2.0.

**Changed:** the door frame in `door.js` is moved outward to fit the stretched Afterglow shell. The phone pad, TPU
locators and vent layout are replaced with a raised seat, rigid PETG anchors and clips, a graded dot field and MagSafe
placement. `presets.js` is new, read from Apple's dimensional drawings. `index.html` and `app.js` are rewritten.

The viewer shell these doors fit is a remix of brenpoly's "Mobile VR viewer for modern smartphones", CC BY-NC-SA.
None of its mesh is in this folder.

`vendor/` holds the libraries unmodified. Their licences are in `vendor/LICENSES.txt`: Manifold 3.5.4 (Apache-2.0),
three.js r187 (MIT), fflate 0.8.3 (MIT).

The full Apache License 2.0 text is at the top of `vendor/LICENSES.txt`.
