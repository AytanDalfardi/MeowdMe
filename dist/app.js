import { language, preference, savePreference, setLanguage, tr } from "./i18n.js?v=5";
import { loadLandmarks, detectFaces } from "./face-landmarks.js?v=4";
import { loadExpressionModels, classifyExpression, estimateExpression } from "./expression.js?v=4";
import { moods } from "./moods.js?v=2";
import { loadRecommendations, nextTracks, nextComment } from "./recommendations.js?v=4";
import { compounds, matchCompound } from "./compound.js";
import { observeEyes } from "./alertness.js";

const byId = (id) => document.getElementById(id);
const ui = {
  stage: byId("stage"),
  motion: byId("motion-toggle"),
  preview: byId("preview"),
  video: byId("video"),
  photo: byId("photo"),
  overlay: byId("face-overlay"),
  placeholder: byId("placeholder"),
  placeholderTitle: byId("placeholder-title"),
  placeholderText: byId("placeholder-text"),
  cameraMode: byId("camera-mode"),
  photoMode: byId("photo-mode"),
  camera: byId("camera-action"),
  pick: byId("pick-photo"),
  file: byId("file-input"),
  sample: byId("sample-action"),
  message: byId("message"),
  feedback: byId("capture-feedback"),
  resultJump: byId("result-jump"),
  count: byId("face-count"),
  faceOptions: byId("face-options"),
  dominantName: byId("dominant-name"),
  dominantCaption: byId("dominant-caption"),
  dominantAlternate: byId("dominant-alternate"),
  fusionParts: byId("fusion-parts"),
  dominantScore: byId("dominant-score"),
  scores: byId("scores"),
  moodSymbol: byId("mood-symbol"),
  moodText: byId("mood-text"),
  moodSource: byId("mood-source"),
  refreshTracks: byId("refresh-tracks"),
  nextComment: byId("next-comment"),
  playlist: byId("playlist"),
  tracks: byId("tracks"),
  history: byId("history"),
  historyCount: byId("history-count"),
  historyActions: byId("history-actions"),
  historyEmpty: byId("history-empty"),
  clearHistory: byId("clear-history"),
  theme: byId("theme-preference"),
  language: byId("language-preference"),
};

const labels = {
  happy: "شادی",
  sad: "غم",
  angry: "خشم",
  neutral: "خنثی",
  surprised: "تعجب",
  fearful: "ترس",
  disgusted: "انزجار",
  contempt: "حالت طعنه‌آمیز",
};
let number;
let percent;
let time;
const staticText = [...document.querySelectorAll("[data-i18n]")].map((node) => [node, node.textContent]);
const staticAttrs = [...document.querySelectorAll("[data-i18n-attr]")].map((node) => {
  const attr = node.dataset.i18nAttr;
  return [node, attr, node.getAttribute(attr)];
});
const scoreRows = new Map();
for (const [key, label] of Object.entries(labels)) {
  const row = document.createElement("li");
  row.className = "score-row";
  const name = document.createElement("span");
  name.textContent = label;
  const score = document.createElement("span");
  score.className = "score-number";
  score.textContent = "—";
  row.append(name, score);
  ui.scores.append(row);
  scoreRows.set(key, { row, score });
}

const frame = document.createElement("canvas");
const context = frame.getContext("2d");
let mode = "camera";
let revision = 0;
let stream;
let pendingCamera = false;
let loop;
let lastVideoTime;
let photoUrl;
let activeMedia;
let faces = [];
let frameSize;
let selected = 0;
let currentMood;
let motionPaused = preference("motion", matchMedia("(prefers-reduced-motion: reduce)").matches ? "paused" : "playing") === "paused";
let theme = preference("theme", "dark") === "light" ? "light" : "dark";
let currentMessage = { text: "", tone: "info" };
let currentFeedback = { text: "برای نتیجهٔ بهتر، روبه‌روی دوربین و در نور ملایم باش.", tone: "idle" };
let currentComment = { text: ui.moodText.textContent };
let lastCommentAt = 0;
let visibleTracks = [];
const compoundVisits = new Map();
let recommendationsStarted = false;
let trackRevision = 0;
let history = [];
let lastCameraEntry = { label: "", at: 0 };
let modelStatus = "loading";
let inferenceQueue = Promise.resolve();

