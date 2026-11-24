CREATE TABLE `bodytrace_supplement` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`name` varchar(100) NOT NULL,
	`default_quantity` decimal(6,2) NOT NULL,
	`unit` varchar(24) NOT NULL,
	`spec` varchar(100),
	`mode` varchar(16) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`schedule` json NOT NULL,
	`weekdays` json,
	`note` varchar(255),
	`start_date` date NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bodytrace_supplement_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplement_values_valid` CHECK(
        `bodytrace_supplement`.`default_quantity` > 0 AND `bodytrace_supplement`.`default_quantity` <= 100
        AND `bodytrace_supplement`.`mode` IN ('scheduled', 'asNeeded')
        AND `bodytrace_supplement`.`status` IN ('active', 'paused')
        AND JSON_TYPE(`bodytrace_supplement`.`schedule`) = 'ARRAY'
      )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `bodytrace_supplement_intake` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`supplement_id` varchar(36),
	`date` date NOT NULL,
	`slot` varchar(24) NOT NULL,
	`taken_time` varchar(5),
	`time_zone` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`quantity` decimal(6,2) NOT NULL,
	`unit` varchar(24) NOT NULL,
	`spec` varchar(100),
	`note` varchar(300),
	`is_adhoc` boolean NOT NULL DEFAULT false,
	`request_id` varchar(36) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` datetime(3),
	CONSTRAINT `bodytrace_supplement_intake_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplement_intake_user_request_unique` UNIQUE(`user_id`,`request_id`),
	CONSTRAINT `supplement_intake_values_valid` CHECK(
        `bodytrace_supplement_intake`.`quantity` > 0 AND `bodytrace_supplement_intake`.`quantity` <= 100
        AND `bodytrace_supplement_intake`.`version` > 0
        AND `bodytrace_supplement_intake`.`slot` IN ('morningEmpty', 'breakfast', 'lunch', 'dinner', 'workout', 'bedtime', 'anytime')
      )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_supplement` ADD CONSTRAINT `bodytrace_supplement_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_supplement_intake` ADD CONSTRAINT `bodytrace_supplement_intake_user_id_bodytrace_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_supplement_intake` ADD CONSTRAINT `supplement_intake_supplement_fk` FOREIGN KEY (`supplement_id`) REFERENCES `bodytrace_supplement`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplement_user_idx` ON `bodytrace_supplement` (`user_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `supplement_intake_user_date_idx` ON `bodytrace_supplement_intake` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `supplement_intake_user_supplement_date_idx` ON `bodytrace_supplement_intake` (`user_id`,`supplement_id`,`date`);