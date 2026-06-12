# UI Redesign Plan — Premium Live Experience

**Date:** 2026-06-12

---

## Design Principles

1. **Dark stage, bright accents** — Video-first; UI floats on translucent glass
2. **One hero action per zone** — Gift bar dominant; secondary tools recessed
3. **Motion = feedback** — Every tap responds within 100ms
4. **Density without clutter** — Collapse stats into swipeable chips
5. **Gold = money, Pink = social, Cyan = live** — Consistent semantic colors

---

## Design Tokens (implemented in `social-fx.css`)

```css
--ap-live-gold: #fbbf24;
--ap-live-pink: #f472b6;
--ap-live-cyan: #22d3ee;
--ap-live-purple: #a855f7;
--ap-live-glass: rgba(12, 8, 28, 0.72);
--ap-live-blur: blur(16px);
--ap-radius-lg: 16px;
--ap-shadow-glow: 0 0 24px rgba(251, 191, 36, 0.35);
--ap-font-display: 'Segoe UI', system-ui, sans-serif;
```

---

## Screen Redesigns

### Live Room

| Zone | Before | After |
|------|--------|-------|
| Header | Cramped host + stats | Glass card host pill + animated LIVE dot |
| Stats bar | Fake hour/pop/music | Collapsible chips; real viewer count pulse |
| Widgets | Random team/chest | Chest with reward FX; team tied to gifts |
| Video | Black until Agora | Skeleton shimmer → fade-in |
| Chat | Flat list | Messages slide-in; level badges colored |
| Bottom bar | Cluttered icons | Glass dock with press scale |
| Gift sheet | Flat grid | Tier borders (small/medium/premium glow) |
| Overlay | None | FX canvas layer for gifts/PK/confetti |

### Party Room

| Zone | Before | After |
|------|--------|-------|
| Seat grid | Static circles | Speaking rings + wave bars |
| Empty seats | Plain "+" | Pulse invite animation |
| Floor | Static gradient | Subtle parallax glow |

### Rankings

| Zone | Before | After |
|------|--------|-------|
| Top 3 | List rows | Podium with crowns |
| Rows | Flat | Staggered entrance |
| Follow | Text button | Heart burst on tap |

---

## Typography

| Use | Size | Weight |
|-----|------|--------|
| Host name | 13px | 700 |
| Chat user | 11px | 700 |
| Chat body | 12px | 400 |
| Stats | 10px | 600 |
| Gift price | 9px | 500 |

Letter-spacing: +0.02em on badges and LIVE labels.

---

## Spacing (8px grid)

- Header padding: 12px
- Chat message gap: 6px
- Bottom bar icon gap: 16px
- Gift grid gap: 8px
- Safe area: `env(safe-area-inset-*)`

---

## Animation Timing

| Type | Duration | Easing |
|------|----------|--------|
| Micro press | 120ms | ease-out |
| Sheet open | 320ms | cubic-bezier(0.32, 0.72, 0, 1) |
| Gift float | 1.8s | ease-in-out |
| Premium gift | 3.5s | ease-out |
| Combo pop | 400ms | spring |
| Join banner | 2.4s | ease-out |

---

## Rollout Order

1. ✅ FX overlay layer + tokens (`social-fx.css`)
2. ✅ Gift tier visuals + combo UI
3. ✅ Live room activity + likes
4. ✅ Party speaking indicators
5. ✅ PK visual overhaul
6. Rankings podium (partial)
7. Discovery card pulse (next sprint)
8. Full gift sheet redesign (next sprint)
