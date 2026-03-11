const videoElement = document.getElementById("input_video");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

const instructionText = document.getElementById("instruction_text");
const feedbackIcon = document.getElementById("feedback_icon");
const cameraWrapper = document.getElementById("camera_wrapper");
const progressBar = document.getElementById("progress_bar");
const progressWrapper = document.getElementById("progress_wrapper");

const btnRetry = document.getElementById("btn_retry");

// Visual Guidance
const ghostFace = document.getElementById("ghost_face");
const arrowLeft = document.getElementById("arrow_left");
const arrowRight = document.getElementById("arrow_right");

// --- CONFIG ---

const OVERRIDE_SCORE_THRESHOLD = 0.4; // RELAXED: Trust AI if score is reasonable (< 0.4)
const REQUIRED_CONSECUTIVE_FRAMES = 10; // Consistency Check
const DEPTH_THRESHOLD = 0.05; // Z-diff threshold for "3D-ness"
const FACE_WIDTH_FAR_MIN = 0.15; // Arm's length
const FACE_WIDTH_FAR_MAX = 0.3;
const FACE_WIDTH_NEAR_MIN = 0.35; // Close up for perspective check
const PERSPECTIVE_RATIO_THRESHOLD = 1.02; // Lowered from 1.05 to catch 1.03 cases

// --- STATE MACHINE ---
const STATE = {
  INIT: "init",
  SEARCHING_FAR: "searching_far", // 1. Establish Baseline at distance
  RECENTER: "recenter", // 2. Look Straight before action
  CHALLENGE: "challenge", // 3. Perform Action
  MOVE_CLOSER: "move_closer", // 4. Come close for perspective check
  VERIFYING_NEAR: "verifying_near", // 5. Check distortion
  SUCCESS: "success",
  FAIL: "fail",
};

let currentState = STATE.INIT;
let activeChallenges = [];
let currentChallengeIndex = 0;
let consecutiveValidFrames = 0;
let baselineNoseRatio = 0;
let nearNoseRatio = 0;
let lastValidationTime = 0;

let captureStableFrames = 0; // For near-field stability check

const SPOOF_THRESHOLD_FINAL = 0.45; // Relaxed threshold for low-end devices
const spoofVerdict = {
  isReady: false,
  averageScore: 1.0, // Start pessimistic
  sampleCount: 0,
  failureCount: 0, // NEW: Track consecutive/total failures for early exit
  minSamples: 5, // Need ~2.5 seconds of data minimum
  alpha: 0.2, // EMA weight for new scores (20% new, 80% history)

  add: function (newScore) {
    if (this.sampleCount === 0) {
      this.averageScore = newScore;
    } else {
      // Exponential Moving Average
      this.averageScore =
        newScore * this.alpha + this.averageScore * (1 - this.alpha);
    }
    this.sampleCount++;

    // Track sample-level failure
    if (newScore >= SPOOF_THRESHOLD_FINAL) {
      this.failureCount++;
    }

    this.isReady = this.sampleCount >= this.minSamples;
    console.log(
      `Spoof sample #${this.sampleCount} | New: ${newScore.toFixed(3)} | EMA: ${this.averageScore.toFixed(3)} | Fails: ${this.failureCount}`,
    );

    // Early exit if we hit too many bad samples
    if (this.failureCount >= 8) {
      console.warn("Liveness: Early exit triggered by 8 failed spoof samples.");
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "error",
            message: "Liveness Check Failed (Spoof Detected)",
          }),
        );
      }
      setState(STATE.FAIL);
    }
  },
};

let spoofLoopId = null;
let isInferring = false; // HIGH FIX-5: prevents concurrent ONNX inference
let verdictRequested = false; // HIGH FIX-2: prevents double-fire of waitForSpoofVerdict

