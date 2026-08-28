let cinematicPromise;

export function loadActionCinematic() {
  cinematicPromise ||= import('./ActionCinematic.jsx');
  return cinematicPromise;
}

export function preloadActionCinematic() {
  return loadActionCinematic().catch(() => null);
}
