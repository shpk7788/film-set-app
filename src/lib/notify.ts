import "server-only";
import { db, schema } from "@/db";

type Tx = Pick<typeof db, "insert">;

/** In-app notifications: one inbox row per recipient. (Web push can be layered on later.) */
export async function notify(
  tx: Tx,
  filmId: string,
  membershipIds: string[],
  n: { type: string; title: string; body?: string; link?: string },
) {
  const unique = [...new Set(membershipIds)];
  if (unique.length === 0) return;
  await tx.insert(schema.notifications).values(
    unique.map((membershipId) => ({
      filmId,
      membershipId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    })),
  );
}
