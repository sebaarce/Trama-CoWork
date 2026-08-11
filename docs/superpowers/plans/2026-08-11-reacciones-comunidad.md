# Reacciones (emoji) en comunidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar reacciones tipo emoji (estilo LinkedIn) a posts y comentarios de la comunidad, con un único botón + resumen de emojis con `count > 0` y total.

**Architecture:** Patrón existente del proyecto: Astro + `<script>` vanilla-TS que renderiza HTML como string y usa delegación de eventos. Un servicio de red puro/testeable (`reactionsService`) y un componente UI reutilizable como string (`reactionBar`) con un único controlador delegado en `document`. Actualización optimista con reconciliación contra la respuesta del back.

**Tech Stack:** Astro, TypeScript, Tailwind (tokens Material del proyecto), Vitest (`environment: node`, sin jsdom → tests por string/funciones puras). Cliente HTTP: singleton `api` (`ApiClient`).

## Global Constraints

- Enum fijo `ReactionType`: `LIKE, LOVE, LAUGH, WOW, SAD, DISLIKE`. Emojis/labels ES: LIKE 👍 "Me gusta", LOVE ❤️ "Me encanta", LAUGH 😂 "Me divierte", WOW 😮 "Me asombra", SAD 😢 "Me entristece", DISLIKE 👎 "No me gusta".
- `targetType` exacto (minúscula, guión bajo): `community_post`, `community_channel_post`, `community_comment`, `community_channel_comment`.
- Endpoints: `PUT /community/reactions/:targetType/:targetId` body `{ "type": "LIKE" }`; `DELETE /community/reactions/:targetType/:targetId`. Ambos devuelven `{ reactions, myReaction }`.
- Toggle en el front: misma → DELETE; distinta o ninguna → PUT.
- Auth JWT Bearer (setear header con `getToken()` antes de cada request).
- Errores con mensajes ES: 400 "Reacción no válida." / "Tipo de contenido no válido.", 403 sin acceso, 404 "No se encontró el contenido.", 401 → `logout()` (redirige a `/login`).
- No inventar campos fuera del contrato. No "quién reaccionó". Alcance: sólo vistas de comunidad del usuario (no admin).
- Tests corren en `environment: node` (sin jsdom). Ejecutar un archivo: `pnpm exec vitest run <ruta>`. Suite completa: `pnpm test`. Lint: `pnpm lint`. Typecheck/compilación real de los `<script>`: `pnpm build`.
- Commits en la rama `feat/reacciones-comunidad`. Terminar cada mensaje de commit con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- **Create** `src/services/reactionsService.ts` — tipos, constantes (`REACTION_ORDER`, `REACTION_META`), helpers puros (`emptyReactionCounts`, `normalizeReactionState`, `resolveToggle`, `applyOptimistic`, `totalReactions`, `postTargetType`, `commentTargetType`) y red (`setReaction`, `removeReaction`).
- **Create** `src/services/__tests__/reactionsService.test.ts` — tests del servicio.
- **Create** `src/components/comunidad/reactionBar.ts` — `renderReactionBar` (string), `renderInner`, y controlador `initReactionBars` + toast.
- **Create** `src/components/__tests__/reactionBar.test.ts` — tests de `renderReactionBar`.
- **Modify** `src/services/communityService.ts` — agregar `reactions?`/`myReaction?` a `Post` y `Comment`.
- **Modify** `src/components/comunidad/ComunidadFeed.astro` — bar en `renderFeedPost`.
- **Modify** `src/components/comunidad/ComunidadMyPosts.astro` — bar en `renderMyPost`.
- **Modify** `src/components/comunidad/ComunidadPostModal.astro` — bar compacto en `renderCommentHtml`.
- **Modify** `src/pages/dashboard/comunidad/post.astro` — bar del post en `renderPostDetail` (+ elemento `#post-reactions`) y bar compacto en `renderCommentCard`.

---

## Task 1: `reactionsService` (contrato de datos + red)

**Files:**
- Create: `src/services/reactionsService.ts`
- Test: `src/services/__tests__/reactionsService.test.ts`
- Modify: `src/services/communityService.ts` (agregar campos a `Post` y `Comment`)

