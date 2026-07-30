import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { MpaTabPage } from '@/components/MpaTabPage';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';

type UnreadResponse = { success?: boolean; data?: { totalUnread?: number } };

/**
 * Production chat.html (list + threads). Shell only syncs unread badge.
 */
export function ChatPage() {
  const { pathname } = useLocation();
  const active = pathname === '/chat' || pathname.startsWith('/chat/');
  const setChatUnread = useUiStore((s) => s.setChatUnread);
  const token = useAuthStore((s) => s.token);
  const hasToken = Boolean(token || localStorage.getItem('token'));

  const unreadQ = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => apiFetch<UnreadResponse>('/messages/unread-count'),
    enabled: active && hasToken,
    staleTime: 60_000,
  });

  useEffect(() => {
    const n = Number(unreadQ.data?.data?.totalUnread);
    if (Number.isFinite(n)) setChatUnread(n);
  }, [unreadQ.data, setChatUnread]);

  return (
    <MpaTabPage htmlPath="/chat.html" routePrefix="/chat" title="Chat" remountOnSearch />
  );
}
