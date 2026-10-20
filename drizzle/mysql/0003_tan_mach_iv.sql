CREATE TABLE `bodytrace_diet_plan_item` (
	`id` varchar(36) NOT NULL,
	`plan_id` varchar(36) NOT NULL,
	`weekday` int NOT NULL,
	`meal_type` enum('breakfast','lunch','dinner','snack') NOT NULL,
	`food_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`grams` double NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_diet_plan_item_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_diet_plan_item` ADD CONSTRAINT `bodytrace_diet_plan_item_plan_id_bodytrace_diet_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `bodytrace_diet_plan`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_diet_plan_item` ADD CONSTRAINT `bodytrace_diet_plan_item_food_id_bodytrace_food_id_fk` FOREIGN KEY (`food_id`) REFERENCES `bodytrace_food`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `diet_plan_item_plan_weekday_idx` ON `bodytrace_diet_plan_item` (`plan_id`,`weekday`);--> statement-breakpoint
ALTER TABLE `bodytrace_diet_plan_day` DROP COLUMN `day_type`;