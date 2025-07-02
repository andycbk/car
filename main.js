// =================================================================
// 3D Gyroscope Racing Game - Main Logic
// =================================================================

// --- 1. 基本设置 (Three.js & Cannon-es) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.01;

// --- 2. 音效获取 ---
const sounds = {
    engine: document.getElementById('audio-engine'),
    skid: document.getElementById('audio-skid'),
    crash: document.getElementById('audio-crash'),
    lap: document.getElementById('audio-lap'),
};

// --- 3. 游戏状态管理 ---
let vehicle, carBody, chassisMesh;
let obstacles = [];
let gameState = {
    isGameRunning: false,
    lap: 0,
    totalLaps: 3,
    startTime: 0,
    lastLapTime: 0,
    steeringValue: 0,
    isAccelerating: false,
    isBraking: false,
    justPassedFinishLine: false,
};

// --- 4. DOM 元素获取 ---
const ui = {
    speed: document.getElementById('speed-display'),
    lap: document.getElementById('lap-display'),
    time: document.getElementById('time-display'),
    startScreen: document.getElementById('start-screen'),
    gameOverScreen: document.getElementById('game-over-screen'),
    finalTime: document.getElementById('final-time'),
    startButton: document.getElementById('start-button'),
    restartButton: document.getElementById('restart-button'),
    accelButton: document.getElementById('accelerate-button'),
    brakeButton: document.getElementById('brake-button'),
};

// --- 5. 主程序入口 ---
init();

function init() {
    console.log("Game initializing...");
    setupLights();
    createGround();
    createTrack();
    createVehicle();
    setupControls();
    console.log("Initialization complete. Waiting for user to start.");
}

// --- 6. 场景搭建函数 ---
function setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 50, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
}

function createGround() {
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
}

function createTrack() {
    const trackRadius = 60;
    const trackWidth = 10;

    const trackShape = new THREE.Shape();
    trackShape.absarc(0, 0, trackRadius + trackWidth / 2, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, trackRadius - trackWidth / 2, 0, Math.PI * 2, true);
    trackShape.holes.push(holePath);
    const trackGeo = new THREE.ExtrudeGeometry(trackShape, { depth: 0.1, bevelEnabled: false });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    const wallHeight = 2;
    const wallThickness = 1;
    for (let i = 0; i < 100; i++) {
        const angle = (i / 100) * Math.PI * 2;
        const outerRadius = trackRadius + trackWidth / 2 + wallThickness / 2;
        const outerX = Math.cos(angle) * outerRadius;
        const outerZ = Math.sin(angle) * outerRadius;
        createWallSegment(10, wallHeight, wallThickness, new THREE.Vector3(outerX, wallHeight / 2, outerZ), -angle);
        
        const innerRadius = trackRadius - trackWidth / 2 - wallThickness / 2;
        const innerX = Math.cos(angle) * innerRadius;
        const innerZ = Math.sin(angle) * innerRadius;
        createWallSegment(8, wallHeight, wallThickness, new THREE.Vector3(innerX, wallHeight / 2, innerZ), -angle);
    }

    const finishLineGeo = new THREE.PlaneGeometry(trackWidth, 2);
    const finishLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const finishLineMesh = new THREE.Mesh(finishLineGeo, finishLineMat);
    finishLineMesh.position.set(trackRadius, 0.15, 0);
    finishLineMesh.rotation.x = -Math.PI / 2;
    finishLineMesh.rotation.y = -Math.PI / 2;
    scene.add(finishLineMesh);
    
    const finishLineShape = new CANNON.Box(new CANNON.Vec3(trackWidth / 2, 2, 0.5));
    const finishLineBody = new CANNON.Body({ mass: 0, isTrigger: true, shape: finishLineShape });
    finishLineBody.position.set(trackRadius, 1, 0);
    finishLineBody.userData = { type: 'finishLine' };
    world.addBody(finishLineBody);
    
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        if (Math.abs(angle) < 0.2 || Math.abs(angle - Math.PI * 2) < 0.2) continue;
        const radius = trackRadius + (Math.random() - 0.5) * (trackWidth - 4);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        createObstacle(new CANNON.Vec3(x, 0.5, z));
    }
}

function createWallSegment(width, height, depth, position, rotationY) {
    const wallGeo = new THREE.BoxGeometry(width, height, depth);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.copy(position);
    wallMesh.rotation.y = rotationY;
    wallMesh.castShadow = true;
    scene.add(wallMesh);

    const wallShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const wallBody = new CANNON.Body({ mass: 0, shape: wallShape });
    wallBody.position.copy(position);
    wallBody.quaternion.setFromEuler(0, rotationY, 0);
    world.addBody(wallBody);
}

