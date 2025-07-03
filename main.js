// =================================================================
// 3D Gyroscope Racing Game - Main Logic (No-Audio Pure Version)
// =================================================================

// --- 基本设置 ---
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

// --- 资源获取 ---
// 音频资源获取已移除
const ui = {
    speed: document.getElementById('speed-display'), lap: document.getElementById('lap-display'),
    time: document.getElementById('time-display'), startScreen: document.getElementById('start-screen'),
    gameOverScreen: document.getElementById('game-over-screen'), finalTime: document.getElementById('final-time'),
    startButton: document.getElementById('start-button'), restartButton: document.getElementById('restart-button'),
    accelButton: document.getElementById('accelerate-button'), brakeButton: document.getElementById('brake-button'),
};

// --- 游戏状态 ---
let vehicle, carBody, chassisMesh;
let obstacles = [];
let gameState = { isGameRunning: false, lap: 0, totalLaps: 3, startTime: 0, steeringValue: 0, justPassedFinishLine: false };

// --- 主程序入口 ---
init();

function init() {
    setupLights();
    createGround();
    createTrack();
    createVehicle();
    setupControls();
}

// --- 场景与物体创建 ---
function setupLights() { /* ... 内容同前一版本，为简洁省略 ... */ 
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1); dirLight.position.set(50, 50, 50);
    dirLight.castShadow = true; dirLight.shadow.mapSize.set(2048, 2048); scene.add(dirLight);
}
function createGround() { /* ... 内容同前一版本，为简洁省略 ... */
    const groundGeo = new THREE.PlaneGeometry(500, 500); const groundMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat); groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true; scene.add(groundMesh);
    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(groundBody);
}
function createTrack() { /* ... 内容同前一版本，为简洁省略 ... */
    const trackRadius = 60, trackWidth = 10;
    const trackShape = new THREE.Shape(); trackShape.absarc(0, 0, trackRadius + trackWidth / 2, 0, Math.PI * 2, false);
    const holePath = new THREE.Path(); holePath.absarc(0, 0, trackRadius - trackWidth / 2, 0, Math.PI * 2, true);
    trackShape.holes.push(holePath); const trackGeo = new THREE.ExtrudeGeometry(trackShape, { depth: 0.1, bevelEnabled: false });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.rotation.x = -Math.PI / 2; trackMesh.receiveShadow = true; scene.add(trackMesh);
    for (let i = 0; i < 100; i++) {
        const angle = (i / 100) * Math.PI * 2, wallHeight = 2, wallThickness = 1;
        createWallSegment(10, wallHeight, wallThickness, new THREE.Vector3(Math.cos(angle) * (trackRadius + trackWidth / 2 + wallThickness/2), wallHeight / 2, Math.sin(angle) * (trackRadius + trackWidth / 2 + wallThickness/2)), -angle);
        createWallSegment(8, wallHeight, wallThickness, new THREE.Vector3(Math.cos(angle) * (trackRadius - trackWidth / 2 - wallThickness/2), wallHeight / 2, Math.sin(angle) * (trackRadius - trackWidth / 2 - wallThickness/2)), -angle);
    }
    const finishLineGeo = new THREE.PlaneGeometry(trackWidth, 2); const finishLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const finishLineMesh = new THREE.Mesh(finishLineGeo, finishLineMat); finishLineMesh.position.set(trackRadius, 0.15, 0); finishLineMesh.rotation.set(-Math.PI / 2, -Math.PI / 2, 0); scene.add(finishLineMesh);
    const finishLineBody = new CANNON.Body({ mass: 0, isTrigger: true, shape: new CANNON.Box(new CANNON.Vec3(trackWidth / 2, 2, 0.5)) });
    finishLineBody.position.set(trackRadius, 1, 0); finishLineBody.userData = { type: 'finishLine' }; world.addBody(finishLineBody);
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2; if (Math.abs(angle) < 0.2 || Math.abs(angle - Math.PI * 2) < 0.2) continue;
        const radius = trackRadius + (Math.random() - 0.5) * (trackWidth - 4);
        createObstacle(new CANNON.Vec3(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius));
    }
}
function createWallSegment(w, h, d, pos, rotY) { /* ... 内容同前一版本，为简洁省略 ... */
    const wallGeo = new THREE.BoxGeometry(w, h, d); const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat); wallMesh.position.copy(pos); wallMesh.rotation.y = rotY; wallMesh.castShadow = true; scene.add(wallMesh);
    const wallShape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)); const wallBody = new CANNON.Body({ mass: 0, shape: wallShape });
    wallBody.position.copy(pos); wallBody.quaternion.setFromEuler(0, rotY, 0); world.addBody(wallBody);
}
function createObstacle(pos) { /* ... 内容同前一版本，为简洁省略 ... */
    const size = 1.5; const obsGeo = new THREE.BoxGeometry(size, size, size); const obsMat = new THREE.MeshStandardMaterial({ color: 0xffc107 });
    const obsMesh = new THREE.Mesh(obsGeo, obsMat); obsMesh.castShadow = true; scene.add(obsMesh);
    const obsBody = new CANNON.Body({ mass: 10, shape: new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2)) }); obsBody.position.copy(pos);
    obsBody.userData = { type: 'obstacle' }; world.addBody(obsBody); obstacles.push({ mesh: obsMesh, body: obsBody });
}
function createVehicle() { /* ... 内容同前一版本，为简洁省略 ... */
    chassisMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0xe53935, flatShading: true })); chassisMesh.castShadow = true; scene.add(chassisMesh);
    carBody = new CANNON.Body({ mass: 150, shape: new CANNON.Box(new CANNON.Vec3(0.9, 0.4, 2)) }); carBody.position.set(60, 5, 0);
    carBody.addEventListener('collide', e => { 
        if (!gameState.isGameRunning) return;
        // 碰撞音效已移除
        if ((e.body === carBody ? e.target : e.body).userData?.type === 'finishLine' && !gameState.justPassedFinishLine) {
            handleLapCompletion();
        } 
    });
    vehicle = new CANNON.RigidVehicle({ chassisBody: carBody });
    const wheelOptions = { radius: 0.5, directionLocal: new CANNON.Vec3(0, -1, 0), suspensionStiffness: 30, suspensionRestLength: 0.3, frictionSlip: 5, dampingRelaxation: 2.3, dampingCompression: 4.4, maxSuspensionForce: 100000, rollInfluence: 0.01, axleLocal: new CANNON.Vec3(1, 0, 0), chassisConnectionPointLocal: new CANNON.Vec3(), maxSuspensionTravel: 0.3, customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true };
    wheelOptions.chassisConnectionPointLocal.set(0.75, -0.1, 1.5); vehicle.addWheel(wheelOptions); wheelOptions.chassisConnectionPointLocal.set(-0.75, -0.1, 1.5); vehicle.addWheel(wheelOptions); wheelOptions.chassisConnectionPointLocal.set(0.75, -0.1, -1.5); vehicle.addWheel(wheelOptions); wheelOptions.chassisConnectionPointLocal.set(-0.75, -0.1, -1.5); vehicle.addWheel(wheelOptions);
    vehicle.wheelMeshes = []; const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32); const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    vehicle.wheelInfos.forEach(() => { const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat); wheelMesh.rotation.z = Math.PI / 2; wheelMesh.castShadow = true; scene.add(wheelMesh); vehicle.wheelMeshes.push(wheelMesh); });
    vehicle.addToWorld(world);
}

