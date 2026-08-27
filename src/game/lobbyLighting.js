const LIGHT_STOPS = Object.freeze([
  [0, 0.72],
  [5, 0.72],
  [6, 0.82],
  [8, 1.02],
  [12, 1.10],
  [17, 1.02],
  [19, 0.88],
  [22, 0.74],
  [24, 0.72],
]);

function interpolateBrightness(hour) {
  for (let index = 1; index < LIGHT_STOPS.length; index += 1) {
    const [endHour, endValue] = LIGHT_STOPS[index];
    const [startHour, startValue] = LIGHT_STOPS[index - 1];
    if (hour <= endHour) {
      const progress = (hour - startHour) / Math.max(1, endHour - startHour);
      return startValue + (endValue - startValue) * progress;
    }
  }
  return LIGHT_STOPS[0][1];
}

export function getLobbyLighting(date = new Date()) {
  const current = new Date(date);
  const hour = current.getHours() + current.getMinutes() / 60;
  const brightness = Number(interpolateBrightness(hour).toFixed(3));
  const daylight = Math.max(0, Math.min(1, (brightness - 0.72) / 0.38));
  let phase = 'night';
  if (hour >= 6 && hour < 8) phase = 'dawn';
  else if (hour >= 8 && hour < 18) phase = 'day';
  else if (hour >= 18 && hour < 22) phase = 'evening';
  return {
    phase,
    brightness,
    saturation: Number((0.9 + daylight * 0.12).toFixed(3)),
    dayGlow: Number((daylight * 0.16).toFixed(3)),
    nightVeil: Number(((1 - daylight) * 0.2).toFixed(3)),
  };
}

