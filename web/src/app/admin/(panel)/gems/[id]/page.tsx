import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { GemForm, type GemRow } from "../gem-form";

export const metadata: Metadata = { title: "Edit gem" };

export default function GemPage({ params }: PageProps<"/admin/gems/[id]">) {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/gems" className="text-sm text-ink-600 hover:text-ink-900">
        ← Hidden Gems
      </Link>
      <Suspense fallback={<p className="mt-6 text-sm text-ink-500">Loading…</p>}>
        <GemEditor params={params} />
      </Suspense>
    </div>
  );
}

async function GemEditor({ params }: { params: PageProps<"/admin/gems/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  const supabase = await requireAdmin();
  const { data: gem } = await supabase.from("gems").select("*").eq("id", id).maybeSingle<GemRow>();
  if (!gem) {
    notFound();
  }
  return (
    <>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">
        {gem.name_en} <span className="font-normal text-ink-500">· {gem.name_th}</span>
      </h1>
      <GemForm gem={gem} />
    </>
  );
}
