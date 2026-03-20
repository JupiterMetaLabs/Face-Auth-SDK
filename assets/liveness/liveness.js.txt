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

// --- HEADLESS BRIDGE ---
function broadcastState(instructionCode, promptText, icon, isFaceLocked = false) {
  if (window.ReactNativeWebView) {
    const progressPercent = Math.min(
      100,
      Math.max(0, (consecutiveValidFrames / REQUIRED_CONSECUTIVE_FRAMES) * 100)
    );
    
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "liveness_state",
        data: {
          phase: currentState,
          instructionCode: instructionCode,
          promptText: promptText,
          progressPercent: Math.round(progressPercent),
          isFaceLocked: isFaceLocked,
          icon: icon
        }
      })
    );
  }
}

// Check if we should initialize in headless mode based on URL params or injected variables
if (window.HEADLESS_MODE || new URLSearchParams(window.location.search).get('headless') === 'true') {
  document.body.classList.add('headless-mode');
}

// --- CONFIG ---

const OVERRIDE_SCORE_THRESHOLD = 0.4; // RELAXED: Trust AI if score is reasonable (< 0.4)
const REQUIRED_CONSECUTIVE_FRAMES = 10; // Consistency Check
const DEPTH_THRESHOLD = 0.05; // Z-diff threshold for "3D-ness"
const FACE_WIDTH_FAR_MIN = 0.15; // Arm's length
const FACE_WIDTH_FAR_MAX = 0.3;
const FACE_WIDTH_NEAR_MIN = 0.35; // Close up for perspective check
const PERSPECTIVE_RATIO_THRESHOLD = 1.02; // Lowered from 1.05 to catch 1.03 cases
const VERTICAL_PERSPECTIVE_RATIO_THRESHOLD = 1.04; // Stricter than horizontal — rejects non-frontal angles


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
let baselineVerticalRatio = 0;
let nearVerticalRatio = 0;
let lastValidationTime = 0;

let captureStableFrames = 0; // For near-field stability check
let readyToCapture = false;

const SPOOF_THRESHOLD_FINAL = 0.65; // Per-sample fail threshold (only flag high-confidence spoofs)
const SPOOF_EMA_FAIL_THRESHOLD = 0.60; // EMA-based final decision threshold
const spoofVerdict = {
  isReady: false,
  averageScore: 1.0, // Start pessimistic
  sampleCount: 0,
  failureCount: 0, // Track bad samples for early exit
  minSamples: 5, // Need ~2.5 seconds of data minimum
  alpha: 0.15, // EMA weight for new scores (15% new, 85% history — smooth out noise)

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
      `Spoof sample #${this.sampleCount} | New: ${newScore.toFixed(3)} | EMA: ${this.averageScore.toFixed(3)} | Fails: ${this.failureCount}`
    );

    // Early exit if we hit too many definitive spoof samples
    if (this.failureCount >= 14) {
      console.warn("Liveness: Early exit triggered by 14 failed spoof samples.");
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "error",
            message: "Liveness Check Failed (Spoof Detected)",
          })
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

// Face-plane vertical ratio: face_vector.y (nose_tip - eye_center) / faceWidth
// The nose tip protrudes toward the camera, so face_vector.z != 0 for a real face.
// When moving closer, the nose (closer to camera) scales faster than the eye line,
// making this ratio increase. For a flat photo all landmarks are co-planar so it stays constant.
function calculateVerticalRatio(landmarks) {
  const eyeCenterY = (landmarks[33].y + landmarks[263].y) / 2;
  // face_vector.y = nose_tip.y - eye_center.y (positive = nose below eyes, neutral frontal)
  const faceVectorY = landmarks[1].y - eyeCenterY;
  const faceWidth = Math.hypot(
    landmarks[454].x - landmarks[234].x,
    landmarks[454].y - landmarks[234].y,
  );
  if (faceWidth === 0) return 0;
  return faceVectorY / faceWidth;
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

function calculatePose(landmarks) {
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];

  // Midpoints
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const mouthMidX = (leftMouth.x + rightMouth.x) / 2;
  const mouthMidY = (leftMouth.y + rightMouth.y) / 2;
  
  // Mid-face center (neutral pitch point)
  const midFaceY = (eyeMidY + mouthMidY) / 2;

  // Scaling factors matching FaceRecognition.ts
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const eyeDist = Math.hypot(dx, dy);
  
  // Vertical face height based on eye-to-mouth distance
  const faceHeight = Math.hypot(mouthMidY - eyeMidY, mouthMidX - eyeMidX);

  if (eyeDist === 0 || faceHeight === 0) return { yaw: 0, pitch: 0, roll: 0 };

  // Yaw: Nose horizontal deviation from eye center
  const yaw = ((nose.x - eyeMidX) / eyeDist) * 90;
  
  // Pitch: Nose vertical deviation from eye-mouth vertical midpoint
  const pitch = ((nose.y - midFaceY) / faceHeight) * 90;
  
  // Roll: Ear-to-Ear angle (using eyes for consistency with SCRFD logic)
  const roll = Math.atan2(dy, dx) * (180 / Math.PI);

  return { yaw, pitch, roll };
}


