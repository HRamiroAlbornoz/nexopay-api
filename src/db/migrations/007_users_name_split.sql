DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100);

    UPDATE users
    SET
      first_name = split_part(full_name, ' ', 1),
      last_name  = CASE
                     WHEN position(' ' IN full_name) > 0
                     THEN NULLIF(trim(substring(full_name FROM position(' ' IN full_name))), '')
                     ELSE NULL
                   END
    WHERE first_name IS NULL OR last_name IS NULL;

    ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;

    ALTER TABLE users DROP COLUMN full_name;
  END IF;
END $$;
