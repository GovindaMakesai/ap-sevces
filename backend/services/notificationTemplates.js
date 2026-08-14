/**
 * Push notification copy + deep-link builders.
 * Deep links use aplive:// (also handled as apservices:// in the Expo shell).
 */

function deepLink(path) {
  const clean = String(path || '').replace(/^\//, '');
  return `aplive://${clean}`;
}

function liveDeepLink(roomId) {
  return deepLink(`live/${encodeURIComponent(String(roomId || ''))}`);
}

function partyDeepLink(roomId) {
  return deepLink(`party/${encodeURIComponent(String(roomId || ''))}`);
}

function profileDeepLink(userId) {
  return deepLink(`profile/${encodeURIComponent(String(userId || ''))}`);
}

function postDeepLink(postId) {
  return deepLink(`post/${encodeURIComponent(String(postId || ''))}`);
}

function agencyDeepLink() {
  return deepLink('agency');
}

function chatDeepLink(conversationId, messageId) {
  const conv = encodeURIComponent(String(conversationId || ''));
  const msg = messageId ? encodeURIComponent(String(messageId)) : '';
  if (msg) return deepLink(`chat/${conv}?message=${msg}`);
  return deepLink(`chat/${conv}`);
}

function transferDeepLink() {
  return deepLink('withdraw/transfer');
}

function walletDeepLink() {
  return deepLink('wallet');
}

function withdrawDeepLink() {
  return deepLink('withdraw');
}

function adminDeepLink(section) {
  const s = String(section || 'notifications').replace(/^\//, '');
  return deepLink(`admin/${encodeURIComponent(s)}`);
}

const TEMPLATES = {
  live_started(hostName, roomId) {
    const name = hostName || 'A creator';
    return {
      type: 'live_started',
      title: `🔴 ${name} is LIVE now!`,
      body: 'Join the stream and interact now.',
      data: {
        type: 'live_started',
        roomId: String(roomId || ''),
        deepLink: liveDeepLink(roomId),
      },
      preferenceKey: 'live_notifications',
    };
  },

  party_started(hostName, roomId) {
    const name = hostName || 'A creator';
    return {
      type: 'party_started',
      title: `🎤 ${name} started a Party Room.`,
      body: 'Join the conversation now.',
      data: {
        type: 'party_started',
        roomId: String(roomId || ''),
        deepLink: partyDeepLink(roomId),
      },
      preferenceKey: 'live_notifications',
    };
  },

  new_follower(followerName, followerId) {
    return {
      type: 'new_follower',
      title: 'You have a new follower.',
      body: followerName ? `${followerName} started following you.` : 'Someone started following you.',
      data: {
        type: 'new_follower',
        userId: String(followerId || ''),
        deepLink: profileDeepLink(followerId),
      },
      preferenceKey: 'follow_notifications',
    };
  },

  gift_received(senderName, giftId) {
    const who = senderName || 'Someone';
    return {
      type: 'gift_received',
      title: 'New gift',
      body: `You received a gift from ${who}.`,
      data: {
        type: 'gift_received',
        giftId: String(giftId || ''),
        deepLink: deepLink('wallet'),
      },
      preferenceKey: 'gift_notifications',
    };
  },

  mention(actorName, contextLabel, deep) {
    const who = actorName || 'Someone';
    return {
      type: 'mention',
      title: 'You were mentioned',
      body: `${who} mentioned you${contextLabel ? ` in ${contextLabel}` : ''}.`,
      data: {
        type: 'mention',
        deepLink: deep || deepLink('explore'),
      },
      preferenceKey: 'mention_notifications',
    };
  },

  comment(actorName, postId) {
    const who = actorName || 'Someone';
    return {
      type: 'comment',
      title: 'New comment',
      body: `${who} commented on your post.`,
      data: {
        type: 'comment',
        postId: String(postId || ''),
        deepLink: postDeepLink(postId),
      },
      preferenceKey: 'comment_notifications',
    };
  },

  host_approved(agencyName) {
    return {
      type: 'host_approved',
      title: 'Host approved',
      body: agencyName
        ? `Your Host application was approved by ${agencyName}.`
        : 'Your Host application was approved.',
      data: { type: 'host_approved', deepLink: deepLink('streamer') },
      preferenceKey: 'agency_notifications',
    };
  },

  host_rejected(agencyName) {
    return {
      type: 'host_rejected',
      title: 'Host rejected',
      body: agencyName
        ? `Your Host application was not approved by ${agencyName}.`
        : 'Your Host application was not approved.',
      data: { type: 'host_rejected', deepLink: agencyDeepLink() },
      preferenceKey: 'agency_notifications',
    };
  },

  new_host_joined(hostName) {
    const who = hostName || 'A host';
    return {
      type: 'new_host_joined',
      title: 'New host joined',
      body: `${who} joined your agency.`,
      data: { type: 'new_host_joined', deepLink: agencyDeepLink() },
      preferenceKey: 'agency_notifications',
    };
  },

  commission_received(amount, currencyLabel) {
    const amt = Number(amount) || 0;
    const label = currencyLabel || 'points';
    return {
      type: 'commission_received',
      title: 'Commission received',
      body: `You received ${amt.toLocaleString()} agency ${label}.`,
      data: { type: 'commission_received', deepLink: agencyDeepLink() },
      preferenceKey: 'agency_notifications',
    };
  },

  post_published(creatorName, postId) {
    const who = creatorName || 'A creator';
    return {
      type: 'post_published',
      title: 'New post',
      body: `${who} published a new post.`,
      data: {
        type: 'post_published',
        postId: String(postId || ''),
        deepLink: postDeepLink(postId),
      },
      preferenceKey: 'post_notifications',
    };
  },

  new_message(senderName, conversationId, preview, messageId) {
    const who = senderName || 'Someone';
    let body = String(preview || '').trim();
    if (!body) body = 'Sent you a message';
    if (body.startsWith('__IMG__:')) body = '📷 Sent a photo';
    if (body.startsWith('__VID__:')) body = '🎬 Sent a video';
    if (body.length > 100) body = `${body.slice(0, 97)}…`;
    return {
      type: 'new_message',
      title: who,
      body,
      data: {
        type: 'new_message',
        conversationId: String(conversationId || ''),
        messageId: String(messageId || ''),
        deepLink: chatDeepLink(conversationId, messageId),
      },
      preferenceKey: 'message_notifications',
    };
  },

  points_transfer_received(senderName, points, coinsCredited) {
    const who = senderName || 'Someone';
    const pts = Number(points) || 0;
    const coins = Number(coinsCredited) || 0;
    return {
      type: 'points_transfer_received',
      title: 'Points transfer received',
      body: `${who} sent ${pts.toLocaleString()} points — ${coins.toLocaleString()} seller coins added to your inventory.`,
      data: {
        type: 'points_transfer_received',
        deepLink: transferDeepLink(),
      },
      preferenceKey: 'wallet_notifications',
    };
  },

  points_transfer_sent(recipientName, points) {
    const who = recipientName || 'Coin Seller';
    const pts = Number(points) || 0;
    return {
      type: 'points_transfer_sent',
      title: 'Transfer completed',
      body: `${pts.toLocaleString()} points sent to ${who}.`,
      data: {
        type: 'points_transfer_sent',
        deepLink: transferDeepLink(),
      },
      preferenceKey: 'wallet_notifications',
    };
  },

  wallet_update(title, body, deep) {
    return {
      type: 'wallet_update',
      title: title || 'Wallet update',
      body: body || 'Your wallet was updated.',
      data: {
        type: 'wallet_update',
        deepLink: deep || walletDeepLink(),
      },
      preferenceKey: 'wallet_notifications',
    };
  },

  withdrawal_update(title, body) {
    return {
      type: 'withdrawal_update',
      title: title || 'Withdrawal update',
      body: body || 'Your withdrawal status changed.',
      data: {
        type: 'withdrawal_update',
        deepLink: withdrawDeepLink(),
      },
      preferenceKey: 'wallet_notifications',
    };
  },

  agency_application(title, body) {
    return {
      type: 'agency_application',
      title: title || 'New application',
      body: body || 'Open Agency Center to review.',
      data: {
        type: 'agency_application',
        deepLink: agencyDeepLink(),
      },
      preferenceKey: 'agency_notifications',
    };
  },

  admin_alert(title, body, section) {
    return {
      type: 'admin_alert',
      title: title || 'Admin alert',
      body: body || 'Open the admin dashboard.',
      data: {
        type: 'admin_alert',
        deepLink: adminDeepLink(section || 'notifications'),
      },
      /* Admins always get these when master push is on */
      preferenceKey: null,
    };
  },
};

module.exports = {
  TEMPLATES,
  deepLink,
  liveDeepLink,
  partyDeepLink,
  profileDeepLink,
  postDeepLink,
  agencyDeepLink,
  chatDeepLink,
  transferDeepLink,
  walletDeepLink,
  withdrawDeepLink,
  adminDeepLink,
};
