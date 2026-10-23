ALTER TABLE `bodytrace_meal_photo` ADD `request_id` varchar(36);--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` ADD `content_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` ADD `deleted_at` datetime(3);--> statement-breakpoint
ALTER TABLE `bodytrace_meal_photo` ADD CONSTRAINT `meal_photo_user_request_unique` UNIQUE(`user_id`,`request_id`);