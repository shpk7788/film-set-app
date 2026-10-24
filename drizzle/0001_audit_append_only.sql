-- The audit log is append-only: nobody (including the app) may change or delete history.
CREATE OR REPLACE FUNCTION audit_log_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();
--> statement-breakpoint
-- Locked crew lists cannot have their entries changed (only an EP reopen, which flips status first).
CREATE OR REPLACE FUNCTION crew_entries_block_when_locked() RETURNS trigger AS $$
DECLARE s crew_list_status;
BEGIN
  SELECT status INTO s FROM crew_lists WHERE id = COALESCE(NEW.crew_list_id, OLD.crew_list_id);
  IF s = 'locked' THEN
    RAISE EXCEPTION 'crew list is locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER crew_entries_locked BEFORE INSERT OR UPDATE OR DELETE ON crew_entries
  FOR EACH ROW EXECUTE FUNCTION crew_entries_block_when_locked();
