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
let targetZoom = 0.5; // Starts at 50%
let currentZoom = 0.5;
const MIN_ZOOM = 0;
const MAX_ZOOM = 1;

let satisfactionScore = 0; // 0 to 1
const MAX_SCORE = 1;
const SCORE_INCREASE_RATE = 0.005; // Quick unlock for Phase 1
const SCORE_DECREASE_RATE = 0.004;

let touchScore = 0; // 0 to 1 (Phase 2 score)
const TOUCH_INCREASE_RATE = 0.002;
const TOUCH_DECREASE_RATE = 0.004;

// Mouse Touch Interaction State
let isTouching = false;
let mouseX = 0, mouseY = 0;
let prevMouseX = 0, prevMouseY = 0;
let mouseSpeed = 0;

// Climax & Typing Phase State
let isClimax = false;
let climaxStartTime = 0;

let typingScore = 0;
const MAX_TYPING_SCORE = 500;
let isPhase5 = false;
let registeredKeys = new Set(); // 사용자가 직접 등록한 돌기 키들

// ============================================================
// [Phase 1 개선] 온보딩 메시지 타이머
// ============================================================
const onboardingStartTime = Date.now();
const ONBOARDING_DURATION = 4000; // 4초간 표시

// ============================================================
// [Phase 1 개선] 줌 UI 오버레이 (HTML 고정 박스)
// ============================================================
const zoomUI = document.createElement('div');
zoomUI.id = 'zoomUI';
zoomUI.style.cssText = `
    position: fixed;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    font-family: 'Noto Sans KR', sans-serif;
    font-size: 12px;
    font-weight: 300;
    color: rgba(0, 0, 0, 0.35);
    letter-spacing: 0.08em;
    transition: color 0.5s ease, opacity 0.8s ease;
    z-index: 200;
    text-align: center;
    pointer-events: none;
    white-space: nowrap;
    text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
`;
document.body.appendChild(zoomUI);

// ============================================================
// [Phase 2 개선] 피드백 레이블
// ============================================================
const feedbackUI = document.createElement('div');
feedbackUI.id = 'feedbackUI';
feedbackUI.style.cssText = `
    position: fixed;
    bottom: 52px;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    font-family: 'Noto Sans KR', sans-serif;
    font-size: 13px;
    font-weight: 300;
    color: rgba(180, 40, 40, 0.8);
    letter-spacing: 0.06em;
    opacity: 0;
    transition: opacity 0.5s ease, color 0.4s ease;
    z-index: 200;
    text-align: center;
    pointer-events: none;
    white-space: nowrap;
    text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
`;
document.body.appendChild(feedbackUI);

// --- Event Listeners ---
// Wheel event (supports trackpad pinch)
window.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent default browser zoom/scroll

    // On Mac trackpad pinch:
    // Fingers gather (pinch in): e.deltaY is positive. -> particles should gather (zoom -> 0)
    // Fingers spread (pinch out): e.deltaY is negative. -> particles should scatter (zoom -> 1)

    let zoomSpeed = 0.002;
    if (e.ctrlKey) {
        // Pinch gesture is often more sensitive and explicitly zooming
        zoomSpeed = 0.01;
    }

    targetZoom -= e.deltaY * zoomSpeed;
    targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
}, { passive: false });

// Mobile touch gestures for pinch
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
    // e.preventDefault() for all touchmoves is handled by css touch-action: none, 
    // but we can also prevent here just in case.
    e.preventDefault();

    if (e.touches.length === 2 && initialPinchDistance !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.hypot(dx, dy);

        // distance > initialPinchDistance means fingers spread out
        const delta = (distance - initialPinchDistance) * 0.002;
        targetZoom = initialZoomAtPinchStart + delta;
        targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        initialPinchDistance = null;
    }
});

// Phase 2 Interaction Listeners
function handlePointerDown(e) {
    isTouching = true;
    prevMouseX = mouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    prevMouseY = mouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
}

function handlePointerMove(e) {
    if (!isTouching) return;
    mouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    mouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
}

function handlePointerUp() {
    isTouching = false;
}

window.addEventListener('mousedown', handlePointerDown);
window.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerUp);
window.addEventListener('mouseleave', handlePointerUp);

window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) handlePointerDown(e);
}, { passive: false });
window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) handlePointerMove(e);
}, { passive: false });
window.addEventListener('touchend', (e) => {
    if (e.touches.length < 1 || !e.touches) handlePointerUp();
});

