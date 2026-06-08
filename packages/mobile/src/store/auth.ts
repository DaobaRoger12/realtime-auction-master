/**
 * 认证状态（zustand）。持久化 token，提供登录/登出/拉取我的信息。
 */
import { create } from 'zustand';
import { api, getToken, setToken } from '../lib/api';
import type { User } from '@auction/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  loading: false,

  login: async (username, password) => {
    set({ loading: true });
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      set({ user: res.user, token: res.token });
    } finally {
      set({ loading: false });
    }
  },

  register: async (username, password, nickname) => {
    set({ loading: true });
    try {
      const res = await api.register({ username, password, nickname, role: 'BUYER' });
      setToken(res.token);
      set({ user: res.user, token: res.token });
    } finally {
      set({ loading: false });
    }
  },

  logout: () => {
    setToken(null);
    set({ user: null, token: null });
  },

  bootstrap: async () => {
    if (!getToken()) return;
    try {
      const user = await api.me();
      set({ user, token: getToken() });
    } catch {
      setToken(null);
      set({ user: null, token: null });
    }
  },
}));
