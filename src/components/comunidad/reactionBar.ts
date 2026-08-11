/**
 * reactionBar
 * -----------
 * Barra de reacciones (estilo LinkedIn) reutilizable: renderiza como string
 * HTML y se opera con un único controlador delegado en `document`.
 */

import { escapeHtml } from '../../utils/helpers';
import {
  REACTION_META,
  REACTION_ORDER,
  normalizeReactionState,
  totalReactions,
  type ReactionState,
  type ReactionTargetType,
  type ReactionType,
} from '../../services/reactionsService';

export interface ReactionBarOptions {
  targetType: ReactionTargetType;
  targetId: string;
  reactions?: Record<string, number>;
  myReaction?: ReactionType | null;
  compact?: boolean;
}

function renderSummary(state: ReactionState): string {
  const total = totalReactions(state.reactions);
  if (total === 0) {
    return '';
  }
  const emojis = REACTION_ORDER
    .filter((type) => state.reactions[type] > 0)
    .map((type) => `<span class="text-sm" aria-hidden="true">${REACTION_META[type].emoji}</span>`)
    .join('');
  const label = total === 1 ? '1 reacción' : `${total} reacciones`;
  return `
    <div class="flex items-center gap-1" aria-label="${label}">
      <span class="flex -space-x-1">${emojis}</span>
      <span class="text-xs font-medium text-on-surface-variant">${total}</span>
    </div>`;
}

function renderTrigger(state: ReactionState, compact: boolean): string {
  const my = state.myReaction;
  const emoji = my ? REACTION_META[my].emoji : '👍';
  const label = my ? REACTION_META[my].label : 'Recomendar';
  const activeClass = my ? 'text-primary font-bold' : 'text-on-surface-variant font-semibold';
  const size = compact ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return `
    <button type="button" class="rx-trigger inline-flex items-center gap-1 rounded-lg ${size} ${activeClass} hover:bg-surface-container transition-colors" aria-haspopup="menu" aria-expanded="false">
      <span aria-hidden="true">${emoji}</span>
      <span>${label}</span>
    </button>`;
}

function renderPopover(state: ReactionState): string {
  const options = REACTION_ORDER.map((type) => {
    const meta = REACTION_META[type];
    const active = state.myReaction === type ? 'bg-primary/15' : '';
    return `<button type="button" role="menuitem" class="rx-option rounded-md p-1.5 text-xl leading-none transition-transform hover:scale-125 hover:bg-surface-container-high ${active}" data-rx-value="${type}" aria-label="${meta.label}" title="${meta.label}">${meta.emoji}</button>`;
  }).join('');
  return `
    <div class="rx-popover hidden absolute bottom-full left-0 z-10 mb-1 flex items-center gap-0.5 rounded-full border border-outline-variant/20 bg-surface-container-lowest px-1.5 py-1 shadow-lg" role="menu">
      ${options}
    </div>`;
}

export function renderInner(state: ReactionState, compact: boolean): string {
  return `
    ${renderSummary(state)}
    <div class="relative">
      ${renderTrigger(state, compact)}
      ${renderPopover(state)}
    </div>`;
}

export function renderReactionBar(opts: ReactionBarOptions): string {
  const state = normalizeReactionState({ reactions: opts.reactions, myReaction: opts.myReaction });
  const compact = opts.compact === true;
  const stateAttr = escapeHtml(JSON.stringify(state));
  return `<div class="reaction-bar flex items-center gap-3" data-rx-type="${escapeHtml(opts.targetType)}" data-rx-id="${escapeHtml(opts.targetId)}" data-rx-compact="${compact}" data-rx-state="${stateAttr}">${renderInner(state, compact)}</div>`;
}
