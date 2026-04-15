const canvas = document.getElementById('caressCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let center = { x: 0, y: 0 };

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    center.x = width / 2;
    center.y = height / 2;
}
window.addEventListener('resize', resize);
resize();

// --- State ---
let targetZoom = 0.5;
let currentZoom = 0.5;
const MIN_ZOOM = 0;
const MAX_ZOOM = 1;

let satisfactionScore = 0;
const SCORE_INCREASE_RATE = 0.005;
const SCORE_DECREASE_RATE = 0.004;

let touchScore = 0;
const TOUCH_DECREASE_RATE = 0.004;

let isTouching = false;
let touchX = 0, touchY = 0;
let prevTouchX = 0, prevTouchY = 0;
let touchSpeed = 0;

let isClimax = false;
let climaxStartTime = 0;

let typingScore = 0;
const MAX_TYPING_SCORE = 500;
let isPhase5 = false;
let volumeBtnRegistered = false;  // 페이즈3: 볼륨 버튼 등록 여부

const onboardingStartTime = Date.now();
const ONBOARDING_DURATION = 4000;

// --- UI 오버레이 ---
const zoomUI = document.createElement('div');
zoomUI.id = 'zoomUI';
zoomUI.style.cssText = `
    position: fixed; bottom: 26px; left: 50%;
    transform: translateX(-50%);
    background: transparent;
    font-family: 'Noto Sans KR', sans-serif;
    font-size: 12px; font-weight: 300;
    color: rgba(0,0,0,0.35); letter-spacing: 0.08em;
    transition: color 0.5s ease, opacity 0.8s ease;
    z-index: 200; text-align: center;
    pointer-events: none; white-space: nowrap;
    text-shadow: 0 0 14px rgba(235,80,130,0.28);
`;
document.body.appendChild(zoomUI);

const feedbackUI = document.createElement('div');
feedbackUI.id = 'feedbackUI';
feedbackUI.style.cssText = `
    position: fixed; bottom: 52px; left: 50%;
    transform: translateX(-50%);
    background: transparent;
    font-family: 'Noto Sans KR', sans-serif;
    font-size: 13px; font-weight: 300;
    color: rgba(180,40,40,0.8); letter-spacing: 0.06em;
    opacity: 0; transition: opacity 0.5s ease, color 0.4s ease;
    z-index: 200; text-align: center;
    pointer-events: none; white-space: nowrap;
    text-shadow: 0 0 14px rgba(235,80,130,0.28);
`;
document.body.appendChild(feedbackUI);

// --- 핀치/줌 (Phase 1) ---
let initialPinchDistance = null;
let initialZoomAtPinchStart = null;

window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.hypot(dx, dy);
        initialZoomAtPinchStart = targetZoom;
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && initialPinchDistance !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.hypot(dx, dy);
        const delta = (distance - initialPinchDistance) * 0.002;
        targetZoom = initialZoomAtPinchStart + delta;
        targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) initialPinchDistance = null;
});

// --- 터치 쓰다듬기 (Phase 2) ---
function handleTouchStart(e) {
    if (e.touches.length === 1) {
        isTouching = true;
        prevTouchX = touchX = e.touches[0].clientX;
        prevTouchY = touchY = e.touches[0].clientY;
    }
}
function handleTouchMove(e) {
    if (!isTouching || e.touches.length !== 1) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
}
function handleTouchEnd() { isTouching = false; }

window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) handleTouchStart(e);
}, { passive: false });
window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) handleTouchMove(e);
}, { passive: false });
window.addEventListener('touchend', handleTouchEnd);

// --- 진행도 업데이트 ---
function updateTypingProgress() {
    const percent = Math.floor((typingScore / MAX_TYPING_SCORE) * 100);
    const progressEl = document.getElementById('typingProgress');

    let barColor;
    if (percent < 50)      barColor = 'rgba(255,160,160,0.9)';
    else if (percent < 70) barColor = 'rgba(255,120,60,0.9)';
    else                   barColor = 'rgba(220,50,50,0.95)';

    progressEl.innerHTML = `
        <div style="font-family:'Noto Sans KR', sans-serif; font-size:15px; font-weight:300;
                    color:rgba(130,50,70,0.85); letter-spacing:0.12em; margin-bottom:12px;
                    text-shadow: 0 0 12px rgba(235,80,130,0.25);">
            온기 ${percent}%
        </div>
        <div style="width:180px; height:2px; background:rgba(180,100,120,0.2);
                    border-radius:2px; overflow:hidden; margin:0 auto;">
            <div style="width:${percent}%; height:100%; background:${barColor};
                        border-radius:2px; transition:width 0.1s ease, background 0.4s ease;"></div>
        </div>
    `;

    const whiteoutOverlay = document.getElementById('whiteoutOverlay');
    whiteoutOverlay.style.opacity = typingScore >= 350 ? ((typingScore - 350) / 150).toString() : '0';

    if (typingScore >= MAX_TYPING_SCORE && !isPhase5) {
        isPhase5 = true;
        triggerPhase5();
    }
}

