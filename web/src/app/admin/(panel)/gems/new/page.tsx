import type { Metadata } from "next";
import Link from "next/link";
import { GemForm } from "../gem-form";

export const metadata: Metadata = { title: "Add gem" };

export default function NewGemPage() {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/gems" className="text-sm text-ink-600 hover:text-ink-900">
        ← Hidden Gems
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-semibold">Add a gem</h1>
      <GemForm />
    </div>
  );
}