function createObstacle(position) {
    const size = 1.5;
    const obsGeo = new THREE.BoxGeometry(size, size, size);
    const obsMat = new THREE.MeshStandardMaterial({ color: 0xffc107 });
    const obsMesh = new THREE.Mesh(obsGeo, obsMat);
    obsMesh.castShadow = true;
    scene.add(obsMesh);

    const obsShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    const obsBody = new CANNON.Body({ mass: 10, shape: obsShape });
    obsBody.position.copy(position);
    obsBody.userData = { type: 'obstacle' };
    world.addBody(obsBody);

    obstacles.push({ mesh: obsMesh, body: obsBody });
}

function createVehicle() {
    chassisMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.6, 4),
        new THREE.MeshStandardMaterial({ color: 0xe53935, flatShading: true })
    );
    chassisMesh.castShadow = true;
    scene.add(chassisMesh);
    
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.9, 0.4, 2));
    carBody = new CANNON.Body({ mass: 150 });
    carBody.addShape(chassisShape);
    carBody.position.set(60, 5, 0);
    
    carBody.addEventListener('collide', (e) => {
        if (!gameState.isGameRunning) return;
        const impactVelocity = e.contact.getImpactVelocityAlongNormal();
        if (impactVelocity > 2) {
            sounds.crash.currentTime = 0;
            sounds.crash.play().catch(err => console.log("Crash sound failed:", err));
        }
        const otherBody = e.body === carBody ? e.target : e.body;
        if (otherBody.userData?.type === 'finishLine' && !gameState.justPassedFinishLine) {
            handleLapCompletion();
        }
    });

    vehicle = new CANNON.RigidVehicle({ chassisBody: carBody });
    const wheelOptions = {
        radius: 0.5, directionLocal: new CANNON.Vec3(0, -1, 0), suspensionStiffness: 30,
        suspensionRestLength: 0.3, frictionSlip: 5, dampingRelaxation: 2.3, dampingCompression: 4.4,
        maxSuspensionForce: 100000, rollInfluence: 0.01, axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(), maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true,
    };
    
    wheelOptions.chassisConnectionPointLocal.set(0.75, -0.1, 1.5); vehicle.addWheel(wheelOptions);
    wheelOptions.chassisConnectionPointLocal.set(-0.75, -0.1, 1.5); vehicle.addWheel(wheelOptions);
    wheelOptions.chassisConnectionPointLocal.set(0.75, -0.1, -1.5); vehicle.addWheel(wheelOptions);
    wheelOptions.chassisConnectionPointLocal.set(-0.75, -0.1, -1.5); vehicle.addWheel(wheelOptions);

    vehicle.wheelMeshes = [];
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    vehicle.wheelInfos.forEach(wheel => {
        const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
        wheelMesh.rotation.z = Math.PI / 2;
        wheelMesh.castShadow = true;
        scene.add(wheelMesh);
        vehicle.wheelMeshes.push(wheelMesh);
    });

    vehicle.addToWorld(world);
}

// --- 7. 控制与交互逻辑 ---
function setupControls() {
    // 陀螺仪事件处理
    function onDeviceOrientation(event) {
        if (event.gamma === null) return;
        const tilt = Math.max(-45, Math.min(45, event.gamma));
        gameState.steeringValue = gameState.isGameRunning ? tilt / 45 : 0;
    }

    // 点击开始按钮后的核心逻辑
    function requestPermissionAndStart() {
        console.log("DEBUG: Start button clicked. Attempting to start game..."); // 日志1

        // 针对 iOS 13+ 的特殊权限请求
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            console.log("DEBUG: iOS device detected. Requesting permission..."); // 日志2
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    console.log("DEBUG: Permission state received:", permissionState); // 日志3
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', onDeviceOrientation);
                        startGame(); // 权限获取成功，启动游戏
                    } else {
                        alert('陀螺仪权限被拒绝，无法进行游戏。请刷新页面并允许权限。');
                    }
                })
                .catch(error => {
                    console.error("DEBUG: Error requesting device orientation permission:", error); // 日志4
                    alert('请求陀螺仪权限时出错。您的浏览器或设备可能不支持此功能。');
                });
        } else {
            // 对于 Android 或其他不需要主动请求权限的设备
            console.log("DEBUG: Non-iOS device or permission not required. Proceeding directly."); // 日志5
            window.addEventListener('deviceorientation', onDeviceOrientation);
            startGame(); // 直接启动游戏
        }
    }

    // 绑定事件
    ui.accelButton.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.isAccelerating = true; });
    ui.accelButton.addEventListener('touchend', () => { gameState.isAccelerating = false; });
    ui.brakeButton.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.isBraking = true; sounds.skid.play().catch(e => {}); });
    ui.brakeButton.addEventListener('touchend', () => { gameState.isBraking = false; sounds.skid.pause(); sounds.skid.currentTime = 0; });
    
    ui.startButton.addEventListener('click', requestPermissionAndStart);
    ui.restartButton.addEventListener('click', () => location.reload()); // 重新加载页面，最可靠的重启方式
}