// --- 볼륨 버튼 타이핑 점수 (Phase 4) ---
// Android: keydown AudioVolumeUp/Down
// iOS 폴백: 화면 탭
window.addEventListener('keydown', (e) => {
    const typingArea = document.getElementById('typingArea');
    if (!isClimax || typingArea.style.display === 'none') return;
    if (!volumeBtnRegistered) return;

    if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' ||
        e.key === 'VolumeUp'      || e.key === 'VolumeDown') {
        e.preventDefault();
        typingScore++;
        typingScore = Math.min(MAX_TYPING_SCORE, typingScore);
        updateTypingProgress();
    }
});

// ── Phase 5: 카메라 ──
function triggerPhase5() {
    setTimeout(() => {
        const phase5Container = document.getElementById('phase5Container');
        phase5Container.style.display = 'block';
        setTimeout(() => { phase5Container.style.opacity = '1'; }, 50);

        const cameraIntro = document.createElement('div');
        cameraIntro.id = 'cameraIntro';
        cameraIntro.style.cssText = `
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 24px;
            z-index: 10;
        `;
        cameraIntro.innerHTML = `
            <p style="
                font-family:'Noto Sans KR', sans-serif; font-size:17px; font-weight:300;
                color:rgba(130,50,70,0.88); letter-spacing:0.08em;
                text-align:center; line-height:1.9; margin:0;
                text-shadow: 0 0 14px rgba(235,80,130,0.28);
            ">이제 카메라를 사용할게요</p>
            <p style="
                font-family:'Noto Sans KR', sans-serif; font-size:13px; font-weight:300;
                color:rgba(130,50,70,0.55); letter-spacing:0.18em;
                text-align:center; margin:0;
                text-shadow: 0 0 14px rgba(235,80,130,0.22);
            ">당신의 온기도 나눠줘요</p>
            <button id="startCameraBtn" style="
                padding: 11px 34px; border-radius: 999px;
                border: 1px solid rgba(160,80,100,0.35);
                background: transparent;
                color: rgba(130,50,70,0.88);
                font-family: 'Noto Sans KR', sans-serif; font-size: 13px; font-weight: 300;
                letter-spacing: 0.08em; cursor: pointer;
                transition: background 0.2s ease;
            ">시작하기</button>
        `;
        phase5Container.appendChild(cameraIntro);

        document.getElementById('startCameraBtn').addEventListener('click', () => {
            cameraIntro.style.transition = 'opacity 0.5s ease';
            cameraIntro.style.opacity = '0';
            setTimeout(() => cameraIntro.remove(), 500);
            startWebcam(phase5Container);
        });
    }, 2000);
}

