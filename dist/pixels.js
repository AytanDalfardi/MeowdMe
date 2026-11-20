import { compounds } from "./compound.js";

const stage = document.getElementById("pixel-scene");
const portrait = document.getElementById("pixel-mood");
const sceneContext = stage.getContext("2d");
const avatarContext = portrait.getContext("2d");
const mascot = document.querySelector(".identity img");
mascot.addEventListener("load", animate, { once: true });
const backdrop = document.createElement("canvas");
backdrop.width = stage.width;
backdrop.height = stage.height;
const background = backdrop.getContext("2d");
const sceneWidth = 144;
const sceneHeight = 64;
// Draw in art coordinates on a denser backing grid to retain the fractional sprite details.
background.scale(backdrop.width / sceneWidth, backdrop.height / sceneHeight);
sceneContext.scale(stage.width / sceneWidth, stage.height / sceneHeight);
avatarContext.scale(portrait.width / 48, portrait.height / 48);
const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const expressions = {
  idle: {
    eyes: [[7, 14, 7, 5], [8, 13, 5, 7], [18, 14, 7, 5], [19, 13, 5, 7]],
    pupils: true,
    mouth: [[13, 21, 1, 1], [14, 22, 4, 1], [18, 21, 1, 1]],
  },
  tired: {
    eyes: [[9, 16, 5, 1], [18, 16, 5, 1], [12, 17, 1, 1], [19, 17, 1, 1]],
    mouth: [[15, 21, 2, 2]],
  },
  neutral: {
    eyes: [[7, 14, 7, 5], [8, 13, 5, 7], [18, 14, 7, 5], [19, 13, 5, 7]],
    pupils: true,
    mouth: [[13, 21, 6, 1]],
  },
  happy: {
    eyes: [[9, 15, 1, 2], [10, 14, 3, 1], [13, 15, 1, 2], [18, 15, 1, 2], [19, 14, 3, 1], [22, 15, 1, 2]],
    mouth: [[11, 20, 10, 2], [12, 22, 8, 1], [14, 23, 4, 1]],
    beats: [[1, 10], [27, 7]],
  },
  sad: {
    eyes: [[9, 14, 1, 2], [10, 13, 3, 1], [11, 16, 2, 2], [19, 13, 3, 1], [22, 14, 1, 2], [19, 16, 2, 2]],
    mouth: [[14, 21, 4, 1], [13, 22, 1, 1], [18, 22, 1, 1]],
  },
  angry: {
    eyes: [[9, 12, 2, 1], [11, 13, 2, 1], [12, 14, 2, 3], [21, 12, 2, 1], [19, 13, 2, 1], [18, 14, 2, 3]],
    mouth: [[12, 21, 8, 2], [14, 20, 4, 1]],
    beats: [[1, 7], [27, 9]],
  },
  surprised: {
    eyes: [[8, 13, 6, 6], [9, 12, 4, 8], [18, 13, 6, 6], [19, 12, 4, 8]],
    pupils: true,
    mouth: [[14, 19, 4, 5], [13, 20, 6, 3]],
    beats: [[1, 9], [27, 5]],
  },
  fearful: {
    eyes: [[9, 12, 5, 1], [10, 15, 3, 3], [18, 12, 5, 1], [19, 15, 3, 3]],
    mouth: [[13, 20, 6, 1], [12, 21, 8, 2]],
  },
  disgusted: {
    eyes: [[9, 14, 5, 2], [18, 15, 5, 2]],
    mouth: [[12, 22, 3, 1], [15, 21, 5, 1], [20, 20, 1, 1]],
  },
  contempt: {
    eyes: [[10, 14, 3, 4], [18, 14, 5, 1], [20, 15, 2, 2]],
    mouth: [[13, 22, 5, 1], [18, 21, 2, 1], [20, 20, 1, 1]],
  },
  uncertain: {
    eyes: [[10, 14, 3, 4], [19, 15, 4, 1]],
    mouth: [[14, 21, 3, 1], [17, 20, 3, 1]],
  },
};

const distantTowers = [
  [0, 29, 9], [10, 21, 8], [18, 29, 7], [28, 13, 5], [34, 20, 10],
  [46, 26, 9], [56, 17, 7], [64, 28, 8], [75, 12, 9], [87, 22, 5],
  [96, 27, 9], [115, 13, 7], [123, 22, 8], [135, 11, 9],
];
const foregroundTowers = [
  [2, 24, 13], [18, 12, 18], [39, 25, 10], [52, 8, 13], [70, 25, 9],
  [82, 17, 15], [108, 23, 16], [127, 16, 15],
];
const rain = [[1, 9], [17, 31], [30, 0], [41, 17], [49, 46], [65, 1], [70, 28], [88, 5], [106, 29], [128, 6], [141, 37]];

let mood = "idle";
let displayedTheme;
let palette;
let startedAt;
let timeout;

