import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { UserSearch } from "./users-admin";

export const metadata: Metadata = { title: "Users" };

// Users: find a person and delete their account, for deletion requests sent by email (the public "Delete account"
// page says people who can't use the app can ask that way).
export default function UsersAdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        When someone emails asking to delete their account, check that the email came from the same address as their
        account (shown next to their name), then delete it here. It does the same as &ldquo;Delete account&rdquo; in
        the app: their photos, messages, trips and profile are deleted; tables and hangouts they host that others joined
        pass to another member (cancelled if still upcoming). Reply to confirm within 30 days.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading…</p>}>
        <Search />
      </Suspense>
    </div>
  );
}

async function Search() {
  await connection();
  await requireAdmin();
  return <UserSearch />;
}
