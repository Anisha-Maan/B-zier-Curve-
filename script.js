// Interactive Bézier Rope — Physics & Tangents
// Plain JS + Canvas. No physics/Bézier libraries.
// Sections: Math • Physics • Input • Rendering • Loop • HUD

(function() {
  // ===== HUD (DOM) =====
  const hudFpsEl = document.getElementById('hudFps');
  const hudKEl = document.getElementById('hudK');
  const hudDEl = document.getElementById('hudD');
  const hudMEl = document.getElementById('hudM');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const DPR = Math.max(1, window.devicePixelRatio || 1);

  // Resize for DPR clarity
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * DPR);
    canvas.height = Math.floor(rect.height * DPR);
  }
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); });

  // UI elements
  const kSlider = document.getElementById('stiffness');
  const dSlider = document.getElementById('damping');
  const mSlider = document.getElementById('mass');
  const nSlider = document.getElementById('samples');
  const showTangents = document.getElementById('showTangents');
  const showCasteljau = document.getElementById('showCasteljau');
  const colorCurvature = document.getElementById('colorCurvature');
  const resetBtn = document.getElementById('resetBtn');
  const gifBtn = document.getElementById('gifBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const hideOverlayChk = document.getElementById('hideOverlay');
  const overlayEl = document.getElementById('overlay');
  const legendEl = document.getElementById('legend');
  const tipsEl = document.getElementById('tips');
  const kVal = document.getElementById('kVal');
  const dVal = document.getElementById('dVal');
  const mVal = document.getElementById('mVal');
  const nVal = document.getElementById('nVal');

  // Update labels
  function updateLabels() {
    kVal.textContent = Number(kSlider.value).toFixed(0);
    dVal.textContent = Number(dSlider.value).toFixed(2);
    mVal.textContent = Number(mSlider.value).toFixed(1);
    nVal.textContent = Number(nSlider.value).toFixed(0);
  }
  updateLabels();
  [kSlider, dSlider, mSlider, nSlider].forEach(el => el.addEventListener('input', updateLabels));

  // ===== Math helpers =====
  function vec(x, y){ return {x, y}; }
  function add(a,b){ return vec(a.x+b.x, a.y+b.y); }
  function sub(a,b){ return vec(a.x-b.x, a.y-b.y); }
  function mul(a,s){ return vec(a.x*s, a.y*s); }
  function dot(a,b){ return a.x*b.x + a.y*b.y; }
  function len(a){ return Math.hypot(a.x, a.y); }
  function norm(a){ const L = len(a) || 1; return vec(a.x/L, a.y/L); }

  // ===== Bézier functions (cubic) =====
  function bezierPoint(P0, P1, P2, P3, t){
    const u = 1 - t;
    const tt = t*t, uu = u*u;
    const uuu = uu*u, ttt = tt*t;
    const p = vec(0,0);
    p.x = uuu*P0.x + 3*uu*t*P1.x + 3*u*tt*P2.x + ttt*P3.x;
    p.y = uuu*P0.y + 3*uu*t*P1.y + 3*u*tt*P2.y + ttt*P3.y;
    return p;
  }
  function bezierTangent(P0, P1, P2, P3, t){
    const u = 1 - t;
    const p = vec(0,0);
    p.x = 3*u*u*(P1.x-P0.x) + 6*u*t*(P2.x-P1.x) + 3*t*t*(P3.x-P2.x);
    p.y = 3*u*u*(P1.y-P0.y) + 6*u*t*(P2.y-P1.y) + 3*t*t*(P3.y-P2.y);
    return p;
  }
  function curvature(P0,P1,P2,P3,t){
    // kappa = |x'y'' - y'x''| / ( (x'^2 + y'^2)^(3/2) )
    const u = 1 - t;
    const dx = 3*u*u*(P1.x-P0.x) + 6*u*t*(P2.x-P1.x) + 3*t*t*(P3.x-P2.x);
    const dy = 3*u*u*(P1.y-P0.y) + 6*u*t*(P2.y-P1.y) + 3*t*t*(P3.y-P2.y);
    const ddx = 6*u*(P2.x - 2*P1.x + P0.x) + 6*t*(P3.x - 2*P2.x + P1.x);
    const ddy = 6*u*(P2.y - 2*P1.y + P0.y) + 6*t*(P3.y - 2*P2.y + P1.y);
    const num = Math.abs(dx*ddy - dy*ddx);
    const den = Math.pow(dx*dx + dy*dy, 1.5) + 1e-6;
    return num/den;
  }

  // ===== De Casteljau construction (for visualization) =====
  function casteljau(P0,P1,P2,P3,t){
    const L01 = lerp(P0,P1,t);
    const L12 = lerp(P1,P2,t);
    const L23 = lerp(P2,P3,t);
    const Q0 = lerp(L01,L12,t);
    const Q1 = lerp(L12,L23,t);
    const B = lerp(Q0,Q1,t);
    return {L01,L12,L23,Q0,Q1,B};
  }
  function lerp(a,b,t){ return vec(a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t); }

  // ===== Control points =====
  const W = canvas.width, H = canvas.height;
  let P0 = vec(W*0.15, H*0.5);
  let P3 = vec(W*0.85, H*0.5);

  // ===== Dynamic points P1/P2 with spring-damper =====
  function makeDynamicPoint(initial){
    return {
      pos: vec(initial.x, initial.y),
      vel: vec(0,0),
      target: vec(initial.x, initial.y)
    };
  }
  const P1dyn = makeDynamicPoint(vec(W*0.35, H*0.2));
  const P2dyn = makeDynamicPoint(vec(W*0.65, H*0.8));

  // ===== Rope: mass-spring chain along curve samples (advanced) =====
  let samples = Number(nSlider.value);
  let ropePoints = new Array(samples).fill(0).map((_,i)=>{
    const t = i/(samples-1);
    const p = bezierPoint(P0,P1dyn.pos,P2dyn.pos,P3,t);
    return { pos: p, vel: vec(0,0), mass: Number(mSlider.value) };
  });

  function rebuildRope(){
    samples = Number(nSlider.value);
    ropePoints = new Array(samples).fill(0).map((_,i)=>{
      const t = i/(samples-1);
      const p = bezierPoint(P0,P1dyn.pos,P2dyn.pos,P3,t);
      return { pos: p, vel: vec(0,0), mass: Number(mSlider.value) };
    });
  }
  nSlider.addEventListener('input', rebuildRope);
  mSlider.addEventListener('input', ()=>{
    ropePoints.forEach(rp=>{ rp.mass = Number(mSlider.value); });
  });

  // ===== Input handling: mouse / touch =====
  let pointer = vec(W*0.5, H*0.5);
  let pointerActive = false;
  let draggingPoint = null; // 'P0','P1','P2','P3' when shift-dragging

  canvas.addEventListener('pointerdown', (e)=>{
    canvas.setPointerCapture(e.pointerId);
    pointerActive = true;
    const local = getLocal(e);
    pointer = local;
    if (e.shiftKey) {
      const hit = hitTestPoint(local);
      draggingPoint = hit; // may be null
    }
  });
  canvas.addEventListener('pointermove', (e)=>{
    const local = getLocal(e);
    pointer = local;
    if (pointerActive) {
      if (draggingPoint) {
        if (draggingPoint==='P0') P0 = local;
        if (draggingPoint==='P3') P3 = local;
        if (draggingPoint==='P1') P1dyn.pos = local;
        if (draggingPoint==='P2') P2dyn.pos = local;
      } else {
        // Move targets for dynamic points towards pointer (split influence)
        const mid = pointer;
        P1dyn.target = add(mid, vec(-100, -60));
        P2dyn.target = add(mid, vec(100, 60));
      }
    }
  });
  canvas.addEventListener('pointerup', (e)=>{
    pointerActive = false;
    draggingPoint = null;
  });

  function getLocal(e){
    const rect = canvas.getBoundingClientRect();
    return vec((e.clientX - rect.left)*DPR, (e.clientY - rect.top)*DPR);
  }

  function hitTestPoint(p){
    const r = 14*DPR;
    if (len(sub(p,P0)) < r) return 'P0';
    if (len(sub(p,P3)) < r) return 'P3';
    if (len(sub(p,P1dyn.pos)) < r) return 'P1';
    if (len(sub(p,P2dyn.pos)) < r) return 'P2';
    return null;
  }

  // ===== Physics update (explicit Euler) =====
  function updateDynamicPoint(dp, dt){
    const k = Number(kSlider.value);
    const d = Number(dSlider.value);
    const m = Number(mSlider.value);
    const x = dp.pos;
    const v = dp.vel;
    const target = dp.target;
    const a = add(mul(sub(target, x), k/m), mul(v, -d/m)); // -(k/m)(x - target) - (d/m)v
    dp.vel = add(v, mul(a, dt));
    dp.pos = add(x, mul(dp.vel, dt));
    // Resting clamp: if near target and slow, snap to rest
    if (len(sub(dp.pos, target)) < 0.6 && len(dp.vel) < 0.08){
      dp.pos = vec(target.x, target.y);
      dp.vel = vec(0,0);
    }
  }

  // ===== Rope physics (Hooke + damping) =====
  function updateRope(dt){
    const k = Number(kSlider.value);
    const d = Number(dSlider.value);

    // Anchor endpoints to current Bézier endpoints at each frame
    ropePoints[0].pos = vec(P0.x, P0.y);
    ropePoints[0].vel = vec(0,0);
    ropePoints[ropePoints.length-1].pos = vec(P3.x, P3.y);
    ropePoints[ropePoints.length-1].vel = vec(0,0);

    // For interior points, apply spring forces towards neighbors
    for (let i=1; i<ropePoints.length-1; i++){
      const rp = ropePoints[i];
      const mass = rp.mass;
      const left = ropePoints[i-1];
      const right = ropePoints[i+1];
      const restLeft = sub(rp.pos, left.pos);
      const restRight = sub(rp.pos, right.pos);

      // target positions guided by current Bézier sampling
      const t = i/(ropePoints.length-1);
      const guide = bezierPoint(P0,P1dyn.pos,P2dyn.pos,P3,t);

      // Spring towards guide to keep rope on curve
      const Fguide = mul(sub(guide, rp.pos), k*0.5);

      // Neighbor springs (rope coherence)
      const Fl = mul(sub(left.pos, rp.pos), k*0.25);
      const Fr = mul(sub(right.pos, rp.pos), k*0.25);

      // Damping proportional to velocity
      const Fd = mul(rp.vel, -d);

      const F = add(add(add(Fguide, Fl), Fr), Fd);
      const a = mul(F, 1/(mass+1e-6));
      rp.vel = add(rp.vel, mul(a, dt));
      rp.pos = add(rp.pos, mul(rp.vel, dt));

      // Resting clamp for rope nodes to prevent endless micro-oscillation
      if (len(rp.vel) < 0.06){
        rp.vel = vec(0,0);
      }
    }
  }

  // Reset
  resetBtn.addEventListener('click', ()=>{
    P0 = vec(W*0.15, H*0.5);
    P3 = vec(W*0.85, H*0.5);
    P1dyn.pos = vec(W*0.35, H*0.2);
    P2dyn.pos = vec(W*0.65, H*0.8);
    P1dyn.vel = vec(0,0); P2dyn.vel = vec(0,0);
    P1dyn.target = vec(P1dyn.pos.x, P1dyn.pos.y);
    P2dyn.target = vec(P2dyn.pos.x, P2dyn.pos.y);
    rebuildRope();
  });

  
  let capturer = null;
  gifBtn.addEventListener('click', ()=>{
    if (capturer) { capturer.stop(); capturer = null; return; }
    if (typeof CCapture === 'undefined') {
      alert('To record a GIF, include CCapture.js in this page.');
      return;
    }
    capturer = new CCapture({ format: 'gif', workersPath: './', framerate: 60 });
    capturer.start();
    setTimeout(()=>{ capturer.stop(); capturer.save(); capturer = null; }, 5000);
  });

  // ===== Pause / Resume =====
  let paused = false;
  pauseBtn.addEventListener('click', ()=>{
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    const note = document.getElementById('hudNote');
    if (note) note.textContent = paused ? 'Paused. Click Resume to continue.' : 'Drag to drive targets. Shift-drag to move points.';
  });

  // ===== Overlay visibility toggle =====
  hideOverlayChk.addEventListener('change', ()=>{
    const hidden = hideOverlayChk.checked;
    overlayEl.style.display = hidden ? 'none' : 'block';
  });

  // ===== Rendering helpers =====
  function drawCircle(p, r, color){
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 2*DPR;
    ctx.fill();
    ctx.stroke();
  }

  function drawLine(a,b,width,color){
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function curvatureColor(k){
    // Map curvature to color from green to red
    const clamped = Math.min(1, k * 300);
    const r = Math.floor(255 * clamped);
    const g = Math.floor(255 * (1 - clamped));
    return `rgba(${r},${g},120,0.9)`;
  }

  function render(dt){
    ctx.clearRect(0,0,canvas.width, canvas.height);

    // Background subtle grid
    drawGrid();

    // Update physics (skip when paused)
    const fixedDt = 1/120; // fixed small time step for stability
    if (!paused){
      let steps = Math.ceil(dt / fixedDt);
      steps = Math.max(1, Math.min(5, steps));
      for (let s=0; s<steps; s++){
        const step = dt/steps;
        updateDynamicPoint(P1dyn, step);
        updateDynamicPoint(P2dyn, step);
        updateRope(step);
      }
    }

    // Sample curve
    const pts = [];
    for (let i=0; i<samples; i++){
      const t = i/(samples-1);
      pts.push(bezierPoint(P0, P1dyn.pos, P2dyn.pos, P3, t));
    }

    // Draw curve polyline, color by curvature optionally
    for (let i=0; i<pts.length-1; i++){
      const t = i/(pts.length-1);
      const kappa = curvature(P0,P1dyn.pos,P2dyn.pos,P3,t);
      const col = colorCurvature.checked ? curvatureColor(kappa) : '#5fb3ff';
      drawLine(pts[i], pts[i+1], 3*DPR, col);
    }

    // Draw tangents
    if (showTangents.checked){
      for (let i=0; i<pts.length; i+=Math.floor(samples/16)){
        const t = i/(samples-1);
        const tan = norm(bezierTangent(P0,P1dyn.pos,P2dyn.pos,P3,t));
        const p = pts[i];
        drawLine(p, add(p, mul(tan, 24*DPR)), 2*DPR, 'rgba(255,255,255,0.6)');
      }
    }

    // Draw control polygon
    drawLine(P0, P1dyn.pos, 1.5*DPR, 'rgba(120,200,255,0.35)');
    drawLine(P1dyn.pos, P2dyn.pos, 1.5*DPR, 'rgba(120,200,255,0.35)');
    drawLine(P2dyn.pos, P3, 1.5*DPR, 'rgba(120,200,255,0.35)');

    // Draw points
    drawCircle(P0, 6*DPR, 'rgba(135,206,235,1)');
    drawCircle(P3, 6*DPR, 'rgba(255,158,209,1)');
    drawCircle(P1dyn.pos, 6*DPR, 'rgba(0,229,255,1)');
    drawCircle(P2dyn.pos, 6*DPR, 'rgba(160,255,157,1)');

    // De Casteljau visualization for current t (use pointer-based t)
    if (showCasteljau.checked){
      const t = Math.max(0, Math.min(1, pointer.x / canvas.width));
      const C = casteljau(P0,P1dyn.pos,P2dyn.pos,P3,t);
      // intermediate lines
      drawLine(P0, P1dyn.pos, 2*DPR, 'rgba(255,255,255,0.12)');
      drawLine(P1dyn.pos, P2dyn.pos, 2*DPR, 'rgba(255,255,255,0.12)');
      drawLine(P2dyn.pos, P3, 2*DPR, 'rgba(255,255,255,0.12)');
      drawCircle(C.L01, 4*DPR, 'rgba(255,255,255,0.6)');
      drawCircle(C.L12, 4*DPR, 'rgba(255,255,255,0.6)');
      drawCircle(C.L23, 4*DPR, 'rgba(255,255,255,0.6)');
      drawLine(C.L01, C.L12, 2*DPR, 'rgba(0,255,255,0.4)');
      drawLine(C.L12, C.L23, 2*DPR, 'rgba(0,255,255,0.4)');
      drawCircle(C.Q0, 4*DPR, 'rgba(255,200,0,0.8)');
      drawCircle(C.Q1, 4*DPR, 'rgba(255,200,0,0.8)');
      drawLine(C.Q0, C.Q1, 2*DPR, 'rgba(255,200,0,0.6)');
      drawCircle(C.B, 5*DPR, 'rgba(255,80,80,0.9)');

      // small annotations
      annotate(C.L01, 'L01');
      annotate(C.L12, 'L12');
      annotate(C.L23, 'L23');
      annotate(C.Q0, 'Q0');
      annotate(C.Q1, 'Q1');
      annotate(C.B, 'B(t)');
    }

    if (capturer) {
      capturer.capture(canvas);
    }
  }

  function drawGrid(){
    ctx.save();
    ctx.lineWidth = 1*DPR;
    ctx.strokeStyle = 'rgba(120,140,180,0.07)';
    const step = 40*DPR;
    for (let x=0; x<canvas.width; x+=step){
      ctx.beginPath();
      ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for (let y=0; y<canvas.height; y+=step){
      ctx.beginPath();
      ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }
    ctx.restore();
  }

  // ===== Animation loop & FPS =====
  let last = performance.now();
  let fpsLast = last;
  let fpsFrames = 0;
  function frame(now){
    const dt = Math.min(0.05, (now - last)/1000);
    last = now;
    render(dt);
    // FPS update (~10 times per second)
    fpsFrames++;
    if (now - fpsLast > 100){
      const fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
      fpsFrames = 0; fpsLast = now;
      hudFpsEl.textContent = String(fps);
      hudKEl.textContent = Number(kSlider.value).toFixed(0);
      hudDEl.textContent = Number(dSlider.value).toFixed(2);
      hudMEl.textContent = Number(mSlider.value).toFixed(1);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ===== Tiny annotation renderer =====
  function annotate(p, text){
    ctx.save();
    ctx.fillStyle = 'rgba(200,220,255,0.85)';
    ctx.font = `${12*DPR}px Segoe UI, Arial`;
    ctx.fillText(text, p.x + 6*DPR, p.y - 6*DPR);
    ctx.restore();
  }
})();
