// A transparent, hand-built estimator — not a trained model.
// The point isn't the arithmetic, it's the idea: confidence should be
// a first-class output, and it should widen as risk factors stack up,
// not stay a flat +/- guess. See README.md for what a production
// version (real data, real road-network times, a fitted model) needs.

const distanceInput = document.getElementById('distance');
const distanceVal = document.getElementById('distanceVal');
const complexityGroup = document.getElementById('complexity');
const timeInput = document.getElementById('time');
const weatherInput = document.getElementById('weather');
const reliabilityInput = document.getElementById('reliability');
const estimateBtn = document.getElementById('estimateBtn');
const resultCard = document.getElementById('resultCard');
const etaRange = document.getElementById('etaRange');
const confidenceBadge = document.getElementById('confidenceBadge');
const confidenceText = document.getElementById('confidenceText');
const breakdown = document.getElementById('breakdown');
const explainText = document.getElementById('explainText');
const curveCanvas = document.getElementById('curve');

const COMPLEXITY_ORDER = ['fast', 'sitdown', 'grocery'];
let complexityValue = complexityGroup.dataset.value || 'fast';

// --- distance slider: live label + fill track ---
function syncDistanceUI() {
  const min = parseFloat(distanceInput.min);
  const max = parseFloat(distanceInput.max);
  const value = parseFloat(distanceInput.value);
  const pct = ((value - min) / (max - min)) * 100;
  distanceInput.style.setProperty('--range-progress', `${pct}%`);
  distanceVal.textContent = `${value} mi`;
}
distanceInput.addEventListener('input', () => {
  syncDistanceUI();
  requestAnimationFrame(estimate);
});

// --- segmented "what are you ordering" control ---
complexityGroup.addEventListener('click', (event) => {
  const btn = event.target.closest('.segmented-option');
  if (!btn) return;
  complexityValue = btn.dataset.value;
  complexityGroup.dataset.value = complexityValue;
  complexityGroup.style.setProperty('--seg-index', COMPLEXITY_ORDER.indexOf(complexityValue));
  [...complexityGroup.querySelectorAll('.segmented-option')].forEach((el) => {
    const active = el === btn;
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-checked', String(active));
  });
  estimate();
});

// --- live recompute on any other field change ---
[timeInput, weatherInput, reliabilityInput].forEach((el) => {
  el.addEventListener('change', estimate);
});

// Baseline prep time by order type (minutes)
const PREP_TIME = { fast: 6, sitdown: 14, grocery: 18 };

// Average travel speed (mph), degraded by weather
const BASE_SPEED = 22;
const WEATHER_SPEED_FACTOR = { clear: 1.0, rain: 0.75, snow: 0.55 };

// Extra buffer minutes added during rush windows (kitchen backlog + traffic)
const TIME_OF_DAY_BUFFER = { off: 0, lunch: 6, dinner: 9 };

// A restaurant's own consistency directly widens or narrows the band —
// this is the one factor that isn't about the trip, it's about how
// predictable the kitchen itself is order to order.
const RELIABILITY_FACTOR = { consistent: 0, variable: 1, unpredictable: 2.5 };

// Each of these adds "risk points" that widen the confidence band.
// Points compound rather than just summing linearly once several
// conditions stack — that's the one deliberately non-obvious rule here,
// modeling the idea that a bad-weather rush-hour order is riskier than
// "bad weather risk + rush hour risk" added independently.
function riskPoints(distance, complexity, time, weather, reliability) {
  let points = 0;
  if (distance > 4) points += 1;
  if (complexity === 'grocery') points += 1;
  if (time !== 'off') points += 1;
  if (weather !== 'clear') points += 1;
  points += RELIABILITY_FACTOR[reliability];
  if (time === 'dinner' && weather !== 'clear') points += 1; // compounding effect
  return points;
}

let currentLow = null;
let currentHigh = null;
let hasRevealed = false;
let pulseTimeout = null;

function estimate() {
  const distance = parseFloat(distanceInput.value);
  const complexity = complexityValue;
  const time = timeInput.value;
  const weather = weatherInput.value;
  const reliability = reliabilityInput.value;

  const prep = PREP_TIME[complexity];
  const speed = BASE_SPEED * WEATHER_SPEED_FACTOR[weather];
  const travel = (distance / speed) * 60; // minutes
  const buffer = TIME_OF_DAY_BUFFER[time];

  const mean = prep + travel + buffer;
  const points = riskPoints(distance, complexity, time, weather, reliability);

  // Confidence band widens with risk points, not a flat guess.
  // Treated as ~1 standard deviation for the illustrative curve below.
  const stdDev = 1.5 + points * 1.4;
  const bandWidth = stdDev * 2;
  const low = Math.max(5, Math.round(mean - bandWidth / 2));
  const high = Math.round(mean + bandWidth / 2);

  let confidence, confidenceClass, explain;
  if (points <= 1.5) {
    confidence = 'High confidence';
    confidenceClass = 'high';
    explain = 'Conditions are close to ideal — short-ish distance, normal traffic, a reliable kitchen. This estimate should hold.';
  } else if (points <= 4) {
    confidence = 'Medium confidence';
    confidenceClass = 'medium';
    explain = 'A couple of factors are working against this order — expect the window to be real but wider than usual.';
  } else {
    confidence = 'Low confidence';
    confidenceClass = 'low';
    explain = 'Several factors are stacking up at once — treat the low end of the range as optimistic.';
  }

  animateEtaRange(low, high);
  confidenceText.textContent = confidence;
  confidenceBadge.className = `confidence-badge ${confidenceClass}`;
  explainText.textContent = explain;

  breakdown.innerHTML = `
    <div class="breakdown-row"><span class="k">Kitchen prep</span><span class="v">~${prep} min</span></div>
    <div class="breakdown-row"><span class="k">Travel (${distance} mi, ${weather})</span><span class="v">~${Math.round(travel)} min</span></div>
    <div class="breakdown-row"><span class="k">Rush-hour buffer</span><span class="v">${buffer > 0 ? '+' + buffer + ' min' : 'none'}</span></div>
    <div class="breakdown-row"><span class="k">Kitchen reliability</span><span class="v">${reliabilityLabel(reliability)}</span></div>
  `;

  revealResultCard();
  drawCurve(mean, stdDev, low, high);
  triggerPulse();
}

