// --- 基本设置 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 200); // 添加雾效，增加景深感

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // 开启阴影

// --- 物理世界 ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world); // 优化碰撞检测
world.defaultContactMaterial.friction = 0.01; // 全局摩擦力

// --- 音效 ---
const sounds = {
    engine: document.getElementById('audio-engine'),
    skid: document.getElementById('audio-skid'),
    crash: document.getElementById('audio-crash'),
    lap: document.getElementById('audio-lap'),
};

// --- 游戏状态 ---
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

// --- DOM 元素 ---
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

// --- 主函数 ---
init();

function init() {
    setupLights();
    createGround();
    createTrack();
    createVehicle();
    setupControls();
}

// --- 场景搭建 ---
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

    // 创建赛道地面 (视觉)
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

    // 创建物理护栏
    const wallHeight = 2;
    const wallThickness = 1;
    for (let i = 0; i < 100; i++) {
        const angle = (i / 100) * Math.PI * 2;
        // 外护栏
        const outerRadius = trackRadius + trackWidth / 2 + wallThickness / 2;
        const outerX = Math.cos(angle) * outerRadius;
        const outerZ = Math.sin(angle) * outerRadius;
        createWallSegment(10, wallHeight, wallThickness, new THREE.Vector3(outerX, wallHeight / 2, outerZ), -angle);
        // 内护栏
        const innerRadius = trackRadius - trackWidth / 2 - wallThickness / 2;
        const innerX = Math.cos(angle) * innerRadius;
        const innerZ = Math.sin(angle) * innerRadius;
        createWallSegment(8, wallHeight, wallThickness, new THREE.Vector3(innerX, wallHeight / 2, innerZ), -angle);
    }

    // 创建终点线
    const finishLineGeo = new THREE.PlaneGeometry(trackWidth, 2);
    const finishLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const finishLineMesh = new THREE.Mesh(finishLineGeo, finishLineMat);
    finishLineMesh.position.set(trackRadius, 0.15, 0);
    finishLineMesh.rotation.x = -Math.PI / 2;
    finishLineMesh.rotation.y = -Math.PI / 2;
    scene.add(finishLineMesh);
    
    // 创建终点线触发器 (物理)
    const finishLineShape = new CANNON.Box(new CANNON.Vec3(trackWidth / 2, 2, 0.5));
    const finishLineBody = new CANNON.Body({ mass: 0, isTrigger: true, shape: finishLineShape });
    finishLineBody.position.set(trackRadius, 1, 0);
    finishLineBody.userData = { type: 'finishLine' };
    world.addBody(finishLineBody);
    
    // 创建障碍物
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        // 避开终点线附近
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
        const contact = e.contact;
        const impactVelocity = contact.getImpactVelocityAlongNormal();
        
        if (impactVelocity > 2) {
            sounds.crash.currentTime = 0;
            sounds.crash.play();
        }

        const otherBody = e.body === carBody ? e.target : e.body;
        if (otherBody.userData?.type === 'finishLine' && !gameState.justPassedFinishLine) {
            handleLapCompletion();
        }
    });

    vehicle = new CANNON.RigidVehicle({ chassisBody: carBody });
    const wheelOptions = {
        radius: 0.5,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 5,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(),
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,
    };
    
    wheelOptions.chassisConnectionPointLocal.set(0.75, -0.1, 1.5);
    vehicle.addWheel(wheelOptions); // Front Right
    wheelOptions.chassisConnectionPointLocal.set(-0.75, -0.1, 1.5);
    vehicle.addWheel(wheelOptions); // Front Left
    wheelOptions.chassisConnectionPointLocal.set(0.75, -0.1, -1.5);
    vehicle.addWheel(wheelOptions); // Rear Right
    wheelOptions.chassisConnectionPointLocal.set(-0.75, -0.1, -1.5);
    vehicle.addWheel(wheelOptions); // Rear Left

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

