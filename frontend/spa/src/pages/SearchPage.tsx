import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { mediaUrl } from '@/api/types';
import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useAuthStore } from '@/stores/authStore';

type SearchUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  profile_pic?: string | null;
  display_id?: string | number;
  is_creator?: boolean;
};

type SearchRoom = {
  channel: string;
  room_type?: string;
  host_display_name?: string;
  viewer_count?: number;
  host_id?: string;
};

type SearchSeller = {
  user_id: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  inventory_coins?: number;
};

type SearchData = {
  users?: SearchUser[];
  live_rooms?: SearchRoom[];
  coin_sellers?: SearchSeller[];
  total?: number;
};

type SearchResponse = { success?: boolean; data?: SearchData };

function userName(u: SearchUser): string {
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User';
}

/**
 * Native global search — GET /search; results deep-link via SPA legacy bridge.
 */
export function SearchPage() {
  const go = useSpaNavigate();
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') || '';
  const [q, setQ] = useState(initial);
  const [debounced, setDebounced] = useState(initial.trim());
  const token = useAuthStore((s) => s.token);
  const hasToken = Boolean(token || localStorage.getItem('token'));

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set('q', debounced);
    setParams(next, { replace: true });
  }, [debounced, setParams]);

  const searchQ = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () =>
      apiFetch<SearchResponse>(
        `/search?q=${encodeURIComponent(debounced)}&type=all&limit=20`
      ),
    enabled: hasToken && debounced.length >= 2,
    staleTime: 30_000,
  });

  const data = searchQ.data?.data;
  const users = data?.users || [];
  const rooms = data?.live_rooms || [];
  const sellers = data?.coin_sellers || [];
  const empty =
    debounced.length >= 2 &&
    !searchQ.isLoading &&
    !users.length &&
    !rooms.length &&
    !sellers.length;

  const hint = useMemo(() => {
    if (!hasToken) return 'Sign in to search people and live rooms.';
    if (debounced.length < 2) return 'Type at least 2 characters.';
    if (searchQ.isLoading) return 'Searching…';
    if (searchQ.isError) return 'Search failed. Try again.';
    if (empty) return 'No results.';
    return '';
  }, [hasToken, debounced, searchQ.isLoading, searchQ.isError, empty]);

  return (
    <div className="ap-page ap-page-hub ap-page-search">
      <header className="ap-hub-head">
        <button type="button" className="ap-icon-btn" onClick={() => go('/explore')} aria-label="Back">
          <i className="fas fa-arrow-left" />
        </button>
        <div className="ap-search-field" style={{ flex: 1, marginBottom: 0 }}>
          <i className="fas fa-search" aria-hidden />
          <input
            type="search"
            placeholder="Nickname or ID number"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </header>

      <div className="ap-hub-scroll">
        {!hasToken ? (
          <div className="ap-muted-center">
            <p>{hint}</p>
            <button type="button" className="ap-btn" onClick={() => go('/app-auth.html?app=1')}>
              Sign in
            </button>
          </div>
        ) : hint && !users.length && !rooms.length && !sellers.length ? (
          <p className="ap-muted-center">{hint}</p>
        ) : (
          <>
            {rooms.length > 0 ? (
              <section className="ap-search-section">
                <h2>Live now</h2>
                {rooms.map((r) => {
                  const party =
                    String(r.room_type || '').toLowerCase() === 'party' ||
                    String(r.channel).startsWith('party-');
                  const name = r.host_display_name || 'Host';
                  const href = party
                    ? `/party-room.html?channel=${encodeURIComponent(r.channel)}&app=1`
                    : `/live-room.html?channel=${encodeURIComponent(r.channel)}&feed=1&hostName=${encodeURIComponent(name)}&app=1`;
                  return (
                    <button key={r.channel} type="button" className="ap-search-row" onClick={() => go(href)}>
                      <span className="ap-search-av">{party ? 'P' : 'L'}</span>
                      <span>
                        <strong>{name}</strong>
                        <span>{Number(r.viewer_count) || 0} watching</span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {users.length > 0 ? (
              <section className="ap-search-section">
                <h2>People</h2>
                {users.map((u) => {
                  const name = userName(u);
                  const pic =
                    mediaUrl(u.profile_pic) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f3e6c8&color=8a6914`;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className="ap-search-row"
                      onClick={() =>
                        go(
                          `/creator-profile.html?userId=${encodeURIComponent(u.id)}&id=${encodeURIComponent(u.id)}&name=${encodeURIComponent(name)}&app=1`
                        )
                      }
                    >
                      <img src={pic} alt="" />
                      <span>
                        <strong>{name}</strong>
                        <span>
                          {u.display_id != null ? `ID ${u.display_id}` : u.role || 'user'}
                          {u.is_creator ? ' · creator' : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {sellers.length > 0 ? (
              <section className="ap-search-section">
                <h2>Coin sellers</h2>
                {sellers.map((s) => {
                  const name =
                    s.display_name ||
                    `${s.first_name || ''} ${s.last_name || ''}`.trim() ||
                    'Seller';
                  return (
                    <button
                      key={s.user_id}
                      type="button"
                      className="ap-search-row"
                      onClick={() => go('/coin-seller-center.html?app=1')}
                    >
                      <span className="ap-search-av">$</span>
                      <span>
                        <strong>{name}</strong>
                        <span>{Number(s.inventory_coins) || 0} coins</span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
