import { createFileRoute } from "@tanstack/react-router";
import { PROTOCOL_VERSION } from "@pfa/protocol";
import { AppearanceControls } from "../components/appearance";
import { Amount } from "../components/amount";
import { HideAmountsToggle } from "../components/hide-amounts";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Personal finance</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Protocol v{PROTOCOL_VERSION}. Design foundation preview.
        </p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="amounts">
        <h2 id="amounts" className="mb-3 font-medium">
          Amounts
        </h2>
        <ul className="flex flex-col gap-2">
          <li className="flex justify-between">
            <span>Warung Bu Sari</span>
            <Amount direction="expense" variant="list" formatted="Rp 25.000" />
          </li>
          <li className="flex justify-between">
            <span>Salary</span>
            <Amount direction="income" variant="list" formatted="Rp 8.000.000" />
          </li>
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span>Spent this month</span>
          <Amount direction="expense" variant="total" formatted="Rp 1.250.000" />
        </div>
        <div className="mt-3">
          <HideAmountsToggle />
        </div>
      </section>

      <section
        className="rounded-xl border border-line bg-surface p-4"
        aria-labelledby="appearance"
      >
        <h2 id="appearance" className="mb-3 font-medium">
          Appearance
        </h2>
        <AppearanceControls />
        <p className="mt-4">
          <span className="inline-block rounded-md bg-danger px-2 py-1 text-sm text-on-danger">
            Overdue
          </span>
        </p>
      </section>
    </main>
  );
}