applyLanguage(preference("language", "fa"));
const models = loadModels();
async function loadModels() {
  try {
    await Promise.all([loadLandmarks(), loadExpressionModels()]);
    modelStatus = "ready";
  } catch (error) {
    console.error("Could not load models", error);
    modelStatus = "error";
    showMessage("مدل بارگذاری نشد. صفحه را دوباره باز کنید.", "error");
  }
  updateActions();
  renderCaptureFeedback(faces[selected]);
}

function showMessage(text = "", tone = "info") {
  currentMessage = { text, tone };
  const translated = tr(text);
  if (ui.message.textContent !== translated) ui.message.textContent = translated;
  ui.message.hidden = !text;
  ui.message.dataset.tone = tone;
}

function applyMotion() {
  document.documentElement.dataset.motion = motionPaused ? "paused" : "playing";
  ui.motion.textContent = tr(motionPaused ? "پخش انیمیشن" : "توقف انیمیشن");
  ui.motion.setAttribute("aria-pressed", String(motionPaused));
}

function applyTheme(value) {
  theme = value;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === "light" ? "#f0f3ff" : "#0b0c19";
  const dark = theme === "dark";
  ui.theme.setAttribute("aria-checked", String(dark));
  ui.theme.setAttribute("aria-label", language === "fa" ? "حالت تیره" : "Dark mode");
  ui.theme.title = language === "fa"
    ? (dark ? "تغییر به حالت روشن" : "تغییر به حالت تیره")
    : (dark ? "Switch to light mode" : "Switch to dark mode");
}

function applyLanguage(value) {
  setLanguage(value);
  const locale = language === "en" ? "en-US" : "fa-IR";
  number = new Intl.NumberFormat(locale);
  percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  for (const [node, text] of staticText) node.textContent = tr(text);
  for (const [node, attr, text] of staticAttrs) node.setAttribute(attr, tr(text));
  ui.language.title = language === "fa" ? "تغییر به انگلیسی" : "Switch to Persian";
  ui.language.setAttribute("aria-label", language === "fa" ? "زبان فارسی؛ تغییر به انگلیسی" : "English language, switch to Persian");
  for (const [key, { row }] of scoreRows) row.firstElementChild.textContent = tr(labels[key]);
  applyTheme(theme);
  applyMotion();
  renderPlaceholder();
  showMessage(currentMessage.text, currentMessage.tone);
  if (modelStatus === "loading") renderCaptureFeedback();
  else showFeedback(currentFeedback.text, currentFeedback.tone);
  updateActions();
  renderFaceLabels();
  selectFace(selected, false);
  renderHistory();
  if (visibleTracks.length) renderTracks(currentMood, visibleTracks);
  displayComment(currentComment, false);
}


function updateActions() {
  const busy = modelStatus !== "ready";
  ui.camera.hidden = mode !== "camera";
  ui.camera.disabled = busy;
  ui.pick.disabled = busy;
  ui.sample.disabled = busy;
  ui.camera.textContent = tr(stream ? "خاموش کردن وب‌کم" : pendingCamera ? "لغو درخواست وب‌کم" : "روشن کردن وب‌کم");
  ui.pick.className = mode === "photo" ? "primary" : "secondary";
}

function setSource(next) {
  revision += 1;
  clearTimeout(loop);
  lastVideoTime = undefined;
  pendingCamera = false;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = undefined;
  ui.video.srcObject = null;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = undefined;
  ui.photo.removeAttribute("src");
  activeMedia = undefined;
  mode = next;
  for (const [kind, button] of [["camera", ui.cameraMode], ["photo", ui.photoMode]]) {
    button.setAttribute("aria-pressed", String(mode === kind));
  }
  renderPlaceholder();
  showMedia();
  showMessage(modelStatus === "error" ? "مدل بارگذاری نشد. صفحه را دوباره باز کنید." : "", modelStatus === "error" ? "error" : "info");
  updateActions();
  setResults([]);
  return revision;
}

function renderPlaceholder() {
  ui.placeholderTitle.textContent = tr(mode === "photo" ? "عکس را وارد کنید" : "تصویر چهره را وارد کنید");
  ui.placeholderText.textContent = tr(mode === "photo" ? "عکس را انتخاب کنید یا اینجا رها کنید." : "وب‌کم را روشن کنید یا یک عکس انتخاب کنید.");
}