function startWebcam(phase5Container) {
    const videoElement = document.getElementById('webcam');
    const proxText = document.getElementById('proximityText');

    videoElement.style.cssText = `
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        transform: scaleX(-1);
        display: block;
    `;

    proxText.style.cssText = `
        display: block;
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Noto Sans KR', sans-serif;
        font-size: 0.9rem; font-weight: 300;
        color: rgba(255,255,255,0.9);
        letter-spacing: 0.12em; text-align: center;
        white-space: nowrap; pointer-events: none;
        z-index: 20; transition: opacity 0.4s ease;
        text-shadow: 0 0 16px rgba(235,80,130,0.4);
    `;

    let noFaceFrames = 0;
    const NO_FACE_THRESHOLD = 30;

    // SVG 원형 카운트다운 바
    const svgNS = 'http://www.w3.org/2000/svg';
    const circleSize = 56, radius = 22;
    const circumference = 2 * Math.PI * radius;

    const svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute('width', circleSize);
    svgEl.setAttribute('height', circleSize);
    svgEl.style.cssText = `
        position: absolute;
        top: calc(50% + 52px); left: 50%;
        transform: translateX(-50%);
        opacity: 0; transition: opacity 0.5s ease; z-index: 25;
    `;
    const bgCircle = document.createElementNS(svgNS, 'circle');
    bgCircle.setAttribute('cx', circleSize/2); bgCircle.setAttribute('cy', circleSize/2);
    bgCircle.setAttribute('r', radius); bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(255,255,255,0.18)'); bgCircle.setAttribute('stroke-width', '1.5');
    const fgCircle = document.createElementNS(svgNS, 'circle');
    fgCircle.setAttribute('cx', circleSize/2); fgCircle.setAttribute('cy', circleSize/2);
    fgCircle.setAttribute('r', radius); fgCircle.setAttribute('fill', 'none');
    fgCircle.setAttribute('stroke', 'rgba(255,255,255,0.75)'); fgCircle.setAttribute('stroke-width', '1.5');
    fgCircle.setAttribute('stroke-dasharray', circumference);
    fgCircle.setAttribute('stroke-dashoffset', circumference);
    fgCircle.setAttribute('stroke-linecap', 'round');
    fgCircle.setAttribute('transform', `rotate(-90 ${circleSize/2} ${circleSize/2})`);
    svgEl.appendChild(bgCircle); svgEl.appendChild(fgCircle);
    phase5Container.appendChild(svgEl);

    let stage5StartTime = null, countdownActive = false, countdownComplete = false;
    const STAGE5_DURATION = 5000;

    function resetCountdown() {
        countdownActive = false; stage5StartTime = null;
        svgEl.style.opacity = '0';
        fgCircle.setAttribute('stroke-dashoffset', circumference);
    }

    function onResults(results) {
        if (countdownComplete) return;
        let maxFaceRatio = 0.0;
        if (results.detections && results.detections.length > 0) {
            noFaceFrames = 0;
            for (const d of results.detections) {
                if (d.boundingBox.width > maxFaceRatio) maxFaceRatio = d.boundingBox.width;
            }
        } else { noFaceFrames++; }

        if (noFaceFrames > NO_FACE_THRESHOLD) {
            proxText.innerText = '얼굴이 보이지 않아요';
            proxText.style.opacity = '0.5';
            proxText.style.fontSize = '1.0rem';
            resetCountdown(); return;
        }

        proxText.style.opacity = '1';
        let stageText, fontSize;
        if (maxFaceRatio < 0.25)       { stageText = '나와 눈을 맞춰줘요'; fontSize = 2.4; }
        else if (maxFaceRatio < 0.42)  { stageText = '나에게도 온기를 나눠줄 수 있어요?'; fontSize = 1.8; }
        else if (maxFaceRatio < 0.58)  { stageText = '가까이 다가와요'; fontSize = 1.3; }
        else if (maxFaceRatio < 0.62)  { stageText = '더 가까이'; fontSize = 0.95; }
        else                           { stageText = '당신은 발광하지 않지만 따뜻해요'; fontSize = 0.7; }

        proxText.innerText = stageText;
        proxText.style.fontSize = `${fontSize}rem`;

        if (maxFaceRatio >= 0.62) {
            if (!countdownActive) {
                countdownActive = true;
                stage5StartTime = performance.now();
                svgEl.style.opacity = '1';
            }
            const elapsed = performance.now() - stage5StartTime;
            const progress = Math.min(elapsed / STAGE5_DURATION, 1.0);
            fgCircle.setAttribute('stroke-dashoffset', circumference * (1 - progress));
            if (progress >= 1.0) { countdownComplete = true; triggerFinalPage(); }
        } else {
            if (countdownActive) resetCountdown();
        }
    }

    try {
        const faceDetection = new FaceDetection({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });
        faceDetection.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
        faceDetection.onResults(onResults);
        const camera = new Camera(videoElement, {
            onFrame: async () => { await faceDetection.send({ image: videoElement }); },
            width: 1280, height: 720
        });
        camera.start();
    } catch (err) {
        console.warn('Phase 5 webcam error:', err);
        proxText.innerText = '카메라를 사용할 수 없어요';
        proxText.style.opacity = '0.7';
    }
}

