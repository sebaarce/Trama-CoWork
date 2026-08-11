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
