import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { mediaUrl } from '@/api/types';
import { useSpaNavigate } from '@/nav/useSpaNavigate';

type Tab = 'host' | 'rich' | 'gift' | 'video';
type Period = 'daily' | 'weekly' | 'monthly';

type LeaderRow = {
  entity_id?: string;
  entity_label?: string;
  score?: number;
  profile_pic?: string | null;
  rank?: number;
};

type LeaderResponse = { success?: boolean; data?: LeaderRow[] };

const TAB_CATEGORY: Record<Tab, string> = {
  host: 'creators',
  rich: 'gifters',
  gift: 'gifters',
  video: 'video',
};

const TAB_MODE: Partial<Record<Tab, string>> = {
  gift: 'count',
};

const TAB_LABEL: Record<Tab, string> = {
  host: 'Host',
  rich: 'Rich',
  gift: 'Gift',
  video: 'Video',
};

function formatScore(score: number, tab: Tab): string {
  const n = Number(score || 0);
  const suffix = tab === 'gift' ? ' gifts' : '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M${suffix}`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K${suffix}`;
  return `${Math.round(n)}${suffix}`;
}

/**
 * Native Rankings — leaderboard API; profile taps use legacy creator profile.
 */
export function RankingsPage() {
  const [tab, setTab] = useState<Tab>('host');
  const [period, setPeriod] = useState<Period>('daily');
  const go = useSpaNavigate();

  const ranksQ = useQuery({
    queryKey: ['leaderboards', tab, period],
    queryFn: async () => {
      const qs = new URLSearchParams({
        period,
        category: TAB_CATEGORY[tab],
      });
      const mode = TAB_MODE[tab];
      if (mode) qs.set('mode', mode);
      const res = await apiFetch<LeaderResponse>(`/v1/leaderboards?${qs}`, {
        skipAuth: true,
      });
      return Array.isArray(res?.data) ? res.data : [];
    },
    staleTime: 60_000,
  });

  const rows = ranksQ.data || [];

  return (
    <div className="ap-page ap-page-rankings ap-native-ranks">
      <header className="ap-ranks-head">
        <h1>Rankings</h1>
        <nav className="ap-ranks-tabs" aria-label="Category">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'is-active' : ''}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>
        <div className="ap-ranks-periods" role="tablist">
          {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              className={period === p ? 'is-active' : ''}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <div className="ap-ranks-scroll">
        {ranksQ.isLoading ? (
          <p className="ap-muted-center">Loading rankings…</p>
        ) : ranksQ.isError ? (
          <div className="ap-muted-center">
            <p>Couldn’t load rankings.</p>
            <button type="button" className="ap-btn" onClick={() => ranksQ.refetch()}>
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="ap-muted-center">No rankings for this period yet.</p>
        ) : (
          <ol className="ap-ranks-list">
            {rows.map((row, i) => {
              const name = row.entity_label || String(row.entity_id || '').slice(0, 8) || 'User';
              const pic =
                mediaUrl(row.profile_pic) ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=c9a227&color=fff`;
              const rank = row.rank || i + 1;
              const id = row.entity_id;
              return (
                <li key={`${id || name}-${rank}`}>
                  <button
                    type="button"
                    className={`ap-rank-row${rank <= 3 ? ` is-top-${rank}` : ''}`}
                    onClick={() => {
                      if (!id) return;
                      go(
                        `/creator-profile.html?userId=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&app=1`
                      );
                    }}
                  >
                    <span className="ap-rank-n">{rank}</span>
                    <img src={pic} alt="" className="ap-rank-av" />
                    <span className="ap-rank-meta">
                      <strong>{name}</strong>
                      <span>{formatScore(Number(row.score) || 0, tab)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
