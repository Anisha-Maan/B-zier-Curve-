# B-zier-Curve-
# Interactive Bézier Rope — Web

## Behavior Guarantee
The curve reacts exclusively to user input (mouse or touch). All motion is driven by input-updated targets and resolved through a spring–damping model. When input stops, the system dissipates energy and the curve settles to rest. There is no autonomous or time-based animation.

Canvas + JavaScript build where a cubic Bézier acts like a rope: tangents, curvature coloring, De Casteljau steps, and hand-rolled spring physics. No external Bézier or physics helpers. The curve only moves when input updates its targets and then settles via damping.

## Features
- Manual cubic Bézier sampling and derivative for tangents
- Tangent visualization at intervals (normalized short lines)
- Curvature heat coloring along the curve
- Dynamic control points `P1`, `P2` using a spring-damper model
- Advanced: mass-spring chain discretized along the curve (rope feel)
- De Casteljau explorable overlay to teach the math
- 60 FPS rendering via `requestAnimationFrame` and fixed timestep physics
- UI sliders for stiffness `k`, damping, mass, samples; toggles for overlays
- Demo mode animation; optional GIF capture hook

## Math
Cubic Bézier:

B(t) = (1−t)^3 P0 + 3(1−t)^2 t P1 + 3(1−t) t^2 P2 + t^3 P3

Derivative (tangent):

B'(t) = 3(1−t)^2 (P1−P0) + 6(1−t)t (P2−P1) + 3 t^2 (P3−P2)

Curvature (κ):

κ = |x'y'' − y'x''| / ( (x'^2 + y'^2)^(3/2) )

De Casteljau (visualized): point and line blends between control points at a given t.

## Physics
- Dynamic points `P1`, `P2` use an explicit Euler update:
  a = −(k/m)(x − target) − (d/m) v
- Rope: interior mass points are connected by springs to neighbors, plus a guiding spring to the current Bézier sample at that t to keep the rope on the curve, with damping.
- Fixed endpoints `P0`, `P3`. Fixed small physics timestep for stability.

## Run
Open `index.html` in a modern browser.

## Usage
- Drag anywhere to set the target mid-point (split forces to `P1` and `P2`).
- Hold Shift and click near a control point to drag that point directly.
- Toggle tangents, De Casteljau, curvature; adjust physics sliders.
- Use Demo Mode to auto-drive targets for a quick showcase.


## Notes
- Stiffness `k` pulls hard; raise damping if it rings. More mass = slower response.

