// A transparent, hand-built estimator — not a trained model.
// The point isn't the arithmetic, it's the idea: confidence should be
// a first-class output, and it should widen as risk factors stack up,
// not stay a flat +/- guess. See README.md for what a production
// version (real data, real road-network times, a fitted model) needs.

const distanceInput = document.getElementById('distance');
const distanceVal = document.getElementById('distanceVal');
const complexityInput = document.getElementById('complexity');
const timeInput = document.getElementById('time');
const weatherInput = document.getElementById('weather');
const reliabilityInput = document.getElementById('reliability');
const estimateBtn = document.getElementById('estimateBtn');
const resultCard = document.getElementById('resultCard');
const etaRange = document.getElementById('etaRange');
const confidenceBadge = document.getElementById('confidenceBadge');
const breakdown = document.getElementById('breakdown');
const explainText = document.getElementById('explainText');
const curveCanvas = document.getElementById('curve');

distanceInput.addEventListener('input', () => {
  distanceVal.textContent = `${distanceInput.value} mi`;
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

function estimate() {
  const distance = parseFloat(distanceInput.value);
  const complexity = complexityInput.value;
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

  etaRange.textContent = `${low}–${high} min`;
  confidenceBadge.textContent = confidence;
  confidenceBadge.className = `confidence-badge ${confidenceClass}`;
  explainText.textContent = explain;

  breakdown.innerHTML = `
    <div class="breakdown-row"><span class="k">Kitchen prep</span><span class="v">~${prep} min</span></div>
    <div class="breakdown-row"><span class="k">Travel (${distance} mi, ${weather})</span><span class="v">~${Math.round(travel)} min</span></div>
    <div class="breakdown-row"><span class="k">Rush-hour buffer</span><span class="v">${buffer > 0 ? '+' + buffer + ' min' : 'none'}</span></div>
    <div class="breakdown-row"><span class="k">Kitchen reliability</span><span class="v">${reliabilityLabel(reliability)}</span></div>
  `;

  drawCurve(mean, stdDev, low, high);
  resultCard.hidden = false;
}

function reliabilityLabel(r) {
  if (r === 'consistent') return 'Steady';
  if (r === 'variable') return 'Some swing';
  return 'Unpredictable';
}

// Draws an illustrative bell curve — a Gaussian shape centered on the
// estimate, shaded across the confidence window. This is NOT fit to
// real data; it's a visual way to show that a narrower band means a
// taller, tighter curve, and a wider band means a flatter, less certain
// one. Real variance would come from historical delivery-time data.
function drawCurve(mean, stdDev, low, high) {
  const ctx = curveCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = curveCanvas.clientWidth;
  const h = 120;
  curveCanvas.width = w * dpr;
  curveCanvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rangeMin = Math.max(0, mean - stdDev * 3.2);
  const rangeMax = mean + stdDev * 3.2;
  const xOf = (t) => ((t - rangeMin) / (rangeMax - rangeMin)) * w;

  const gaussian = (x) => Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));

  const baseline = h - 22;
  const peakHeight = h - 32;

  // shaded confidence region
  ctx.beginPath();
  ctx.moveTo(xOf(low), baseline);
  for (let t = low; t <= high; t += (high - low) / 40) {
    ctx.lineTo(xOf(t), baseline - gaussian(t) * peakHeight);
  }
  ctx.lineTo(xOf(high), baseline);
  ctx.closePath();
  ctx.fillStyle = 'rgba(200,90,46,0.14)';
  ctx.fill();

  // curve line
  ctx.beginPath();
  for (let t = rangeMin; t <= rangeMax; t += (rangeMax - rangeMin) / 100) {
    const y = baseline - gaussian(t) * peakHeight;
    if (t === rangeMin) ctx.moveTo(xOf(t), y);
    else ctx.lineTo(xOf(t), y);
  }
  ctx.strokeStyle = '#C85A2E';
  ctx.lineWidth = 2;
  ctx.stroke();

  // baseline axis
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  ctx.lineTo(w, baseline);
  ctx.strokeStyle = '#E9E1D4';
  ctx.lineWidth = 1;
  ctx.stroke();

  // mean marker
  ctx.beginPath();
  ctx.moveTo(xOf(mean), baseline);
  ctx.lineTo(xOf(mean), baseline - gaussian(mean) * peakHeight);
  ctx.strokeStyle = '#8F3E22';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  // axis labels
  ctx.fillStyle = '#7A7166';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(`${Math.round(rangeMin)} min`, 2, h - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(rangeMax)} min`, w - 2, h - 6);
  ctx.textAlign = 'center';
  ctx.fillText('likely window', xOf(mean), h - 6);
  ctx.textAlign = 'left';
}

estimateBtn.addEventListener('click', estimate);
window.addEventListener('resize', () => { if (!resultCard.hidden) estimate(); });
estimate(); // show an initial result on load
