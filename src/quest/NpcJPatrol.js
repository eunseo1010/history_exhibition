/**
 * NPC J: slow, constant-speed patrol around Tapgol Park's central pavilion.
 * Only this NPC is moved; the map geometry, other NPCs and quest state stay intact.
 * World coordinates follow the centered team-map scene.
 */
export const NPC_J_SETTINGS = Object.freeze({
  speed: 0.65,                 // world units / second (slow walk)
  sightDistance: 4.0,         // horizontal world units
  fieldOfViewDegrees: 80,     // 40 degrees on either side of facing direction
  detectionSeconds: 0.25,     // short confirmation avoids one-frame false positives
  safeStartSeconds: 1.5,      // no instant failure at scene entry/retry
  waypointCount: 16,
});

export function isInNpcJView(npcPosition, facingDirection, playerPosition, range = NPC_J_SETTINGS.sightDistance,
  angleDegrees = NPC_J_SETTINGS.fieldOfViewDegrees) {
  const dx = playerPosition.x - npcPosition.x;
  const dz = playerPosition.z - npcPosition.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance > range) return false;
  if (distance < 0.0001) return true;
  const facingLength = Math.hypot(facingDirection.x, facingDirection.z);
  if (facingLength < 0.0001) return false;
  const cosine = (dx * facingDirection.x + dz * facingDirection.z) / (distance * facingLength);
  return cosine >= Math.cos((angleDegrees * Math.PI) / 360);
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Returns an NPC J controller. `groundAt(x,z)` is the existing team-map raycast. */
export function installNpcJPatrol({ THREE, npcJ, player, modelRoot, groundAt, otherNpcs = {},
  isPaused = () => false, onCaught = () => {}, onWarning = () => {} }) {
  if (!npcJ || !player) throw new Error('NPC J와 플레이어 객체가 필요합니다.');
  const settings = NPC_J_SETTINGS;
  const originalPosition = npcJ.position.clone();
  const originalRotation = npcJ.rotation.y;
  const pavilion = modelRoot.getObjectByName('Pavilion');
  const pavilionBox = pavilion ? new THREE.Box3().setFromObject(pavilion) : null;
  const center = pavilionBox
    ? pavilionBox.getCenter(new THREE.Vector3())
    : new THREE.Vector3(0, 0, 0);
  const pavilionSize = pavilionBox ? pavilionBox.getSize(new THREE.Vector3()) : new THREE.Vector3();
  const preferredRadius = THREE.MathUtils.clamp(
    Math.max(pavilionSize.x, pavilionSize.z) * 0.55 + 1.5, 5.5, 7.8,
  );
  const starting = npcJ.getWorldPosition(new THREE.Vector3());

  function ring(radius) {
    const path = [];
    for (let i = 0; i < settings.waypointCount; i++) {
      const angle = (i * Math.PI * 2) / settings.waypointCount;
      const x = center.x + Math.cos(angle) * radius;
      const z = center.z + Math.sin(angle) * radius;
      const y = groundAt(x, z);
      if (y === null || !Number.isFinite(y)) return null;
      path.push({ x, y, z });
    }
    // Avoid steps/cliffs that may happen when a ray hits a different level.
    if (path.some((point, index) => Math.abs(point.y - path[(index + 1) % path.length].y) > 0.9)) return null;
    return path;
  }

  const radii = [preferredRadius, preferredRadius + 0.65, preferredRadius + 1.2,
    preferredRadius - 0.65, preferredRadius + 1.8];
  let path = radii.map(ring).find(Boolean);
  if (!path) {
    // If a circular paved route is not walkable in this map version,
    // use a small safe loop around the original central-right NPC J placement.
    const candidates = [[-1.2, 0], [0, -1.2], [1.2, 0], [0, 1.2]];
    const fallback = candidates.map(([dx, dz]) => {
      const x = starting.x + dx;
      const z = starting.z + dz;
      const y = groundAt(x, z);
      return y === null ? null : { x, y, z };
    });
    path = fallback.every(Boolean) ? fallback : [];
  }

  if (path.length < 3) {
    console.warn('NPC J의 안전한 순찰 경로를 찾지 못했습니다. 이 맵의 지면/정자 위치를 확인해 주세요.');
  }
  let index = 0;
  if (path.length) {
    index = path.reduce((best, point, i) => distance2D(point, starting) < distance2D(path[best], starting) ? i : best, 0);
  }
  const initialIndex = index;
  let forward = { x: -1, z: 0 };
  let warning = false;
  let visibleDuration = 0;
  let safeStart = settings.safeStartSeconds;
  const blockers = ['Pavilion', 'House'].map((name) => modelRoot.getObjectByName(name)).filter(Boolean);
  const visibilityRay = new THREE.Raycaster();
  const jHeight = new THREE.Box3().setFromObject(npcJ).getSize(new THREE.Vector3()).y;
  const jEyeHeight = THREE.MathUtils.clamp(jHeight * 0.7, 0.55, 1.8);
  const jEye = new THREE.Vector3();
  const playerEye = new THREE.Vector3();
  const castVector = new THREE.Vector3();
  const playerEyeHeight = 1.0;
  const sectorSegments = 48;
  const viewHeightOffset = 0.035;
  const halfViewAngle = (settings.fieldOfViewDegrees * Math.PI) / 360;
  const sectorPositions = [0, 0, 0];

  for (let i = 0; i <= sectorSegments; i++) {
    const angle = -halfViewAngle + (i / sectorSegments) * halfViewAngle * 2;
    sectorPositions.push(
      Math.sin(angle) * settings.sightDistance,
      0,
      Math.cos(angle) * settings.sightDistance,
    );
  }

  const sectorIndices = [];
  for (let i = 1; i <= sectorSegments; i++) {
    sectorIndices.push(0, i, i + 1);
  }

  const sectorGeometry = new THREE.BufferGeometry();
  sectorGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(sectorPositions, 3),
  );
  sectorGeometry.setIndex(sectorIndices);
  sectorGeometry.computeVertexNormals();

  const viewSector = new THREE.Mesh(
    sectorGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xff3030,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }),
  );
  viewSector.name = 'NPC_J_VisionSector';
  viewSector.renderOrder = 20;

  const borderPositions = [];
  for (let i = 0; i <= sectorSegments; i++) {
    const angle = -halfViewAngle + (i / sectorSegments) * halfViewAngle * 2;
    borderPositions.push(
      Math.sin(angle) * settings.sightDistance,
      0,
      Math.cos(angle) * settings.sightDistance,
    );
  }
  borderPositions.push(
    0, 0, 0,
    Math.sin(-halfViewAngle) * settings.sightDistance, 0,
    Math.cos(-halfViewAngle) * settings.sightDistance,
    0, 0, 0,
    Math.sin(halfViewAngle) * settings.sightDistance, 0,
    Math.cos(halfViewAngle) * settings.sightDistance,
  );

  const borderGeometry = new THREE.BufferGeometry();
  borderGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(borderPositions, 3),
  );
  const viewBorder = new THREE.LineSegments(
    borderGeometry,
    new THREE.LineBasicMaterial({
      color: 0xff3030,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: true,
    }),
  );
  viewBorder.name = 'NPC_J_VisionBorder';
  viewBorder.renderOrder = 21;

  const viewParent = npcJ.parent;
  if (viewParent) {
    viewParent.add(viewSector);
    viewParent.add(viewBorder);
  }

  function syncViewSector() {
    const groundY = groundAt(npcJ.position.x, npcJ.position.z);
    const y = Number.isFinite(groundY) ? groundY + viewHeightOffset : npcJ.position.y + viewHeightOffset;
    viewSector.position.set(npcJ.position.x, y, npcJ.position.z);
    viewBorder.position.set(npcJ.position.x, y + 0.006, npcJ.position.z);
    viewSector.rotation.y = npcJ.rotation.y;
    viewBorder.rotation.y = npcJ.rotation.y;
  }

  function teleportToRoute() {
    if (path.length) {
      const point = path[index];
      npcJ.position.set(point.x, point.y, point.z);
      const next = path[(index + 1) % path.length];
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001) {
        forward = { x: dx / d, z: dz / d };
        npcJ.rotation.y = Math.atan2(forward.x, forward.z);
      }
      index = (index + 1) % path.length;
    }
    npcJ.updateMatrixWorld(true);
    syncViewSector();
  }
  teleportToRoute();

  function setWarning(value) {
    if (warning !== value) {
      warning = value;
      onWarning(value);
    }
  }

  function viewIsBlocked() {
    if (!blockers.length) return false;
    jEye.copy(npcJ.position).add(new THREE.Vector3(0, jEyeHeight, 0));
    playerEye.copy(player.position).add(new THREE.Vector3(0, playerEyeHeight, 0));
    castVector.subVectors(playerEye, jEye);
    const d = castVector.length();
    if (d < 0.2) return false;
    visibilityRay.set(jEye, castVector.multiplyScalar(1 / d));
    visibilityRay.near = 0.08;
    visibilityRay.far = d - 0.15;
    return visibilityRay.intersectObjects(blockers, true).length > 0;
  }

  function update(delta, detectionEnabled = true) {
    if (isPaused()) { setWarning(false); visibleDuration = 0; return false; }
    const dt = THREE.MathUtils.clamp(delta, 0, 0.06);
    safeStart = Math.max(0, safeStart - dt);
    let changed = false;
    if (path.length >= 3 && dt > 0) {
      let remaining = settings.speed * dt;
      // Consumes exactly speed*dt distance; doesn't stop at corners.
      for (let steps = 0; remaining > 0.00001 && steps < 5; steps++) {
        const goal = path[index];
        const dx = goal.x - npcJ.position.x;
        const dz = goal.z - npcJ.position.z;
        const d = Math.hypot(dx, dz);
        if (d <= 0.0001) { index = (index + 1) % path.length; continue; }
        const move = Math.min(remaining, d);
        const nx = npcJ.position.x + (dx / d) * move;
        const nz = npcJ.position.z + (dz / d) * move;
        const ny = groundAt(nx, nz);
        if (ny === null) { // Don't walk off a valid ground mesh.
          index = (index + 1) % path.length;
          break;
        }
        npcJ.position.set(nx, ny, nz);
        npcJ.rotation.y = Math.atan2(dx, dz);
        forward = { x: dx / d, z: dz / d };
        remaining -= move;
        changed = true;
        if (move >= d - 0.00001) index = (index + 1) % path.length;
      }
      npcJ.updateMatrixWorld(true);
    }
    syncViewSector();
    const withinCone = detectionEnabled && safeStart <= 0 &&
      isInNpcJView(npcJ.position, forward, player.position, settings.sightDistance,
        settings.fieldOfViewDegrees);
    const seen = withinCone && !viewIsBlocked();
    setWarning(seen);
    visibleDuration = seen ? visibleDuration + dt : 0;
    if (visibleDuration >= settings.detectionSeconds) {
      visibleDuration = 0;
      setWarning(false);
      onCaught();
    }
    return changed;
  }

  function reset() {
    index = initialIndex;
    safeStart = settings.safeStartSeconds;
    visibleDuration = 0;
    setWarning(false);
    teleportToRoute();
  }
  function canPlayerMoveTo(x, z) {
    return Math.hypot(x - npcJ.position.x, z - npcJ.position.z) >= 0.62;
  }
  function dispose() {
    setWarning(false);
    npcJ.position.copy(originalPosition);
    npcJ.rotation.y = originalRotation;
    npcJ.updateMatrixWorld(true);
    viewSector.removeFromParent();
    viewBorder.removeFromParent();
    sectorGeometry.dispose();
    viewSector.material.dispose();
    borderGeometry.dispose();
    viewBorder.material.dispose();
  }

  return { update, reset, canPlayerMoveTo, dispose, hasRoute: path.length >= 3, settings };
}
