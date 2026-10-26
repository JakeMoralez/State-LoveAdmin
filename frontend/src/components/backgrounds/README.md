# ShapeWaves

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/ShapeWaves

License: MIT + Commons Clause; full notice is in REACT-BITS-LICENSE and is also
shipped as frontend/public/third-party/react-bits-LICENSE.txt.

Local compatibility changes: explicit 2D texture kind for vgpu 0.5; imperative
settings refs synchronized in a layout effect for React 19. Props and shaders
remain upstream. Login supplies the State Love palette and a subdued wrapper
opacity. Reduced motion, hidden-page pause and GPU disposal are provided by the
component; GPU failure leaves a graphite fallback and an interactive login form.

vgpu brings Node/MCP tooling dependencies despite the browser-only entry point.
The package overrides keep those transitive dependencies on patched versions;
only the browser renderer is imported by the login page.
