/**
 * AP animated stickers — hippo mascot pack for DM, party, and live chat.
 */
(function (g) {
  const PACK = [
    { id: 'hi', label: 'Hi' },
    { id: 'love', label: 'Love' },
    { id: 'laugh', label: 'LOL' },
    { id: 'wink', label: 'Wink' },
    { id: 'kiss', label: 'Kiss' },
    { id: 'cool', label: 'Cool' },
    { id: 'wow', label: 'Wow' },
    { id: 'sad', label: 'Sad' },
    { id: 'cry', label: 'Cry' },
    { id: 'angry', label: 'Angry' },
    { id: 'think', label: 'Hmm' },
    { id: 'sleepy', label: 'Sleepy' },
    { id: 'sick', label: 'Sick' },
    { id: 'party', label: 'Party' },
    { id: 'ok', label: 'OK' },
    { id: 'clap', label: 'Clap' },
    { id: 'foryou', label: 'For you' },
    { id: 'star', label: 'Star' },
    { id: 'fire', label: 'Fire' },
    { id: 'peace', label: 'Peace' },
  ];

  const OPEN_EYES =
    '<circle cx="76" cy="70" r="5" fill="#0f172a"/><circle cx="104" cy="70" r="5" fill="#0f172a"/>';
  const SMILE =
    '<path d="M78 92 Q90 102 102 92" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>';
  const FROWN =
    '<path d="M78 100 Q90 90 102 100" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>';
  const LEFT_ARM = '<ellipse cx="46" cy="92" rx="12" ry="8" fill="#7dd3fc"/>';

  function faceFor(kind) {
    const face = {
      extra: '',
      eyes: OPEN_EYES,
      mouth: SMILE,
      arm: LEFT_ARM,
      blush: '',
      shirt: '#e0f2fe',
    };
    if (kind === 'hi') {
      face.extra =
        '<g class="ap-sticker-bubble"><rect x="118" y="16" width="52" height="28" rx="12" fill="#fb7185"/><text x="144" y="36" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" font-family="Arial,sans-serif">Hi</text></g>';
      face.arm =
        '<g class="ap-sticker-wave"><ellipse cx="142" cy="78" rx="14" ry="9" fill="#7dd3fc"/><circle cx="154" cy="70" r="7" fill="#7dd3fc"/></g>';
    } else if (kind === 'love') {
      face.shirt = '#fda4af';
      face.extra = '<g class="ap-sticker-spark"><text x="146" y="36" font-size="22">❤️</text></g>';
      face.eyes =
        '<path d="M68 76 l8-8 8 8-8 7z" fill="#ef4444"/><path d="M96 76 l8-8 8 8-8 7z" fill="#ef4444"/>';
      face.mouth = '<ellipse cx="90" cy="94" rx="8" ry="5" fill="#fb7185"/>';
      face.blush =
        '<ellipse cx="64" cy="84" rx="7" ry="4" fill="#fb7185" opacity=".7"/><ellipse cx="116" cy="84" rx="7" ry="4" fill="#fb7185" opacity=".7"/>';
    } else if (kind === 'laugh') {
      face.eyes =
        '<path d="M68 68 Q76 76 84 68" fill="none" stroke="#0f172a" stroke-width="3"/><path d="M96 68 Q104 76 112 68" fill="none" stroke="#0f172a" stroke-width="3"/>';
      face.mouth =
        '<ellipse cx="90" cy="96" rx="14" ry="10" fill="#0f172a"/><ellipse cx="90" cy="100" rx="8" ry="5" fill="#fb7185"/>';
      face.extra = '<g class="ap-sticker-spark"><text x="18" y="44" font-size="16">😂</text></g>';
    } else if (kind === 'wink') {
      face.eyes =
        '<circle cx="76" cy="70" r="5" fill="#0f172a"/><path d="M96 70 Q104 76 112 70" fill="none" stroke="#0f172a" stroke-width="3"/>';
    } else if (kind === 'kiss') {
      face.shirt = '#fda4af';
      face.extra = '<g class="ap-sticker-spark"><text x="146" y="40" font-size="20">💋</text></g>';
      face.eyes =
        '<path d="M68 70 Q76 64 84 70" fill="none" stroke="#0f172a" stroke-width="3"/><path d="M96 70 Q104 64 112 70" fill="none" stroke="#0f172a" stroke-width="3"/>';
      face.mouth = '<ellipse cx="90" cy="94" rx="7" ry="5" fill="#e11d48"/>';
      face.blush =
        '<ellipse cx="64" cy="84" rx="7" ry="4" fill="#fb7185" opacity=".8"/><ellipse cx="116" cy="84" rx="7" ry="4" fill="#fb7185" opacity=".8"/>';
    } else if (kind === 'cool') {
      face.eyes =
        '<rect x="58" y="64" width="64" height="14" rx="5" fill="#0f172a"/><rect x="62" y="67" width="24" height="8" rx="3" fill="#38bdf8"/><rect x="94" y="67" width="24" height="8" rx="3" fill="#38bdf8"/>';
      face.mouth = '<path d="M80 96 H100" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>';
    } else if (kind === 'wow') {
      face.eyes =
        '<circle cx="76" cy="70" r="7" fill="#0f172a"/><circle cx="104" cy="70" r="7" fill="#0f172a"/><circle cx="78" cy="68" r="2" fill="#fff"/><circle cx="106" cy="68" r="2" fill="#fff"/>';
      face.mouth = '<ellipse cx="90" cy="98" rx="7" ry="10" fill="#0f172a"/>';
    } else if (kind === 'sad') {
      face.shirt = '#bfdbfe';
      face.mouth = FROWN;
    } else if (kind === 'cry') {
      face.shirt = '#bfdbfe';
      face.mouth = FROWN;
      face.extra =
        '<g class="ap-sticker-spark"><ellipse cx="72" cy="92" rx="3" ry="8" fill="#38bdf8"/><ellipse cx="108" cy="96" rx="3" ry="10" fill="#38bdf8"/></g>';
    } else if (kind === 'angry') {
      face.shirt = '#fecaca';
      face.eyes =
        '<path d="M64 62 L84 70" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/><path d="M116 62 L96 70" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/><circle cx="76" cy="74" r="5" fill="#0f172a"/><circle cx="104" cy="74" r="5" fill="#0f172a"/>';
      face.mouth = FROWN;
      face.extra = '<g class="ap-sticker-spark"><text x="148" y="40" font-size="18">💢</text></g>';
    } else if (kind === 'think') {
      face.mouth = '<path d="M82 96 Q90 98 98 94" fill="none" stroke="#0f172a" stroke-width="3"/>';
      face.extra = '<g class="ap-sticker-spark"><text x="142" y="38" font-size="18">💭</text></g>';
    } else if (kind === 'sleepy') {
      face.eyes =
        '<path d="M68 72 H84" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/><path d="M96 72 H112" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>';
      face.mouth = '<ellipse cx="90" cy="96" rx="6" ry="4" fill="#0f172a"/>';
      face.extra = '<g class="ap-sticker-spark"><text x="138" y="36" font-size="16">💤</text></g>';
    } else if (kind === 'sick') {
      face.mouth = FROWN;
      face.extra = '<g class="ap-sticker-spark"><text x="142" y="40" font-size="18">🤒</text></g>';
    } else if (kind === 'party') {
      face.shirt = '#fde68a';
      face.extra =
        '<polygon points="90,8 112,52 68,52" fill="#f59e0b"/><circle cx="90" cy="8" r="5" fill="#ef4444"/><g class="ap-sticker-spark"><text x="18" y="40" font-size="16">🎉</text></g>';
      face.eyes =
        '<path d="M68 68 Q76 76 84 68" fill="none" stroke="#0f172a" stroke-width="3"/><path d="M96 68 Q104 76 112 68" fill="none" stroke="#0f172a" stroke-width="3"/>';
      face.mouth = '<ellipse cx="90" cy="96" rx="12" ry="8" fill="#0f172a"/>';
    } else if (kind === 'ok') {
      face.extra = '<g class="ap-sticker-spark"><text x="142" y="42" font-size="20">👍</text></g>';
    } else if (kind === 'clap') {
      face.extra = '<g class="ap-sticker-spark"><text x="140" y="42" font-size="20">👏</text></g>';
    } else if (kind === 'foryou' || kind === 'star') {
      face.extra =
        '<g class="ap-sticker-spark"><text x="16" y="30" font-size="16">✨</text><text x="148" y="24" font-size="16">⭐</text></g>';
    } else if (kind === 'fire') {
      face.shirt = '#fde68a';
      face.extra = '<g class="ap-sticker-spark"><text x="142" y="40" font-size="20">🔥</text></g>';
    } else if (kind === 'peace') {
      face.extra = '<g class="ap-sticker-spark"><text x="142" y="40" font-size="20">✌️</text></g>';
    }
    return face;
  }

  function hippoSvg(kind) {
    const f = faceFor(kind);
    return `<svg class="ap-sticker-svg ap-sticker-${kind}" viewBox="0 0 180 180" width="120" height="120" aria-hidden="true">
      ${f.extra}
      <ellipse cx="90" cy="158" rx="48" ry="10" fill="rgba(0,0,0,.12)"/>
      <g class="ap-sticker-body">
        <ellipse cx="90" cy="108" rx="46" ry="40" fill="#38bdf8"/>
        <ellipse cx="90" cy="72" rx="40" ry="36" fill="#7dd3fc"/>
        <ellipse cx="62" cy="48" rx="12" ry="16" fill="#7dd3fc"/>
        <ellipse cx="118" cy="48" rx="12" ry="16" fill="#7dd3fc"/>
        ${f.eyes}
        ${f.blush}
        <ellipse cx="90" cy="84" rx="10" ry="6" fill="#fb7185"/>
        ${f.mouth}
        <rect x="62" y="100" width="56" height="36" rx="10" fill="${f.shirt}"/>
        <text x="90" y="124" text-anchor="middle" font-size="13" font-weight="800" fill="#0369a1" font-family="Arial,sans-serif">AP</text>
        ${f.arm}
      </g>
    </svg>`;
  }

  function render(id, size) {
    const kind = PACK.some((p) => p.id === id) ? id : 'hi';
    return `<span class="ap-sticker ap-sticker--${kind}" data-sticker="${kind}" style="${size ? `width:${size}px;height:${size}px` : ''}">${hippoSvg(kind)}</span>`;
  }

  function token(id) {
    return `[sticker:${id}]`;
  }

  function parse(text) {
    const m = String(text || '')
      .trim()
      .match(/^\[sticker:([a-z]+)\]$/i);
    return m ? String(m[1]).toLowerCase() : '';
  }

  function isStickerText(text) {
    return Boolean(parse(text));
  }

  function mountBar(host, onPick) {
    if (!host) return;
    host.classList.add('ap-sticker-bar');
    host.innerHTML =
      PACK.map(
        (p) =>
          `<button type="button" class="ap-sticker-chip" data-sticker="${p.id}" aria-label="${p.label}">${render(p.id, 36)}<span>${p.label}</span></button>`
      ).join('') +
      `<button type="button" class="ap-sticker-chip ap-sticker-chip--gift" data-sticker-gift="1" aria-label="Gift"><span class="ap-sticker-gift-ico">🎁</span> Gift</button>`;
    host.querySelectorAll('[data-sticker]').forEach((btn) => {
      btn.addEventListener('click', () => onPick && onPick(btn.getAttribute('data-sticker')));
    });
    host.querySelector('[data-sticker-gift]')?.addEventListener('click', () => {
      if (typeof onPick === 'function') onPick('gift');
    });
  }

  g.APStickers = {
    PACK,
    render,
    token,
    parse,
    isStickerText,
    mountBar,
  };
})(window);