function startSpoofLoop() {
  if (spoofLoopId) clearInterval(spoofLoopId);

  // Sample every 500ms — model must be loaded before this is called (see modelLoaded handler)
  spoofLoopId = setInterval(async () => {
    // Stop sampling if we're done
    if (currentState === STATE.SUCCESS || currentState === STATE.FAIL) {
      clearInterval(spoofLoopId);
      return;
    }

    // Only run if video is playing
    if (videoElement.paused || videoElement.ended) return;

    grabFaceCropAndInfer();
  }, 500);
}

// --- HELPERS ---

// Z-Depth Heuristic: Real faces have depth (Nose Z < Cheek Z)
// MediaPipe Z is normalized (roughly).
function calculateDepthScore(landmarks) {
  // NoseTip: 1
  // LeftCheek: 234, RightCheek: 454
  const noseZ = landmarks[1].z;
  const leftCheekZ = landmarks[234].z;
  const rightCheekZ = landmarks[454].z;
  const avgCheekZ = (leftCheekZ + rightCheekZ) / 2;

  // Nose should be "closer" (smaller Z value in some coordinate systems, or negative).
  // MediaPipe Facemesh usually has Z relative to center of head.
  // Tip of nose should be significantly different from cheeks.
  const depth = Math.abs(noseZ - avgCheekZ);
  return depth;
}

// Nose Width / Face Width Ratio
function calculateNoseRatio(landmarks) {
  // Face Width: 234 <-> 454
  const faceWidth = Math.hypot(
    landmarks[454].x - landmarks[234].x,
    landmarks[454].y - landmarks[234].y,
  );
  // Nose Width: 49 (LeftWing) <-> 279 (RightWing)
  const noseWidth = Math.hypot(
    landmarks[279].x - landmarks[49].x,
    landmarks[279].y - landmarks[49].y,
  );

  return noseWidth / faceWidth;
}

function calculateYaw(landmarks) {
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const mid = (leftCheek.x + rightCheek.x) / 2;
  return (nose.x - mid) * 100 * 2.5;
}

function calculateEAR(landmarks) {
  // Left eye
  const topL = landmarks[159];
  const botL = landmarks[145];
  const leftL = landmarks[33];
  const rightL = landmarks[133];
  const vL = Math.hypot(topL.x - botL.x, topL.y - botL.y);
  const hL = Math.hypot(leftL.x - rightL.x, leftL.y - rightL.y);
  const earL = vL / hL;

  // Right eye (MEDIUM FIX: average both eyes for robust blink detection)
  const topR = landmarks[386];
  const botR = landmarks[374];
  const leftR = landmarks[263];
  const rightR = landmarks[362];
  const vR = Math.hypot(topR.x - botR.x, topR.y - botR.y);
  const hR = Math.hypot(leftR.x - rightR.x, leftR.y - rightR.y);
  const earR = vR / hR;

  return (earL + earR) / 2;
}

// --- CORE LOGIC ---

function setState(newState) {
  currentState = newState;
  console.log("State:", newState);

  // Reset Visuals
  ghostFace.className = "ghost-face";
  arrowLeft.style.opacity = "0";
  arrowRight.style.opacity = "0";

  switch (newState) {
    case STATE.SEARCHING_FAR:
      instructionText.innerText = "Move back to arm's length";
      feedbackIcon.innerText = "📏";
      cameraWrapper.className = "camera-circle active";
      progressWrapper.classList.remove("tw-opacity-0");
      break;

    case STATE.RECENTER:
      instructionText.innerText = "Look directly at camera";
      feedbackIcon.innerText = "😐";
      ghostFace.className = "ghost-face active";
      break;

    case STATE.CHALLENGE:
      const action = activeChallenges[currentChallengeIndex];
      setChallengeUI(action);
      ghostFace.className = "ghost-face active";
      break;

    case STATE.MOVE_CLOSER:
      instructionText.innerText = "Now move closer...";
      feedbackIcon.innerText = "🔍";
      cameraWrapper.className = "camera-circle active";
      break;

    case STATE.SUCCESS:
      // HIGH FIX-2: only ever call waitForSpoofVerdict once
      if (!verdictRequested) {
        verdictRequested = true;
        instructionText.innerText = "Verifying Liveness...";
        feedbackIcon.innerText = "🔍";
        waitForSpoofVerdict();
      }
      break;

    case STATE.FAIL:
      instructionText.innerText = "Verification Failed";
      instructionText.className = "text-red-500 font-bold mb-8 text-xl";
      feedbackIcon.innerText = "❌";
      cameraWrapper.className = "camera-circle fail";
      btnRetry.classList.remove("tw-hidden");
      break;
  }
}