function showMedia(media) {
  activeMedia = media;
  ui.video.hidden = media !== ui.video;
  ui.photo.hidden = media !== ui.photo;
  ui.preview.hidden = !media;
  ui.placeholder.hidden = Boolean(media);
}

function getDimensions(media) {
  return media === ui.video ?
    { width: media.videoWidth, height: media.videoHeight } :
    { width: media.naturalWidth, height: media.naturalHeight };
}

function analyze(media, token) {
  const work = inferenceQueue.then(async () => {
    await models;
    if (token !== revision || modelStatus !== "ready") return;
    const { width, height } = getDimensions(media);
    if (!width || !height) return;
    const limit = media === ui.video ? 720 : 1280;
    const scale = Math.min(1, limit / Math.max(width, height));
    frame.width = Math.max(1, Math.round(width * scale));
    frame.height = Math.max(1, Math.round(height * scale));
    context.drawImage(media, 0, 0, frame.width, frame.height);
    const detected = detectFaces(frame);
    const direction = media === ui.video ? 1 : -1;
    detected.sort((a, b) => direction * (a.detection.box.x - b.detection.box.x));
    const detections = [];
    for (const face of detected) {
      if (token !== revision) return;
      const estimate = await classifyExpression(frame, face, media === ui.photo);
      detections.push({ ...face, ...estimate });
    }
    return { detections, size: { width: frame.width, height: frame.height } };
  });
  inferenceQueue = work.catch(() => {});
  return work;
}

function setResults(detections, size) {
  const previousSelection = faces[selected];
  faces = activeMedia === ui.video ? followFaces(detections) : detections.map((face) => {
    const estimate = estimateExpression(face.primary, face.secondary, face.reviewed);
    return { ...face, ...estimate, compound: matchCompound(estimate, face.shapes) };
  });
  ui.resultJump.hidden = !faces.length;
  frameSize = size;
  selected = Math.max(0, faces.findIndex((face) => previousSelection && face.track === previousSelection.track));

  ui.faceOptions.hidden = faces.length < 2;
  if (ui.faceOptions.childElementCount !== faces.length) {
    ui.faceOptions.replaceChildren();
    ui.overlay.replaceChildren();
    faces.forEach((_, index) => {
      const choose = document.createElement("button");
      choose.type = "button";
      choose.addEventListener("click", () => selectFace(index));
      ui.faceOptions.append(choose);

      const box = document.createElement("div");
      box.className = "face-box";
      const badge = document.createElement("span");
      box.append(badge);
      ui.overlay.append(box);
    });
  }
  renderFaceLabels();
  selectFace(selected);
  positionBoxes();
}

function renderFaceLabels() {
  const count = faces.length;
  ui.count.textContent = count
    ? number.format(count) + (language === "fa" ? " چهره" : count === 1 ? " face" : " faces")
    : tr(activeMedia ? "بدون چهره" : "در انتظار تصویر");
  [...ui.faceOptions.children].forEach((button, index) => {
    const ordinal = number.format(index + 1);
    button.textContent = tr("چهرهٔ") + " " + ordinal;
    ui.overlay.children[index].firstElementChild.textContent = ordinal;
  });
}

function positionBoxes() {
  if (!activeMedia || !frameSize || !faces.length) return;
  const { width, height } = ui.preview.getBoundingClientRect();
  const scale = Math.min(width / frameSize.width, height / frameSize.height);
  const left = (width - frameSize.width * scale) / 2;
  const top = (height - frameSize.height * scale) / 2;
  faces.forEach(({ detection }, index) => {
    const box = detection.box;
    const x = activeMedia === ui.video ? frameSize.width - box.x - box.width : box.x;
    const element = ui.overlay.children[index];
    element.style.left = left + x * scale + "px";
    element.style.top = top + box.y * scale + "px";
    element.style.width = box.width * scale + "px";
    element.style.height = box.height * scale + "px";
  });
}

