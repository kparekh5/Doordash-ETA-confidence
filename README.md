# Will it actually arrive on time?

A small tool that estimates not just a delivery time window, but how much
to trust it — and shows the factors behind that number instead of hiding
them behind a black box.

**[Try it](./index.html)** — open the file directly in a browser, no install needed.

## The problem, in plain terms

Every delivery app gives you a window like "20–30 min." Sometimes it's
dead on. Sometimes your food shows up 20 minutes late and the app never
told you it was even a risky estimate in the first place.

That gap — between "here's a number" and "here's a number *and* how much
to trust it" — is a real, hard problem. Distance, how busy the kitchen
is, traffic, and weather all push an ETA around by different amounts,
and a good delivery platform has to reason about all of it in real time,
for every single order, at huge scale.

## What this does

You pick a distance, an order type, a time of day, and current weather.
The tool:

1. Estimates prep time + travel time + a rush-hour buffer
2. Adds up how many "risk factors" are stacked against this specific
   order (long distance, bad weather, rush hour, a complex order — and
   an extra bump when several of those compound at once)
3. Widens or narrows the estimated window based on that risk score, and
   labels it High / Medium / Low confidence
4. Shows the breakdown, instead of just a number

## Why it's built this way

The model itself is deliberately simple — fixed weights, no training
data, nothing fancy. That's on purpose. The interesting part of this
problem isn't the arithmetic, it's the idea that **confidence should be
a first-class output, not an afterthought** — and that idea holds
whether the estimate underneath comes from a spreadsheet-simple formula
like this one or a trained model on years of delivery data.

## What a real, production version would need

- Actual historical delivery data to fit real weights instead of guessed
  ones (this is where it'd become a proper ML problem)
- Real road-network travel time, not a flat mph estimate
- Live signals: current kitchen backlog, live traffic, courier density
  in the area right now — not just a time-of-day bucket
- A feedback loop: compare predicted vs. actual delivery time per order,
  and use that error to keep recalibrating both the estimate *and* the
  confidence band over time
- The confidence band itself would ideally come from the model's own
  prediction variance, not hand-picked risk points like this version

## Why I built this

I'm applying for the Software Engineer I role at DoorDash and wanted to
put something real behind that interest rather than just say it — ETA
prediction under uncertainty is a problem their engineering team has
written about, and it's also just a genuinely interesting one: how do
you communicate a prediction's *reliability*, not just the prediction
itself.
