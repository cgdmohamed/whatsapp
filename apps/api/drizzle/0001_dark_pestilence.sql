CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) DEFAULT 'whatsapp' NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"deduplication_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean DEFAULT true NOT NULL,
	"processing_status" varchar(20) DEFAULT 'RECEIVED' NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"correlation_id" varchar(64),
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100),
	"meta_business_account_id" varchar(100),
	"waba_id" varchar(100) NOT NULL,
	"app_id" varchar(100),
	"encrypted_access_token" text NOT NULL,
	"access_token_last_four" varchar(4) NOT NULL,
	"token_updated_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'DISCONNECTED' NOT NULL,
	"last_connection_test_at" timestamp with time zone,
	"last_connection_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"phone_number_id" varchar(100) NOT NULL,
	"display_phone_number" varchar(50),
	"verified_name" varchar(100),
	"quality_rating" varchar(20),
	"messaging_limit_tier" varchar(20),
	"status" varchar(20),
	"is_default" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_phone_numbers" ADD CONSTRAINT "whatsapp_phone_numbers_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_deduplication_key_idx" ON "webhook_events" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_processing_status_idx" ON "webhook_events" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_received_at_idx" ON "webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_accounts_waba_id_idx" ON "whatsapp_accounts" USING btree ("waba_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_phone_numbers_account_number_idx" ON "whatsapp_phone_numbers" USING btree ("whatsapp_account_id","phone_number_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_phone_numbers_account_idx" ON "whatsapp_phone_numbers" USING btree ("whatsapp_account_id");