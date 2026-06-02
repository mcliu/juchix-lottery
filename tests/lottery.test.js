const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const htmlPath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const authConfigPath = path.join(__dirname, "..", "auth-config.js");
const authConfig = fs.readFileSync(authConfigPath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const legacyPlainPassword = ["Jcx", "888888"].join("");

function createElement() {
  const element = {
    className: "",
    value: "",
    textContent: "",
    dataset: {},
    style: {},
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    addEventListener() {},
    focus() {},
    querySelector() { return createElement(); },
    querySelectorAll() { return []; }
  };

  Object.defineProperty(element, "innerHTML", {
    get() { return this._innerHTML || ""; },
    set(value) { this._innerHTML = value; }
  });

  return element;
}

function runPageScript() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElement());
      }
      return elements.get(id);
    },
    createElement() { return createElement(); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  const canvas = createElement();
  canvas.width = 900;
  canvas.height = 900;
  canvas.getContext = () => ({
    clearRect() {},
    save() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    restore() {},
    fillText() {}
  });
  elements.set("wheelCanvas", canvas);

  const context = {
    console,
    document,
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    Math,
    Number,
    String,
    Array,
    Date,
    JSON,
    window: {
      JUCHIX_AUTH_CONFIG: {
        username: "juchix",
        passwordHash: "ad18d99ee2c661abbac4c137ad435df6b8fc303f720d0bc2511cf765c5e9f08a"
      },
      clearTimeout() {},
      setTimeout() {}
    },
    setTimeout() {},
    performance: { now() { return 0; } },
    requestAnimationFrame() {}
  };

  vm.createContext(context);
  vm.runInContext(script, context);
  return context;
}

assert(!html.includes("Mammoth Lucky Draw"), "front page should remove English hero label");
assert(!html.includes("点击一次，转出今天的好运。"), "front page should remove hero heading");
assert(!html.includes("<aside class=\"side-panel\">"), "front page should not show current prizes/history panel");
assert(!html.includes(legacyPlainPassword), "admin password must not be stored as plaintext in page source");
assert(!authConfig.includes(legacyPlainPassword), "admin config must store a password hash instead of plaintext");
assert(authConfig.includes("passwordHash"), "admin config should expose a password hash");
assert(html.includes("logo.png"), "page should reference the supplied logo asset path");
assert(html.includes("fireworksLayer"), "result should include a fireworks layer");

const context = runPageScript();
const samplePrizes = [
  { name: "A", percent: 10 },
  { name: "B", percent: 20 },
  { name: "C", percent: 30 },
  { name: "D", percent: 40 },
  { name: "E", percent: 50 },
  { name: "F", percent: 60 }
];
const segments = context.buildWheelSegments(samplePrizes);
const counts = new Map();
segments.forEach((segment) => counts.set(segment.name, (counts.get(segment.name) || 0) + 1));
assert.strictEqual(segments.length, samplePrizes.length * 2, "each prize should render twice");
samplePrizes.forEach((prize) => {
  assert.strictEqual(counts.get(prize.name), 2, `${prize.name} should render twice`);
});

const firstIndex = segments.findIndex((segment) => segment.name === samplePrizes[0].name);
const target = context.getTargetRotationForSegment(firstIndex, 0, segments.length);
const landedIndex = context.getPointedSegmentIndex(target.rotation, segments.length);
assert.strictEqual(landedIndex, firstIndex, "final pointer should point inside the winning segment");
assert(target.distanceFromBoundary > 0.01, "target must avoid segment boundaries");

for (let index = 0; index < 50; index += 1) {
  const duration = context.getSpinDuration();
  assert(duration >= 10000, "spin duration should be at least 10 seconds");
  assert(duration <= 15000, "spin duration should be at most 15 seconds");
}

assert(context.realisticSpinEase(0.1) < 0.06, "spin should start slowly");
assert(context.realisticSpinEase(0.5) > 0.42, "spin should move decisively through the middle");
assert(context.realisticSpinEase(0.9) > 0.95, "spin should slow near the end after most rotation is complete");
assert.strictEqual(context.realisticSpinEase(1), 1, "spin easing should finish exactly");

Promise.resolve()
  .then(async () => {
    assert.strictEqual(
      context.sha256Ascii(legacyPlainPassword),
      "ad18d99ee2c661abbac4c137ad435df6b8fc303f720d0bc2511cf765c5e9f08a",
      "password helper should produce the stored SHA-256 digest"
    );
    assert.strictEqual(
      await context.isAdminCredentialValid("juchix", legacyPlainPassword),
      true,
      "configured admin credentials should open the backend"
    );
    assert.strictEqual(
      await context.isAdminCredentialValid("juchix", "wrong-password"),
      false,
      "wrong admin password should be rejected"
    );

    console.log("lottery behavior tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
