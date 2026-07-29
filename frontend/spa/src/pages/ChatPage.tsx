import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';
import { useUiStore } from '@/stores/uiStore';

type UnreadResponse = { success?: boolean; data?: { totalUnread?: number } };

export function ChatPage() {
  const { pathname } = useLocation();
  const active = pathname === '/chat' || pathname.startsWith('/chat/');
  const setChatUnread = useUiStore((s) => s.setChatUnread);

  const unreadQ = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => apiFetch<UnreadResponse>('/messages/unread-count'),
    enabled: active,
    staleTime: 60_000,
  });

  useEffect(() => {
    const n = Number(unreadQ.data?.data?.totalUnread);
    if (Number.isFinite(n)) setChatUnread(n);
  }, [unreadQ.data, setChatUnread]);

  return (
    <div className="ap-page ap-page-chat">
      <LegacyKeepAliveFrame src="/chat.html" title="Chat" active={active} />
    </div>
  );
}
