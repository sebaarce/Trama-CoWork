/**
 * reactionBar
 * -----------
 * Barra de reacciones (estilo LinkedIn) reutilizable: renderiza como string
 * HTML y se opera con un único controlador delegado en `document`.
 */

import {
  applyOptimistic,
  normalizeReactionState,
  REACTION_META,
  REACTION_ORDER,
  type ReactionState,
  type ReactionTargetType,
  type ReactionType,
  removeReaction,
  resolveToggle,
  setReaction,
  totalReactions,
} from '../../services/reactionsService';
import { escapeHtml } from '../../utils/helpers';

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
  const emojis = REACTION_ORDER.filter((type) => state.reactions[type] > 0)
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
  const emoji = my ? REACTION_META[my].emoji : REACTION_META.LIKE.emoji;
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
    const cls = [
      'rx-option rounded-md p-1.5 text-xl leading-none transition-transform hover:scale-125 hover:bg-surface-container-high',
      active,
    ]
      .filter(Boolean)
      .join(' ');
    return `<button type="button" role="menuitem" class="${cls}" data-rx-value="${type}" aria-label="${meta.label}" title="${meta.label}">${meta.emoji}</button>`;
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

// ─── Controlador (delegación en document) ──────────────────────

let initialized = false;

export function initReactionBars(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
}

function readState(bar: HTMLElement): ReactionState {
  try {
    return normalizeReactionState(JSON.parse(bar.dataset.rxState || 'null'));
  } catch {
    return normalizeReactionState(null);
  }
}

function writeState(bar: HTMLElement, state: ReactionState): void {
  bar.dataset.rxState = JSON.stringify(state);
  bar.innerHTML = renderInner(state, bar.dataset.rxCompact === 'true');
}

function closeAllPopovers(): void {
  document.querySelectorAll<HTMLElement>('.rx-popover:not(.hidden)').forEach((pop) => {
    pop.classList.add('hidden');
    pop.closest('.reaction-bar')?.querySelector('.rx-trigger')?.setAttribute('aria-expanded', 'false');
  });
}

function togglePopover(bar: HTMLElement): void {
  const popover = bar.querySelector<HTMLElement>('.rx-popover');
  const trigger = bar.querySelector<HTMLElement>('.rx-trigger');
  if (!popover || !trigger) {
    return;
  }
  const willOpen = popover.classList.contains('hidden');
  closeAllPopovers();
  if (willOpen) {
    popover.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    popover.querySelector<HTMLElement>('.rx-option')?.focus();
  }
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  const option = target.closest<HTMLElement>('.rx-option');
  if (option) {
    const bar = option.closest<HTMLElement>('.reaction-bar');
    const value = option.dataset.rxValue as ReactionType | undefined;
    if (bar && value) {
      void handleReactionClick(bar, value);
    }
    return;
  }

  const trigger = target.closest<HTMLElement>('.rx-trigger');
  if (trigger) {
    const bar = trigger.closest<HTMLElement>('.reaction-bar');
    if (bar) {
      togglePopover(bar);
    }
    return;
  }

  closeAllPopovers();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeAllPopovers();
  }
}

async function handleReactionClick(bar: HTMLElement, clicked: ReactionType): Promise<void> {
  const targetType = bar.dataset.rxType as ReactionTargetType;
  const targetId = bar.dataset.rxId || '';
  const prev = readState(bar);
  const action = resolveToggle(prev.myReaction, clicked);

  closeAllPopovers();
  writeState(bar, applyOptimistic(prev, action));

  try {
    const confirmed =
      action.method === 'DELETE'
        ? await removeReaction(targetType, targetId)
        : await setReaction(targetType, targetId, action.type);
    writeState(bar, confirmed);
  } catch (error) {
    writeState(bar, prev);
    handleReactionError(error);
  }
}

function defaultMessageForStatus(status?: number): string {
  switch (status) {
    case 400:
      return 'Reacción no válida.';
    case 403:
      return 'No tenés acceso a este contenido.';
    case 404:
      return 'No se encontró el contenido.';
    default:
      return 'No se pudo registrar tu reacción.';
  }
}

function handleReactionError(error: unknown): void {
  const err = error as { status?: number; body?: { message?: string } };
  showReactionToast(err?.body?.message || defaultMessageForStatus(err?.status));
}

let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

function showReactionToast(message: string): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.className =
      'fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-error px-4 py-2 text-sm font-medium text-white shadow-lg transition-opacity duration-300';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.opacity = '1';
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = '0';
    }
  }, 3000);
}
