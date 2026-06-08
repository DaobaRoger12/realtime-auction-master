/**
 * 管理后台 REST 客户端（商家视角）。
 */
import type {
  ApiResponse,
  AuctionRules,
  AuctionWithProduct,
  AuthResponse,
  Bid,
  CreateProductRequest,
  Order,
  Paginated,
  Product,
  User,
  AiDescribeResponse,
} from '@auction/shared';

const TOKEN_KEY = 'auction_admin_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

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
  if (!resp.ok || body.code !== 0) throw new Error(body?.message || `请求失败 (${resp.status})`);
  return body.data;
}

export const api = {
  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (p: { username: string; password: string; nickname: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...p, role: 'MERCHANT' }),
    }),
  me: () => request<User>('/auth/me'),

  // 商品
  createProduct: (p: CreateProductRequest) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(p) }),
  listProducts: () => request<Product[]>('/products'),

  // 竞拍
  createAuction: (p: {
    productId?: number;
    product?: CreateProductRequest;
    rules: AuctionRules;
    startAt?: string;
  }) => request<AuctionWithProduct>('/auctions', { method: 'POST', body: JSON.stringify(p) }),
  listMine: (status?: string, page = 1, pageSize = 50) => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) q.set('status', status);
    return request<Paginated<AuctionWithProduct>>(`/auctions/mine?${q}`);
  },
  getAuction: (id: number) =>
    request<AuctionWithProduct & { onlineCount: number; ranking: any[] }>(`/auctions/${id}`),
  updateRules: (id: number, body: { rules?: Partial<AuctionRules>; startAt?: string }) =>
    request<AuctionWithProduct>(`/auctions/${id}/rules`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  startAuction: (id: number) =>
    request<AuctionWithProduct>(`/auctions/${id}/start`, { method: 'POST' }),
  cancelAuction: (id: number, reason: string) =>
    request<AuctionWithProduct>(`/auctions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getBids: (id: number, page = 1, pageSize = 50) =>
    request<Paginated<Bid>>(`/auctions/${id}/bids?page=${page}&pageSize=${pageSize}`),

  // 订单
  myOrders: (page = 1, pageSize = 50) =>
    request<Paginated<Order>>(`/orders/mine?page=${page}&pageSize=${pageSize}`),

  // AI
  aiStatus: () => request<{ available: boolean }>('/ai/status'),
  aiDescribe: (title: string, category: string, keywords?: string) =>
    request<AiDescribeResponse>('/ai/describe', {
      method: 'POST',
      body: JSON.stringify({ title, category, keywords }),
    }),
};
