/**
 * El Rayo AutoDesign Studio — Motor 3D Paramétrico y Proyección de Superficie
 * 
 * Funcionalidades:
 * - Genera geometrías 3D automotrices segmentadas por piezas reales:
 *   (Cofre, Toldo, Puertas, Fascias, Salpicaderas, Batea de Camioneta, Rines, Calipers, Vidrios, Espejos)
 * - Soporte para tipos de vehículo: Camioneta Pickup (con batea), Sedán, Deportivo / Coupé, SUV
 * - Materiales PBR con fidelidad física (Metálico, Perlado, Gloss, Mate Satinado, Clearcoat)
 * - Raycaster interactivo: Selección y hover de piezas directamente en 3D
 * - Adaptación de Calcas y Vinilos a la curvatura 3D de la lámina (Surface-conformal Decal)
 */

export class Car3DEngine {
  constructor(canvasContainer, options = {}) {
    this.container = canvasContainer;
    this.options = options;
    this.vehicleType = options.vehicleType || "pickup"; // "pickup" | "coupe" | "sedan" | "suv"
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.carGroup = new THREE.Group();
    
    // Mapeo de piezas 3D: partId -> THREE.Mesh
    this.partsMeshes = new Map();
    this.partsMaterials = new Map();
    this.hoveredPart = null;
    this.selectedPartId = null;
    
    // Decal Mesh activo proyectado en la carrocería
    this.activeDecalMesh = null;
    this.decalTexture = null;
    this.decalSettings = {
      opacity: 1.0,
      scale: 1.0,
      finish: "gloss",
      curvatureAdapt: 0.8
    };

    // Callback de interacción
    this.onPartSelected = options.onPartSelected || null;
    this.onPartHovered = options.onPartHovered || null;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 500;

    // 1. Escena
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0B0D11);
    this.scene.fog = new THREE.FogExp2(0x0B0D11, 0.025);

    // 2. Cámara
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(4.8, 2.2, 5.2);

    // 3. Renderer con Antialiasing y ToneMapping PBR
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls con límites ergonómicos
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // No pasar por debajo del suelo
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 12.0;
    this.controls.target.set(0, 0.6, 0);

    // 5. Iluminación de Estudio Showroom Chevrolet
    this._setupLighting();

    // 6. Plataforma / Suelo de Showroom con retícula CAD
    this._setupStudioFloor();

    // 7. Construir vehículo paramétrico
    this.scene.add(this.carGroup);
    this.rebuildVehicle(this.vehicleType);

    // 8. Eventos de interacción
    this._bindEvents();

