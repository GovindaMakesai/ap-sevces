const db = require('../config/database');
const walletService = require('./walletService');

const COSMETIC_CATEGORIES = [
  'ENTRY_FRAME',
  'CHAT_BUBBLE',
  'PROFILE_TAG',
  'ID_EFFECT',
  'MIC_EFFECT',
  'PROFILE_RING',
];

const DURATION_TYPES = ['1_DAY', '7_DAYS', '30_DAYS', '90_DAYS', 'PERMANENT'];

const CATEGORY_API_KEYS = {
  ENTRY_FRAME: 'entryFrame',
  CHAT_BUBBLE: 'chatBubble',
  PROFILE_TAG: 'profileTag',
  ID_EFFECT: 'idEffect',
  MIC_EFFECT: 'micEffect',
  PROFILE_RING: 'profileRing',
};

const ACTIVE_OWNERSHIP_SQL = `
  status = 'ACTIVE'
  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
`;

function isActiveOwnership(row) {
  if (!row) return false;
  if (row.status !== 'ACTIVE') return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

function mapProduct(row, variants = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    category: row.category,
    thumbnailUrl: row.thumbnail_url || null,
    animationUrl: row.animation_url || null,
    previewUrl: row.preview_url || null,
    assetType: row.asset_type || 'image',
    tagLabel: row.tag_label || null,
    cssClass: row.css_class || null,
    metadata: row.metadata || {},
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    variants: variants.map(mapVariant),
  };
}

function mapVariant(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    cosmeticId: String(row.cosmetic_id),
    durationType: row.duration_type,
    durationDays: row.duration_days != null ? Number(row.duration_days) : null,
    priceCoins: Number(row.price_coins),
    active: Boolean(row.active),
  };
}

function mapOwnership(row, product, variant) {
  if (!row) return null;
  const active = isActiveOwnership(row);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    cosmeticId: String(row.cosmetic_id),
    variantId: String(row.variant_id),
    purchasePrice: Number(row.purchase_price),
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at || null,
    isEquipped: Boolean(row.is_equipped) && active,
    status: active ? row.status : 'EXPIRED',
    isPermanent: !row.expires_at,
    isActive: active,
    cosmetic: product,
    variant: variant,
    expiresInLabel: formatExpiryLabel(row.expires_at),
  };
}

function mapEquippedItem(row) {
  if (!row || !isActiveOwnership(row)) return null;
  return {
    id: String(row.cosmetic_id),
    ownershipId: String(row.ownership_id),
    slug: row.slug,
    name: row.name,
    category: row.category,
    thumbnailUrl: row.thumbnail_url || null,
    animationUrl: row.animation_url || null,
    previewUrl: row.preview_url || null,
    assetType: row.asset_type || 'image',
    tagLabel: row.tag_label || null,
    cssClass: row.css_class || null,
    metadata: row.metadata || {},
    expiresAt: row.expires_at || null,
    durationType: row.duration_type,
    expiresInLabel: formatExpiryLabel(row.expires_at),
  };
}

function formatExpiryLabel(expiresAt) {
  if (!expiresAt) return 'Permanent';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'Expires in less than 1 hour';
  if (hours < 24) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Expires tomorrow';
  if (days < 30) return `Expires in ${days} day${days === 1 ? '' : 's'}`;
  return `Expires in ${days} days`;
}

function calculateExpiresAt(durationType, durationDays, fromDate = new Date()) {
  if (durationType === 'PERMANENT') return null;
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error('Invalid duration');
  const d = new Date(fromDate);
  d.setTime(d.getTime() + days * 86400000);
  return d;
}

function extendExpiresAt(currentExpiresAt, durationType, durationDays) {
  if (durationType === 'PERMANENT') return null;
  const base =
    currentExpiresAt && new Date(currentExpiresAt).getTime() > Date.now()
      ? new Date(currentExpiresAt)
      : new Date();
  return calculateExpiresAt(durationType, durationDays, base);
}

