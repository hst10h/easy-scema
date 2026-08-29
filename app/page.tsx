"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowDownToLine, Check, ChevronRight, CircleAlert, FileSpreadsheet, FileText, LayoutDashboard, Plus, Settings, Sparkles, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type Step = "template" | "upload" | "review";
type View = "extract" | "jobs" | "templates" | "settings";
type Field = { key: string; label: string };
type Source = { file: string; sheet?: string; row?: number; original?: string };
type FieldSource = { text?: string; page?: number | null; confidence?: number };
type Row = Record<string, string> & { _source: Source; _fieldSources?: Record<string, FieldSource> };

const defaultFields: Field[] = [
  { key: "supplier", label: "Supplier" }, { key: "sku", label: "SKU" },
  { key: "description", label: "Description" }, { key: "moq", label: "MOQ" },
  { key: "unit_price", label: "Unit Price" }, { key: "currency", label: "Currency" },
  { key: "lead_time", label: "Lead Time" },
];

const demoRows: Row[] = [
  { supplier: "An Phát Components", sku: "AP-1042", description: "Aluminium enclosure, IP65", moq: "500", unit_price: "2.35", currency: "USD", lead_time: "14 days", _source: { file: "quote_anphat.pdf", row: 8, original: "AP-1042 · MOQ 500 · USD 2.35 / pc · 14 days" } },
  { supplier: "Shenzhen Lianhe", sku: "LH-778", description: "USB-C cable, braided, 1m", moq: "1000", unit_price: "1.18", currency: "USD", lead_time: "21 days", _source: { file: "supplier_lianhe.xlsx", sheet: "Quotation", row: 12, original: "LH-778 | 1,000 pcs | US$1.18 | 21 days" } },
  { supplier: "Minh Long Industrial", sku: "ML-330A", description: "Stainless steel hinge 40mm", moq: "", unit_price: "0.86", currency: "USD", lead_time: "18 days", _source: { file: "scan_quotation_04.jpg", original: "ML-330A  Stainless hinge 40mm  USD 0.86  Delivery: 18 days" } },
];

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function Home() {
  const [view, setView] = useState<View>("extract");
  const [step, setStep] = useState<Step>("template");
  const [fields, setFields] = useState<Field[]>(defaultFields);
  const [templateName, setTemplateName] = useState("Supplier Quotation");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<{ row: number; key: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const templateInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const warnings = useMemo(() => rows.reduce((sum, row) => sum + fields.filter((field) => !row[field.key]?.trim()).length, 0), [rows, fields]);

  useEffect(() => {
    const saved = sessionStorage.getItem("structflow_gemini_key") ?? "";
    const timer = window.setTimeout(() => {
      setGeminiKey(saved);
      setKeySaved(Boolean(saved));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function parseWorkbook(file: File) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
    return { values, sheetName };
  }

  async function handleTemplate(file?: File) {
    if (!file) return;
    try {
      const { values } = await parseWorkbook(file);
      const header = (values[0] ?? []).map(String).filter(Boolean);
      if (!header.length) throw new Error();
      setFields(header.map((label) => ({ label, key: normalizeKey(label) || `field_${crypto.randomUUID()}` })));
      setTemplateName(file.name.replace(/\.[^.]+$/, ""));
      toast.success(`Đã đọc ${header.length} cột từ template`);
    } catch { toast.error("Không đọc được template. Hãy kiểm tra dòng header đầu tiên."); }
  }

  async function startExtraction() {
    if (!files.length) return toast.error("Hãy chọn ít nhất một file đầu vào");
    setProcessing(true);
    const output: Row[] = [];
    for (const file of files) {
      if (/\.(xlsx?|csv)$/i.test(file.name)) {
        try {
          const { values, sheetName } = await parseWorkbook(file);
          const header = (values[0] ?? []).map((value) => normalizeKey(String(value)));
          for (let index = 1; index < values.length; index += 1) {
            const sourceRow = values[index] ?? [];
            if (!sourceRow.some((value) => String(value).trim())) continue;
            const row = { _source: { file: file.name, sheet: sheetName, row: index + 1 } } as Row;
            fields.forEach((field) => {
              const exact = header.indexOf(field.key);
              const sourceIndex = exact >= 0 ? exact : header.findIndex((key) => key && (key.includes(field.key) || field.key.includes(key)));
              row[field.key] = sourceIndex >= 0 ? String(sourceRow[sourceIndex] ?? "") : "";
            });
            output.push(row);
          }
        } catch { /* keep going; never invent values */ }
      } else {
        try {
          const body = new FormData();
          body.append("file", file);
          body.append("fields", JSON.stringify(fields));
          const response = await fetch("/api/extract", { method: "POST", body, headers: geminiKey ? { "x-gemini-api-key": geminiKey } : undefined });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Extraction failed");
          for (const record of result.records ?? []) {
            const row = { _source: { file: file.name }, _fieldSources: {} } as Row;
            fields.forEach((field) => {
              const extracted = record[field.key];
              row[field.key] = extracted?.value == null ? "" : String(extracted.value);
              row._fieldSources![field.key] = { text: extracted?.source_text, page: extracted?.page, confidence: extracted?.confidence };
            });
            output.push(row);
          }
        } catch (error) {
          setProcessing(false);
          toast.error(error instanceof Error ? error.message : `Không thể xử lý ${file.name}`);
          return;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    setRows(output);
    setProcessing(false);
    setStep("review");
    toast.success(`Đã chuẩn hóa ${output.length} dòng dữ liệu`);
  }

  function useDemo() { setFiles([]); setRows(demoRows.map((row) => ({ ...row }))); setStep("review"); toast.success("Đã mở bộ dữ liệu mẫu"); }
  function updateCell(rowIndex: number, key: string, value: string) { setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row)); }
  function exportExcel() {
    const data = rows.map((row) => Object.fromEntries(fields.map((field) => [field.label, row[field.key] ?? ""])));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data, { header: fields.map((field) => field.label) });
    worksheet["!cols"] = fields.map((field) => ({ wch: Math.max(14, field.label.length + 3) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, templateName.slice(0, 31) || "Structured Data");
    XLSX.writeFile(workbook, `${normalizeKey(templateName) || "structflow_export"}.xlsx`);
    toast.success("Đã xuất file Excel");
  }

  function saveGeminiKey() {
    const key = geminiKey.trim();
    if (!key) return toast.error("Hãy nhập Gemini API key");
    sessionStorage.setItem("structflow_gemini_key", key);
    setGeminiKey(key);
    setKeySaved(true);
    toast.success("Đã lưu API key cho tab này");
  }

  async function testGeminiKey() {
    const key = geminiKey.trim();
    if (!key) return toast.error("Hãy nhập Gemini API key");
    setTestingKey(true);
    try {
      const response = await fetch("/api/gemini/test", { method: "POST", headers: { "x-gemini-api-key": key } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "API key không hợp lệ");
      sessionStorage.setItem("structflow_gemini_key", key);
      setKeySaved(true);
      toast.success("Kết nối Gemini thành công");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể kiểm tra API key"); }
    finally { setTestingKey(false); }
  }

  function removeGeminiKey() {
    sessionStorage.removeItem("structflow_gemini_key");
    setGeminiKey("");
    setKeySaved(false);
    toast.success("Đã xóa API key khỏi tab này");
  }

  const activeSource = selected ? rows[selected.row]?._source : null;
  const activeFieldSource = selected ? rows[selected.row]?._fieldSources?.[selected.key] : null;
  const stepTitle = step === "template" ? "Define output" : step === "upload" ? "Upload files" : "Review data";
  const pageTitle = view === "extract" ? stepTitle : view === "jobs" ? "Jobs" : view === "templates" ? "Templates" : "Settings";
  const navClass = (item: View) => `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition ${view === item ? "bg-[#e9eee9] font-medium text-[#164c3a]" : "text-[#6b746e] hover:bg-[#f0f3ef] hover:text-[#2c4d3e]"}`;

  function openNewExtraction() {
    setView("extract");
    setStep("template");
    setSelected(null);
  }

  return <div className="min-h-screen bg-[#f6f7f5] text-[#19201c]">
    <Toaster position="top-center" richColors />
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[238px] border-r border-[#dfe3de] bg-[#f9faf8] p-5 lg:flex lg:flex-col">
      <div className="flex items-center gap-2.5 px-2 py-2"><div className="grid size-8 place-items-center rounded-lg bg-[#164c3a] text-white"><Sparkles className="size-4" /></div><span className="text-[17px] font-semibold tracking-[-0.02em]">StructFlow</span><Badge variant="secondary" className="ml-auto rounded-md bg-[#e6eee9] text-[10px] text-[#32614e]">MVP</Badge></div>
      <nav className="mt-9 space-y-1 text-sm"><button onClick={openNewExtraction} className={navClass("extract")}><Plus className="size-4" /> New extraction</button><button onClick={() => setView("jobs")} className={navClass("jobs")}><LayoutDashboard className="size-4" /> Jobs</button><button onClick={() => setView("templates")} className={navClass("templates")}><FileSpreadsheet className="size-4" /> Templates</button></nav>
      <div className="mt-auto rounded-xl border border-[#dfe3de] bg-white p-4"><div className="flex items-center justify-between text-xs"><span className="font-medium">Free credits</span><span className="text-[#6b746e]">38 / 50</span></div><Progress value={76} className="mt-3 h-1.5 bg-[#e6e9e5] [&>div]:bg-[#e09b3d]" /><p className="mt-3 text-[11px] leading-4 text-[#7b837e]">12 pages available this month</p></div>
      <button onClick={() => setView("settings")} className={`mt-3 ${navClass("settings")}`}><Settings className="size-4" /> Settings</button>
    </aside>

    <main className="lg:pl-[238px]">
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-[#dfe3de] bg-[#f6f7f5]/90 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-2 text-sm text-[#78817b]"><span>StructFlow</span><ChevronRight className="size-3.5" /><span className="font-medium text-[#28312c]">{pageTitle}</span></div><div className="ml-auto hidden items-center gap-2 md:flex"><Sparkles className="size-4 text-[#3f725b]" /><span className="text-xs text-[#66716a]">Powered by Gemini</span></div></header>
      <div className="mx-auto max-w-[1220px] px-5 py-8 md:px-8 md:py-11">
        {view === "extract" && <>
        <div className="mb-8 flex items-center gap-3">{[["1", "Output"], ["2", "Files"], ["3", "Review"]].map(([number, label], index) => { const activeIndex = step === "template" ? 0 : step === "upload" ? 1 : 2; return <div className="flex flex-1 items-center gap-3" key={number}><div className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${index <= activeIndex ? "bg-[#164c3a] text-white" : "border border-[#cfd5cf] text-[#89918c]"}`}>{index < activeIndex ? <Check className="size-3.5" /> : number}</div><span className={`hidden text-xs font-medium sm:block ${index <= activeIndex ? "text-[#28312c]" : "text-[#929994]"}`}>{label}</span>{index < 2 && <div className="h-px flex-1 bg-[#d9ded9]" />}</div>; })}</div>

        {step === "template" && <section className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3d725c]">Step 01</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-[40px]">Dữ liệu đầu ra trông như thế nào?</h1><p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#6f7872]">Tải bảng mẫu bạn đang dùng. StructFlow sẽ lấy tên cột và thứ tự cột làm schema — bạn không cần viết prompt.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-[1.25fr_.75fr]">
            <button onClick={() => templateInput.current?.click()} className="group min-h-64 rounded-2xl border border-[#b9cfc4] bg-[#eef5f1] p-8 text-left transition hover:border-[#4c806a] hover:bg-[#e9f2ed]"><input ref={templateInput} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(event) => handleTemplate(event.target.files?.[0])} /><div className="grid size-11 place-items-center rounded-xl bg-[#164c3a] text-white"><UploadCloud className="size-5" /></div><h2 className="mt-7 text-xl font-semibold">Upload Excel / CSV template</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#64716a]">Dòng đầu tiên sẽ trở thành cấu trúc output. Hỗ trợ XLSX, XLS và CSV.</p><span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[#2e6a51]">Chọn file <ChevronRight className="size-4 transition group-hover:translate-x-1" /></span></button>
            <div className="rounded-2xl border border-[#dfe3de] bg-white p-6"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.12em] text-[#7b837e]">Schema preview</span><Badge className="bg-[#edf4ef] text-[#32614e] hover:bg-[#edf4ef]">{fields.length} fields</Badge></div><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="mt-5 border-0 border-b border-[#dfe3de] bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0" /><div className="mt-4 max-h-36 space-y-1.5 overflow-auto pr-1">{fields.map((field, index) => <div key={field.key} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"><span className="w-4 text-[11px] text-[#a0a7a2]">{String(index + 1).padStart(2, "0")}</span><span>{field.label}</span></div>)}</div><Button onClick={() => setStep("upload")} className="mt-5 w-full bg-[#164c3a] hover:bg-[#113e2f]">Use this schema <ChevronRight className="size-4" /></Button></div>
          </div><button onClick={useDemo} className="mx-auto mt-6 block text-sm font-medium text-[#3c6e59] underline underline-offset-4">Hoặc mở dữ liệu mẫu để xem review</button>
        </section>}

        {step === "upload" && <section className="mx-auto max-w-4xl">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3d725c]">Step 02</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-[40px]">Thả các file lộn xộn vào đây.</h1><p className="mt-3 text-[15px] text-[#6f7872]">Excel và CSV được xử lý trực tiếp. PDF/ảnh được giữ lại cho bước review, không tự đoán dữ liệu thiếu.</p></div><Badge variant="outline" className="hidden shrink-0 md:flex">{fields.length} output fields</Badge></div>
          <button onClick={() => documentInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFiles((current) => [...current, ...Array.from(event.dataTransfer.files)]); }} className="mt-8 grid min-h-64 w-full place-items-center rounded-2xl border border-dashed border-[#9bb5a8] bg-white p-8 text-center transition hover:bg-[#fbfdfb]"><input ref={documentInput} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv" onChange={(event) => setFiles((current) => [...current, ...Array.from(event.target.files ?? [])])} /><div><div className="mx-auto grid size-12 place-items-center rounded-full bg-[#e8f1ec] text-[#2d674e]"><UploadCloud className="size-5" /></div><p className="mt-4 font-semibold">Drop PDF, images, Excel or CSV</p><p className="mt-1 text-sm text-[#848c87]">hoặc click để chọn · tối đa 100 file</p></div></button>
          {!!files.length && <div className="mt-5 rounded-xl border border-[#dfe3de] bg-white"><div className="flex items-center justify-between border-b border-[#e5e8e4] px-5 py-3"><span className="text-sm font-semibold">{files.length} files ready</span><button onClick={() => setFiles([])} className="text-xs text-[#a34c43]">Remove all</button></div>{files.map((file, index) => { const Icon = /\.(xlsx?|csv)$/i.test(file.name) ? FileSpreadsheet : FileText; return <div key={`${file.name}-${index}`} className="flex items-center gap-3 border-b border-[#eff1ee] px-5 py-3 last:border-0"><Icon className="size-4 text-[#42735e]" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><span className="text-xs text-[#929994]">{Math.max(.1, file.size / 1024 / 1024).toFixed(1)} MB</span><button aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X className="size-4 text-[#9ba29d]" /></button></div>; })}</div>}
          <div className="mt-6 flex items-center justify-between"><Button variant="ghost" onClick={() => setStep("template")}>Back</Button><Button disabled={!files.length || processing} onClick={startExtraction} className="bg-[#164c3a] px-6 hover:bg-[#113e2f]">{processing ? "Processing…" : "Start extraction"}<Sparkles className="size-4" /></Button></div>
        </section>}

        {step === "review" && <section>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3d725c]">Step 03</p><Badge variant={warnings ? "outline" : "secondary"} className={warnings ? "border-[#edc589] bg-[#fff7e8] text-[#9b641f]" : "bg-[#eaf4ee] text-[#32614e]"}>{warnings ? `${warnings} fields need review` : "Ready to export"}</Badge></div><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-[40px]">Chỉ sửa những gì cần sửa.</h1><p className="mt-2 text-sm text-[#727b75]">Click vào bất kỳ ô nào để xem nguồn. Ô trống luôn được đánh dấu — StructFlow không tự bịa dữ liệu.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setStep("upload")}>Add files</Button><Button onClick={exportExcel} className="bg-[#164c3a] hover:bg-[#113e2f]"><ArrowDownToLine className="size-4" /> Export Excel</Button></div></div>
          <div className={`mt-8 grid gap-4 ${selected ? "xl:grid-cols-[minmax(0,1fr)_310px]" : "grid-cols-1"}`}>
            <div className="overflow-hidden rounded-xl border border-[#d9ded9] bg-white"><div className="flex items-center justify-between border-b border-[#e4e7e3] px-5 py-3"><div className="flex items-center gap-2"><FileSpreadsheet className="size-4 text-[#3f725b]" /><span className="text-sm font-semibold">{templateName}</span></div><span className="text-xs text-[#89918c]">{rows.length} rows · {fields.length} columns</span></div><div className="overflow-auto"><Table><TableHeader><TableRow className="bg-[#f7f8f6] hover:bg-[#f7f8f6]"><TableHead className="sticky left-0 z-10 w-12 bg-[#f7f8f6] text-center">#</TableHead>{fields.map((field) => <TableHead key={field.key} className="min-w-36 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[.08em] text-[#657069]">{field.label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, rowIndex) => <TableRow key={rowIndex} className="group"><TableCell className="sticky left-0 z-10 bg-white text-center text-xs text-[#9aa19c] group-hover:bg-[#fafbf9]">{rowIndex + 1}</TableCell>{fields.map((field) => { const missing = !row[field.key]?.trim(); const isActive = selected?.row === rowIndex && selected?.key === field.key; return <TableCell key={field.key} onClick={() => setSelected({ row: rowIndex, key: field.key })} className={`relative p-1 ${isActive ? "bg-[#edf5f0]" : ""}`}><Input aria-label={`${field.label}, row ${rowIndex + 1}`} value={row[field.key] ?? ""} placeholder="Missing" onFocus={() => setSelected({ row: rowIndex, key: field.key })} onChange={(event) => updateCell(rowIndex, field.key, event.target.value)} className={`h-9 border-transparent bg-transparent px-2 text-sm shadow-none focus-visible:border-[#7aa08e] focus-visible:ring-2 focus-visible:ring-[#d9e8e0] ${missing ? "placeholder:text-[#b06b42]" : ""}`} />{missing && <CircleAlert className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-[#d48947]" />}</TableCell>; })}</TableRow>)}</TableBody></Table></div></div>
            {selected && <aside className="h-fit rounded-xl border border-[#d9ded9] bg-white"><div className="flex items-center justify-between border-b border-[#e4e7e3] px-5 py-4"><span className="text-sm font-semibold">Source reference</span><button onClick={() => setSelected(null)} aria-label="Close source panel"><X className="size-4 text-[#8b938e]" /></button></div><div className="space-y-5 p-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#929994]">Selected field</p><p className="mt-1 text-sm font-medium">{fields.find((field) => field.key === selected.key)?.label}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#929994]">Document</p><div className="mt-2 flex items-center gap-2 rounded-lg bg-[#f4f6f3] p-3"><FileText className="size-4 text-[#3f725b]" /><span className="min-w-0 truncate text-sm">{activeSource?.file}</span></div></div>{(activeSource?.sheet || activeFieldSource?.page) && <div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#929994]">Location</p><p className="mt-1 text-sm">{activeSource?.sheet ? `Sheet “${activeSource.sheet}” · row ${activeSource.row}` : `Page ${activeFieldSource?.page}`}</p></div>}{(activeSource?.original || activeFieldSource?.text) && <div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#929994]">Original text</p><blockquote className="mt-2 border-l-2 border-[#8db29f] pl-3 text-sm leading-6 text-[#59635d]">{activeFieldSource?.text || activeSource?.original}</blockquote></div>}{activeFieldSource?.confidence != null && <div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#929994]">Confidence</p><div className="mt-2 flex items-center gap-3"><Progress value={Math.round(activeFieldSource.confidence * 100)} className="h-1.5 flex-1" /><span className="text-xs font-semibold">{Math.round(activeFieldSource.confidence * 100)}%</span></div></div>}<div className="rounded-lg bg-[#fff8eb] p-3 text-xs leading-5 text-[#825b28]">Dữ liệu không có trong nguồn được để trống. Hãy nhập thủ công nếu bạn xác minh được.</div></div></aside>}
          </div>
        </section>}
        </>}

        {view === "jobs" && <section>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3d725c]">Workspace</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-[40px]">Extraction jobs</h1><p className="mt-2 text-sm text-[#727b75]">Các job trong phiên làm việc hiện tại.</p></div><Button onClick={openNewExtraction} className="bg-[#164c3a] hover:bg-[#113e2f]"><Plus className="size-4" /> New extraction</Button></div>
          <div className="mt-8 overflow-hidden rounded-xl border border-[#d9ded9] bg-white"><Table><TableHeader><TableRow className="bg-[#f7f8f6] hover:bg-[#f7f8f6]"><TableHead>Job</TableHead><TableHead>Files</TableHead><TableHead>Rows</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.length ? <TableRow><TableCell className="font-medium">{templateName}</TableCell><TableCell>{files.length || "Demo"}</TableCell><TableCell>{rows.length}</TableCell><TableCell><Badge className={warnings ? "bg-[#fff3dd] text-[#95621f] hover:bg-[#fff3dd]" : "bg-[#eaf4ee] text-[#32614e] hover:bg-[#eaf4ee]"}>{warnings ? "Needs review" : "Completed"}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setView("extract"); setStep("review"); }}>Open</Button></TableCell></TableRow> : <TableRow><TableCell colSpan={5} className="h-48 text-center"><div className="mx-auto grid size-10 place-items-center rounded-full bg-[#edf3ef] text-[#3f725b]"><FileText className="size-4" /></div><p className="mt-3 text-sm font-medium">Chưa có extraction job</p><button onClick={openNewExtraction} className="mt-2 text-xs font-semibold text-[#367057] underline underline-offset-4">Tạo job đầu tiên</button></TableCell></TableRow>}</TableBody></Table></div>
        </section>}

        {view === "templates" && <section>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3d725c]">Reusable schemas</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-[40px]">Templates</h1><p className="mt-2 text-sm text-[#727b75]">Chọn lại schema mà không cần cấu hình từ đầu.</p></div><Button onClick={openNewExtraction} className="bg-[#164c3a] hover:bg-[#113e2f]"><Plus className="size-4" /> New template</Button></div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><button onClick={() => { setView("extract"); setStep("upload"); }} className="group rounded-xl border border-[#d9ded9] bg-white p-5 text-left transition hover:border-[#8eb09f] hover:shadow-sm"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-lg bg-[#eaf2ed] text-[#32614e]"><FileSpreadsheet className="size-5" /></div><Badge variant="outline">{fields.length} fields</Badge></div><h2 className="mt-5 font-semibold">{templateName}</h2><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7a837d]">{fields.map((field) => field.label).join(" · ")}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-[#3a6e57]">Use template <ChevronRight className="size-3.5 transition group-hover:translate-x-1" /></span></button></div>
        </section>}

        {view === "settings" && <section className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3d725c]">Configuration</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-[40px]">Settings</h1><p className="mt-2 text-sm text-[#727b75]">Cấu hình xử lý tài liệu và quyền riêng tư.</p>
          <div className="mt-8 space-y-4"><div className="rounded-xl border border-[#d9ded9] bg-white p-5"><div className="flex items-start justify-between gap-5"><div><h2 className="font-semibold">Gemini extraction</h2><p className="mt-2 text-sm leading-6 text-[#737c76]">Nhập key từ Google AI Studio để xử lý PDF và ảnh bằng Gemini 3.7 Flash.</p></div><Badge className={keySaved ? "bg-[#eaf4ee] text-[#32614e] hover:bg-[#eaf4ee]" : "bg-[#fff3dd] text-[#95621f] hover:bg-[#fff3dd]"}>{keySaved ? "Key saved" : "Key required"}</Badge></div><label className="mt-5 block text-xs font-semibold text-[#59635d]" htmlFor="gemini-key">Gemini API key</label><Input id="gemini-key" type="password" autoComplete="off" value={geminiKey} onChange={(event) => { setGeminiKey(event.target.value); setKeySaved(false); }} placeholder="AIza…" className="mt-2 font-mono" /><p className="mt-2 text-xs leading-5 text-[#858d88]">Key chỉ được giữ trong tab hiện tại bằng sessionStorage và gửi qua HTTPS khi extraction. Đóng tab sẽ xóa key.</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={saveGeminiKey} className="bg-[#164c3a] hover:bg-[#113e2f]">Save for this session</Button><Button variant="outline" onClick={testGeminiKey} disabled={testingKey}>{testingKey ? "Testing…" : "Test connection"}</Button>{keySaved && <Button variant="ghost" onClick={removeGeminiKey} className="text-[#a34c43] hover:text-[#8f3e36]">Remove key</Button>}</div></div><div className="rounded-xl border border-[#d9ded9] bg-white p-5"><h2 className="font-semibold">No-hallucination rule</h2><p className="mt-2 text-sm leading-6 text-[#737c76]">Trường không có bằng chứng trong tài liệu luôn được trả về rỗng và đưa vào hàng đợi review.</p></div><div className="rounded-xl border border-[#d9ded9] bg-white p-5"><h2 className="font-semibold">Session data</h2><p className="mt-2 text-sm leading-6 text-[#737c76]">Job và template hiện chỉ tồn tại trong phiên trình duyệt này.</p><Button variant="outline" className="mt-4" onClick={() => { setRows([]); setFiles([]); toast.success("Đã xóa dữ liệu trong phiên"); }}>Clear session data</Button></div></div>
        </section>}
      </div>
    </main>
  </div>;
}
