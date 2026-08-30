#!/usr/bin/env node
/**
 * Production smoke checks — run on VPS from repo root:
 *   node backend/scripts/smoke-prod-check.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const { fork } = require('child_process');
const path = require('path');

const API_BASE = process.env.SMOKE_API_BASE || 'http://127.0.0.1:5000';
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function getJson(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const req = http.get(
      url,
      { headers, timeout: 30000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body || '{}'), raw: body });
          } catch {
            resolve({ status: res.statusCode, json: null, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function checkRedisEnv() {
  const url = process.env.REDIS_URL;
  if (!url) {
    fail('REDIS_URL set', 'missing from backend/.env');
    return;
  }
  pass('REDIS_URL set', url.replace(/:[^@/]+@/, ':***@'));
  const redis = require('../lib/redis');
  const client = await redis.getClient();
  if (!client) {
    fail('Redis client', 'could not connect');
    return;
  }
  const pong = await client.ping();
  if (pong !== 'PONG') {
    fail('Redis ping', String(pong));
    return;
  }
  pass('Redis ping', 'PONG');
}

async function checkHealth() {
  const { status, json } = await getJson('/api/health');
  if (status !== 200 || !json?.success) {
    fail('API health', `status=${status}`);
    return;
  }
  if (!json.checks?.redis?.ok) {
    fail('API health redis', JSON.stringify(json.checks?.redis));
    return;
  }
  pass('API health', `redis mode=${json.checks.redis.mode}`);
}

async function checkPaginationCap() {
  const endpoints = [
  '/api/social/posts?limit=99999',
  '/api/social/discover/creators?limit=99999',
  '/api/live/rooms?limit=99999',
  ];
  for (const ep of endpoints) {
    const { status, json } = await getJson(ep);
    if (status >= 500) {
      fail(`Pagination cap ${ep}`, `HTTP ${status}`);
      continue;
    }
    const arr =
      json?.data?.posts ||
      json?.data?.rooms ||
      json?.data?.creators ||
      json?.data ||
      [];
    const count = Array.isArray(arr) ? arr.length : null;
    if (count != null && count > 100) {
      fail(`Pagination cap ${ep}`, `returned ${count} rows (expected <=100)`);
    } else {
      pass(`Pagination cap ${ep}`, count != null ? `returned ${count}` : `HTTP ${status}`);
    }
  }
}

async function checkHierarchyTree() {
  const db = require('../config/database');
  const hierarchyService = require('../services/hierarchyService');
  const started = Date.now();
  const tree = await hierarchyService.getHierarchyTree({ limitAgencies: 200 });
  const ms = Date.now() - started;
  const bdCount = Array.isArray(tree?.bds) ? tree.bds.length : Array.isArray(tree) ? tree.length : 0;
  if (ms > 30000) {
    fail('Hierarchy tree load', `${ms}ms (timeout risk)`);
    return;
  }
  pass('Hierarchy tree load', `${ms}ms, nodes=${bdCount}`);
  await db.pool.end().catch(() => {});
}

function runChild(script) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'smoke-match-queue-child.js'), [], {
      env: { ...process.env, SMOKE_CHILD_SCRIPT: script },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(out || `child exit ${code}`));
      else resolve(out.trim());
    });
  });
}

async function checkMatchQueueCrossProcess() {
  const matchQueueStore = require('../services/matchQueueStore');
  const testUsers = ['smoke-mq-a', 'smoke-mq-b'];
  for (const uid of testUsers) {
    await matchQueueStore.remove(uid).catch(() => {});
  }

  await runChild('enqueue-a');
  const popped = await runChild('pop-b');
  if (!popped.includes('smoke-mq-a')) {
    fail('Match queue cross-process', `expected smoke-mq-a, got: ${popped}`);
  } else {
    pass('Match queue cross-process', 'instance B popped user enqueued by instance A');
  }

  for (const uid of testUsers) {
    await matchQueueStore.remove(uid).catch(() => {});
  }
}

async function main() {
  console.log('=== AP Services production smoke ===');
  console.log(`API_BASE=${API_BASE}`);
  try {
    await checkRedisEnv();
    await checkHealth();
    await checkPaginationCap();
    await checkHierarchyTree();
    await checkMatchQueueCrossProcess();
  } catch (err) {
    fail('Unhandled error', err.message);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    process.exit(1);
  }
}

main();
