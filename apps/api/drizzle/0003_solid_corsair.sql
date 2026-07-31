CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_account_id" uuid NOT NULL,
	"meta_template_id" varchar(100) NOT NULL,
	"name" varchar(512) NOT NULL,
	"language" varchar(10) NOT NULL,
	"category" varchar(30) NOT NULL,
	"status" varchar(20) NOT NULL,
	"quality_score" varchar(20),
	"rejection_reason" text,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_meta_payload" jsonb,
	"blocked_at" timestamp with time zone,
	"meta_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "templates_last_synced_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_whatsapp_account_id_whatsapp_accounts_id_fk" FOREIGN KEY ("whatsapp_account_id") REFERENCES "public"."whatsapp_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_account_meta_idx" ON "message_templates" USING btree ("whatsapp_account_id","meta_template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_templates_status_idx" ON "message_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_templates_account_idx" ON "message_templates" USING btree ("whatsapp_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_templates_updated_at_idx" ON "message_templates" USING btree ("updated_at");