function calculateYaw(landmarks) {
  return calculatePose(landmarks).yaw;
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

  if (newState === STATE.CHALLENGE) {
     const action = activeChallenges[currentChallengeIndex];
     setChallengeUI(action);
     ghostFace.className = "ghost-face active";
     return;
  }

  let instructionCode = "";
  let promptText = "";
  let icon = "";
  let isLocked = false;

  switch (newState) {
    case STATE.SEARCHING_FAR:
      instructionCode = "MOVE_BACK";
      promptText = "Move back to arm's length";
      icon = "📏";
      
      // Legacy DOM
      instructionText.innerText = promptText;
      feedbackIcon.innerText = icon;
      cameraWrapper.className = "camera-circle active";
      progressWrapper.classList.remove("tw-opacity-0");
      break;

    case STATE.RECENTER:
      instructionCode = "CENTER_FACE";
      promptText = "Look directly at camera";
      icon = "😐";
      isLocked = true;
      
      // Legacy DOM
      instructionText.innerText = promptText;
      feedbackIcon.innerText = icon;
      ghostFace.className = "ghost-face active";
      break;

    case STATE.MOVE_CLOSER:
      instructionCode = "MOVE_CLOSER";
      promptText = "Now move closer...";
      icon = "🔍";
      
      // Legacy DOM
      instructionText.innerText = promptText;
      feedbackIcon.innerText = icon;
      cameraWrapper.className = "camera-circle active";
      break;

    case STATE.SUCCESS:
      // HIGH FIX-2: only ever call waitForSpoofVerdict once
      if (!verdictRequested) {
        verdictRequested = true;
        
        instructionCode = "VERIFYING";
        promptText = "Verifying Liveness...";
        icon = "🔍";
        isLocked = true;
        
        // Legacy DOM
        instructionText.innerText = promptText;
        feedbackIcon.innerText = icon;
        waitForSpoofVerdict();
      }
      break;

    case STATE.FAIL:
      instructionCode = "VERIFICATION_FAILED";
      promptText = "Verification Failed";
      icon = "❌";
      
      // Legacy DOM
      instructionText.innerText = promptText;
      instructionText.className = "text-red-500 font-bold mb-8 text-xl";
      feedbackIcon.innerText = icon;
      cameraWrapper.className = "camera-circle fail";
      btnRetry.classList.remove("tw-hidden");
      break;
  }

  broadcastState(instructionCode, promptText, icon, isLocked);
}