// [Phase 4 개선] 진행도 업데이트 함수 (키보드 + 모바일 버튼 공유)
function updateTypingProgress() {
    const percent = Math.floor((typingScore / MAX_TYPING_SCORE) * 100);
    const progressEl = document.getElementById('typingProgress');

    // 진행도에 따른 바 색상: 0~50% 분홍 → 50~70% 주황 → 70%+ 빨강
    let barColor;
    if (percent < 50)      barColor = 'rgba(255, 160, 160, 0.9)';
    else if (percent < 70) barColor = 'rgba(255, 120, 60, 0.9)';
    else                   barColor = 'rgba(220, 50, 50, 0.95)';

    progressEl.innerHTML = `
        <div style="font-family:'Noto Sans KR', sans-serif; font-size:15px; font-weight:300;
                    color:rgba(130,50,70,0.85); letter-spacing:0.12em; margin-bottom:12px;
                    text-shadow: 0 0 12px rgba(235,80,130,0.25);">
            온기 ${percent}%
        </div>
        <div style="width:180px; height:2px; background:rgba(180,100,120,0.2);
                    border-radius:2px; overflow:hidden; margin:0 auto;">
            <div style="width:${percent}%; height:100%; background:${barColor};
                        border-radius:2px; transition:width 0.1s ease, background 0.4s ease;">
            </div>
        </div>
    `;

    // Progressive whiteout effect starting at 70%
    const whiteoutOverlay = document.getElementById('whiteoutOverlay');
    let whiteoutOpacity = 0;
    if (typingScore >= 350) {
        whiteoutOpacity = (typingScore - 350) / 150;
    }
    whiteoutOverlay.style.opacity = whiteoutOpacity.toString();

    if (typingScore >= MAX_TYPING_SCORE && !isPhase5) {
        isPhase5 = true;
        triggerPhase5();
    }
}

// Phase 4: Keyboard Event Listener
window.addEventListener('keydown', (e) => {
    const typingArea = document.getElementById('typingArea');
    if (!isClimax || typingArea.style.display === 'none') return;
    if (registeredKeys.size === 0) return;

    if (registeredKeys.has(e.key)) {
        typingScore++;
        typingScore = Math.min(MAX_TYPING_SCORE, typingScore);
        updateTypingProgress();
    }
});

