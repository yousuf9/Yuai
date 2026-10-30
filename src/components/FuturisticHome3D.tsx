import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

interface FuturisticHome3DProps {
  onOpenChat: () => void;
}

// Pre-allocated math helpers outside render loop to avoid GC pressure
const _dummyObj = new THREE.Object3D();
const _colorTmp = new THREE.Color();

export const FuturisticHome3D: React.FC<FuturisticHome3DProps> = ({
  onOpenChat,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [webglFallback, setWebglFallback] = useState<boolean>(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFallback(true);
      return;
    }

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFallback(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // 2. Scene, Horizon Fog & Studio Environment Reflection (RoomEnvironment)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.028);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(0, 2.15, 6.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.maxDistance = 12;
    controls.minDistance = 3.4;
    controls.maxPolarAngle = Math.PI * 0.53;
    controls.target.set(0, 1.85, 0);
    controls.update();

    // 4. Balanced 3-Point Studio Lighting Rig (Warm Key, Cool Hemisphere Fill, Adani Magenta/Cyan Rim)
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x090d16, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.5);
    keyLight.position.set(5, 8, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const cyanRimLight = new THREE.DirectionalLight(0x0073b1, 2.2);
    cyanRimLight.position.set(-6, 4, -4);
    scene.add(cyanRimLight);

    const magentaRimLight = new THREE.DirectionalLight(0xc8235a, 1.9);
    magentaRimLight.position.set(6, 3, -5);
    scene.add(magentaRimLight);

    // 5. Procedural Radial Grid Floor & Contact Shadow Grounding
    const createGridTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, 512, 512);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.13)';
      ctx.lineWidth = 1.5;
      const step = 32;
      for (let i = 0; i <= 512; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(18, 18);
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    };

    const gridTexture = createGridTexture();
    const floorGeo = new THREE.PlaneGeometry(52, 52);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTexture,
      roughness: 0.78,
      metalness: 0.22,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const createShadowTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
      grad.addColorStop(0.5, 'rgba(123, 50, 148, 0.22)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const contactShadowTex = createShadowTexture();
    const contactShadowGeo = new THREE.PlaneGeometry(6.8, 6.8);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadowMesh.rotation.x = -Math.PI / 2;
    contactShadowMesh.position.y = 0.02;
    scene.add(contactShadowMesh);

    // 6. High-Resolution Adani Cement Logo Texture Builder
    // Draws crisp 3D-shaded Adani Cement emblem and upgrades with the uploaded /assets/aistudio/IMG_2764_c1c67307.png image
    const createAdaniCementEmblemTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d')!;

      const drawEmblem = (uploadedImg?: HTMLImageElement) => {
        ctx.clearRect(0, 0, 1024, 1024);

        // Dark obsidian metallic circular medallion face
        const bgGrad = ctx.createRadialGradient(512, 512, 40, 512, 512, 490);
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(0.75, '#070b14');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.beginPath();
        ctx.arc(512, 512, 490, 0, Math.PI * 2);
        ctx.fill();

        // Outer Adani gradient rim ring
        const rimGrad = ctx.createLinearGradient(60, 512, 964, 512);
        rimGrad.addColorStop(0, '#0073b1');
        rimGrad.addColorStop(0.35, '#3a53a4');
        rimGrad.addColorStop(0.68, '#7b3294');
        rimGrad.addColorStop(1, '#c8235a');

        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(512, 512, 470, 0, Math.PI * 2);
        ctx.stroke();

        // Subtle inner precision ring
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(512, 512, 436, 0, Math.PI * 2);
        ctx.stroke();

        if (uploadedImg) {
          // Process uploaded Adani image on an offscreen canvas to strip white background cleanly
          const off = document.createElement('canvas');
          off.width = uploadedImg.width;
          off.height = uploadedImg.height;
          const offCtx = off.getContext('2d')!;
          offCtx.drawImage(uploadedImg, 0, 0);
          const imgData = offCtx.getImageData(0, 0, off.width, off.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            // Convert near-white background pixels to transparent alpha
            const whiteness = Math.min(r, g, b);
            if (whiteness > 235) {
              d[i + 3] = 0;
            } else if (whiteness > 200) {
              d[i + 3] = Math.round(((235 - whiteness) / 35) * 255);
            }
          }
          offCtx.putImageData(imgData, 0, 0);

          // Draw the transparent-background Adani logo centered in the upper-middle of the medallion
          const targetW = 760;
          const targetH = (uploadedImg.height / uploadedImg.width) * targetW;
          ctx.drawImage(off, (1024 - targetW) / 2, 435 - targetH / 2, targetW, targetH);
        } else {
          // Immediate procedural fallback before image finishes decoding
          ctx.font = '700 210px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = rimGrad;
          ctx.fillText('adani', 512, 435);
        }

        // Draw "CEMENT" below the Adani logo in crisp architectural tracking
        ctx.font = '700 76px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f8fafc';
        ctx.letterSpacing = '18px';
        ctx.fillText('CEMENT', 524, 650);

        // Draw glowing accent bar beneath CEMENT
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.roundRect(332, 718, 360, 10, 5);
        ctx.fill();
      };

      drawEmblem();

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      // Load the user's attached Adani logo from /assets/aistudio/IMG_2764_c1c67307.png
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawEmblem(img);
        tex.needsUpdate = true;
      };
      img.src = '/assets/aistudio/IMG_2764_c1c67307.png';

      return tex;
    };

    // 7. Create 3D Floating Name Logo Texture ("YUAI" + "ADANI CEMENT")
    const create3DNamePlateTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, 1024, 256);

      // Sleek pill-shaped metallic glass plate
      const plateGrad = ctx.createLinearGradient(0, 0, 1024, 0);
      plateGrad.addColorStop(0, 'rgba(0, 115, 177, 0.22)');
      plateGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.92)');
      plateGrad.addColorStop(1, 'rgba(200, 35, 90, 0.22)');

      ctx.fillStyle = plateGrad;
      ctx.beginPath();
      ctx.roundRect(16, 16, 992, 224, 112);
      ctx.fill();

      const borderGrad = ctx.createLinearGradient(16, 0, 1008, 0);
      borderGrad.addColorStop(0, '#0073b1');
      borderGrad.addColorStop(0.5, '#38bdf8');
      borderGrad.addColorStop(1, '#c8235a');
      ctx.strokeStyle = borderGrad;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(16, 16, 992, 224, 112);
      ctx.stroke();

      ctx.font = '700 108px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('YUAI', 512, 112);

      ctx.font = '600 30px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('ADANI CEMENT INTELLIGENCE', 512, 188);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    };

    const adaniEmblemTex = createAdaniCementEmblemTexture();
    const namePlateTex = create3DNamePlateTexture();

    // 8. Materials Library
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.45,
      roughness: 0.68,
    });

    const brushedTitaniumMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.92,
      roughness: 0.16,
      anisotropy: 0.8,
      clearcoat: 0.5,
    });

    const adaniBlueAccentMat = new THREE.MeshStandardMaterial({
      color: 0x0073b1,
      emissive: 0x004a75,
      emissiveIntensity: 0.45,
      metalness: 0.75,
      roughness: 0.35,
    });

    const adaniMagentaAccentMat = new THREE.MeshStandardMaterial({
      color: 0xc8235a,
      emissive: 0x7b1fa2,
      emissiveIntensity: 0.45,
      metalness: 0.75,
      roughness: 0.35,
    });

    // Optical Crystal Ball Material (Outer Sphere)
    const crystalBallMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      metalness: 0.05,
      roughness: 0.04,
      transmission: isSoftwareGl ? 0 : 0.94,
      transparent: true,
      opacity: isSoftwareGl ? 0.32 : 1.0,
      ior: 1.52,
      thickness: 1.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      depthWrite: false,
    });

    const emblemFaceMat = new THREE.MeshStandardMaterial({
      map: adaniEmblemTex,
      roughness: 0.22,
      metalness: 0.35,
      emissive: 0xffffff,
      emissiveMap: adaniEmblemTex,
      emissiveIntensity: 0.28,
    });

    // 9. Composite 3D Hero Group (Pivoted at bottom-center Y = 0)
    const heroGroup = new THREE.Group();
    heroGroup.position.set(0, 0, 0);
    scene.add(heroGroup);

    // Part 1: Stepped Architectural Pedestal Base (LatheGeometry flush at Y=0)
    const lathePoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1.9, 0),
      new THREE.Vector2(1.75, 0.14),
      new THREE.Vector2(1.38, 0.24),
      new THREE.Vector2(1.22, 0.4),
      new THREE.Vector2(0.82, 0.46),
      new THREE.Vector2(0, 0.46),
    ];
    const pedestalGeo = new THREE.LatheGeometry(lathePoints, 48);
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.castShadow = true;
    pedestalMesh.receiveShadow = true;
    heroGroup.add(pedestalMesh);

    // Part 2: Pedestal Glowing Stator Ring
    const statorGeo = new THREE.TorusGeometry(1.42, 0.055, 20, 72);
    const statorMesh = new THREE.Mesh(statorGeo, adaniBlueAccentMat);
    statorMesh.rotation.x = Math.PI / 2;
    statorMesh.position.y = 0.48;
    heroGroup.add(statorMesh);

    // Part 3: Central Ball Assembly (Centered at Y = 1.85)
    const ballAssembly = new THREE.Group();
    ballAssembly.position.y = 1.85;
    heroGroup.add(ballAssembly);

    // Part 4: 3D Rotating Adani Cement Medallion Core INSIDE the Ball
    const adaniCoreGroup = new THREE.Group();
    ballAssembly.add(adaniCoreGroup);

    // Metallic bevelled rim of the internal 3D emblem
    const coreCylinderGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.12, 64);
    coreCylinderGeo.rotateX(Math.PI / 2);
    const coreCylinderMesh = new THREE.Mesh(coreCylinderGeo, brushedTitaniumMat);
    adaniCoreGroup.add(coreCylinderMesh);

    // Outer bevelled halo ring around the internal Adani emblem
    const coreHaloGeo = new THREE.TorusGeometry(0.78, 0.045, 24, 64);
    const coreHaloMesh = new THREE.Mesh(coreHaloGeo, adaniMagentaAccentMat);
    adaniCoreGroup.add(coreHaloMesh);

    // Front & Back Adani Cement Logo Faces inside the ball
    const faceGeo = new THREE.CircleGeometry(0.74, 64);
    const frontFaceMesh = new THREE.Mesh(faceGeo, emblemFaceMat);
    frontFaceMesh.position.z = 0.065;
    adaniCoreGroup.add(frontFaceMesh);

    const backFaceMesh = new THREE.Mesh(faceGeo, emblemFaceMat);
    backFaceMesh.rotation.y = Math.PI;
    backFaceMesh.position.z = -0.065;
    adaniCoreGroup.add(backFaceMesh);

    // Part 5: The Central Transparent 3D Crystal Ball Enclosing the Rotating Adani Cement Logo
    const ballGeo = new THREE.SphereGeometry(1.12, 64, 64);
    const ballMesh = new THREE.Mesh(ballGeo, crystalBallMat);
    ballMesh.renderOrder = 3;
    ballAssembly.add(ballMesh);

    // Subtle wireframe geodesic energy lattice hugging the sphere exterior
    const latticeGeo = new THREE.IcosahedronGeometry(1.15, 2);
    const latticeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const latticeMesh = new THREE.Mesh(latticeGeo, latticeMat);
    latticeMesh.renderOrder = 4;
    ballAssembly.add(latticeMesh);

    // Part 6 & 7: Dual Counter-Rotating Orbital Gimbal Rings around the Ball
    const outerGimbalGeo = new THREE.TorusGeometry(1.42, 0.038, 24, 80);
    const outerGimbalMesh = new THREE.Mesh(outerGimbalGeo, brushedTitaniumMat);
    outerGimbalMesh.castShadow = true;
    ballAssembly.add(outerGimbalMesh);

    const innerGimbalGeo = new THREE.TorusGeometry(1.28, 0.03, 20, 72);
    const innerGimbalMesh = new THREE.Mesh(innerGimbalGeo, adaniBlueAccentMat);
    innerGimbalMesh.rotation.y = Math.PI / 3;
    ballAssembly.add(innerGimbalMesh);

    // Part 8: 6 Extruded Bevelled Tensor Fins orbiting the Ball
    const finShape = new THREE.Shape();
    finShape.moveTo(0, -0.26);
    finShape.lineTo(0.32, -0.14);
    finShape.lineTo(0.36, 0.14);
    finShape.lineTo(0, 0.26);
    finShape.closePath();

    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      steps: 1,
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
    });
    finGeo.center();

    const finsGroup = new THREE.Group();
    ballAssembly.add(finsGroup);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const finMesh = new THREE.Mesh(finGeo, brushedTitaniumMat);
      finMesh.position.set(Math.cos(angle) * 1.62, 0, Math.sin(angle) * 1.62);
      finMesh.rotation.y = -angle;
      finMesh.castShadow = true;
      finsGroup.add(finMesh);
    }

    // Part 9: 3D Extruded Name Logo Crest ("YUAI · ADANI CEMENT") Floating Above the Ball
    const nameLogoGroup = new THREE.Group();
    nameLogoGroup.position.set(0, 3.45, 0);
    heroGroup.add(nameLogoGroup);

    // 3D Bevelled Backing Bar for the 3D Name Logo
    const badgeBackGeo = new THREE.BoxGeometry(2.45, 0.56, 0.08);
    const badgeBackMesh = new THREE.Mesh(badgeBackGeo, brushedTitaniumMat);
    badgeBackMesh.castShadow = true;
    nameLogoGroup.add(badgeBackMesh);

    const badgeRimGeo = new THREE.BoxGeometry(2.51, 0.62, 0.05);
    const badgeRimMesh = new THREE.Mesh(badgeRimGeo, adaniBlueAccentMat);
    badgeRimMesh.position.z = -0.02;
    nameLogoGroup.add(badgeRimMesh);

    const namePlaneGeo = new THREE.PlaneGeometry(2.4, 0.54);
    const namePlaneMat = new THREE.MeshBasicMaterial({
      map: namePlateTex,
      transparent: true,
    });
    const nameFrontMesh = new THREE.Mesh(namePlaneGeo, namePlaneMat);
    nameFrontMesh.position.z = 0.046;
    nameLogoGroup.add(nameFrontMesh);

    const nameBackMesh = new THREE.Mesh(namePlaneGeo, namePlaneMat);
    nameBackMesh.rotation.y = Math.PI;
    nameBackMesh.position.z = -0.05;
    nameLogoGroup.add(nameBackMesh);

    // Part 10: InstancedMesh of 140 Orbital Data Particles in Adani Gradient Colors
    const INSTANCE_COUNT = 140;
    const shardGeo = new THREE.OctahedronGeometry(0.055, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.8,
    });
    const instancedShards = new THREE.InstancedMesh(shardGeo, shardMat, INSTANCE_COUNT);
    instancedShards.frustumCulled = false;

    const shardData: {
      radius: number;
      angle: number;
      yOffset: number;
      speed: number;
      scale: number;
    }[] = [];

    const adaniPalette = [0x0073b1, 0x3a53a4, 0x7b3294, 0xc8235a, 0x38bdf8];

    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const ringIdx = i % 3;
      const radius = 2.05 + ringIdx * 0.6 + (i % 7) * 0.06;
      const angle = (i / INSTANCE_COUNT) * Math.PI * 2 * 3;
      const yOffset = 0.65 + ((i * 19) % 100) / 38;
      const speed = (0.22 + (i % 5) * 0.05) * (ringIdx % 2 === 0 ? 1 : -1);
      const scale = 0.75 + ((i * 23) % 10) * 0.08;

      shardData.push({ radius, angle, yOffset, speed, scale });

      _dummyObj.position.set(Math.cos(angle) * radius, yOffset, Math.sin(angle) * radius);
      _dummyObj.scale.setScalar(scale);
      _dummyObj.updateMatrix();
      instancedShards.setMatrixAt(i, _dummyObj.matrix);

      _colorTmp.setHex(adaniPalette[i % adaniPalette.length]);
      instancedShards.setColorAt(i, _colorTmp);
    }
    instancedShards.instanceMatrix.needsUpdate = true;
    if (instancedShards.instanceColor) instancedShards.instanceColor.needsUpdate = true;
    instancedShards.computeBoundingSphere();
    scene.add(instancedShards);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 10. Render Loop with Software-WebGL Pacing
    let frameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (gl.flush) gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Rotate the Adani Cement 3D emblem continuously inside the center of the crystal ball
      adaniCoreGroup.rotation.y += delta * 0.95;
      adaniCoreGroup.rotation.z = Math.sin(elapsed * 1.2) * 0.08;

      // Subtle counter-rotation of the crystal ball's geodesic energy lattice
      latticeMesh.rotation.y -= delta * 0.22;
      latticeMesh.rotation.x = Math.sin(elapsed * 0.5) * 0.15;

      // Rotate orbital gimbals & tensor fins
      outerGimbalMesh.rotation.z += delta * 0.38;
      outerGimbalMesh.rotation.x = Math.sin(elapsed * 0.7) * 0.32;
      innerGimbalMesh.rotation.x += delta * 0.55;
      innerGimbalMesh.rotation.y -= delta * 0.3;
      finsGroup.rotation.y += delta * 0.25;

      // Gentle levitation & 3D sway of the 3D Name Logo above the sphere
      nameLogoGroup.position.y = 3.45 + Math.sin(elapsed * 1.6) * 0.07;
      nameLogoGroup.rotation.y = Math.sin(elapsed * 0.85) * 0.28;

      // Animate orbital particles
      for (let i = 0; i < INSTANCE_COUNT; i++) {
        const dItem = shardData[i];
        const a = dItem.angle + elapsed * dItem.speed;
        const yWave = dItem.yOffset + Math.sin(elapsed * 1.5 + i * 0.3) * 0.09;
        _dummyObj.position.set(
          Math.cos(a) * dItem.radius,
          yWave,
          Math.sin(a) * dItem.radius
        );
        _dummyObj.rotation.y = -a;
        _dummyObj.rotation.x = elapsed * 0.8;
        _dummyObj.scale.setScalar(dItem.scale);
        _dummyObj.updateMatrix();
        instancedShards.setMatrixAt(i, _dummyObj.matrix);
      }
      instancedShards.instanceMatrix.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const handleResize = () => {
      if (!mount || isDisposed) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      gridTexture.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      contactShadowTex.dispose();
      pedestalGeo.dispose();
      statorGeo.dispose();
      coreCylinderGeo.dispose();
      coreHaloGeo.dispose();
      faceGeo.dispose();
      ballGeo.dispose();
      latticeGeo.dispose();
      latticeMat.dispose();
      outerGimbalGeo.dispose();
      innerGimbalGeo.dispose();
      finGeo.dispose();
      badgeBackGeo.dispose();
      badgeRimGeo.dispose();
      namePlaneGeo.dispose();
      namePlaneMat.dispose();
      shardGeo.dispose();
      shardMat.dispose();
      pedestalMat.dispose();
      brushedTitaniumMat.dispose();
      adaniBlueAccentMat.dispose();
      adaniMagentaAccentMat.dispose();
      crystalBallMat.dispose();
      emblemFaceMat.dispose();
      adaniEmblemTex.dispose();
      namePlateTex.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <section className="relative w-full h-[calc(100vh-65px)] min-h-[620px] bg-[#050811] overflow-hidden select-none">
      {/* Isolated WebGL Canvas Mount Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Fallback if WebGL is unavailable */}
      {webglFallback && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050811] p-6">
          <img
            src="/assets/aistudio/IMG_2764_c1c67307.png"
            alt="Adani Cement"
            referrerPolicy="no-referrer"
            className="w-48 h-auto object-contain mb-4 rounded-xl bg-white p-3"
          />
        </div>
      )}

      {/* Ultra-Clean Futuristic Bottom Overlay: ONLY the Chat Button + Animated "Developed by Yousuf" */}
      <div className="absolute inset-x-0 bottom-7 z-20 flex flex-col items-center justify-end gap-5 pointer-events-none px-4">
        <motion.button
          onClick={onOpenChat}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-auto px-9 py-3.5 rounded-full bg-gradient-to-r from-[#0073b1] via-[#7b3294] to-[#c8235a] text-white font-display font-bold text-sm tracking-wider uppercase shadow-2xl border border-white/25 flex items-center gap-2.5 cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0.65, 1, 0.65],
            y: [0, -3, 0],
          }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="pointer-events-auto text-xs font-display tracking-[0.28em] uppercase bg-gradient-to-r from-sky-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent font-semibold"
        >
          Developed by Yousuf
        </motion.div>
      </div>
    </section>
  );
};
