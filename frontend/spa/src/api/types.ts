/** Shared live-room / wallet types for native SPA screens */

export type LiveRoom = {
  channel: string;
  type?: string;
  hostId?: string;
  hostName?: string;
  hostDisplayId?: string | number;
  hostProfilePic?: string | null;
  hostStreamCover?: string | null;
  hostUpdatedAt?: string;
  viewers?: number;
  viewer_count?: number;
  updatedAt?: string;
  startedAt?: string;
  /* snake_case fallbacks */
  host_display_name?: string;
  host_profile_pic?: string | null;
  stream_cover_url?: string | null;
  host_user_id?: string;
  started_at?: string;
  updated_at?: string;
};

export type RoomsResponse = {
  success?: boolean;
  data?: LiveRoom[] | { data?: LiveRoom[] };
  rooms?: LiveRoom[];
};

export type WalletBalance = {
  coin_balance?: number;
  star_balance?: number;
  gift_inventory_coins?: number;
  sell_inventory_coins?: number;
  inventory_coins?: number;
  giftable_coins?: number;
  sellable_coins?: number;
  is_coin_seller?: boolean;
};

export type WalletResponse = {
  success?: boolean;
  data?: WalletBalance;
};

export type SocialStats = {
  followers?: number;
  following?: number;
};

export type SocialStatsResponse = {
  success?: boolean;
  data?: SocialStats;
};

export function parseRooms(res: RoomsResponse | LiveRoom[] | null | undefined): LiveRoom[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && typeof res.data === 'object' && Array.isArray((res.data as { data?: LiveRoom[] }).data)) {
    return (res.data as { data: LiveRoom[] }).data;
  }
  if (Array.isArray(res.rooms)) return res.rooms;
  return [];
}

export function roomHostName(r: LiveRoom): string {
  return r.hostName || r.host_display_name || 'Host';
}

export function roomViewers(r: LiveRoom): number {
  return Math.max(0, Number(r.viewers ?? r.viewer_count ?? 0) || 0);
}

export function isPartyRoom(r: LiveRoom): boolean {
  const t = String(r.type || '').toLowerCase();
  return t === 'party' || String(r.channel || '').startsWith('party-');
}

export function mediaUrl(path: string | null | undefined, cacheKey?: string | number | null): string | null {
  if (!path) return null;
  let p = String(path).trim();
  if (!p) return null;
  if (p.startsWith('data:') || p.startsWith('blob:')) return p;
  if (p.startsWith('//')) p = `https:${p}`;
  if (p.startsWith('http://') || p.startsWith('https://')) {
    if (!cacheKey) return p;
    return p + (p.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(cacheKey));
  }
  const base = (import.meta.env.VITE_MEDIA_BASE as string | undefined)?.replace(/\/$/, '') || 'https://api.apservices.in';
  let url = `${base}${p.startsWith('/') ? '' : '/'}${p}`;
  if (cacheKey) url += (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(cacheKey));
  return url;
}

export function formatViewers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function hostInitials(name: string): string {
  return (
    String(name || 'H')
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'H'
  );
}

export function liveRoomHref(r: LiveRoom): string {
  const party = isPartyRoom(r);
  const channel = String(r.channel || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  const name = roomHostName(r);
  const pic = r.hostProfilePic || r.host_profile_pic || '';
  const qs = new URLSearchParams();
  qs.set('channel', channel);
  qs.set('app', '1');
  if (!party) qs.set('feed', '1');
  if (name) qs.set('hostName', name);
  if (pic) qs.set('profilePic', String(pic));
  const page = party ? 'party-room.html' : 'live-room.html';
  return `/${page}?${qs.toString()}`;
}