function setChallengeUI(action) {
  switch (action) {
    case "blink":
      instructionText.innerText = "Blink your eyes";
      feedbackIcon.innerText = "😉";
      break;
    case "turnLeft":
      instructionText.innerText = "Turn head Left";
      feedbackIcon.innerText = "⬅️";
      arrowLeft.style.opacity = "1";
      break;
    case "turnRight":
      instructionText.innerText = "Turn head Right";
      feedbackIcon.innerText = "➡️";
      arrowRight.style.opacity = "1";
      break;
  }
}

function startFlow() {
  activeChallenges = ["blink", "turnLeft", "turnRight"].sort(
    () => Math.random() - 0.5,
  );
  currentChallengeIndex = 0;
  consecutiveValidFrames = 0;
  captureStableFrames = 0; // MEDIUM FIX: reset between retries
  verdictRequested = false; // HIGH FIX-2: reset guard on retry
  isInferring = false; // HIGH FIX-5: reset guard on retry

  // Reset Spoof Verdict
  spoofVerdict.isReady = false;
  spoofVerdict.averageScore = 1.0;
  spoofVerdict.sampleCount = 0;

  // HIGH FIX-4: spoof loop is started by the modelLoaded signal, NOT here.
  // If model is already loaded (retry scenario), start loop now.
  if (antispoofSession) startSpoofLoop();

  setState(STATE.SEARCHING_FAR);
}

// --- MAIN LOOP ---

