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
