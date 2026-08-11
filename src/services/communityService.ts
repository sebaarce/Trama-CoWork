/**
 * CommunityService
 * ----------------
 * Llamadas a la API para la comunidad (canales, posts, comentarios).
 * Endpoints:
 *   - GET    /community/channels        -> Canales del usuario (general + rubro)
 *   - GET    /community/posts?channel=X  -> Posts de un canal
 *   - GET    /community/my-posts         -> Mis posts con comentarios recibidos
 *   - POST   /community/posts            -> Crear post
 *   - DELETE /community/posts/:id        -> Eliminar post
 *   - PATCH  /community/posts/:id/status -> Cambiar estado (published/paused)
 *   - GET    /community/posts/:id/comments -> Comentarios paginados de un post
 *   - POST   /community/comments         -> Comentar en un post
 *   - DELETE /community/comments/:id     -> Eliminar comentario
 */

import { api, apiURL } from './apiClient';
import { getToken } from './authService';
import type { ReactionCounts, ReactionType } from './reactionsService';

// ─── Tipos ─────────────────────────────────────────────────────

export interface Channel {
  type: 'community' | 'channel';
  slug: string;
  name: string;
  unreadCount?: number;
}

export interface PostUser {
  id: string;
  email: string;
  profile?: { name: string };
  /** Ruta parcial de la foto (`/uploads/photo/{id}`) o null si no tiene. */
  photoUrl?: string | null;
}

export interface Comment {
  id: string;
  userId: string;
  postId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: PostUser;
  reactions?: ReactionCounts;
  myReaction?: ReactionType | null;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  type?: 'community' | 'channel';
  channelSlug?: string;
  channelId?: string;
  channelName?: string;
  status?: 'published' | 'paused';
  createdAt: string;
  updatedAt: string;
  user: PostUser;
  commentCount?: number;
  reactions?: ReactionCounts;
  myReaction?: ReactionType | null;
}

