import Link from "next/link";
import { XCircle } from "lucide-react";

export default function MoneroCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm ph-no-capture">
        <div className="mb-4 flex justify-center">
          <XCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Monero checkout cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Tekir Plus checkout was cancelled. You have not been charged.
        </p>
        <Link
          className="mt-6 inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          href="/settings/account"
        >
          Back to account settings
        </Link>
      </div>
    </div>
  );
}