// --- 8. 游戏流程管理 ---
function startGame() {
    if (gameState.isGameRunning) return; // 防止重复启动
    console.log("DEBUG: startGame() function called. Hiding start screen."); // 日志6

    ui.startScreen.style.display = 'none';
    
    // 重置游戏状态
    gameState.lap = 0;
    gameState.startTime = Date.now();
    gameState.lastLapTime = gameState.startTime;
    
    gameState.isGameRunning = true; // 设置游戏运行状态
    
    // 播放引擎声并处理可能的错误
    const playPromise = sounds.engine.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error("DEBUG: Engine sound playback failed. Game will continue.", error);
        });
    }
    
    animate(); // 启动游戏循环
}

function handleLapCompletion() {
    gameState.justPassedFinishLine = true;
    
    sounds.lap.play().catch(e => {});

    gameState.lap++;
    const now = Date.now();
    const lapTime = (now - gameState.lastLapTime) / 1000;
    console.log(`Lap ${gameState.lap} finished in ${lapTime.toFixed(2)}s`);
    gameState.lastLapTime = now;

    if (gameState.lap >= gameState.totalLaps) {
        endGame();
    }
    
    setTimeout(() => { gameState.justPassedFinishLine = false; }, 2000); // 2秒冷却，防重复触发
}

function endGame() {
    gameState.isGameRunning = false;
    sounds.engine.pause();
    ui.gameOverScreen.style.display = 'flex';
    const totalTime = (Date.now() - gameState.startTime);
    ui.finalTime.textContent = formatTime(totalTime);
}

// --- 9. 游戏循环 (Game Loop) ---
const clock = new THREE.Clock();
function animate() {
    // 只有游戏在运行时才继续循环
    if (gameState.isGameRunning) {
        requestAnimationFrame(animate);
    } else {
        console.log("DEBUG: Game loop stopped.");
        return;
    }
    
    const deltaTime = clock.getDelta();
    world.step(1 / 60, deltaTime, 3);

    const maxSteerVal = 0.5;
    const maxForce = 1500;
    const brakeForce = 100;

    vehicle.setSteeringValue(gameState.steeringValue * maxSteerVal, 0);
    vehicle.setSteeringValue(gameState.steeringValue * maxSteerVal, 1);

    const force = gameState.isAccelerating ? maxForce : 0;
    vehicle.applyEngineForce(-force, 2);
    vehicle.applyEngineForce(-force, 3);
    
    vehicle.setBrake(gameState.isBraking ? brakeForce : 0, 0);
    vehicle.setBrake(gameState.isBraking ? brakeForce : 0, 1);
    vehicle.setBrake(gameState.isBraking ? brakeForce : 0, 2);
    vehicle.setBrake(gameState.isBraking ? brakeForce : 0, 3);
    
    chassisMesh.position.copy(carBody.position);
    chassisMesh.quaternion.copy(carBody.quaternion);
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        const t = vehicle.wheelInfos[i].worldTransform;
        vehicle.wheelMeshes[i].position.copy(t.position);
        vehicle.wheelMeshes[i].quaternion.copy(t.quaternion);
    }
    obstacles.forEach(obs => {
        obs.mesh.position.copy(obs.body.position);
        obs.mesh.quaternion.copy(obs.body.quaternion);
    });

    const cameraOffset = new THREE.Vector3(0, 6, 12);
    const cameraTarget = new THREE.Vector3();
    chassisMesh.getWorldPosition(cameraTarget);
    const cameraPosition = cameraOffset.clone().applyQuaternion(chassisMesh.quaternion).add(cameraTarget);
    camera.position.lerp(cameraPosition, 0.1);
    camera.lookAt(cameraTarget);
    
    const speed = carBody.velocity.length() * 3.6;
    ui.speed.textContent = `速度: ${Math.floor(speed)} km/h`;
    ui.lap.textContent = `圈数: ${gameState.lap} / ${gameState.totalLaps}`;
    const elapsedTime = Date.now() - gameState.startTime;
    ui.time.textContent = `时间: ${formatTime(elapsedTime)}`;
    
    renderer.render(scene, camera);
}

// --- 10. 工具函数与事件监听 ---
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    const milliseconds = (ms % 1000).toString().padStart(3, '0').substring(0, 2);
    return `${minutes}:${seconds}.${milliseconds}`;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
