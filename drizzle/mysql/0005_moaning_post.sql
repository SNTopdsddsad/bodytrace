CREATE TABLE `bodytrace_sms_rate_limit` (
	`id` varchar(64) NOT NULL,
	`window_started_at` datetime(3) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`next_allowed_at` datetime(3) NOT NULL,
	CONSTRAINT `bodytrace_sms_rate_limit_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_user` ADD `phone_number` varchar(16);--> statement-breakpoint
ALTER TABLE `bodytrace_user` ADD `phone_number_verified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bodytrace_user` ADD CONSTRAINT `bodytrace_user_phone_number_unique` UNIQUE(`phone_number`);
