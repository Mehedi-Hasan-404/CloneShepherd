// Core IPTV App Types

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconUrl: string;
}

export interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  categoryId: string;
  categoryName: string;
}

export interface AdminChannel extends PublicChannel {
  streamUrl: string;
  authCookie?: string;
}

export interface FavoriteChannel {
  id: string;
  name: string;
  logoUrl: string;
  categoryId: string;
  categoryName: string;
  addedAt: number;
}

export interface RecentChannel extends PublicChannel {
  watchedAt: number;
}

export interface User {
  uid: string;
  email: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  autoplay: boolean;
  quality: 'auto' | 'high' | 'medium' | 'low';
}