**Interfaces:**
- Consumes: `api` de `src/services/apiClient.ts` (métodos `put<T>`, `del<T>`), `getToken` de `src/services/authService.ts`.
- Produces (usado por Tasks 3-7):
  - `type ReactionType = 'LIKE'|'LOVE'|'LAUGH'|'WOW'|'SAD'|'DISLIKE'`
  - `type ReactionTargetType = 'community_post'|'community_channel_post'|'community_comment'|'community_channel_comment'`
  - `type ReactionCounts = Record<ReactionType, number>`
  - `interface ReactionState { reactions: ReactionCounts; myReaction: ReactionType | null }`
  - `type ToggleAction = { method: 'PUT'; type: ReactionType } | { method: 'DELETE' }`
  - `const REACTION_ORDER: ReactionType[]`
  - `const REACTION_META: Record<ReactionType, { emoji: string; label: string }>`
  - `emptyReactionCounts(): ReactionCounts`
  - `normalizeReactionState(raw: unknown): ReactionState`
  - `resolveToggle(current: ReactionType | null, clicked: ReactionType): ToggleAction`
  - `applyOptimistic(state: ReactionState, action: ToggleAction): ReactionState`
  - `totalReactions(counts: ReactionCounts): number`
  - `postTargetType(type: 'community'|'channel'|undefined): ReactionTargetType`
  - `commentTargetType(type: 'community'|'channel'|undefined): ReactionTargetType`
  - `setReaction(targetType, targetId, type): Promise<ReactionState>`
  - `removeReaction(targetType, targetId): Promise<ReactionState>`

- [ ] **Step 1: Escribir el servicio (implementación completa)**

Create `src/services/reactionsService.ts`:

```ts
/**
 * ReactionsService
 * ----------------
 * Reacciones (emoji) para posts y comentarios de la comunidad.
 * Endpoints:
 *   - PUT    /community/reactions/:targetType/:targetId  body { type } -> fija/reemplaza
 *   - DELETE /community/reactions/:targetType/:targetId              -> quita
 * Ambos devuelven { reactions, myReaction }.
 */

import { api } from './apiClient';
import { getToken } from './authService';

export type ReactionType = 'LIKE' | 'LOVE' | 'LAUGH' | 'WOW' | 'SAD' | 'DISLIKE';

export type ReactionTargetType =
  | 'community_post'
  | 'community_channel_post'
  | 'community_comment'
  | 'community_channel_comment';

export type ReactionCounts = Record<ReactionType, number>;

export interface ReactionState {
  reactions: ReactionCounts;
  myReaction: ReactionType | null;
}

export type ToggleAction =
  | { method: 'PUT'; type: ReactionType }
  | { method: 'DELETE' };

export const REACTION_ORDER: ReactionType[] = ['LIKE', 'LOVE', 'LAUGH', 'WOW', 'SAD', 'DISLIKE'];

export const REACTION_META: Record<ReactionType, { emoji: string; label: string }> = {
  LIKE: { emoji: '👍', label: 'Me gusta' },
  LOVE: { emoji: '❤️', label: 'Me encanta' },
  LAUGH: { emoji: '😂', label: 'Me divierte' },
  WOW: { emoji: '😮', label: 'Me asombra' },
  SAD: { emoji: '😢', label: 'Me entristece' },
  DISLIKE: { emoji: '👎', label: 'No me gusta' },
};

export function emptyReactionCounts(): ReactionCounts {
  return { LIKE: 0, LOVE: 0, LAUGH: 0, WOW: 0, SAD: 0, DISLIKE: 0 };
}

function isReactionType(value: unknown): value is ReactionType {
  return typeof value === 'string' && (REACTION_ORDER as string[]).includes(value);
}

export function normalizeReactionState(raw: unknown): ReactionState {
  const counts = emptyReactionCounts();
  const source = (raw ?? {}) as { reactions?: Record<string, unknown>; myReaction?: unknown };
  if (source.reactions) {
    for (const type of REACTION_ORDER) {
      const n = Number(source.reactions[type]);
      counts[type] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  }
  return {
    reactions: counts,
    myReaction: isReactionType(source.myReaction) ? source.myReaction : null,
  };
}

export function resolveToggle(current: ReactionType | null, clicked: ReactionType): ToggleAction {
  if (current === clicked) {
    return { method: 'DELETE' };
  }
  return { method: 'PUT', type: clicked };
}

export function applyOptimistic(state: ReactionState, action: ToggleAction): ReactionState {
  const reactions = { ...state.reactions };
  if (state.myReaction) {
    reactions[state.myReaction] = Math.max(0, reactions[state.myReaction] - 1);
  }
  if (action.method === 'DELETE') {
    return { reactions, myReaction: null };
  }
  reactions[action.type] = reactions[action.type] + 1;
  return { reactions, myReaction: action.type };
}

export function totalReactions(counts: ReactionCounts): number {
  return REACTION_ORDER.reduce((sum, type) => sum + counts[type], 0);
}

export function postTargetType(type: 'community' | 'channel' | undefined): ReactionTargetType {
  return type === 'channel' ? 'community_channel_post' : 'community_post';
}

export function commentTargetType(type: 'community' | 'channel' | undefined): ReactionTargetType {
  return type === 'channel' ? 'community_channel_comment' : 'community_comment';
}

function setAuthHeader(): void {
  const token = getToken();
  if (token) {
    api.setHeader('Authorization', `Bearer ${token}`);
  }
}

export async function setReaction(
  targetType: ReactionTargetType,
  targetId: string,
  type: ReactionType,
): Promise<ReactionState> {
  setAuthHeader();
  const response = await api.put<unknown>(`/community/reactions/${targetType}/${targetId}`, { type });
  return normalizeReactionState(response);
}

export async function removeReaction(
  targetType: ReactionTargetType,
  targetId: string,
): Promise<ReactionState> {
  setAuthHeader();
  const response = await api.del<unknown>(`/community/reactions/${targetType}/${targetId}`);
  return normalizeReactionState(response);
}
```

