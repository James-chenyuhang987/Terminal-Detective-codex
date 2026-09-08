export function narrativeTextTiming(variant, index) {
  const title = variant === 'title';
  return {
    duration: title ? 480 : 320,
    delay: variant === 'passage' ? 0 : Math.min(index * (title ? 35 : 16), title ? 420 : 560),
    easing: 'cubic-bezier(.22, 1, .36, 1)',
    fill: 'both',
  };
}

export function segmentNarrativeText(text, lang = 'en') {
  const content = String(text ?? '');
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(lang === 'en' ? 'en' : 'zh', { granularity: 'word' }).segment(content), item => item.segment)
    : content.match(/\s+|\S+/gu) || [];
  let end = 0;
  return segments.map(segment => {
    end += Array.from(segment).length;
    return { text: segment, end, whitespace: /^\s+$/u.test(segment) };
  });
}
