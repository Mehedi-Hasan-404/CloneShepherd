import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { FavoriteChannel } from '@/types';

interface FavoritesContextType {
  favorites: FavoriteChannel[];
  addFavorite: (channel: Omit<FavoriteChannel, 'addedAt'>) => void;
  removeFavorite: (channelId: string) => void;
  isFavorite: (channelId: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

interface FavoritesProviderProps {
  children: ReactNode;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({ children }) => {
  const [favorites, setFavorites] = useState<FavoriteChannel[]>([]);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('iptv-favorites');
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    }
  }, []);

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('iptv-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const addFavorite = (channel: Omit<FavoriteChannel, 'addedAt'>) => {
    const newFavorite: FavoriteChannel = {
      ...channel,
      addedAt: Date.now(),
    };
    setFavorites(prev => [...prev.filter(fav => fav.id !== channel.id), newFavorite]);
  };

  const removeFavorite = (channelId: string) => {
    setFavorites(prev => prev.filter(fav => fav.id !== channelId));
  };

  const isFavorite = (channelId: string) => {
    return favorites.some(fav => fav.id === channelId);
  };

  return (
    <FavoritesContext.Provider value={{
      favorites,
      addFavorite,
      removeFavorite,
      isFavorite,
    }}>
      {children}
    </FavoritesContext.Provider>
  );
};