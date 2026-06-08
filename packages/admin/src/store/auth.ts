import { create } from 'zustand';
import { api, getToken, setToken } from '../lib/api';
import type { User } from '@auction/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, p: string, n: string) => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  login: async (username, password) => {
    const res = await api.login(username, password);
    if (res.user.role !== 'MERCHANT') throw new Error('请使用商家账号登录管理后台');
    setToken(res.token);
    set({ user: res.user, token: res.token });
  },
  register: async (username, password, nickname) => {
    const res = await api.register({ username, password, nickname });
    setToken(res.token);
    set({ user: res.user, token: res.token });
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