// --- 控制与交互逻辑 ---
function setupControls() {
    function onDeviceOrientation(event) {
        if (event.gamma === null) return;
        const tilt = Math.max(-45, Math.min(45, event.gamma));
        gameState.steeringValue = gameState.isGameRunning ? tilt / 45 : 0;
    }

    function requestPermissionAndStart() {
        ui.startButton.disabled = true; ui.startButton.textContent = "请稍候...";
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', onDeviceOrientation);
                        startGame();
                    } else {
                        alert('您拒绝了传感器权限，游戏无法开始。\n请刷新页面并点击“允许”。');
                        ui.startButton.disabled = false; ui.startButton.textContent = "重试";
                    }
                })
                .catch(error => {
                    alert('请求传感器权限时发生错误: ' + error.message + '\n您的浏览器可能不支持此功能。');
                    ui.startButton.disabled = false; ui.startButton.textContent = "重试";
                });
        } else {
            window.addEventListener('deviceorientation', onDeviceOrientation);
            startGame();
        }
    }

    ui.accelButton.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.isAccelerating = true; });
    ui.accelButton.addEventListener('touchend', () => { gameState.isAccelerating = false; });
    ui.brakeButton.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.isBraking = true; });
    ui.brakeButton.addEventListener('touchend', () => { gameState.isBraking = false; });
    
    ui.startButton.addEventListener('click', requestPermissionAndStart);
    ui.restartButton.addEventListener('click', () => location.reload());
}

// --- 游戏流程 ---
function startGame() {
    if (gameState.isGameRunning) return;
    ui.startScreen.style.display = 'none';
    gameState.isGameRunning = true;
    gameState.lap = 0;
    gameState.startTime = Date.now();
    // 引擎音效已移除
    animate();
}
function handleLapCompletion() {
    gameState.justPassedFinishLine = true;
    // 圈数音效已移除
    gameState.lap++;
    if (gameState.lap >= gameState.totalLaps) endGame();
    setTimeout(() => { gameState.justPassedFinishLine = false; }, 2000);
}
function endGame() {
    gameState.isGameRunning = false;
    // 引擎音效已移除
    ui.gameOverScreen.style.display = 'flex';
    ui.finalTime.textContent = formatTime(Date.now() - gameState.startTime);
}

// --- 游戏循环与工具函数 ---
const clock = new THREE.Clock();
function animate() {
    if (!gameState.isGameRunning) return;
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    world.step(1 / 60, deltaTime, 3);
    
    vehicle.setSteeringValue(gameState.steeringValue * 0.5, 0);
    vehicle.setSteeringValue(gameState.steeringValue * 0.5, 1);
    const engineForce = gameState.isAccelerating ? -1500 : 0;
    vehicle.applyEngineForce(engineForce, 2);
    vehicle.applyEngineForce(engineForce, 3);
    const brakeForce = gameState.isBraking ? 100 : 0;
    for (let i = 0; i < 4; i++) vehicle.setBrake(brakeForce, i);

    chassisMesh.position.copy(carBody.position);
    chassisMesh.quaternion.copy(carBody.quaternion);
    for (let i = 0; i < 4; i++) {
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
    camera.position.lerp(cameraOffset.clone().applyQuaternion(chassisMesh.quaternion).add(cameraTarget), 0.1);
    camera.lookAt(cameraTarget);
    
    ui.speed.textContent = `速度: ${Math.floor(carBody.velocity.length() * 3.6)} km/h`;
    ui.lap.textContent = `圈数: ${gameState.lap} / ${gameState.totalLaps}`;
    ui.time.textContent = `时间: ${formatTime(Date.now() - gameState.startTime)}`;
    
    renderer.render(scene, camera);
}
function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    const mss = (ms % 1000).toString().padStart(3, '0').substring(0, 2);
    return `${m}:${ss}.${mss}`;
}
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
