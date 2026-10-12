CREATE TABLE `bodytrace_account` (
	`id` varchar(255) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_account_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_daily_goal` (
	`user_id` varchar(255) NOT NULL,
	`calories` int NOT NULL DEFAULT 2000,
	`protein` int NOT NULL DEFAULT 120,
	`carbs` int NOT NULL DEFAULT 220,
	`fat` int NOT NULL DEFAULT 60,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_daily_goal_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_diet_plan` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`start_date` date NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_diet_plan_id` PRIMARY KEY(`id`),
	CONSTRAINT `diet_plan_user_unique` UNIQUE(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_diet_plan_day` (
	`id` varchar(36) NOT NULL,
	`plan_id` varchar(36) NOT NULL,
	`weekday` int NOT NULL,
	`day_type` enum('high','medium','low') NOT NULL,
	`calories` int NOT NULL,
	`protein` int NOT NULL,
	`carbs` int NOT NULL,
	`fat` int NOT NULL,
	CONSTRAINT `bodytrace_diet_plan_day_id` PRIMARY KEY(`id`),
	CONSTRAINT `diet_plan_day_plan_weekday_unique` UNIQUE(`plan_id`,`weekday`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_food` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`brand` text,
	`calories` double NOT NULL,
	`protein` double NOT NULL DEFAULT 0,
	`carbs` double NOT NULL DEFAULT 0,
	`fat` double NOT NULL DEFAULT 0,
	`serving_grams` double,
	`is_favorite` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_food_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_food_reference` (
	`id` int AUTO_INCREMENT NOT NULL,
	`food_code` varchar(32) NOT NULL,
	`name` varchar(255) NOT NULL,
	`english_name` text,
	`category` text,
	`calories` double,
	`protein` double,
	`carbs` double,
	`fat` double,
	`dietary_fiber` double,
	`edible` double,
	CONSTRAINT `bodytrace_food_reference_id` PRIMARY KEY(`id`),
	CONSTRAINT `bodytrace_food_reference_food_code_unique` UNIQUE(`food_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_meal_entry` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`date` date NOT NULL,
	`meal_type` enum('breakfast','lunch','dinner','snack') NOT NULL,
	`food_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`grams` double NOT NULL,
	`calories` double NOT NULL,
	`protein` double NOT NULL DEFAULT 0,
	`carbs` double NOT NULL DEFAULT 0,
	`fat` double NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_meal_entry_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_session` (
	`id` varchar(255) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(255) NOT NULL,
	CONSTRAINT `bodytrace_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `bodytrace_session_token_unique` UNIQUE(`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_user` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_user_id` PRIMARY KEY(`id`),
	CONSTRAINT `bodytrace_user_email_unique` UNIQUE(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_user_profile` (
	`user_id` varchar(255) NOT NULL,
	`gender` enum('male','female','other'),
	`height_cm` double,
	`weight_kg` double,
	`target_weight_kg` double,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_user_profile_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_verification` (
	`id` varchar(255) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_verification_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_account` ADD CONSTRAINT `bodytrace_account_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_daily_goal` ADD CONSTRAINT `bodytrace_daily_goal_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_diet_plan` ADD CONSTRAINT `bodytrace_diet_plan_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_diet_plan_day` ADD CONSTRAINT `bodytrace_diet_plan_day_plan_id_bodytrace_diet_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `bodytrace_diet_plan`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_food` ADD CONSTRAINT `bodytrace_food_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_meal_entry` ADD CONSTRAINT `bodytrace_meal_entry_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_meal_entry` ADD CONSTRAINT `bodytrace_meal_entry_food_id_bodytrace_food_id_fk` FOREIGN KEY (`food_id`) REFERENCES `bodytrace_food`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_session` ADD CONSTRAINT `bodytrace_session_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_user_profile` ADD CONSTRAINT `bodytrace_user_profile_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `food_user_idx` ON `bodytrace_food` (`user_id`);--> statement-breakpoint
CREATE INDEX `food_reference_name_idx` ON `bodytrace_food_reference` (`name`);--> statement-breakpoint
CREATE INDEX `meal_entry_user_date_idx` ON `bodytrace_meal_entry` (`user_id`,`date`);