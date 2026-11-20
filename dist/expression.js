const supported = ["angry", "disgusted", "fearful", "happy", "neutral", "sad", "surprised"];
const allLabels = ["angry", "contempt", "disgusted", "fearful", "happy", "neutral", "sad", "surprised"];
const template = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
  [41.5493, 92.3655], [70.7299, 92.2041],
];

function modelConfig(file, size, labels, mean, deviation) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return { file, size, labels, mean, deviation, context: canvas.getContext("2d", { willReadFrequently: true }) };
}

const mobileVit = modelConfig("mobilevit-va-mtl.onnx", 224, allLabels, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
const efficientNet = modelConfig("efficientnet-b2-7.onnx", 260, supported, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
const mobileFaceNet = modelConfig("mobilefacenet.onnx", 112, supported, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);

const wasmDirectory = new URL("./assets/vendor/ort/", import.meta.url).href;

async function configureModel(model, runtime, providers) {
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.wasmPaths = wasmDirectory;
  const session = await runtime.InferenceSession.create(new URL("./assets/models/" + model.file, import.meta.url).href, {
    executionProviders: providers,
    graphOptimizationLevel: "all",
  });
  model.runtime = runtime;
  model.session = session;
  model.backend = providers[0];
}

async function loadAcceleratedModel(model) {
  try {
    if (await navigator.gpu?.requestAdapter()) {
      const runtime = await import("./assets/vendor/ort/ort.webgpu.min.mjs");
      await configureModel(model, runtime, ["webgpu", "wasm"]);
      return;
    }
  } catch (error) {
    console.info("WebGPU unavailable, continuing on WASM", error);
  }
  await configureModel(model, globalThis.ort, ["wasm"]);
}

export async function loadExpressionModels() {
  await Promise.all([loadAcceleratedModel(mobileVit), configureModel(mobileFaceNet, globalThis.ort, ["wasm"])]);
}

let reviewerReady;
async function review(pixels) {
  reviewerReady ??= loadAcceleratedModel(efficientNet).then(() => true).catch((error) => {
    console.warn("Could not load EfficientNet review model", error);
    return false;
  });
  return await reviewerReady ? predict(efficientNet, [{ pixels }]) : undefined;
}

function center(points) {
  return points.reduce(
    ([x, y], [px, py]) => [x + px / points.length, y + py / points.length],
    [0, 0],
  );
}

function alignedCrop(frame, landmarks) {
  const { size, context } = mobileFaceNet;
  const [sx, sy] = center(landmarks);
  const [tx, ty] = center(template);
  let dot = 0;
  let cross = 0;
  let norm = 0;

  // Fit the reference points to the detected landmarks, then invert for canvas rendering.
  template.forEach(([x, y], index) => {
    const u = x - tx;
    const v = y - ty;
    const px = landmarks[index][0] - sx;
    const py = landmarks[index][1] - sy;
    dot += u * px + v * py;
    cross += u * py - v * px;
    norm += u * u + v * v;
  });
  const denominator = dot * dot + cross * cross;
  if (denominator < 1e-8) return null;
  const a = norm * dot / denominator;
  const b = -norm * cross / denominator;
  context.resetTransform();
  context.clearRect(0, 0, size, size);
  context.setTransform(a, b, -b, a, tx - a * sx + b * sy, ty - b * sx - a * sy);
  context.drawImage(frame, 0, 0);
  return context.getImageData(0, 0, size, size).data;
}

function faceCrop(frame, box, model = mobileVit) {
  const { size, context } = model;
  const marginX = box.width * 0.12;
  const marginY = box.height * 0.12;
  const x = Math.max(0, box.x - marginX);
  const y = Math.max(0, box.y - marginY);
  const right = Math.min(frame.width, box.x + box.width + marginX);
  const bottom = Math.min(frame.height, box.y + box.height + marginY);
  context.drawImage(frame, x, y, right - x, bottom - y, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

function uprightCrop(frame, outline, angle, model = mobileVit) {
  const { size, context } = model;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = outline.map(([x, y]) => [cos * x + sin * y, -sin * x + cos * y]);
  const left = Math.min(...rotated.map(([x]) => x));
  const top = Math.min(...rotated.map(([, y]) => y));
  const width = Math.max(...rotated.map(([x]) => x)) - left;
  const height = Math.max(...rotated.map(([, y]) => y)) - top;
  const scaleX = size / (width * 1.24);
  const scaleY = size / (height * 1.24);
  context.save();
  context.fillStyle = "#181818";
  context.fillRect(0, 0, size, size);
  context.setTransform(scaleX * cos, -scaleY * sin, scaleX * sin, scaleY * cos,
    size / 2 - scaleX * (left + width / 2), size / 2 - scaleY * (top + height / 2));
  context.drawImage(frame, 0, 0);
  context.restore();
  return context.getImageData(0, 0, size, size).data;
}

function exposureIssue(pixels) {
  let dark = 0;
  let bright = 0;
  // Measure the center of the crop so background or rotation padding has less influence.
  const size = mobileVit.size;
  const start = Math.round(size * 0.24);
  const end = size - start;
  let samples = 0;
  for (let y = start; y < end; y += 4) {
    for (let x = start; x < end; x += 4) {
      const i = 4 * (y * size + x);
      const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      if (luma < 15) dark += 1;
      if (luma > 246) bright += 1;
      samples += 1;
    }
  }
  if (dark / samples >= 0.53) return "dark";
  if (bright / samples >= 0.53) return "bright";
  return null;
}

async function predict(model, views) {
  const { size, labels, mean, deviation, session, runtime } = model;
  const area = size * size;
  const count = views.length;
  const data = new Float32Array(count * area * 3);
  for (let view = 0; view < count; view++) {
    const { pixels, flip } = views[view];
    const offset = view * area * 3;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        const pixel = 4 * (y * size + (flip ? size - x - 1 : x));
        for (let channel = 0; channel < 3; channel++) {
          data[offset + channel * area + index] = (pixels[pixel + channel] / 255 - mean[channel]) / deviation[channel];
        }
      }
    }
  }
  const tensor = new runtime.Tensor("float32", data, [count, 3, size, size]);
  try {
    let results;
    try {
      results = await session.run({ [session.inputNames[0]]: tensor });
    } catch (error) {
      if (model.backend !== "webgpu") throw error;
      console.info("WebGPU inference failed, retrying on WASM", error);
      await configureModel(model, globalThis.ort, ["wasm"]);
      await session.release().catch(() => {});
      return await predict(model, views);
    }
    const output = results[session.outputNames[0]];
    try {
      const stride = output.data.length / count;
      // MobileViT appends two regression values after the emotion logits.
      const expectedSize = model === mobileVit ? labels.length + 2 : labels.length;
      if (stride !== expectedSize || !output.data.every(Number.isFinite)) {
        throw new Error("Unexpected output from " + model.file);
      }
      const sums = new Float32Array(labels.length);
      for (let view = 0; view < count; view++) {
        const logits = output.data.subarray(view * stride, view * stride + labels.length);
        const max = Math.max(...logits);
        const temperature = model === mobileFaceNet ? 1.3 : 1;
        const probabilities = Array.from(logits, (value) => Math.exp((value - max) / temperature));
        const total = probabilities.reduce((sum, value) => sum + value, 0);
        probabilities.forEach((value, index) => { sums[index] += value / (total * count); });
      }
      return Object.fromEntries(labels.map((key, index) => [key, sums[index]]));
    } finally {
      output.dispose();
    }
  } finally {
    tensor.dispose();
  }
}

function strongest(scores) {
  return Object.keys(scores).reduce((best, key) => scores[key] > scores[best] ? key : best);
}

export function estimateExpression(primary, secondary, reviewed) {
  if (!primary || !secondary) return {};
  const weights = reviewed ? [0.36, 0.24, 0.40] : [0.57, 0.43, 0];
  const models = [primary, secondary, reviewed];
  const expressions = Object.fromEntries(allLabels.map((key) => [
    key, models.reduce((sum, scores, index) => sum + weights[index] * (scores?.[key] ?? 0), 0),
  ]));
  const ranked = allLabels.toSorted((a, b) => expressions[b] - expressions[a]);
  const [top, second] = ranked;
  const margin = expressions[top] - expressions[second];
  const votes = models.filter((scores) => scores && strongest(scores) === top).length;
  // Only MobileViT supports contempt. Require clear evidence from that model for this class.
  const special = top === "contempt";
  const strong = !special && votes >= 2 && expressions[top] >= 0.39 && margin >= 0.12;
  const probable = !special
    ? votes >= 1 && expressions[top] >= 0.25 && margin >= 0.047
    : primary.contempt >= 0.66 && margin >= 0.055;

  return {
    expressions, ranked, label: strong || probable ? top : null,
    confidence: strong ? "strong" : probable ? "probable" : null,
    issue: strong || probable ? undefined : margin < 0.047 ? "close" : "disagree",
  };
}

export async function classifyExpression(frame, { landmarks, outline, detection: { box } }, isPhoto, useReviewer = true) {
  const [left, right] = landmarks;
  const dx = right[0] - left[0];
  const dy = right[1] - left[1];
  if (Math.hypot(dx, dy) < 15) return { issue: "small" };
  if (landmarks.some(([x, y]) => x < 0 || y < 0 || x >= frame.width || y >= frame.height)) return { issue: "cropped" };
  const angle = Math.atan2(dy, dx);
  if (Math.abs(angle) > Math.PI / 3) return { issue: "pose" };

  const crop = faceCrop(frame, box);
  const issue = exposureIssue(crop);
  if (issue) return { issue };
  const aligned = alignedCrop(frame, landmarks);
  if (!aligned) return { issue: "pose" };

  const tilted = Math.abs(angle) >= 0.12;
  const upright = tilted ? uprightCrop(frame, outline, angle) : crop;
  const views = [{ pixels: upright }];
  if (isPhoto || tilted) views.push({ pixels: tilted ? crop : upright, flip: !tilted });
  if (isPhoto && tilted) views.push({ pixels: upright, flip: true });
  const primary = await predict(mobileVit, views);
  const secondary = await predict(mobileFaceNet, [{ pixels: aligned }]);
  const first = estimateExpression(primary, secondary);
  if (!useReviewer || first.confidence === "strong" || first.label === "contempt") return { primary, secondary };
  const reviewCrop = tilted ? uprightCrop(frame, outline, angle, efficientNet) : faceCrop(frame, box, efficientNet);
  let reviewed;
  try {
    reviewed = await review(reviewCrop);
  } catch (error) {
    console.warn("EfficientNet review failed", error);
  }
  return { primary, secondary, reviewed };
}
