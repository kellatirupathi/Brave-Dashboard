-- Normalise stored user emails to lowercase.
--
-- WHY
-- /auth/password-login lowercases the submitted address before looking it up,
-- but POST /admin/users stored whatever the admin typed into the form. A staff
-- account created as "Firstname.Lastname@nxtwave.co.in" was therefore written
-- with those capitals and could never be found at sign-in: every attempt came
-- back "Invalid email or password" no matter what the password was, because
-- the lookup failed before the password was ever compared.
--
-- The create route now normalises (and so does the admin UI). This repairs the
-- rows written before it did.
--
-- Idempotent: safe to re-run.
--
-- Rows that would COLLIDE with an existing lowercase row are deliberately left
-- untouched and reported instead. Two accounts differing only by case are two
-- accounts; deciding which one survives is a judgement for a human, not
-- something a migration should do silently. The email index is not unique, so
-- such pairs are possible.

DO $$
DECLARE
  collisions int;
  updated int;
BEGIN
  SELECT count(*) INTO collisions
  FROM users u
  WHERE u.email <> lower(u.email)
    AND EXISTS (
      SELECT 1 FROM users o
      WHERE o.id <> u.id AND lower(o.email) = lower(u.email)
    );

  UPDATE users u
  SET email = lower(u.email)
  WHERE u.email <> lower(u.email)
    AND NOT EXISTS (
      SELECT 1 FROM users o
      WHERE o.id <> u.id AND lower(o.email) = lower(u.email)
    );
  GET DIAGNOSTICS updated = ROW_COUNT;

  RAISE NOTICE 'users.email: lowercased % row(s)', updated;

  IF collisions > 0 THEN
    RAISE WARNING
      'users.email: % row(s) left unchanged because another account already uses the lowercase form. Resolve these by hand:',
      collisions;
    RAISE WARNING
      '  SELECT id, email, role, is_active, password_hash IS NULL AS no_password FROM users WHERE lower(email) IN (SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1) ORDER BY lower(email);';
  END IF;
END $$;
