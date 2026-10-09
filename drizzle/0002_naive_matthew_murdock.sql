CREATE TYPE "public"."day_type" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "diet_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"start_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diet_plan_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "diet_plan_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"day_type" "day_type" NOT NULL,
	"calories" integer NOT NULL,
	"protein" integer NOT NULL,
	"carbs" integer NOT NULL,
	"fat" integer NOT NULL,
	CONSTRAINT "diet_plan_day_plan_weekday_unique" UNIQUE("plan_id","weekday")
);
--> statement-breakpoint
ALTER TABLE "diet_plan" ADD CONSTRAINT "diet_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_plan_day" ADD CONSTRAINT "diet_plan_day_plan_id_diet_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."diet_plan"("id") ON DELETE cascade ON UPDATE no action;