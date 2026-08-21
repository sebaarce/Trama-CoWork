import { api, apiURL } from './apiClient';
import { getToken, logout } from './authService';

// Types

export interface ExternalJob {
  id: string | number;
  source: string;
  externalId: string;
  title: string;
  link: string;
  categoryName: string | null;
  publishedAt: string;
  createdAt: string;
}

export interface ExternalJobCategory {
  categoryName: string;
  count: number;
}

export interface PaginatedExternalJobs {
  data: ExternalJob[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Source label mapping

export const SOURCE_LABELS: Record<string, string> = {
  getonboard: 'Get on Board',
};

// Paths

const EXTERNAL_JOBS_PATH = new URL(apiURL('/external-job-postings')).pathname;
const EXTERNAL_JOBS_CATEGORIES_PATH = new URL(apiURL('/external-job-postings/categories')).pathname;

// Auth helper

function setAuthHeader(): void {
  const token = getToken();
  if (token) {
    api.setHeader('Authorization', `Bearer ${token}`);
  }
}

// Service functions

export async function fetchExternalJobs(q?: string, categoryName?: string, page = 1): Promise<PaginatedExternalJobs> {
  setAuthHeader();
  try {
    return await api.get<PaginatedExternalJobs>(EXTERNAL_JOBS_PATH, {
      q,
      categoryName,
      page,
    });
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 401) {
      logout();
    }
    throw err;
  }
}

export async function fetchExternalJobsCategories(): Promise<ExternalJobCategory[]> {
  setAuthHeader();
  try {
    return await api.get<ExternalJobCategory[]>(EXTERNAL_JOBS_CATEGORIES_PATH);
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 401) {
      logout();
    }
    throw err;
  }
}