    // 9. Loop de renderizado
    this._animate();
  }

  _setupLighting() {
    // Luz ambiental suave para sombras naturales
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    // Luz principal de estudio superior (Key Light suave)
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
    keyLight.position.set(5, 7, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Luz de relleno lateral (Fill Light azulada/titanio)
    const fillLight = new THREE.DirectionalLight(0xaaccee, 0.8);
    fillLight.position.set(-6, 3, -4);
    this.scene.add(fillLight);

    // Luces de acento cálidas estilo showroom Chevrolet
    const rimLight = new THREE.DirectionalLight(0xCD9E4A, 0.6);
    rimLight.position.set(0, 4, -6);
    this.scene.add(rimLight);
  }

  _setupStudioFloor() {
    // Suelo reflectivo oscuro
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0D0F14,
      roughness: 0.45,
      metalness: 0.2
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Retícula circular concéntrica CAD
    const gridHelper = new THREE.PolarGridHelper(7, 16, 8, 64, 0xCD9E4A, 0x1E2430);
    gridHelper.position.y = 0.005;
    this.scene.add(gridHelper);
  }

  /**
   * Construye la carrocería en 3D descomponiendo cada pieza física:
   * Cofre, Toldo, Puertas, Salpicaderas, Fascias, Batea (Pickups), Rines, Calipers, Vidrios.
   */
  rebuildVehicle(type = "pickup", defaultColor = "#D0131F", defaultFinish = "metallic") {
    this.vehicleType = type;
    
    // Limpiar piezas anteriores
    while (this.carGroup.children.length > 0) {
      const obj = this.carGroup.children[0];
      this.carGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    this.partsMeshes.clear();
    this.partsMaterials.clear();

    const isPickup = (type === "pickup");
    const isCoupe = (type === "coupe");

    // Dimensiones proporcionales según tipo
    const length = isPickup ? 4.6 : isCoupe ? 4.1 : 4.4;
    const width = isPickup ? 1.95 : isCoupe ? 1.85 : 1.85;
    const bodyHeight = isPickup ? 0.95 : isCoupe ? 0.75 : 0.85;
    const groundClearance = isPickup ? 0.38 : isCoupe ? 0.22 : 0.28;

    // 1. MATERIAL BASE DE PINTURA (PBR)
    const createPaintMaterial = (colorHex, finish = defaultFinish) => {
      const isMetallic = finish === "metallic";
      const isPearl = finish === "pearl";
      const isMatte = finish === "matte";

      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(colorHex),
        metalness: isMetallic ? 0.85 : isPearl ? 0.65 : isMatte ? 0.05 : 0.15,
        roughness: isMatte ? 0.65 : isMetallic ? 0.22 : 0.18,
        clearcoat: isMatte ? 0.0 : 0.95,
        clearcoatRoughness: isMatte ? 0.0 : 0.08,
        reflectivity: 0.9,
        envMapIntensity: 1.2
      });
    };

    // 2. PIEZA: COFRE (Hood)
    const hoodGeo = new THREE.BoxGeometry(width * 0.88, 0.1, length * 0.32);
    // Moldear curvatura frontal del cofre
    const hoodPos = hoodGeo.attributes.position;
    for (let i = 0; i < hoodPos.count; i++) {
      const z = hoodPos.getZ(i);
      const x = hoodPos.getX(i);
      if (z > 0) {
        hoodPos.setY(i, hoodPos.getY(i) - 0.08); // caída frontal
      }
      hoodPos.setY(i, hoodPos.getY(i) + (1.0 - (Math.abs(x) / (width * 0.44))) * 0.05); // bulto deportivo central
    }
    hoodGeo.computeVertexNormals();

    const hoodMesh = new THREE.Mesh(hoodGeo, createPaintMaterial(defaultColor));
    hoodMesh.position.set(0, groundClearance + bodyHeight * 0.68, length * 0.25);
    hoodMesh.castShadow = true;
    hoodMesh.receiveShadow = true;
    this._registerPart("cofre", "Cofre (Hood)", hoodMesh);

    // 3. PIEZA: TOLDO / CABINA (Roof)
    const roofLen = isPickup ? length * 0.35 : isCoupe ? length * 0.42 : length * 0.45;
    const roofGeo = new THREE.BoxGeometry(width * 0.78, 0.08, roofLen);
    const roofPos = roofGeo.attributes.position;
    for (let i = 0; i < roofPos.count; i++) {
      const x = roofPos.getX(i);
      roofPos.setY(i, roofPos.getY(i) + (1.0 - (Math.abs(x) / (width * 0.39))) * 0.04);
    }
    roofGeo.computeVertexNormals();

    const roofMesh = new THREE.Mesh(roofGeo, createPaintMaterial(defaultColor));
    roofMesh.position.set(0, groundClearance + bodyHeight * 1.28, isPickup ? -length * 0.05 : 0);
    roofMesh.castShadow = true;
    this._registerPart("toldo", "Toldo (Roof)", roofMesh);

    // 4. PIEZA: PUERTAS DELANTERAS (Left & Right)
    const doorLen = length * 0.26;
    const doorH = bodyHeight * 0.65;
    const doorGeoL = new THREE.BoxGeometry(0.12, doorH, doorLen);
    const doorMeshL = new THREE.Mesh(doorGeoL, createPaintMaterial(defaultColor));
    doorMeshL.position.set(-width * 0.44, groundClearance + doorH * 0.55, length * 0.06);
    doorMeshL.castShadow = true;
    this._registerPart("puerta_del_izq", "Puerta Delantera Izquierda", doorMeshL);

    const doorGeoR = new THREE.BoxGeometry(0.12, doorH, doorLen);
    const doorMeshR = new THREE.Mesh(doorGeoR, createPaintMaterial(defaultColor));
    doorMeshR.position.set(width * 0.44, groundClearance + doorH * 0.55, length * 0.06);
    doorMeshR.castShadow = true;
    this._registerPart("puerta_del_der", "Puerta Delantera Derecha", doorMeshR);

    // 5. PIEZAS TRASERAS: BATEA (Camioneta Pickup) O CAJUELA / PUERTAS TRASERAS (Carro)
    if (isPickup) {
      // Batea de Camioneta con costados y compuerta trasera abatible
      const bedLen = length * 0.42;
      const bedGeoL = new THREE.BoxGeometry(0.12, bodyHeight * 0.62, bedLen);
      const bedMeshL = new THREE.Mesh(bedGeoL, createPaintMaterial(defaultColor));
      bedMeshL.position.set(-width * 0.44, groundClearance + bodyHeight * 0.31, -length * 0.28);
      bedMeshL.castShadow = true;
      this._registerPart("batea_izq", "Batea Costado Izq", bedMeshL);

      const bedGeoR = new THREE.BoxGeometry(0.12, bodyHeight * 0.62, bedLen);
      const bedMeshR = new THREE.Mesh(bedGeoR, createPaintMaterial(defaultColor));
      bedMeshR.position.set(width * 0.44, groundClearance + bodyHeight * 0.31, -length * 0.28);
      bedMeshR.castShadow = true;
      this._registerPart("batea_der", "Batea Costado Der", bedMeshR);

      // Compuerta Trasera de la Batea
      const tailGateGeo = new THREE.BoxGeometry(width * 0.86, bodyHeight * 0.62, 0.1);
      const tailGateMesh = new THREE.Mesh(tailGateGeo, createPaintMaterial(defaultColor));
      tailGateMesh.position.set(0, groundClearance + bodyHeight * 0.31, -length * 0.48);
      tailGateMesh.castShadow = true;
      this._registerPart("cajuela", "Compuerta Trasera (Batea)", tailGateMesh);

      // Piso interior de batea (revestimiento protector negro)
      const bedFloorGeo = new THREE.BoxGeometry(width * 0.76, 0.08, bedLen * 0.95);
      const bedFloorMat = new THREE.MeshStandardMaterial({ color: 0x18181A, roughness: 0.85 });
      const bedFloorMesh = new THREE.Mesh(bedFloorGeo, bedFloorMat);
      bedFloorMesh.position.set(0, groundClearance + 0.05, -length * 0.28);
      this.carGroup.add(bedFloorMesh);

    } else {
      // Puertas traseras para Sedán
      if (!isCoupe) {
        const doorGeoRL = new THREE.BoxGeometry(0.12, doorH, doorLen * 0.85);
        const doorMeshRL = new THREE.Mesh(doorGeoRL, createPaintMaterial(defaultColor));
        doorMeshRL.position.set(-width * 0.44, groundClearance + doorH * 0.55, -length * 0.16);
        this._registerPart("puerta_tras_izq", "Puerta Trasera Izquierda", doorMeshRL);

        const doorGeoRR = new THREE.BoxGeometry(0.12, doorH, doorLen * 0.85);
        const doorMeshRR = new THREE.Mesh(doorGeoRR, createPaintMaterial(defaultColor));
        doorMeshRR.position.set(width * 0.44, groundClearance + doorH * 0.55, -length * 0.16);
        this._registerPart("puerta_tras_der", "Puerta Trasera Derecha", doorMeshRR);
      }

      // Cajuela
      const trunkLen = isCoupe ? length * 0.22 : length * 0.26;
      const trunkGeo = new THREE.BoxGeometry(width * 0.82, 0.1, trunkLen);
      const trunkMesh = new THREE.Mesh(trunkGeo, createPaintMaterial(defaultColor));
      trunkMesh.position.set(0, groundClearance + bodyHeight * 0.65, -length * 0.36);
      trunkMesh.castShadow = true;
      this._registerPart("cajuela", "Cajuela (Trunk)", trunkMesh);
    }

    // 6. PIEZA: SALPICADERAS / CANTONERAS (Fenders)
    const fenderGeoFL = new THREE.BoxGeometry(0.14, bodyHeight * 0.55, length * 0.22);
    const fenderMeshFL = new THREE.Mesh(fenderGeoFL, createPaintMaterial(defaultColor));
    fenderMeshFL.position.set(-width * 0.45, groundClearance + bodyHeight * 0.35, length * 0.32);
    this._registerPart("salpicadera_del_izq", "Salpicadera Del. Izq", fenderMeshFL);

    const fenderGeoFR = new THREE.BoxGeometry(0.14, bodyHeight * 0.55, length * 0.22);
    const fenderMeshFR = new THREE.Mesh(fenderGeoFR, createPaintMaterial(defaultColor));
    fenderMeshFR.position.set(width * 0.45, groundClearance + bodyHeight * 0.35, length * 0.32);
    this._registerPart("salpicadera_del_der", "Salpicadera Del. Der", fenderMeshFR);

    // 7. PIEZA: FASCIA DELANTERA & PARRILLA
    const frontBumperGeo = new THREE.BoxGeometry(width * 0.92, bodyHeight * 0.45, 0.28);
    const frontBumperMesh = new THREE.Mesh(frontBumperGeo, createPaintMaterial(defaultColor));
    frontBumperMesh.position.set(0, groundClearance + bodyHeight * 0.25, length * 0.46);
    frontBumperMesh.castShadow = true;
    this._registerPart("fascia_del", "Fascia Delantera", frontBumperMesh);

    // Parrilla de Panal de Abeja (Grille)
    const grillGeo = new THREE.BoxGeometry(width * 0.65, bodyHeight * 0.22, 0.05);
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.6, metalness: 0.4 });
    const grillMesh = new THREE.Mesh(grillGeo, grillMat);
    grillMesh.position.set(0, groundClearance + bodyHeight * 0.24, length * 0.47 + 0.14);
    this._registerPart("parrilla", "Parrilla Frontal", grillMesh);

    // 8. PIEZA: FASCIA TRASERA
    const rearBumperGeo = new THREE.BoxGeometry(width * 0.92, bodyHeight * 0.45, 0.25);
    const rearBumperMesh = new THREE.Mesh(rearBumperGeo, createPaintMaterial(defaultColor));
    rearBumperMesh.position.set(0, groundClearance + bodyHeight * 0.25, -length * 0.48);
    rearBumperMesh.castShadow = true;
    this._registerPart("fascia_tras", "Fascia Trasera", rearBumperMesh);

    // 9. PIEZA: VIDRIOS / CRISTALES (Polarizado con transparencia física)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x050810,
      transmission: 0.85,
      opacity: 1.0,
      transparent: true,
      roughness: 0.05,
      ior: 1.52,
      reflectivity: 0.95
    });

    // Parabrisas Frontal inclinado
    const windshieldGeo = new THREE.BoxGeometry(width * 0.74, 0.04, length * 0.22);
    windshieldGeo.rotateX(Math.PI / 4.2);
    const windshieldMesh = new THREE.Mesh(windshieldGeo, glassMat);
    windshieldMesh.position.set(0, groundClearance + bodyHeight * 1.05, isPickup ? length * 0.12 : length * 0.16);
    this._registerPart("vidrios", "Cristales / Parabrisas", windshieldMesh);

    // 10. PIEZA: ESPEJOS RETROVISORES
    const mirrorGeoL = new THREE.BoxGeometry(0.22, 0.12, 0.14);
    const mirrorMeshL = new THREE.Mesh(mirrorGeoL, createPaintMaterial(defaultColor));
    mirrorMeshL.position.set(-width * 0.54, groundClearance + bodyHeight * 0.95, length * 0.14);
    this._registerPart("espejos", "Espejos Laterales", mirrorMeshL);

    const mirrorGeoR = new THREE.BoxGeometry(0.22, 0.12, 0.14);
    const mirrorMeshR = new THREE.Mesh(mirrorGeoR, createPaintMaterial(defaultColor));
    mirrorMeshR.position.set(width * 0.54, groundClearance + bodyHeight * 0.95, length * 0.14);
    this.carGroup.add(mirrorMeshR);

    // 11. PIEZAS: RINES Y CALIPERS (4 Ruedas completas)
    this._createWheels(width, length, groundClearance, isPickup);

    // Sombra de oclusión ambiental bajo el chasis
    this._createChassisContactShadow(width, length);
  }

  _createWheels(width, length, groundClearance, isPickup) {
    const wheelRadius = isPickup ? 0.42 : 0.36;
    const wheelWidth = 0.28;
    const positions = [
      [-width * 0.48, wheelRadius, length * 0.32],  // Delantera Izq
      [width * 0.48, wheelRadius, length * 0.32],   // Delantera Der
      [-width * 0.48, wheelRadius, -length * 0.32], // Trasera Izq
      [width * 0.48, wheelRadius, -length * 0.32]   // Trasera Der
    ];

    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 32);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181B, roughness: 0.85 });

    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.68, wheelRadius * 0.68, wheelWidth * 1.02, 24);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, metalness: 0.92, roughness: 0.18 });

    const caliperGeo = new THREE.BoxGeometry(0.14, wheelRadius * 0.38, 0.12);
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xD32323, roughness: 0.25 }); // Brembo Red

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

  _createChassisContactShadow(width, length) {
    const shadowGeo = new THREE.PlaneGeometry(width * 1.25, length * 1.15);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    this.carGroup.add(shadowMesh);
  }

  _registerPart(partId, label, mesh) {
    mesh.name = partId;
    mesh.userData = { partId, label };
    this.partsMeshes.set(partId, mesh);
    this.partsMaterials.set(partId, mesh.material);
    this.carGroup.add(mesh);
  }

  /**
   * Cambia el color y acabado de una pieza específica o de toda la carrocería en 3D.
   */
  setPartColor(partId, hexColor, finish = "metallic") {
    const isGlobal = (partId === "global" || partId === "carroceria");
    const isMetallic = finish === "metallic";
    const isPearl = finish === "pearl";
    const isMatte = finish === "matte";

    const updateMat = (mat) => {
      if (!mat || !mat.color) return;
      mat.color.set(hexColor);
      mat.metalness = isMetallic ? 0.85 : isPearl ? 0.65 : isMatte ? 0.05 : 0.15;
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

  /**
   * ADAPTACIÓN DE CALCAS Y VINILOS 3D A LA CURVATURA DE LA LÁMINA:
   * Proyecta el gráfico sobre la superficie de la pieza seleccionada (Cofre, Puerta, etc.)
   * abrazando la curvatura y normales de la carrocería en lugar de verse plano.
   */
  applyDecalToPart(partId, imageElement, options = {}) {
    const mesh = this.partsMeshes.get(partId) || this.partsMeshes.get("puerta_del_izq");
    if (!mesh) return;

    // Crear textura THREE a partir de la imagen cargada
    const texture = new THREE.Texture(imageElement);
    texture.needsUpdate = true;
    this.decalTexture = texture;

    // Remover calca previa si existe
    if (this.activeDecalMesh) {
      this.scene.remove(this.activeDecalMesh);
      if (this.activeDecalMesh.geometry) this.activeDecalMesh.geometry.dispose();
      this.activeDecalMesh = null;
    }

    // Dimensiones y orientación según la pieza anclada
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Geometría curva subdividida (Curved Conformal Decal Geometry)
    const decalW = size.z > size.x ? size.z * 0.75 : size.x * 0.75;
    const decalH = size.y * 0.75;
    const segmentsX = 24;
    const segmentsY = 16;
    const decalGeo = new THREE.PlaneGeometry(decalW, decalH, segmentsX, segmentsY);

    // Ajustar vértices a la curvatura normal de la pieza
    const pos = decalGeo.attributes.position;
    const curvatureStrength = options.curvatureAdapt !== undefined ? options.curvatureAdapt : 0.035;
    
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) / decalW) * 2; // -1 .. 1
      const v = (pos.getY(i) / decalH) * 2;
      // Abrazar la curva de la lámina (curvatura parabólica suave)
      const offsetZ = -(u * u) * curvatureStrength * decalW;
      pos.setZ(i, pos.getZ(i) + offsetZ);
    }
    decalGeo.computeVertexNormals();

    // Material de calca PBR (refleja la luz igual que la pintura del carro)
    const decalMat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: options.opacity || 1.0,
      roughness: options.finish === "matte" ? 0.6 : 0.15,
      metalness: options.finish === "metallic" ? 0.7 : 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide
    });

    const decalMesh = new THREE.Mesh(decalGeo, decalMat);

    // Posicionar pegada a la cara exterior de la pieza
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
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Array.from(this.partsMeshes.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (this.hoveredPart !== hit) {
        this._clearHover();
        this.hoveredPart = hit;
        if (hit.material && hit.material.emissive) {
          hit.material.emissive.set(0xCD9E4A); // Resaltado en Oro Chevrolet
          hit.material.emissiveIntensity = 0.28;
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
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
