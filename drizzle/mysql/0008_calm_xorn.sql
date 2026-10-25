-- 需停止旧应用写入后执行；旧版本依赖 entry_id，不能与本迁移滚动混用。
ALTER TABLE `bodytrace_meal_photo`
  ADD `date` date NULL,
  ADD `meal_type` enum('breakfast','lunch','dinner','snack') NULL;
--> statement-breakpoint
UPDATE `bodytrace_meal_photo` p
  JOIN `bodytrace_meal_entry` e ON e.`id` = p.`entry_id`
  SET p.`date` = e.`date`, p.`meal_type` = e.`meal_type`;
--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` DROP FOREIGN KEY `bodytrace_meal_photo_entry_id_bodytrace_meal_entry_id_fk`;
--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` DROP INDEX `meal_photo_entry_position_unique`;
--> statement-breakpoint
DROP INDEX `meal_photo_entry_position_idx` ON `bodytrace_meal_photo`;
--> statement-breakpoint
-- 所有行（含删除标记）参与编号，保留历史照片及幂等信息。
UPDATE `bodytrace_meal_photo` p
  JOIN (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `user_id`, `date`, `meal_type`
      ORDER BY `created_at`, `position`, `id`
    ) - 1 AS `pos`
    FROM `bodytrace_meal_photo`
  ) r ON r.`id` = p.`id`
  SET p.`position` = r.`pos`;
--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo`
  MODIFY `date` date NOT NULL,
  MODIFY `meal_type` enum('breakfast','lunch','dinner','snack') NOT NULL,
  DROP COLUMN `entry_id`;
--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo`
  ADD CONSTRAINT `meal_photo_meal_position_unique` UNIQUE(`user_id`, `date`, `meal_type`, `position`);