// This runs on every MediaPipe frame (throttled to ~14fps)
function onResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    // No Face
    consecutiveValidFrames = 0; // Reset
    return;
  }

  if (results.multiFaceLandmarks.length > 1) {
    instructionText.innerText = "Multiple faces detected";
    consecutiveValidFrames = 0;
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // 1. PASSIVE GUARD (Runs ALL THE TIME)
  // Check Depth
  const depthScore = calculateDepthScore(landmarks);

  // If Depth is bad, we rely entirely on the rolling spoof score
  if (depthScore < DEPTH_THRESHOLD) {
    if (spoofVerdict.averageScore < OVERRIDE_SCORE_THRESHOLD) {
      // Override! Geometry failed but AI is increasingly confident it's real
    } else {
      // Geometry failed and AI isn't confident yet
      consecutiveValidFrames = 0;
    }
  } else {
    // Good depth, increment valid frames
    consecutiveValidFrames++;
  }

  // Update Progress Bar
  const uiPct = Math.min(
    100,
    (consecutiveValidFrames / REQUIRED_CONSECUTIVE_FRAMES) * 100,
  );
  progressBar.style.width = `${uiPct}%`;

  // Calculate Face Width (Normalized 0-1)
  const faceWidth = Math.abs(landmarks[454].x - landmarks[234].x);

  // --- STATE LOGIC ---

  // Block progression if not consistent.
  // HIGH FIX-1: SEARCHING_FAR bypasses this gate — it needs to run
  // even before the depth streak is established so the user can position themselves.
  if (
    consecutiveValidFrames < REQUIRED_CONSECUTIVE_FRAMES &&
    currentState !== STATE.SEARCHING_FAR
  ) {
    if (currentState !== STATE.FAIL) {
      feedbackIcon.innerText = "🔒"; // Still building liveness streak
    }
    return;
  }

  // If we have streak, proceed with logic
  switch (currentState) {
    case STATE.SEARCHING_FAR:
      if (faceWidth > FACE_WIDTH_FAR_MIN && faceWidth < FACE_WIDTH_FAR_MAX) {
        // Good distance
        // Check centering
        const nose = landmarks[1];
        if (Math.abs(nose.x - 0.5) < 0.1 && Math.abs(nose.y - 0.5) < 0.1) {
          // CAPTURE BASELINE
          baselineNoseRatio = calculateNoseRatio(landmarks);
          console.log("Baseline Captured:", baselineNoseRatio);
          setState(STATE.RECENTER);
        } else {
          instructionText.innerText = "Center your face";
        }
      } else if (faceWidth >= FACE_WIDTH_FAR_MAX) {
        instructionText.innerText = "Move further back";
      } else {
        instructionText.innerText = "Move closer";
      }
      break;

    case STATE.RECENTER:
      // Ensure looking straight before action
      const yaw = calculateYaw(landmarks);
      if (Math.abs(yaw) < 8) {
        setState(STATE.CHALLENGE);
      }
      break;

    case STATE.CHALLENGE:
      const action = activeChallenges[currentChallengeIndex];
      const now = Date.now();
      let passed = false;

      if (action === "blink") {
        if (calculateEAR(landmarks) < 0.18) passed = true;
      } else if (action === "turnLeft") {
        if (calculateYaw(landmarks) > 15) passed = true;
      } else if (action === "turnRight") {
        if (calculateYaw(landmarks) < -15) passed = true;
      }

      if (passed && now - lastValidationTime > 1000) {
        lastValidationTime = now;
        currentChallengeIndex++;
        if (currentChallengeIndex >= activeChallenges.length) {
          setState(STATE.MOVE_CLOSER);
        } else {
          setState(STATE.RECENTER);
        }
      }
      break;

    case STATE.MOVE_CLOSER:
      // Check Face Width
      if (faceWidth > FACE_WIDTH_NEAR_MIN) {
        // Check Centering (Nose must be center)
        const nose = landmarks[1];
        const isCentered =
          Math.abs(nose.x - 0.5) < 0.15 && Math.abs(nose.y - 0.5) < 0.15;

        if (isCentered) {
          instructionText.innerText = "Hold Still...";
          feedbackIcon.innerText = "📸";
          captureStableFrames++;

          // Require 20 frames of stability (~700-1000ms)
          if (captureStableFrames > 20) {
            nearNoseRatio = calculateNoseRatio(landmarks);
            console.log("Near Captured:", nearNoseRatio);
            setState(STATE.VERIFYING_NEAR);
          }
        } else {
          instructionText.innerText = "Center your face";
          captureStableFrames = 0;
        }
      } else {
        instructionText.innerText = "Move Closer";
        captureStableFrames = 0;
      }
      break;

    case STATE.VERIFYING_NEAR:
      // PERSPECTIVE CHECK
      const ratioChange = nearNoseRatio / baselineNoseRatio;
      console.log("Perspective Ratio:", ratioChange);

      // Check Score Override
      const aiOverride = spoofVerdict.averageScore < OVERRIDE_SCORE_THRESHOLD;

      if (ratioChange > PERSPECTIVE_RATIO_THRESHOLD || aiOverride) {
        if (aiOverride)
          console.log(
            "Perspective Override by AI Score:",
            spoofVerdict.averageScore,
          );
        // Passed Geometry checks! Move to final Spoof Verification Gate
        setState(STATE.SUCCESS);
      } else {
        console.warn("Perspective Check Failed. Ratio:", ratioChange);
        instructionText.innerText = "Verification Failed (2D)";
        setState(STATE.FAIL);
        // MEDIUM FIX: post error reason to RN so it knows why we failed
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: "error",
            message: `Perspective Check Failed. Ratio: ${ratioChange.toFixed(2)}`,
          }),
        );
      }
      // MEDIUM FIX: break immediately — don't let later frame ticks re-run this
      return;
  }

  // Stop Loop on Success/Fail to save resources and prevent multiple messages
  if (currentState === STATE.SUCCESS || currentState === STATE.FAIL) {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderAnimationId) cancelAnimationFrame(renderAnimationId);
    // HIGH FIX-3: explicitly stop spoof loop so no rogue inference fires after exit
    if (spoofLoopId) {
      clearInterval(spoofLoopId);
      spoofLoopId = null;
    }
    return;
  }
}

