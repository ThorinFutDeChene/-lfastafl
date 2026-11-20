/* Álfastafl's local WebGL board. Rules and move authority remain on the server. */
import * as THREE from 'three';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {createFigurine} from './figurines3d.js';
import {CaptureCinematic} from './cinematic3d.js';
import {KingEscapeCinematic} from './king-escape3d.js';
import {KingSiegeCinematic} from './king-siege3d.js';
import {MoveAnimation} from './move3d.js';

const SIZE = 11;
const SURFACE = 0.12;
const GOLD = 0xf0ca6e;
const RED = 0xc75d46;
const validSquare = p => Array.isArray(p) && p.length === 2 &&
  p.every(v => Number.isInteger(v) && v >= 0 && v < SIZE);
const sameSquare = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const listHas = (list, position) => (list || []).some(p => sameSquare(p, position));
const emptyBoard = () => Array.from({length: SIZE}, () => Array(SIZE).fill('.'));

/**
 * One independent, disposable view of a server-owned board.
 * projectSquare() returns absolute CSS client coordinates, not canvas pixels.
 */
export class Board3D {
  constructor(container, callbacks = {}) {
    if (!(container instanceof HTMLElement)) throw new TypeError('Conteneur 3D absent.');
    this.container = container;
    this.callbacks = callbacks;
    this.active = true;
    this.disposed = false;
    this.lost = false;
    this.quality = 'standard';
    this.renderCount = 0;
    this.frame = null;
    this.width = 0;
    this.height = 0;
    this._view = {board: emptyBoard(), mode: 'fetlar', selected: null,
      legal: [], captures: [], targets: [], focus: [], interactive: false, disabled: false};
    this._boardKey = '';
    this._markerKey = '';
    this._mode = '';
    this._ownedGeometries = new Set();
    this._ownedMaterials = new Set();
    this._ownedTextures = new Set();
    this._listeners = [];
    this._pointerPositions = new Map();
    this._gesture = null;
    this._dragTarget = null;
    this._piecePools = {N: [], E: [], R: []};
    this._visiblePieces = [];
    this._pieceCounts = {N: 0, E: 0, R: 0};
    this.captureCinematic = new CaptureCinematic(this);
    this.escapeCinematic = new KingEscapeCinematic(this);
    this.siegeCinematic = new KingSiegeCinematic(this);
    this.moveAnimation = new MoveAnimation(this);
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE);
    this._planePoint = new THREE.Vector3();
    this._dummy = new THREE.Object3D();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14211b);
    this.scene.fog = new THREE.Fog(0x14211b, 35, 75);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90);

    try {
      this.renderer = new THREE.WebGLRenderer({antialias: true,
        alpha: false, powerPreference: 'default', preserveDrawingBuffer: false});
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.18;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'alfastafl-webgl-canvas';
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', 'Plateau 3D. Flèches : orienter ; plus et moins : zoom ; ' +
        'Origine : recentrer ; T : vue du dessus. La vue 2D permet de jouer au clavier.');
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.touchAction = 'none';
      this.canvas.style.borderRadius = 'inherit';
      this.canvas.dataset.renderer = 'webgl2';
      this.container.append(this.canvas);
      this.container.board3d = this;

      // Capture-phase gesture decisions run before OrbitControls' handlers.
      this._listen(this.canvas, 'pointerdown', event => this._pointerDown(event), true);
      this._listen(this.canvas.ownerDocument, 'pointermove', event => this._pointerMove(event), true);
      this._listen(this.canvas.ownerDocument, 'pointerup', event => this._pointerUp(event), true);
      this._listen(this.canvas.ownerDocument, 'pointercancel', event => this._pointerCancel(event), true);
      this._listen(this.canvas, 'lostpointercapture', event => this._lostCapture(event), true);
      this._listen(this.canvas, 'keydown', event => this._keyDown(event));
      this._listen(this.canvas, 'contextmenu', event => event.preventDefault());
      this._listen(this.canvas, 'webglcontextlost', event => {
        event.preventDefault();
        this._fail(new Error('Le contexte graphique 3D a été perdu. La vue 2D reste disponible.'));
      });
      this._listen(document, 'visibilitychange', () => {
        if (document.hidden) this._cancelFrame();
        else this._requestDraw();
      });

      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = false;
      this.controls.enablePan = true;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = 10;
      this.controls.maxDistance = 38;
      this.controls.minPolarAngle = 0.01;
      this.controls.maxPolarAngle = Math.PI * 0.44;
      this.controls.rotateSpeed = 0.7;
      this.controls.zoomSpeed = 0.9;
      this.controls.panSpeed = 0.65;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      this.controls.touches.ONE = THREE.TOUCH.ROTATE;
      this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      this._onControlsChange = () => {
        // Keep panning close enough to find the table again without a reset.
        const previous = this.controls.target.clone();
        this.controls.target.x = THREE.MathUtils.clamp(this.controls.target.x, -5, 5);
        this.controls.target.z = THREE.MathUtils.clamp(this.controls.target.z, -5, 5);
        this.controls.target.y = THREE.MathUtils.clamp(this.controls.target.y, 0, 1);
        const correction = this.controls.target.clone().sub(previous);
        if (correction.lengthSq()) {
          this.camera.position.add(correction);
          this.camera.lookAt(this.controls.target);
        }
        this._requestDraw();
      };
      this.controls.addEventListener('change', this._onControlsChange);
      this._makeLights();
      this._makeTable();
      this._makeMarkers();
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.container);
      this.setQuality('standard');
      this.resetCamera();
      this.update(this._view);
      this.resize();
    } catch (error) {
      this.dispose();
      throw new Error('Le rendu 3D nécessite WebGL 2 sur cet appareil. ' + error.message);
    }
  }

  _listen(target, name, listener, options) {
    target.addEventListener(name, listener, options);
    this._listeners.push([target, name, listener, options]);
  }

  _geometry(value) { this._ownedGeometries.add(value); return value; }
  _material(value) { this._ownedMaterials.add(value); return value; }
  _texture(value) {
    value.colorSpace = THREE.SRGBColorSpace;
    this._ownedTextures.add(value);
    return value;
  }

  _mesh(geometry, material, position, parent = this.scene) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  _makeLights() {
    this.scene.add(new THREE.HemisphereLight(0xdce8da, 0x403020, 1.9));
    this.keyLight = new THREE.DirectionalLight(0xffebcf, 3.1);
    this.keyLight.position.set(-7, 17, 9);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.camera.left = -9;
    this.keyLight.shadow.camera.right = 9;
    this.keyLight.shadow.camera.top = 9;
    this.keyLight.shadow.camera.bottom = -9;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 38;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.035;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.keyLight);
    const rim = new THREE.DirectionalLight(0xc7dbea, 1.25);
    rim.position.set(8, 9, -10);
    this.scene.add(rim);
  }

  _woodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ddd2bf';
    context.fillRect(0, 0, 256, 256);
    // Deterministic grain: no external image or network dependency.
    let seed = 173;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let line = 0; line < 190; line++) {
      const y = random() * 256;
      const wave = 2 + random() * 8;
      context.beginPath();
      for (let x = 0; x <= 256; x += 8) {
        const offset = Math.sin(x / 61 + line * 0.48) * wave + Math.sin(x / 23 + line) * 0.8;
        if (x === 0) context.moveTo(x, y + offset);
        else context.lineTo(x, y + offset);
      }
      context.strokeStyle = `rgba(63,43,27,${0.035 + random() * 0.085})`;
      context.lineWidth = 0.4 + random() * 1.5;
      context.stroke();
    }
    const texture = this._texture(new THREE.CanvasTexture(canvas));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  _coordinateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1536;
    const context = canvas.getContext('2d');
    const scale = canvas.width / 12.2;
    context.fillStyle = '#e4c68c';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '600 34px Georgia, serif';
    const label = (text, x, z, angle) => {
      context.save();
      context.translate(canvas.width / 2 + x * scale, canvas.height / 2 + z * scale);
      context.rotate(angle);
      context.fillText(text, 0, 0);
      context.restore();
    };
    for (let n = 0; n < SIZE; n++) {
      label(String.fromCharCode(65 + n), n - 5, 5.8, 0);
      label(String.fromCharCode(65 + n), n - 5, -5.8, Math.PI);
      label(String(11 - n), -5.8, n - 5, Math.PI / 2);
      label(String(11 - n), 5.8, n - 5, -Math.PI / 2);
    }
    return this._texture(new THREE.CanvasTexture(canvas));
  }

  _emblemTexture(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 192;
    const context = canvas.getContext('2d');
    context.strokeStyle = '#d6b16d';
    context.fillStyle = 'rgba(211,174,101,0.11)';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(96, 17); context.lineTo(175, 96);
    context.lineTo(96, 175); context.lineTo(17, 96); context.closePath();
    context.fill(); context.stroke();
    if (kind === 'throne') {
      context.lineWidth = 7;
      context.beginPath();
      context.moveTo(51, 73); context.lineTo(65, 122); context.lineTo(127, 122);
      context.lineTo(141, 73); context.lineTo(113, 91); context.lineTo(96, 55);
      context.lineTo(79, 91); context.closePath(); context.stroke();
      context.beginPath(); context.moveTo(64, 139); context.lineTo(128, 139); context.stroke();
    } else {
      context.lineWidth = 6;
      context.beginPath(); context.moveTo(58, 128); context.lineTo(134, 52);
      context.moveTo(87, 52); context.lineTo(134, 52); context.lineTo(134, 99);
      context.stroke();
    }
    return this._texture(new THREE.CanvasTexture(canvas));
  }

  _makeTable() {
    const wood = this._woodTexture();
    const darkWood = this._material(new THREE.MeshStandardMaterial({color: 0x3b291d,
      map: wood, roughness: 0.78, metalness: 0.02}));
    const rimWood = this._material(new THREE.MeshStandardMaterial({color: 0x583b26,
      map: wood, roughness: 0.62, metalness: 0.02}));
    const bronze = this._material(new THREE.MeshStandardMaterial({color: 0x9e7a42,
      roughness: 0.46, metalness: 0.55}));
    const base = this._mesh(this._geometry(new THREE.BoxGeometry(12.2, 0.48, 12.2)),
      darkWood, [0, -0.31, 0]);
    base.castShadow = base.receiveShadow = true;
    const foot = this._mesh(this._geometry(new THREE.BoxGeometry(11.8, 0.12, 11.8)),
      darkWood, [0, -0.61, 0]);
    foot.castShadow = foot.receiveShadow = true;
    const longRail = this._geometry(new THREE.BoxGeometry(12.2, 0.30, 0.56));
    const shortRail = this._geometry(new THREE.BoxGeometry(0.56, 0.30, 11.08));
    for (const z of [-5.82, 5.82]) {
      const rail = this._mesh(longRail, rimWood, [0, 0.08, z]);
      rail.castShadow = rail.receiveShadow = true;
    }
    for (const x of [-5.82, 5.82]) {
      const rail = this._mesh(shortRail, rimWood, [x, 0.08, 0]);
      rail.castShadow = rail.receiveShadow = true;
    }
    const trimLong = this._geometry(new THREE.BoxGeometry(11.12, 0.035, 0.035));
    const trimShort = this._geometry(new THREE.BoxGeometry(0.035, 0.035, 11.12));
    for (const z of [-5.555, 5.555]) this._mesh(trimLong, bronze, [0, 0.153, z]);
    for (const x of [-5.555, 5.555]) this._mesh(trimShort, bronze, [x, 0.153, 0]);

    const tileGeometry = this._geometry(new THREE.BoxGeometry(0.988, 0.16, 0.988));
    const tileMaterial = this._material(new THREE.MeshStandardMaterial({color: 0xffffff,
      map: wood, roughness: 0.7, metalness: 0.015}));
    this.tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, SIZE * SIZE);
    this.tiles.name = '121 cases de chêne';
    this.tiles.receiveShadow = true;
    this.tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      this._dummy.position.set(c - 5, SURFACE - 0.08, r - 5);
      this._dummy.rotation.set(0, ((r + c) % 3 === 0 ? 1 : 0) * Math.PI, 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.tiles.setMatrixAt(r * SIZE + c, this._dummy.matrix);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.computeBoundingSphere();
    this.scene.add(this.tiles);

    const labelMaterial = this._material(new THREE.MeshBasicMaterial({map: this._coordinateTexture(),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}));
    const labels = this._mesh(this._geometry(new THREE.PlaneGeometry(12.2, 12.2)),
      labelMaterial, [0, 0.234, 0]);
    labels.rotation.x = -Math.PI / 2;

    const emblemGeometry = this._geometry(new THREE.PlaneGeometry(0.92, 0.92));
    const emblemMaterial = kind => this._material(new THREE.MeshBasicMaterial({map: this._emblemTexture(kind),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2}));
    const throne = this._mesh(emblemGeometry, emblemMaterial('throne'), [0, SURFACE + 0.004, 0]);
    throne.rotation.x = -Math.PI / 2;
    this.cornerEmblems = new THREE.Group();
    const escapeMaterial = emblemMaterial('escape');
    for (const x of [-5, 5]) for (const z of [-5, 5]) {
      const marker = this._mesh(emblemGeometry, escapeMaterial, [x, SURFACE + 0.004, z], this.cornerEmblems);
      marker.rotation.set(-Math.PI / 2, 0, x * z < 0 ? 0 : Math.PI / 2);
    }
    this.scene.add(this.cornerEmblems);
    this.pieces = new THREE.Group();
    this.pieces.name = 'Figurines';
    this.scene.add(this.pieces);
    const floor = this._mesh(this._geometry(new THREE.PlaneGeometry(160, 160)),
      this._material(new THREE.MeshStandardMaterial({color: 0x1e3025, roughness: 1, metalness: 0})), [0, -0.69, 0]);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
  }

  _makeMarkers() {
    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);
    this._markerPools = {legal: [], capture: [], selected: [], focus: [], target: []};
    const ring = this._geometry(new THREE.RingGeometry(0.31, 0.37, 32));
    const dot = this._geometry(new THREE.RingGeometry(0.075, 0.135, 24));
    const square = this._geometry(new THREE.RingGeometry(0.52, 0.56, 4));
    const arrow = this._geometry(new THREE.ConeGeometry(0.085, 0.19, 4));
    const baseMaterial = color => this._material(new THREE.MeshBasicMaterial({color,
      side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.96}));
    this._markerStyles = {
      legal: [dot, baseMaterial(GOLD)],
      capture: [dot, baseMaterial(RED)],
      selected: [ring, baseMaterial(GOLD)],
      focus: [arrow, baseMaterial(0xffe2a3)],
      target: [square, baseMaterial(0xb6d6b7)],
    };
    this._dropMaterial = baseMaterial(GOLD);
    this._dropMarker = this._mesh(square, this._dropMaterial, [0, SURFACE + 0.033, 0], this.markerGroup);
    this._dropMarker.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    this._dropMarker.visible = false;
  }

  _setMarkers(kind, positions) {
    const pool = this._markerPools[kind];
    const [geometry, material] = this._markerStyles[kind];
    const unique = [...new Map((positions || []).filter(validSquare).map(p => [p.join(','), p])).values()];
    for (let i = 0; i < unique.length; i++) {
      const [r, c] = unique[i];
      if (!pool[i]) {
        pool[i] = this._mesh(geometry, material, [0, 0, 0], this.markerGroup);
        pool[i].rotation.x = kind === 'focus' ? Math.PI : -Math.PI / 2;
        if (kind === 'target') pool[i].rotation.z = Math.PI / 4;
      }
      const height = kind === 'focus'
        ? ({N: 1.12, E: 1.34, R: 1.52}[this._view.board[r][c]] || 0.1) + 0.27
        : 0.016 + (kind === 'selected' ? 0.008 : 0);
      pool[i].position.set(c - 5, SURFACE + height, r - 5);
      pool[i].visible = true;
    }
    for (let i = unique.length; i < pool.length; i++) pool[i].visible = false;
  }

  update(value = {}) {
    if (this.disposed || this.lost) return;
    const candidate = Object.prototype.hasOwnProperty.call(value, 'board') ? value.board : this._view.board;
    const board = Array.isArray(candidate) && candidate.length === SIZE &&
      candidate.every(row => Array.isArray(row) && row.length === SIZE)
      ? candidate.map(row => row.map(piece => ['N', 'E', 'R'].includes(piece) ? piece : '.')) : emptyBoard();
    const mode = ['historical', 'fetlar', 'copenhagen'].includes(value.mode) ? value.mode : this._view.mode || 'fetlar';
    this._view = {...this._view, ...value, board, mode};
    let changed = false;
    if (this._mode !== mode) {
      this._mode = mode;
      const color = new THREE.Color();
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const reserved = (r === 5 && c === 5) || (mode !== 'historical' &&
          [0, 10].includes(r) && [0, 10].includes(c));
        color.setHex(reserved ? 0x987346 : (r + c) % 2 ? 0x956b42 : 0x62442a);
        this.tiles.setColorAt(r * SIZE + c, color);
      }
      this.tiles.instanceColor.needsUpdate = true;
      this.cornerEmblems.visible = mode !== 'historical';
      changed = true;
    }
    const boardKey = board.map(row => row.join('')).join('');
    if (this.captureCinematic.active && this._boardKey && boardKey !== this._boardKey) this.captureCinematic.cancel();
    if (this.escapeCinematic.active && this._boardKey && boardKey !== this._boardKey) this.escapeCinematic.cancel();
    if (this.siegeCinematic.active && this._boardKey && boardKey !== this._boardKey) this.siegeCinematic.cancel();
    if (this.moveAnimation.active && this._boardKey && boardKey !== this._boardKey) this.moveAnimation.cancel();
    if (boardKey !== this._boardKey) {
      this._boardKey = boardKey;
      const used = {N: 0, E: 0, R: 0};
      this._visiblePieces = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const kind = board[r][c];
        if (kind === '.') continue;
        const index = used[kind]++;
        const pool = this._piecePools[kind];
        if (!pool[index]) {
          pool[index] = createFigurine(kind);
          this.pieces.add(pool[index]);
        }
        const figure = pool[index];
        figure.position.set(c - 5, SURFACE, r - 5);
        figure.rotation.y = kind === 'N' ? Math.atan2(5 - c, 5 - r)
          : kind === 'R' ? 0 : Math.atan2(c - 5, r - 5);
        figure.userData.square = [r, c];
        figure.userData.piece = kind;
        figure.visible = true;
        this._visiblePieces.push(figure);
      }
      for (const kind of ['N', 'E', 'R']) {
        for (let i = used[kind]; i < this._piecePools[kind].length; i++) this._piecePools[kind][i].visible = false;
      }
      this._pieceCounts = used;
      this.canvas.dataset.pieces = String(this._visiblePieces.length);
      this.renderer.shadowMap.needsUpdate = true;
      changed = true;
    }
    const markerKey = JSON.stringify([this._view.selected, this._view.legal, this._view.captures,
      this._view.targets, this._view.focus]);
    if (markerKey !== this._markerKey) {
      this._markerKey = markerKey;
      this._setMarkers('legal', (this._view.legal || []).filter(p => !listHas(this._view.captures, p)));
      this._setMarkers('capture', (this._view.captures || []).filter(p => listHas(this._view.legal, p)));
      this._setMarkers('selected', validSquare(this._view.selected) ? [this._view.selected] : []);
      this._setMarkers('target', this._view.targets);
      this._setMarkers('focus', (this._view.focus || []).filter(p => !sameSquare(p, this._view.selected)));
      changed = true;
    }
    this._updateDropMarker();
    if (changed || this._gesture?.started) this._requestDraw();
  }

  _setRay(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    // A captured pointer can be released over adjacent controls. Such a drop
    // cancels the move even when the infinite board plane lies behind them.
    if (clientX < rect.left || clientX >= rect.right ||
        clientY < rect.top || clientY >= rect.bottom) return false;
    this._pointer.set(((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    this._raycaster.setFromCamera(this._pointer, this.camera);
    return true;
  }

  _pick(clientX, clientY, groundOnly = false) {
    if (!this._setRay(clientX, clientY)) return null;
    if (groundOnly) {
      const point = this._raycaster.ray.intersectPlane(this._boardPlane, this._planePoint);
      if (!point) return null;
      const position = [Math.floor(point.z + 5.5), Math.floor(point.x + 5.5)];
      return validSquare(position) ? position : null;
    }
    const hits = this._raycaster.intersectObjects([this.tiles, ...this._visiblePieces], true);
    for (const hit of hits) {
      if (hit.object === this.tiles && Number.isInteger(hit.instanceId)) {
        return [Math.floor(hit.instanceId / SIZE), hit.instanceId % SIZE];
      }
      let object = hit.object;
      while (object && object !== this.scene) {
        if (validSquare(object.userData.square)) return [...object.userData.square];
        object = object.parent;
      }
    }
    return null;
  }

  _canStartPiece(position) {
    return Boolean(position && !this.moveAnimation.active && this._view.interactive && !this._view.disabled &&
      this._view.board[position[0]][position[1]] !== '.' &&
      this.callbacks.canDrag && this.callbacks.canDrag(...position));
  }

  _pointerDown(event) {
    if (this.disposed || this.lost || !this.active) return;
    this._pointerPositions.set(event.pointerId, [event.clientX, event.clientY]);
    if (this._pointerPositions.size > 1) {
      // OrbitControls received the first down event, so two-finger gestures can
      // take over even when the first finger started over a movable figurine.
      this._cancelGesture();
      if (this.controls) this.controls.enabled = true;
      return;
    }
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    const from = this._pick(event.clientX, event.clientY);
    const piece = this._canStartPiece(from) && !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
    this._gesture = {id: event.pointerId, from, x: event.clientX, y: event.clientY,
      kind: piece ? 'piece' : 'camera', moved: false, started: false};
    // Do not stop the down event: OrbitControls tracks all touch pointers.
    // Its first movement is blocked in capture phase if this becomes a drag.
  }

  _pointerMove(event) {
    if (this._pointerPositions.has(event.pointerId)) {
      this._pointerPositions.set(event.pointerId, [event.clientX, event.clientY]);
    }
    const gesture = this._gesture;
    if (!gesture || gesture.id !== event.pointerId || this._pointerPositions.size !== 1) return;
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    if (distance > (event.pointerType === 'touch' ? 10 : 6)) gesture.moved = true;
    if (gesture.kind !== 'piece') return;
    // A small move must not turn into a tiny unwanted camera rotation either.
    this._suspendCamera(true);
    if (!gesture.moved) return;
    if (!gesture.started) {
      gesture.started = true;
      this.canvas.style.cursor = 'grabbing';
      this._invoke('onDragStart', ...gesture.from);
    }
    this._dragTarget = this._pick(event.clientX, event.clientY, true);
    this._updateDropMarker();
    this._requestDraw();
  }

  _pointerUp(event) {
    const gesture = this._gesture;
    const wasSingle = this._pointerPositions.size === 1;
    this._pointerPositions.delete(event.pointerId);
    this._suspendCamera(false);
    if (!gesture || gesture.id !== event.pointerId || !wasSingle) return;
    this._gesture = null;
    this._dragTarget = null;
    this.canvas.style.cursor = '';
    this._updateDropMarker();
    this._requestDraw();
    if (gesture.kind === 'piece' && gesture.started) {
      const to = this._pick(event.clientX, event.clientY, true);
      if (to && !sameSquare(to, gesture.from)) this._invoke('onDrop', [...gesture.from], to);
    } else if (!gesture.moved && !this.moveAnimation.active && !this._view.disabled && this._view.interactive) {
      const square = this._pick(event.clientX, event.clientY);
      if (square && sameSquare(square, gesture.from)) this._invoke('onClick', ...square);
    }
  }

  _pointerCancel(event) {
    this._pointerPositions.delete(event.pointerId);
    if (this._gesture && this._gesture.id === event.pointerId) this._cancelGesture();
    this._suspendCamera(false);
  }

  _lostCapture(event) {
    if (this._pointerPositions.has(event.pointerId)) this._pointerCancel(event);
  }

  _cancelGesture() {
    this._gesture = null;
    this._dragTarget = null;
    if (this.canvas) this.canvas.style.cursor = '';
    this._suspendCamera(false);
    this._updateDropMarker();
    this._requestDraw();
  }

  _updateDropMarker() {
    if (!this._dropMarker) return;
    const gesture = this._gesture;
    const knownLegal = gesture && sameSquare(this._view.selected, gesture.from) && !this._view.disabled;
    this._dropMarker.visible = Boolean(gesture && gesture.started && this._dragTarget &&
      knownLegal && listHas(this._view.legal, this._dragTarget));
    if (!this._dropMarker.visible) return;
    const [r, c] = this._dragTarget;
    this._dropMarker.position.set(c - 5, SURFACE + 0.033, r - 5);
    this._dropMaterial.color.setHex(listHas(this._view.captures, this._dragTarget) ? RED : GOLD);
  }

  _suspendCamera(value) {
    if (!this.controls) return;
    // Keep pointer tracking alive during a piece drag. A second finger can
    // then start dolly/rotation from its current position without a jump.
    this.controls.enabled = this.active && !this.lost;
    this.controls.enableRotate = !value;
    this.controls.enablePan = !value;
    this.controls.enableZoom = !value;
  }

  _invoke(name, ...args) {
    if (typeof this.callbacks[name] !== 'function') return;
    // UI callbacks own request errors; report unexpected failures separately
    // from graphics errors so a refused game move cannot disable WebGL.
    try {
      const result = this.callbacks[name](...args);
      if (result && typeof result.catch === 'function') result.catch(error => this._inputError(error));
    } catch (error) { this._inputError(error); }
  }

  _inputError(error) {
    this.container.dispatchEvent(new CustomEvent('board-input-error', {detail: {message: String(error.message || error)}}));
  }

  _keyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || this.disposed || this.lost) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home', 't', 'T'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') return this.resetCamera();
    if (event.key === 't' || event.key === 'T') return this.topView();
    if (['+', '='].includes(event.key)) return this.zoomBy(0.86);
    if (['-', '_'].includes(event.key)) return this.zoomBy(1 / 0.86);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
    if (event.key === 'ArrowRight') spherical.theta += 0.12;
    if (event.key === 'ArrowUp') spherical.phi -= 0.10;
    if (event.key === 'ArrowDown') spherical.phi += 0.10;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, this.controls.minPolarAngle, this.controls.maxPolarAngle);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.controls.update();
    this._requestDraw();
  }

  resetCamera() {
    if (this.disposed || !this.controls) return;
    this.controls.target.set(0, 0.12, 0);
    this.camera.position.set(8.6, 16.8, 16.2);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this._requestDraw();
  }

  topView() {
    if (this.disposed || !this.controls) return;
    this.controls.target.set(0, SURFACE, 0);
    this.camera.position.set(0, 20.5, 0.22);
    this.controls.update();
    this._requestDraw();
  }

  zoomBy(factor) {
    if (this.disposed || !this.controls || !Number.isFinite(factor) || factor <= 0) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update();
    this._requestDraw();
  }

  setQuality(value) {
    if (this.disposed || !this.renderer) return;
    this.quality = ['eco', 'standard', 'high'].includes(value) ? value : 'standard';
    const cap = {eco: 1, standard: 1.5, high: 2}[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.shadowMap.enabled = this.quality !== 'eco';
    if (this.keyLight) {
      const size = this.quality === 'high' ? 2048 : 1024;
      if (this.keyLight.shadow.mapSize.x !== size) {
        this.keyLight.shadow.mapSize.set(size, size);
        if (this.keyLight.shadow.map) {
          this.keyLight.shadow.map.dispose();
          this.keyLight.shadow.map = null;
        }
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
    this._requestDraw();
  }

  resize() {
    if (this.disposed || !this.renderer) return;
    const width = Math.round(this.container.clientWidth);
    const height = Math.round(this.container.clientHeight);
    if (width < 2 || height < 2) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.aspect = aspect;
    // Preserve viewpoint and framing when a narrow display changes aspect.
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / Math.min(1, aspect)));
    this.camera.updateProjectionMatrix();
    this._requestDraw();
  }

  playMove(record, options) {
    if (this.captureCinematic.active || this.escapeCinematic.active || this.siegeCinematic.active) return false;
    return this.moveAnimation.start(record, options);
  }

  cancelMove() {
    this.moveAnimation.cancel();
  }

  playCapture(record, options) {
    this.moveAnimation.cancel();
    this.captureCinematic.cancel();
    this.escapeCinematic.cancel();
    this.siegeCinematic.cancel();
    if (record?.reason === 'king_captured' && record?.winner === 'dwarf' &&
        record?.piece === 'N') return this.siegeCinematic.start(record, options);
    if (record?.reason === 'escape' && record?.piece === 'R' &&
        record?.winner === 'elf') return this.escapeCinematic.start(record, options);
    return this.captureCinematic.start(record, options);
  }

  cancelCapture() {
    this.captureCinematic.cancel();
    this.escapeCinematic.cancel();
    this.siegeCinematic.cancel();
  }

  setActive(value) {
    if (this.disposed) return;
    if (!value) {
      this.captureCinematic.cancel();
      this.escapeCinematic.cancel();
      this.siegeCinematic.cancel();
      this.moveAnimation.cancel();
    }
    this.active = Boolean(value) && !this.lost;
    if (this.controls) this.controls.enabled = this.active;
    if (!this.active) {
      this._cancelGesture();
      this._pointerPositions.clear();
      this._cancelFrame();
    } else {
      this.resize();
      this._requestDraw();
    }
  }

  _cancelFrame() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  _requestDraw() {
    if (!this.active || this.disposed || this.lost || document.hidden || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.active || this.disposed || this.lost || document.hidden || !this.width || !this.height) return;
      try {
        this.renderer.render(this.scene, this.camera);
        this.renderCount++;
        this.canvas.dataset.rendered = String(this.renderCount);
      } catch (error) { this._fail(error); }
    });
  }

  _fail(error) {
    if (this.disposed || this.lost) return;
    this.captureCinematic.cancel();
    this.escapeCinematic.cancel();
    this.siegeCinematic.cancel();
    this.moveAnimation.cancel();
    this.lost = true;
    this.active = false;
    this._cancelGesture();
    this._cancelFrame();
    if (this.controls) this.controls.enabled = false;
    if (this.canvas) this.canvas.dataset.renderer = 'unavailable';
    if (typeof this.callbacks.onError === 'function') this.callbacks.onError(error);
  }

  projectSquare(row, col, height = SURFACE + 0.03) {
    if (!validSquare([row, col]) || !this.canvas || this.disposed) return null;
    this.camera.updateMatrixWorld();
    const projected = new THREE.Vector3(col - 5, height, row - 5).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {x: rect.left + (projected.x + 1) * rect.width / 2,
      y: rect.top + (1 - projected.y) * rect.height / 2,
      visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1};
  }

  getDiagnostics() {
    return {renderer: this.lost ? 'unavailable' : 'webgl2', threeRevision: THREE.REVISION,
      boardSize: SIZE, pieceCount: this._visiblePieces.length, pieces: {...this._pieceCounts},
      mode: this._view.mode, selected: this._view.selected ? [...this._view.selected] : null,
      legalCount: (this._view.legal || []).length, captureCount: (this._view.captures || []).length, quality: this.quality,
      active: this.active, disposed: this.disposed, renders: this.renderCount,
      motion: {active: this.moveAnimation.active, key: this.moveAnimation.key,
        progress: this.moveAnimation.progress,from: this.moveAnimation.from,
        to: this.moveAnimation.to},
      cinematic: {active: this.captureCinematic.active || this.escapeCinematic.active ||
          this.siegeCinematic.active,
        progress: this.siegeCinematic.active ? this.siegeCinematic.progress :
          this.escapeCinematic.active ? this.escapeCinematic.progress :
          this.captureCinematic.progress,
        key: this.captureCinematic.key, shardCount: this.captureCinematic.actors?.reduce(
          (sum, actor) => sum + actor.shards.length, 0) || 0,
        articulated: this.captureCinematic.active &&
          Boolean(this.captureCinematic.attackerRig?.right),
        victims: this.captureCinematic.actors?.length || 0,
        style: this.siegeCinematic.active ? 'king-last-stand' :
          this.escapeCinematic.active ? 'royal-cavalry' :
          this.captureCinematic.active
          ? (this.captureCinematic.flank?.style || 'combo') : null,
        flank: this.captureCinematic.flank ? {
          supporter: [...this.captureCinematic.flank.plan.supporter],
          pause: [...this.captureCinematic.flank.plan.pause],
          supportAnimated: Boolean(this.captureCinematic.flank.supporter),
          sword: Boolean(this.captureCinematic.flank.sword),
          splitHalves: this.captureCinematic.flank.split?.parts?.length || 0,
          attackerAt: this.captureCinematic.attacker.position.toArray(),
          phase: this.captureCinematic.flank.phase || 0,
        } : null,
        duel: this.captureCinematic.duel ?? -1,
        stage: this.captureCinematic.stage || '',
        sparkCount: this.captureCinematic.actors?.reduce((sum, actor) =>
          sum + (actor.sparks?.filter(spark => spark.visible).length || 0), 0) || 0},
      siege: {active: this.siegeCinematic.active,
        configuration: this.siegeCinematic.plan?.configuration || null,
        king: this.siegeCinematic.plan?.king || null,
        attackers: this.siegeCinematic.dwarves?.length || 0,
        movedDwarves: this.siegeCinematic.dwarves?.filter(d => d.entry.moved).length || 0,
        stage: this.siegeCinematic.stage || '',
        fragments: this.siegeCinematic.shards?.length || 0,
        crownVisible: Boolean(this.siegeCinematic.crown?.visible),
        originalHidden: this.siegeCinematic._hidden?.length || 0,
        progress: this.siegeCinematic.progress},
      escape: {active: this.escapeCinematic.active,
        stage: this.escapeCinematic.stage,
        horses: this.escapeCinematic.horses?.length || 0,
        mountedKing: this.escapeCinematic.horses?.[0]?.rider?.name || null,
        escortCount: this.escapeCinematic.horses?.filter(h => h.kind === 'E').length || 0,
        saluteCount: this.escapeCinematic.reactions?.filter(h => h.kind === 'E').length || 0,
        protestCount: this.escapeCinematic.reactions?.filter(h => h.kind === 'N').length || 0,
        phases: this.escapeCinematic.phases || null,
        exit: this.escapeCinematic.plan?.to || null},
      camera: {position: this.camera.position.toArray(), target: this.controls?.target.toArray() || [0, 0, 0]},
      resolution: {width: this.width, height: this.height, pixelRatio: this.renderer?.getPixelRatio() || 1},
      graphics: this.renderer ? {calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures} : null};
  }

  dispose() {
    if (this.disposed) return;
    this.captureCinematic.cancel();
    this.escapeCinematic.cancel();
    this.siegeCinematic.cancel();
    this.moveAnimation.cancel();
    this.disposed = true;
    this.active = false;
    this._cancelFrame();
    this._resizeObserver?.disconnect();
    for (const [target, name, listener, options] of this._listeners) target.removeEventListener(name, listener, options);
    this._listeners.length = 0;
    if (this.controls) {
      this.controls.removeEventListener('change', this._onControlsChange);
      this.controls.dispose();
    }
    // Figurine templates are shared between views: dispose only this board's
    // own resources, never traverse and dispose the figurines' materials.
    for (const geometry of this._ownedGeometries) geometry.dispose();
    for (const material of this._ownedMaterials) material.dispose();
    for (const texture of this._ownedTextures) texture.dispose();
    this.keyLight?.shadow.map?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.canvas?.remove();
    if (this.container.board3d === this) delete this.container.board3d;
    this._pointerPositions.clear();
  }
}
