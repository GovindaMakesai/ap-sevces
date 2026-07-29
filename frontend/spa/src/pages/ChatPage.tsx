import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { mediaUrl } from '@/api/types';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';
import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';

type OtherUser = {
  id?: string;
  displayName?: string;
  first_name?: string;
  last_name?: string;
  profile_pic?: string | null;
  role?: string;
};

type Conversation = {
  id: string;
  unreadCount?: number;
  lastMessageText?: string;
  lastMessage?: string;
  body?: string;
  lastMessageAt?: string;
  isOfficial?: boolean;
  otherUser?: OtherUser;
};

type ConversationsResponse = {
  success?: boolean;
  data?: { conversations?: Conversation[]; totalUnread?: number };
  conversations?: Conversation[];
  totalUnread?: number;
};

type UnreadResponse = { success?: boolean; data?: { totalUnread?: number } };

function formatTime(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString();
}

function preview(text?: string): string {
  const s = String(text || '').trim();
  if (!s) return 'No messages yet';
  return s.length > 64 ? `${s.slice(0, 64)}…` : s;
}

function displayName(ou?: OtherUser): string {
  if (!ou) return 'User';
  return (
    ou.displayName ||
    `${ou.first_name || 'User'} ${ou.last_name || ''}`.trim() ||
    'User'
  );
}

/**
 * Native conversation list. Thread composer / sockets stay in legacy chat.html.
 */
export function ChatPage() {
  const { pathname, search } = useLocation();
  const active = pathname === '/chat' || pathname.startsWith('/chat/');
  const go = useSpaNavigate();
  const setChatUnread = useUiStore((s) => s.setChatUnread);
  const token = useAuthStore((s) => s.token);
  const hasToken = Boolean(token || localStorage.getItem('token'));

  const threadQs = useMemo(() => {
    const p = new URLSearchParams(search);
    return Boolean(p.get('conversation') || p.get('id') || p.get('worker'));
  }, [search]);

  const legacySrc = useMemo(() => {
    const p = new URLSearchParams(search);
    p.set('app', '1');
    return `/chat.html?${p.toString()}`;
  }, [search]);

  const unreadQ = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => apiFetch<UnreadResponse>('/messages/unread-count'),
    enabled: active && hasToken,
    staleTime: 60_000,
  });

  const listQ = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => apiFetch<ConversationsResponse>('/messages/conversations'),
    enabled: active && hasToken && !threadQs,
    staleTime: 30_000,
  });

  useEffect(() => {
    const fromUnread = Number(unreadQ.data?.data?.totalUnread);
    const fromList = Number(
      listQ.data?.data?.totalUnread ?? listQ.data?.totalUnread
    );
    const n = Number.isFinite(fromUnread)
      ? fromUnread
      : Number.isFinite(fromList)
        ? fromList
        : NaN;
    if (Number.isFinite(n)) setChatUnread(n);
  }, [unreadQ.data, listQ.data, setChatUnread]);

  if (!hasToken) {
    return (
      <div className="ap-page ap-page-chat ap-native-chat">
        <div className="ap-muted-center">
          <p>Sign in to view messages.</p>
          <button type="button" className="ap-btn" onClick={() => go('/app-auth.html?app=1')}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  /* Thread view — full MPA chat (sockets + composer) */
  if (threadQs) {
    return (
      <div className="ap-page ap-page-chat">
        <button
          type="button"
          className="ap-thread-back"
          onClick={() => go('/chat', { replace: true })}
        >
          <i className="fas fa-arrow-left" /> Chats
        </button>
        <div className="ap-thread-frame">
          <LegacyKeepAliveFrame
            src={legacySrc}
            title="Conversation"
            active={active}
            remountOnSrcChange
          />
        </div>
      </div>
    );
  }

  const raw =
    listQ.data?.data?.conversations || listQ.data?.conversations || [];
  const conversations = Array.isArray(raw) ? raw : [];

  return (
    <div className="ap-page ap-page-chat ap-native-chat">
      <header className="ap-chat-head">
        <h1>Messages</h1>
      </header>
      <div className="ap-chat-scroll">
        {listQ.isLoading ? (
          <p className="ap-muted-center">Loading chats…</p>
        ) : listQ.isError ? (
          <div className="ap-muted-center">
            <p>Couldn’t load conversations.</p>
            <button type="button" className="ap-btn" onClick={() => listQ.refetch()}>
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="ap-muted-center">
            <p>No conversations yet.</p>
            <button type="button" className="ap-btn" onClick={() => go('/explore')}>
              Discover Live
            </button>
          </div>
        ) : (
          <ul className="ap-chat-list">
            {conversations.map((c) => {
              const name = displayName(c.otherUser);
              const pic =
                mediaUrl(c.otherUser?.profile_pic) ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a22&color=fff`;
              const unread = Number(c.unreadCount) || 0;
              const href = c.id
                ? `/chat.html?conversation=${encodeURIComponent(c.id)}&app=1`
                : c.otherUser?.id
                  ? `/chat.html?id=${encodeURIComponent(c.otherUser.id)}&app=1`
                  : null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="ap-chat-row"
                    onClick={() => href && go(href)}
                  >
                    <img src={pic} alt="" className="ap-chat-av" />
                    <span className="ap-chat-body">
                      <span className="ap-chat-top">
                        <strong>
                          {name}
                          {c.isOfficial ? (
                            <span className="ap-official"> Official</span>
                          ) : null}
                        </strong>
                        <time>{formatTime(c.lastMessageAt)}</time>
                      </span>
                      <span className="ap-chat-preview">
                        {preview(c.lastMessageText || c.lastMessage || c.body)}
                      </span>
                    </span>
                    {unread > 0 ? (
                      <span className="ap-chat-unread">{unread > 9 ? '9+' : unread}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
