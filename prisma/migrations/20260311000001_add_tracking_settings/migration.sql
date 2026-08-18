-- CreateTable: tracking_settings (if not exists)
CREATE TABLE IF NOT EXISTS `tracking_settings` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `computerType` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'visible',
    `screenshotsPerHour` INTEGER NOT NULL DEFAULT 0,
    `allowAccessScreenshots` BOOLEAN NOT NULL DEFAULT false,
    `allowRemoveScreenshots` BOOLEAN NOT NULL DEFAULT false,
    `breakTime` INTEGER NOT NULL DEFAULT 0,
    `allowOverBreak` BOOLEAN NOT NULL DEFAULT false,
    `allowNewBreaks` BOOLEAN NOT NULL DEFAULT false,
    `idleTime` INTEGER NOT NULL DEFAULT 2,
    `trackingScenario` VARCHAR(191) NOT NULL DEFAULT 'unlimited',
    `workingDays` JSON NOT NULL,
    `trackTasks` BOOLEAN NOT NULL DEFAULT false,
    `allowAddTasks` BOOLEAN NOT NULL DEFAULT false,
    `permissions` JSON NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddColumn: trackingSettingId to employees (if not exists)
ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `trackingSettingId` VARCHAR(191) NULL;

-- AddForeignKey (only if not already created)
ALTER TABLE `tracking_settings` ADD CONSTRAINT `tracking_settings_organizationId_fkey` 
    FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `employees` ADD CONSTRAINT `employees_trackingSettingId_fkey` 
    FOREIGN KEY (`trackingSettingId`) REFERENCES `tracking_settings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
