import { createFileRoute } from "@tanstack/react-router";
import { PROTOCOL_VERSION } from "@pfa/protocol";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Personal finance</h1>
      <p className="mt-2 text-sm">Protocol v{PROTOCOL_VERSION}. App shell placeholder.</p>
    </main>
  );
}
