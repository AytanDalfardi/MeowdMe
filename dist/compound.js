export const compounds = {
  joyfulSurprise: { parts: ["happy", "surprised"], label: "شادی و تعجب", symbol: "✦", comment: "انگار غافلگیری از اون خوب‌ها بوده. برای این قاب یه قطعهٔ شاد و یه قطعهٔ غیرمنتظره داریم." },
  fearfulSurprise: { parts: ["fearful", "surprised"], label: "ترس و تعجب", symbol: "☾", comment: "گاهی غافلگیری چند ثانیه فرصت می‌خواد. می‌تونی با قطعهٔ آروم‌تر شروع کنی." },
  sadAnger: { parts: ["sad", "angry"], label: "غم و خشم", symbol: "☂", comment: "ممکنه یه ریتم محکم بخوای یا فقط یه ملودی برای مکث. هر دو رو برات گذاشتم." },
  angryDisgust: { parts: ["angry", "disgusted"], label: "خشم و انزجار", symbol: "ϟ", comment: "برای این قاب دو آهنگ با ضرب متفاوت انتخاب کردم. هر کدوم با حال‌وهوات جور بود، همون رو بزن." },
  sadFear: { parts: ["sad", "fearful"], label: "غم و ترس", symbol: "☾", comment: "اگه دلت یه مکث می‌خواد، این دو قطعه با ملودی‌های خلوت همراهت می‌شن." },
};

export function matchCompound(estimate, shapes) {
  if (!estimate?.expressions || !shapes) return null;
  const [first, second] = estimate.ranked;
  const top = estimate.expressions[first];
  const runnerUp = estimate.expressions[second];
  if (runnerUp < 0.11 || top + runnerUp < 0.44 || runnerUp < top * 0.22) return null;

  const both = (name) => Math.min(shapes[name + "Left"] ?? 0, shapes[name + "Right"] ?? 0);
  const either = (name) => Math.max(shapes[name + "Left"] ?? 0, shapes[name + "Right"] ?? 0);
  const raisedBrow = Math.max(shapes.browInnerUp ?? 0, both("browOuterUp"));
  const cues = {
    happy: both("mouthSmile") >= 0.32,
    surprised: raisedBrow >= 0.32 && shapes.jawOpen >= 0.24,
    fearful: both("eyeWide") >= 0.22 && either("mouthStretch") >= 0.22,
    sad: shapes.browInnerUp >= 0.29 && both("mouthFrown") >= 0.19,
    angry: both("browDown") >= 0.29 && Math.max(both("mouthPress"), both("eyeSquint")) >= 0.22,
    disgusted: either("noseSneer") >= 0.36 && either("mouthUpperUp") >= 0.18,
  };
  for (const [key, { parts }] of Object.entries(compounds)) {
    if (parts.includes(first) && parts.includes(second) && cues[first] && cues[second]) return key;
  }
  return null;
}