async function listVariantsForProducts(productIds, { activeOnly = true } = {}) {
  if (!productIds.length) return new Map();
  const res = await db.query(
    `SELECT * FROM cosmetic_product_variants
     WHERE cosmetic_id = ANY($1::uuid[])
     ${activeOnly ? 'AND active = TRUE' : ''}
     ORDER BY duration_days NULLS LAST, price_coins ASC`,
    [productIds]
  );
  const map = new Map();
  res.rows.forEach((row) => {
    const key = String(row.cosmetic_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

async function listProducts({ category = null, status = 'ACTIVE', includeVariants = true } = {}) {
  const clauses = [];
  const params = [];
  if (status !== null && status !== undefined && status !== '') {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const res = await db.query(
    `SELECT * FROM cosmetic_products ${where} ORDER BY sort_order ASC, name ASC`,
    params
  );
  if (!includeVariants) return res.rows.map((r) => mapProduct(r));
  const ids = res.rows.map((r) => r.id);
  const variantMap = await listVariantsForProducts(ids, { activeOnly: status === 'ACTIVE' });
  return res.rows.map((r) => mapProduct(r, variantMap.get(String(r.id)) || []));
}

async function getProductById(id, { includeInactiveVariants = false } = {}) {
  const res = await db.query(`SELECT * FROM cosmetic_products WHERE id = $1`, [id]);
  const row = res.rows[0];
  if (!row) return null;
  const variantMap = await listVariantsForProducts([row.id], {
    activeOnly: !includeInactiveVariants,
  });
  return mapProduct(row, variantMap.get(String(row.id)) || []);
}

async function getEquippedCosmetics(userId) {
  const res = await db.query(
    `SELECT o.id AS ownership_id, o.expires_at, o.is_equipped, o.status,
            p.id AS cosmetic_id, p.slug, p.name, p.category, p.thumbnail_url, p.animation_url,
            p.preview_url, p.asset_type, p.tag_label, p.css_class, p.metadata,
            v.duration_type
     FROM user_cosmetic_ownership o
     JOIN cosmetic_products p ON p.id = o.cosmetic_id
     JOIN cosmetic_product_variants v ON v.id = o.variant_id
     WHERE o.user_id = $1 AND o.is_equipped = TRUE AND ${ACTIVE_OWNERSHIP_SQL}`,
    [userId]
  );
  const out = {};
  res.rows.forEach((row) => {
    const key = CATEGORY_API_KEYS[row.category];
    if (key) out[key] = mapEquippedItem(row);
  });
  return out;
}

async function getEquippedCosmeticsForUsers(userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};
  const res = await db.query(
    `SELECT o.user_id, o.id AS ownership_id, o.expires_at, o.is_equipped, o.status,
            p.id AS cosmetic_id, p.slug, p.name, p.category, p.thumbnail_url, p.animation_url,
            p.preview_url, p.asset_type, p.tag_label, p.css_class, p.metadata,
            v.duration_type
     FROM user_cosmetic_ownership o
     JOIN cosmetic_products p ON p.id = o.cosmetic_id
     JOIN cosmetic_product_variants v ON v.id = o.variant_id
     WHERE o.user_id = ANY($1::uuid[]) AND o.is_equipped = TRUE AND ${ACTIVE_OWNERSHIP_SQL}`,
    [ids]
  );
  const map = {};
  res.rows.forEach((row) => {
    const uid = String(row.user_id);
    if (!map[uid]) map[uid] = {};
    const key = CATEGORY_API_KEYS[row.category];
    if (key) map[uid][key] = mapEquippedItem(row);
  });
  return map;
}

async function listUserInventory(userId, { category = null } = {}) {
  const params = [userId];
  let categorySql = '';
  if (category) {
    params.push(category);
    categorySql = `AND p.category = $${params.length}`;
  }
  const res = await db.query(
    `SELECT o.*, p.slug, p.name, p.description, p.category, p.thumbnail_url, p.animation_url,
            p.preview_url, p.asset_type, p.tag_label, p.css_class, p.metadata, p.status AS product_status,
            v.duration_type, v.duration_days, v.price_coins AS variant_price
     FROM user_cosmetic_ownership o
     JOIN cosmetic_products p ON p.id = o.cosmetic_id
     JOIN cosmetic_product_variants v ON v.id = o.variant_id
     WHERE o.user_id = $1 ${categorySql}
     ORDER BY o.purchased_at DESC`,
    [params]
  );
  return res.rows.map((row) => {
    const product = mapProduct({
      id: row.cosmetic_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      thumbnail_url: row.thumbnail_url,
      animation_url: row.animation_url,
      preview_url: row.preview_url,
      asset_type: row.asset_type,
      tag_label: row.tag_label,
      css_class: row.css_class,
      metadata: row.metadata,
      status: row.product_status,
      sort_order: 0,
    });
    const variant = mapVariant({
      id: row.variant_id,
      cosmetic_id: row.cosmetic_id,
      duration_type: row.duration_type,
      duration_days: row.duration_days,
      price_coins: row.variant_price,
      active: true,
    });
    return mapOwnership(row, product, variant);
  });
}

async function purchase(userId, cosmeticId, variantId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`cosmetic_purchase:${userId}`]);

    const productRes = await client.query(
      `SELECT * FROM cosmetic_products WHERE id = $1 FOR UPDATE`,
      [cosmeticId]
    );
    const productRow = productRes.rows[0];
    if (!productRow || productRow.status !== 'ACTIVE') {
      throw new Error('Cosmetic is not available');
    }

    const variantRes = await client.query(
      `SELECT * FROM cosmetic_product_variants WHERE id = $1 FOR UPDATE`,
      [variantId]
    );
    const variantRow = variantRes.rows[0];
    if (
      !variantRow ||
      !variantRow.active ||
      String(variantRow.cosmetic_id) !== String(cosmeticId)
    ) {
      throw new Error('Invalid variant for this cosmetic');
    }

    const price = Number(variantRow.price_coins);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price');

    const debit = await walletService.debitCoins(
      userId,
      price,
      {
        type: 'cosmetic_purchase',
        reference_type: 'cosmetic_ownership',
        metadata: {
          cosmetic_id: String(cosmeticId),
          variant_id: String(variantId),
          duration_type: variantRow.duration_type,
        },
      },
      client
    );

    const existingRes = await client.query(
      `SELECT * FROM user_cosmetic_ownership
       WHERE user_id = $1 AND cosmetic_id = $2 AND ${ACTIVE_OWNERSHIP_SQL}
       FOR UPDATE`,
      [userId, cosmeticId]
    );
    const existing = existingRes.rows[0];

    let ownershipRow;
    if (existing) {
      const newExpires = extendExpiresAt(
        existing.expires_at,
        variantRow.duration_type,
        variantRow.duration_days
      );
      const upd = await client.query(
        `UPDATE user_cosmetic_ownership
         SET variant_id = $2,
             purchase_price = purchase_price + $3,
             expires_at = $4,
             status = 'ACTIVE',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [existing.id, variantId, price, newExpires]
      );
      ownershipRow = upd.rows[0];
    } else {
      const expiresAt = calculateExpiresAt(
        variantRow.duration_type,
        variantRow.duration_days
      );
      const ins = await client.query(
        `INSERT INTO user_cosmetic_ownership
         (user_id, cosmetic_id, variant_id, purchase_price, expires_at, transaction_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, cosmeticId, variantId, price, expiresAt, debit.transaction.id]
      );
      ownershipRow = ins.rows[0];
    }

    if (debit.transaction?.id) {
      await client.query(
        `UPDATE wallet_transactions SET reference_id = $1 WHERE id = $2`,
        [ownershipRow.id, debit.transaction.id]
      );
    }

    await client.query('COMMIT');

    const product = mapProduct(productRow, [variantRow]);
    const ownership = mapOwnership(ownershipRow, product, mapVariant(variantRow));
    return {
      ownership,
      balance: debit.balance,
      coinBalance: debit.balance,
    };
  } catch (err) {
    await db.safeRollback(client);
    if (err.message === 'INSUFFICIENT_BALANCE') {
      throw new Error('Insufficient coins');
    }
    throw err;
  } finally {
    client.release();
  }
}

async function equip(userId, ownershipId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const ownRes = await client.query(
      `SELECT o.*, p.category
       FROM user_cosmetic_ownership o
       JOIN cosmetic_products p ON p.id = o.cosmetic_id
       WHERE o.id = $1 AND o.user_id = $2
       FOR UPDATE`,
      [ownershipId, userId]
    );
    const own = ownRes.rows[0];
    if (!own || !isActiveOwnership(own)) {
      throw new Error('Item not owned or expired');
    }

    await client.query(
      `UPDATE user_cosmetic_ownership o
       SET is_equipped = FALSE, updated_at = CURRENT_TIMESTAMP
       FROM cosmetic_products p
       WHERE o.user_id = $1 AND o.is_equipped = TRUE
         AND p.id = o.cosmetic_id AND p.category = $2`,
      [userId, own.category]
    );

    await client.query(
      `UPDATE user_cosmetic_ownership
       SET is_equipped = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [ownershipId]
    );

    await client.query('COMMIT');
    return await getEquippedCosmetics(userId);
  } catch (err) {
    await db.safeRollback(client);
    throw err;
  } finally {
    client.release();
  }
}

async function unequip(userId, ownershipId) {
  const res = await db.query(
    `UPDATE user_cosmetic_ownership
     SET is_equipped = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND is_equipped = TRUE
     RETURNING id`,
    [ownershipId, userId]
  );
  if (!res.rows.length) throw new Error('Equipped item not found');
  return await getEquippedCosmetics(userId);
}

async function markExpiredOwnership() {
  const res = await db.query(
    `UPDATE user_cosmetic_ownership
     SET status = 'EXPIRED', is_equipped = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
  );
  return res.rowCount;
}

async function unequipExpired() {
  const res = await db.query(
    `UPDATE user_cosmetic_ownership
     SET is_equipped = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE is_equipped = TRUE AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
  );
  return res.rowCount;
}

async function createProduct(payload) {
  const {
    slug,
    name,
    description,
    category,
    thumbnailUrl,
    animationUrl,
    previewUrl,
    assetType,
    tagLabel,
    cssClass,
    metadata,
    status,
    sortOrder,
  } = payload;
  if (!COSMETIC_CATEGORIES.includes(category)) throw new Error('Invalid category');
  const res = await db.query(
    `INSERT INTO cosmetic_products
     (slug, name, description, category, thumbnail_url, animation_url, preview_url,
      asset_type, tag_label, css_class, metadata, status, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      slug,
      name,
      description || null,
      category,
      thumbnailUrl || null,
      animationUrl || null,
      previewUrl || null,
      assetType || 'image',
      tagLabel || null,
      cssClass || null,
      JSON.stringify(metadata || {}),
      status || 'ACTIVE',
      Number(sortOrder) || 0,
    ]
  );
  return mapProduct(res.rows[0]);
}

async function updateProduct(id, payload) {
  const fields = [];
  const values = [];
  const allowed = {
    slug: 'slug',
    name: 'name',
    description: 'description',
    category: 'category',
    thumbnailUrl: 'thumbnail_url',
    animationUrl: 'animation_url',
    previewUrl: 'preview_url',
    assetType: 'asset_type',
    tagLabel: 'tag_label',
    cssClass: 'css_class',
    status: 'status',
    sortOrder: 'sort_order',
  };
  Object.entries(allowed).forEach(([key, col]) => {
    if (payload[key] !== undefined) {
      values.push(payload[key]);
      fields.push(`${col} = $${values.length}`);
    }
  });
  if (payload.metadata !== undefined) {
    values.push(JSON.stringify(payload.metadata || {}));
    fields.push(`metadata = $${values.length}`);
  }
  if (!fields.length) return await getProductById(id, { includeInactiveVariants: true });
  values.push(id);
  await db.query(
    `UPDATE cosmetic_products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${
      values.length
    }`,
    values
  );
  return await getProductById(id, { includeInactiveVariants: true });
}

async function upsertVariant(cosmeticId, payload) {
  const { durationType, durationDays, priceCoins, active = true } = payload;
  if (!DURATION_TYPES.includes(durationType)) throw new Error('Invalid duration type');
  if (durationType === 'PERMANENT' && durationDays != null) {
    throw new Error('Permanent variants cannot have duration_days');
  }
  if (durationType !== 'PERMANENT' && !durationDays) {
    throw new Error('duration_days required for non-permanent variants');
  }
  const price = Number(priceCoins);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price');

  const res = await db.query(
    `INSERT INTO cosmetic_product_variants
     (cosmetic_id, duration_type, duration_days, price_coins, active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cosmetic_id, duration_type)
     DO UPDATE SET duration_days = EXCLUDED.duration_days,
                   price_coins = EXCLUDED.price_coins,
                   active = EXCLUDED.active
     RETURNING *`,
    [
      cosmeticId,
      durationType,
      durationType === 'PERMANENT' ? null : Number(durationDays),
      price,
      Boolean(active),
    ]
  );
  return mapVariant(res.rows[0]);
}

async function deleteVariant(variantId) {
  await db.query(`UPDATE cosmetic_product_variants SET active = FALSE WHERE id = $1`, [variantId]);
  return { success: true };
}

module.exports = {
  COSMETIC_CATEGORIES,
  DURATION_TYPES,
  CATEGORY_API_KEYS,
  formatExpiryLabel,
  listProducts,
  getProductById,
  getEquippedCosmetics,
  getEquippedCosmeticsForUsers,
  listUserInventory,
  purchase,
  equip,
  unequip,
  markExpiredOwnership,
  unequipExpired,
  createProduct,
  updateProduct,
  upsertVariant,
  deleteVariant,
  isActiveOwnership,
};
