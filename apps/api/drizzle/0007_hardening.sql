CREATE TABLE IF NOT EXISTS "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(40) NOT NULL,
	"filters" jsonb,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"file_name" varchar(255),
	"total_rows" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"download_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_jobs_created_by_idx" ON "export_jobs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_jobs_type_status_idx" ON "export_jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_jobs_created_at_idx" ON "export_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_recipients_failure_code_idx" ON "campaign_recipients" USING btree ("failure_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_assignments_created_at_idx" ON "conversation_assignments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "users";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "contacts";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contacts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "contact_lists";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "contact_lists" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "tags";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "tags" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "settings";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "settings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "whatsapp_accounts";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "whatsapp_accounts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "whatsapp_phone_numbers";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "whatsapp_phone_numbers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "message_templates";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "message_templates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "campaigns";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "campaigns" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "campaign_recipients";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "campaign_recipients" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "conversations";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "conversations" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "internal_notes";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "internal_notes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "quick_replies";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "quick_replies" FOR EACH ROW EXECUTE FUNCTION set_updated_at();