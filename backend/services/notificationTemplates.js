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
};

module.exports = {
  TEMPLATES,
  deepLink,
  liveDeepLink,
  partyDeepLink,
  profileDeepLink,
  postDeepLink,
  agencyDeepLink,
};
