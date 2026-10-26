# Login backgrounds

Active background: GhostFibers.

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/GhostFibers

Uses the supplied dots preset (3 layers, 72 threads) in gold, warm ivory and amber.
WebGL2 renderer, no additional dependencies. Local changes synchronize refs after
commit, report unavailable WebGL2 or shader failures to the login fallback and mark
the renderer ready for browser verification. The original handles reduced motion,
visibility, pointer interactions and GPU cleanup.

Previous trial: AeroShards.

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/AeroShards

Uses the supplied glass/plus preset with 1300 shards and the State Love gold and
graphite palette. Local changes synchronize settings refs in a layout effect for
React 19 and mark the mounted renderer ready for browser verification. Upstream
handles reduced motion, hidden-page pause, pointer interactions and GPU disposal.
GPU errors retain the graphite fallback and usable login form.

The former ShapeWaves source remains available for reverting the trial:

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/ShapeWaves

License: MIT + Commons Clause; full notice is in REACT-BITS-LICENSE and is also
shipped as frontend/public/third-party/react-bits-LICENSE.txt.

ShapeWaves compatibility changes: explicit 2D texture kind for vgpu 0.5 and
imperative settings refs synchronized in a layout effect for React 19.

vgpu brings Node/MCP tooling dependencies despite the browser-only entry point.
The package overrides keep those transitive dependencies on patched versions;
only the browser renderer is imported by the login page.
