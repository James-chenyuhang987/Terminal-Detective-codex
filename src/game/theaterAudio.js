const wrap = value => ((value % 1) + 1) % 1;
export const FLOOR_SOUNDS = Object.freeze({
  office: { cutoff: 700, frequency: 100, duration: .095, volume: .05 },
  lobby: { cutoff: 2200, frequency: 155, duration: .11, volume: .042 },
  laboratory: { cutoff: 1700, frequency: 125, duration: .08, volume: .043 },
  datacenter: { cutoff: 3100, frequency: 170, duration: .13, volume: .036 },
  balcony: { cutoff: 1300, frequency: 85, duration: .10, volume: .045 },
});

export function createFootstepTracker() { return { phase: null, armed: false }; }

/** Touchdown at phase 0/.5 follows the actual distance-driven Walk clip. */
export function footstepContacts(state, { phase, distance = 0, walking = false, enabled = true }) {
  if (!Number.isFinite(phase)) { state.phase = null; state.armed = false; return []; }
  const current = wrap(phase), previous = state.phase;
  state.phase = current;
  if (!enabled || !walking || !(distance > .00001)) { state.armed = false; return []; }
  if (!state.armed || previous === null) { state.armed = true; return []; }
  const travel = wrap(current - previous);
  // A seek, tab return or restored clip must not replay missed contacts.
  if (travel <= .0000001 || travel > .2) return [];
  return [{ side: 'left', phase: 0 }, { side: 'right', phase: .5 }]
    .filter(contact => { const ahead = wrap(contact.phase - previous); return ahead > .0000001 && ahead <= travel + 1e-7; })
    .map(contact => contact.side);
}

/**
 * Local texture-free WebAudio. Context creation/resume happens on user input.
 * @param {{contextFactory?: () => AudioContext}} [options]
 */
export function createTheaterAudio({ contextFactory } = {}) {
  let context = null, master = null, ambience = [], noiseBuffer = null, disposed = false, enabled = true, active = true, scene = 'office';
  const tracker = createFootstepTracker();
  const voices = new Set();
  const silence = () => {
    if (master && context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0, context.currentTime);
    }
    tracker.armed = false;
  };
  const stopAmbience = () => {
    for (const node of ambience) { try { node.stop(); } catch { /* already stopped */ } node.disconnect(); }
    ambience = [];
  };
  const ambient = () => {
    stopAmbience();
    if (!context || !master || !enabled || !active || disposed || context.state !== 'running') return;
    const hum = context.createOscillator(), gain = context.createGain();
    hum.type = 'sine'; hum.frequency.value = scene === 'datacenter' ? 58 : scene === 'laboratory' ? 86 : scene === 'balcony' ? 43 : 72;
    gain.gain.value = scene === 'datacenter' ? .006 : .0025;
    hum.connect(gain); gain.connect(master); hum.start();
    // Keep ownership of the gain with its oscillator for complete cleanup.
    hum.onended = () => gain.disconnect();
    ambience = [hum];
    if (noiseBuffer && (scene === 'balcony' || scene === 'datacenter')) {
      const wind = context.createBufferSource(), filter = context.createBiquadFilter(), level = context.createGain();
      wind.buffer = noiseBuffer; wind.loop = true;
      filter.type = 'lowpass'; filter.frequency.value = scene === 'balcony' ? 420 : 180;
      level.gain.value = scene === 'balcony' ? .007 : .002;
      wind.connect(filter); filter.connect(level); level.connect(master); wind.start();
      wind.onended = () => { filter.disconnect(); level.disconnect(); };
      ambience.push(wind);
    }
  };
  const refresh = () => {
    if (!context || !master) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(enabled && active ? 1 : 0, context.currentTime);
    ambient();
  };
  const unlock = () => {
    if (disposed || !enabled || !active) return;
    try {
      if (!context) {
        const Audio = typeof window !== 'undefined' && (window.AudioContext || /** @type {any} */ (window).webkitAudioContext);
        context = contextFactory ? contextFactory() : Audio ? new Audio() : null;
        if (!context) return;
        master = context.createGain(); master.connect(context.destination);
        if (context.createBuffer && context.createBufferSource) {
          noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
          const samples = noiseBuffer.getChannelData(0);
          let seed = 1234567;
          for (let index = 0; index < samples.length; index++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; samples[index] = seed / 2147483648 - 1; }
        }
      }
      if (context.state === 'suspended') void Promise.resolve(context.resume()).then(refresh).catch(() => {});
      else refresh();
    } catch { /* Sound is optional; it must never block input or investigation. */ }
  };
  const pulse = (frequency, duration, volume, cutoff) => {
    if (!context || context.state !== 'running' || !master || !enabled || !active || disposed) return;
    const now = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter();
    oscillator.type = cutoff > 2000 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * .35), now + duration);
    filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .006); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(filter); filter.connect(gain); gain.connect(master);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + duration + .02);
    if (noiseBuffer && frequency < 250) {
      const impact = context.createBufferSource(); impact.buffer = noiseBuffer;
      impact.connect(filter); voices.add(impact);
      impact.onended = () => { voices.delete(impact); impact.disconnect(); };
      impact.start(now); impact.stop(now + duration);
    }
  };
  return {
    unlock,
    setEnabled(value) { if (enabled === Boolean(value)) return; enabled = Boolean(value); if (!enabled) silence(); refresh(); },
    setActive(value) { if (active === Boolean(value)) return; active = Boolean(value); if (!active) silence(); refresh(); },
    setScene(value) { if (scene !== value) { scene = value; tracker.armed = false; refresh(); } },
    step(animation, movement, allowed = true) {
      const contacts = footstepContacts(tracker, { phase: animation.gaitPhase, distance: movement.distance, walking: movement.walking, enabled: enabled && active && allowed && Boolean(context?.state === 'running') });
      const material = FLOOR_SOUNDS[scene] || FLOOR_SOUNDS.office;
      for (const side of contacts) pulse(material.frequency * (side === 'left' ? 1 : .94), material.duration, material.volume * (movement.sprinting ? 1.15 : 1), material.cutoff);
      return contacts;
    },
    cue(kind) { pulse(kind === 'discovery' ? 720 : 350, .13, .035, 2600); },
    stopSteps() { tracker.armed = false; for (const voice of voices) { try { voice.stop(); } catch { /* ended */ } } },
    silence,
    dispose() {
      disposed = true; silence(); stopAmbience();
      for (const voice of voices) { try { voice.stop(); } catch { /* ended */ } voice.disconnect(); }
      voices.clear(); master?.disconnect();
      if (context && context.state !== 'closed') void Promise.resolve(context.close()).catch(() => {});
      context = null; master = null; noiseBuffer = null;
    },
  };
}
