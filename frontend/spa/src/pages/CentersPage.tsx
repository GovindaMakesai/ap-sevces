import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useAuthStore, type ApUser } from '@/stores/authStore';

type CenterLink = {
  id: string;
  label: string;
  icon: string;
  href: string;
  desc: string;
  show?: (u: ApUser | null) => boolean;
};

function roleOf(u: ApUser | null): string {
  return String(u?.role || '').toLowerCase();
}

function isStaff(u: ApUser | null): boolean {
  const r = roleOf(u);
  return Boolean(u?.is_admin) || ['admin', 'super_admin', 'founder', 'ceo'].includes(r);
}

const CENTERS: CenterLink[] = [
  {
    id: 'streamer',
    label: 'Host / Streamer Center',
    icon: 'fa-video',
    href: '/streamer-center.html?app=1',
    desc: 'Go Live, party rooms, host tools',
  },
  {
    id: 'host-agency',
    label: 'My Agency',
    icon: 'fa-handshake',
    href: '/host-agency.html?app=1',
    desc: 'Agency membership & change requests',
    show: (u) => {
      const r = roleOf(u);
      return r.includes('creator') || r.includes('host') || r.includes('streamer') || isStaff(u);
    },
  },
  {
    id: 'agency',
    label: 'Agency Center',
    icon: 'fa-building',
    href: '/agency-center.html?app=1',
    desc: 'Hosts, applications, agency dashboard',
    show: (u) => roleOf(u).includes('agency') || isStaff(u),
  },
  {
    id: 'bd',
    label: 'BD Center',
    icon: 'fa-network-wired',
    href: '/bd-center.html?app=1',
    desc: 'Business development tools',
    show: (u) => roleOf(u) === 'bdm' || isStaff(u),
  },
  {
    id: 'hierarchy',
    label: 'Hierarchy',
    icon: 'fa-sitemap',
    href: '/hierarchy.html?app=1',
    desc: 'Org tree & reporting lines',
    show: (u) => roleOf(u) === 'bdm' || isStaff(u),
  },
  {
    id: 'seller',
    label: 'Coin Seller Center',
    icon: 'fa-coins',
    href: '/coin-seller-center.html?app=1',
    desc: 'Inventory & seller tools',
    show: (u) => roleOf(u).includes('coin_seller') || roleOf(u).includes('seller') || isStaff(u),
  },
  {
    id: 'verify',
    label: 'Live verification',
    icon: 'fa-id-card',
    href: '/live-verify.html?app=1',
    desc: 'Selfie & identity checks for video live',
  },
  {
    id: 'apply',
    label: 'Apply for a role',
    icon: 'fa-user-plus',
    href: '/role-apply.html?app=1',
    desc: 'Host, agency, or coin seller applications',
  },
];

/**
 * Native Centers hub — role-gated links into legacy agency/host dashboards.
 */
export function CentersPage() {
  const go = useSpaNavigate();
  const user = useAuthStore((s) => s.user);

  const links = CENTERS.filter((c) => !c.show || c.show(user));

  return (
    <div className="ap-page ap-page-centers ap-native-hub">
      <header className="ap-hub-head">
        <button type="button" className="ap-icon-btn" onClick={() => go('/profile')} aria-label="Back">
          <i className="fas fa-arrow-left" />
        </button>
        <h1>Centers</h1>
      </header>

      <div className="ap-hub-scroll">
        <p className="ap-hub-lead">Host, agency, and seller tools open in the secure legacy workspace.</p>
        {links.map((c) => (
          <button key={c.id} type="button" className="ap-center-card" onClick={() => go(c.href)}>
            <i className={`fas ${c.icon}`} aria-hidden />
            <span>
              <strong>{c.label}</strong>
              <em>{c.desc}</em>
            </span>
            <i className="fas fa-chevron-right ap-chevron" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
