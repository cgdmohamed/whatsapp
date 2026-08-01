CREATE TABLE IF NOT EXISTS "campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid,
	"phone_e164" varchar(20) NOT NULL,
	"contact_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_template_parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"eligibility_reason" varchar(30),
	"idempotency_key" varchar(120) NOT NULL,
	"queue_job_id" varchar(120),
	"meta_message_id" varchar(200),
	"queued_at" timestamp with time zone,
	"send_attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"failure_code" varchar(50),
	"failure_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"whatsapp_phone_number_id" uuid,
	"message_template_id" uuid,
	"template_snapshot" jsonb,
	"language" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"audience_type" varchar(20) DEFAULT 'LISTS' NOT NULL,
	"audience_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variable_mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"eligible_recipients" integer DEFAULT 0 NOT NULL,
	"skipped_recipients" integer DEFAULT 0 NOT NULL,
	"queued_recipients" integer DEFAULT 0 NOT NULL,
	"sent_recipients" integer DEFAULT 0 NOT NULL,
	"delivered_recipients" integer DEFAULT 0 NOT NULL,
	"read_recipients" integer DEFAULT 0 NOT NULL,
	"replied_recipients" integer DEFAULT 0 NOT NULL,
	"failed_recipients" integer DEFAULT 0 NOT NULL,
	"opted_out_recipients" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"whatsapp_phone_number_id" varchar(100),
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"campaign_recipient_id" uuid,
	"meta_message_id" varchar(200) NOT NULL,
	"status" varchar(20) NOT NULL,
	"error_code" varchar(50),
	"error_message" text,
	"event_timestamp" timestamp with time zone NOT NULL,
	"raw_event_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"campaign_id" uuid,
	"campaign_recipient_id" uuid,
	"whatsapp_phone_number_id" varchar(100),
	"direction" varchar(10) NOT NULL,
	"type" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"meta_message_id" varchar(200),
	"reply_to_meta_message_id" varchar(200),
	"text_content" text,
	"template_name" varchar(512),
	"template_language" varchar(10),
	"template_parameters" jsonb,
	"media_id" varchar(200),
	"media_url" varchar(2048),
	"error_code" varchar(50),
	"error_message" text,
	"sent_by_user_id" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_phone_number_id_whatsapp_phone_numbers_id_fk" FOREIGN KEY ("whatsapp_phone_number_id") REFERENCES "public"."whatsapp_phone_numbers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_message_template_id_message_templates_id_fk" FOREIGN KEY ("message_template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_status_events" ADD CONSTRAINT "message_status_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_status_events" ADD CONSTRAINT "message_status_events_campaign_recipient_id_campaign_recipients_id_fk" FOREIGN KEY ("campaign_recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_recipient_id_campaign_recipients_id_fk" FOREIGN KEY ("campaign_recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_recipients_campaign_contact_idx" ON "campaign_recipients" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_recipients_idempotency_key_idx" ON "campaign_recipients" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_recipients_campaign_status_idx" ON "campaign_recipients" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_recipients_meta_message_id_idx" ON "campaign_recipients" USING btree ("meta_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_template_idx" ON "campaigns" USING btree ("message_template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_created_by_idx" ON "campaigns" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_scheduled_at_idx" ON "campaigns" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_created_at_idx" ON "campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_contact_idx" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_status_events_message_idx" ON "message_status_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_status_events_recipient_idx" ON "message_status_events" USING btree ("campaign_recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_status_events_meta_message_id_idx" ON "message_status_events" USING btree ("meta_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_status_events_event_timestamp_idx" ON "message_status_events" USING btree ("event_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_meta_message_id_idx" ON "messages" USING btree ("meta_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_contact_idx" ON "messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_campaign_idx" ON "messages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_campaign_recipient_idx" ON "messages" USING btree ("campaign_recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_status_idx" ON "messages" USING btree ("status");