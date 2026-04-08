import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";


let ri = {};

export function main() {
  /* -------------- renderer -------------- */
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  ri.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  ri.renderer.setSize(window.innerWidth, window.innerHeight);
  ri.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  ri.renderer.shadowMap.enabled = true;
  ri.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  ri.renderer.outputColorSpace = THREE.SRGBColorSpace;
  ri.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  ri.renderer.toneMappingExposure = 1.05;

  /* scene + env  */
  ri.scene = new THREE.Scene();
  ri.scene.background = new THREE.Color(0xe9eef3);
  const pmrem = new THREE.PMREMGenerator(ri.renderer);
  ri.scene.environment = pmrem.fromScene(new RoomEnvironment(ri.renderer), 0.06).texture;

  /* camera + controls */
  ri.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  ri.camera.position.set(7.5, 5.8, 10);

  ri.controls = new OrbitControls(ri.camera, ri.renderer.domElement);
  ri.controls.target.set(0, 3.2, 0);
  ri.controls.enableDamping = true;

  addLights();
  addGroundAndCeiling();

  /* claw camera (overlay)  */
  const clawCanvas = document.getElementById("clawCanvas");
  ri.camera2Renderer = new THREE.WebGLRenderer({ canvas: clawCanvas, antialias: true, alpha: true });
  ri.camera2Renderer.setSize(240, 170);
  ri.clawCam = new THREE.PerspectiveCamera(70, 240 / 170, 0.03, 60);

  /* robot + pickables  */
  buildRobot();
  ri.pickables = [];
  ri.held = null;
  createPickables();

  /* input + loop */
  ri.keys = [];
  ri.clock = new THREE.Clock();
  window.addEventListener("keydown", e => ri.keys[e.code] = true);
  window.addEventListener("keyup",   e => ri.keys[e.code] = false);
  window.addEventListener("keydown", e => { if (e.code === "Space") toggleGrab(); });
  window.addEventListener("resize", onResize);

  animate();
}

/*helpers*/

function addLights() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.35);
  ri.scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(6, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00025;

  const fill = new THREE.DirectionalLight(0xffffff, 0.38);
  fill.position.set(-8, 7, -6);
  const rim  = new THREE.DirectionalLight(0xffe0c0, 0.25);
  rim.position.set(-2, 9, 10);

  ri.scene.add(key, fill, rim);
  ri.lights = { hemi, key, fill, rim };
}

function addGroundAndCeiling() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0xc6b893, roughness: 0.9, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ri.scene.add(ground);

  const ceilingY = 6.2;
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.35, 16),
    new THREE.MeshStandardMaterial({ color: 0x3b444b, metalness: 0.2, roughness: 0.6 })
  );
  ceiling.position.set(0, ceilingY, 0);
  ceiling.receiveShadow = true;
  ri.scene.add(ceiling);

  ri._ceilingY = ceilingY;
}

/*materials*/
function metal(color) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 1.0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25
  });
}
function dark(color = 0x33363a) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });
}
const mats = {
  rubber: new THREE.MeshStandardMaterial({ color: 0x1b1e22, metalness: 0.2, roughness: 0.85 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xf4b000, metalness: 0.3, roughness: 0.55 }),
};

/* robot build  */

