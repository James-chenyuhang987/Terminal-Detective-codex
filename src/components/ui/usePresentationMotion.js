import { useEffect, useState } from 'react';
import { useSettings } from '@/lib/settings.jsx';

export function usePresentationMotion() {
  const { settings } = useSettings();
  const [systemReduced, setSystemReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches));
  const [foreground, setForeground] = useState(() => typeof document === 'undefined' || (!document.hidden && document.hasFocus()));
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const preference = () => setSystemReduced(Boolean(query?.matches));
    const visibility = () => setForeground(!document.hidden && document.hasFocus());
    const blur = () => setForeground(false);
    preference();
    query?.addEventListener?.('change', preference);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', visibility);
    window.addEventListener('blur', blur);
    return () => {
      query?.removeEventListener?.('change', preference);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', visibility);
      window.removeEventListener('blur', blur);
    };
  }, []);
  const reducedMotion = Boolean(settings.reduceMotion || systemReduced);
  return { reducedMotion, foreground, motionEnabled: !reducedMotion && foreground };
}