function overlap(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

function averageScores(scores, previous, weight) {
  if (!scores || !previous) return scores;
  return Object.fromEntries(Object.entries(scores).map(([key, score]) => [
    key, weight * score + (1 - weight) * previous[key],
  ]));
}

function followFaces(detections) {
  const now = performance.now();
  const unmatched = new Set(faces);
  return detections.map((face) => {
    let previous;
    let bestOverlap = 0.30;
    for (const candidate of unmatched) {
      const similarity = overlap(candidate.detection.box, face.detection.box);
      if (similarity > bestOverlap) {
        bestOverlap = similarity;
        previous = candidate;
      }
    }
    unmatched.delete(previous);
    const elapsed = previous ? now - previous.at : 0;
    const weight = Math.min(0.78, Math.max(0.34, 1 - Math.exp(-elapsed / 450)));
    const primary = averageScores(face.primary, previous?.primary, weight);
    const secondary = averageScores(face.secondary, previous?.secondary, weight);
    const reviewed = averageScores(face.reviewed, previous?.reviewed, weight);
    const estimate = estimateExpression(primary, secondary, reviewed);
    const candidate = estimate.label ?? null;
    const frames = candidate === previous?.candidate ? Math.min(2, previous.frames + 1) : 1;
    const label = primary && frames < 2 ? previous?.label ?? null : candidate;
    const confidence = label === candidate ? estimate.confidence : previous?.confidence;
    const eyes = observeEyes(face.issue ? null : face.eyes, previous?.eyeState, now);
    const compoundCandidate = matchCompound(estimate, face.shapes);
    const compoundFrames = compoundCandidate && compoundCandidate === previous?.compoundCandidate
      ? Math.min(3, previous.compoundFrames + 1) : 1;
    const compound = compoundFrames === 3 ? compoundCandidate : null;
    return {
      ...face, ...estimate, primary, secondary, reviewed, candidate, frames, label, confidence, eyeState: eyes,
      compound, compoundCandidate, compoundFrames,
      at: now, track: previous?.track ?? Symbol(),
    };
  });
}

const captureHints = {
  small: "چهره در تصویر کوچیکه. یکم نزدیک‌تر بیا.",
  dark: "تصویر خیلی تیره‌ست. یک منبع نور ملایم روبه‌رو بذار.",
  bright: "نور مستقیم جزئیات چهره رو پوشونده. شدت نور رو کم کن.",
  cropped: "بخشی از چهره بیرون کادره. یکم عقب‌تر برو.",
  pose: "سر خیلی کجه. به دوربین روبه‌رو نگاه کن.",
  close: "امتیاز حالت‌ها به هم نزدیکه. یک لحظه ثابت بمون یا عکس واضح‌تری امتحان کن.",
  disagree: "مدل‌ها روی یک حالت توافق ندارن. یه تصویر روبه‌رو با نور ملایم امتحان کن.",
};

function showFeedback(text, tone) {
  currentFeedback = { text, tone };
  const translated = tr(text);
  if (ui.feedback.lastElementChild.textContent !== translated) ui.feedback.lastElementChild.textContent = translated;
  ui.feedback.dataset.tone = tone;
}

function renderCaptureFeedback(face) {
  if (modelStatus === "loading") {
    showFeedback("در حال بارگذاری مدل", "working");
  } else if (face?.eyeState?.tired) {
    showFeedback("در چند فریم، چشم‌ها برای مدتی بسته موندن.", "warning");
  } else if (face?.compound) {
    showFeedback("برای دو حالت چهره شواهد دیده شد.", "ready");
  } else if (face?.label) {
    if (face.confidence === "probable") showFeedback("حالت محتمل پیدا شد. جزئیات در نتیجهٔ تحلیل هست.", "working");
    else showFeedback("حالت چهره شناسایی شد.", "ready");
  } else if (face?.issue) {
    showFeedback(captureHints[face.issue], "warning");
  } else if (face || activeMedia === ui.video) {
    showFeedback(face ? "در حال بررسی چند فریم…" : "چهره‌ای در کادر دیده نمی‌شه.", face ? "working" : "warning");
  } else {
    showFeedback(activeMedia ? "چهره‌ای در عکس پیدا نشد." : "برای نتیجهٔ بهتر، روبه‌روی دوربین و در نور ملایم باش.", activeMedia ? "warning" : "idle");
  }
}

function displayComment(comment, animate = true) {
  currentComment = comment;
  const translated = tr(comment.text);
  const text = translated === comment.text && comment.source && language === "en"
    ? tr(comment.original ?? comment.text) : translated;
  ui.moodText.textContent = text;
  ui.moodText.dir = "auto";
  ui.moodText.lang = /[\u0600-\u06ff]/.test(text) ? "fa" : "en";
  ui.moodSource.hidden = !comment.source;
  if (comment.source) {
    ui.moodSource.href = comment.source;
    ui.moodSource.textContent = tr(comment.author) + " · " + tr("گنجور") + " ↗";
  }
  if (animate) {
    lastCommentAt = performance.now();
    if (!motionPaused && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ui.moodText.getAnimations().forEach((animation) => animation.cancel());
      ui.moodText.animate([{ opacity: .5, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }],
        { duration: 250, easing: "steps(5, end)" });
    }
  }
}

function renderMood(mood) {
  if (mood === currentMood) return;
  const compound = compounds[mood];
  const entry = moods[mood] ?? compound;
  currentMood = mood;
  document.documentElement.dataset.mood = mood;
  ui.moodSymbol.textContent = entry?.symbol ?? "✧";
  ui.nextComment.hidden = !entry;
  ui.playlist.hidden = !entry;
  if (!entry) {
    displayComment({ text: mood === "uncertain"
      ? "هنوز نتیجهٔ مشخصی نداریم. وضعیت تصویر رو زیر پیش‌نمایش ببین."
      : "یه عکس انتخاب کن یا دوربین رو روشن کن تا شروع کنیم." });
    visibleTracks = [];
    ui.tracks.replaceChildren();
    return;
  }

  refreshComment(mood);
  renderTracks(mood);
  if (!recommendationsStarted) {
    recommendationsStarted = true;
    const requested = trackRevision;
    loadRecommendations().then(({ music }) => {
      if (music && currentMood === mood && requested === trackRevision && !ui.tracks.contains(document.activeElement)) {
        renderTracks(mood);
      }
    });
  }
}

function renderTracks(mood, tracks) {
  if (!tracks) {
    trackRevision += 1;
    visibleTracks = nextTracks(mood);
  }
  ui.tracks.replaceChildren();
  for (const track of tracks ?? visibleTracks) {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.href = track.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const info = document.createElement("span");
    info.className = "track-info";
    info.dir = "ltr";
    const title = document.createElement("strong");
    title.dir = "auto";
    title.textContent = track.title;
    const artist = document.createElement("small");
    artist.dir = "auto";
    artist.textContent = track.artist;
    info.append(title, artist);

    const style = document.createElement("small");
    style.className = "track-style";
    style.textContent = tr(track.style);
    if (track.part) {
      const origin = document.createElement("span");
      origin.className = "track-origin";
      origin.textContent = tr(labels[track.part]);
      style.append(origin);
    }
    const icon = document.createElement("span");
    icon.className = "track-play";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▷";
    link.append(icon, info, style);
    row.append(link);
    ui.tracks.append(row);
  }
}

function renderFusionParts(compound, scores) {
  ui.fusionParts.hidden = !compound;
  if (!compound) return;
  const parts = compound.parts;
  if (ui.fusionParts.firstElementChild?.dataset.part !== parts[0] ||
      ui.fusionParts.lastElementChild?.dataset.part !== parts[1]) {
    ui.fusionParts.replaceChildren(...parts.map((part) => {
      const item = document.createElement("li");
      item.className = "fusion-part";
      item.dataset.part = part;
      return item;
    }));
  }
  [...ui.fusionParts.children].forEach((item, index) => {
    const part = parts[index];
    const text = tr(labels[part]) + (scores ? " " + percent.format(scores[part]) : "");
    if (item.textContent !== text) item.textContent = text;
  });
}

function detectedMood(face) {
  return face?.eyeState?.tired ? "tired" : face?.compound ?? face?.label;
}

function selectFace(index, refreshFeedback = true) {
  selected = index;
  const face = faces[index];
  const current = face?.expressions;
  const mood = detectedMood(face);
  const tired = mood === "tired";
  const compound = compounds[mood];
  const label = tired || compound ? null : face?.label;
  const probable = label && face.confidence === "probable";
  const close = !tired && !compound && !label && face?.ranked?.length && (face.issue || activeMedia === ui.photo);
  ui.dominantCaption.textContent = tr(compound ? "ترکیب احتمالی" : probable ? "حالت محتمل" : "حالت غالب");
  ui.dominantName.textContent = tr(tired ? "نشانهٔ خستگی"
    : compound?.label ?? (label ? labels[label] : close ? "دو حالت نزدیک" : face?.issue ? "تصویر نامناسب" : face ? "در حال بررسی" : "—"));
  ui.dominantAlternate.hidden = !close;
  if (close) ui.dominantAlternate.textContent = face.ranked.slice(0, 2).map((key) => tr(labels[key])).join(tr(" یا "));
  renderFusionParts(compound, current);
  ui.dominantScore.hidden = tired || Boolean(compound);
  ui.dominantScore.textContent = label && current ? percent.format(current[label]) : "—";
  renderMood(mood ?? (face ? "uncertain" : "idle"));
  if (refreshFeedback) renderCaptureFeedback(face);
  [...ui.faceOptions.children].forEach((button, position) => {
    const active = position === index;
    button.setAttribute("aria-pressed", String(active));
    ui.overlay.children[position].dataset.active = String(active);
  });
  for (const [key, { row, score: scoreText }] of scoreRows) {
    row.classList.toggle("active", key === label || Boolean(compound?.parts.includes(key)));
    scoreText.textContent = current ? percent.format(current[key]) : "—";
  }
}

function record(label, score, source) {
  history.unshift({ label, score, source, at: new Date() });
  history = history.slice(0, 12);
  renderHistory();
}

function renderHistory() {
  ui.history.replaceChildren();
  for (const entry of history) {
    const row = document.createElement("li");
    const detail = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = tr(entry.label === "tired" ? "نشانهٔ خستگی" : compounds[entry.label]?.label ?? labels[entry.label]);
    const source = document.createElement("small");
    source.textContent = [tr(entry.source.name), entry.source.face ? tr("چهرهٔ") + " " + number.format(entry.source.face) : "",
      entry.source.likely ? tr("احتمالی") : ""].filter(Boolean).join(" · ");
    detail.append(label, source);
    const score = document.createElement("span");
    score.className = "history-score";
    score.textContent = entry.score === undefined ? "—" : percent.format(entry.score);
    const timestamp = document.createElement("time");
    timestamp.dateTime = entry.at.toISOString();
    timestamp.dir = "ltr";
    timestamp.textContent = time.format(entry.at);
    row.append(detail, score, timestamp);
    ui.history.append(row);
  }
  const empty = history.length === 0;
  ui.history.hidden = empty;
  ui.historyEmpty.hidden = !empty;
  ui.clearHistory.disabled = empty;
  ui.historyActions.hidden = empty;
  ui.historyCount.hidden = empty;
  ui.historyCount.textContent = empty ? "" : number.format(history.length);
}

async function analyzePhoto(file) {
  if (modelStatus !== "ready") return;
  const token = setSource("photo");
  if (file && ((file.type && !file.type.startsWith("image/")) || file.size > 25 * 1024 * 1024)) {
    showMessage("یک فایل تصویری تا ۲۵ مگابایت انتخاب کنید.", "error");
    return;
  }
  photoUrl = file ? URL.createObjectURL(file) : undefined;
  ui.photo.src = photoUrl ?? "assets/astronaut.jpg";
  showFeedback("در حال تحلیل عکس…", "working");
  try {
    await ui.photo.decode();
    if (token !== revision) return;
    showMedia(ui.photo);
    const result = await analyze(ui.photo, token);
    if (token !== revision || !result) return;
    setResults(result.detections, result.size);
    faces.forEach(({ expressions, label, confidence, compound }, index) => {
      if (!label && !compound) return;
      record(compound ?? label, compound ? undefined : expressions[label], {
        name: file ? "عکس" : "عکس نمونه", face: faces.length > 1 ? index + 1 : null,
        likely: Boolean(compound) || confidence === "probable",
      });
    });
  } catch (error) {
    if (token !== revision) return;
    console.error("Could not analyze photo", error);
    setSource("photo");
    showMessage("باز کردن یا تحلیل عکس ممکن نبود. یک عکس JPG، PNG یا WebP امتحان کنید.", "error");
  }
}

async function cameraTick(token) {
  if (token !== revision) return;
  try {
    if (ui.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && ui.video.currentTime !== lastVideoTime) {
      lastVideoTime = ui.video.currentTime;
      const result = await analyze(ui.video, token);
      if (token !== revision) return;
      if (result) {
        setResults(result.detections, result.size);
        const face = faces[selected];
        const label = detectedMood(face);
        const inferred = label === "tired" || Boolean(face?.compound);
        if (label && (inferred || (label === face.candidate && face.frames >= 2))) {
          const now = Date.now();
          const elapsed = now - lastCameraEntry.at;
          if (elapsed >= 10000 || (elapsed >= 3000 && label !== lastCameraEntry.label)) {
            lastCameraEntry = { label, at: now };
            record(label, inferred ? undefined : face.expressions[label], {
              name: "وب‌کم", likely: inferred || face.confidence === "probable",
            });
            if (label === currentMood && performance.now() - lastCommentAt >= 1500) refreshComment(label);
          }
        }
      }
    }
    loop = setTimeout(() => cameraTick(token), 180);
  } catch (error) {
    if (token !== revision) return;
    console.error("Camera inference failed", error);
    setSource("camera");
    showMessage("تحلیل وب‌کم متوقف شد. وب‌کم را دوباره روشن کنید.", "error");
  }
}

async function toggleCamera() {
  if (modelStatus !== "ready") return;
  if (stream || pendingCamera) {
    setSource("camera");
    return;
  }
  const token = setSource("camera");
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage("برای دسترسی به وب‌کم، صفحه را در مرورگری با پشتیبانی وب‌کم و از نشانی محلی باز کنید.", "error");
    return;
  }
  pendingCamera = true;
  updateActions();
  showFeedback("برای شروع، اجازهٔ دوربین رو در مرورگر تأیید کن.", "working");
  try {
    const requested = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false,
    });
    if (token !== revision) {
      requested.getTracks().forEach((track) => track.stop());
      return;
    }
    pendingCamera = false;
    stream = requested;
    ui.video.srcObject = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (token !== revision) return;
        setSource("camera");
        showMessage("ارتباط با وب‌کم قطع شد.", "error");
      }, { once: true });
    }
    await ui.video.play();
    if (token !== revision) return;
    showMedia(ui.video);
    updateActions();
    showFeedback("در حال جست‌وجوی چهره…", "working");
    lastCameraEntry = { label: "", at: 0 };
    cameraTick(token);
  } catch (error) {
    if (token !== revision) return;
    setSource("camera");
    const messages = {
      NotAllowedError: "دسترسی به وب‌کم داده نشد. مجوز دوربین را در مرورگر فعال کنید.",
      NotFoundError: "وب‌کمی پیدا نشد. برای تحلیل، یک عکس انتخاب کنید.",
      NotReadableError: "وب‌کم در دسترس نیست. برنامه‌های دیگری را که از آن استفاده می‌کنند ببندید.",
    };
    showMessage(messages[error.name] ?? "وب‌کم باز نشد. دوباره تلاش کنید یا یک عکس انتخاب کنید.", "error");
  }
}

