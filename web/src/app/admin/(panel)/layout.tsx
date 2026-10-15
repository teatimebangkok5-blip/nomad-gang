import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "../login/actions";

// Static shell for every admin page. Session checks happen inside each page (behind loading.tsx),
// never at the top of this layout, so the shell can render instantly.
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin/venues" className="text-base font-semibold text-ink-900">
              Table<span className="text-brand-600">Meet</span>
              <span className="ml-2 text-xs font-medium text-ink-500">Admin</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin/venues" className="font-medium text-ink-700 hover:text-brand-700">
                Venues
              </Link>
            </nav>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-sm text-ink-600 hover:text-ink-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