function blocks(context, color, rectangles) {
  context.fillStyle = color;
  for (const rect of rectangles) context.fillRect(...rect);
}

function sparkle(context, color, x, y, wide) {
  blocks(context, color, wide
    ? [[x + 2, y, 1, 5], [x, y + 2, 5, 1]]
    : [[x + 1, y, 1, 3], [x, y + 1, 3, 1]]);
}

function drawCat(context, x, y, frame, scale = 1) {
  if (!mascot.complete || !mascot.naturalWidth) return;
  const { accent, glow } = palette;
  const pair = compounds[mood]?.parts;
  const eyes = expressions[pair?.[1] ?? mood] ?? expressions.idle;
  const mouth = expressions[pair?.[0] ?? mood] ?? eyes;
  const active = (key) => mood === key || pair?.includes(key);
  const blink = frame % 35 === 30 && !active("surprised");
  const shiver = active("fearful") && frame % 8 > 5 ? (frame % 2 ? 1 : -1) : 0;
  const jump = active("surprised") && frame % 18 < 3 ? 2 : 0;
  context.save();
  context.translate(x + shiver, y - jump - Number(frame % 18 > 13));
  context.scale(scale, scale);
  context.imageSmoothingEnabled = false;
  context.drawImage(mascot, 0, 0, 48, 48);

  // Keep the shared mascot's face intact at rest. Only repaint the expression in a result.
  const restingFace = mood === "idle" || mood === "angry";
  if (!restingFace || blink) {
    blocks(context, "#39364f", [[8, 20, 14, 9], [26, 20, 14, 9], [11, 29, 11, 1], [26, 29, 11, 1]]);
    context.save();
    context.translate(0, 3);
    context.scale(1.5, 1.25);
    blocks(context, "#ffcf74", blink ? [[8, 17, 5, 1], [19, 17, 5, 1]] : eyes.eyes);
    if (!blink && eyes.pupils) blocks(context, "#181727", [[10, 14, 2, 4], [20, 14, 2, 4]]);
    context.restore();
  }
  if (!restingFace) {
    blocks(context, "#39364f", [[19, 33, 9, 4]]);
    context.save();
    context.translate(0, 8);
    context.scale(1.5, 1.25);
    blocks(context, "#211d30", mouth.mouth);
    context.restore();
  }
  context.scale(1.5, 1.5);
  for (const [px, py] of eyes.beats ?? []) {
    sparkle(context, frame % 8 < 3 ? glow : accent, px, py, false);
  }
  if ((mood === "happy" || mood === "joyfulSurprise") && frame % 18 < 8) {
    const y = 4 - Number(frame % 18 > 3);
    blocks(context, "#edb2c3", [[13, y, 2, 1], [16, y, 2, 1], [13, y + 1, 5, 1], [14, y + 2, 3, 1], [15, y + 3, 1, 1]]);
  }
  if (active("sad") && frame % 12 > 5) blocks(context, "#a7d6ff", [[23, 20 + frame % 4, 1, 2]]);
  if (active("surprised") && frame % 16 < 7) {
    blocks(context, "#ffdb95", [[29, 4, 1, 4], [29, 9, 1, 1]]);
  }
  if (active("angry") && frame % 12 < 7) {
    blocks(context, "#ff8e9d", [[0, 6, 3, 1], [1, 7, 1, 2], [0, 9, 2, 1], [0, 10, 1, 1]]);
  }
  if (active("tired")) {
    const z = 6 - Math.floor(frame % 16 / 4);
    blocks(context, "#bdafff", [[29, z, 3, 1], [30, z + 1, 1, 1], [29, z + 2, 3, 1]]);
  }
  if (!pair && (mood === "idle" || mood === "neutral") && frame % 28 > 23) {
    blocks(context, "#b3e7e4", [[3, 5, 1, 2], [2, 4, 1, 1]]);
  }
  context.restore();
}

