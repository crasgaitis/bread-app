// safer audio alarm helpers
let audioCtx = null;
let alarmOsc = null;
let alarmGain = null;
let alarmPlaying = false;
let audioAvailable = true;

function ensureAudio() {
  if (!audioAvailable || audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.error("AudioContext init failed:", e);
    audioAvailable = false;
  }
}

// init audio
const initAudioOnGesture = () => ensureAudio();
if (document.body) {
  document.body.addEventListener("click", initAudioOnGesture, { once: true });
} else {
  window.addEventListener("DOMContentLoaded", () => {
    document.body.addEventListener("click", initAudioOnGesture, { once: true });
  }, { once: true });
}

function playAlarm() {
  if (!audioAvailable || alarmPlaying) return;
  try {
    ensureAudio();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
    alarmOsc = audioCtx.createOscillator();
    alarmGain = audioCtx.createGain();
    alarmOsc.type = "sine";
    alarmOsc.frequency.value = 880;
    alarmGain.gain.value = 0.05;
    alarmOsc.connect(alarmGain);
    alarmGain.connect(audioCtx.destination);
    alarmOsc.start();
    alarmPlaying = true;
  } catch (e) {
    console.error("playAlarm error:", e);
    audioAvailable = false;
  }
}

function stopAlarm() {
  if (!alarmPlaying) return;
  try {
    if (alarmOsc) {
      try { alarmOsc.stop(); } catch (_) {}
      alarmOsc.disconnect();
      alarmOsc = null;
    }
    if (alarmGain) {
      alarmGain.disconnect();
      alarmGain = null;
    }
  } catch (e) {
    console.error("stopAlarm error:", e);
  } finally {
    alarmPlaying = false;
  }
}

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const LEFT = { u: 159, l: 145 };
const RIGHT = { u: 386, l: 374 };

let lastLandmarks = null;
let frozenLandmarksFocus = null;
let frozenLandmarksLoaf = null;

let focusValue = null;
let loafValue = null;
let threshold = null;
let faceReady = false;

const captureFocusBtn = document.getElementById("captureFocus");
const captureLoafBtn = document.getElementById("captureLoaf");
const submitBtn = document.getElementById("submitCalibration");

captureFocusBtn.disabled = true;
captureLoafBtn.disabled = true;
submitBtn.disabled = true;

captureFocusBtn.addEventListener("click", () => capture("focus"));
captureLoafBtn.addEventListener("click", () => capture("loaf"));
submitBtn.addEventListener("click", submitCalibration);

// const faceMesh = new FaceMesh({
//   locateFile: f => `vendor/mediapipe/${f}`
// });

const faceMesh = new FaceMesh({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});


faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true
});

faceMesh.onResults(results => {
  if (results.multiFaceLandmarks?.length) {
    lastLandmarks = results.multiFaceLandmarks[0];
    if (!faceReady) {
      faceReady = true;
      captureFocusBtn.disabled = false;
    }
  } else {
    lastLandmarks = null;
  }
});

// ---- Camera
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
  video.srcObject = stream;
});

// ---- Flicker-free render loop
function drawLoop() {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (lastLandmarks) {
    drawEyes(lastLandmarks, "red");
  }

  if (frozenLandmarksFocus) drawEyes(frozenLandmarksFocus, "lime");
  if (frozenLandmarksLoaf) drawEyes(frozenLandmarksLoaf, "lime");

  if (threshold !== null && lastLandmarks) {
    const currentOpenness =
      (eyeOpenness(lastLandmarks, LEFT) +
       eyeOpenness(lastLandmarks, RIGHT)) / 2;

    const stateImage = document.getElementById("stateImage");
    const stateText = document.getElementById("stateText");

    if (currentOpenness < threshold) {
      stateImage.src = "../assets/loafing.png";
      stateText.innerText = "Stop loafing 🍞";
      playAlarm();
    } else {
      stateImage.src = "../assets/focus.png";
      stateText.innerText = "Locked in 🔥";
      stopAlarm();
    }
  }

  requestAnimationFrame(drawLoop);
}


video.addEventListener("loadedmetadata", () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const camera = new Camera(video, {
    onFrame: async () => {
      if (video.readyState >= 2) {
        await faceMesh.send({ image: video });
      }
    },
    width: video.videoWidth,
    height: video.videoHeight
  });

  camera.start();
  drawLoop();
});

// ---- Helpers
function drawEyes(lm, color = "red") {
  ctx.fillStyle = color;
  [LEFT.u, LEFT.l, RIGHT.u, RIGHT.l].forEach(i => {
    const p = lm[i];
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function capture(type) {
  if (!lastLandmarks) return;

  if (type === "focus") {
    frozenLandmarksFocus = lastLandmarks.map(p => ({ ...p }));
    focusValue = (eyeOpenness(lastLandmarks, LEFT) + eyeOpenness(lastLandmarks, RIGHT)) / 2;
    captureFocusBtn.disabled = true;
    captureLoafBtn.disabled = false;
  } else {
    frozenLandmarksLoaf = lastLandmarks.map(p => ({ ...p }));
    loafValue = (eyeOpenness(lastLandmarks, LEFT) + eyeOpenness(lastLandmarks, RIGHT)) / 2;
    captureLoafBtn.disabled = true;
    submitBtn.disabled = false;
  }
}

function submitCalibration() {
  threshold = (focusValue + loafValue) / 2;
  document.getElementById("controls").remove();
  document.getElementById("stateText").innerText = "Calibration complete 🔥";
}

function eyeOpenness(lm, eye) {
  return Math.abs(lm[eye.u].y - lm[eye.l].y);
}
