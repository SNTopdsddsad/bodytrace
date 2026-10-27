CREATE TABLE `bodytrace_training_record` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`title` varchar(100) NOT NULL,
	`date` date NOT NULL,
	`time` varchar(5),
	`time_zone` varchar(64) NOT NULL,
	`mode` varchar(16) NOT NULL,
	`status` varchar(16) NOT NULL,
	`started_at` datetime(3),
	`duration_minutes` double,
	`note` varchar(2000),
	`items` json NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `bodytrace_training_record_id` PRIMARY KEY(`id`),
	CONSTRAINT `training_user_request_unique` UNIQUE(`user_id`,`request_id`),
	CONSTRAINT `training_values_valid` CHECK(
    `bodytrace_training_record`.`version` > 0
    AND `bodytrace_training_record`.`status` IN ('inProgress', 'completed')
    AND ((`bodytrace_training_record`.`mode` = 'live' AND `bodytrace_training_record`.`started_at` IS NOT NULL) OR (`bodytrace_training_record`.`mode` = 'manual' AND `bodytrace_training_record`.`started_at` IS NULL))
    AND (`bodytrace_training_record`.`duration_minutes` IS NULL OR `bodytrace_training_record`.`duration_minutes` > 0)
    AND JSON_TYPE(`bodytrace_training_record`.`items`) = 'ARRAY'
    AND JSON_LENGTH(`bodytrace_training_record`.`items`) <= 50
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_training_record` ADD CONSTRAINT `bodytrace_training_record_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `training_user_date_idx` ON `bodytrace_training_record` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `training_user_status_date_idx` ON `bodytrace_training_record` (`user_id`,`status`,`date`);
