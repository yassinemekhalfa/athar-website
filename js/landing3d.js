(function(){
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
if (hasGsap && typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isLight = () => css('--logo-filter') === 'none';

/* ---------- NAV ---------- */
const nav = document.getElementById('nav');
const menuToggle = document.querySelector('.menu-toggle'), menu = document.getElementById('main-navigation');
function closeMenu(restoreFocus=false){menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label','فتح القائمة');menu.classList.remove('is-open');if(restoreFocus)menuToggle.focus();}
menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'إغلاق القائمة':'فتح القائمة');menu.classList.toggle('is-open',open);});
menu.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('click',event=>{if(!nav.contains(event.target))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.classList.contains('is-open'))closeMenu(true);});
matchMedia('(max-width: 900px)').addEventListener('change',()=>closeMenu());
document.getElementById('copyright-year').textContent=String(new Date().getFullYear());
// Keep existing workspace bookmarks working when entering through the site root.
if(/^#\/(?:resource|folder|f|home|tasks|my-tasks|inbox|invoices|clients|proposals|library-[a-z]+|settings|profile)(?:\/|$)/.test(location.hash))location.replace((window.ATHAR_PUBLIC_SITE?.portalOrigin?new URL('/workspace.html',window.ATHAR_PUBLIC_SITE.portalOrigin).href:'workspace.html')+location.hash);
const onScrollNav = () => nav.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', onScrollNav, {passive:true}); onScrollNav();

/* ---------- HERO TEXT: split words (keeps Arabic letters joined) ---------- */
function splitHeroTitle(){
  document.querySelectorAll('#h1 .line').forEach(line=>{
    line.innerHTML=line.textContent.trim().split(/\s+/).map(word=>`<span class="w">${word}</span>`).join(' ');
  });
}
splitHeroTitle();
document.addEventListener('landing-language-change',splitHeroTitle);
if (hasGsap && !reduce){
  gsap.set('#h1 .w',{rotateX:-95,y:30,opacity:0});
  gsap.set('[data-in]',{y:24,opacity:0});
  const tl = gsap.timeline({delay:.9});
  tl.to('.hero-kicker',{y:0,opacity:1,duration:.7,ease:'power3.out'})
    .to('#h1 .w',{rotateX:0,y:0,opacity:1,duration:1.1,stagger:.12,ease:'power4.out'},'-=.4')
    .to('.hero p.lead, .hero .hero-ctas',{y:0,opacity:1,duration:.8,stagger:.12,ease:'power3.out'},'-=.7');
}

/* ---------- HERO 3D: particles that assemble into the Athar logo ---------- */
function initHero(){
  if (typeof THREE === 'undefined') { document.documentElement.classList.add('no-webgl'); return; }
  const canvas = document.getElementById('gl');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true}); }
  catch(e){ document.documentElement.classList.add('no-webgl'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40,1,.1,100);
  camera.position.set(0,0,14);
  const group = new THREE.Group(); scene.add(group);

  const img = new Image();
  img.onload = () => build(img);
  img.onerror = () => document.documentElement.classList.add('no-webgl');
  img.src = document.querySelector('.hero-fallback').src;

  const uniforms = {
    uTime:{value:0}, uProgress:{value:reduce||!hasGsap?1:0}, uScatter:{value:0},
    uMouse:{value:new THREE.Vector2(99,99)}, uMouseStr:{value:0},
    uSize:{value:2.3}, uPR:{value:renderer.getPixelRatio()}, uOpacity:{value:1},
    uC1:{value:new THREE.Color()}, uC2:{value:new THREE.Color()}, uC3:{value:new THREE.Color()}
  };
  let material, dust;
  function applyTheme(){
    const light = isLight();
    uniforms.uC1.value.set(light? '#6A1FF0':'#7B2FFF');
    uniforms.uC2.value.set(light? '#9C6BFF':'#C9B3FF');
    uniforms.uC3.value.set(light? '#2A1460':'#FFFFFF');
    uniforms.uOpacity.value = light? 1 : .95;
    uniforms.uSize.value = light? 3.1 : 2.8;
    if (material){ material.blending = light? THREE.NormalBlending : THREE.AdditiveBlending; material.needsUpdate = true; }
    if (dust){ dust.material.color.set(light? '#6A1FF0':'#C9B3FF'); dust.material.opacity = light? .35 : .45; }
  }

  function build(image){
    const W = 440, H = Math.round(image.height * W / image.width);
    const c = document.createElement('canvas'); c.width=W; c.height=H;
    const ctx = c.getContext('2d'); ctx.drawImage(image,0,0,W,H);
    const data = ctx.getImageData(0,0,W,H).data;
    const pts = [];
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (data[(y*W+x)*4+3] > 120) pts.push(x,y);
    const mobile = innerWidth < 700;
    const N = Math.min(pts.length/2, mobile? 7000 : 13000);
    const LW = 8.5, s = LW / W;
    const target = new Float32Array(N*3), start = new Float32Array(N*3), dir = new Float32Array(N*3), rnd = new Float32Array(N);
    for (let i=0;i<N;i++){
      const k = Math.floor(Math.random()*pts.length/2)*2;
      target[i*3]   = (pts[k] - W/2 + Math.random()-.5) * s;
      target[i*3+1] = -(pts[k+1] - H/2 + Math.random()-.5) * s;
      target[i*3+2] = (Math.random()-.5) * .55;
      const r = 7 + Math.random()*9, th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
      start[i*3] = r*Math.sin(ph)*Math.cos(th); start[i*3+1] = r*Math.sin(ph)*Math.sin(th); start[i*3+2] = r*Math.cos(ph) - 4;
      const v = new THREE.Vector3(Math.random()-.5, Math.random()-.5, Math.random()-.5).normalize();
      dir[i*3]=v.x; dir[i*3+1]=v.y; dir[i*3+2]=v.z;
      rnd[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(target,3));
    g.setAttribute('aTarget', new THREE.BufferAttribute(target,3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start,3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir,3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd,1));
    material = new THREE.ShaderMaterial({
      uniforms, transparent:true, depthWrite:false,
      vertexShader:`
        attribute vec3 aTarget; attribute vec3 aStart; attribute vec3 aDir; attribute float aRand;
        uniform float uTime,uProgress,uScatter,uSize,uPR,uMouseStr; uniform vec2 uMouse;
        uniform vec3 uC1,uC2,uC3; varying vec3 vColor; varying float vAlpha;
        float ease(float t){ return t<.5 ? 4.*t*t*t : 1.-pow(-2.*t+2.,3.)/2.; }
        void main(){
          float p = ease(clamp(uProgress*1.7 - aRand*.7, 0., 1.));
          vec3 pos = mix(aStart, aTarget, p);
          float sw = (1.-p)*2.4; float c=cos(sw), s=sin(sw);
          pos.xz = mat2(c,-s,s,c)*pos.xz;
          pos += vec3(sin(uTime*.9+aRand*31.)*.022, cos(uTime*.8+aRand*17.)*.022, sin(uTime*.6+aRand*9.)*.07);
          vec2 d = pos.xy - uMouse; float dist = length(d);
          float f = smoothstep(1.5, 0., dist) * uMouseStr * p;
          pos.xy += normalize(d + 1e-4) * f * .85; pos.z += f * 1.6;
          pos += aDir * uScatter * (2.5 + aRand*8.); pos.y += uScatter*uScatter*aRand*5.;
          vec4 mv = modelViewMatrix * vec4(pos,1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPR * (.55 + aRand*.9) * (10. / -mv.z);
          float t = fract(aRand*7.13);
          vColor = t < .55 ? uC1 : (t < .86 ? uC2 : uC3);
          vColor = mix(vColor, uC3, f*.7);
          vAlpha = (.3 + .7*p) * (1. - uScatter*.9);
        }`,
      fragmentShader:`
        uniform float uOpacity; varying vec3 vColor; varying float vAlpha;
        void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
          gl_FragColor = vec4(vColor, smoothstep(.5,.06,d) * vAlpha * uOpacity); }`
    });
    group.add(new THREE.Points(g, material));

    // ambient dust for depth
    const DN = mobile? 500 : 1200, dp = new Float32Array(DN*3);
    for (let i=0;i<DN;i++){ dp[i*3]=(Math.random()-.5)*40; dp[i*3+1]=(Math.random()-.5)*26; dp[i*3+2]=(Math.random()-.5)*20-4; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp,3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({size:.045, transparent:true, depthWrite:false}));
    scene.add(dust);

    applyTheme(); resize();
    if (hasGsap && !reduce) gsap.to(uniforms.uProgress,{value:1, duration:3.2, ease:'power2.inOut', delay:.15});
    requestAnimationFrame(loop);
  }

  // layout: logo on the left on desktop, on top on mobile
  function resize(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix();
    const vh = 2*Math.tan(THREE.MathUtils.degToRad(20))*14, vw = vh*camera.aspect;
    if (w >= 900){ const LW = Math.min(vw*.4, 8.6); group.scale.setScalar(LW/8.5); group.position.set(-vw*.24, .2, 0); }
    else { const LW = Math.min(vw*.46, 4.3); group.scale.setScalar(LW/8.5); group.position.set(0, vh*.32, 0); }
  }
  addEventListener('resize', resize);

  const mouse = {x:0,y:0,tx:0,ty:0,active:0,last:0};
  const setPointer = (cx,cy) => { mouse.tx = cx/innerWidth*2-1; mouse.ty = -(cy/innerHeight*2-1); mouse.last = performance.now(); };
  addEventListener('pointermove', e => setPointer(e.clientX, e.clientY), {passive:true});
  addEventListener('touchmove', e => { const t=e.touches[0]; if(t) setPointer(t.clientX,t.clientY); }, {passive:true});

  const v = new THREE.Vector3(), dirV = new THREE.Vector3(), clock = new THREE.Clock();
  function loop(){
    requestAnimationFrame(loop);
    const scroll = Math.min(scrollY / (innerHeight*.9), 1);
    if (scroll >= 1 || document.hidden) return; // hero off screen: skip rendering
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uScatter.value = reduce ? 0 : scroll;
    mouse.x += (mouse.tx - mouse.x)*.06; mouse.y += (mouse.ty - mouse.y)*.06;
    const recent = performance.now() - mouse.last < 1800 ? 1 : 0;
    mouse.active += (recent - mouse.active)*.05;
    uniforms.uMouseStr.value = reduce ? 0 : mouse.active;
    if (!reduce){
      group.rotation.y = mouse.x*.38 + Math.sin(t*.25)*.06;
      group.rotation.x = -mouse.y*.22;
      if (dust){ dust.rotation.y = t*.015 + mouse.x*.1; dust.rotation.x = mouse.y*.05; }
    }
    // pointer on plane z=0 -> group local space
    v.set(mouse.tx, mouse.ty, .5).unproject(camera);
    dirV.copy(v).sub(camera.position).normalize();
    const k = -camera.position.z / dirV.z;
    v.copy(camera.position).addScaledVector(dirV, k);
    group.updateMatrixWorld(); group.worldToLocal(v);
    uniforms.uMouse.value.set(v.x, v.y);
    renderer.render(scene, camera);
  }

  new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
}
initHero();

/* ---------- ABOUT: statue follows the pointer in 3D ---------- */
(function(){
  const stage = document.getElementById('statueStage'), tilt = document.getElementById('statueTilt');
  if (reduce) return;
  let rx=0, ry=0, tx=0, ty=0, run=false;
  const tick = () => { rx += (tx-rx)*.08; ry += (ty-ry)*.08;
    tilt.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    if (Math.abs(tx-rx)+Math.abs(ty-ry) > .01) requestAnimationFrame(tick); else run=false; };
  const go = () => { if(!run){ run=true; requestAnimationFrame(tick);} };
  addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    tx = -((e.clientY - (r.top + r.height/2)) / innerHeight) * 22;
    ty =  ((e.clientX - (r.left + r.width/2)) / innerWidth) * 30;
    go();
  }, {passive:true});
  if (hasGsap) gsap.fromTo(stage,{rotateY:-25, opacity:0, scale:.9},{rotateY:0, opacity:1, scale:1, ease:'power2.out',
    scrollTrigger:{trigger:stage, start:'top 90%', end:'top 40%', scrub:.8}});
})();