export interface PaginatedPosts {
  data: Post[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedComments {
  data: Comment[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface FlatUserData {
  id?: string;
  userId?: string;
  email?: string | null;
  nombre?: string | null;
  photoUrl?: string | null;
  user?: PostUser;
}

type RawPost = Omit<Post, 'user'> & FlatUserData;
type RawComment = Omit<Comment, 'user'> & FlatUserData;

const CHANNELS_PATH = new URL(apiURL('/channels')).pathname;

function setAuthHeader(): void {
  const token = getToken();
  if (token) {
    api.setHeader('Authorization', `Bearer ${token}`);
  }
}

function mapPostUser(raw: FlatUserData): PostUser {
  if (raw.user) {
    return raw.user;
  }

  return {
    id: raw.userId || raw.id || '',
    email: raw.email || '',
    profile: {
      name: raw.nombre || '',
    },
    photoUrl: raw.photoUrl ?? null,
  };
}

function adaptPost(raw: RawPost): Post {
  return {
    ...raw,
    user: mapPostUser(raw),
  };
}

function adaptComment(raw: RawComment): Comment {
  return {
    ...raw,
    user: mapPostUser(raw),
  };
}

// ─── Fetch ─────────────────────────────────────────────────────

/** Canales disponibles para el usuario (general + su rubro) */
export async function fetchChannels(): Promise<Channel[]> {
  const response = await api.get<Channel[] | { data?: Channel[] }>('/community/channels');
  const raw = Array.isArray(response) ? response : (response.data ?? []);
  return raw.map(ch => ({
    ...ch,
    type: ch.type ?? 'community',
  }));
}

/** Posts de un canal */
export async function fetchPosts(channel = 'general', page = 1, limit = 20): Promise<PaginatedPosts> {
  return api.get<PaginatedPosts>('/community/posts', { channel, page, limit });
}

/** Mis posts con comentarios recibidos */
export async function fetchMyPosts(page = 1, limit = 20): Promise<PaginatedPosts> {
  return api.get<PaginatedPosts>('/community/my-posts', { page, limit });
}

/** Crear un post */
export async function createPost(content: string, channelSlug = 'general'): Promise<Post> {
  return api.post<Post>('/community/posts', { content, channelSlug });
}

/** Crear un post en canal */
export async function createChannelPost(channelId: string, content: string): Promise<Post> {
  setAuthHeader();
  const response = await api.post<RawPost>(`${CHANNELS_PATH}/${channelId}/posts`, { content });
  return adaptPost(response);
}

/** Eliminar un post */
export async function deletePost(postId: string): Promise<void> {
  return api.del<void>(`/community/posts/${postId}`);
}

/** Cambiar estado de un post (published/paused) */
export async function updatePostStatus(postId: string, status: 'published' | 'paused'): Promise<Post> {
  return api.patch<Post>(`/community/posts/${postId}/status`, { status });
}

/** Eliminar un post de canal (solo autor) */
export async function deleteChannelPost(channelId: string, postId: string): Promise<void> {
  setAuthHeader();
  await api.del<void>(`${CHANNELS_PATH}/${channelId}/posts/${postId}`);
}

/** Cambiar estado de un post de canal (published/paused, solo autor) */
export async function updateChannelPostStatus(
  channelId: string,
  postId: string,
  status: 'published' | 'paused',
): Promise<Post> {
  setAuthHeader();
  const response = await api.patch<RawPost>(`${CHANNELS_PATH}/${channelId}/posts/${postId}/status`, { status });
  return adaptPost(response);
}

/** Editar el contenido de un post de comunidad (solo autor) */
export async function updatePost(postId: string, content: string): Promise<Post> {
  return api.patch<Post>(`/community/posts/${postId}`, { content });
}

/** Editar el contenido de un post de canal (solo autor) */
export async function updateChannelPost(channelId: string, postId: string, content: string): Promise<Post> {
  setAuthHeader();
  const response = await api.patch<RawPost>(`${CHANNELS_PATH}/${channelId}/posts/${postId}`, { content });
  return adaptPost(response);
}

/** Comentar en un post */
export async function createComment(postId: string, content: string): Promise<Comment> {
  return api.post<Comment>('/community/comments', { postId, content });
}

/** Eliminar un comentario */
export async function deleteComment(commentId: string): Promise<void> {
  return api.del<void>(`/community/comments/${commentId}`);
}

/** Eliminar un comentario de canal (owner o admin) */
export async function deleteChannelComment(
  channelId: string,
  postId: string,
  commentId: string,
): Promise<void> {
  setAuthHeader();
  await api.del<void>(`${CHANNELS_PATH}/${channelId}/posts/${postId}/comments/${commentId}`);
}

/** Comentarios paginados de un post */
export async function fetchPostComments(postId: string, page = 1, limit = 10): Promise<PaginatedComments> {
  return api.get<PaginatedComments>(`/community/posts/${postId}/comments`, { page, limit });
}

export async function fetchChannelPosts(channelId: string, page = 1, limit = 20): Promise<PaginatedPosts> {
  setAuthHeader();
  const response = await api.get<RawPost[] | PaginatedPosts | { data?: RawPost[]; total?: number; page?: number; limit?: number }>(
    `${CHANNELS_PATH}/${channelId}/posts`,
    { page, limit },
  );

  if (Array.isArray(response)) {
    const posts = response.map(adaptPost);
    return { data: posts, total: posts.length, page, limit };
  }

  const posts = (response.data ?? []).map(adaptPost);
  return {
    data: posts,
    total: response.total ?? posts.length,
    page: response.page ?? page,
    limit: response.limit ?? limit,
  };
}

export async function fetchChannelPost(channelId: string, postId: string): Promise<Post> {
  setAuthHeader();
  const response = await api.get<RawPost>(`${CHANNELS_PATH}/${channelId}/posts/${postId}`);
  return adaptPost(response);
}

export async function fetchChannelPostComments(
  channelId: string,
  postId: string,
  page = 1,
  limit = 10,
): Promise<PaginatedComments> {
  setAuthHeader();
  const response = await api.get<
    RawComment[] | PaginatedComments | { data?: RawComment[]; meta?: PaginatedComments['meta']; total?: number; totalPages?: number; page?: number; limit?: number }
  >(`${CHANNELS_PATH}/${channelId}/posts/${postId}/comments`, { page, limit });

  if (Array.isArray(response)) {
    const comments = response.map(adaptComment);
    return {
      data: comments,
      meta: { page, limit, total: comments.length, totalPages: 1 },
    };
  }

  const comments = (response.data ?? []).map(adaptComment);
  const meta = response.meta ?? {
    page: response.page ?? page,
    limit: response.limit ?? limit,
    total: response.total ?? comments.length,
    totalPages: response.totalPages ?? 1,
  };

  return {
    data: comments,
    meta,
  };
}

export async function createChannelComment(channelId: string, postId: string, content: string): Promise<Comment> {
  setAuthHeader();
  const response = await api.post<RawComment>(`${CHANNELS_PATH}/${channelId}/posts/${postId}/comments`, { content });
  return adaptComment(response);
}

export async function markSeen(channel: Channel): Promise<void> {
  const path = channel.type === 'channel'
    ? `${CHANNELS_PATH}/${channel.slug}/seen`
    : `/community/channels/${channel.slug}/seen`;

  try {
    setAuthHeader();
    await api.post<void>(path);
  } catch {
    // fire-and-forget safe
  }
}

export async function getUnreadCount(channel: Channel): Promise<number> {
  const path = channel.type === 'channel'
    ? `${CHANNELS_PATH}/${channel.slug}/unread-count`
    : `/community/channels/${channel.slug}/unread-count`;

  try {
    setAuthHeader();
    const response = await api.get<{ count?: number | string }>(path);
    const count = Number(response.count ?? 0);
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

export async function fetchCommunityPost(id: string): Promise<Post> {
  setAuthHeader();
  const response = await api.get<RawPost>(`/community/posts/${id}`);
  return adaptPost(response);
}