ui.cameraMode.addEventListener("click", () => { if (mode !== "camera") setSource("camera"); });
ui.photoMode.addEventListener("click", () => { if (mode !== "photo") setSource("photo"); });
ui.camera.addEventListener("click", toggleCamera);
ui.pick.addEventListener("click", () => ui.file.click());
ui.sample.addEventListener("click", () => analyzePhoto());
ui.file.addEventListener("change", () => {
  const [file] = ui.file.files;
  ui.file.value = "";
  if (file) analyzePhoto(file);
});
ui.stage.addEventListener("dragover", (event) => {
  if (!event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  if (modelStatus === "ready") ui.stage.classList.add("dragging");
});
ui.stage.addEventListener("dragleave", (event) => {
  if (!ui.stage.contains(event.relatedTarget)) ui.stage.classList.remove("dragging");
});
ui.stage.addEventListener("drop", (event) => {
  event.preventDefault();
  ui.stage.classList.remove("dragging");
  const [file] = event.dataTransfer.files;
  if (file) analyzePhoto(file);
});
function refreshComment(mood, sourced = false) {
  const compound = compounds[mood];
  if (!compound) {
    if (moods[mood]) displayComment(nextComment(mood, sourced));
    return;
  }
  const count = compoundVisits.get(mood) ?? 0;
  compoundVisits.set(mood, count + 1);
  const [part, alternate] = count % 2 ? compound.parts : [...compound.parts].reverse();
  const message = count || sourced ? nextComment(part, sourced) : { text: compound.comment };
  displayComment(message.text === currentComment.text ? nextComment(alternate, sourced) : message);
}
ui.nextComment.addEventListener("click", () => refreshComment(currentMood, true));
ui.motion.addEventListener("click", () => {
  motionPaused = !motionPaused;
  if (motionPaused) stopPreferenceEffects();
  savePreference("motion", motionPaused ? "paused" : "playing");
  applyMotion();
});
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;
let activeTransition;
let fallbackEffect;

function stopPreferenceEffects() {
  if (activeTransition) {
    activeTransition.transition.skipTransition();
    activeTransition.commit();
    activeTransition = undefined;
  }
  fallbackEffect?.cancel();
  delete root.dataset.reveal;
  delete root.dataset.iconFlight;
}

function changePreference(kind) {
  stopPreferenceEffects();
  const value = kind === "theme"
    ? (theme === "dark" ? "light" : "dark")
    : (language === "fa" ? "en" : "fa");
  const commit = () => {
    if (kind === "theme") applyTheme(value);
    else applyLanguage(value);
    savePreference(kind, value);
    if (!motionPaused && !reducedMotion.matches) root.dataset.iconFlight = kind;
  };
  if (motionPaused || reducedMotion.matches) {
    commit();
    return;
  }

  const bounds = ui.theme.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  root.style.setProperty("--reveal-x", x + "px");
  root.style.setProperty("--reveal-y", y + "px");
  root.style.setProperty("--reveal-radius", Math.ceil(Math.hypot(
    Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)
  )) + "px");

  if (!document.startViewTransition) {
    commit();
    if (root.animate) {
      const frames = kind === "theme"
        ? [{ clipPath: "circle(0 at var(--reveal-x) var(--reveal-y))" },
           { clipPath: "circle(var(--reveal-radius) at var(--reveal-x) var(--reveal-y))" }]
        : [{ transform: `translateX(${value === "fa" ? 12 : -12}vw)`, opacity: .2 },
           { transform: "none", opacity: 1 }];
      // Keep the controls reachable while the content enters in older browsers.
      fallbackEffect = document.querySelector("main").animate(frames,
        { duration: 720, easing: "cubic-bezier(.32,0,.22,1)" });
    }
    return;
  }

  root.dataset.reveal = kind === "theme" ? "iris" : value;
  let committed = false;
  const commitOnce = () => {
    if (committed) return;
    committed = true;
    commit();
  };
  const transition = document.startViewTransition(commitOnce);
  // Rapid input can skip a snapshot before the browser has captured it.
  transition.ready.catch(() => {});
  activeTransition = { transition, commit: commitOnce };
  transition.finished.finally(() => {
    if (activeTransition?.transition === transition) {
      activeTransition = undefined;
      delete root.dataset.reveal;
    }
  });
}