- [ ] **Step 2: Escribir el test (debe fallar: el módulo aún no exporta todo o el import falla si se saltó el Step 1)**

Create `src/services/__tests__/reactionsService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../authService', () => ({ getToken: () => 'tok-123' }));

import { api } from '../apiClient';
import {
  applyOptimistic,
  commentTargetType,
  emptyReactionCounts,
  normalizeReactionState,
  postTargetType,
  removeReaction,
  resolveToggle,
  setReaction,
  totalReactions,
} from '../reactionsService';

describe('resolveToggle', () => {
  it('sin reacción previa → PUT con el type', () => {
    expect(resolveToggle(null, 'LIKE')).toEqual({ method: 'PUT', type: 'LIKE' });
  });
  it('misma reacción → DELETE', () => {
    expect(resolveToggle('LIKE', 'LIKE')).toEqual({ method: 'DELETE' });
  });
  it('reacción distinta → PUT con el nuevo type', () => {
    expect(resolveToggle('LIKE', 'LOVE')).toEqual({ method: 'PUT', type: 'LOVE' });
  });
});

describe('normalizeReactionState', () => {
  it('completa todas las claves con 0 y respeta myReaction', () => {
    const state = normalizeReactionState({ reactions: { LIKE: 3, LOVE: 1 }, myReaction: 'LIKE' });
    expect(state.reactions).toEqual({ LIKE: 3, LOVE: 1, LAUGH: 0, WOW: 0, SAD: 0, DISLIKE: 0 });
    expect(state.myReaction).toBe('LIKE');
  });
  it('null → todo en cero y myReaction null', () => {
    expect(normalizeReactionState(null)).toEqual({ reactions: emptyReactionCounts(), myReaction: null });
  });
  it('myReaction inválido → null', () => {
    expect(normalizeReactionState({ reactions: {}, myReaction: 'NOPE' }).myReaction).toBeNull();
  });
});

describe('applyOptimistic', () => {
  it('agrega reacción nueva', () => {
    const base = { reactions: emptyReactionCounts(), myReaction: null as null };
    const next = applyOptimistic(base, { method: 'PUT', type: 'LIKE' });
    expect(next.reactions.LIKE).toBe(1);
    expect(next.myReaction).toBe('LIKE');
  });
  it('reemplaza reacción (resta la vieja, suma la nueva)', () => {
    const base = normalizeReactionState({ reactions: { LIKE: 1 }, myReaction: 'LIKE' });
    const next = applyOptimistic(base, { method: 'PUT', type: 'LOVE' });
    expect(next.reactions.LIKE).toBe(0);
    expect(next.reactions.LOVE).toBe(1);
    expect(next.myReaction).toBe('LOVE');
  });
  it('quita reacción (DELETE)', () => {
    const base = normalizeReactionState({ reactions: { LIKE: 1 }, myReaction: 'LIKE' });
    const next = applyOptimistic(base, { method: 'DELETE' });
    expect(next.reactions.LIKE).toBe(0);
    expect(next.myReaction).toBeNull();
  });
});

describe('helpers', () => {
  it('totalReactions suma todas las claves', () => {
    expect(totalReactions({ LIKE: 3, LOVE: 1, LAUGH: 0, WOW: 2, SAD: 0, DISLIKE: 0 })).toBe(6);
  });
  it('postTargetType mapea community/channel', () => {
    expect(postTargetType('channel')).toBe('community_channel_post');
    expect(postTargetType('community')).toBe('community_post');
    expect(postTargetType(undefined)).toBe('community_post');
  });
  it('commentTargetType mapea community/channel', () => {
    expect(commentTargetType('channel')).toBe('community_channel_comment');
    expect(commentTargetType(undefined)).toBe('community_comment');
  });
});

describe('red', () => {
  it('setReaction hace PUT a la URL con el body correcto y normaliza', async () => {
    const spy = vi.spyOn(api, 'put').mockResolvedValue({ reactions: { LIKE: 1 }, myReaction: 'LIKE' });
    const state = await setReaction('community_post', 'abc', 'LIKE');
    expect(spy).toHaveBeenCalledWith('/community/reactions/community_post/abc', { type: 'LIKE' });
    expect(state.reactions.LIKE).toBe(1);
    expect(state.myReaction).toBe('LIKE');
    spy.mockRestore();
  });
  it('removeReaction hace DELETE a la URL y normaliza', async () => {
    const spy = vi.spyOn(api, 'del').mockResolvedValue({ reactions: {}, myReaction: null });
    const state = await removeReaction('community_channel_comment', 'xyz');
    expect(spy).toHaveBeenCalledWith('/community/reactions/community_channel_comment/xyz');
    expect(state.myReaction).toBeNull();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Correr el test y verificar que pasa**

Run: `pnpm exec vitest run src/services/__tests__/reactionsService.test.ts`
Expected: PASS (todos los `describe`).

- [ ] **Step 4: Extender interfaces `Post` y `Comment` en `communityService.ts`**

En `src/services/communityService.ts`, agregar el import de tipos al inicio (debajo de los imports existentes):

```ts
import type { ReactionCounts, ReactionType } from './reactionsService';
```

En la interface `Comment` (después de `user: PostUser;`), agregar:

```ts
  reactions?: ReactionCounts;
  myReaction?: ReactionType | null;