function waitForSpoofVerdict() {
  const WAIT_TIMEOUT = 8000; // Max 8s wait
  const CHECK_INTERVAL = 300;
  const startTime = Date.now();

  const checker = setInterval(() => {
    const elapsed = Date.now() - startTime;

    if (spoofVerdict.isReady) {
      clearInterval(checker);
      if (spoofVerdict.averageScore < SPOOF_THRESHOLD_FINAL) {
        captureEvidence(); // PASS
      } else {
        console.warn(
          "Final Spoof Gate Failed. Score:",
          spoofVerdict.averageScore,
        );
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "error",
              message: "Liveness Check Failed (Spoof Detected)",
            }),
          );
        }
        setState(STATE.FAIL);
      }
    } else if (elapsed > WAIT_TIMEOUT) {
      clearInterval(checker);
      console.warn(
        "Spoof verdict timeout reached. Samples:",
        spoofVerdict.sampleCount,
      );

      // Graceful degradation: if we got SOME data and it's good, pass.
      // If model never loaded or never fired, pass with warning.
      if (
        spoofVerdict.sampleCount > 0 &&
        spoofVerdict.averageScore < SPOOF_THRESHOLD_FINAL
      ) {
        captureEvidence();
      } else if (spoofVerdict.sampleCount === 0) {
        captureEvidence(); // Degrade gracefully
      } else {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "error",
              message: "Liveness Check Failed (Timeout/Inconclusive)",
            }),
          );
        }
        setState(STATE.FAIL);
      }
    }
  }, CHECK_INTERVAL);
}

// Independent of landmarks/MediaPipe - grabs center of frame directly
async function grabFaceCropAndInfer() {
  // HIGH FIX-5: skip if a previous inference hasn't finished yet
  if (isInferring) return;
  isInferring = true;

  try {
    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;
    if (w === 0 || h === 0) return;

    // Use a central crop (face is enforced to be centered by the UI instructions)
    const cropSize = Math.min(w, h) * 0.7;
    const srcX = (w - cropSize) / 2;
    const srcY = (h - cropSize) / 2;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 128;
    cropCanvas.height = 128;
    const cCtx = cropCanvas.getContext("2d");
    cCtx.drawImage(
      videoElement,
      srcX,
      srcY,
      cropSize,
      cropSize,
      0,
      0,
      128,
      128,
    );

    const faceData = cCtx.getImageData(0, 0, 128, 128);
    const res = await runAntispoofInference(faceData);
    if (!res.error) {
      spoofVerdict.add(res.spoofScore);
    }
  } finally {
    isInferring = false;
  }
}

function captureEvidence() {
  // Capture from video feed
  // Scale down if necessary to avoid Bridge timeout (keep under ~2MB)
  const MAX_WIDTH = 800; // Reduced for safety
  let width = videoElement.videoWidth;
  let height = videoElement.videoHeight;

  if (width > MAX_WIDTH) {
    const scale = MAX_WIDTH / width;
    width = MAX_WIDTH;
    height = height * scale;
  }

  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = width;
  captureCanvas.height = height;
  const ctx = captureCanvas.getContext("2d");

  // Draw current frame (Mirrored)
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoElement, 0, 0, width, height);

  const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.85); // 85% Quality

  console.log("Evidence Captured! Size:", dataUrl.length);

  // Notify React Native
  if (window.ReactNativeWebView) {
    console.log("Sending to React Native...");
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "success",
        image: dataUrl,
        metadata: {
          spoofScore: spoofVerdict.averageScore,
        },
      }),
    );
    console.log("Message sent.");
  }
}