function setChallengeUI(action) {
  let instructionCode = "";
  let promptText = "";
  let icon = "";

  switch (action) {
    case "blink":
      instructionCode = "BLINK";
      promptText = "Blink your eyes";
      icon = "😉";
      break;
    case "turnLeft":
      instructionCode = "TURN_LEFT";
      promptText = "Turn head Left";
      icon = "⬅️";
      arrowLeft.style.opacity = "1";
      break;
    case "turnRight":
      instructionCode = "TURN_RIGHT";
      promptText = "Turn head Right";
      icon = "➡️";
      arrowRight.style.opacity = "1";
      break;
  }
  
  // Legacy DOM
  instructionText.innerText = promptText;
  feedbackIcon.innerText = icon;
  
  broadcastState(instructionCode, promptText, icon, true);
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
  readyToCapture = false;
  baselineNoseRatio = 0;
  nearNoseRatio = 0;
  baselineVerticalRatio = 0;
  nearVerticalRatio = 0;

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

  // Calculate face width for distance checks
  const faceWidth = Math.hypot(
    landmarks[454].x - landmarks[234].x,
    landmarks[454].y - landmarks[234].y
  );

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

  // Block progression if not consistent.
  // HIGH FIX-1: SEARCHING_FAR bypasses this gate — it needs to run
  // even before the depth streak is established so the user can position themselves.
  if (
    consecutiveValidFrames < REQUIRED_CONSECUTIVE_FRAMES &&
    currentState !== STATE.SEARCHING_FAR
  ) {
    if (currentState !== STATE.FAIL) {
      feedbackIcon.innerText = "🔒"; // Still building liveness streak
      
      // Don't broadcast this micro-state every frame, just let progress bar handle it.
      // Or we can broadcast the progress update so Native UI loading bars can fill up
      broadcastState("HOLD_STILL", "Hold still", "🔒", false); 
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
          baselineVerticalRatio = calculateVerticalRatio(landmarks);
          console.log("Baseline Captured:", baselineNoseRatio, "V:", baselineVerticalRatio);
          setState(STATE.RECENTER);
        } else {
          instructionText.innerText = "Center your face";
          broadcastState("CENTER_FACE", "Center your face", "😐", false);
        }
      } else if (faceWidth >= FACE_WIDTH_FAR_MAX) {
        instructionText.innerText = "Move further back";
        broadcastState("MOVE_BACK", "Move further back", "📏", false);
      } else {
        instructionText.innerText = "Move closer";
        broadcastState("MOVE_CLOSER", "Move closer", "🔍", false);
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
        const pose = calculatePose(landmarks);
        if (Math.abs(pose.yaw) > 15) {
             instructionText.innerText = "Look straight at the camera";
             broadcastState("LOOK_STRAIGHT", "Look straight at the camera", "😐", false);
             captureStableFrames = 0;
             break;
        }
        if (pose.pitch > 15) {
             instructionText.innerText = `Raise phone to eye level (P:${pose.pitch.toFixed(1)})`;
             broadcastState("HOLD_PHONE_HIGHER", "Raise phone to eye level", "📱", false);
             captureStableFrames = 0;
             break;
        }
        if (pose.pitch < -15) {
             instructionText.innerText = `Lower phone to eye level (P:${pose.pitch.toFixed(1)})`;
             broadcastState("HOLD_PHONE_LOWER", "Lower phone to eye level", "📱", false);
             captureStableFrames = 0;
             break;
        }
        if (Math.abs(pose.roll) > 10) {
             instructionText.innerText = "Keep your head straight";
             broadcastState("HEAD_STRAIGHT", "Keep your head straight", "😐", false);
             captureStableFrames = 0;
             break;
        }

        // Check Centering (Nose must be center)
        const nose = landmarks[1];
        const isCentered = Math.abs(nose.x - 0.5) < 0.15 && Math.abs(nose.y - 0.5) < 0.15;

        if (isCentered) {
          const verticalRatio = calculateVerticalRatio(landmarks);
          instructionText.innerText = `Hold Still (R:${verticalRatio.toFixed(3)})`;
          feedbackIcon.innerText = "📸";
          broadcastState("HOLD_STILL", "Hold Still", "📸", true);
          captureStableFrames++;

          // Require 20 frames of stability (~700-1000ms)
          if (captureStableFrames > 20) {
            nearNoseRatio = calculateNoseRatio(landmarks);
            nearVerticalRatio = calculateVerticalRatio(landmarks);
            console.log("Near Captured:", nearNoseRatio, "V:", nearVerticalRatio);
            setState(STATE.VERIFYING_NEAR);
          }
        } else {
          instructionText.innerText = "Center your face";
          broadcastState("CENTER_FACE", "Center your face", "😐", false);
          captureStableFrames = 0;
        }
      } else {
        instructionText.innerText = "Move Closer";
        broadcastState("MOVE_CLOSER", "Move Closer", "🔍", false);
        captureStableFrames = 0;
      }
      break;

    case STATE.VERIFYING_NEAR:
      // PERSPECTIVE CHECK — horizontal + vertical gates, both must pass (or AI override)
      const ratioChange = nearNoseRatio / baselineNoseRatio;
      // Vertical: face_vector.y/faceWidth at near vs baseline. Nose protrusion causes this
      // ratio to increase for a real 3D face; stays constant for a flat photo/screen.
      const verticalRatioChange = baselineVerticalRatio !== 0
        ? nearVerticalRatio / baselineVerticalRatio
        : 1.0;
      console.log("Perspective Ratio H:", ratioChange, "V:", verticalRatioChange);

      // Check Score Override
      const aiOverride = spoofVerdict.averageScore < OVERRIDE_SCORE_THRESHOLD;

      if ((ratioChange > PERSPECTIVE_RATIO_THRESHOLD && verticalRatioChange > VERTICAL_PERSPECTIVE_RATIO_THRESHOLD) || aiOverride) {
        if (aiOverride)
          console.log(
            "Perspective Override by AI Score:",
            spoofVerdict.averageScore,
          );
        // Passed Geometry checks! Move to final Spoof Verification Gate
        setState(STATE.SUCCESS);
      } else {
        console.warn("Perspective Check Failed. H:", ratioChange, "V:", verticalRatioChange);
        instructionText.innerText = "Verification Failed (2D)";
        setState(STATE.FAIL);
        // MEDIUM FIX: post error reason to RN so it knows why we failed
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: "error",
            message: `Perspective Check Failed. H:${ratioChange.toFixed(3)} V:${verticalRatioChange.toFixed(3)}`,
          }),
        );
      }
      // MEDIUM FIX: break immediately — don't let later frame ticks re-run this
      return;

    case STATE.SUCCESS:
      if (readyToCapture) captureEvidence();
      break;
  }

  if (currentState === STATE.FAIL) {
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
      if (spoofVerdict.averageScore < SPOOF_EMA_FAIL_THRESHOLD) {
        readyToCapture = true;
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
        spoofVerdict.averageScore < SPOOF_EMA_FAIL_THRESHOLD
      ) {
        readyToCapture = true;
      } else if (spoofVerdict.sampleCount === 0) {
        readyToCapture = true;
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
  if (!readyToCapture) return;
  readyToCapture = false;

  if (animationId) cancelAnimationFrame(animationId);
  if (renderAnimationId) cancelAnimationFrame(renderAnimationId);
  if (spoofLoopId) { clearInterval(spoofLoopId); spoofLoopId = null; }

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
// Convert Base64 payload back to Uint8Array for MediaPipe Virtual Filesystem
function base64ToUint8Array(base64) {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const locateFileOverride = (file) => {
  // If the assets have been injected over the RN bridge, we intercept the load
  if (file.endsWith("face_mesh_solution_simd_wasm_bin.wasm") && window.MP_WASM_SIMD_BASE64) {
    return "data:application/wasm;base64," + window.MP_WASM_SIMD_BASE64;
  }
  if (file.endsWith("face_mesh_solution_wasm_bin.wasm") && window.MP_WASM_BASE64) {
    return "data:application/wasm;base64," + window.MP_WASM_BASE64;
  }
  if (file.endsWith("face_mesh_solution_packed_assets.data") && window.MP_DATA_BASE64) {
    // Data file requires a custom blob intercept since it's loaded via XHR/fetch arrayBuffer
    return "data:application/octet-stream;base64," + window.MP_DATA_BASE64;
  }
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
};

let faceMesh = null;

window.initializeLiveness = async function() {
  if (faceMesh) return; // Prevent double init
  
  console.log("Local Config:", {
    hasSimd: !!window.MP_WASM_SIMD_BASE64,
    hasWasm: !!window.MP_WASM_BASE64,
    hasData: !!window.MP_DATA_BASE64
  });

  try {
    faceMesh = new FaceMesh({
      locateFile: locateFileOverride,
    });
    // MEDIUM FIX: maxNumFaces 1 (was 2) — we block on >1 anyway, 1 saves CPU
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    faceMesh.onResults(onResults);
    
    console.log("[Liveness] Initializing FaceMesh WASM engine...");
    await faceMesh.initialize();
    console.log("[Liveness] FaceMesh initialized locally!");
    
    startFlow();
    startCamera();
  } catch (e) {
    console.error("[Liveness] Failed to initialize FaceMesh:", e);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "error", message: "FaceMesh Initialization Error: " + e.message
      }));
    }
  }
};

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
    try {
      if (!faceMesh) {
         console.warn("[Liveness] faceMesh is null in processFrame");
         return;
      }
      await faceMesh.send({ image: videoElement });
    } catch (e) {
      console.error("[Liveness] FaceMesh send error:", e);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "error", message: "FaceMesh Error: " + e.message
        }));
      }
    }
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
// Wait for React Native to call window.initializeLiveness() after injecting models
// startFlow();
// startCamera();
