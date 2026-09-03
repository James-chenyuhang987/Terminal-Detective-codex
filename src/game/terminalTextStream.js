const graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function splitTerminalText(text) {
  const value = String(text || '');
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value), entry => entry.segment)
    : Array.from(value);
}

export function streamTerminalText({
  text,
  intervalMs = 20,
  instant = false,
  onStart = null,
  onChunk = null,
  onDone = null,
  signal = null,
  timerApi = globalThis,
}) {
  const units = splitTerminalText(text);
  const fullText = units.join('');
  onStart?.(fullText);

  if (signal?.aborted) {
    onDone?.('');
    return Promise.resolve('');
  }

  if (instant || units.length === 0) {
    if (fullText) onChunk?.(fullText);
    onDone?.(fullText);
    return Promise.resolve(fullText);
  }

  return new Promise(resolve => {
    let index = 0;
    let settled = false;
    let timer = null;

    const finish = (aborted = false) => {
      if (settled) return;
      settled = true;
      if (timer !== null) timerApi.clearInterval(timer);
      signal?.removeEventListener('abort', handleAbort);
      const completed = aborted ? units.slice(0, index).join('') : fullText;
      onDone?.(completed);
      resolve(completed);
    };
    const handleAbort = () => finish(true);

    timer = timerApi.setInterval(() => {
      if (signal?.aborted) {
        finish(true);
        return;
      }
      const unit = units[index];
      index += 1;
      onChunk?.(unit);
      if (index >= units.length) finish(false);
    }, Math.max(1, Number(intervalMs) || 1));

    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) finish(true);
  });
}