/* ---------- STATS: count up ---------- */
document.querySelectorAll('[data-count]').forEach(el=>{
  const end = parseFloat(el.dataset.count), dec = +(el.dataset.dec||0), pre = el.dataset.pre||'', suf = el.dataset.suf||'';
  if (!hasGsap || reduce) return;
  const o = {v:0};
  ScrollTrigger.create({trigger:el, start:'top 88%', once:true, onEnter:()=>{
    gsap.to(o,{v:end, duration:1.8, ease:'power2.out', onUpdate:()=>{ el.textContent = pre + o.v.toFixed(dec) + suf; }});
  }});
  el.textContent = pre + (0).toFixed(dec) + suf;
});

/* ---------- SERVICES: 3D ring ---------- */
const services = [
  ['استراتيجية العلامة','نكتشف جوهر علامتك، ونرسم موقعها في السوق، ونحدّد الرسائل التي تستحق أن تُسمع.',['تموضع العلامة','فهم الجمهور','نبرة الصوت']],
  ['الهوية البصرية','نمنح فكرتك ملامحها الخاصة، ونبني لغة بصرية تتعرّف عليها العين وتتذكّرها.',['الشعار','الألوان والخطوط','دليل الهوية']],
  ['المحتوى الإبداعي','نكتب ونصمّم محتوى يعبّر عن شخصيتك، ويحوّل رسالتك إلى حوار مع جمهورك.',['الكتابة الإبداعية','تصاميم التواصل','خطط المحتوى']],
  ['الحملات التسويقية','حملات Meta وTikTok تجمع الفكرة والرسالة والقناة، لجلب العملاء وزيادة المبيعات.',['الفكرة الإبداعية','محتوى الحملة','المتابعة بالأرقام']],
  ['المواقع والتجارب الرقمية','نحوّل حضورك الرقمي إلى تجربة سهلة وواضحة، تضع جمهورك في قلب كل تفصيلة.',['تصميم الواجهات','تجربة المستخدم','تطوير المواقع']],
  ['الإنتاج البصري','صور وفيديو وموشن تحكي قصتك، من أول سطر في الفكرة إلى آخر لقطة.',['السيناريو','التصوير والمونتاج','الموشن جرافيك']],
  ['تطبيقات العلامة','نمدّ لغة علامتك إلى التفاصيل التي يلتقي بها جمهورك، رقميًا وعلى أرض الواقع.',['المطبوعات','التغليف','الفعاليات']],
  ['المراجعة والتطوير','نراجع حضورك الحالي ونحدّد فرص التحسين، لنطوّر ما يحتاج إلى تغيير باتجاه واضح.',['مراجعة الهوية','تحليل الموقع','خارطة التطوير']]
];
const ring = document.getElementById('ring'), stage = document.getElementById('ringStage'), countEl = document.getElementById('ringCount');
const STEP = 360/services.length;
const cards = services.map((s,i)=>{
  const c = document.createElement('article'); c.className='card'; c.setAttribute('role','listitem');
  c.innerHTML = `<h3>${s[0]}</h3><p>${s[1]}</p><ul>${s[2].map(t=>`<li>${t}</li>`).join('')}</ul>`;
  ring.appendChild(c); return c;
});
let R = 380, ringState = {rot:0}, tiltX = 0, tiltY = 0, tTiltX = 0, tTiltY = 0, current = -1;
function layoutRing(){
  const small = innerWidth <= 900;
  const cw = small? 220 : 290, ch = small? 290 : 360;
  stage.style.setProperty('--cw', cw+'px'); stage.style.setProperty('--ch', ch+'px');
  R = Math.round((cw/2)/Math.tan(Math.PI/services.length) + (small? 18 : 46));
  cards.forEach((c,i)=>{ c.style.transform = `rotateY(${-i*STEP}deg) translateZ(${R}px)`; });
  stage.style.perspective = (small? 1100 : 1700) + 'px';
  renderRing();
}
function renderRing(){
  ring.style.transform = `translateZ(${-R}px) rotateX(${-7 + tiltX}deg) rotateY(${ringState.rot + tiltY}deg)`;
  const idx = ((Math.round(ringState.rot/STEP) % services.length) + services.length) % services.length;
  cards.forEach((c,i)=>{
    const a = (ringState.rot - i*STEP) * Math.PI/180;
    c.style.opacity = (0.12 + 0.88*Math.max(0, Math.cos(a))**1.5).toFixed(3);
  });
  if (idx !== current){ current = idx; cards.forEach((c,i)=>{c.classList.toggle('active', i===idx);c.setAttribute('aria-hidden',String(i!==idx));}); countEl.textContent = (idx+1)+' / '+services.length; }
  document.getElementById('prevBtn').disabled=idx===0;
  document.getElementById('nextBtn').disabled=idx===services.length-1;
}
layoutRing(); addEventListener('resize', layoutRing);

