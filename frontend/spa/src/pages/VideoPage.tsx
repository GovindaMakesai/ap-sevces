import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/api/client';
import { mediaUrl } from '@/api/types';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';
import { useSpaNavigate } from '@/nav/useSpaNavigate';

type Post = {
  id?: string;
  body?: string;
  media_url?: string;
  mediaUrl?: string;
  thumb_url?: string;
  thumbUrl?: string;
  media_type?: string;
  mediaType?: string;
  like_count?: number;
  author?: { first_name?: string; last_name?: string };
  user_id?: string;
};

type PostsResponse = { success?: boolean; data?: Post[] };

/**
 * Video tab — keep-alive reels player (MPA) for full playback.
 * Optional grid preview uses /social/posts; tap opens fullscreen legacy reel.
 */
export function VideoPage() {
  const { pathname, search } = useLocation();
  const active = pathname === '/video' || pathname.startsWith('/video/');
  const go = useSpaNavigate();
  const [mode, setMode] = useState<'reels' | 'grid'>('reels');

  const immersive = useMemo(() => {
    const p = new URLSearchParams(search);
    return Boolean(p.get('fullscreen') || p.get('post') || p.get('topic'));
  }, [search]);

  const legacySrc = useMemo(() => {
    const p = new URLSearchParams(search);
    p.set('app', '1');
    if (immersive && !p.get('fullscreen')) p.set('fullscreen', '1');
    return `/video.html?${p.toString()}`;
  }, [search, immersive]);

  const postsQ = useQuery({
    queryKey: ['social-posts'],
    queryFn: () => apiFetch<PostsResponse>('/social/posts'),
    enabled: active && mode === 'grid',
    staleTime: 60_000,
  });

  const posts = (postsQ.data?.data || []).filter((p) => {
    const media = p.media_url || p.mediaUrl || '';
    const type = String(p.media_type || p.mediaType || '').toLowerCase();
    return type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(media);
  });

  return (
    <div className={`ap-page ap-page-video ap-native-video${immersive ? ' is-immersive' : ''}`}>
      {!immersive ? (
        <header className="ap-video-head">
          <h1>Video</h1>
          <div className="ap-video-modes">
            <button
              type="button"
              className={mode === 'reels' ? 'is-active' : ''}
              onClick={() => setMode('reels')}
            >
              Reels
            </button>
            <button
              type="button"
              className={mode === 'grid' ? 'is-active' : ''}
              onClick={() => setMode('grid')}
            >
              Grid
            </button>
          </div>
        </header>
      ) : null}

      {mode === 'reels' || immersive ? (
        <div className="ap-video-frame">
          <LegacyKeepAliveFrame src={legacySrc} title="Video" active={active} />
        </div>
      ) : (
        <div className="ap-video-scroll">
          {postsQ.isLoading ? (
            <p className="ap-muted-center">Loading videos…</p>
          ) : posts.length === 0 ? (
            <div className="ap-muted-center">
              <p>No videos yet.</p>
              <button type="button" className="ap-btn" onClick={() => setMode('reels')}>
                Open Reels
              </button>
            </div>
          ) : (
            <div className="ap-video-grid">
              {posts.map((p) => {
                const name =
                  `${p.author?.first_name || ''} ${p.author?.last_name || ''}`.trim() || 'Creator';
                const thumb =
                  mediaUrl(p.thumb_url || p.thumbUrl || p.media_url || p.mediaUrl) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a22&color=fff`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="ap-video-tile"
                    onClick={() =>
                      go(
                        `/video.html?post=${encodeURIComponent(String(p.id))}&fullscreen=1&app=1`
                      )
                    }
                  >
                    <img src={thumb} alt="" />
                    <span>
                      <i className="fas fa-play" /> {p.like_count || 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
