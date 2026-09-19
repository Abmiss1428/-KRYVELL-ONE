# NYXCORE motion freeze fix

Root cause found in `nyxcore-speed.js` v1.1.0: the adaptive thermal guard could set `engine.running = false` at the `critical` level. On iPhone/iPad, sustained FPS/event-loop pressure could therefore leave the visible organisms rendered but no longer advancing.

Fix:
- restore movement-safe speed control behavior;
- never pause the life engine from the speed module;
- keep adaptive speed reduction;
- let the dedicated `nyxcore-thermal.js` module throttle render/AI/budget without stopping life;
- preserve IndexedDB population and local state; no reset.
