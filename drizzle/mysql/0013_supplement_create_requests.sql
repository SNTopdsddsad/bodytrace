CREATE TABLE `bodytrace_supplement_create_request` (
	`user_id` varchar(255) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`payload_hash` varchar(64) NOT NULL,
	`supplement_id` varchar(36),
	CONSTRAINT `bodytrace_supplement_create_request_user_id_request_id_pk` PRIMARY KEY(`user_id`,`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `bodytrace_supplement_create_request` ADD CONSTRAINT `supplement_request_user_fk` FOREIGN KEY (`user_id`) REFERENCES `bodytrace_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bodytrace_supplement_create_request` ADD CONSTRAINT `supplement_request_supplement_fk` FOREIGN KEY (`supplement_id`) REFERENCES `bodytrace_supplement`(`id`) ON DELETE set null ON UPDATE no action;