// Phase 5: Webcam / Face Detection
function triggerPhase5() {
    setTimeout(() => {
        const phase5Container = document.getElementById('phase5Container');
        // position: fixed 유지 — JS에서 절대 덮어쓰지 않음
        phase5Container.style.display = 'block';
        setTimeout(() => { phase5Container.style.opacity = '1'; }, 50);

        // 카메라 동의 안내 화면 (연한 핑크 테마)
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
                color:rgba(130, 50, 70, 0.88); letter-spacing:0.08em;
                text-align:center; line-height:1.9; margin:0;
                text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
            ">
                이제 카메라를 사용할게요
            </p>
            <p style="
                font-family:'Noto Sans KR', sans-serif; font-size:13px; font-weight:300;
                color:rgba(130, 50, 70, 0.55); letter-spacing:0.18em;
                text-align:center; margin:0;
                text-shadow: 0 0 14px rgba(235, 80, 130, 0.22);
            ">
                당신의 온기도 나눠줘요
            </p>
            <button id="startCameraBtn" style="
                padding: 11px 34px; border-radius: 999px;
                border: 1px solid rgba(160, 80, 100, 0.35);
                background: transparent;
                color: rgba(130, 50, 70, 0.88);
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

    // 풀스크린 video (미러링, absolute로 컨테이너 꽉 채움)
    videoElement.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scaleX(-1);
        display: block;
    `;

    // proxText 오버레이 — 화면 중앙
    proxText.style.cssText = `
        display: block;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Noto Sans KR', sans-serif;
        font-size: 0.9rem;
        font-weight: 300;
        color: rgba(255, 255, 255, 0.9);
        letter-spacing: 0.12em;
        text-align: center;
        white-space: nowrap;
        pointer-events: none;
        z-index: 20;
        transition: opacity 0.4s ease;
        text-shadow: 0 0 16px rgba(235, 80, 130, 0.4);
    `;

    let noFaceFrames = 0;
    const NO_FACE_THRESHOLD = 30;

    // ── SVG 원형 카운트다운 바 ──
    const svgNS = 'http://www.w3.org/2000/svg';
    const circleSize = 56;
    const radius = 22;
    const circumference = 2 * Math.PI * radius;

    const svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute('width', circleSize);
    svgEl.setAttribute('height', circleSize);
    svgEl.style.cssText = `
        position: absolute;
        top: calc(50% + 52px);
        left: 50%;
        transform: translateX(-50%);
        opacity: 0;
        transition: opacity 0.5s ease;
        z-index: 25;
    `;

    const bgCircle = document.createElementNS(svgNS, 'circle');
    bgCircle.setAttribute('cx', circleSize / 2);
    bgCircle.setAttribute('cy', circleSize / 2);
    bgCircle.setAttribute('r', radius);
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(255,255,255,0.18)');
    bgCircle.setAttribute('stroke-width', '1.5');

    const fgCircle = document.createElementNS(svgNS, 'circle');
    fgCircle.setAttribute('cx', circleSize / 2);
    fgCircle.setAttribute('cy', circleSize / 2);
    fgCircle.setAttribute('r', radius);
    fgCircle.setAttribute('fill', 'none');
    fgCircle.setAttribute('stroke', 'rgba(255,255,255,0.75)');
    fgCircle.setAttribute('stroke-width', '1.5');
    fgCircle.setAttribute('stroke-dasharray', circumference);
    fgCircle.setAttribute('stroke-dashoffset', circumference);
    fgCircle.setAttribute('stroke-linecap', 'round');
    fgCircle.setAttribute('transform', `rotate(-90 ${circleSize / 2} ${circleSize / 2})`);

    svgEl.appendChild(bgCircle);
    svgEl.appendChild(fgCircle);
    phase5Container.appendChild(svgEl);

    // ── 카운트다운 상태 ──
    let stage5StartTime = null;
    let countdownActive = false;
    let countdownComplete = false;
    const STAGE5_DURATION = 5000;

    function resetCountdown() {
        countdownActive = false;
        stage5StartTime = null;
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
        } else {
            noFaceFrames++;
        }

        if (noFaceFrames > NO_FACE_THRESHOLD) {
            proxText.innerText = '얼굴이 보이지 않아요';
            proxText.style.opacity = '0.5';
            proxText.style.fontSize = '1.0rem';
            resetCountdown();
            return;
        }

        proxText.style.opacity = '1';

        // ── 5단계 텍스트 + 폰트 크기 ──
        let stageText, fontSize;
        if (maxFaceRatio < 0.25) {
            stageText = '나와 눈을 맞춰줘요';
            fontSize = 2.4;
        } else if (maxFaceRatio < 0.42) {
            stageText = '나에게도 온기를 나눠줄 수 있어요?';
            fontSize = 1.8;
        } else if (maxFaceRatio < 0.58) {
            stageText = '가까이 다가와요';
            fontSize = 1.3;
        } else if (maxFaceRatio < 0.62) {
            stageText = '더 가까이';
            fontSize = 0.95;
        } else {
            stageText = '당신은 발광하지 않지만 따뜻해요';
            fontSize = 0.7;
        }

        proxText.innerText = stageText;
        proxText.style.fontSize = `${fontSize}rem`;

        // ── 5단계 카운트다운 ──
        if (maxFaceRatio >= 0.62) {
            if (!countdownActive) {
                countdownActive = true;
                stage5StartTime = performance.now();
                svgEl.style.opacity = '1';
            }
            const elapsed = performance.now() - stage5StartTime;
            const progress = Math.min(elapsed / STAGE5_DURATION, 1.0);
            fgCircle.setAttribute('stroke-dashoffset', circumference * (1 - progress));

            if (progress >= 1.0) {
                countdownComplete = true;
                triggerFinalPage();
            }
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

        const msg = document.createElement('p');
        msg.style.cssText = `
            font-family:'Noto Sans KR', sans-serif; font-size:12px; font-weight:300;
            color:rgba(140,70,90,0.6); letter-spacing:0.04em;
            margin-top:10px; text-align:center;
        `;
        msg.innerText = '브라우저 설정에서 카메라 권한을 확인해 주세요';
        phase5Container.appendChild(msg);
    }
}

// ── 최종 화면 (Phase 6: 안아줘요 + 하트) ──
function triggerFinalPage() {
    const p5 = document.getElementById('phase5Container');
    p5.style.transition = 'opacity 1.2s ease';
    p5.style.opacity = '0';

    setTimeout(() => {
        p5.style.display = 'none';

        // ── 배경 페이지 ──
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
            font-size: clamp(18px, 2.2vw, 28px);
            font-weight: 300;
            color: rgba(130, 50, 70, 0.88);
            text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
            letter-spacing: 0.18em;
            animation: blinkText 1.6s ease-in-out infinite;
            position: relative; z-index: 2;
            pointer-events: none;
        `;

        finalPage.appendChild(finalText);
        document.body.appendChild(finalPage);

        // ── 하트 컨테이너 ──
        const heartContainer = document.createElement('div');
        heartContainer.id = 'heartContainer';
        heartContainer.style.cssText = `
            position: fixed; inset: 0;
            z-index: 601;
            pointer-events: none;
            overflow: hidden;
        `;
        document.body.appendChild(heartContainer);

        // ── Offscreen canvas for luminance analysis ──
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 64;
        offCanvas.height = 36;
        const offCtx = offCanvas.getContext('2d');

        // Phase 5 비디오 스트림 재사용
        const videoEl = document.getElementById('webcam');

        let darkFrames = 0;
        const DARK_THRESHOLD = 45;       // 평균 luminance 이하면 "어두움"
        const DARK_FRAMES_NEEDED = 150;  // ~2.5초 @ 60fps
        let hugged = false;
        let huggingRafId = null;

        // ── 마이크 소리 감지 → 깜빡임 피드백 + 4초 누적 시 완료 ──
        let soundBlinkTimer = null;
        let soundFrames = 0;
        const SOUND_FRAMES_NEEDED = 240; // ~4초 @ 60fps

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

                            // 4초 누적 감지 → 완료
                            if (soundFrames >= SOUND_FRAMES_NEEDED && !hugged) {
                                hugged = true;
                                cancelAnimationFrame(huggingRafId);
                                triggerHugComplete(finalPage, heartContainer, finalText);
                                return;
                            }
                        } else {
                            soundFrames = Math.max(0, soundFrames - 2); // 조용해지면 서서히 감소
                        }
                        requestAnimationFrame(checkSound);
                    }
                    checkSound();
                })
                .catch(() => {}); // 마이크 권한 거부 시 조용히 무시
        }

        function triggerSoundBlink(el) {
            if (soundBlinkTimer) return;
            el.style.transition = 'color 0.1s ease, filter 0.1s ease';
            el.style.color = 'rgba(200, 40, 60, 0.9)';
            el.style.filter = 'blur(3px)';
            soundBlinkTimer = setTimeout(() => {
                el.style.color = '#888';
                el.style.filter = 'none';
                soundBlinkTimer = setTimeout(() => { soundBlinkTimer = null; }, 180);
            }, 160);
        }

        setTimeout(startMicDetection, 900);

        function launchHeart() {
            const el = document.createElement('div');
            const hearts = ['🩷', '💗', '💕', '💞', '💓', '🫀'];
            el.innerText = hearts[Math.floor(Math.random() * hearts.length)];

            const size = 18 + Math.random() * 28;
            const startX = 10 + Math.random() * 80; // vw %
            const drift = (Math.random() - 0.5) * 120; // px
            const dur = 2.2 + Math.random() * 2;
            const delay = Math.random() * 0.5;

            el.style.cssText = `
                position: absolute;
                bottom: -60px;
                left: ${startX}vw;
                font-size: ${size}px;
                opacity: 0;
                animation: heartFloat ${dur}s ${delay}s ease-out forwards;
                --drift: ${drift}px;
            `;
            heartContainer.appendChild(el);
            // 애니메이션 끝나면 제거
            setTimeout(() => el.remove(), (dur + delay + 0.2) * 1000);
        }

        function burstHearts(count = 12) {
            for (let i = 0; i < count; i++) {
                setTimeout(launchHeart, i * 80);
            }
        }

        function checkLuminance() {
            if (!videoEl || videoEl.readyState < 2) {
                huggingRafId = requestAnimationFrame(checkLuminance);
                return;
            }
            offCtx.drawImage(videoEl, 0, 0, 64, 36);
            const data = offCtx.getImageData(0, 0, 64, 36).data;

            let sum = 0;
            const total = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
                sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            const avg = sum / total;

            if (avg < DARK_THRESHOLD) {
                darkFrames++;
            } else {
                darkFrames = Math.max(0, darkFrames - 3); // 살짝 빠지면 천천히 리셋
            }

            // 진행도 표시 (텍스트 opacity → 어두워질수록 흐려짐)
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

        // 약간의 딜레이 후 감지 시작 (카메라 안정화)
        setTimeout(() => {
            huggingRafId = requestAnimationFrame(checkLuminance);
        }, 800);

    }, 1200);
}