// ── Phase 6: 안아줘요 + 하트 ──
function triggerFinalPage() {
    const p5 = document.getElementById('phase5Container');
    p5.style.transition = 'opacity 1.2s ease';
    p5.style.opacity = '0';

    setTimeout(() => {
        p5.style.display = 'none';

        const finalPage = document.createElement('div');
        finalPage.id = 'finalPage';
        finalPage.style.cssText = `
            position: fixed; inset: 0;
            background: #fce8ef;
            z-index: 600;
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        `;

        const finalText = document.createElement('p');
        finalText.id = 'finalText';
        finalText.innerText = '나를 두 팔로 안아줘요';
        finalText.style.cssText = `
            font-family: 'Noto Sans KR', sans-serif;
            font-size: clamp(18px, 5vw, 28px);
            font-weight: 300;
            color: rgba(130,50,70,0.88);
            letter-spacing: 0.18em;
            animation: blinkText 1.6s ease-in-out infinite;
            position: relative; z-index: 2;
            pointer-events: none;
            text-shadow: 0 0 14px rgba(235,80,130,0.28);
        `;
        finalPage.appendChild(finalText);
        document.body.appendChild(finalPage);

        const heartContainer = document.createElement('div');
        heartContainer.id = 'heartContainer';
        heartContainer.style.cssText = `
            position: fixed; inset: 0;
            z-index: 601; pointer-events: none; overflow: hidden;
        `;
        document.body.appendChild(heartContainer);

        // 웹캠 어두움 감지
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 64; offCanvas.height = 36;
        const offCtx = offCanvas.getContext('2d');
        const videoEl = document.getElementById('webcam');

        let darkFrames = 0;
        const DARK_THRESHOLD = 45;
        const DARK_FRAMES_NEEDED = 150;
        let hugged = false;
        let huggingRafId = null;

        // 마이크 소리 감지
        let soundBlinkTimer = null;
        let soundFrames = 0;
        const SOUND_FRAMES_NEEDED = 240;

        function startMicDetection() {
            navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(stream => {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioCtx.createMediaStreamSource(stream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);

                    function checkSound() {
                        if (hugged) return;
                        analyser.getByteFrequencyData(dataArray);
                        let sum = 0;
                        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
                        const rms = Math.sqrt(sum / dataArray.length);

                        if (rms > 18) {
                            soundFrames++;
                            triggerSoundBlink(finalText);
                            if (soundFrames >= SOUND_FRAMES_NEEDED && !hugged) {
                                hugged = true;
                                cancelAnimationFrame(huggingRafId);
                                triggerHugComplete(finalPage, heartContainer, finalText);
                                return;
                            }
                        } else {
                            soundFrames = Math.max(0, soundFrames - 2);
                        }
                        requestAnimationFrame(checkSound);
                    }
                    checkSound();
                })
                .catch(() => {});
        }

        function triggerSoundBlink(el) {
            if (soundBlinkTimer) return;
            el.style.transition = 'color 0.1s ease, filter 0.1s ease';
            el.style.color = 'rgba(200,40,60,0.9)';
            el.style.filter = 'blur(3px)';
            soundBlinkTimer = setTimeout(() => {
                el.style.color = 'rgba(130,50,70,0.88)';
                el.style.filter = 'none';
                soundBlinkTimer = setTimeout(() => { soundBlinkTimer = null; }, 180);
            }, 160);
        }

        function checkLuminance() {
            if (!videoEl || videoEl.readyState < 2) {
                huggingRafId = requestAnimationFrame(checkLuminance); return;
            }
            offCtx.drawImage(videoEl, 0, 0, 64, 36);
            const data = offCtx.getImageData(0, 0, 64, 36).data;
            let sum = 0;
            const total = data.length / 4;
            for (let i = 0; i < data.length; i += 4)
                sum += 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
            const avg = sum / total;

            if (avg < DARK_THRESHOLD) darkFrames++;
            else darkFrames = Math.max(0, darkFrames - 3);

            const progress = Math.min(darkFrames / DARK_FRAMES_NEEDED, 1);
            finalText.style.opacity = String(1 - progress * 0.7);

            if (darkFrames >= DARK_FRAMES_NEEDED && !hugged) {
                hugged = true;
                cancelAnimationFrame(huggingRafId);
                triggerHugComplete(finalPage, heartContainer, finalText);
                return;
            }
            huggingRafId = requestAnimationFrame(checkLuminance);
        }

        setTimeout(() => {
            huggingRafId = requestAnimationFrame(checkLuminance);
            startMicDetection();
        }, 800);

    }, 1200);
}

function triggerHugComplete(finalPage, heartContainer, finalText) {
    finalText.style.animation = 'none';
    finalText.style.opacity = '0';
    finalPage.style.transition = 'background 1.5s ease';
    finalPage.style.background = '#fce8ef';
    burstHearts(20);
    const interval = setInterval(() => burstHearts(6), 600);
    setTimeout(() => clearInterval(interval), 5000);
    setTimeout(() => {
        const endMsg = document.createElement('p');
        endMsg.innerText = '따뜻해요. 당신과 같은 온도가 될 수 있어 좋아요';
        endMsg.style.cssText = `
            font-family: 'Noto Sans KR', sans-serif;
            font-size: clamp(14px, 4vw, 20px);
            font-weight: 300;
            color: rgba(180,80,100,0.85);
            letter-spacing: 0.15em;
            position: relative; z-index: 2;
            text-align: center; padding: 0 24px;
            animation: fadeInUp 1.2s ease forwards; opacity: 0;
        `;
        finalPage.appendChild(endMsg);
    }, 1800);
}

