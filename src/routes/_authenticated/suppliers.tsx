import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Truck, Pencil, Trash2 } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listSuppliers, saveSupplier, deleteSupplier } from "@/lib/finance.functions";
import { hasDept, humanize, statusBadgeClass } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/suppliers")({
  component: SuppliersPage,
  head: () => ({
    meta: [
      { title: "Suppliers | SAMA Fire & Safety" },
      { name: "description", content: "Register fire and safety material suppliers, send them for management approval and keep the approved supplier list live for restocking." },
      { property: "og:title", content: "Suppliers | SAMA Fire & Safety" },
      { property: "og:description", content: "Register fire and safety material suppliers, send them for management approval and keep the approved supplier list live for restocking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const empty = {
  id: "", name: "", contact_person: "", email: "", phone: "",
  address: "", payment_terms: "", notes: "",
};

function SuppliersPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const isAdmin = !!profile?.isAdmin;
  const canManage = isAdmin || hasDept(profile?.roles, "project_manager") || hasDept(profile?.roles, "accounts");

  const fetchSuppliers = useServerFn(listSuppliers);
  const persist = useServerFn(saveSupplier);
  const remove = useServerFn(deleteSupplier);

  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchSuppliers() });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = ((suppliers as any[]) ?? []);
    if (!q) return all;
    return all.filter((s) =>
      [s.name, s.contact_person, s.email, s.phone, s.address].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [suppliers, query]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["suppliers"] });

  const submit = async () => {
    try {
      await persist({
        data: {
          id: form.id || undefined,
          name: form.name,
          contact_person: form.contact_person,
          email: form.email,
          phone: form.phone,
          address: form.address,
          payment_terms: form.payment_terms,
          notes: form.notes,
          status: "active" as const,
        },
      });
      toast.success(isAdmin ? "Supplier saved" : "Supplier sent to Management for approval");
      setOpen(false);
      setForm(empty);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the supplier");
    }
  };

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Suppliers</h1>
            <p className="text-sm text-muted-foreground">
              New suppliers go live only after Management approves them.
            </p>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New supplier</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader><DialogTitle>{form.id ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Supplier name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <Field label="Contact person" value={form.contact_person} onChange={(v) => setForm({ ...form, contact_person: v })} />
                  <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                  <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
                  <Field label="Payment terms" value={form.payment_terms} onChange={(v) => setForm({ ...form, payment_terms: v })} />
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={submit} disabled={!form.name.trim()}>
                    {form.id || isAdmin ? "Save" : "Save & send for approval"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="mb-4 sm:max-w-xl">
          <SearchInput value={query} onChange={setQuery} placeholder="Search suppliers…" />
        </div>

        <div className="space-y-3">
          {rows.map((s: any) => {
            const state = s.approval_status ?? "approved";
            return (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(state)}`}>
                        {humanize(state)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[s.contact_person, s.phone, s.email, s.address].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {s.payment_terms && <p className="text-xs text-muted-foreground">Terms: {s.payment_terms}</p>}
                  </div>
                  <div className="flex gap-2">
                    {(isAdmin || (canManage && state !== "approved")) && (
                      <Button variant="outline" size="sm" onClick={() => { setForm({ ...empty, ...s }); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="outline" size="sm" onClick={async () => {
                        try { await remove({ data: { id: s.id } }); toast.success("Supplier deleted"); refresh(); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {rows.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Truck className="mx-auto mb-2 h-8 w-8" />
              No supplier yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
