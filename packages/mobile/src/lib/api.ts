/**
 * REST API 客户端。统一附带 JWT、解析响应信封、抛出业务错误。
 */
import type {
  ApiResponse,
  AuctionWithProduct,
  AuthResponse,
  Bid,
  Order,
  Paginated,
  RankingEntry,
  User,
} from '@auction/shared';

const TOKEN_KEY = 'auction_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`/api${path}`, { ...options, headers });
  let body: ApiResponse<T>;
  try {
    body = await resp.json();
  } catch {
    throw new Error(`请求失败 (${resp.status})`);
  }
  if (!resp.ok || body.code !== 0) {
    throw new Error(body?.message || `请求失败 (${resp.status})`);
  }
  return body.data;
}

export const api = {
  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (payload: { username: string; password: string; nickname: string; role: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: () => request<User>('/auth/me'),

  listAuctions: (params: { status?: string; page?: number; pageSize?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    return request<Paginated<AuctionWithProduct>>(`/auctions?${q.toString()}`);
  },
  getAuction: (id: number) =>
    request<AuctionWithProduct & { onlineCount: number; ranking: RankingEntry[] }>(
      `/auctions/${id}`
    ),
  getRanking: (id: number, limit = 20) =>
    request<{ ranking: RankingEntry[]; myBestAmount: number | null }>(
      `/auctions/${id}/ranking?limit=${limit}`
    ),
  getBids: (id: number, page = 1, pageSize = 20) =>
    request<Paginated<Bid>>(`/auctions/${id}/bids?page=${page}&pageSize=${pageSize}`),

  myOrders: (page = 1, pageSize = 20) =>
    request<Paginated<Order>>(`/orders/mine?page=${page}&pageSize=${pageSize}`),
  orderByAuction: (auctionId: number) =>
    request<Order>(`/orders/by-auction/${auctionId}`),
  payOrder: (id: number) => request<Order>(`/orders/${id}/pay`, { method: 'POST' }),

  aiCommentary: (auctionId: number, scene: 'open' | 'bid' | 'ending' | 'sold') =>
    request<{ text: string }>('/ai/commentary', {
      method: 'POST',
      body: JSON.stringify({ auctionId, scene }),
    }),
};