function buildRobot() {
  const redMetal  = metal(0xc23a3a);
  const darkMetal = dark();

  // base under the ceiling (yaw)
  ri.base = new THREE.Object3D();
  ri.base.position.set(0, ri._ceilingY - 0.25, 0);
  ri.scene.add(ri.base);

  const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.28, 28), darkMetal);
  baseDisc.castShadow = baseDisc.receiveShadow = true;
  ri.base.add(baseDisc);

  // shoulder (pitch)
  ri.shoulder = new THREE.Object3D();
  ri.shoulder.position.set(0, -0.4, 0);
  ri.base.add(ri.shoulder);

  const upper = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.9, 0.7, 4, 0.12), redMetal);
  upper.position.y = -0.95;
  upper.castShadow = upper.receiveShadow = true;
  ri.shoulder.add(upper);

  const shoulderCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 28), darkMetal);
  shoulderCap.rotation.x = Math.PI / 2;
  shoulderCap.position.set(0.01, 0.01, 0);
  shoulderCap.castShadow = shoulderCap.receiveShadow = true;
  ri.shoulder.add(shoulderCap);

  // elbow (pitch)
  ri.elbow = new THREE.Object3D();
  ri.elbow.position.set(0, -2.05, 0);
  ri.shoulder.add(ri.elbow);

  const fore = new THREE.Mesh(new RoundedBoxGeometry(0.65, 1.6, 0.65, 3, 0.1), redMetal);
  fore.position.y = -0.8;
  fore.castShadow = fore.receiveShadow = true;
  ri.elbow.add(fore);

  const elbowCap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.22, 20), darkMetal);
  elbowCap.rotation.x = Math.PI / 2;
  elbowCap.position.set(0, 0.05, 0);
  elbowCap.castShadow = elbowCap.receiveShadow = true;
  ri.elbow.add(elbowCap);

  // wrist: lock pitch downward 
  ri.wrist = new THREE.Object3D();
  ri.wrist.rotation.x = Math.PI / 2;
  ri.wrist.position.set(0, -1.6, 0);
  ri.elbow.add(ri.wrist);

  const wristHub = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.22, 22), darkMetal);
  wristHub.rotation.y = Math.PI / 2;
  wristHub.castShadow = wristHub.receiveShadow = true;
  ri.wrist.add(wristHub);

  // telescopic slider 
  ri.slider = new THREE.Object3D();
  ri.wrist.add(ri.slider);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.7, 24), redMetal);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(0, 0, -0.2);
  rail.castShadow = rail.receiveShadow = true;
  ri.slider.add(rail);

  // gripper mounting
  ri.gripperRoot = new THREE.Object3D();
  ri.gripperRoot.position.set(0, 0, 0.5);
  ri.slider.add(ri.gripperRoot);

  // claw faces downward 
  ri.clawBase = new THREE.Object3D();
  ri.clawBase.rotation.x = Math.PI / 2;
  ri.gripperRoot.add(ri.clawBase);

  
  createClaw();

  
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 24), mats.accent);
  ring.rotation.x = Math.PI / 2;
  ri.clawBase.add(ring);

  // claw camera  behind the ring
  ri.clawCam.position.set(0, 0.08, 0.30);
  ri.clawCam.up.set(0, -1, 0);
  ri.gripperRoot.add(ri.clawCam);

  // default pose
  ri.pose = {
    baseYaw: 0,
    shoulder: 0.2,
    elbow: 0.35,
    wrist: 0,        
    sliderZ: 0.35,   
    claw: 0.22       
  };
  applyPose();
}

function createClaw() {
  //  2 segments (base + mid) to “wrap” around objects
  const len1 = 0.30, len2 = 0.24, thk = 0.12;
  const g1 = new THREE.BoxGeometry(len1, thk, thk);
  const g2 = new THREE.BoxGeometry(len2, thk, thk);

  ri.fingers = [];

  // two mirrored fingers
  [ +1, -1 ].forEach(side => {
    const root = new THREE.Object3D();
    ri.clawBase.add(root);

    // base pivot 
    const pBase = new THREE.Object3D();
    pBase.position.set(0.12 * side, 0, 0);
    root.add(pBase);

    const seg1 = new THREE.Mesh(g1, mats.rubber);
    seg1.position.x = (len1 * 0.5) * side;
    seg1.castShadow = seg1.receiveShadow = true;
    pBase.add(seg1);

    // middle pivot 
    const pMid = new THREE.Object3D();
    pMid.position.x = len1 * side;
    pBase.add(pMid);

    const seg2 = new THREE.Mesh(g2, mats.rubber);
    seg2.position.x = (len2 * 0.5) * side;
    seg2.castShadow = seg2.receiveShadow = true;
    pMid.add(seg2);

    ri.fingers.push({ root, pBase, pMid, side });
  });
}

function createPickables() {
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x77ccff, roughness: 0.6 });
  const positions = [
    [ 1.4, 0.15, -1.0 ],
    [ -0.2, 0.15, -1.6 ],
    [ 1.1, 0.15, -0.9 ],
  ];
  positions.forEach((p, i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), boxMat);
    box.position.set(p[0], p[1], p[2]);
    box.castShadow = box.receiveShadow = true;
    box.name = `pickable-${i}`;
    ri.scene.add(box);
    ri.pickables.push(box);
  });
}