function triggerHugComplete(finalPage, heartContainer, finalText) {
    // 텍스트 숨기고 하트 폭발
    finalText.style.animation = 'none';
    finalText.style.opacity = '0';

    // 배경을 연핑크로 부드럽게 전환
    finalPage.style.transition = 'background 1.5s ease';
    finalPage.style.background = '#fce8ef';

    // 하트 대량 발사
    burstHearts(20);
    const interval = setInterval(() => burstHearts(6), 600);
    setTimeout(() => clearInterval(interval), 5000);

    // 완료 메시지
    setTimeout(() => {
        const endMsg = document.createElement('p');
        endMsg.innerText = '따뜻해요. 당신과 같은 온도가 될 수 있어 좋아요';
        endMsg.style.cssText = `
            font-family: 'Noto Sans KR', sans-serif;
            font-size: clamp(16px, 2vw, 24px);
            font-weight: 300;
            color: rgba(180, 80, 100, 0.85);
            letter-spacing: 0.2em;
            position: relative; z-index: 2;
            animation: fadeInUp 1.2s ease forwards;
            opacity: 0;
        `;
        finalPage.appendChild(endMsg);
    }, 1800);
}

// burstHearts를 triggerFinalPage 밖에서도 쓸 수 있도록 전역 래퍼
function burstHearts(count = 12) {
    const hc = document.getElementById('heartContainer');
    if (!hc) return;
    const hearts = ['🩷', '💗', '💕', '💞', '💓', '🫀'];
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

// --- Particles ---
const numParticles = 1200;
const particles = [];

class Particle {
    constructor() {
        this.angle = Math.random() * Math.PI * 2;
        // Base distance from center (normalized 0 to 1)
        // Math.pow gives a slight clustering towards the center
        this.baseRadius = Math.pow(Math.random(), 0.7);
        this.size = Math.random() * 2 + 0.5;
        this.speed = (Math.random() - 0.5) * 0.015; // Slow ambient rotation
        // Particle Colors: 2/3 Brown, 1/3 (Bright Cyan, Bright Neon Yellow, Bright Pink, Bright Red)
        const rand = Math.random();
        const alpha = Math.random() * 0.4 + 0.4; // 0.4 to 0.8

        if (rand < 0.66) {
            // Brown to Light Brown spectrum
            // Lightness from 35% to 65% (adds light brown)
            const lightness = 35 + Math.random() * 30;
            const hue = 25 + Math.random() * 10; // Hue 25 to 35
            this.color = `hsla(${hue}, 70%, ${lightness}%, ${alpha})`;
        } else {
            // Pick from the 4 bright colors
            const neonRand = Math.random();
            if (neonRand < 0.25) {
                this.color = `hsla(180, 100%, 50%, ${alpha})`; // Bright Cyan
            } else if (neonRand < 0.5) {
                this.color = `hsla(60, 100%, 50%, ${alpha})`; // Bright Neon Yellow
            } else if (neonRand < 0.75) {
                this.color = `hsla(320, 100%, 60%, ${alpha})`; // Bright Pink
            } else {
                this.color = `hsla(0, 100%, 55%, ${alpha})`; // Bright Red
            }
        }
    }

    update(dispersion, score = 0) {
        const speedMultiplier = 1 + score * 4; // Up to 5x faster when fully satisfied
        this.angle += this.speed * speedMultiplier;

        // If zoom is 0 (fingers gathered), dispersion is small.
        // If zoom is 1 (fingers spread), dispersion is large.
        // minRadius represents how tightly they gather.
        const maxRadius = Math.min(width, height) * 0.45;
        const minRadius = Math.min(width, height) * 0.05;

        // Interpolate the max theoretical radius for this particle
        const currentMaxR = minRadius + dispersion * (maxRadius - minRadius);
        // If climax is active, scatter particles outwards rapidly
        if (typeof isClimax !== 'undefined' && isClimax) {
            this.angle += this.speed * 20;
            const elapsedTime = Date.now() - climaxStartTime;
            currentMaxR += elapsedTime * 2; // explosion effect
        }

        const targetR = this.baseRadius * currentMaxR;

        // Add some noise/wobble for organic feel. Wobble gets faster too.
        let wobbleSpeed = 0.0015 * (1 + score * 6);
        let wobbleAmount = 8 * (dispersion + 0.1);

        if (typeof isClimax !== 'undefined' && isClimax) {
            wobbleSpeed *= 5;
            wobbleAmount *= 5;
        }

        const wobble = Math.sin(Date.now() * wobbleSpeed + this.angle * 8) * wobbleAmount;

        const r = targetR + wobble;

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

for (let i = 0; i < numParticles; i++) {
    particles.push(new Particle());
}

// --- Game Loop ---
function animate() {
    // Smooth zoom transition
    currentZoom += (targetZoom - currentZoom) * 0.1;

    // Calculate interaction speed for Phase 2
    const dx = mouseX - prevMouseX;
    const dy = mouseY - prevMouseY;
    const currentSpeed = Math.hypot(dx, dy);
    // Smooth the speed reading more (0.05) so it averages over ~300ms. 
    // This prevents the speed from dropping to 0 when changing stroke directions, making it much easier to maintain!
    mouseSpeed += (currentSpeed - mouseSpeed) * 0.05;

    prevMouseX = mouseX;
    prevMouseY = mouseY;

    // Check satisfaction zone (30-35%)
    const isSatisfied = currentZoom >= 0.3 && currentZoom <= 0.35;

    if (isSatisfied) {
        satisfactionScore += SCORE_INCREASE_RATE;
    } else {
        satisfactionScore -= SCORE_DECREASE_RATE;
    }
    satisfactionScore = Math.max(0, Math.min(MAX_SCORE, satisfactionScore));

    // Calculate raduis bounds early for hit detection
    const maxRadius = Math.min(width, height) * 0.45;
    const minRadius = Math.min(width, height) * 0.05;
    const zoneStartR = minRadius + 0.3 * (maxRadius - minRadius);
    const zoneEndR = minRadius + 0.35 * (maxRadius - minRadius);

    // Phase 2: Touch Scoring
    const distanceToCenter = Math.hypot(mouseX - center.x, mouseY - center.y);
    const isInsideRing = distanceToCenter >= zoneStartR - 50 && distanceToCenter <= zoneEndR + 50;

    if (satisfactionScore > 0.5 && isTouching && isInsideRing) {
        if (mouseSpeed >= 1.0 && mouseSpeed <= 4.0) {
            // 온도 상승: 천천히 (약 21초 @ 60fps)
            touchScore += 1 / 1260;
        } else if (mouseSpeed > 4.0 && mouseSpeed < 8.0) {
            touchScore -= TOUCH_DECREASE_RATE * 0.5;
        } else if (mouseSpeed >= 8.0) {
            touchScore -= TOUCH_DECREASE_RATE;
        } else {
            touchScore += 1 / 2520;
        }
    } else {
        touchScore -= TOUCH_DECREASE_RATE;
    }
    touchScore = Math.max(0, Math.min(1, touchScore));

    if (touchScore >= 1.0 && !isClimax) {
        isClimax = true;
        climaxStartTime = Date.now();

        // [Phase 3 개선] Canvas fade + UI 정리
        canvas.style.transition = 'opacity 1.5s ease-in-out';
        zoomUI.style.opacity = '0';
        feedbackUI.style.opacity = '0';
        setTimeout(() => { zoomUI.style.display = 'none'; feedbackUI.style.display = 'none'; }, 800);

        // [Phase 3 개선] setTimeout 대신 transitionend 이벤트로 타이밍 안정화
        setTimeout(() => {
            canvas.style.opacity = '0';

            function onCanvasHidden() {
                canvas.removeEventListener('transitionend', onCanvasHidden);

                const typingContainer = document.getElementById('typingContainer');
                typingContainer.style.display = 'block';
                typingContainer.style.opacity = '1';

                // 가장자리 흰색 비네팅 오버레이 삽입
                if (!document.getElementById('typingVignette')) {
                    const vignette = document.createElement('div');
                    vignette.id = 'typingVignette';
                    document.body.appendChild(vignette);
                }

                // Phase 3 Sequence Text — 화면 정중앙 고정
                const seqText = document.getElementById('sequenceText');
                seqText.style.cssText = `
                    position: fixed;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    font-family: 'Noto Sans KR', sans-serif;
                    font-size: 20px; font-weight: 300;
                    color: rgba(130, 50, 70, 0.88);
                    letter-spacing: 0.1em;
                    text-align: center;
                    line-height: 1.8;
                    opacity: 0;
                    transition: opacity 1s ease;
                    pointer-events: none;
                    z-index: 500;
                    white-space: nowrap;
                    text-shadow: 0 0 18px rgba(235, 80, 130, 0.35);
                `;

                const messages = [
                    "나의 온기를 나눠드릴게요",
                    "키보드의 돌기를 찾아주세요",
                    "따뜻해질 때까지 마구 누르고 문질러주세요"
                ];
                let seqIndex = 0;

                function showNextMessage() {
                    if (seqIndex >= messages.length) {
                        seqText.style.opacity = '0';

                        // ── 타이핑 페이즈 진입 함수 ──
                        function startTypingPhase(keyLabel) {
                            // 등록된 키 힌트 (하단 고정)
                            if (keyLabel) {
                                const keyHint = document.createElement('div');
                                keyHint.id = 'keyHint';
                                keyHint.style.cssText = `
                                    position: fixed; bottom: 90px; left: 50%;
                                    transform: translateX(-50%);
                                    font-family: 'Noto Sans KR', sans-serif;
                                    font-size: 15px; font-weight: 300;
                                    color: rgba(130, 50, 70, 0.55); letter-spacing: 0.3em;
                                    text-align: center; white-space: nowrap;
                                    opacity: 0; transition: opacity 0.8s ease;
                                    pointer-events: none; z-index: 200;
                                    text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
                                `;
                                keyHint.innerText = keyLabel;
                                document.body.appendChild(keyHint);
                                setTimeout(() => { keyHint.style.opacity = '1'; }, 50);
                            }

                            // 모바일 터치 버튼
                            if ('ontouchstart' in window) {
                                const mobileButtons = document.createElement('div');
                                mobileButtons.style.cssText = `
                                    display: flex; gap: 32px; justify-content: center;
                                    margin-top: 28px;
                                `;
                                ['♥', '♥'].forEach(() => {
                                    const btn = document.createElement('button');
                                    btn.innerText = '●';
                                    btn.style.cssText = `
                                        width: 90px; height: 90px; border-radius: 50%;
                                        border: 2px solid rgba(255,255,255,0.5);
                                        background: rgba(255,255,255,0.1);
                                        color: white; font-size: 28px; font-weight: 300;
                                        cursor: pointer; font-family: 'Noto Sans KR', sans-serif;
                                        -webkit-tap-highlight-color: transparent;
                                        transition: background 0.15s ease;
                                    `;
                                    btn.addEventListener('touchstart', (ev) => {
                                        ev.preventDefault();
                                        btn.style.background = 'rgba(255,255,255,0.25)';
                                        typingScore++;
                                        typingScore = Math.min(MAX_TYPING_SCORE, typingScore);
                                        updateTypingProgress();
                                    });
                                    btn.addEventListener('touchend', () => {
                                        btn.style.background = 'rgba(255,255,255,0.1)';
                                    });
                                    mobileButtons.appendChild(btn);
                                });
                                typingContainer.appendChild(mobileButtons);
                            }

                            const typingAreaEl = document.getElementById('typingArea');
                            typingAreaEl.style.display = 'block';
                            document.getElementById('typingProgress').style.display = 'block';
                            setTimeout(() => typingAreaEl.focus(), 50);
                            typingAreaEl.addEventListener('input', () => {
                                typingAreaEl.scrollTop = typingAreaEl.scrollHeight;
                            });
                        }

                        // ── 모바일: 키 등록 스킵 ──
                        if ('ontouchstart' in window) {
                            registeredKeys.add('__touch__');
                            startTypingPhase(null);
                            return;
                        }

                        // ── 데스크톱: 키 등록 프롬프트 ──
                        const regPrompt = document.createElement('div');
                        regPrompt.style.cssText = `
                            position: fixed; top: 50%; left: 50%;
                            transform: translate(-50%, -50%);
                            font-family: 'Noto Sans KR', sans-serif;
                            font-size: 18px; font-weight: 300;
                            color: rgba(130, 50, 70, 0.88);
                            letter-spacing: 0.1em; text-align: center; line-height: 2.4;
                            opacity: 0; transition: opacity 0.8s ease;
                            pointer-events: none; z-index: 500;
                            text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
                        `;
                        regPrompt.innerHTML = `돌기가 느껴지는 키를 모두 누르고<br>엔터를 눌러주세요`;
                        document.body.appendChild(regPrompt);
                        setTimeout(() => { regPrompt.style.opacity = '1'; }, 50);

                        // 누른 키 표시용
                        const keyDisplay = document.createElement('div');
                        keyDisplay.style.cssText = `
                            position: fixed; top: calc(50% + 80px); left: 50%;
                            transform: translateX(-50%);
                            font-family: 'Noto Sans KR', sans-serif;
                            font-size: 22px; font-weight: 300;
                            color: rgba(130, 50, 70, 0.7);
                            letter-spacing: 0.3em; text-align: center;
                            pointer-events: none; z-index: 500;
                            min-height: 36px;
                            text-shadow: 0 0 14px rgba(235, 80, 130, 0.28);
                        `;
                        document.body.appendChild(keyDisplay);

                        const pendingKeys = new Set();

                        function onKeyRegister(e) {
                            if (e.key === 'Enter') {
                                if (pendingKeys.size === 0) return; // 하나도 안 눌렀으면 무시
                                window.removeEventListener('keydown', onKeyRegister);
                                pendingKeys.forEach(k => registeredKeys.add(k));

                                regPrompt.style.transition = 'opacity 0.3s ease';
                                regPrompt.innerHTML = `<span style="font-size:13px; opacity:0.55; letter-spacing:0.12em;">등록됐어요</span>`;
                                keyDisplay.style.opacity = '0.4';

                                setTimeout(() => {
                                    regPrompt.style.opacity = '0';
                                    keyDisplay.style.opacity = '0';
                                    setTimeout(() => {
                                        regPrompt.remove();
                                        keyDisplay.remove();
                                        startTypingPhase([...pendingKeys].join('  '));
                                    }, 600);
                                }, 900);
                                return;
                            }

                            const ignore = ['Shift','Control','Alt','Meta','CapsLock','Tab','Escape'];
                            if (ignore.includes(e.key)) return;

                            pendingKeys.add(e.key);
                            keyDisplay.innerText = [...pendingKeys].join('  ');
                        }

                        window.addEventListener('keydown', onKeyRegister);
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

    // Update Background Color: 흰색 → 연한 핑크 (#fce8ef) as touchScore 0→1
    let r = Math.floor(255 - (3  * touchScore));
    let g = Math.floor(255 - (40 * touchScore));
    let b = Math.floor(255 - (28 * touchScore));
    if (isClimax) {
        // 클라이맥스: #fce8ef 고정
        r = 252; g = 232; b = 239;
    }
    document.body.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    // Semi-transparent clear to create trailing effects
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(252, 232, 239, 0.18)'; // 연핑크 트레일
    if (!isClimax) {
        ctx.fillRect(0, 0, width, height);
    } else {
        // 클라이맥스: 부드러운 핑크로 fade
        ctx.fillStyle = 'rgba(248, 215, 228, 0.32)';
        ctx.fillRect(0, 0, width, height);

        // 가장자리 glow — 연핑크 계열
        const edgeGrad = ctx.createRadialGradient(
            center.x, center.y, Math.min(width, height) * 0.25,
            center.x, center.y, Math.max(width, height) * 0.85
        );
        edgeGrad.addColorStop(0,   'rgba(220, 140, 170, 0)');
        edgeGrad.addColorStop(0.7, 'rgba(220, 140, 170, 0)');
        edgeGrad.addColorStop(1,   'rgba(220, 140, 170, 0.4)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, width, height);
    }

    // Normal blending for particles to show their exact colors on white
    ctx.globalCompositeOperation = 'source-over';

    // Draw Particles
    for (const p of particles) {
        p.update(currentZoom, Math.max(satisfactionScore * 0.4, touchScore));
        p.draw();
    }

    // Glow effect after 10s (when touchScore approaches 1) or during climax
    if (touchScore > 0.8 || isClimax) {
        ctx.globalCompositeOperation = 'lighter';
        let glowAlpha = (touchScore - 0.8) * 5; // scales 0 to 1
        let explosionRadius = 0;

        if (isClimax) {
            glowAlpha = 1.0;
            const elapsed = Date.now() - climaxStartTime;
            explosionRadius = (elapsed / 1000) * Math.max(width, height) * 1.5; // expand to engulf screen
        }

        ctx.beginPath();
        const radGrad = ctx.createRadialGradient(
            center.x, center.y, Math.max(0, zoneStartR - 50 + explosionRadius * 0.5),
            center.x, center.y, zoneEndR + 50 + explosionRadius
        );
        radGrad.addColorStop(0,   `rgba(220, 140, 170, 0)`);
        radGrad.addColorStop(0.5, `rgba(235, 175, 200, ${glowAlpha * 0.7})`);
        radGrad.addColorStop(1,   `rgba(220, 140, 170, 0)`);

        ctx.fillStyle = radGrad;
        ctx.arc(center.x, center.y, zoneEndR + 50 + explosionRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Stop rendering UI if climax is triggered
    if (isClimax) {
        requestAnimationFrame(animate);
        return;
    }

    // ============================================================
    // [Phase 1 개선 1] 가이드 링 — 점선으로 표시, 만족도에 따라 서서히 사라짐
    // ============================================================
    ctx.globalCompositeOperation = 'source-over';
    const ringOpacity = Math.max(0, 0.15 - satisfactionScore * 0.15);

    if (ringOpacity > 0.002) {
        ctx.save();
        ctx.filter = 'blur(22px)';
        ctx.setLineDash([7, 9]);
        ctx.lineWidth = 1.5;

        // glow — shadowBlur로 은은한 발광
        ctx.shadowBlur = 20;
        ctx.shadowColor = `rgba(210, 70, 70, ${ringOpacity * 3})`;

        // 안쪽 링 (30%)
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneStartR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(210, 70, 70, ${ringOpacity})`;
        ctx.stroke();

        // 바깥쪽 링 (35%)
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneEndR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(210, 70, 70, ${ringOpacity})`;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.filter = 'none';

        // 링 사이 반투명 채움
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneEndR, 0, Math.PI * 2);
        ctx.arc(center.x, center.y, zoneStartR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210, 70, 70, ${ringOpacity * 0.1})`;
        ctx.fill('evenodd');

        ctx.setLineDash([]);
        ctx.restore();
    }

    // ============================================================
    // [Phase 1 개선 2] 줌 UI 박스 — HTML 오버레이 업데이트
    // ============================================================
    const zoomPercent = (currentZoom * 100).toFixed(1);

    if (isSatisfied) {
        zoomUI.style.color = 'rgba(160, 30, 30, 0.6)';
    } else {
        zoomUI.style.color = 'rgba(0, 0, 0, 0.35)';
    }

    let uiParts = [zoomPercent + '%'];
    if (isTouching && satisfactionScore > 0.05) {
        uiParts.push(`속도 ${mouseSpeed.toFixed(1)}`);
    }
    zoomUI.innerText = uiParts.join('  ·  ');

    // ============================================================
    // [Phase 1 개선 3] 온보딩 메시지 — 진입 후 4초간 캔버스에 표시
    // ============================================================
    const elapsedOnboarding = Date.now() - onboardingStartTime;
    if (elapsedOnboarding < ONBOARDING_DURATION) {
        const fadeIn  = Math.min(1, elapsedOnboarding / 600);
        const fadeOut = elapsedOnboarding > ONBOARDING_DURATION - 1000
            ? 1 - (elapsedOnboarding - (ONBOARDING_DURATION - 1000)) / 1000 : 1;
        const alpha = fadeIn * fadeOut;

        ctx.globalCompositeOperation = 'source-over';
        ctx.textAlign = 'center';

        ctx.font = "300 17px 'Noto Sans KR', sans-serif";
        ctx.fillStyle = `rgba(60, 20, 20, ${alpha * 0.75})`;
        ctx.fillText('두 손가락으로 오므려 보세요', center.x, center.y - 18);

        ctx.font = "300 12px 'Noto Sans KR', sans-serif";
        ctx.fillStyle = `rgba(60, 20, 20, ${alpha * 0.4})`;
        ctx.fillText('트랙패드 핀치 또는 마우스 휠', center.x, center.y + 12);
    }

    // ============================================================
    // [Phase 2 개선 1] 쓰다듬기 링 강조 — satisfactionScore > 0.5일 때 목표 구간 면으로 강조
    // ============================================================
    if (satisfactionScore > 0.5) {
        const phase2Alpha = (satisfactionScore - 0.5) * 2; // 0 ~ 1
        ctx.save();

        // blur 필터로 부드러운 발광 영역 (선 없이 면만)
        ctx.filter = 'blur(22px)';

        // 링 바깥쪽 채움
        ctx.beginPath();
        ctx.arc(center.x, center.y, zoneEndR + 65, 0, Math.PI * 2);
        ctx.arc(center.x, center.y, zoneStartR - 65, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 100, 100, ${phase2Alpha * 0.22})`;
        ctx.fill('evenodd');

        // 중심선만 두껍게 한 번 더 (blur 상태로 글로우 강화)
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(center.x, center.y, (zoneStartR + zoneEndR) / 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 110, 110, ${phase2Alpha * 0.18})`;
        ctx.stroke();

        ctx.filter = 'none';
        ctx.restore();
    }

    // ============================================================
    // [Phase 2 개선 2] 커서 인디케이터 — 속도에 따라 색이 변하는 원
    // ============================================================
    if (isTouching && satisfactionScore > 0.5) {
        // 색상 힌트 없이 단색 — 속도 피드백을 직접 읽어야 함
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';

        // 글로우만 (색 없음, 크기도 작게)
        const cursorGrad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 18);
        cursorGrad.addColorStop(0, `rgba(180, 60, 60, 0.18)`);
        cursorGrad.addColorStop(1, `rgba(180, 60, 60, 0)`);
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 18, 0, Math.PI * 2);
        ctx.fillStyle = cursorGrad;
        ctx.fill();

        // 중심 점 (작게)
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 60, 60, 0.5)`;
        ctx.fill();

        ctx.restore();
    }

    // ============================================================
    // [Phase 2 개선 3] 피드백 레이블 — HTML 오버레이로 교체 (CSS transition 적용)
    // ============================================================
    let feedbackText = '';
    let feedbackColor = 'rgba(200, 50, 50, 0.85)';

    if (satisfactionScore > 0.05 && touchScore < 0.1) {
        if (isTouching && isInsideRing && mouseSpeed > 5.5) {
            feedbackText = '너무 거칠어요... 조금 더 조심스럽고 부드럽게...';
        } else if (satisfactionScore > 0.5) {
            feedbackText = '살짝 마우스를 얹고 아주 천천히 쓰다듬어 주세요...';
        }
    } else if (touchScore >= 0.1) {
        const tempNow = (34 + touchScore * 3).toFixed(2);
        if (mouseSpeed > 5.5) {
            feedbackText = '너무 강해요... 진정하세요...';
            feedbackColor = 'rgba(220, 80, 50, 0.9)';
        } else {
            feedbackText = touchScore >= 0.99 ? `${tempNow}°C  완벽해요...` : `${tempNow}°C`;
            feedbackColor = 'rgba(180, 40, 40, 0.85)';
        }
    }

    feedbackUI.innerText = feedbackText;
    feedbackUI.style.color = feedbackColor;
    const feedbackAlpha = satisfactionScore > 0.05 ? Math.min(1, satisfactionScore * 1.5) : 0;
    feedbackUI.style.opacity = feedbackText ? feedbackAlpha.toString() : '0';

    requestAnimationFrame(animate);
}

animate();
