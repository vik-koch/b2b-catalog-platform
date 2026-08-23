ALTER TABLE "products" ADD COLUMN "lineNoteEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lineNotePrompt" varchar(200);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_line_note_prompt_needs_note" CHECK ("products"."lineNotePrompt" is null or "products"."lineNoteEnabled");