function burstHearts(count = 12) {
    const hc = document.getElementById('heartContainer');
    if (!hc) return;
    const hearts = ['🩷','💗','💕','💞','💓','🫀'];
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.innerText = hearts[Math.floor(Math.random() * hearts.length)];
            const size = 18 + Math.random() * 28;
            const startX = 5 + Math.random() * 88;
            const drift = (Math.random() - 0.5) * 120;
            const dur = 2.2 + Math.random() * 2;
            const delay = Math.random() * 0.3;
            el.style.cssText = `
                position: absolute; bottom: -60px; left: ${startX}vw;
                font-size: ${size}px; opacity: 0;
                animation: heartFloat ${dur}s ${delay}s ease-out forwards;
                --drift: ${drift}px;
            `;
            hc.appendChild(el);
            setTimeout(() => el.remove(), (dur + delay + 0.2) * 1000);
        }, i * 80);
    }
}

// --- 파티클 ---
const numParticles = 1200;
const particles = [];

class Particle {
    constructor() {
        this.angle = Math.random() * Math.PI * 2;
        this.baseRadius = Math.pow(Math.random(), 0.7);
        this.size = Math.random() * 2 + 0.5;
        this.speed = (Math.random() - 0.5) * 0.015;
        const rand = Math.random();
        const alpha = Math.random() * 0.4 + 0.4;
        if (rand < 0.66) {
            const lightness = 35 + Math.random() * 30;
            const hue = 25 + Math.random() * 10;
            this.color = `hsla(${hue}, 70%, ${lightness}%, ${alpha})`;
        } else {
            const neonRand = Math.random();
            if (neonRand < 0.25)      this.color = `hsla(180,100%,50%,${alpha})`;
            else if (neonRand < 0.5)  this.color = `hsla(60,100%,50%,${alpha})`;
            else if (neonRand < 0.75) this.color = `hsla(320,100%,60%,${alpha})`;
            else                      this.color = `hsla(0,100%,55%,${alpha})`;
        }
    }