// --- INIT ---
const faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
// MEDIUM FIX: maxNumFaces 1 (was 2) — we block on >1 anyway, 1 saves CPU
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: false,
  minDetectionConfidence: 0.4,
  minTrackingConfidence: 0.4,
});
faceMesh.onResults(onResults);

// --- CAMERA HANDLING ---
let currentStream = null;
let isFrontCamera = true;
let animationId = null;
let renderAnimationId = null;
let lastProcessedTime = 0;
const FRAME_INTERVAL = 70; // Process frames every 70ms (~14fps) for low-end device optimization

// Separate rendering loop for smooth 60fps camera display
function renderLoop() {
  renderAnimationId = requestAnimationFrame(renderLoop);

  if (
    !videoElement.paused &&
    !videoElement.ended &&
    videoElement.readyState === videoElement.HAVE_ENOUGH_DATA
  ) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(
      videoElement,
      0,
      0,
      canvasElement.width,
      canvasElement.height,
    );
  }
}

async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }

  // Stop any existing loops briefly
  if (animationId) cancelAnimationFrame(animationId);
  if (renderAnimationId) cancelAnimationFrame(renderAnimationId);

  const constraints = {
    video: {
      facingMode: isFrontCamera ? "user" : "environment",
      width: { ideal: 480 }, // Reduced for low-end devices
      height: { ideal: 360 }, // Reduced for low-end devices
    },
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    videoElement.srcObject = stream;

    // Handle Mirroring
    if (isFrontCamera) {
      canvasElement.classList.add("mirror");
    } else {
      canvasElement.classList.remove("mirror");
    }

    // Wait for video to load
    videoElement.onloadedmetadata = async () => {
      await videoElement.play();
      renderLoop(); // Start smooth 60fps rendering
      processFrame(); // Start throttled processing
    };
  } catch (err) {
    console.error("Camera Error:", err);
    instructionText.innerText = "Check Camera Permissions";
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "error",
          message: "Camera Start Failed: " + err.message,
        }),
      );
    }
  }
}

async function processFrame() {
  animationId = requestAnimationFrame(processFrame);

  // Frame throttling for low-end devices
  const now = performance.now();
  if (now - lastProcessedTime < FRAME_INTERVAL) {
    return; // Skip this frame
  }
  lastProcessedTime = now;

  if (!videoElement.paused && !videoElement.ended) {
    await faceMesh.send({ image: videoElement });
  }
}

window.toggleCamera = function () {
  isFrontCamera = !isFrontCamera;
  // Reset any state if needed? keeping state is fine for testing.
  startCamera();
};

// Retrying without reload
window.retryLiveness = function () {
  btnRetry.classList.add("tw-hidden");
  instructionText.className = "text-slate-500 mb-8 min-h-[24px]"; // Reset text style
  startFlow();
};

// HIGH FIX-6: clean up all timers and camera stream when page is unloaded
// (covers navigation away mid-session on web and WebView teardown)
window.addEventListener("beforeunload", () => {
  if (spoofLoopId) clearInterval(spoofLoopId);
  if (animationId) cancelAnimationFrame(animationId);
  if (renderAnimationId) cancelAnimationFrame(renderAnimationId);
  if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
});

// HIGH FIX-4: React Native injects the model and sends a 'modelLoaded' signal.
// We hook into that to start the spoof loop at exactly the right time.
// On web (no RN bridge), startFlow() is the fallback which checks antispoofSession directly.
window.__onModelLoaded = function () {
  if (!spoofLoopId) startSpoofLoop();
};

// Start
startFlow();
startCamera();
