CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TABLE "food_reference" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "food_reference_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"food_code" text NOT NULL,
	"name" text NOT NULL,
	"english_name" text,
	"category" text,
	"calories" real,
	"protein" real,
	"carbs" real,
	"fat" real,
	"dietary_fiber" real,
	"edible" real,
	CONSTRAINT "food_reference_food_code_unique" UNIQUE("food_code")
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"gender" "gender",
	"age" integer,
	"height_cm" real,
	"weight_kg" real,
	"target_weight_kg" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_reference_name_idx" ON "food_reference" USING btree ("name");