const { query } = require('../../db');

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function unavailable(user) {
  return user?.status === 'blocked' || user?.status === 'deleted';
}

function authError(code, status = 400) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

async function findOrCreateUserForExternalProfile(profile) {
  if (!profile?.provider || !profile?.providerUserId) {
    throw authError('invalid_external_profile', 400);
  }

  const provider = String(profile.provider);
  const providerUserId = String(profile.providerUserId);
  const email = normalizeEmail(profile.email);
  const phone = profile.phone || null;
  const fullName = profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null;
  const birthDate = normalizeDate(profile.birthDate);
  const rawProfile = profile.rawProfile && typeof profile.rawProfile === 'object' ? profile.rawProfile : {};

  const existingIdentity = await query(
    `SELECT i.user_id, u.id, u.email, u.status
       FROM user_auth_identities i
       JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.provider_user_id = $2
      LIMIT 1`,
    [provider, providerUserId]
  );

  if (existingIdentity.rows[0]) {
    const user = existingIdentity.rows[0];
    if (unavailable(user)) throw authError('account_unavailable', 403);
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await query(
      `UPDATE user_auth_identities
          SET last_login_at = now(), email_at_provider = COALESCE($3, email_at_provider), phone_at_provider = COALESCE($4, phone_at_provider), profile_json = $5
        WHERE provider = $1 AND provider_user_id = $2`,
      [provider, providerUserId, email, phone, rawProfile]
    );
    return user;
  }

  if (email) {
    const byEmail = await query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (byEmail.rows[0]) throw authError('external_identity_not_linked_existing_email', 409);
  }

  const created = await query(
    `INSERT INTO users(id, email, email_verified_at, phone, full_name, birth_date, role, last_login_at)
     VALUES (
       gen_random_uuid(),
       $1::text,
       CASE WHEN $1::text IS NULL THEN NULL ELSE now() END,
       $2::text,
       $3::text,
       $4::date,
       'user',
       now()
     )
     RETURNING id, email, status`,
    [email, phone, fullName, birthDate]
  );
  const user = created.rows[0];

  await query(
    `INSERT INTO user_auth_identities(user_id, provider, provider_user_id, email_at_provider, phone_at_provider, profile_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, provider, providerUserId, email, phone, rawProfile]
  );

  return user;
}

async function linkExternalIdentityToUser(userId, profile) {
  if (!userId) {
    throw authError('login_required', 401);
  }

  if (!profile?.provider || !profile?.providerUserId) {
    throw authError('invalid_external_profile', 400);
  }

  const provider = String(profile.provider);
  const providerUserId = String(profile.providerUserId);
  const email = normalizeEmail(profile.email);
  const phone = profile.phone || null;
  const rawProfile = profile.rawProfile && typeof profile.rawProfile === 'object' ? profile.rawProfile : {};

  const currentUserResult = await query(
    `SELECT id, email, status
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );

  const currentUser = currentUserResult.rows[0];

  if (!currentUser) {
    throw authError('login_required', 401);
  }

  if (unavailable(currentUser)) {
    throw authError('account_unavailable', 403);
  }

  const existingIdentity = await query(
    `SELECT user_id
       FROM user_auth_identities
      WHERE provider = $1
        AND provider_user_id = $2
      LIMIT 1`,
    [provider, providerUserId]
  );

  if (existingIdentity.rows[0]) {
    const linkedUserId = String(existingIdentity.rows[0].user_id);

    if (linkedUserId !== String(userId)) {
      throw authError('external_identity_already_linked', 409);
    }

    await query(
      `UPDATE user_auth_identities
          SET last_login_at = now(),
              email_at_provider = COALESCE($3, email_at_provider),
              phone_at_provider = COALESCE($4, phone_at_provider),
              profile_json = $5
        WHERE provider = $1
          AND provider_user_id = $2`,
      [provider, providerUserId, email, phone, rawProfile]
    );

    return currentUser;
  }

  const existingProviderForUser = await query(
    `SELECT provider_user_id
       FROM user_auth_identities
      WHERE user_id = $1
        AND provider = $2
      LIMIT 1`,
    [userId, provider]
  );

  if (existingProviderForUser.rows[0]) {
    throw authError('external_provider_already_linked', 409);
  }

  if (!email) {
    throw authError('external_email_required', 409);
  }

  if (!currentUser.email) {
    throw authError('account_email_required', 409);
  }

  if (normalizeEmail(currentUser.email) !== email) {
    throw authError('external_email_mismatch', 409);
  }

  await query(
    `INSERT INTO user_auth_identities(user_id, provider, provider_user_id, email_at_provider, phone_at_provider, profile_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, provider, providerUserId, email, phone, rawProfile]
  );

  return currentUser;
}

module.exports = {
  findOrCreateUserForExternalProfile,
  linkExternalIdentityToUser,
};