// --- 控制逻辑 ---
function setupControls() {
    // 陀螺仪
    function onDeviceOrientation(event) {
        if (event.gamma === null) return;
        const tilt = Math.max(-45, Math.min(45, event.gamma));
        gameState.steeringValue = gameState.isGameRunning ? tilt / 45 : 0;
    }
    
    function requestGyroPermission() {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', onDeviceOrientation);
                        startGame();
                    } else {
                        alert('陀螺仪权限被拒绝，无法进行游戏');
                    }
                })
                .catch(() => alert('请求陀螺仪权限时出错'));
        } else {
            window.addEventListener('deviceorientation', onDeviceOrientation);
            startGame();
        }
    }

    // 触控按钮
    ui.accelButton.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.isAccelerating = true; });
    ui.accelButton.addEventListener('touchend', () => { gameState.isAccelerating = false; });
    ui.brakeButton.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.isBraking = true; sounds.skid.play(); });
    ui.brakeButton.addEventListener('touchend', () => { gameState.isBraking = false; sounds.skid.pause(); sounds.skid.currentTime = 0; });

    // 游戏流程按钮
    ui.startButton.addEventListener('click', requestGyroPermission);
    ui.restartButton.addEventListener('click', resetGame);
}


// --- 游戏流程 ---
function startGame() {
    ui.startScreen.style.display = 'none';
    resetGame();
    gameState.isGameRunning = true;
    gameState.startTime = Date.now();
    gameState.lastLapTime = gameState.startTime;
    
    sounds.engine.play().catch(() => {});
    
    animate();
}

function resetGame() {
    gameState.isGameRunning = false;
    gameState.lap = 0;
    gameState.steeringValue = 0;
    
    // 重置车辆位置和状态
    carBody.position.set(60, 5, 0);
    carBody.quaternion.set(0, 0, 0, 1);
    carBody.velocity.set(0, 0, 0);
    carBody.angularVelocity.set(0, 0, 0);
    
    ui.gameOverScreen.style.display = 'none';
    if (!gameState.isGameRunning) {
       ui.startScreen.style.display = 'flex';
    }
}

function handleLapCompletion() {
    gameState.justPassedFinishLine = true;
    
    sounds.lap.play();

    gameState.lap++;
    const now = Date.now();
    const lapTime = (now - gameState.lastLapTime) / 1000;
    console.log(`Lap ${gameState.lap} finished in ${lapTime.toFixed(2)}s`);
    gameState.lastLapTime = now;

    if (gameState.lap >= gameState.totalLaps) {
        endGame();
    }
    
    // 防止一次碰撞触发多次
    setTimeout(() => {
        gameState.justPassedFinishLine = false;
    }, 2000);
}

function endGame() {
    gameState.isGameRunning = false;
    sounds.engine.pause();
    ui.gameOverScreen.style.display = 'flex';
    const totalTime = (Date.now() - gameState.startTime);
    ui.finalTime.textContent = formatTime(totalTime);
}

// --- 游戏循环 ---
const clock = new THREE.Clock();
function animate() {
    if (gameState.isGameRunning) {
        requestAnimationFrame(animate);
    }
    
    const deltaTime = clock.getDelta();
    world.step(1 / 60, deltaTime, 3);

    // 更新车辆物理
    const maxSteerVal = 0.5;
    const maxForce = 1500;
    const brakeForce = 100;

    vehicle.setSteeringValue(gameState.steeringValue * maxSteerVal, 0);
    vehicle.setSteeringValue(gameState.steeringValue * maxSteerVal, 1);

    const force = gameState.isAccelerating ? maxForce : 0;
    vehicle.applyEngineForce(-force, 2);
    vehicle.applyEngineForce(-force, 3);
    
    if (gameState.isBraking) {
        vehicle.setBrake(brakeForce, 0);
        vehicle.setBrake(brakeForce, 1);
        vehicle.setBrake(brakeForce, 2);
        vehicle.setBrake(brakeForce, 3);
    } else {
        vehicle.setBrake(0, 0);
        vehicle.setBrake(0, 1);
        vehicle.setBrake(0, 2);
        vehicle.setBrake(0, 3);
    }
    
    // 同步视觉模型
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

    // 更新相机
    const cameraOffset = new THREE.Vector3(0, 6, 12);
    const cameraTarget = new THREE.Vector3();
    chassisMesh.getWorldPosition(cameraTarget);
    const cameraPosition = cameraOffset.clone().applyQuaternion(chassisMesh.quaternion).add(cameraTarget);
    camera.position.lerp(cameraPosition, 0.1);
    camera.lookAt(cameraTarget);
    
    // 更新UI
    const speed = carBody.velocity.length() * 3.6; // m/s to km/h
    ui.speed.textContent = `速度: ${Math.floor(speed)} km/h`;
    ui.lap.textContent = `圈数: ${gameState.lap} / ${gameState.totalLaps}`;
    const elapsedTime = Date.now() - gameState.startTime;
    ui.time.textContent = `时间: ${formatTime(elapsedTime)}`;
    
    renderer.render(scene, camera);
}

// --- 工具函数 ---
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