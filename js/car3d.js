/**
 * El Rayo AutoDesign Studio — Motor 3D Paramétrico y Proyección de Superficie
 * 
 * Funcionalidades:
 * - Geometría 3D automotriz desglosada en piezas físicas independientes
 *   (Cofre, Toldo, Puertas, Fascias, Salpicaderas, Batea de Camioneta, Rines, Calipers, Vidrios)
 * - Soporte para: Camioneta Pickup (con batea), Sedán, Coupé Deportivo
 * - Materiales PBR físicos (Metálico, Perlado, Gloss, Mate Satinado)
 * - Raycaster interactivo: Selección y hover de piezas con respuesta táctil
 * - Adaptación de Calcas a la curvatura 3D de la lámina
 * - Controles orbitales nativos independientes (100% resiliente a fallas de red/CDN)
 */

export class Car3DEngine {
  constructor(canvasContainer, options = {}) {
    this.container = canvasContainer;
    this.options = options;
    this.vehicleType = options.vehicleType || "pickup";
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.carGroup = null;
    
    // Mapeo de piezas 3D: partId -> THREE.Mesh
    this.partsMeshes = new Map();
    this.partsMaterials = new Map();
    this.hoveredPart = null;
    this.selectedPartId = null;
    
    // Calca activa
    this.activeDecalMesh = null;
    this.decalTexture = null;

    // Callbacks
    this.onPartSelected = options.onPartSelected || null;
    this.onPartHovered = options.onPartHovered || null;

    this.raycaster = null;
    this.mouse = null;

    // Controles orbitales nativos
    this.azimuth = 0.8;
    this.elevation = 0.35;
    this.distance = 5.8;
    this.target = null;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };

    this.init();
  }

  init() {
    if (!window.THREE) {
      console.warn("Three.js no detectado aún en window.THREE");
      return;
    }

    const THREE = window.THREE;
    this.carGroup = new THREE.Group();
    this.target = new THREE.Vector3(0, 0.6, 0);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 500;

    // 1. Escena con atmósfera gris clara de estudio minimalista
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xE4E7EB);
    this.scene.fog = new THREE.FogExp2(0xE4E7EB, 0.03);

    // 2. Cámara
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this._updateCameraPosition();

    // 3. Renderer con Antialiasing y ToneMapping
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      
      this.container.innerHTML = "";
      this.container.appendChild(this.renderer.domElement);
    } catch (e) {
      console.error("Error al crear WebGLRenderer", e);
      return;
    }

    // 4. Controles orbitales (OrbitControls o nativo)
    if (THREE.OrbitControls) {
      try {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
        this.controls.minDistance = 2.5;
        this.controls.maxDistance = 10.0;
        this.controls.target.copy(this.target);
      } catch (err) {
        this._setupNativeOrbitControls();
      }
    } else {
      this._setupNativeOrbitControls();
    }

    // 5. Iluminación de estudio diurno suave
    this._setupLighting();

    // 6. Plataforma de estudio gris claro
    this._setupStudioFloor();

    // 7. Construir vehículo paramétrico
    this.scene.add(this.carGroup);
    this.rebuildVehicle(this.vehicleType);

    // 8. Eventos de interacción
    this._bindEvents();

    // 9. Loop de renderizado
    this._animate();
  }

  _setupNativeOrbitControls() {
    const el = this.renderer.domElement;
    el.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;

      this.azimuth -= dx * 0.008;
      this.elevation = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, this.elevation + dy * 0.006));
      this._updateCameraPosition();
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.distance = Math.max(2.5, Math.min(10.0, this.distance * zoomFactor));
      this._updateCameraPosition();
    }, { passive: false });
  }

  _updateCameraPosition() {
    const x = this.target.x + this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
    const y = this.target.y + this.distance * Math.sin(this.elevation);
    const z = this.target.z + this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  _setupLighting() {
    const THREE = window.THREE;
    // Luz ambiental equilibrada
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    // Luz principal de estudio cenital
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.2);
    keyLight.position.set(6, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Luz de relleno lateral
    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.65);
    fillLight.position.set(-6, 4, -4);
    this.scene.add(fillLight);

    // Luz suave de suelo
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0d5dd, 0.45);
    this.scene.add(hemiLight);
  }

  _setupStudioFloor() {
    const THREE = window.THREE;
    const floorGeo = new THREE.PlaneGeometry(35, 35);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xDBDFE5,
      roughness: 0.35,
      metalness: 0.1
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Retícula circular suave gris claro
    const gridHelper = new THREE.PolarGridHelper(7.5, 16, 8, 64, 0x8F9AA7, 0xC4CBD4);
    gridHelper.position.y = 0.005;
    this.scene.add(gridHelper);
  }

  rebuildVehicle(type = "pickup", defaultColor = "#B8252A", defaultFinish = "metallic") {
    if (!window.THREE || !this.carGroup) return;
    const THREE = window.THREE;

    this.vehicleType = type;
    
    // Limpiar geometrías previas
    while (this.carGroup.children.length > 0) {
      const obj = this.carGroup.children[0];
      this.carGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    this.partsMeshes.clear();
    this.partsMaterials.clear();

    const isPickup = (type === "pickup");
    const isCoupe = (type === "coupe");

    const length = isPickup ? 4.5 : isCoupe ? 4.0 : 4.3;
    const width = isPickup ? 1.95 : isCoupe ? 1.82 : 1.85;
    const bodyHeight = isPickup ? 0.95 : isCoupe ? 0.72 : 0.85;
    const groundClearance = isPickup ? 0.38 : isCoupe ? 0.22 : 0.28;

    const createPaintMaterial = (colorHex, finish = defaultFinish) => {
      const isMetallic = finish === "metallic";
      const isPearl = finish === "pearl";
      const isMatte = finish === "matte";

      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(colorHex),
        metalness: isMetallic ? 0.82 : isPearl ? 0.6 : isMatte ? 0.05 : 0.15,
        roughness: isMatte ? 0.65 : isMetallic ? 0.22 : 0.18,
        clearcoat: isMatte ? 0.0 : 0.95,
        clearcoatRoughness: isMatte ? 0.0 : 0.08,
        reflectivity: 0.9
      });
    };

    // 1. COFRE
    const hoodGeo = new THREE.BoxGeometry(width * 0.88, 0.1, length * 0.32);
    const hoodMesh = new THREE.Mesh(hoodGeo, createPaintMaterial(defaultColor));
    hoodMesh.position.set(0, groundClearance + bodyHeight * 0.68, length * 0.25);
    hoodMesh.castShadow = true;
    hoodMesh.receiveShadow = true;
    this._registerPart("cofre", "Cofre (Hood)", hoodMesh);

    // 2. TOLDO
    const roofLen = isPickup ? length * 0.35 : isCoupe ? length * 0.42 : length * 0.45;
    const roofGeo = new THREE.BoxGeometry(width * 0.78, 0.08, roofLen);
    const roofMesh = new THREE.Mesh(roofGeo, createPaintMaterial(defaultColor));
    roofMesh.position.set(0, groundClearance + bodyHeight * 1.28, isPickup ? -length * 0.05 : 0);
    roofMesh.castShadow = true;
    this._registerPart("toldo", "Toldo (Roof)", roofMesh);

    // 3. PUERTAS DELANTERAS
    const doorLen = length * 0.26;
    const doorH = bodyHeight * 0.65;
    const doorMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, doorLen), createPaintMaterial(defaultColor));
    doorMeshL.position.set(-width * 0.44, groundClearance + doorH * 0.55, length * 0.06);
    doorMeshL.castShadow = true;
    this._registerPart("puerta_del_izq", "Puerta Delantera Izquierda", doorMeshL);

    const doorMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, doorLen), createPaintMaterial(defaultColor));
    doorMeshR.position.set(width * 0.44, groundClearance + doorH * 0.55, length * 0.06);
    doorMeshR.castShadow = true;
    this._registerPart("puerta_del_der", "Puerta Delantera Derecha", doorMeshR);

    // 4. TRASERA: BATEA O CAJUELA / PUERTAS TRASERAS
    if (isPickup) {
      const bedLen = length * 0.42;
      const bedMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.12, bodyHeight * 0.62, bedLen), createPaintMaterial(defaultColor));
      bedMeshL.position.set(-width * 0.44, groundClearance + bodyHeight * 0.31, -length * 0.28);
      bedMeshL.castShadow = true;
      this._registerPart("batea_izq", "Batea Costado Izq", bedMeshL);

      const bedMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.12, bodyHeight * 0.62, bedLen), createPaintMaterial(defaultColor));
      bedMeshR.position.set(width * 0.44, groundClearance + bodyHeight * 0.31, -length * 0.28);
      bedMeshR.castShadow = true;
      this._registerPart("batea_der", "Batea Costado Der", bedMeshR);

      const tailGateMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, bodyHeight * 0.62, 0.1), createPaintMaterial(defaultColor));
      tailGateMesh.position.set(0, groundClearance + bodyHeight * 0.31, -length * 0.48);
      tailGateMesh.castShadow = true;
      this._registerPart("cajuela", "Compuerta Trasera (Batea)", tailGateMesh);

      const bedFloorMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.76, 0.08, bedLen * 0.95), new THREE.MeshStandardMaterial({ color: 0x33373E, roughness: 0.8 }));
      bedFloorMesh.position.set(0, groundClearance + 0.05, -length * 0.28);
      this.carGroup.add(bedFloorMesh);
    } else {
      if (!isCoupe) {
        const doorMeshRL = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, doorLen * 0.85), createPaintMaterial(defaultColor));
        doorMeshRL.position.set(-width * 0.44, groundClearance + doorH * 0.55, -length * 0.16);
        this._registerPart("puerta_tras_izq", "Puerta Trasera Izquierda", doorMeshRL);

        const doorMeshRR = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, doorLen * 0.85), createPaintMaterial(defaultColor));
        doorMeshRR.position.set(width * 0.44, groundClearance + doorH * 0.55, -length * 0.16);
        this._registerPart("puerta_tras_der", "Puerta Trasera Derecha", doorMeshRR);
      }
      const trunkMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.1, length * 0.26), createPaintMaterial(defaultColor));
      trunkMesh.position.set(0, groundClearance + bodyHeight * 0.65, -length * 0.36);
      trunkMesh.castShadow = true;
      this._registerPart("cajuela", "Cajuela (Trunk)", trunkMesh);
    }

    // 5. SALPICADERAS
    const fenderMeshFL = new THREE.Mesh(new THREE.BoxGeometry(0.14, bodyHeight * 0.55, length * 0.22), createPaintMaterial(defaultColor));
    fenderMeshFL.position.set(-width * 0.45, groundClearance + bodyHeight * 0.35, length * 0.32);
    this._registerPart("salpicadera_del_izq", "Salpicadera Del. Izq", fenderMeshFL);

    const fenderMeshFR = new THREE.Mesh(new THREE.BoxGeometry(0.14, bodyHeight * 0.55, length * 0.22), createPaintMaterial(defaultColor));
    fenderMeshFR.position.set(width * 0.45, groundClearance + bodyHeight * 0.35, length * 0.32);
    this._registerPart("salpicadera_del_der", "Salpicadera Del. Der", fenderMeshFR);

    // 6. FASCIAS Y PARRILLA
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, bodyHeight * 0.45, 0.28), createPaintMaterial(defaultColor));
    frontBumper.position.set(0, groundClearance + bodyHeight * 0.25, length * 0.46);
    frontBumper.castShadow = true;
    this._registerPart("fascia_del", "Fascia Delantera", frontBumper);

    const grillMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.65, bodyHeight * 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x22262B, roughness: 0.5, metalness: 0.5 }));
    grillMesh.position.set(0, groundClearance + bodyHeight * 0.24, length * 0.47 + 0.14);
    this._registerPart("parrilla", "Parrilla Frontal", grillMesh);

    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, bodyHeight * 0.45, 0.25), createPaintMaterial(defaultColor));
    rearBumper.position.set(0, groundClearance + bodyHeight * 0.25, -length * 0.48);
    rearBumper.castShadow = true;
    this._registerPart("fascia_tras", "Fascia Trasera", rearBumper);

    // 7. CRISTALES / POLARIZADO
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1A2230,
      transmission: 0.85,
      opacity: 1.0,
      transparent: true,
      roughness: 0.05,
      ior: 1.5,
      reflectivity: 0.9
    });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.74, 0.04, length * 0.22), glassMat);
    windshield.rotateX(Math.PI / 4.2);
    windshield.position.set(0, groundClearance + bodyHeight * 1.05, isPickup ? length * 0.12 : length * 0.16);
    this._registerPart("vidrios", "Cristales / Parabrisas", windshield);

    // 8. ESPEJOS
    const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), createPaintMaterial(defaultColor));
    mirrorL.position.set(-width * 0.54, groundClearance + bodyHeight * 0.95, length * 0.14);
    this._registerPart("espejos", "Espejos Laterales", mirrorL);

    const mirrorR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), createPaintMaterial(defaultColor));
    mirrorR.position.set(width * 0.54, groundClearance + bodyHeight * 0.95, length * 0.14);
    this.carGroup.add(mirrorR);

    // 9. RUEDAS COMPLETAS
    this._createWheels(width, length, isPickup);

    // 10. Sombra de contacto
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.25, length * 1.15),
      new THREE.MeshBasicMaterial({ color: 0x88909A, transparent: true, opacity: 0.45, depthWrite: false })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    this.carGroup.add(shadowMesh);
  }

  _createWheels(width, length, isPickup) {
    const THREE = window.THREE;
    const wheelRadius = isPickup ? 0.42 : 0.36;
    const wheelWidth = 0.28;
    const positions = [
      [-width * 0.48, wheelRadius, length * 0.32],
      [width * 0.48, wheelRadius, length * 0.32],
      [-width * 0.48, wheelRadius, -length * 0.32],
      [width * 0.48, wheelRadius, -length * 0.32]
    ];

    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.85 });

    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.68, wheelRadius * 0.68, wheelWidth * 1.02, 20);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xD0D4DA, metalness: 0.9, roughness: 0.2 });

    const caliperGeo = new THREE.BoxGeometry(0.14, wheelRadius * 0.38, 0.12);
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xC8102E, roughness: 0.25 });

    positions.forEach((pos, idx) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(...pos);

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      wheelGroup.add(rim);

      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(pos[0] > 0 ? -0.05 : 0.05, wheelRadius * 0.12, 0);
      wheelGroup.add(caliper);

      if (idx === 0) {
        this._registerPart("rines", "Rines Deportivos", rim);
        this._registerPart("calipers", "Calipers de Freno", caliper);
      }

      this.carGroup.add(wheelGroup);
    });
  }

  _registerPart(partId, label, mesh) {
    mesh.name = partId;
    mesh.userData = { partId, label };
    this.partsMeshes.set(partId, mesh);
    this.partsMaterials.set(partId, mesh.material);
    this.carGroup.add(mesh);
  }

  setPartColor(partId, hexColor, finish = "metallic") {
    if (!window.THREE) return;
    const isGlobal = (partId === "global" || partId === "carroceria");
    const isMetallic = finish === "metallic";
    const isPearl = finish === "pearl";
    const isMatte = finish === "matte";

    const updateMat = (mat) => {
      if (!mat || !mat.color) return;
      mat.color.set(hexColor);
      mat.metalness = isMetallic ? 0.82 : isPearl ? 0.6 : isMatte ? 0.05 : 0.15;
      mat.roughness = isMatte ? 0.65 : isMetallic ? 0.22 : 0.18;
      mat.clearcoat = isMatte ? 0.0 : 0.95;
      mat.clearcoatRoughness = isMatte ? 0.0 : 0.08;
      mat.needsUpdate = true;
    };

    if (isGlobal) {
      for (const [pid, mesh] of this.partsMeshes.entries()) {
        if (pid !== "vidrios" && pid !== "rines" && pid !== "calipers" && pid !== "parrilla") {
          updateMat(mesh.material);
        }
      }
    } else {
      const mesh = this.partsMeshes.get(partId);
      if (mesh) {
        updateMat(mesh.material);
      }
    }
  }

  applyDecalToPart(partId, imageElement, options = {}) {
    if (!window.THREE) return;
    const THREE = window.THREE;
    const mesh = this.partsMeshes.get(partId) || this.partsMeshes.get("puerta_del_izq");
    if (!mesh) return;

    const texture = new THREE.Texture(imageElement);
    texture.needsUpdate = true;
    this.decalTexture = texture;

    if (this.activeDecalMesh) {
      this.scene.remove(this.activeDecalMesh);
      if (this.activeDecalMesh.geometry) this.activeDecalMesh.geometry.dispose();
      this.activeDecalMesh = null;
    }

    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const decalW = size.z > size.x ? size.z * 0.75 : size.x * 0.75;
    const decalH = size.y * 0.75;
    const decalGeo = new THREE.PlaneGeometry(decalW, decalH, 20, 16);
    const pos = decalGeo.attributes.position;
    const curvatureStrength = options.curvatureAdapt !== undefined ? options.curvatureAdapt : 0.035;
    
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) / decalW) * 2;
      pos.setZ(i, -(u * u) * curvatureStrength * decalW);
    }
    decalGeo.computeVertexNormals();

    const decalMat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: options.opacity || 1.0,
      roughness: options.finish === "matte" ? 0.6 : 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide
    });

    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    if (partId.includes("izq")) {
      decalMesh.rotation.y = -Math.PI / 2;
      decalMesh.position.set(center.x - 0.065, center.y, center.z);
    } else if (partId.includes("der")) {
      decalMesh.rotation.y = Math.PI / 2;
      decalMesh.position.set(center.x + 0.065, center.y, center.z);
    } else if (partId === "cofre") {
      decalMesh.rotation.x = -Math.PI / 2 + 0.12;
      decalMesh.position.set(center.x, center.y + 0.055, center.z);
    } else {
      decalMesh.rotation.y = -Math.PI / 2;
      decalMesh.position.set(center.x - 0.065, center.y, center.z);
    }

    this.activeDecalMesh = decalMesh;
    this.scene.add(decalMesh);
  }

  setDecalOpacity(val) {
    if (this.activeDecalMesh && this.activeDecalMesh.material) {
      this.activeDecalMesh.material.opacity = Math.max(0, Math.min(1, val));
      this.activeDecalMesh.material.needsUpdate = true;
    }
  }

  setDecalCurvature(curvatureVal) {
    if (!this.activeDecalMesh) return;
    const geo = this.activeDecalMesh.geometry;
    const pos = geo.attributes.position;
    const strength = curvatureVal * 0.001;

    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      pos.setZ(i, -(u * u) * strength);
    }
    geo.computeVertexNormals();
    geo.attributes.position.needsUpdate = true;
  }

  _bindEvents() {
    if (!this.renderer || !this.renderer.domElement) return;
    const el = this.renderer.domElement;

    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this._checkRaycastHover();
    });

    el.addEventListener("click", () => {
      if (this.hoveredPart) {
        this.selectedPartId = this.hoveredPart.userData.partId;
        if (this.onPartSelected) {
          this.onPartSelected(this.selectedPartId, this.hoveredPart.userData.label);
        }
      }
    });

    window.addEventListener("resize", () => this.onResize());
  }

  _checkRaycastHover() {
    if (!this.raycaster || !this.camera) return;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Array.from(this.partsMeshes.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (this.hoveredPart !== hit) {
        this._clearHover();
        this.hoveredPart = hit;
        if (hit.material && hit.material.emissive) {
          hit.material.emissive.set(0x4A6B8A);
          hit.material.emissiveIntensity = 0.35;
        }
        if (this.onPartHovered) {
          this.onPartHovered(hit.userData.partId, hit.userData.label);
        }
      }
    } else {
      this._clearHover();
    }
  }

  _clearHover() {
    if (this.hoveredPart) {
      if (this.hoveredPart.material && this.hoveredPart.material.emissive) {
        this.hoveredPart.material.emissive.set(0x000000);
        this.hoveredPart.material.emissiveIntensity = 0;
      }
      this.hoveredPart = null;
    }
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    if (this.controls && this.controls.update) {
      this.controls.update();
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
