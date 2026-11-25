import { useEffect, useRef } from 'react';

const CELL_RADIUS = 28;
const MAX_PATCHES = 3;
const MAX_PATCH_EDGES = 110;
const PATCH_MODES = ['sweep', 'converge', 'diverge'] as const;
type Point = { x: number; y: number };
type Edge = { a: Point; b: Point; middle: Point; path: Path2D };
type PatchEdge = { edge: Edge; delay: number; strength: number };
type Patch = { edges: PatchEdge[]; born: number; end: number; fade: number; accent: boolean };
const random = (min: number, max: number) => min + Math.random() * (max - min);
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Unique hex edges supply both the static mesh and every incomplete glowing patch. */
function honeycomb(width: number, height: number): { edges: Edge[]; mesh: Path2D } {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const mesh = new Path2D();
  const rowHeight = Math.sqrt(3) * CELL_RADIUS;
  const key = (point: Point) => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
  for (let col = -1; col <= Math.ceil(width / (1.5 * CELL_RADIUS)) + 1; col++) {
    for (let row = -1; row <= Math.ceil(height / rowHeight) + 1; row++) {
      const x = col * 1.5 * CELL_RADIUS;
      const y = (row + ((col % 2 + 2) % 2) / 2) * rowHeight;
      const corners = Array.from({ length: 6 }, (_, index) => ({
        x: x + CELL_RADIUS * Math.cos(index * Math.PI / 3),
        y: y + CELL_RADIUS * Math.sin(index * Math.PI / 3),
      }));
      for (let index = 0; index < 6; index++) {
        const a = corners[index];
        const b = corners[(index + 1) % 6];
        const aKey = key(a);
        const bKey = key(b);
        const edgeKey = aKey < bKey ? `${aKey}:${bKey}` : `${bKey}:${aKey}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        const path = new Path2D();
        path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
        mesh.addPath(path);
        edges.push({ a, b, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, path });
      }
    }
  }
  return { edges, mesh };
}

export function AuthLightning() {
  const meshRef = useRef<HTMLCanvasElement>(null);
  const flowRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const meshCanvas = meshRef.current;
    const flowCanvas = flowRef.current;
    const container = flowCanvas?.parentElement;
    const meshContext = meshCanvas?.getContext('2d');
    const context = flowCanvas?.getContext('2d');
    if (!meshCanvas || !flowCanvas || !container || !meshContext || !context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let edges: Edge[] = [];
    let mesh = new Path2D();
    let patches: Patch[] = [];
    let frameId = 0;
    let nextSpawn = 0;
    let lastFrame = 0;
    let directionPass = Math.floor(random(0, 8));
    let modePass = 0;
    let disposed = false;
    let colors = { grid: '', accent: '', core: '', cold: '', coldCore: '' };

    function drawMesh() {
      meshContext!.clearRect(0, 0, width, height);
      meshContext!.lineWidth = 1;
      meshContext!.strokeStyle = colors.grid;
      meshContext!.stroke(mesh);
    }
    function updateColors() {
      const style = getComputedStyle(flowCanvas!);
      colors = {
        grid: style.getPropertyValue('--auth-grid-line').trim(),
        accent: style.getPropertyValue('--auth-flow-accent').trim(),
        core: style.getPropertyValue('--auth-flow-core').trim(),
        cold: style.getPropertyValue('--auth-flow-cold').trim(),
        coldCore: style.getPropertyValue('--auth-flow-cold-core').trim(),
      };
      drawMesh();
    }
    function spawn(now: number) {
      if (patches.length >= MAX_PATCHES) return;
      const center = { x: width * random(.18, .82), y: height * random(.18, .82) };
      const radiusX = Math.min(width * .48, random(170, 240));
      const radiusY = Math.min(height * .42, random(130, 200));
      const mode = PATCH_MODES[modePass % PATCH_MODES.length];
      // Rotating directions cover horizontal, vertical and opposing diagonal passes.
      const angle = (directionPass % 8) * Math.PI / 4 + random(-.15, .15);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const extent = Math.hypot(radiusX * dx, radiusY * dy);
      const passDuration = random(1500, 2000);
      const fade = random(300, 500);
      const selected: PatchEdge[] = [];
      for (const edge of edges) {
        const x = edge.middle.x - center.x;
        const y = edge.middle.y - center.y;
        const radius = (x / radiusX) ** 2 + (y / radiusY) ** 2;
        // Missing edges make a broken lattice, never a filled or complete sheet.
        if (radius > 1 || Math.random() < .28) continue;
        const projection = Math.max(0, Math.min(1, ((x * dx + y * dy) / extent + 1) / 2));
        const radialPhase = Math.sqrt(radius);
        const phase = mode === 'sweep' ? projection : mode === 'diverge' ? radialPhase : 1 - radialPhase;
        selected.push({ edge, delay: phase * (passDuration - 200), strength: .55 + .45 * Math.sqrt(1 - radius) });
      }
      // Keep a spatially scattered subset even on large displays.
      for (let index = selected.length - 1; index > 0; index--) {
        const other = Math.floor(random(0, index + 1));
        [selected[index], selected[other]] = [selected[other], selected[index]];
      }
      patches.push({ edges: selected.slice(0, MAX_PATCH_EDGES), born: now, end: now + passDuration + fade, fade, accent: Math.random() < .7 });
      modePass += 1;
      if (mode === 'sweep') directionPass += 3;
    }
    function resetFlow() {
      patches = [];
      context!.clearRect(0, 0, width, height);
    }
    function resize() {
      const bounds = container!.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      for (const canvas of [meshCanvas!, flowCanvas!]) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      meshContext!.setTransform(ratio, 0, 0, ratio, 0, 0);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      ({ edges, mesh } = honeycomb(width, height));
      drawMesh();
      syncAnimation();
    }
    function drawPatch(patch: Patch, now: number) {
      context!.lineCap = 'round';
      context!.lineJoin = 'round';
      const glow = patch.accent ? colors.accent : colors.cold;
      const core = patch.accent ? colors.core : colors.coldCore;
      for (const item of patch.edges) {
        const age = now - patch.born - item.delay;
        if (age <= 0 || age >= 200 + patch.fade) continue;
        const alpha = smooth(age / 160) * (1 - smooth((age - 200) / patch.fade)) * item.strength;
        // Whole edges illuminate in parallel; no traveling tip, dot or ordered path.
        context!.globalAlpha = alpha * .16;
        context!.strokeStyle = glow;
        context!.lineWidth = 4;
        context!.shadowColor = glow;
        context!.shadowBlur = 8;
        context!.stroke(item.edge.path);
        context!.globalAlpha = alpha * .48;
        context!.strokeStyle = core;
        context!.lineWidth = 1.3;
        context!.shadowBlur = 0;
        context!.stroke(item.edge.path);
      }
      context!.globalAlpha = 1;
    }
    function render(now: number) {
      if (disposed || document.hidden || motion.matches) { frameId = 0; return; }
      frameId = requestAnimationFrame(render);
      if (now - lastFrame < 1000 / 30) return;
      lastFrame = now;
      context!.clearRect(0, 0, width, height);
      for (let index = patches.length - 1; index >= 0; index--) if (now >= patches[index].end) patches.splice(index, 1);
      if (now >= nextSpawn) { spawn(now); nextSpawn = now + random(1300, 1700); }
      for (const patch of patches) drawPatch(patch, now);
    }
    function syncAnimation() {
      cancelAnimationFrame(frameId);
      frameId = 0;
      resetFlow();
      if (!disposed && !document.hidden && !motion.matches) {
        const now = performance.now();
        spawn(now - 180);
        nextSpawn = now + 1300;
        frameId = requestAnimationFrame(render);
      }
    }

    updateColors();
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const themeObserver = new MutationObserver(updateColors);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    motion.addEventListener('change', syncAnimation);
    document.addEventListener('visibilitychange', syncAnimation);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      motion.removeEventListener('change', syncAnimation);
      document.removeEventListener('visibilitychange', syncAnimation);
    };
  }, []);

  return (
    <div className="sov-auth-honeycomb" aria-hidden="true">
      <canvas ref={meshRef} className="sov-auth-honeycomb-mesh" />
      <canvas ref={flowRef} className="sov-auth-honeycomb-flow" />
    </div>
  );
}