let ringST = null;
const ringQuery=matchMedia('(min-width: 901px) and (min-height: 700px)');
function setupRingScroll(){
 if(ringST){const animation=ringST.animation;ringST.kill(true);animation?.kill();ringST=null;}
 if(!hasGsap||reduce||!ringQuery.matches){renderRing();return;}
  // each card holds a moment in front, then the ring turns to the next one
  const prog = {p:0}, hold = f => { const t = Math.min(Math.max((f-.22)/.56,0),1); return t*t*(3-2*t); };
  const tween = gsap.to(prog,{p:1, ease:'none', onUpdate:()=>{
      const x = prog.p*(services.length-1), i = Math.min(Math.floor(x), services.length-2);
      ringState.rot = (i + hold(x-i))*STEP; renderRing(); },
    scrollTrigger:{trigger:'#services', start:'top top', end:()=>'+='+(innerHeight*3), pin:true, scrub:.8}});
  ringST = tween.scrollTrigger;
}
setupRingScroll();ringQuery.addEventListener('change',setupRingScroll);
if (hasGsap && !reduce){
  // gentle tilt with the pointer
  stage.addEventListener('pointermove', e=>{ const r = stage.getBoundingClientRect();
    tTiltY = ((e.clientX - r.left)/r.width - .5) * 10; tTiltX = -((e.clientY - r.top)/r.height - .5) * 6; });
  stage.addEventListener('pointerleave', ()=>{ tTiltX = tTiltY = 0; });
  (function tiltLoop(){ tiltX += (tTiltX-tiltX)*.07; tiltY += (tTiltY-tiltY)*.07; if (Math.abs(tTiltX-tiltX)+Math.abs(tTiltY-tiltY) > .005) renderRing(); requestAnimationFrame(tiltLoop); })();
}
function goTo(idx){
  idx = Math.max(0, Math.min(services.length-1, idx));
  if (ringST){ const y = ringST.start + (idx/(services.length-1))*(ringST.end-ringST.start-1); scrollTo({top:y, behavior: reduce?'auto':'smooth'}); }
  else { ringState.rot = idx*STEP; renderRing(); }
}
document.getElementById('nextBtn').onclick = () => goTo(current+1);
document.getElementById('prevBtn').onclick = () => goTo(current-1);
stage.tabIndex = 0; stage.setAttribute('aria-label','عجلة الخدمات، استعمل الأسهم للتنقل');
stage.addEventListener('keydown', e=>{ if(e.key==='ArrowLeft'){goTo(current+1);e.preventDefault();} if(e.key==='ArrowRight'){goTo(current-1);e.preventDefault();} });

/* ---------- PROCESS: statue turns while the steps fill ---------- */
if (hasGsap && !reduce){
  gsap.fromTo('#writer',{rotateY:-28, rotateX:4},{rotateY:24, rotateX:-2, ease:'none',
    scrollTrigger:{trigger:'#how', start:'top 70%', end:'bottom 30%', scrub:1}});
  gsap.to('#stepsFill',{scaleY:1, ease:'none', scrollTrigger:{trigger:'#steps', start:'top 60%', end:'bottom 60%', scrub:.6}});
  document.querySelectorAll('.step').forEach(s=>{
    ScrollTrigger.create({trigger:s, start:'top 62%', onEnter:()=>s.classList.add('on'), onLeaveBack:()=>s.classList.remove('on')});
  });
  gsap.from('.contact h2',{rotateX:-60, y:60, opacity:0, transformPerspective:900, transformOrigin:'50% 100%', ease:'power3.out',
    scrollTrigger:{trigger:'.contact', start:'top 75%', end:'top 35%', scrub:.8}});
} else {
  document.querySelectorAll('.step').forEach(s=>s.classList.add('on'));
}
addEventListener('load', ()=>{ if (hasGsap && typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); });
})();
