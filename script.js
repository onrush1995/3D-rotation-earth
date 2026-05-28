import * as THREE from "./three.module.js";

const canvas = document.getElementById("globe");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 240, 620);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 2200);
camera.position.set(0, 0, 340);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const earthRadius = 120;
const autoSpin = 0.00055;
const friction = 0.94;
const dragSensitivity = 0.0048;
const tiltLimit = Math.PI / 2.35;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let velocityY = 0;
let velocityX = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function hash(value) {
  return fract(Math.sin(value * 91.3458 + 17.13) * 47453.5453);
}

function fibonacciUnit(index, count) {
  const t = index / count;
  const inclination = Math.acos(1 - 2 * t);
  const azimuth = Math.PI * (3 - Math.sqrt(5)) * index;

  return {
    x: Math.sin(inclination) * Math.cos(azimuth),
    y: Math.cos(inclination),
    z: Math.sin(inclination) * Math.sin(azimuth),
  };
}

function createDotTexture() {
  const size = 64;
  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = size;
  dotCanvas.height = size;

  const dotCtx = dotCanvas.getContext("2d");
  const gradient = dotCtx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.58, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  dotCtx.fillStyle = gradient;
  dotCtx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(dotCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildDotLayer({
  radius,
  count,
  jitter,
  size,
  opacity,
  colorA,
  colorB,
  additive = false,
}) {
  const positions = [];
  const colors = [];

  const c1 = new THREE.Color(colorA);
  const c2 = new THREE.Color(colorB);
  const c = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const p = fibonacciUnit(i, count);
    const n = hash(i + count * 0.11);
    const latBias = 1 - Math.abs(p.y);
    const wave = 0.5 + 0.5 * Math.sin((p.x + p.z) * 14 + n * 7);
    const r = radius + (n - 0.5) * jitter + (wave - 0.5) * jitter * 0.6;

    positions.push(p.x * r, p.y * r, p.z * r);

    const mix = clamp(0.24 + latBias * 0.68 + (n - 0.5) * 0.24, 0, 1);
    c.lerpColors(c1, c2, mix);
    colors.push(c.r, c.g, c.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    map: dotTexture,
    transparent: true,
    alphaTest: 0.11,
    vertexColors: true,
    depthWrite: false,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  return new THREE.Points(geometry, material);
}

function buildLatitudeBand({ latDeg, radius, count, size, opacity }) {
  const positions = [];
  const colors = [];

  const lat = (latDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);

  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const x = radius * cosLat * Math.cos(t);
    const y = radius * sinLat;
    const z = radius * cosLat * Math.sin(t);

    positions.push(x, y, z);

    const shimmer = 0.75 + 0.25 * Math.sin(t * 9);
    colors.push(shimmer, shimmer, shimmer);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    map: dotTexture,
    transparent: true,
    alphaTest: 0.11,
    vertexColors: true,
    depthWrite: false,
    opacity,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

const dotTexture = createDotTexture();

const earthGroup = new THREE.Group();
earthGroup.rotation.x = 0.24;
scene.add(earthGroup);

const coreSphere = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 0.985, 72, 72),
  new THREE.MeshPhongMaterial({
    color: 0x090909,
    emissive: 0x0a0a0a,
    shininess: 8,
    transparent: true,
    opacity: 0.9,
  })
);
earthGroup.add(coreSphere);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 1.05, 72, 72),
  new THREE.MeshBasicMaterial({
    color: 0xaac7ff,
    transparent: true,
    opacity: 0.05,
    side: THREE.BackSide,
  })
);
earthGroup.add(atmosphere);

const coreDots = buildDotLayer({
  radius: earthRadius * 0.9,
  count: 2500,
  jitter: 4,
  size: 2.1,
  opacity: 0.2,
  colorA: 0x5f5f5f,
  colorB: 0xe8e8e8,
  additive: true,
});

const mainDots = buildDotLayer({
  radius: earthRadius,
  count: 7600,
  jitter: 3.2,
  size: 2.45,
  opacity: 0.96,
  colorA: 0x9e9e9e,
  colorB: 0xffffff,
});

const haloDots = buildDotLayer({
  radius: earthRadius * 1.08,
  count: 3200,
  jitter: 6.5,
  size: 2.6,
  opacity: 0.34,
  colorA: 0x7a8699,
  colorB: 0xe6ecff,
  additive: true,
});

earthGroup.add(coreDots);
earthGroup.add(mainDots);
earthGroup.add(haloDots);

const bandGroup = new THREE.Group();

const bandA = buildLatitudeBand({
  latDeg: 0,
  radius: earthRadius * 1.11,
  count: 900,
  size: 1.85,
  opacity: 0.24,
});

const bandB = buildLatitudeBand({
  latDeg: 23,
  radius: earthRadius * 1.12,
  count: 760,
  size: 1.7,
  opacity: 0.16,
});

const bandC = buildLatitudeBand({
  latDeg: -28,
  radius: earthRadius * 1.1,
  count: 760,
  size: 1.7,
  opacity: 0.16,
});

bandGroup.add(bandA);
bandGroup.add(bandB);
bandGroup.add(bandC);

bandGroup.rotation.x = 0.4;
bandGroup.rotation.z = -0.27;
earthGroup.add(bandGroup);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
keyLight.position.set(-180, 120, 260);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
rimLight.position.set(160, -120, -180);
scene.add(rimLight);

function onPointerDown(event) {
  isDragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!isDragging) {
    return;
  }

  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;

  lastX = event.clientX;
  lastY = event.clientY;

  earthGroup.rotation.y += dx * dragSensitivity;
  earthGroup.rotation.x = clamp(earthGroup.rotation.x + dy * dragSensitivity, -tiltLimit, tiltLimit);

  velocityY = dx * 0.0005;
  velocityX = dy * 0.0005;
}

function onPointerUp(event) {
  if (!isDragging) {
    return;
  }

  isDragging = false;
  canvas.style.cursor = "grab";

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function animate() {
  requestAnimationFrame(animate);

  const t = performance.now() * 0.001;
  const pulse = 0.55 + 0.45 * Math.sin(t * 1.8);

  haloDots.material.opacity = 0.24 + pulse * 0.14;
  bandA.material.opacity = 0.17 + pulse * 0.06;
  bandB.material.opacity = 0.11 + pulse * 0.05;
  bandC.material.opacity = 0.11 + pulse * 0.05;

  coreDots.rotation.y = -t * 0.08;
  haloDots.rotation.y = t * 0.11;
  haloDots.rotation.x = Math.sin(t * 0.32) * 0.16;

  bandGroup.rotation.y += 0.00085;
  bandGroup.rotation.z = -0.27 + Math.sin(t * 0.45) * 0.08;

  earthGroup.rotation.y += autoSpin + velocityY;
  earthGroup.rotation.x = clamp(earthGroup.rotation.x + velocityX, -tiltLimit, tiltLimit);

  if (!isDragging) {
    velocityY *= friction;
    velocityX *= friction;
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", onResize);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

onResize();
animate();
