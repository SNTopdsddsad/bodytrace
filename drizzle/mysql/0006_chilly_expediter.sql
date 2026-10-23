CREATE TABLE `bodytrace_meal_photo` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`entry_id` varchar(36) NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`thumb_key` varchar(512) NOT NULL,
	`mime_type` varchar(64) NOT NULL,
	`byte_size` int NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`position` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_meal_photo_id` PRIMARY KEY(`id`),
	CONSTRAINT `meal_photo_entry_position_unique` UNIQUE(`entry_id`,`position`),
	CONSTRAINT `meal_photo_object_unique` UNIQUE(`object_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` ADD CONSTRAINT `bodytrace_meal_photo_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` ADD CONSTRAINT `bodytrace_meal_photo_entry_id_bodytrace_meal_entry_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `bodytrace_meal_entry`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meal_photo_entry_position_idx` ON `bodytrace_meal_photo` (`entry_id`,`position`);--> statement-breakpoint
CREATE INDEX `meal_photo_user_idx` ON `bodytrace_meal_photo` (`user_id`);