/*animate / draw */

function animate() {
  requestAnimationFrame(animate);
  const dt = ri.clock.getDelta();

  handleKeys(dt);
  applyPose();

  ri.controls.update();

  // show “downward” view from claw camera
  ri.clawCam.lookAt(new THREE.Vector3(
    ri.clawCam.position.x,
    ri.clawCam.position.y - 1,
    ri.clawCam.position.z
  ));

  ri.renderer.render(ri.scene, ri.camera);
  ri.camera2Renderer.render(ri.scene, ri.clawCam);
}

/* ================= input ================= */

function handleKeys(dt) {
  const rot = 1.2 * dt, slide = 1.6 * dt, open = 0.9 * dt;

  if (ri.keys["KeyQ"]) ri.pose.baseYaw += rot;
  if (ri.keys["KeyE"]) ri.pose.baseYaw -= rot;

  if (ri.keys["KeyW"]) ri.pose.shoulder = THREE.MathUtils.clamp(ri.pose.shoulder + rot, -0.3, 1.1);
  if (ri.keys["KeyS"]) ri.pose.shoulder = THREE.MathUtils.clamp(ri.pose.shoulder - rot, -0.3, 1.1);

  if (ri.keys["KeyA"]) ri.pose.elbow = THREE.MathUtils.clamp(ri.pose.elbow + rot, -1.2, 1.2);
  if (ri.keys["KeyD"]) ri.pose.elbow = THREE.MathUtils.clamp(ri.pose.elbow - rot, -1.2, 1.2);

  if (ri.keys["KeyR"]) ri.pose.wrist += rot;     
  if (ri.keys["KeyF"]) ri.pose.wrist -= rot;

  if (ri.keys["KeyT"]) ri.pose.sliderZ = Math.min(1.2, ri.pose.sliderZ + slide);
  if (ri.keys["KeyG"]) ri.pose.sliderZ = Math.max(0.0, ri.pose.sliderZ - slide);

  if (ri.keys["KeyZ"]) ri.pose.claw = Math.min(0.95, ri.pose.claw + open);
  if (ri.keys["KeyX"]) ri.pose.claw = Math.max(0.0, ri.pose.claw - open);
}

/* pose application */

function applyPose() {
  const p = ri.pose;
  ri.base.rotation.y     = p.baseYaw;
  ri.shoulder.rotation.z = p.shoulder;
  ri.elbow.rotation.z    = p.elbow;
  ri.wrist.rotation.y    = p.wrist;   
  ri.slider.position.z   = p.sliderZ; 

  // distribute open amount across two joints to arc around objects
  const total = THREE.MathUtils.clamp(p.claw, 0.0, 0.95);
  const aBase = total * 1.6;
  const aMid  = total * 1.1;

  ri.fingers.forEach((f, i) => {
    const dir = (i === 0) ? +1 : -1; 
    f.pBase.rotation.z = dir * aBase;
    f.pMid.rotation.z  = dir * aMid;
  });
}

/*  grab/release  */

function toggleGrab() {
  if (ri.held) return releaseHeld();
  tryGrab();
}
function tryGrab() {
  if (!ri.pickables.length) return;

  // center between the two finger mid joints:
  const wp0 = ri.fingers[0].pMid.getWorldPosition(new THREE.Vector3());
  const wp1 = ri.fingers[1].pMid.getWorldPosition(new THREE.Vector3());
  const center = wp0.clone().add(wp1).multiplyScalar(0.5);

  let best = null, bestD = 1e9;
  for (const obj of ri.pickables) {
    const d = obj.getWorldPosition(new THREE.Vector3()).distanceTo(center);
    if (d < 0.35 && d < bestD) { best = obj; bestD = d; }
  }
  if (best) {
    // attach to claw so it follows the arm
    ri.clawBase.attach(best);
    const local = ri.clawBase.worldToLocal(center.clone());
    best.position.copy(local);
    ri.held = best;
  }
}
function releaseHeld() {
  if (!ri.held) return;
  ri.scene.attach(ri.held);
  ri.held = null;
}

/* resize */

function onResize() {
  ri.camera.aspect = window.innerWidth / window.innerHeight;
  ri.camera.updateProjectionMatrix();
  ri.renderer.setSize(window.innerWidth, window.innerHeight);
}
