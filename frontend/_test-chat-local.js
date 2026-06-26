/**
 * Local chat API smoke test — run: node frontend/_test-chat-local.js
 */
const API = 'http://localhost:5000/api';

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  const token = data?.data?.accessToken || data?.token || data?.accessToken;
  if (!res.ok || !token) throw new Error(data?.message || `Login failed ${res.status}`);
  return token;
}

async function get(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function post(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('=== Chat API local test ===\n');
  const token = await login('customer1.test@apservices.com', 'password123');
  console.log('Login OK\n');

  const convs = await get('/messages/conversations', token);
  console.log('GET /messages/conversations', convs.status);
  const list = convs.data?.data?.conversations || [];
  console.log('  conversations:', list.length);
  if (list[0]) console.log('  first:', list[0].id, list[0].otherUser?.displayName);

  let convId = list[0]?.id;
  if (!convId) {
    const users = await get('/admin/users?limit=5', token).catch(() => null);
    console.log('No conversations — try creating one via send');
    const create = await post('/messages/conversations', token, {
      receiverId: 'customer2.test@apservices.com',
    });
    console.log('POST /conversations', create.status, create.data?.data?.conversationId || create.data?.message);
    convId = create.data?.data?.conversationId;
  }

  if (!convId) {
    console.log('\nNo conversation to test.');
    return;
  }

  const msgs = await get(`/messages/${convId}`, token);
  console.log('\nGET /messages/' + convId, msgs.status);
  const messages = msgs.data?.data?.messages || [];
  console.log('  messages count:', messages.length);
  if (messages[0]) {
    console.log('  sample:', {
      id: messages[0].id,
      text: messages[0].text,
      body: messages[0].body,
      senderId: messages[0].senderId,
    });
  } else {
    console.log('  (empty thread)');
  }

  const sent = await post('/messages/send', token, {
    receiverId: msgs.data?.data?.otherUser?.id || list[0]?.otherUser?.id,
    text: `Local test ping ${new Date().toISOString()}`,
  });
  console.log('\nPOST /messages/send', sent.status, sent.data?.message || 'OK');
  if (sent.data?.data?.message) {
    console.log('  sent message:', {
      id: sent.data.data.message.id,
      text: sent.data.data.message.text,
      body: sent.data.data.message.body,
    });
  }

  const msgs2 = await get(`/messages/${convId}`, token);
  const messages2 = msgs2.data?.data?.messages || [];
  console.log('\nAfter send, messages count:', messages2.length);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
