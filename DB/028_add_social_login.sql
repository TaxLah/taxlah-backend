-- ============================================================
-- Migration 028: social login (Google / Apple via Firebase)
--
-- Sign-in is brokered by Firebase Auth: the app signs in with Google/Apple,
-- Firebase returns an ID token, and the backend verifies it with firebase-admin
-- (already installed for FCM). The stable identifier is the Firebase UID, which
-- is the same for a user regardless of which provider they used.
--
-- auth_access already carries auth_socmed enum('Yes','No') from the original
-- schema design, so this only adds:
--   - auth_provider      : how this credential authenticates
--   - auth_provider_uid  : the Firebase UID, the key returning social logins match on
--
-- A composite index lets the login path find an account by (provider, uid) in one
-- indexed lookup. Additive only — no existing row is touched, and every current
-- password account keeps auth_provider = 'Password' by default.
-- ============================================================

USE taxlah_development;

ALTER TABLE `auth_access`
    ADD COLUMN `auth_provider` VARCHAR(20) NOT NULL DEFAULT 'Password'
        COMMENT 'Password | Google | Apple',
    ADD COLUMN `auth_provider_uid` VARCHAR(191) NULL
        COMMENT 'Firebase UID for social logins; NULL for password accounts',
    ADD INDEX `idx_auth_provider_uid` (`auth_provider`, `auth_provider_uid`);
