export function indianGroup(n) {
  const num = Math.round(Number(n) || 0);
  const sign = num < 0 ? '-' : '';
  const s = String(Math.abs(num));
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return `${sign}${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

export function compactM(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) {
    const m = v / 1e6;
    const str = m >= 100 ? m.toFixed(1) : m.toFixed(1);
    return `${str.replace(/\.0$/, '')}M`;
  }
  if (abs >= 1000) return indianGroup(v);
  return String(Math.round(v));
}

export function rupees(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dollars(n) {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return `$${v}`;
  return `$${v.toFixed(2)}`;
}
