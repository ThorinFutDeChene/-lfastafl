/*
 * Original procedural statuettes for Álfastafl.
 *
 * These are small carved characters, not counters with an emblem. Geometry is
 * baked and merged by material once per kind; instances share GPU resources.
 * All measurements are board-square units, Y is up and the face points to +Z.
 * No DOM, texture download, animation, or rule decision belongs in this module.
 */
import * as THREE from 'three';
import { mergeGeometries } from './vendor/three/BufferGeometryUtils.js';

const prototypes = new Map();
const figureNames = { N: 'Nain de bronze', E: 'Elfe de pierre', R: 'Roi elfe de pierre' };
const heights = { N: 1.12, E: 1.34, R: 1.52 };
const up = new THREE.Vector3(0, 1, 0);
// Local, unscaled shoulder/hip/neck anchors in the sculptor's coordinates.
// Gameplay figures remain four merged meshes; only cutscene figures have joints.
const combatPivots = {
  N: {'left-arm':[-.205,.66,0], 'right-arm':[.205,.66,0],
      'left-leg':[-.12,.40,0], 'right-leg':[.12,.40,0], head:[0,.77,0]},
  E: {'left-arm':[-.16,.88,0], 'right-arm':[.16,.88,0],
      'left-leg':[-.08,.40,0], 'right-leg':[.08,.40,0], head:[0,.99,0]},
  R: {'left-arm':[-.18,.96,0], 'right-arm':[.18,.96,0],
      'left-leg':[-.08,.42,0], 'right-leg':[.08,.42,0], head:[0,1.05,0]},
};

function vector(value) {
  return new THREE.Vector3(...value);
}

function palette(kind) {
  const bronze = kind === 'N';
  const colours = bronze
    ? { body: 0x9b7144, recess: 0x4a6255, ornament: 0xc49a58, detail: 0x30291d }
    : kind === 'R'
      ? { body: 0xe3dfcd, recess: 0x8c9b89, ornament: 0xc5a65e, detail: 0x3d4b41 }
      : { body: 0xd8d7c5, recess: 0x8c9b8d, ornament: 0xb6ae82, detail: 0x3d4b41 };
  return Object.fromEntries(Object.entries(colours).map(([name, colour]) => {
    const metalness = bronze ? (name === 'recess' ? 0.48 : 0.68)
      : name === 'ornament' && kind === 'R' ? 0.65 : 0.02;
    const material = new THREE.MeshStandardMaterial({
      name: `${kind}-${name}`,
      color: colour,
      metalness,
      roughness: name === 'ornament' ? 0.57 : bronze ? 0.72 : 0.88,
      vertexColors: true,
    });
    material.userData.sharedFigurineResource = true;
    return [name, { material, geometries: [], parts: Object.create(null) }];
  }));
}