```

En la interface `Post` (después de `commentCount?: number;`), agregar:

```ts
  reactions?: ReactionCounts;
  myReaction?: ReactionType | null;
```

- [ ] **Step 5: Verificar typecheck/compilación**

Run: `pnpm build`
Expected: build OK (sin errores de TypeScript). Puede tardar; esperar a que termine.

- [ ] **Step 6: Commit**

```bash
git add src/services/reactionsService.ts src/services/__tests__/reactionsService.test.ts src/services/communityService.ts
git commit -m "feat: reactionsService (contrato + red) y tipos de reacciones en Post/Comment"
```

---

## Task 2: `reactionBar` — render (string) reutilizable

**Files:**
- Create: `src/components/comunidad/reactionBar.ts`
- Test: `src/components/__tests__/reactionBar.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` de `src/utils/helpers.ts`; de `reactionsService`: `REACTION_META`, `REACTION_ORDER`, `normalizeReactionState`, `totalReactions`, tipos `ReactionState`, `ReactionTargetType`, `ReactionType`; `logout` de `authService`; helpers de red `setReaction`/`removeReaction`/`resolveToggle`/`applyOptimistic` (se usan en Task 3, pero se importan acá).
- Produces (usado por Tasks 4-7):
  - `interface ReactionBarOptions { targetType: ReactionTargetType; targetId: string; reactions?: Record<string, number>; myReaction?: ReactionType | null; compact?: boolean }`
  - `renderReactionBar(opts: ReactionBarOptions): string`
  - `initReactionBars(): void` (se completa en Task 3)

- [ ] **Step 1: Escribir el render (sólo funciones puras de string, aún sin controlador)**

Create `src/components/comunidad/reactionBar.ts`:

```ts
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
```

- [ ] **Step 2: Escribir el test**

Create `src/components/__tests__/reactionBar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderReactionBar } from '../comunidad/reactionBar';

