CREATE TABLE `bodytrace_measurement` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`date` date NOT NULL,
	`time` varchar(5),
	`time_zone` varchar(64) NOT NULL,
	`value` decimal(5,2),
	`systolic` int,
	`diastolic` int,
	`note` varchar(500),
	`request_id` varchar(36) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `bodytrace_measurement_id` PRIMARY KEY(`id`),
	CONSTRAINT `measurement_user_request_unique` UNIQUE(`user_id`,`request_id`),
	CONSTRAINT `measurement_values_valid` CHECK(
    (`bodytrace_measurement`.`kind` = 'weight' AND `bodytrace_measurement`.`value` IS NOT NULL AND `bodytrace_measurement`.`value` > 0 AND `bodytrace_measurement`.`value` <= 500 AND `bodytrace_measurement`.`systolic` IS NULL AND `bodytrace_measurement`.`diastolic` IS NULL)
    OR (`bodytrace_measurement`.`kind` = 'bodyFat' AND `bodytrace_measurement`.`value` IS NOT NULL AND `bodytrace_measurement`.`value` > 0 AND `bodytrace_measurement`.`value` <= 100 AND `bodytrace_measurement`.`systolic` IS NULL AND `bodytrace_measurement`.`diastolic` IS NULL)
    OR (`bodytrace_measurement`.`kind` = 'bloodPressure' AND `bodytrace_measurement`.`value` IS NULL AND `bodytrace_measurement`.`systolic` IS NOT NULL AND `bodytrace_measurement`.`diastolic` IS NOT NULL AND `bodytrace_measurement`.`systolic` > `bodytrace_measurement`.`diastolic` AND `bodytrace_measurement`.`systolic` <= 400 AND `bodytrace_measurement`.`diastolic` > 0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_measurement` ADD CONSTRAINT `bodytrace_measurement_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `measurement_user_kind_date_idx` ON `bodytrace_measurement` (`user_id`,`kind`,`date`);
