const db = require('../config/database');

async function submitVerification(userId, crownType, proofVideoUrl) {
  const res = await db.query(
    `INSERT INTO creator_verifications (user_id, crown_type, proof_video_url, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [userId, crownType, proofVideoUrl]
  );
  return res.rows[0];
}

async function reviewVerification(verificationId, reviewerId, decision, notes) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const v = await client.query(
      `SELECT * FROM creator_verifications WHERE id = $1 FOR UPDATE`,
      [verificationId]
    );
    if (!v.rows.length) throw new Error('Verification not found');
    if (v.rows[0].status !== 'pending') throw new Error('Already reviewed');

    await client.query(
      `INSERT INTO verification_reviews (verification_id, reviewer_id, decision, notes) VALUES ($1, $2, $3, $4)`,
      [verificationId, reviewerId, decision, notes || null]
    );
    await client.query(
      `UPDATE creator_verifications SET status = $1 WHERE id = $2`,
      [decision, verificationId]
    );

    if (decision === 'approved') {
      const crown = v.rows[0].crown_type;
      await client.query(
        `INSERT INTO creator_badges (user_id, badge_type, crown_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, badge_type) DO UPDATE SET crown_type = EXCLUDED.crown_type, granted_at = CURRENT_TIMESTAMP`,
        [v.rows[0].user_id, `${crown}_crown`, crown]
      );
    }

    await client.query('COMMIT');
    return v.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getUserBadges(userId) {
  const res = await db.query(`SELECT * FROM creator_badges WHERE user_id = $1`, [userId]);
  return res.rows;
}

async function listPending(limit = 50) {
  const res = await db.query(
    `SELECT cv.*, u.first_name, u.last_name, u.email
     FROM creator_verifications cv JOIN users u ON u.id = cv.user_id
     WHERE cv.status = 'pending' ORDER BY cv.submitted_at ASC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

module.exports = { submitVerification, reviewVerification, getUserBadges, listPending };