function paintCity() {
  const horizon = 51;
  const light = displayedTheme === "light";
  const sky = light
    ? ["#e0e8fb", "#e4e4fa", "#deddf5", "#d9d1ee", "#d9c6e9"]
    : ["#0d1024", "#13152e", "#1d1740", "#29184a", "#3b1d57"];
  sky.forEach((color, index) => blocks(background, color, [[0, index * 11, 144, 11]]));
  for (const [x, y, width] of distantTowers) {
    blocks(background, light ? "#b1abcd" : "#2b2850", [[x, y, width, horizon - y]]);
    for (let row = y + 4; row < horizon; row += 4) {
      for (let col = x + 2; col < x + width - 1; col += 3) {
        if ((col * 5 + row * 11) % 7 < 3) blocks(background, "#68517d", [[col, row, 1, 1]]);
      }
    }
  }
  for (const [index, [x, y, width]] of foregroundTowers.entries()) {
    const face = light ? (index % 2 ? "#6d7398" : "#7c739a") : (index % 2 ? "#171e38" : "#1e2040");
    blocks(background, face, [[x, y, width, horizon - y], [x + 3, y - 2, width - 6, 2]]);
    blocks(background, "#38365c", [[x, y, width, 1], [x + width - 1, y + 1, 1, horizon - y]]);
    // Roof hardware, illuminated cornices and varied window panes on the finer grid.
    const rim = light ? "#bbb9cd" : "#63607e";
    blocks(background, rim, [[x + 3, y - 2, width - 6, .5], [x + 2, y + 1, width - 4, .5]]);
    blocks(background, face, [[x + 4, y - 3.5, 3, 1.5], [x + width - 4, y - 5, .5, 5]]);
    blocks(background, "#eaa5bb", [[x + width - 4, y - 5.5, .5, .5]]);
    for (let row = y + 4; row < horizon - 1; row += 5) {
      for (let col = x + 2; col < x + width - 2; col += 4) {
        const hue = (col * 17 + row * 13) % 11;
        if (hue < 7) {
          blocks(background, hue < 2 ? "#ee80ce" : hue < 4 ? "#55cbd9" : "#707ba7", [[col, row, 2, 1.5]]);
          blocks(background, face, [[col + 1, row, .25, 1.5]]);
        }
      }
    }
  }
  blocks(background, "#7d3878", [[15, 19, 25, 10], [48, 31, 19, 5], [26, 9, 1, 4], [60, 4, 1, 5]]);
  blocks(background, "#ed7dd4", [[16, 20, 23, 1], [16, 28, 23, 1], [16, 21, 1, 7], [38, 21, 1, 7]]);
  blocks(background, "#222044", [[17, 21, 21, 7], [48, 32, 19, 3]]);
  blocks(background, "#ff9fda", [[19, 23, 3, 3], [24, 22, 1, 4], [27, 23, 4, 1], [33, 22, 3, 4]]);
  blocks(background, "#73e7ec", [[48, 31, 19, 1], [48, 35, 19, 1], [52, 33, 4, 1], [59, 33, 5, 1]]);
  blocks(background, light ? "#8886a3" : "#0e1125", [[0, 51, 144, 13]]);
  blocks(background, "#333050", [[0, 52, 144, 1], [5, 58, 25, 1], [74, 59, 22, 1]]);
  blocks(background, "#934e89", [[13, 54, 28, 1], [20, 57, 18, 1], [26, 60, 10, 1], [115, 54, 25, 1]]);
  blocks(background, "#367a8b", [[49, 54, 19, 1], [52, 57, 14, 1], [49, 62, 11, 1], [111, 59, 23, 1]]);
}

function drawScene(frame) {
  sceneContext.clearRect(0, 0, sceneWidth, sceneHeight);
  sceneContext.drawImage(backdrop, 0, 0, sceneWidth, sceneHeight);
  for (const [index, [startX, startY]] of rain.entries()) {
    const travel = (startY + frame * (index % 2 + 3)) % 54;
    const x = (startX + Math.floor(travel / 5)) % sceneWidth;
    blocks(sceneContext, index % 3 === 0 ? "#6588a577" : "#7cc5d347", [[x, travel, 1, 3], [x - 1, travel + 3, 1, 1]]);
  }
  if (frame % 15 < 11) blocks(sceneContext, "#f6b0e6", [[16, 20, 23, 1]]);
  drawCat(sceneContext, 73, 3, frame, 1.25);
}

function draw(frame) {
  if (stage.getClientRects().length) drawScene(frame);
  avatarContext.clearRect(0, 0, 48, 48);
  drawCat(avatarContext, 0, 0, frame);
}

function animate() {
  clearTimeout(timeout);
  const now = performance.now();
  if (startedAt === undefined) startedAt = now;
  draw(reducedMotion.matches || root.dataset.motion === "paused" ? 0 : Math.floor((now - startedAt) / 145));
  if (!document.hidden && !reducedMotion.matches && root.dataset.motion !== "paused") timeout = setTimeout(animate, 145);
}

function applyMood() {
  mood = root.dataset.mood ?? "idle";
  const theme = root.dataset.theme ?? "dark";
  if (theme !== displayedTheme) {
    displayedTheme = theme;
    paintCity();
  }
  const style = getComputedStyle(root);
  palette = {
    accent: style.getPropertyValue("--sprite-accent").trim() || style.getPropertyValue("--accent").trim(),
    glow: "#f4e8ff",
  };
  startedAt = undefined;
  animate();
}

new MutationObserver(applyMood).observe(root, { attributes: true, attributeFilter: ["data-mood", "data-theme", "data-motion"] });
new ResizeObserver(animate).observe(stage);
document.addEventListener("visibilitychange", animate);
reducedMotion.addEventListener("change", animate);
applyMood();
