import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SAMA_LOGO_BASE64 } from "@/lib/logo";
import { ShieldCheck, FileText, PenLine, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sama Safety & Security — Sama Portal" },
      {
        name: "description",
        content:
          "Sama Portal — the official platform for Sama Safety & Security technicians to complete fire safety maintenance reports and generate signed PDFs.",
      },
      { property: "og:title", content: "Sama Safety & Security — Sama Portal" },
      {
        property: "og:description",
        content: "Complete fire safety maintenance reports and generate signed PDFs.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  const features = [
    { icon: FileText, title: "Structured reports", desc: "Capture every device check, spare part and action taken." },
    { icon: PenLine, title: "E-signatures", desc: "Employee and client sign on screen — captured into the report." },
    { icon: ShieldCheck, title: "Instant PDF", desc: "Generate the official Maintenance Service Report and download." },
  ];

  const handleSignIn = () => {
    setIsNavigating(true);
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <section className="portal-stage flex flex-1 items-center justify-center px-4 py-16">
        <div className="portal-band" aria-hidden="true" />
        <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border/60 bg-card p-8 text-center shadow-[var(--shadow-elegant)] sm:p-10">
          <div className="mx-auto inline-flex rounded-2xl bg-card p-4 ring-1 ring-border/40">
            <img src={SAMA_LOGO_BASE64} alt="Sama Safety & Security" className="h-24 w-auto" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Sama Portal</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            The official platform for Sama Safety &amp; Security teams to create service reports,
            capture on-screen signatures, schedule recurring visits and download official PDF
            reports in seconds.
          </p>
          <div className="mt-8">
            <Button size="lg" className="w-full sm:w-auto" disabled={isNavigating} onClick={handleSignIn}>
              {isNavigating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In to Continue
            </Button>
          </div>
        </div>
      </section>
      <section className="bg-background px-4 py-14">
        <div className="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border/60 bg-card p-5 text-left shadow-sm"
            >
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="bg-primary py-4 text-center text-xs text-primary-foreground">
        Tel: 00973 17684492 · Email: sama@samasafety.net · www.samasafety.net
      </footer>
    </div>
  );
}


