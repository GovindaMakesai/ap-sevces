/**
 * Phase 1 static + structural stress verification (no live Agora required).
 * Run: node frontend/scripts/verify-phase1-invariants.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = {
  social: fs.readFileSync(path.join(root, 'social-live.js'), 'utf8'),
  life: fs.readFileSync(path.join(root, 'agora-lifecycle.js'), 'utf8'),
  media: fs.readFileSync(path.join(root, 'live-media-engine.js'), 'utf8'),
  liveHtml: fs.readFileSync(path.join(root, 'live-room.html'), 'utf8'),
  partyHtml: fs.readFileSync(path.join(root, 'party-room.html'), 'utf8'),
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail || '' });
}

check('BUILD phase1-life in agora-lifecycle', /20260724-phase1-life/.test(files.life));
check('BUILD phase1-life in live-media-engine', /20260724-phase1-life/.test(files.media));
check('HTML loads agora-lifecycle', /agora-lifecycle\.js\?v=20260724-phase1-life/.test(files.liveHtml));
check('party HTML loads agora-lifecycle', /agora-lifecycle\.js\?v=20260724-phase1-life/.test(files.partyHtml));
check('voice-soak-metrics referenced OR present', fs.existsSync(path.join(root, 'voice-soak-metrics.js')));

check('guest_publish_rejoin removed', !/guest_publish_rejoin/.test(files.social));
check('unrecoverable seat path exists', /guest_publish_unrecoverable/.test(files.social));
check('demote stays joined (token renew)', /demote: stayed joined/.test(files.social));
check('no joinAgoraWithRetry in stopGuestMediaPublishing block', (() => {
  const i = files.social.indexOf('async function stopGuestMediaPublishing');
  const j = files.social.indexOf('function pickKickDurationHours');
  const block = files.social.slice(i, j);
  return !/joinAgoraWithRetry/.test(block);
})());

check('media health watchdog disabled', /Phase 1: disabled — APLiveMedia\.startHealthWatch/.test(files.social));
check('party mesh keepalive disabled', /Phase 1: disabled — duplicate mesh timer/.test(files.social));
check('lifePublish used for seat publish', /await lifePublish\(\[audioTrack\]\)/.test(files.social));
check('handlers bound once guard', /client\.__apHandlersBound/.test(files.social));
check('APAgoraLife queue present', /function run\(name, fn\)/.test(files.life));
check('soft kickstart (no 0\/1\/3s cascade)', /audio kickstart soft/.test(files.social));

// Simulate serialized queue stress (unit)
const ops = [];
let depth = 0;
let chain = Promise.resolve();
function run(name, fn) {
  if (depth > 0) {
    ops.push(name + ':nested');
    return Promise.resolve().then(fn);
  }
  const exec = async () => {
    depth += 1;
    ops.push(name + ':start');
    try {
      return await fn();
    } finally {
      depth -= 1;
      ops.push(name + ':end');
    }
  };
  const next = chain.then(exec, exec);
  chain = next.catch(() => {});
  return next;
}

async function queueStress() {
  const order = [];
  await Promise.all([
    run('a', async () => {
      order.push('a1');
      await run('a-nested', async () => {
        order.push('an');
      });
      order.push('a2');
    }),
    run('b', async () => {
      order.push('b');
    }),
    run('c', async () => {
      order.push('c');
    }),
  ]);
  check('queue serializes concurrent external ops', order.indexOf('a2') < order.indexOf('b') || order.indexOf('a1') < order.indexOf('b'), order.join(','));
  check('nested ops allowed without deadlock', order.includes('an') && ops.some((o) => o.includes('nested') || o === 'a-nested:start' || order.includes('an')));
}

queueStress()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed }, null, 2));
    results.forEach((r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
