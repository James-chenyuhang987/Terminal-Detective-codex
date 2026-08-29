function normalizedTurn(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

export function getTerminalTurns(lines = [], activeTurn = 0) {
  const turns = new Set([0, normalizedTurn(activeTurn)]);
  lines.forEach(line => turns.add(normalizedTurn(line?.turn)));
  return [...turns].sort((a, b) => a - b);
}

export function getTerminalLinesForTurn(lines = [], turn = 0) {
  const target = normalizedTurn(turn);
  return lines.filter(line => normalizedTurn(line?.turn) === target);
}

export function stepTerminalTurn(turns = [], currentTurn = 0, delta = 0) {
  if (!turns.length) return 0;
  const current = normalizedTurn(currentTurn);
  const index = Math.max(0, turns.indexOf(current));
  const nextIndex = Math.min(turns.length - 1, Math.max(0, index + Math.sign(delta)));
  return turns[nextIndex];
}

