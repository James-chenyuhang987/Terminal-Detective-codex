import { useCallback, useEffect, useRef } from 'react';

// Keeps delayed UI work from mutating an investigation after route teardown.
export function useManagedTimers() {
  const timersRef = useRef(new Set());
  const waitsRef = useRef(new Set());

  const schedule = useCallback((callback, delay) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const wait = useCallback((delay) => new Promise(resolve => {
    const finish = () => {
      waitsRef.current.delete(finish);
      resolve();
    };
    waitsRef.current.add(finish);
    schedule(finish, delay);
  }), [schedule]);

  useEffect(() => () => {
    timersRef.current.forEach(timer => window.clearTimeout(timer));
    timersRef.current.clear();
    waitsRef.current.forEach(resolve => resolve());
    waitsRef.current.clear();
  }, []);

  return { schedule, wait };
}