function reliabilityLabel(r) {
  if (r === 'consistent') return 'Steady';
  if (r === 'variable') return 'Some swing';
  return 'Unpredictable';
}

// Unhide the card (and run its one-time entrance animation) before any
// layout-dependent code — like the canvas width measurement — runs.
// Doing this AFTER drawing was the original bug: a hidden card lays out
// at 0 width, so the curve was measured and drawn into a 0px buffer.
function revealResultCard() {
  if (resultCard.hidden) {
    resultCard.hidden = false;
    resultCard.classList.add('is-visible');
  }
}

function triggerPulse() {
  if (!hasRevealed) {
    // Skip the "just updated" flash on the very first paint —
    // the entrance animation already communicates that.
    hasRevealed = true;
    return;
  }
  resultCard.classList.remove('is-updating');
  // eslint-disable-next-line no-unused-expressions
  resultCard.offsetWidth; // force reflow so the animation can restart
  resultCard.classList.add('is-updating');
  clearTimeout(pulseTimeout);
  pulseTimeout = setTimeout(() => resultCard.classList.remove('is-updating'), 650);
}

// Ease-out count-up between the previous and next ETA window so the
// number feels alive rather than snapping on every field change.
function animateEtaRange(low, high) {
  if (currentLow === null) {
    currentLow = low;
    currentHigh = high;
    etaRange.textContent = `${low}–${high} min`;
    return;
  }
  const startLow = currentLow;
  const startHigh = currentHigh;
  currentLow = low;
  currentHigh = high;
  if (startLow === low && startHigh === high) return;

  const duration = 320;
  const startTime = performance.now();

  function tick(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const l = Math.round(startLow + (low - startLow) * eased);
    const h = Math.round(startHigh + (high - startHigh) * eased);
    etaRange.textContent = `${l}–${h} min`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Draws an illustrative bell curve — a Gaussian shape centered on the
// estimate, shaded across the confidence window. This is NOT fit to
// real data; it's a visual way to show that a narrower band means a
// taller, tighter curve, and a wider band means a flatter, less certain
// one. Real variance would come from historical delivery-time data.
let lastCurveParams = null;

function drawCurve(mean, stdDev, low, high) {
  const w = curveCanvas.clientWidth;
  const h = 140;
  if (w === 0) return; // parent not laid out yet — bail rather than draw garbage
  lastCurveParams = [mean, stdDev, low, high];

  const dpr = window.devicePixelRatio || 1;
  curveCanvas.width = w * dpr;
  curveCanvas.height = h * dpr;
  const ctx = curveCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rangeMin = Math.max(0, mean - stdDev * 3.2);
  const rangeMax = mean + stdDev * 3.2;
  const xOf = (t) => ((t - rangeMin) / (rangeMax - rangeMin)) * w;
  const gaussian = (x) => Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));

  const baseline = h - 28;
  const peakHeight = h - 44;

  // shaded confidence region
  const fill = ctx.createLinearGradient(0, baseline - peakHeight, 0, baseline);
  fill.addColorStop(0, 'rgba(214,73,31,0.22)');
  fill.addColorStop(1, 'rgba(214,73,31,0.03)');
  ctx.beginPath();
  ctx.moveTo(xOf(low), baseline);
  for (let t = low; t <= high; t += (high - low) / 48) {
    ctx.lineTo(xOf(t), baseline - gaussian(t) * peakHeight);
  }
  ctx.lineTo(xOf(high), baseline);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  // curve line
  ctx.beginPath();
  for (let t = rangeMin; t <= rangeMax; t += (rangeMax - rangeMin) / 120) {
    const y = baseline - gaussian(t) * peakHeight;
    if (t === rangeMin) ctx.moveTo(xOf(t), y);
    else ctx.lineTo(xOf(t), y);
  }
  ctx.strokeStyle = '#D6491F';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // baseline axis
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  ctx.lineTo(w, baseline);
  ctx.strokeStyle = '#E9DFCB';
  ctx.lineWidth = 1;
  ctx.stroke();

  // dashed guides + labels at the ACTUAL displayed low/high bounds
  ctx.font = '500 10.5px "IBM Plex Mono", monospace';
  [low, high].forEach((t) => {
    ctx.beginPath();
    ctx.setLineDash([2, 3]);
    ctx.moveTo(xOf(t), baseline);
    ctx.lineTo(xOf(t), baseline - gaussian(t) * peakHeight);
    ctx.strokeStyle = '#8F2E12';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  });

  ctx.fillStyle = '#8F2E12';
  ctx.textAlign = 'center';
  ctx.fillText(`${low}m`, xOf(low), h - 8);
  ctx.fillText(`${high}m`, xOf(high), h - 8);

  ctx.fillStyle = '#8A7C68';
  ctx.fillText('likely window', xOf(mean), 12);
  ctx.textAlign = 'left';
}

estimateBtn.addEventListener('click', estimate);

// Redraw (not full recompute) on resize so the curve stays crisp at the
// canvas's new width without re-animating the ETA numbers or pulse.
let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resultCard.hidden || !lastCurveParams) return;
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => drawCurve(...lastCurveParams));
});

syncDistanceUI();
estimate(); // show an initial result on load
