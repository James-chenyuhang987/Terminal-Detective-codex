import React, { useEffect, useState } from 'react';
import NarrativeText from './NarrativeText';

export default function NPCStatement({ text, lang, animate = false, active = true, showAll = false }) {
  // Older history stays readable; appending an answer never restarts existing lines.
  const [motion] = useState({ animate, lang });
  const [foreground, setForeground] = useState(() => !document.hidden && document.hasFocus());
  useEffect(() => {
    const update = () => setForeground(!document.hidden && document.hasFocus());
    const blur = () => setForeground(false);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return <span className="td-npc-statement" data-text-paused={!active || !foreground} data-text-instant={!motion.animate || showAll}>
    <NarrativeText text={text} lang={motion.lang} variant="dialogue" paused={!active || !foreground} instant={!motion.animate || showAll} />
    <span className="sr-only">{text}</span>
  </span>;
}
