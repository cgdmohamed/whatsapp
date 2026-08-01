CREATE TABLE IF NOT EXISTS "help_article_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" uuid,
	"was_helpful" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_article_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_article_id" uuid NOT NULL,
	"target_article_id" uuid NOT NULL,
	"relation_type" varchar(20) DEFAULT 'RELATED' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_article_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"user_id" uuid,
	"route" varchar(255),
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"title_ar" varchar(220) NOT NULL,
	"title_en" varchar(220) NOT NULL,
	"slug" varchar(220) NOT NULL,
	"summary_ar" text,
	"summary_en" text,
	"content_ar" text,
	"content_en" text,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"article_type" varchar(30) DEFAULT 'OVERVIEW' NOT NULL,
	"difficulty" varchar(20) DEFAULT 'BASIC' NOT NULL,
	"estimated_reading_minutes" integer DEFAULT 3 NOT NULL,
	"allowed_roles" jsonb,
	"route_patterns" jsonb,
	"feature_key" varchar(80),
	"keywords" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_contextual" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_category_id" uuid,
	"name_ar" varchar(160) NOT NULL,
	"name_en" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"description_ar" text,
	"description_en" text,
	"icon" varchar(60),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'PUBLISHED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_change_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"changed_by_user_id" uuid,
	"change_summary" text,
	"previous_version" jsonb,
	"new_version" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_onboarding_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_onboarding_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"step_key" varchar(120) NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "help_search_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"query" varchar(200) NOT NULL,
	"language" varchar(2) DEFAULT 'ar' NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_article_feedback" ADD CONSTRAINT "help_article_feedback_article_id_help_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."help_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_article_feedback" ADD CONSTRAINT "help_article_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_article_links" ADD CONSTRAINT "help_article_links_source_article_id_help_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."help_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_article_links" ADD CONSTRAINT "help_article_links_target_article_id_help_articles_id_fk" FOREIGN KEY ("target_article_id") REFERENCES "public"."help_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_article_views" ADD CONSTRAINT "help_article_views_article_id_help_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."help_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_article_views" ADD CONSTRAINT "help_article_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_category_id_help_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."help_categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_categories" ADD CONSTRAINT "help_categories_parent_category_id_help_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."help_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_change_logs" ADD CONSTRAINT "help_change_logs_article_id_help_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."help_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_change_logs" ADD CONSTRAINT "help_change_logs_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_onboarding_state" ADD CONSTRAINT "help_onboarding_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_onboarding_steps" ADD CONSTRAINT "help_onboarding_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "help_search_logs" ADD CONSTRAINT "help_search_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_feedback_article_idx" ON "help_article_feedback" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_feedback_user_idx" ON "help_article_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_links_source_idx" ON "help_article_links" USING btree ("source_article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_links_target_idx" ON "help_article_links" USING btree ("target_article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_views_article_idx" ON "help_article_views" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_views_viewed_at_idx" ON "help_article_views" USING btree ("viewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "help_articles_slug_idx" ON "help_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_articles_category_idx" ON "help_articles" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_articles_status_idx" ON "help_articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_articles_feature_key_idx" ON "help_articles" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_articles_published_at_idx" ON "help_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_articles_featured_idx" ON "help_articles" USING btree ("is_featured");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "help_categories_slug_idx" ON "help_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_categories_status_idx" ON "help_categories" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_categories_sort_idx" ON "help_categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_change_logs_article_idx" ON "help_change_logs" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "help_onboarding_user_step_idx" ON "help_onboarding_steps" USING btree ("user_id","step_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_onboarding_user_idx" ON "help_onboarding_steps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "help_search_logs_created_at_idx" ON "help_search_logs" USING btree ("created_at");