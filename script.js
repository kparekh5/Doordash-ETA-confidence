// A simple, transparent estimator — not a trained model.
// Goal: make the FACTORS behind an ETA visible, and show that
// confidence should shrink as more of those factors stack up.
// See README.md for what a production version would actually need.

const distanceInput = document.getElementById('distance');
const distanceVal = document.getElementById('distanceVal');
const complexityInput = document.getElementById('complexity');
const timeInput = document.getElementById('time');
const weatherInput = document.getElementById('weather');
const estimateBtn = document.getElementById('estimateBtn');
const resultCard = document.getElementById('resultCard');
const etaRange = document.getElementById('etaRange');
const confidenceBadge = document.getElementById('confidenceBadge');
const breakdown = document.getElementById('breakdown');
const explainText = document.getElementById('explainText');

distanceInput.addEventListener('input', () => {
  distanceVal.textContent = `${distanceInput.value} mi`;
});

// Baseline prep time by order type (minutes)
const PREP_TIME = {
  fast: 6,
  sitdown: 14,
  grocery: 18,
};

// Average travel speed (mph), degraded by weather
const BASE_SPEED = 22;
const WEATHER_SPEED_FACTOR = {
  clear: 1.0,
  rain: 0.75,
  snow: 0.55,
};

// Extra buffer minutes added during rush windows (kitchen backlog + traffic)
const TIME_OF_DAY_BUFFER = {
  off: 0,
  lunch: 6,
  dinner: 9,
};

// Each of these adds "risk points" that widen the confidence band
function riskPoints(distance, complexity, time, weather) {
  let points = 0;
  if (distance > 4) points += 1;
  if (complexity === 'grocery') points += 1;
  if (time !== 'off') points += 1;
  if (weather !== 'clear') points += 1;
  if (time === 'dinner' && weather !== 'clear') points += 1; // compounding effect
  return points;
}

function estimate() {
  const distance = parseFloat(distanceInput.value);
  const complexity = complexityInput.value;
  const time = timeInput.value;
  const weather = weatherInput.value;

  const prep = PREP_TIME[complexity];
  const speed = BASE_SPEED * WEATHER_SPEED_FACTOR[weather];
  const travel = (distance / speed) * 60; // minutes
  const buffer = TIME_OF_DAY_BUFFER[time];

  const total = prep + travel + buffer;
  const points = riskPoints(distance, complexity, time, weather);

  // Confidence band widens with risk points, not just a flat +/- guess
  const bandWidth = 3 + points * 3; // minutes
  const low = Math.max(5, Math.round(total - bandWidth / 2));
  const high = Math.round(total + bandWidth / 2);

  let confidence, confidenceClass, explain;
  if (points <= 1) {
    confidence = 'High confidence';
    confidenceClass = 'high';
    explain = 'Conditions are close to ideal — short-ish distance, normal traffic, clear weather. This estimate should hold.';
  } else if (points <= 3) {
    confidence = 'Medium confidence';
    confidenceClass = 'medium';
    explain = 'A couple of factors are working against this order — expect the window to be real but wider than usual.';
  } else {
    confidence = 'Low confidence';
    confidenceClass = 'low';
    explain = 'Several factors are stacking up (distance, rush hour, weather, or a complex order) — treat the low end of the range as optimistic.';
  }

  etaRange.textContent = `${low}–${high} min`;
  confidenceBadge.textContent = confidence;
  confidenceBadge.className = `confidence-badge ${confidenceClass}`;
  explainText.textContent = explain;

  breakdown.innerHTML = `
    <div class="breakdown-row"><span class="k">Kitchen prep</span><span class="v">~${prep} min</span></div>
    <div class="breakdown-row"><span class="k">Travel (${distance} mi, ${weather})</span><span class="v">~${Math.round(travel)} min</span></div>
    <div class="breakdown-row"><span class="k">Rush-hour buffer</span><span class="v">${buffer > 0 ? '+' + buffer + ' min' : 'none'}</span></div>
  `;

  resultCard.hidden = false;
}

estimateBtn.addEventListener('click', estimate);
estimate(); // show an initial result on load