function sculptor(kind, articulated = false) {
  const buckets = palette(kind);
  let currentPart = 'body';
  const part = name => { currentPart = name; };

  function add(bucket, geometry, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    // Non-indexed geometries with the same attributes can be merged even when
    // one shape was extruded and another came from a sphere or cylinder.
    let shape = geometry;
    if (shape.index) {
      shape = geometry.toNonIndexed();
      geometry.dispose();
    }
    for (const attribute of Object.keys(shape.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') shape.deleteAttribute(attribute);
    }
    const orientation = rotation.isQuaternion
      ? rotation : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    shape.applyMatrix4(new THREE.Matrix4().compose(vector(position), orientation, vector(scale)));
    if (!shape.getAttribute('normal')) shape.computeVertexNormals();
    const positions = shape.getAttribute('position');
    const colours = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      // Restrained, deterministic variations make the surface read as carved
      // material without requiring a texture, canvas, or random regeneration.
      const grain = Math.sin(positions.getX(index) * 63.1 + positions.getY(index) * 41.7 +
        positions.getZ(index) * 87.3) * 0.035;
      const shade = 0.97 + grain;
      colours.set([shade, shade, shade], index * 3);
    }
    shape.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const geometries = articulated && currentPart !== 'body'
      ? (buckets[bucket].parts[currentPart] ||= []) : buckets[bucket].geometries;
    geometries.push(shape);
  }

  function ellipsoid(bucket, position, radii, widthSegments = 12, heightSegments = 8) {
    add(bucket, new THREE.SphereGeometry(1, widthSegments, heightSegments), position, radii);
  }

  function cylinder(bucket, position, top, bottom, height, rotation = [0, 0, 0], scale = [1, 1, 1], sides = 12) {
    add(bucket, new THREE.CylinderGeometry(top, bottom, height, sides), position, scale, rotation);
  }

  function box(bucket, position, dimensions, rotation = [0, 0, 0]) {
    add(bucket, new THREE.BoxGeometry(...dimensions), position, [1, 1, 1], rotation);
  }

  function rod(bucket, start, end, lowerRadius, upperRadius = lowerRadius, sides = 8) {
    const a = vector(start);
    const b = vector(end);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
    add(bucket, new THREE.CylinderGeometry(upperRadius, lowerRadius, length, sides),
      a.add(b).multiplyScalar(0.5).toArray(), [1, 1, 1], rotation);
  }

  function relief(bucket, points, depth, position = [0, 0, 0], bevel = 0.008) {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    for (const point of points.slice(1)) shape.lineTo(...point);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: bevel > 0,
      bevelSegments: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 4,
    });
    geometry.translate(0, 0, -depth / 2);
    add(bucket, geometry, position);
  }

  function torus(bucket, position, radius, tube, rotation = [Math.PI / 2, 0, 0], segments = 16) {
    add(bucket, new THREE.TorusGeometry(radius, tube, 5, segments), position, [1, 1, 1], rotation);
  }

  function base(radius, height = 0.072) {
    cylinder('recess', [0, height * 0.32, 0], radius, radius * 0.96, height * 0.64,
      [0, Math.PI / 12, 0], [1, 1, 1], 12);
    cylinder('body', [0, height * 0.78, 0], radius * 0.91, radius, height * 0.38,
      [0, Math.PI / 12, 0], [1, 1, 1], 12);
    torus('ornament', [0, height * 0.63, 0], radius * 0.96, 0.009);
  }

  function eyes(y, z, separation, radius = 0.013) {
    for (const side of [-1, 1]) {
      ellipsoid('detail', [side * separation, y, z], [radius, radius * 0.48, radius * 0.35], 8, 4);
    }
  }

  function pointedEars(y, width = 0.235) {
    for (const side of [-1, 1]) {
      relief('body', [[side * 0.095, y + 0.025], [side * width, y + 0.095],
        [side * 0.145, y - 0.035], [side * 0.10, y - 0.045]], 0.035, [0, 0, -0.005], 0.005);
      rod('recess', [side * 0.13, y + 0.004, 0.016], [side * (width - 0.035), y + 0.059, 0.016], 0.009, 0.003, 5);
    }
  }

  function finish() {
    const group = new THREE.Group();
    group.name = `alfastafl-figurine-${kind}`;
    group.userData = {kind, label: figureNames[kind], sculpted: true,
      articulated, sharedFigurineResource: true};
    const joints = new Map();
    const meshes = [];
    function buildMesh(name, bucket, geometries, parent) {
      if (!geometries.length) return;
      const geometry = mergeGeometries(geometries, false);
      for (const component of geometries) component.dispose();
      if (!geometry) throw new Error(`Impossible de fusionner la figurine ${kind}/${name}.`);
      geometry.userData.sharedFigurineResource = true;
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.name = `${kind}-${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {kind, sharedFigurineResource: true};
      parent.add(mesh);
      meshes.push(mesh);
    }
    for (const [name, bucket] of Object.entries(buckets)) {
      buildMesh(name, bucket, bucket.geometries, group);
      if (articulated) for (const [segment, geometries] of Object.entries(bucket.parts)) {
        if (!joints.has(segment)) {
          const pivot = new THREE.Group();
          pivot.name = 'combat-' + segment;
          group.add(pivot);
          joints.set(segment, pivot);
        }
        buildMesh(name, bucket, geometries, joints.get(segment));
      }
    }
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const vertical = heights[kind] / (bounds.max.y - bounds.min.y);
    const furthest = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x),
      Math.abs(bounds.min.z), Math.abs(bounds.max.z));
    const horizontal = Math.min(1, 0.438 / furthest);
    for (const mesh of meshes) {
      mesh.geometry.translate(0, -bounds.min.y, 0);
      mesh.geometry.scale(horizontal, vertical, horizontal);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
    // Joint pivots are expressed in normalized world coordinates. Move each
    // limb's vertices into its own anchor space: rigid sculptures can now
    // rotate their carved arms, weapons, heads and legs without skinning.
    for (const [segment, joint] of joints) {
      const pivot = combatPivots[kind][segment];
      if (!pivot) throw new Error('Ancrage de combat absent : ' + segment);
      const x = pivot[0] * horizontal;
      const y = (pivot[1] - bounds.min.y) * vertical;
      const z = pivot[2] * horizontal;
      joint.position.set(x, y, z);
      for (const mesh of joint.children) {
        mesh.geometry.translate(-x, -y, -z);
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }
    }
    if (articulated && kind === 'E') {
      // The bow (and its string) are carved into the left-arm mesh.
      // This invisible transform is EXACTLY at the middle of that string in
      // the same sculptor coordinates. It inherits every bow-arm rotation.
      // Never approximate the origin from the figurine's chest or head.
      const arm = joints.get('left-arm');
      const nock = new THREE.Object3D();
      nock.name = 'combat-bow-nock';
      nock.position.set(-0.318 * horizontal - arm.position.x,
        (0.813 - bounds.min.y) * vertical - arm.position.y,
        0.12 * horizontal - arm.position.z);
      arm.add(nock);
    }
    group.updateMatrixWorld(true);
    const finalBounds = new THREE.Box3().setFromObject(group);
    const size = finalBounds.getSize(new THREE.Vector3());
    group.userData.dimensions = {width: size.x, height: size.y, depth: size.z};
    group.userData.triangles = meshes.reduce((sum, mesh) =>
      sum + mesh.geometry.getAttribute('position').count / 3, 0);
    return group;
  }

  return { add, ellipsoid, cylinder, box, rod, relief, torus, base, eyes, pointedEars, finish, part };
}

function dwarf(articulated = false) {
  const b = sculptor('N', articulated);
  b.base(0.342);

  // Broad boots, separated legs and a short, armoured torso establish the
  // dwarf silhouette even at the normal board-camera distance.
  for (const side of [-1, 1]) {
    b.part(side < 0 ? 'left-leg' : 'right-leg');
    b.box('recess', [side * 0.115, 0.145, 0.050], [0.15, 0.13, 0.23]);
    b.ellipsoid('body', [side * 0.115, 0.135, 0.13], [0.078, 0.055, 0.09]);
    b.rod('body', [side * 0.11, 0.18, -0.015], [side * 0.12, 0.40, -0.01], 0.065, 0.085);
    b.box('ornament', [side * 0.115, 0.245, 0.056], [0.105, 0.12, 0.035]);
  }
  b.part('body');
  b.cylinder('body', [0, 0.505, 0], 0.205, 0.215, 0.35, [0, 0, 0], [1, 1, 0.71]);
  b.relief('recess', [[-0.19, 0.66], [0.19, 0.66], [0.245, 0.32], [0.12, 0.285],
    [-0.23, 0.31]], 0.065, [0, 0, -0.105]);
  b.cylinder('recess', [0, 0.402, 0], 0.225, 0.225, 0.065, [0, 0, 0], [1, 1, 0.72]);
  b.box('ornament', [0, 0.403, 0.17], [0.103, 0.061, 0.023]);
  b.box('detail', [0, 0.403, 0.184], [0.046, 0.031, 0.006]);
  for (const side of [-1, 1]) {
    b.ellipsoid('recess', [side * 0.205, 0.65, -0.005], [0.111, 0.095, 0.10]);
    b.ellipsoid('ornament', [side * 0.215, 0.67, 0.025], [0.099, 0.047, 0.092]);
  }
  b.part('left-arm');
  b.rod('body', [-0.23, 0.62, 0.015], [-0.29, 0.475, 0.07], 0.073, 0.067);
  b.rod('ornament', [-0.29, 0.475, 0.07], [-0.285, 0.415, 0.12], 0.069, 0.058);
  b.ellipsoid('body', [-0.285, 0.415, 0.135], [0.057, 0.062, 0.048]);
  b.part('right-arm');
  b.rod('body', [0.23, 0.63, 0], [0.30, 0.53, 0.04], 0.073, 0.062);
  b.rod('ornament', [0.30, 0.53, 0.04], [0.305, 0.685, 0.11], 0.061, 0.05);
  b.ellipsoid('body', [0.305, 0.69, 0.115], [0.05, 0.058, 0.047]);

  b.part('left-arm');
  // Round shield with a raised rim, boss and carved central reinforcement.
  b.cylinder('recess', [-0.285, 0.455, 0.165], 0.147, 0.147, 0.043, [Math.PI / 2, 0, 0], [1, 1, 1], 12);
  b.torus('ornament', [-0.285, 0.455, 0.192], 0.137, 0.014, [0, 0, 0]);
  b.box('body', [-0.285, 0.455, 0.195], [0.026, 0.23, 0.014]);
  b.ellipsoid('ornament', [-0.285, 0.455, 0.207], [0.046, 0.046, 0.027]);

  b.part('right-arm');
  // A compact, visibly asymmetric axe: the blade stays within its own square.
  b.rod('recess', [0.305, 0.345, 0.11], [0.305, 1.035, 0.11], 0.018, 0.018);
  b.relief('body', [[-0.028, 0.075], [0.045, 0.095], [0.13, 0.11], [0.135, 0.008],
    [0.105, -0.086], [0.045, -0.06], [-0.025, -0.05]], 0.042, [0.295, 0.92, 0.11]);
  b.relief('ornament', [[0.108, 0.102], [0.132, 0.108], [0.138, 0.008],
    [0.107, -0.084], [0.089, -0.069], [0.109, 0.008]], 0.046, [0.295, 0.92, 0.11], 0.003);
  b.torus('ornament', [0.305, 0.65, 0.11], 0.022, 0.007);

  b.part('head');
  b.cylinder('body', [0, 0.727, 0.005], 0.09, 0.09, 0.11);
  b.ellipsoid('body', [0, 0.858, 0.018], [0.149, 0.163, 0.125]);
  // The scalloped beard is a carved volume, with three raised braids.
  b.relief('ornament', [[-0.139, 0.235], [-0.146, 0.137], [-0.115, 0.055],
    [-0.076, 0.014], [-0.043, 0.029], [0, -0.018], [0.044, 0.029],
    [0.079, 0.014], [0.118, 0.055], [0.146, 0.137], [0.139, 0.235],
    [0.071, 0.249], [0, 0.218], [-0.071, 0.249]], 0.071, [0, 0.57, 0.155], 0.009);
  for (const side of [-1, 0, 1]) {
    const x = side * 0.065;
    b.rod('body', [x, 0.778, 0.202], [x * 0.68, 0.602 + Math.abs(side) * 0.025, 0.206], 0.025, 0.012, 6);
    b.torus('recess', [x * 0.70, 0.63 + Math.abs(side) * 0.018, 0.206], 0.019, 0.006);
  }
  b.ellipsoid('ornament', [-0.052, 0.817, 0.162], [0.071, 0.024, 0.034]);
  b.ellipsoid('ornament', [0.052, 0.817, 0.162], [0.071, 0.024, 0.034]);
  b.ellipsoid('body', [0, 0.844, 0.155], [0.027, 0.042, 0.036]);
  b.eyes(0.873, 0.133, 0.057, 0.016);

  // A low metal helm and crest, rather than a generic ball-shaped head.
  b.add('body', new THREE.SphereGeometry(0.177, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.89, 0.006]);
  b.cylinder('ornament', [0, 0.89, 0.006], 0.179, 0.179, 0.043);
  b.box('ornament', [0, 0.879, 0.167], [0.033, 0.125, 0.023]);
  b.add('ornament', new THREE.ConeGeometry(0.049, 0.071, 6), [0, 1.088, 0.006]);
  return b.finish();
}

function elf(articulated = false) {
  const b = sculptor('E', articulated);
  b.base(0.29);
  for (const side of [-1, 1]) {
    b.part(side < 0 ? 'left-leg' : 'right-leg');
    b.ellipsoid('body', [side * 0.079, 0.117, 0.047], [0.065, 0.048, 0.115]);
    b.rod('body', [side * 0.079, 0.14, 0], [side * 0.071, 0.48, -0.015], 0.039, 0.052);
  }
  b.part('body');
  // Long stone-carved tunic and cape give a very different outline to the dwarf.
  b.cylinder('body', [0, 0.447, 0], 0.126, 0.19, 0.38, [0, Math.PI / 8, 0], [1, 1, 0.71], 8);
  b.relief('recess', [[-0.145, 0.91], [0.145, 0.91], [0.23, 0.24],
    [0.13, 0.16], [-0.20, 0.20], [-0.22, 0.30]], 0.055, [0, 0, -0.105], 0.012);
  b.rod('body', [-0.13, 0.82, -0.147], [-0.15, 0.24, -0.147], 0.012, 0.022, 5);
  b.rod('body', [0.12, 0.82, -0.147], [0.16, 0.24, -0.147], 0.012, 0.022, 5);
  b.cylinder('body', [0, 0.775, 0], 0.159, 0.119, 0.275, [0, Math.PI / 8, 0], [1, 1, 0.66], 8);
  b.cylinder('ornament', [0, 0.647, 0], 0.134, 0.134, 0.038, [0, 0, 0], [1, 1, 0.77]);
  b.relief('ornament', [[0, 0.064], [0.028, 0.021], [0.018, -0.037],
    [0, -0.057], [-0.018, -0.037], [-0.028, 0.021]], 0.015, [0, 0.81, 0.112], 0.003);
  b.rod('recess', [-0.092, 0.59, 0.092], [-0.14, 0.29, 0.10], 0.007, 0.011, 5);
  b.rod('recess', [0.092, 0.59, 0.092], [0.14, 0.29, 0.10], 0.007, 0.011, 5);

  for (const side of [-1, 1]) {
    b.ellipsoid('body', [side * 0.159, 0.879, 0], [0.065, 0.071, 0.065]);
    b.ellipsoid('ornament', [side * 0.16, 0.90, 0], [0.074, 0.024, 0.068]);
  }
  b.part('left-arm');
  b.rod('body', [-0.175, 0.86, 0], [-0.254, 0.735, 0.045], 0.042, 0.037);
  b.rod('body', [-0.254, 0.735, 0.045], [-0.325, 0.775, 0.125], 0.037, 0.028);
  b.ellipsoid('body', [-0.325, 0.775, 0.125], [0.035, 0.043, 0.031]);
  b.part('right-arm');
  b.rod('body', [0.17, 0.865, 0], [0.237, 0.72, 0.033], 0.042, 0.035);
  b.rod('body', [0.237, 0.72, 0.033], [0.11, 0.77, 0.149], 0.035, 0.025);
  b.ellipsoid('body', [0.11, 0.77, 0.149], [0.036, 0.031, 0.027]);

  b.part('left-arm');
  // Existing stone-carved bow and bowstring, held by the left hand.
  // In cutscenes a separate animated arrow nocks at the REAL bowstring;
  // keeping this static cross-chest arrow would leave a ghost after release.
  const bow = new THREE.QuadraticBezierCurve3(vector([-0.318, 0.43, 0.12]),
    vector([-0.53, 0.82, 0.12]), vector([-0.318, 1.195, 0.12]));
  b.add('ornament', new THREE.TubeGeometry(bow, 16, 0.018, 6, false));
  b.rod('recess', [-0.318, 0.43, 0.12], [-0.318, 1.195, 0.12], 0.0055, 0.0055, 5);
  b.part('right-arm');
  if (!articulated) {
    b.rod('ornament', [-0.34, 0.777, 0.147], [0.228, 0.76, 0.147], 0.008, 0.008, 5);
    b.relief('body', [[0.017, 0], [-0.017, 0.018], [-0.009, 0], [-0.017, -0.018]],
      0.012, [0.24, 0.76, 0.147], 0.002);
  }
  b.part('body');
  b.cylinder('recess', [0.12, 0.73, -0.13], 0.058, 0.045, 0.34, [0, 0, -0.19]);
  for (let index = 0; index < 3; index++) {
    const x = 0.115 + index * 0.026;
    b.rod('ornament', [x, 0.80, -0.145], [x + 0.025, 1.05 + index * 0.015, -0.145], 0.006, 0.006, 5);
  }

  b.part('head');
  b.cylinder('body', [0, 0.962, 0], 0.048, 0.054, 0.105);
  b.ellipsoid('body', [0, 1.078, 0.015], [0.103, 0.128, 0.089]);
  b.pointedEars(1.075);
  b.add('recess', new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    [0, 1.087, -0.009], [1, 1.05, 0.94]);
  for (const side of [-1, 1]) {
    b.ellipsoid('recess', [side * 0.082, 1.03, -0.037], [0.044, 0.11, 0.061]);
  }
  b.relief('ornament', [[-0.086, -0.006], [-0.045, 0.006], [0, 0.055],
    [0.045, 0.006], [0.086, -0.006], [0.04, -0.018], [0, 0.022], [-0.04, -0.018]],
    0.012, [0, 1.128, 0.083], 0.003);
  b.eyes(1.09, 0.094, 0.037, 0.0105);
  b.ellipsoid('body', [0, 1.066, 0.104], [0.013, 0.029, 0.019], 8, 6);
  b.rod('recess', [-0.023, 1.024, 0.088], [0.023, 1.024, 0.088], 0.004, 0.004, 5);
  return b.finish();
}

function king(articulated = false) {
  const b = sculptor('R', articulated);
  b.base(0.329, 0.087);
  for (const side of [-1, 1]) {
    b.part(side < 0 ? 'left-leg' : 'right-leg');
    b.ellipsoid('body', [side * 0.084, 0.14, 0.055], [0.074, 0.051, 0.123]);
  }
  b.part('body');
  b.cylinder('body', [0, 0.455, 0], 0.143, 0.224, 0.57,
    [0, Math.PI / 10, 0], [1, 1, 0.73], 10);
  b.relief('recess', [[-0.195, 0.99], [0.195, 0.99], [0.295, 0.24],
    [0.245, 0.14], [0.075, 0.11], [-0.25, 0.15], [-0.30, 0.25]],
    0.068, [0, 0, -0.135], 0.014);
  for (const side of [-1, 0, 1]) {
    b.rod('body', [side * 0.126, 0.88, -0.184], [side * 0.21, 0.19, -0.184],
      0.012, 0.025, 6);
    b.rod('ornament', [side * 0.075, 0.65, 0.117], [side * 0.13, 0.20, 0.151],
      0.006, 0.011, 5);
  }
  b.cylinder('body', [0, 0.855, 0], 0.185, 0.139, 0.28,
    [0, Math.PI / 10, 0], [1, 1, 0.66], 10);
  b.cylinder('ornament', [0, 0.726, 0], 0.15, 0.15, 0.042, [0, 0, 0], [1, 1, 0.76]);
  b.relief('ornament', [[0, 0.083], [0.039, 0.015], [0.016, -0.07],
    [0, -0.087], [-0.016, -0.07], [-0.039, 0.015]], 0.019, [0, 0.895, 0.124], 0.004);
  b.ellipsoid('detail', [0, 0.908, 0.141], [0.014, 0.024, 0.008], 8, 6);
  for (const side of [-1, 1]) {
    b.ellipsoid('body', [side * 0.184, 0.963, 0], [0.075, 0.078, 0.068]);
    b.ellipsoid('ornament', [side * 0.181, 0.986, 0], [0.083, 0.027, 0.075]);
  }
  b.part('left-arm');
  b.rod('body', [-0.19, 0.94, 0], [-0.25, 0.81, 0.03], 0.052, 0.044);
  b.rod('body', [-0.25, 0.81, 0.03], [-0.24, 0.925, 0.135], 0.044, 0.032);
  b.ellipsoid('body', [-0.24, 0.925, 0.135], [0.043, 0.04, 0.033]);
  b.part('right-arm');
  b.rod('body', [0.192, 0.94, 0], [0.263, 0.82, 0.028], 0.052, 0.041);
  b.rod('body', [0.263, 0.82, 0.028], [0.31, 0.91, 0.122], 0.041, 0.03);
  b.ellipsoid('body', [0.31, 0.91, 0.122], [0.039, 0.042, 0.035]);

  b.part('left-arm');
  // Ceremonial sword at rest and sceptre: the king is identifiable from his
  // silhouette and regalia, without needing a printed letter or larger pebble.
  b.relief('body', [[0, 0], [-0.027, 0.071], [-0.029, 0.635], [0.029, 0.635],
    [0.027, 0.071]], 0.026, [-0.245, 0.188, 0.155], 0.005);
  b.rod('ornament', [-0.245, 0.23, 0.174], [-0.245, 0.807, 0.174], 0.004, 0.005, 5);
  b.box('ornament', [-0.245, 0.833, 0.155], [0.156, 0.026, 0.046]);
  b.rod('recess', [-0.245, 0.846, 0.155], [-0.245, 0.966, 0.155], 0.018, 0.018);
  b.ellipsoid('ornament', [-0.245, 0.98, 0.155], [0.029, 0.03, 0.026], 8, 6);
  b.part('right-arm');
  b.rod('ornament', [0.31, 0.455, 0.122], [0.31, 1.225, 0.122], 0.017, 0.017);
  b.add('ornament', new THREE.OctahedronGeometry(0.067, 0), [0.31, 1.255, 0.122], [0.82, 1.14, 0.82]);
  b.ellipsoid('detail', [0.31, 1.255, 0.171], [0.017, 0.025, 0.008], 8, 6);

  b.part('head');
  b.cylinder('body', [0, 1.036, 0], 0.06, 0.064, 0.10);
  b.ellipsoid('body', [0, 1.16, 0.015], [0.116, 0.139, 0.098]);
  b.pointedEars(1.158, 0.248);
  b.add('recess', new THREE.SphereGeometry(0.127, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    [0, 1.175, -0.011], [1, 0.91, 0.95]);
  for (const side of [-1, 1]) {
    b.ellipsoid('recess', [side * 0.095, 1.104, -0.04], [0.045, 0.136, 0.061]);
    b.rod('body', [side * 0.11, 1.19, -0.024], [side * 0.113, 0.998, -0.005], 0.011, 0.016, 5);
  }
  b.eyes(1.176, 0.102, 0.041, 0.011);
  b.ellipsoid('body', [0, 1.15, 0.116], [0.016, 0.031, 0.020], 8, 6);
  b.rod('recess', [-0.026, 1.106, 0.096], [0.026, 1.106, 0.096], 0.0045, 0.0045, 5);

  b.cylinder('ornament', [0, 1.285, -0.006], 0.143, 0.137, 0.064, [0, Math.PI / 8, 0], [1, 1, 1], 16);
  b.torus('ornament', [0, 1.257, -0.006], 0.139, 0.012);
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const x = Math.sin(angle) * 0.126;
    const z = Math.cos(angle) * 0.126 - 0.006;
    const peak = index % 2 === 0 ? 0.145 : 0.104;
    b.add('ornament', new THREE.ConeGeometry(0.029, peak, 4), [x, 1.312 + peak / 2, z],
      [1, 1, 0.64], [0, angle, 0]);
    if (index % 2 === 0) {
      b.ellipsoid('detail', [Math.sin(angle) * 0.145, 1.285, Math.cos(angle) * 0.145 - 0.006],
        [0.013, 0.019, 0.013], 8, 4);
    }
  }
  return b.finish();
}

function prototype(kind, articulated = false) {
  if (!Object.prototype.hasOwnProperty.call(figureNames, kind)) {
    throw new RangeError('Type de figurine inconnu : ' + String(kind));
  }
  const key = kind + (articulated ? ':combat' : ':board');
  if (!prototypes.has(key)) prototypes.set(key, kind === 'N'
    ? dwarf(articulated) : kind === 'E' ? elf(articulated) : king(articulated));
  return prototypes.get(key);
}

/** Return an independent transform hierarchy sharing its immutable geometry. */
export function createFigurine(kind, {articulated = false} = {}) {
  return prototype(kind, articulated).clone(true);
}

/** Small read-only summary useful to check scale and rendering budgets. */
export function getFigurineStats() {
  return Object.fromEntries(Object.keys(figureNames).map(kind => {
    const model = prototype(kind);
    return [kind, {
      label: figureNames[kind],
      ...model.userData.dimensions,
      triangles: model.userData.triangles,
      meshes: model.children.length,
      materials: model.children.map(mesh => mesh.material.name),
    }];
  }));
}
