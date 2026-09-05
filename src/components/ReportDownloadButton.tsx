import { useRef, useState } from "react";
import { ReportDocument } from "@/components/ReportDocument";
import { downloadElementAsPdf } from "@/lib/generate-pdf";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import type { ReportData } from "@/lib/report-constants";
import { toast } from "sonner";

type Props = {
  data: ReportData;
  fileLabel?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
  children?: React.ReactNode;
};

export function ReportDownloadButton({ data, fileLabel, variant = "default", size = "default", children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const name = (fileLabel || data.msr_no || data.client_name || "report")
        .replace(/[^a-z0-9-_ ]/gi, "")
        .trim() || "report";
      await downloadElementAsPdf(ref.current, `MSR_${name}.pdf`);
    } catch (e) {
      toast.error("Could not generate PDF");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={handle} disabled={busy} variant={variant} size={size}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        {children ?? "Download PDF"}
      </Button>
      {/* Offscreen render target for html2canvas */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ReportDocument ref={ref} data={data} />
      </div>
    </>
  );
}
