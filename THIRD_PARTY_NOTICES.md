# Third-party components

## Three.js r187 (0.187.0)

Source: https://github.com/mrdoob/three.js/tree/r187

Copyright © 2010–2026 three.js authors. Distributed under the MIT license;
the original license is included at `web/vendor/three/LICENSE.txt`.

The following upstream files are bundled unchanged for offline use:

| Installed file | Upstream path | Git blob SHA-1 |
| --- | --- | --- |
| `web/vendor/three/three.module.js` | `build/three.module.js` | `4dc5bcedc5dc72dabb37a3da0a98bbaa05321a8a` |
| `web/vendor/three/three.core.js` | `build/three.core.js` | `0ee9b6d588348c3177b91d6093cfe8b167778db8` |
| `web/vendor/three/OrbitControls.js` | `examples/jsm/controls/OrbitControls.js` | `ca690bfa0acc298d2379514e097caa4b97f07f54` |
| `web/vendor/three/BufferGeometryUtils.js` | `examples/jsm/utils/BufferGeometryUtils.js` | `cc9b14d3f2b1619ef617810a3d36e4e43b69211f` |

The small local `package.json` describes the relocated module entry point for
geometry checks under Node. Browser imports use the application's local import
map. No CDN or external service is needed to display the game.

Álfastafl's board and procedural figurine geometry are original project code
covered by the project's GPL-3.0 license.
