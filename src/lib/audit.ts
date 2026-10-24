import "server-only";
import { db, schema } from "@/db";

type Tx = Pick<typeof db, "insert">;

export async function audit(
  tx: Tx,
  entry: {
    filmId: string | null;
    actorPersonId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(schema.auditLog).values({
    filmId: entry.filmId,
    actorPersonId: entry.actorPersonId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
