import { GIRONI } from './gironi.js';

export function createState() {
  return { phase: 'title', gironeIndex: 0, unlocked: new Set(), t: 0 };
}

export function advance(state, event) {
  const s = { ...state, unlocked: new Set(state.unlocked) };
  switch (state.phase) {
    case 'title':
      if (event === 'start') s.phase = 'playing';
      break;
    case 'playing':
      if (event === 'reachedTop') {
        s.phase = 'unlocked';
        s.unlocked.add(GIRONI[state.gironeIndex].audioId);
      }
      if (event === 'defeat') {
        s.gironeIndex = Math.max(0, state.gironeIndex - 1);
        s.phase = 'playing';
      }
      break;
    case 'unlocked':
      if (event === 'audioDone') {
        if (state.gironeIndex >= GIRONI.length - 1) s.phase = 'collapse';
        else { s.phase = 'playing'; s.gironeIndex = state.gironeIndex + 1; }
      }
      break;
    case 'collapse':
      if (event === 'collapseDone') s.phase = 'cta';
      break;
  }
  return s;
}
