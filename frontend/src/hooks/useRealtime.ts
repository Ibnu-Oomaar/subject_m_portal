import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { invalidateResults, queryClient } from '@/lib/queryClient';

/**
 * Live notices ("marks changed") from the server. The socket carries no marks, only which section changed, so the
 * data is simply refetched through the normal, authorised API. If the socket cannot connect, nothing breaks: screens
 * still refresh on focus and after every save.
 */
export function useRealtime(enabled: boolean): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || undefined;
    const socket = io(apiBaseUrl, { path: '/api/socket.io', transports: ['websocket'], withCredentials: true, reconnectionDelayMax: 15_000 });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('marks.changed', () => void invalidateResults());
    socket.on('session.expired', () => {
      queryClient.setQueryData(['auth', 'me'], null);
    });
    return () => {
      socket.removeAllListeners();
      socket.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
