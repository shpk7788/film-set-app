import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createFilm } from "@/app/actions/owner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Row } from "@/components/ui";
import { db, schema } from "@/db";
import { getSession } from "@/lib/session";

export const metadata = { title: "Company · Film Set" };

export default async function OwnerPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.ownerPersonId, s.person.id)).limit(1);
  if (!company) notFound();
  const films = await db.select().from(schema.films).where(eq(schema.films.companyId, company.id));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-ground px-5 py-6">
      <Link href="/films" className="text-[15px] font-bold text-everyone">
        ← Your movies
      </Link>
      <h1 className="text-[24px] font-extrabold">{company.name}</h1>
      <Card>
        <p className="mb-1 text-sm font-bold uppercase text-muted">Films</p>
        {films.map((f) => (
          <Row key={f.id} left={f.title} right={<span className="text-sm text-muted">{f.status}</span>} />
        ))}
      </Card>
      <Card>
        <h2 className="mb-4 text-[18px] font-extrabold">Create a new film</h2>
        <ActionForm action={createFilm}>
          <Field label="Film title" name="title" required />
          <Field label="Producer's name" name="producerName" hint="They get a sign-up code to join as producer" />
          <label className="flex min-h-11 items-center gap-3 text-[16px]">
            <input type="checkbox" name="ownerIsProducer" className="h-6 w-6" /> I am the producer on this film
          </label>
          <SubmitButton>Create film</SubmitButton>
        </ActionForm>
      </Card>
    </main>
  );
}
