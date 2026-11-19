-- =====================================================================
-- BALI ARCADE - authentication, roles and dashboard schema
-- Idempotent: safe to run many times.
--   npm run db:migrate      (or)      psql -d bali_arcade -f database/auth.sql
-- =====================================================================

-- ---------- users -----------------------------------------------------
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS role              VARCHAR(20)  NOT NULL DEFAULT 'visitor';
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS status            VARCHAR(20)  NOT NULL DEFAULT 'active';
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS full_name         VARCHAR(100);
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS phone             VARCHAR(30);
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS failed_attempts   INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS locked_until      TIMESTAMPTZ;
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS last_login_at     TIMESTAMPTZ;
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS token_version     INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE mall.users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Older versions only allowed admin/shopkeeper. Replace the constraint.
ALTER TABLE mall.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE mall.users ADD  CONSTRAINT users_role_check   CHECK (role   IN ('admin', 'shopkeeper', 'visitor'));
ALTER TABLE mall.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE mall.users ADD  CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended'));

-- Case-insensitive uniqueness for both login identifiers.
DROP INDEX IF EXISTS mall.idx_mall_users_username;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mall_users_username_ci ON mall.users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS ux_mall_users_email_ci    ON mall.users (lower(email));
CREATE INDEX        IF NOT EXISTS ix_mall_users_role        ON mall.users (role);

-- ---------- shop ownership -------------------------------------------
CREATE TABLE IF NOT EXISTS mall.shop_owners (
    user_id      INTEGER NOT NULL REFERENCES mall.users(id) ON DELETE CASCADE,
    store_number TEXT    NOT NULL,
    PRIMARY KEY (user_id, store_number)
);
CREATE INDEX IF NOT EXISTS ix_shop_owners_store ON mall.shop_owners (store_number);

-- Shopkeepers ask for a store; an admin approves or rejects.
CREATE TABLE IF NOT EXISTS mall.store_claims (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES mall.users(id) ON DELETE CASCADE,
    store_number TEXT    NOT NULL,
    message      TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by  INTEGER REFERENCES mall.users(id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_store_claims_pending
    ON mall.store_claims (user_id, store_number) WHERE status = 'pending';

-- ---------- public shop information ----------------------------------
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE mall.stores   ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS mall.shop_profiles (
    store_number TEXT PRIMARY KEY,
    description  TEXT,
    opening_hours TEXT,
    phone        VARCHAR(30),
    email        VARCHAR(100),
    website      VARCHAR(255),
    products     TEXT,
    open_status  VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (open_status IN ('open', 'closed', 'renovation')),
    updated_by   INTEGER REFERENCES mall.users(id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mall.offers (
    id            SERIAL PRIMARY KEY,
    store_number  TEXT NOT NULL,
    title         VARCHAR(120) NOT NULL,
    description   TEXT,
    discount_text VARCHAR(40),
    starts_on     DATE,
    ends_on       DATE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    INTEGER REFERENCES mall.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_offers_store ON mall.offers (store_number);

-- ---------- visitor favourites ---------------------------------------
CREATE TABLE IF NOT EXISTS mall.favorites (
    user_id      INTEGER NOT NULL REFERENCES mall.users(id) ON DELETE CASCADE,
    store_number TEXT    NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, store_number)
);

-- ---------- audit trail ----------------------------------------------
CREATE TABLE IF NOT EXISTS mall.audit_log (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER,
    username   VARCHAR(50),
    action     VARCHAR(60) NOT NULL,
    target     VARCHAR(120),
    details    JSONB,
    ip         VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON mall.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_action  ON mall.audit_log (action);
