export function servicePrice(item) {
  const n = Number(item?.base_price ?? item?.price ?? item?.amount ?? item?.hourly_rate ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatInr(n) {
  const v = Math.round(Number(n || 0));
  return `₹${v.toLocaleString('en-IN')}`;
}

export function priceLabel(item) {
  const n = servicePrice(item);
  if (!n) return 'Ask for quote';
  const kind = String(item?.price_type || item?.priceType || 'hourly').toLowerCase();
  return kind === 'fixed' ? `From ${formatInr(n)}` : `From ${formatInr(n)}/hr`;
}

export function providerName(p) {
  return (
    p?.display_name ||
    p?.name ||
    [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
    'Professional'
  );
}

export function providerRate(p, service) {
  const n = Number(p?.custom_rate || p?.hourly_rate || servicePrice(service));
  return Number.isFinite(n) ? n : 0;
}

export function estimateQuote(service, provider, durationHours) {
  const hours = Math.max(0.5, Math.min(12, Number(durationHours || 1)));
  const rate = providerRate(provider, service);
  const subtotal = rate * hours;
  const platformFee = Math.round(subtotal * 0.1);
  const total = subtotal + platformFee;
  return { rate, hours, subtotal, platformFee, total };
}

export function bookingStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'payment_review') return 'Payment under review';
  if (s === 'pending') return 'Waiting for professional';
  if (s === 'accepted') return 'Confirmed';
  if (s === 'in_progress') return 'In progress';
  if (s === 'completed') return 'Completed';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'rejected') return 'Declined';
  return status ? String(status).replace(/_/g, ' ') : 'Unknown';
}

export function paymentStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'under_review') return 'Payment under review';
  if (s === 'pending') return 'Payment pending';
  if (s === 'paid' || s === 'confirmed' || s === 'approved') return 'Payment confirmed';
  if (s === 'failed' || s === 'rejected') return 'Payment failed';
  return status ? String(status).replace(/_/g, ' ') : 'Payment pending';
}

export function bookingBucket(b) {
  const s = String(b?.status || '').toLowerCase();
  if (s === 'cancelled' || s === 'rejected') return 'cancelled';
  if (s === 'completed') return 'completed';
  if (s === 'accepted' || s === 'in_progress') return 'active';
  return 'upcoming';
}

export function formatBookingWhen(b) {
  const date = b?.booking_date ? String(b.booking_date).slice(0, 10) : '';
  const time = String(b?.start_time || '').slice(0, 5);
  if (!date) return time || 'Schedule TBD';
  try {
    const d = new Date(`${date}T00:00:00`);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    return time ? `${label} · ${time}` : label;
  } catch (_e) {
    return `${date} ${time}`.trim();
  }
}

export function categoryKey(cat) {
  return String(cat || '').toLowerCase().replace(/\s+/g, '-');
}

export const CAT_VISUAL = {
  plumbing: { icon: 'water-outline', colors: ['#0EA5E9', '#0369A1'], emoji: '🔧' },
  electrical: { icon: 'flash-outline', colors: ['#F59E0B', '#B45309'], emoji: '⚡' },
  cleaning: { icon: 'sparkles-outline', colors: ['#14B8A6', '#0F766E'], emoji: '✨' },
  beauty: { icon: 'flower-outline', colors: ['#EC4899', '#9D174D'], emoji: '💅' },
  beautician: { icon: 'flower-outline', colors: ['#EC4899', '#9D174D'], emoji: '💅' },
  barber: { icon: 'cut-outline', colors: ['#A78BFA', '#6D28D9'], emoji: '✂' },
  painting: { icon: 'color-palette-outline', colors: ['#F97316', '#C2410C'], emoji: '🎨' },
  'ac-repair': { icon: 'snow-outline', colors: ['#38BDF8', '#0369A1'], emoji: '❄' },
  ac: { icon: 'snow-outline', colors: ['#38BDF8', '#0369A1'], emoji: '❄' },
  carpentry: { icon: 'hammer-outline', colors: ['#D97706', '#78350F'], emoji: '🪵' },
  appliance: { icon: 'hardware-chip-outline', colors: ['#64748B', '#334155'], emoji: '🔌' },
  appliances: { icon: 'hardware-chip-outline', colors: ['#64748B', '#334155'], emoji: '🔌' },
  repair: { icon: 'construct-outline', colors: ['#78716C', '#44403C'], emoji: '🛠' },
  moving: { icon: 'cube-outline', colors: ['#8B5CF6', '#5B21B6'], emoji: '📦' },
  gardening: { icon: 'leaf-outline', colors: ['#22C55E', '#15803D'], emoji: '🌿' },
};

export function categoryVisual(cat) {
  const key = categoryKey(cat);
  return CAT_VISUAL[key] || CAT_VISUAL.repair;
}

export const DURATIONS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
export const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export function upcomingDates(n = 14) {
  const out = [];
  const start = new Date();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      iso,
      day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      date: d.getDate(),
      month: d.toLocaleDateString('en-IN', { month: 'short' }),
    });
  }
  return out;
}
