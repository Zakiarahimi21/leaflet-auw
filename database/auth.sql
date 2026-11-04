ALTER TABLE mall.users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'shopkeeper';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_check'
          AND conrelid = 'mall.users'::regclass
    ) THEN
        ALTER TABLE mall.users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('admin', 'shopkeeper'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mall_users_username ON mall.users (username);

CREATE TABLE IF NOT EXISTS mall.shop_owners (
    user_id INTEGER NOT NULL REFERENCES mall.users(id) ON DELETE CASCADE,
    store_number TEXT NOT NULL,
    PRIMARY KEY (user_id, store_number)
);

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE mall.stores ADD COLUMN IF NOT EXISTS image_url TEXT;