document.querySelector(".nav-controls").addEventListener("animationend", event => {
  const flight = root.dataset.iconFlight;
  if ((flight === "theme" && event.animationName === "orbit-pass") ||
      (flight === "language" && event.animationName === "card-to-front")) {
    delete root.dataset.iconFlight;
  }
});
reducedMotion.addEventListener("change", stopPreferenceEffects);
// A pointer press radiates from the contact point; keyboard activation starts in the centre.
document.addEventListener("click", event => {
  const button = event.target.closest?.("button");
  if (!button || button.disabled || motionPaused || reducedMotion.matches) return;
  const box = button.getBoundingClientRect();
  button.style.setProperty("--touch-x", event.detail ? (event.clientX - box.left) + "px" : "50%");
  button.style.setProperty("--touch-y", event.detail ? (event.clientY - box.top) + "px" : "50%");
  if (button.classList.contains("button-pulse")) {
    button.classList.remove("button-pulse");
    void button.offsetWidth;
  }
  button.classList.add("button-pulse");
}, true);
document.addEventListener("animationend", event => {
  if (event.animationName === "touch-light") event.target.classList.remove("button-pulse");
});

ui.theme.addEventListener("click", () => changePreference("theme"));
ui.language.addEventListener("click", () => changePreference("language"));
ui.refreshTracks.addEventListener("click", () => {
  if (moods[currentMood] || compounds[currentMood]) renderTracks(currentMood);
});
ui.clearHistory.addEventListener("click", () => {
  history = [];
  renderHistory();
});
new ResizeObserver(positionBoxes).observe(ui.preview);
window.addEventListener("pagehide", () => setSource(mode));
