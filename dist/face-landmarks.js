import { FaceLandmarker, FilesetResolver } from "./assets/vendor/mediapipe/vision_bundle.mjs";

let landmarker;

export async function loadLandmarks() {
  const base = new URL("./assets/vendor/mediapipe/wasm/", import.meta.url).href;
  const files = await FilesetResolver.forVisionTasks(base.replace(/\/$/, ""));
  landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: new URL("./assets/models/face-landmarker.task", import.meta.url).href,
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    numFaces: 8,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
  });
}

export function detectFaces(frame) {
  const { width, height } = frame;
  const result = landmarker.detect(frame);
  return result.faceLandmarks.map((mesh, index) => {
    const point = (index) => [mesh[index].x * width, mesh[index].y * height];
    const outline = mesh.map(({ x, y }) => [x * width, y * height]);
    const x = Math.max(0, Math.min(...outline.map(([px]) => px)));
    const y = Math.max(0, Math.min(...outline.map(([, py]) => py)));
    const right = Math.min(width, Math.max(...outline.map(([px]) => px)));
    const bottom = Math.min(height, Math.max(...outline.map(([, py]) => py)));
    const eye = (a, b) => point(a).map((value, axis) => (value + point(b)[axis]) / 2);
    const distance = (a, b) => {
      const [x, y] = point(a);
      const [u, v] = point(b);
      return Math.hypot(x - u, y - v);
    };
    const left = (distance(160, 144) + distance(158, 153)) / (2 * distance(33, 133));
    const rightEye = (distance(385, 380) + distance(387, 373)) / (2 * distance(362, 263));
    const categories = result.faceBlendshapes[index]?.categories ?? [];
    const shapes = Object.fromEntries(categories.map(({ categoryName, score }) => [categoryName, score]));
    const blink = Math.min(shapes.eyeBlinkLeft, shapes.eyeBlinkRight);
    const ratio = Math.max(left, rightEye);
    const eyes = Number.isFinite(blink) && Number.isFinite(ratio) ? { blink, ratio } : null;
    return {
      outline, eyes, shapes,
      detection: { box: { x, y, width: right - x, height: bottom - y } },
      landmarks: [eye(33, 133), eye(263, 362), point(1), point(61), point(291)],
    };
  }).filter(({ detection: { box } }) => box.width >= 18 && box.height >= 18);
}
