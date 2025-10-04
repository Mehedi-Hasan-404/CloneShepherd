// /src/types/index.ts
export interface User {
  uid: string;
  email: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  m3uUrl?: string; // M3U playlist URL
  order?: number; // Display order for sorting categories
}

export interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
}

export interface AdminChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
  authCookie?: string;
}

export interface FavoriteChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryName: string;
  addedAt: number;
}

export interface RecentChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryName: string;
  watchedAt: number;
}