    update(dispersion, score = 0) {
        const speedMultiplier = 1 + score * 4;
        this.angle += this.speed * speedMultiplier;
        const maxRadius = Math.min(width, height) * 0.45;
        const minRadius = Math.min(width, height) * 0.05;
        if (typeof isClimax !== 'undefined' && isClimax) {
            this.angle += this.speed * 20;
            const elapsedTime = Date.now() - climaxStartTime;
            const currentMaxR = minRadius + dispersion * (maxRadius - minRadius) + elapsedTime * 2;
            const wobble = Math.sin(Date.now() * 0.0075 + this.angle * 8) * 40;
            const r = this.baseRadius * currentMaxR + wobble;
            this.x = center.x + Math.cos(this.angle) * r;
            this.y = center.y + Math.sin(this.angle) * r;
            return;
        }
        const currentMaxR = minRadius + dispersion * (maxRadius - minRadius);
        const wobbleSpeed = 0.0015 * (1 + score * 6);
        const wobbleAmount = 8 * (dispersion + 0.1);
        const wobble = Math.sin(Date.now() * wobbleSpeed + this.angle * 8) * wobbleAmount;
        const r = this.baseRadius * currentMaxR + wobble;
        this.x = center.x + Math.cos(this.angle) * r;
        this.y = center.y + Math.sin(this.angle) * r;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

for (let i = 0; i < numParticles; i++) particles.push(new Particle());

// --- 게임 루프 ---
function animate() {
    currentZoom += (targetZoom - currentZoom) * 0.1;

    const dx = touchX - prevTouchX;
    const dy = touchY - prevTouchY;
    const currentSpeed = Math.hypot(dx, dy);
    touchSpeed += (currentSpeed - touchSpeed) * 0.05;
    prevTouchX = touchX; prevTouchY = touchY;

    const isSatisfied = currentZoom >= 0.3 && currentZoom <= 0.35;
    if (isSatisfied) satisfactionScore += SCORE_INCREASE_RATE;
    else satisfactionScore -= SCORE_DECREASE_RATE;
    satisfactionScore = Math.max(0, Math.min(1, satisfactionScore));

    const maxRadius = Math.min(width, height) * 0.45;
    const minRadius = Math.min(width, height) * 0.05;
    const zoneStartR = minRadius + 0.3 * (maxRadius - minRadius);
    const zoneEndR   = minRadius + 0.35 * (maxRadius - minRadius);

    const distanceToCenter = Math.hypot(touchX - center.x, touchY - center.y);
    const isInsideRing = distanceToCenter >= zoneStartR - 50 && distanceToCenter <= zoneEndR + 50;

    if (satisfactionScore > 0.5 && isTouching && isInsideRing) {
        if (touchSpeed >= 1.0 && touchSpeed <= 4.0) touchScore += 1 / 1260;
        else if (touchSpeed > 4.0 && touchSpeed < 8.0) touchScore -= TOUCH_DECREASE_RATE * 0.5;
        else if (touchSpeed >= 8.0) touchScore -= TOUCH_DECREASE_RATE;
        else touchScore += 1 / 2520;
    } else {
        touchScore -= TOUCH_DECREASE_RATE;
    }
    touchScore = Math.max(0, Math.min(1, touchScore));

    if (touchScore >= 1.0 && !isClimax) {
        isClimax = true;
        climaxStartTime = Date.now();

        canvas.style.transition = 'opacity 1.5s ease-in-out';
        zoomUI.style.opacity = '0';
        feedbackUI.style.opacity = '0';
        setTimeout(() => { zoomUI.style.display = 'none'; feedbackUI.style.display = 'none'; }, 800);

        setTimeout(() => {
            canvas.style.opacity = '0';

            function onCanvasHidden() {
                canvas.removeEventListener('transitionend', onCanvasHidden);

                const typingContainer = document.getElementById('typingContainer');
                typingContainer.style.display = 'block';
                typingContainer.style.opacity = '1';

                if (!document.getElementById('typingVignette')) {
                    const vignette = document.createElement('div');
                    vignette.id = 'typingVignette';
                    document.body.appendChild(vignette);
                }

                const seqText = document.getElementById('sequenceText');
                seqText.style.cssText = `
                    position: fixed; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    font-family: 'Noto Sans KR', sans-serif;
                    font-size: 18px; font-weight: 300;
                    color: rgba(130,50,70,0.88);
                    letter-spacing: 0.1em; text-align: center;
                    line-height: 1.8; opacity: 0;
                    transition: opacity 1s ease;
                    pointer-events: none; z-index: 500;
                    white-space: nowrap;
                    text-shadow: 0 0 18px rgba(235,80,130,0.35);
                `;

                const messages = [
                    "나의 온기를 나눠드릴게요",
                    "폰 옆면의 버튼을 찾아주세요",
                    "따뜻해질 때까지 마구 눌러주세요"
                ];
                let seqIndex = 0;

                function showNextMessage() {
                    if (seqIndex >= messages.length) {
                        seqText.style.opacity = '0';

                        // ── 타이핑 페이즈 진입 ──
                        function startTypingPhase(keyLabel) {
                            if (keyLabel) {
                                const keyHint = document.createElement('div');
                                keyHint.id = 'keyHint';
                                keyHint.style.cssText = `
                                    position: fixed; bottom: 90px; left: 50%;
                                    transform: translateX(-50%);
                                    font-family: 'Noto Sans KR', sans-serif;
                                    font-size: 13px; font-weight: 300;
                                    color: rgba(130,50,70,0.55); letter-spacing: 0.2em;
                                    text-align: center; white-space: nowrap;
                                    opacity: 0; transition: opacity 0.8s ease;
                                    pointer-events: none; z-index: 200;
                                    text-shadow: 0 0 14px rgba(235,80,130,0.28);
                                `;
                                keyHint.innerText = keyLabel;
                                document.body.appendChild(keyHint);
                                setTimeout(() => { keyHint.style.opacity = '1'; }, 50);
                            }
                            const typingAreaEl = document.getElementById('typingArea');
                            typingAreaEl.style.display = 'block';
                            document.getElementById('typingProgress').style.display = 'block';
                            updateTypingProgress();
                        }

                        // ── 볼륨 버튼 등록 프롬프트 ──
                        const regPrompt = document.createElement('div');
                        regPrompt.style.cssText = `
                            position: fixed; top: 50%; left: 50%;
                            transform: translate(-50%, -50%);
                            font-family: 'Noto Sans KR', sans-serif;
                            font-size: 17px; font-weight: 300;
                            color: rgba(130,50,70,0.88);
                            letter-spacing: 0.1em; text-align: center; line-height: 2.4;
                            opacity: 0; transition: opacity 0.8s ease;
                            pointer-events: none; z-index: 500;
                            text-shadow: 0 0 14px rgba(235,80,130,0.28);
                        `;
                        regPrompt.innerHTML = `폰 옆면의 볼륨 버튼을<br>한 번 눌러주세요`;
                        document.body.appendChild(regPrompt);
                        setTimeout(() => { regPrompt.style.opacity = '1'; }, 50);

                        // Android: keydown 이벤트로 감지
                        function onVolumeKey(e) {
                            if (e.key === 'AudioVolumeUp'  || e.key === 'AudioVolumeDown' ||
                                e.key === 'VolumeUp'       || e.key === 'VolumeDown') {
                                e.preventDefault();
                                confirmVolumeReg('볼륨 버튼');
                            }
                        }

                        // iOS 폴백: 화면 탭 3회로 등록
                        let tapCount = 0;
                        let tapTimer = null;
                        function onFallbackTap() {
                            tapCount++;
                            if (tapTimer) clearTimeout(tapTimer);
                            tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
                            if (tapCount >= 3) {
                                window.removeEventListener('touchend', onFallbackTap);
                                confirmVolumeReg('화면 탭');
                            }
                        }

                        function confirmVolumeReg(label) {
                            window.removeEventListener('keydown', onVolumeKey);
                            window.removeEventListener('touchend', onFallbackTap);
                            volumeBtnRegistered = true;

                            regPrompt.style.transition = 'opacity 0.3s ease';
                            regPrompt.innerHTML = `<span style="font-size:13px; opacity:0.55; letter-spacing:0.12em;">등록됐어요</span>`;

                            setTimeout(() => {
                                regPrompt.style.opacity = '0';
                                setTimeout(() => {
                                    regPrompt.remove();
                                    startTypingPhase(label);
                                    // 볼륨 버튼으로 타이핑 점수 계속 누적
                                    window.addEventListener('keydown', (e) => {
                                        const ta = document.getElementById('typingArea');
                                        if (!ta || ta.style.display === 'none') return;
                                        if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' ||
                                            e.key === 'VolumeUp'      || e.key === 'VolumeDown') {
                                            e.preventDefault();
                                            typingScore++;
                                            typingScore = Math.min(MAX_TYPING_SCORE, typingScore);
                                            updateTypingProgress();
                                        }
                                    });
                                    // iOS 폴백: 화면 탭으로 점수 누적
                                    canvas.addEventListener('touchend', () => {
                                        const ta = document.getElementById('typingArea');
                                        if (!ta || ta.style.display === 'none') return;
                                        typingScore++;
                                        typingScore = Math.min(MAX_TYPING_SCORE, typingScore);
                                        updateTypingProgress();
                                    });
                                }, 600);
                            }, 900);
                        }

                        window.addEventListener('keydown', onVolumeKey);
                        window.addEventListener('touchend', onFallbackTap);
                        return;
                    }

                    seqText.innerText = messages[seqIndex];
                    seqText.style.opacity = '1';
                    setTimeout(() => {
                        seqText.style.opacity = '0';
                        seqIndex++;
                        setTimeout(showNextMessage, 1200);
                    }, 3000);
                }

                setTimeout(showNextMessage, 500);
            }

            canvas.addEventListener('transitionend', onCanvasHidden);
        }, 1500);
    }

    // 배경색: 흰색 → 연핑크
    let r = Math.floor(255 - (3  * touchScore));
    let g = Math.floor(255 - (40 * touchScore));
    let b = Math.floor(255 - (28 * touchScore));
    if (isClimax) { r = 252; g = 232; b = 239; }
    document.body.style.backgroundColor = `rgb(${r},${g},${b})`;

    // 캔버스 클리어
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(252,232,239,0.18)';
    if (!isClimax) {
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = 'rgba(248,215,228,0.32)';
        ctx.fillRect(0, 0, width, height);
        const edgeGrad = ctx.createRadialGradient(
            center.x, center.y, Math.min(width, height) * 0.25,
            center.x, center.y, Math.max(width, height) * 0.85
        );
        edgeGrad.addColorStop(0,   'rgba(220,140,170,0)');
        edgeGrad.addColorStop(0.7, 'rgba(220,140,170,0)');
        edgeGrad.addColorStop(1,   'rgba(220,140,170,0.4)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.globalCompositeOperation = 'source-over';
    for (const p of particles) {
        p.update(currentZoom, Math.max(satisfactionScore * 0.4, touchScore));
        p.draw();
    }

    if (touchScore > 0.8 || isClimax) {
        ctx.globalCompositeOperation = 'lighter';
        let glowAlpha = (touchScore - 0.8) * 5;
        let explosionRadius = 0;
        if (isClimax) {
            glowAlpha = 1.0;
            explosionRadius = ((Date.now() - climaxStartTime) / 1000) * Math.max(width, height) * 1.5;
        }
        ctx.beginPath();
        const radGrad = ctx.createRadialGradient(
            center.x, center.y, Math.max(0, zoneStartR - 50 + explosionRadius * 0.5),
            center.x, center.y, zoneEndR + 50 + explosionRadius
        );
        radGrad.addColorStop(0,   `rgba(220,140,170,0)`);
        radGrad.addColorStop(0.5, `rgba(235,175,200,${glowAlpha * 0.7})`);
        radGrad.addColorStop(1,   `rgba(220,140,170,0)`);
        ctx.fillStyle = radGrad;
        ctx.arc(center.x, center.y, zoneEndR + 50 + explosionRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    if (isClimax) { requestAnimationFrame(animate); return; }

    // 가이드 링 (Phase 1)
    ctx.globalCompositeOperation = 'source-over';
    const ringOpacity = Math.max(0, 0.15 - satisfactionScore * 0.15);
    if (ringOpacity > 0.002) {
        ctx.save();
        ctx.filter = 'blur(22px)';
        ctx.setLineDash([7, 9]);
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `rgba(210,70,70,${ringOpacity * 3})`;
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneStartR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(210,70,70,${ringOpacity})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneEndR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(210,70,70,${ringOpacity})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.filter = 'none';
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneEndR, 0, Math.PI * 2);
        ctx.arc(center.x, center.y, zoneStartR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,70,70,${ringOpacity * 0.1})`;
        ctx.fill('evenodd');
        ctx.setLineDash([]);
        ctx.restore();
    }

    // zoomUI 업데이트
    const zoomPercent = (currentZoom * 100).toFixed(1);
    zoomUI.style.color = isSatisfied ? 'rgba(160,30,30,0.6)' : 'rgba(0,0,0,0.35)';
    let uiParts = [zoomPercent + '%'];
    if (isTouching && satisfactionScore > 0.05) uiParts.push(`속도 ${touchSpeed.toFixed(1)}`);
    zoomUI.innerText = uiParts.join('  ·  ');

    // 온보딩 메시지
    const elapsed = Date.now() - onboardingStartTime;
    if (elapsed < ONBOARDING_DURATION) {
        const alpha = elapsed < 500 ? elapsed / 500 : elapsed > 3500 ? (4000 - elapsed) / 500 : 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `300 14px 'Noto Sans KR', sans-serif`;
        ctx.fillStyle = `rgba(130,50,70,${alpha * 0.6})`;
        ctx.textAlign = 'center';
        ctx.fillText('두 손가락으로 핀치해주세요', center.x, center.y - 20);
    }

    // Phase 2 링 하이라이트 (블러)
    if (satisfactionScore > 0.5) {
        ctx.save();
        ctx.filter = 'blur(22px)';
        ctx.lineWidth = 4 + satisfactionScore * 4;
        ctx.strokeStyle = `rgba(210,70,70,${satisfactionScore * 0.4})`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = `rgba(210,70,70,${satisfactionScore * 0.5})`;
        ctx.beginPath();
        ctx.arc(center.x, center.y, (zoneStartR + zoneEndR) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.filter = 'none';
        ctx.restore();
    }

    // 페이즈2 피드백
    let feedbackText = '';
    let feedbackColor = 'rgba(200,50,50,0.85)';
    if (satisfactionScore > 0.05 && touchScore < 0.1) {
        if (isTouching && isInsideRing && touchSpeed > 5.5) feedbackText = '너무 거칠어요... 조금 더 조심스럽게...';
        else if (satisfactionScore > 0.5) feedbackText = '살짝 손가락을 얹고 천천히 쓸어주세요...';
    } else if (touchScore >= 0.1) {
        const tempNow = (34 + touchScore * 3).toFixed(2);
        if (touchSpeed > 5.5) { feedbackText = '너무 강해요... 진정하세요...'; feedbackColor = 'rgba(220,80,50,0.9)'; }
        else { feedbackText = touchScore >= 0.99 ? `${tempNow}°C  완벽해요...` : `${tempNow}°C`; feedbackColor = 'rgba(180,40,40,0.85)'; }
    }
    feedbackUI.innerText = feedbackText;
    feedbackUI.style.color = feedbackColor;
    const feedbackAlpha = satisfactionScore > 0.05 ? Math.min(1, satisfactionScore * 1.5) : 0;
    feedbackUI.style.opacity = feedbackText ? feedbackAlpha.toString() : '0';

    requestAnimationFrame(animate);
}

animate();
