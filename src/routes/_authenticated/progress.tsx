import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { Card, CardContent } from "@/components/ui/card";
import { listProjects } from "@/lib/projects.functions";
import { humanize, statusBadgeClass } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
  head: () => ({
    meta: [
      { title: "Project Progress | SAMA Fire & Safety" },
      { name: "description", content: "Live completion progress for every SAMA project, with stage, customer and site location at a glance." },
      { property: "og:title", content: "Project Progress | SAMA Fire & Safety" },
      { property: "og:description", content: "Live completion progress for every SAMA project, with stage, customer and site location at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProgressPage() {
  const { data: profile } = useProfile();
  const [query, setQuery] = useState("");
  const fetchProjects = useServerFn(listProjects);
  const { data } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });

  const term = query.trim().toLowerCase();
  const projects = ((data as any[]) ?? []).filter((p) =>
    !term ||
    [p.project_number, p.name, p.site_location, p.customers?.name]
      .filter(Boolean)
      .some((v: string) => String(v).toLowerCase().includes(term)),
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={!!profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Progress</h1>
            <p className="text-sm text-muted-foreground">
              How far every project has moved on site.
            </p>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search projects…" />
        </div>

        <div className="space-y-3">
          {projects.map((p) => {
            const pct = Math.max(0, Math.min(100, Number(p.progress_percent ?? 0)));
            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{p.project_number} — {p.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(p.stage)}`}>
                      {humanize(p.stage)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {p.customers?.name ?? "—"}
                    {p.site_location ? ` · ${p.site_location}` : ""}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs font-medium">{pct}%</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {projects.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No projects yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
