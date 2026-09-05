import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listCustomers, saveCustomer, deleteCustomer, listAssets, saveAsset, deleteAsset } from "@/lib/crm.functions";
import { statusBadgeClass } from "@/lib/workflow";
import { FilterTable } from "@/components/FilterTable";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
  head: () => ({
    meta: [
      { title: "Customers & Assets | SAMA Fire & Safety" },
      { name: "description", content: "Central customer register and installed fire-safety asset history for SAMA projects." },
      { property: "og:title", content: "Customers & Assets | SAMA Fire & Safety" },
      { property: "og:description", content: "Central customer register and installed fire-safety asset history for SAMA projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const emptyCustomer = {
  name: "", contact_person: "", cr_cpr_number: "", email: "", phone: "", address: "", city: "",
  payment_terms: "", credit_terms: "", notes: "", status: "active" as const,
};

/** Bahrain cities served by SAMA. */
export const BAHRAIN_CITIES = [
  "Manama", "Muharraq", "Riffa", "Hamad Town", "A'ali",
  "Sitra", "Isa Town", "Jidhafs", "Budaiya", "Diraz",
];

const emptyAsset = {
  asset_tag: "", customer_id: "", site_location: "", system_type: "", manufacturer: "",
  model: "", serial_number: "", installation_date: "", warranty_end: "",
  maintenance_frequency_months: "", last_service_date: "", next_service_date: "",
  status: "active", notes: "",
};

function CustomersPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState("customers");
  const [query, setQuery] = useState("");

  const fetchCustomers = useServerFn(listCustomers);
  const fetchAssets = useServerFn(listAssets);
  const save = useServerFn(saveCustomer);
  const remove = useServerFn(deleteCustomer);
  const saveAssetFn = useServerFn(saveAsset);
  const removeAsset = useServerFn(deleteAsset);

  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fetchCustomers() });
  const { data: assets } = useQuery({ queryKey: ["assets"], queryFn: () => fetchAssets() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyCustomer);
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetForm, setAssetForm] = useState<any>(emptyAsset);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  const submitCustomer = async () => {
    try {
      await save({ data: { ...form, id: form.id || undefined } });
      toast.success(form.id ? "Customer updated" : "Customer added");
      setOpen(false);
      setForm(emptyCustomer);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save customer");
    }
  };

  const submitAsset = async () => {
    try {
      await saveAssetFn({
        data: {
          ...assetForm,
          id: assetForm.id || undefined,
          customer_id: assetForm.customer_id || null,
          maintenance_frequency_months: assetForm.maintenance_frequency_months
            ? Number(assetForm.maintenance_frequency_months)
            : null,
        },
      });
      toast.success(assetForm.id ? "Asset updated" : "Asset added");
      setAssetOpen(false);
      setAssetForm(emptyAsset);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save asset");
    }
  };

  const q = query.trim().toLowerCase();
  const customerList = ((customers as any[]) ?? []).filter(
    (c) => !q || [c.name, c.contact_person, c.city, c.phone, c.email].join(" ").toLowerCase().includes(q),
  );
  const assetList = ((assets as any[]) ?? []).filter(
    (a) => !q || [a.asset_tag, a.system_type, a.site_location, a.serial_number].join(" ").toLowerCase().includes(q),
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Customers & Assets</h1>
            <p className="text-sm text-muted-foreground">
              One shared customer register — used by sales, projects, service and accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />
            {tab === "customers" ? (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyCustomer); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New customer</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{form.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Customer name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                    <Field label="Contact person" value={form.contact_person} onChange={(v) => setForm({ ...form, contact_person: v })} />
                    <Field label="CR / CPR number" value={form.cr_cpr_number} onChange={(v) => setForm({ ...form, cr_cpr_number: v })} />
                    <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                    <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                    <div>
                      <Label className="text-xs">City</Label>
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      >
                        <option value="">— select city —</option>
                        {BAHRAIN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        {form.city && !BAHRAIN_CITIES.includes(form.city) && (
                          <option value={form.city}>{form.city}</option>
                        )}
                      </select>
                    </div>
                    
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Complete address</Label>
                      <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitCustomer} disabled={!form.name.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={assetOpen} onOpenChange={(o) => { setAssetOpen(o); if (!o) setAssetForm(emptyAsset); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New asset</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{assetForm.id ? "Edit asset" : "New asset"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Asset tag" value={assetForm.asset_tag} onChange={(v) => setAssetForm({ ...assetForm, asset_tag: v })} />
                    <div>
                      <Label className="text-xs">Customer</Label>
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={assetForm.customer_id}
                        onChange={(e) => setAssetForm({ ...assetForm, customer_id: e.target.value })}
                      >
                        <option value="">— none —</option>
                        {((customers as any[]) ?? []).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <Field label="System type" value={assetForm.system_type} onChange={(v) => setAssetForm({ ...assetForm, system_type: v })} />
                    <Field label="Site location" value={assetForm.site_location} onChange={(v) => setAssetForm({ ...assetForm, site_location: v })} />
                    <Field label="Manufacturer" value={assetForm.manufacturer} onChange={(v) => setAssetForm({ ...assetForm, manufacturer: v })} />
                    <Field label="Model" value={assetForm.model} onChange={(v) => setAssetForm({ ...assetForm, model: v })} />
                    <Field label="Serial number" value={assetForm.serial_number} onChange={(v) => setAssetForm({ ...assetForm, serial_number: v })} />
                    <Field label="Maintenance every (months)" value={assetForm.maintenance_frequency_months} onChange={(v) => setAssetForm({ ...assetForm, maintenance_frequency_months: v })} />
                    <Field label="Installation date" type="date" value={assetForm.installation_date} onChange={(v) => setAssetForm({ ...assetForm, installation_date: v })} />
                    <Field label="Warranty end" type="date" value={assetForm.warranty_end} onChange={(v) => setAssetForm({ ...assetForm, warranty_end: v })} />
                    <Field label="Last service" type="date" value={assetForm.last_service_date} onChange={(v) => setAssetForm({ ...assetForm, last_service_date: v })} />
                    <Field label="Next service" type="date" value={assetForm.next_service_date} onChange={(v) => setAssetForm({ ...assetForm, next_service_date: v })} />
                  </div>
                  <DialogFooter>
                    <Button onClick={submitAsset} disabled={!assetForm.asset_tag.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "customers", label: `Customers (${customerList.length})` },
            { value: "assets", label: `Assets (${assetList.length})` },
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab === "customers" && (
            <FilterTable
              rows={customerList}
              empty="No customers yet."
              columns={[
                { key: "customer_number", header: "Customer no.", value: (c: any) => c.customer_number },
                { key: "name", header: "Customer name", value: (c: any) => c.name },
                { key: "contact_person", header: "Contact person", value: (c: any) => c.contact_person },
                { key: "cr_cpr_number", header: "CR / CPR", value: (c: any) => c.cr_cpr_number },
                { key: "email", header: "Email", value: (c: any) => c.email },
                { key: "phone", header: "Phone", value: (c: any) => c.phone },
                { key: "city", header: "City", value: (c: any) => c.city },
                { key: "address", header: "Address", value: (c: any) => c.address },
                {
                  key: "status", header: "Status", value: (c: any) => c.status,
                  cell: (c: any) => (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(c.status)}`}>{c.status}</span>
                  ),
                },
              ]}
              actions={(c: any) => (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setForm({ ...emptyCustomer, ...c }); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try { await remove({ data: { id: c.id } }); refresh(); toast.success("Customer deleted"); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            />
          )}

          {tab === "assets" &&
            assetList.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{a.asset_tag}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(a.status)}`}>{a.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[a.customers?.name, a.system_type, a.site_location].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {a.next_service_date && (
                      <p className="text-xs text-muted-foreground">Next service: {a.next_service_date}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setAssetForm({ ...emptyAsset, ...a, customer_id: a.customer_id ?? "", maintenance_frequency_months: a.maintenance_frequency_months ?? "" }); setAssetOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try { await removeAsset({ data: { id: a.id } }); refresh(); toast.success("Asset deleted"); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

          {tab === "assets" && assetList.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
