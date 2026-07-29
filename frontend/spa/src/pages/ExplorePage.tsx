import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import {
  formatViewers,
  hostInitials,
  isPartyRoom,
  liveRoomHref,
  mediaUrl,
  parseRooms,
  roomHostName,
  roomViewers,
  type LiveRoom,
  type RoomsResponse,
} from '@/api/types';
import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useState } from 'react';

type Tab = 'live' | 'party';

function coverFor(r: LiveRoom): string {
  const cover = r.hostStreamCover || r.stream_cover_url;
  const pic = r.hostProfilePic || r.host_profile_pic;
  const name = roomHostName(r);
  return (
    mediaUrl(cover || pic, r.hostUpdatedAt || r.updatedAt || r.updated_at) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a22&color=fff&size=400`
  );
}

/**
 * Native Explore — live/party grids via React Query.
 * Room taps go through SPA nav → /legacy/live-room.html (keeps Agora stack intact).
 */
export function ExplorePage() {
  const [tab, setTab] = useState<Tab>('live');
  const go = useSpaNavigate();

  const roomsQ = useQuery({
    queryKey: ['live-rooms', tab, 'trending'],
    queryFn: async () => {
      const type = tab === 'party' ? 'party' : 'live';
      const res = await apiFetch<RoomsResponse>(
        `/live/rooms?type=${type}&limit=24&sort=trending`,
        { skipAuth: true }
      );
      return parseRooms(res).filter((r) => (tab === 'party' ? isPartyRoom(r) : !isPartyRoom(r)));
    },
    staleTime: 30_000,
  });

  const rooms = roomsQ.data || [];

  return (
    <div className="ap-page ap-page-explore ap-native-explore">
      <header className="ap-explore-head">
        <h1 className="ap-explore-brand">AP Live</h1>
        <div className="ap-explore-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'live'}
            className={tab === 'live' ? 'is-active' : ''}
            onClick={() => setTab('live')}
          >
            Live
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'party'}
            className={tab === 'party' ? 'is-active' : ''}
            onClick={() => setTab('party')}
          >
            Party
          </button>
        </div>
      </header>

      <div className="ap-explore-scroll">
        {roomsQ.isLoading ? (
          <p className="ap-muted-center">Loading rooms…</p>
        ) : roomsQ.isError ? (
          <div className="ap-muted-center">
            <p>Couldn’t load rooms.</p>
            <button type="button" className="ap-btn" onClick={() => roomsQ.refetch()}>
              Retry
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="ap-muted-center">
            <p>No {tab === 'party' ? 'party' : 'live'} rooms right now.</p>
            <button type="button" className="ap-btn" onClick={() => go('/streamer-center.html?app=1')}>
              Go Live
            </button>
          </div>
        ) : (
          <div className="ap-room-grid">
            {rooms.map((r, i) => {
              const name = roomHostName(r);
              const viewers = roomViewers(r);
              const party = isPartyRoom(r);
              const img = coverFor(r);
              return (
                <button
                  key={r.channel}
                  type="button"
                  className={`ap-room-card${party ? ' is-party' : ' is-live'}`}
                  onClick={() => go(liveRoomHref(r))}
                >
                  <img
                    src={img}
                    alt={name}
                    loading={i < 4 ? 'eager' : 'lazy'}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a22&color=fff&size=400`;
                    }}
                  />
                  <span className="ap-room-badge">
                    <i className={`fas ${party ? 'fa-microphone-lines' : 'fa-video'}`} />{' '}
                    {party ? 'PARTY' : 'LIVE'}
                  </span>
                  <span className="ap-room-viewers">
                    <i className="fas fa-users" /> {formatViewers(viewers)}
                  </span>
                  <span className="ap-room-meta">
                    <span className="ap-room-av" aria-hidden>
                      {hostInitials(name)}
                    </span>
                    <span className="ap-room-name">{name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        className="ap-go-live-fab"
        aria-label={tab === 'party' ? 'Start party' : 'Go live'}
        onClick={() =>
          go(tab === 'party' ? '/streamer-center.html?app=1&mode=party' : '/streamer-center.html?app=1')
        }
      >
        <i className={`fas ${tab === 'party' ? 'fa-microphone-lines' : 'fa-video'}`} />
      </button>
    </div>
  );
}
