-- Additive-only security hardening migration.
-- Apply only after a verified TiDB/MySQL backup and critical table exports.

CREATE TABLE `trusted_device_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL DEFAULT 'misti',
    `tokenHash` VARCHAR(64) NOT NULL,
    `userAgentHash` VARCHAR(64) NULL,
    `ipHash` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `legacyMigratedAt` DATETIME(3) NULL,

    UNIQUE INDEX `trusted_device_sessions_tokenHash_key`(`tokenHash`),
    INDEX `trusted_device_sessions_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `trusted_device_sessions_revokedAt_idx`(`revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `login_rate_limits` (
    `id` VARCHAR(191) NOT NULL,
    `scopeHash` VARCHAR(64) NOT NULL,
    `emailHash` VARCHAR(64) NOT NULL,
    `ipHash` VARCHAR(64) NOT NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastFailedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `login_rate_limits_scopeHash_key`(`scopeHash`),
    INDEX `login_rate_limits_emailHash_idx`(`emailHash`),
    INDEX `login_rate_limits_lockedUntil_idx`(`lockedUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
