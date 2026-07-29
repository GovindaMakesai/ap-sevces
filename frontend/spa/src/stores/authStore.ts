import { create } from 'zustand';

export type ApUser = {
  id: string;
  display_id?: string | number;
  first_name?: string;
  last_name?: string;
  email?: string;
  profile_pic?: string | null;
  role?: string;
  is_admin?: boolean;
  [key: string]: unknown;
};

type AuthState = {
  user: ApUser | null;
  token: string | null;
  hydrated: boolean;
  setSession: (user: ApUser | null, token?: string | null) => void;
  clearSession: () => void;
  patchUser: (partial: Partial<ApUser>) => void;
};

function readUser(): ApUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as ApUser;
  } catch {
    return null;
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem('token') || localStorage.getItem('access_token');
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  hydrated: false,
  setSession: (user, token = null) => {
    try {
      if (user) localStorage.setItem('user', JSON.stringify(user));
      else localStorage.removeItem('user');
      if (token) localStorage.setItem('token', token);
    } catch {
      /* ignore */
    }
    set({ user, token: token ?? get().token, hydrated: true });
  },
  clearSession: () => {
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('access_token');
    } catch {
      /* ignore */
    }
    set({ user: null, token: null, hydrated: true });
  },
  patchUser: (partial) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...partial };
    try {
      localStorage.setItem('user', JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ user: next });
  },
}));

export function hydrateAuthFromStorage() {
  useAuthStore.setState({
    user: readUser(),
    token: readToken(),
    hydrated: true,
  });
}