describe('renderReactionBar', () => {
  it('incluye targetType y targetId en data-attributes', () => {
    const html = renderReactionBar({ targetType: 'community_post', targetId: 'abc' });
    expect(html).toContain('data-rx-type="community_post"');
    expect(html).toContain('data-rx-id="abc"');
  });

  it('sin reacciones: el trigger dice "Recomendar" y no hay resumen', () => {
    const html = renderReactionBar({ targetType: 'community_comment', targetId: 'c1' });
    expect(html).toContain('Recomendar');
    expect(html).not.toContain('reacciones"');
    expect(html).not.toContain('1 reacción"');
  });

  it('con reacción propia: muestra label ES resaltado y el total', () => {
    const html = renderReactionBar({
      targetType: 'community_post',
      targetId: 'p1',
      reactions: { LIKE: 3, LOVE: 1 },
      myReaction: 'LIKE',
    });
    expect(html).toContain('Me gusta');
    expect(html).toContain('text-primary');
    expect(html).toContain('aria-label="4 reacciones"');
    expect(html).toContain('>4</span>');
  });

  it('el popover expone los 6 aria-label ES', () => {
    const html = renderReactionBar({ targetType: 'community_post', targetId: 'p2' });
    for (const label of ['Me gusta', 'Me encanta', 'Me divierte', 'Me asombra', 'Me entristece', 'No me gusta']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
```

- [ ] **Step 3: Correr el test y verificar que pasa**

Run: `pnpm exec vitest run src/components/__tests__/reactionBar.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/comunidad/reactionBar.ts src/components/__tests__/reactionBar.test.ts
git commit -m "feat: renderReactionBar (UI reutilizable como string) + tests"
```

---

## Task 3: `reactionBar` — controlador delegado + optimista + toast

**Files:**
- Modify: `src/components/comunidad/reactionBar.ts`

**Interfaces:**
- Consumes: de `reactionsService`: `applyOptimistic`, `removeReaction`, `resolveToggle`, `setReaction`, tipos `ReactionState`, `ReactionTargetType`, `ReactionType`; `normalizeReactionState`; `logout` de `authService`.
- Produces: `initReactionBars(): void` (idempotente).

> Nota: el controlador usa `document`/`window`, por lo que no se testea en Vitest `node`. Se verifica con `pnpm build` (typecheck) y QA manual (Task 8). La lógica de decisión (`resolveToggle`) y de estado (`applyOptimistic`) ya está testeada en Task 1.

- [ ] **Step 1: Agregar imports del controlador**

En `src/components/comunidad/reactionBar.ts`, ampliar el import de `reactionsService` para incluir las funciones de red/estado y agregar `logout`. El bloque de imports queda así:

```ts
import { escapeHtml } from '../../utils/helpers';
import {
  REACTION_META,
  REACTION_ORDER,
  applyOptimistic,
  normalizeReactionState,
  removeReaction,
  resolveToggle,
  setReaction,
  totalReactions,
  type ReactionState,
  type ReactionTargetType,
  type ReactionType,
} from '../../services/reactionsService';
import { logout } from '../../services/authService';
```

- [ ] **Step 2: Agregar el controlador y el toast al final del archivo**

Al final de `src/components/comunidad/reactionBar.ts`, agregar:

```ts
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
    const confirmed = action.method === 'DELETE'
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
  if (err?.status === 401) {
    logout();
    return;
  }
  showReactionToast(err?.body?.message || defaultMessageForStatus(err?.status));
}

let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

function showReactionToast(message: string): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.className = 'fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-error px-4 py-2 text-sm font-medium text-white shadow-lg transition-opacity duration-300';
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
```

- [ ] **Step 3: Verificar typecheck/compilación**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 4: Correr toda la suite (no debe romper nada)**

Run: `pnpm test`
Expected: PASS (incluye Tasks 1 y 2).

- [ ] **Step 5: Commit**

```bash
git add src/components/comunidad/reactionBar.ts
git commit -m "feat: controlador delegado de reacciones (optimista + reconciliación + toast)"
```

---

## Task 4: Integrar en `ComunidadFeed.astro` (posts del feed)

**Files:**
- Modify: `src/components/comunidad/ComunidadFeed.astro`

**Interfaces:**
- Consumes: `renderReactionBar`, `initReactionBars` de `./reactionBar`; `postTargetType` de `../../services/reactionsService`.

- [ ] **Step 1: Agregar imports en el `<script>`**

En `src/components/comunidad/ComunidadFeed.astro`, dentro del bloque de imports del `<script>` (después de `import { renderMarkdown } from '../../utils/markdown';`), agregar:

```ts
  import { renderReactionBar, initReactionBars } from './reactionBar';
  import { postTargetType } from '../../services/reactionsService';
```

Y justo después de las declaraciones de constantes DOM (después de la línea `const openNewPostModalButton = ...`), inicializar el controlador una vez:

```ts
  initReactionBars();
```

- [ ] **Step 2: Insertar el bar en `renderFeedPost`**

En `renderFeedPost`, reemplazar el bloque de acciones actual:

```ts
        <div class="pl-11 mt-3 flex items-center gap-4">
          <button class="btn-open-comments text-xs text-on-surface-variant hover:text-primary font-semibold flex items-center gap-1 transition-colors" data-post-id="${post.id}">
            <span class="material-symbols-outlined text-sm" aria-hidden="true">comment</span>
            <span class="comment-count-label">${commentCount} ${commentCount === 1 ? 'comentario' : 'comentarios'}</span>
          </button>
        </div>`;
```

por (agrega una fila con el bar debajo de las acciones; `postType` ya está calculado arriba en la función):

```ts
        <div class="pl-11 mt-3 flex items-center gap-4">
          <button class="btn-open-comments text-xs text-on-surface-variant hover:text-primary font-semibold flex items-center gap-1 transition-colors" data-post-id="${post.id}">
            <span class="material-symbols-outlined text-sm" aria-hidden="true">comment</span>
            <span class="comment-count-label">${commentCount} ${commentCount === 1 ? 'comentario' : 'comentarios'}</span>
          </button>
        </div>
        <div class="pl-11 mt-2">
          ${renderReactionBar({ targetType: postTargetType(postType), targetId: post.id, reactions: post.reactions, myReaction: post.myReaction })}
        </div>`;
```

- [ ] **Step 3: Verificar typecheck/compilación**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/comunidad/ComunidadFeed.astro
git commit -m "feat: reacciones en el feed de comunidad"
```

---

## Task 5: Integrar en `ComunidadMyPosts.astro` (mis posts)

**Files:**
- Modify: `src/components/comunidad/ComunidadMyPosts.astro`

**Interfaces:**
- Consumes: `renderReactionBar`, `initReactionBars` de `./reactionBar`; `postTargetType` de `../../services/reactionsService`.

- [ ] **Step 1: Agregar imports en el `<script>`**

En `src/components/comunidad/ComunidadMyPosts.astro`, después de `import { renderMarkdown } from '../../utils/markdown';`, agregar:

```ts
  import { renderReactionBar, initReactionBars } from './reactionBar';
  import { postTargetType } from '../../services/reactionsService';
```

Y después de `const mypostsChannelSelect = ...`, agregar:

```ts
  initReactionBars();
```

- [ ] **Step 2: Insertar el bar en `renderMyPost`**

En `renderMyPost`, reemplazar el bloque final de acciones:

```ts
        <div class="border-t border-outline-variant/10 pt-3 mt-3">
          <div class="flex items-center gap-4">
            <button class="btn-open-comments text-xs text-on-surface-variant hover:text-primary font-semibold flex items-center gap-1 transition-colors" data-post-id="${post.id}">
              <span class="material-symbols-outlined text-sm" aria-hidden="true">comment</span>
              <span class="comment-count-label">${commentCount} ${commentCount === 1 ? 'comentario recibido' : 'comentarios recibidos'}</span>
            </button>
          </div>
        </div>
      </article>`;
```

por (usa `postType`, ya calculado más arriba en la función):

```ts
        <div class="border-t border-outline-variant/10 pt-3 mt-3">
          <div class="flex items-center gap-4">
            <button class="btn-open-comments text-xs text-on-surface-variant hover:text-primary font-semibold flex items-center gap-1 transition-colors" data-post-id="${post.id}">
              <span class="material-symbols-outlined text-sm" aria-hidden="true">comment</span>
              <span class="comment-count-label">${commentCount} ${commentCount === 1 ? 'comentario recibido' : 'comentarios recibidos'}</span>
            </button>
          </div>
          <div class="mt-2">
            ${renderReactionBar({ targetType: postTargetType(postType === 'channel' ? 'channel' : 'community'), targetId: post.id, reactions: post.reactions, myReaction: post.myReaction })}
          </div>
        </div>
      </article>`;
```

- [ ] **Step 3: Verificar typecheck/compilación**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/comunidad/ComunidadMyPosts.astro
git commit -m "feat: reacciones en Mis Posts"
```

---

## Task 6: Integrar en `ComunidadPostModal.astro` (comentarios del modal)

**Files:**
- Modify: `src/components/comunidad/ComunidadPostModal.astro`

**Interfaces:**
- Consumes: `renderReactionBar`, `initReactionBars` de `./reactionBar`; `commentTargetType` de `../../services/reactionsService`.
- Usa la variable de módulo `modalChannelType` (`'community' | 'channel'`) ya existente en el script.

- [ ] **Step 1: Agregar imports en el `<script>`**

En `src/components/comunidad/ComunidadPostModal.astro`, después de `import { renderMarkdown } from '../../utils/markdown';`, agregar:

```ts
  import { renderReactionBar, initReactionBars } from './reactionBar';
  import { commentTargetType } from '../../services/reactionsService';
```

Y después de `const modalCommentSend = ...` (última const DOM), agregar:

```ts
  initReactionBars();
```

- [ ] **Step 2: Insertar el bar compacto en `renderCommentHtml`**

En `renderCommentHtml`, reemplazar el `<div class="flex-1">...</div>` para agregar el bar debajo del contenido del comentario. El bloque queda así:

```ts
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-on-surface">${escapeHtml(commenterName)}</span>
            <span class="text-[10px] text-on-surface-variant">${escapeHtml(formatDate(comment.createdAt))}</span>
          </div>
          <div class="markdown-content text-xs text-on-surface-variant mt-0.5">${renderMarkdown(comment.content)}</div>
          <div class="mt-1.5">
            ${renderReactionBar({ targetType: commentTargetType(modalChannelType), targetId: comment.id, reactions: comment.reactions, myReaction: comment.myReaction, compact: true })}
          </div>
        </div>
```

- [ ] **Step 3: Verificar typecheck/compilación**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/comunidad/ComunidadPostModal.astro
git commit -m "feat: reacciones en comentarios (modal de comunidad y canal)"
```

---

## Task 7: Integrar en `dashboard/comunidad/post.astro` (detalle de post + comentarios)

**Files:**
- Modify: `src/pages/dashboard/comunidad/post.astro`

**Interfaces:**
- Consumes: `renderReactionBar`, `initReactionBars` de `../../../components/comunidad/reactionBar`; `postTargetType`, `commentTargetType` de `../../../services/reactionsService`.
- Usa la variable de módulo `readerType` (`'community' | 'channel'`) ya existente.

- [ ] **Step 1: Agregar el contenedor del bar en el markup del post**

En el HTML del panel del post, después de la línea `<div id="post-content" ...></div>` (dentro de `#post-content-wrapper`), agregar:

```html
          <div id="post-reactions" class="mt-4"></div>
```

- [ ] **Step 2: Agregar imports y referencia DOM en el `<script>`**

Después de `import { getProfilePhotoUrl } from '../../../services/profileService';`, agregar:

```ts
    import { renderReactionBar, initReactionBars } from '../../../components/comunidad/reactionBar';
    import { postTargetType, commentTargetType } from '../../../services/reactionsService';
```

Junto a las otras referencias DOM (después de `const commentError = ...`), agregar:

```ts
    const postReactions = document.getElementById('post-reactions') as HTMLDivElement;
```

E inicializar el controlador una vez, después de la comprobación de sesión (`if (!isAuthenticated()) { ... }`):

```ts
    initReactionBars();
```

- [ ] **Step 3: Renderizar el bar del post en `renderPostDetail`**

Dentro de `renderPostDetail`, después de `postContent.innerHTML = renderMarkdown(post.content || '');`, agregar:

```ts
      postReactions.innerHTML = renderReactionBar({
        targetType: postTargetType(readerType),
        targetId: post.id,
        reactions: post.reactions,
        myReaction: post.myReaction,
      });
```

- [ ] **Step 4: Renderizar el bar compacto en `renderCommentCard`**

Reemplazar el `renderCommentCard` actual por (agrega el bar compacto tras el contenido del comentario):

```ts
    function renderCommentCard(comment: Comment): string {
      return `
        <article class="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-3">
          <div class="mb-2 flex items-center gap-2 min-w-0">
            <img src="${escapeHtml(getProfilePhotoUrl(comment.user?.photoUrl, comment.user?.id || ''))}" alt="" class="w-7 h-7 rounded-full object-cover bg-surface-container shrink-0" loading="lazy" onerror="this.onerror=null;this.src='/images/default-avatar.svg'" />
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-on-surface">${escapeHtml(getCommentAuthor(comment))}</p>
              <p class="text-xs text-on-surface-variant">${escapeHtml(formatDate(comment.createdAt))}</p>
            </div>
          </div>
          <div class="markdown-content text-sm text-on-surface-variant">${renderMarkdown(comment.content || '')}</div>
          <div class="mt-2">
            ${renderReactionBar({ targetType: commentTargetType(readerType), targetId: comment.id, reactions: comment.reactions, myReaction: comment.myReaction, compact: true })}
          </div>
        </article>`;
    }
```

- [ ] **Step 5: Verificar typecheck/compilación**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/comunidad/post.astro
git commit -m "feat: reacciones en detalle de post y sus comentarios"
```

---

## Task 8: Verificación final (CI + QA manual)

**Files:** ninguno (verificación).

- [ ] **Step 1: Correr el pipeline completo**

Run: `pnpm ci`
Expected: `biome check` OK, `vitest run` PASS (todos los tests incl. reactionsService y reactionBar), `astro build` OK.

- [ ] **Step 2: QA manual (con backend deployado y sesión iniciada)**

Levantar dev (`pnpm dev`) e ir a `/dashboard/comunidad`. Verificar:
- Feed: cada post muestra el bar. Sin reacciones no aparece el resumen; el botón dice "Recomendar".
- Click en el botón abre el popover con los 6 emojis; elegir uno actualiza al instante (conteo + total + botón resaltado con label ES). Reabrir el popover y tocar la misma la saca; tocar otra la reemplaza.
- El resumen agrupa sólo los emojis con `count > 0` y muestra el total.
- Cambiar a un canal/grupo: los posts de canal reaccionan (targetType `community_channel_post`).
- "Mis Posts": mismo comportamiento; los posts de grupo usan el targetType de canal.
- Abrir comentarios (modal): cada comentario tiene el bar compacto y reacciona (community/channel según el post).
- Detalle de post (`/dashboard/comunidad/post?...`): el post y cada comentario reaccionan.
- Accesibilidad: `Tab` llega al botón y a las opciones; `Enter`/`Espacio` activan; `Escape` cierra el popover; lector de pantalla anuncia los labels ES.
- Errores: forzar un 404 (por ejemplo reaccionar a contenido pausado/sin acceso) revierte el estado y muestra el toast en español; un 401 redirige a `/login`.
- Click en una reacción NO abre el post ni el modal (no navega).

- [ ] **Step 3: Commit final (si hubo ajustes menores durante QA)**

```bash
git add -A
git commit -m "chore: ajustes de QA de reacciones en comunidad"
```

---

## Self-Review (hecho por el autor del plan)

**Spec coverage:**
- Componente reutilizable `{ targetType, targetId, reactions, myReaction }` → Task 2 (`renderReactionBar`).
- Toggle PUT/DELETE en el front → Task 1 (`resolveToggle`) + Task 3 (controlador).
- Actualización optimista + reconciliación + revert → Task 3.
- Integración feed / mis posts / detalle / comentarios / canales → Tasks 4-7 (cubren los 4 `targetType`).
- Accesibilidad (teclado + aria-labels ES) → Task 2 (markup) + Task 3 (focus/Escape) + Task 8 (QA).
- Errores ES + 401 redirect → Task 3 (`handleReactionError`, `defaultMessageForStatus`).
- Reacciones embebidas en lecturas → Task 1 Step 4 (tipos en `Post`/`Comment`; los valores ya vienen del back).

**Placeholder scan:** sin TBD/TODO; todos los steps de código tienen contenido real.

**Type consistency:** `renderReactionBar(opts)`, `initReactionBars()`, `postTargetType`/`commentTargetType`, `setReaction`/`removeReaction`, `resolveToggle`, `applyOptimistic`, `normalizeReactionState` se usan con las mismas firmas definidas en Tasks 1-2. `readerType`/`modalChannelType`/`postType` existen en los archivos destino.
