import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { type BrandModule, type BrandModuleType, MODULE_META } from "@/lib/brand-core";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  workspaceId: string;
  type: BrandModuleType;
  module?: BrandModule;
  onClose: () => void;
};

// ── Array item helpers ────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

type PersonaItem = { _id: string; nome: string; idade: string; profissao: string; onde_mora: string; renda: string; dores: string; desejos: string; como_consome: string; objecoes: string };
type CompetitorItem = { _id: string; nome: string; instagram: string; pontos_fortes: string; pontos_fracos: string; diferencial_nosso: string };
type ProductItem = { _id: string; nome: string; tipo: string; preco: string; descricao: string; publico_alvo: string; objecao_principal: string };

function emptyPersona(): PersonaItem { return { _id: uid(), nome: "", idade: "", profissao: "", onde_mora: "", renda: "", dores: "", desejos: "", como_consome: "", objecoes: "" }; }
function emptyCompetitor(): CompetitorItem { return { _id: uid(), nome: "", instagram: "", pontos_fortes: "", pontos_fracos: "", diferencial_nosso: "" }; }
function emptyProduct(): ProductItem { return { _id: uid(), nome: "", tipo: "produto", preco: "", descricao: "", publico_alvo: "", objecao_principal: "" }; }

function fromContent<T>(c: Record<string, unknown>, key: string, empty: () => T): T[] {
  const arr = c[key] as T[] | undefined;
  if (!arr || arr.length === 0) return [{ ...empty(), _id: uid() } as T];
  return arr.map((item) => ({ _id: uid(), ...(item as object) }) as T);
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function ModuleDialog({ clientId, workspaceId, type, module, onClose }: Props) {
  const qc = useQueryClient();
  const meta = MODULE_META[type];
  const c = (module?.content ?? {}) as Record<string, string | unknown>;

  // Single-field modules
  const [fields, setFields] = useState<Record<string, string>>(() => {
    if (type === "diagnosis" || type === "positioning") {
      return Object.fromEntries(
        Object.entries(c).map(([k, v]) => [k, typeof v === "string" ? v : ""])
      );
    }
    return {};
  });

  // Array modules
  const [personas, setPersonas] = useState<PersonaItem[]>(() =>
    type === "persona" ? fromContent(c, "personas", emptyPersona) : []
  );
  const [competitors, setCompetitors] = useState<CompetitorItem[]>(() =>
    type === "competitors" ? fromContent(c, "competitors", emptyCompetitor) : []
  );
  const [products, setProducts] = useState<ProductItem[]>(() =>
    type === "product_ladder" ? fromContent(c, "products", emptyProduct) : []
  );

  const field = (key: string) => fields[key] ?? "";
  const setField = (key: string, val: string) => setFields((prev) => ({ ...prev, [key]: val }));

  const buildContent = (): Record<string, unknown> => {
    if (type === "persona")        return { personas: personas.map(({ _id, ...p }) => p) };
    if (type === "competitors")    return { competitors: competitors.map(({ _id, ...p }) => p) };
    if (type === "product_ladder") return { products: products.map(({ _id, ...p }) => p) };
    return { ...fields };
  };

  const save = async () => {
    const content = buildContent() as Record<string, unknown> as never;
    if (module) {
      const { error } = await supabase.from("brand_modules").update({ content }).eq("id", module.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("brand_modules").insert({
        workspace_id: workspaceId, client_id: clientId, type, title: meta.title, content,
      });
      if (error) return toast.error(error.message);
    }
    toast.success("Módulo salvo");
    qc.invalidateQueries({ queryKey: ["brand-modules", clientId] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>{meta.title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-6 py-4 space-y-4">
            {type === "diagnosis" && <DiagnosisForm f={field} sf={setField} />}
            {type === "persona" && <PersonaForm items={personas} setItems={setPersonas} />}
            {type === "competitors" && <CompetitorsForm items={competitors} setItems={setCompetitors} />}
            {type === "positioning" && <PositioningForm f={field} sf={setField} />}
            {type === "product_ladder" && <ProductLadderForm items={products} setItems={setProducts} />}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Salvar módulo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Form helpers ──────────────────────────────────────────────────────────────

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

type SF = { f: (k: string) => string; sf: (k: string, v: string) => void };

// ── Diagnosis ─────────────────────────────────────────────────────────────────

function DiagnosisForm({ f, sf }: SF) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <F label="Segmento de mercado"><Input value={f("segmento")} onChange={(e) => sf("segmento", e.target.value)} /></F>
        <F label="Tempo no mercado"><Input value={f("tempo_mercado")} onChange={(e) => sf("tempo_mercado", e.target.value)} /></F>
      </div>
      <F label="Principais diferenciais"><Textarea rows={3} value={f("diferenciais")} onChange={(e) => sf("diferenciais", e.target.value)} /></F>
      <F label="Principais desafios atuais"><Textarea rows={3} value={f("desafios")} onChange={(e) => sf("desafios", e.target.value)} /></F>
      <F label="Objetivos nas redes sociais"><Textarea rows={3} value={f("objetivos_redes")} onChange={(e) => sf("objetivos_redes", e.target.value)} /></F>
      <div className="grid grid-cols-2 gap-4">
        <F label="Tom de voz">
          <Select value={f("tom_voz") || undefined} onValueChange={(v) => sf("tom_voz", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {["formal", "semiformal", "informal", "descontraído", "técnico"].map((v) => (
                <SelectItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label="Palavras/expressões a evitar"><Input value={f("palavras_proibidas")} onChange={(e) => sf("palavras_proibidas", e.target.value)} /></F>
      </div>
      <F label="Referências de estilo visual"><Textarea rows={2} value={f("referencias_visuais")} onChange={(e) => sf("referencias_visuais", e.target.value)} /></F>
    </>
  );
}

// ── Persona ───────────────────────────────────────────────────────────────────

function PersonaForm({ items, setItems }: { items: PersonaItem[]; setItems: React.Dispatch<React.SetStateAction<PersonaItem[]>> }) {
  const update = (id: string, key: keyof PersonaItem, val: string) =>
    setItems((prev) => prev.map((p) => p._id === id ? { ...p, [key]: val } : p));
  const remove = (id: string) => setItems((prev) => prev.filter((p) => p._id !== id));

  return (
    <div className="space-y-6">
      {items.map((p, i) => (
        <div key={p._id} className="rounded-lg border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">Persona {i + 1}</p>
            {items.length > 1 && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(p._id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Nome fictício"><Input value={p.nome} onChange={(e) => update(p._id, "nome", e.target.value)} /></F>
            <F label="Faixa etária"><Input value={p.idade} onChange={(e) => update(p._id, "idade", e.target.value)} /></F>
            <F label="Profissão"><Input value={p.profissao} onChange={(e) => update(p._id, "profissao", e.target.value)} /></F>
            <F label="Onde mora"><Input value={p.onde_mora} onChange={(e) => update(p._id, "onde_mora", e.target.value)} /></F>
            <F label="Faixa de renda"><Input value={p.renda} onChange={(e) => update(p._id, "renda", e.target.value)} /></F>
          </div>
          <F label="Principais dores e frustrações"><Textarea rows={2} value={p.dores} onChange={(e) => update(p._id, "dores", e.target.value)} /></F>
          <F label="O que ela quer alcançar"><Textarea rows={2} value={p.desejos} onChange={(e) => update(p._id, "desejos", e.target.value)} /></F>
          <F label="Como consome conteúdo online"><Textarea rows={2} value={p.como_consome} onChange={(e) => update(p._id, "como_consome", e.target.value)} /></F>
          <F label="Principais objeções à compra"><Textarea rows={2} value={p.objecoes} onChange={(e) => update(p._id, "objecoes", e.target.value)} /></F>
        </div>
      ))}
      <Button variant="outline" className="w-full" onClick={() => setItems((prev) => [...prev, emptyPersona()])}>
        <Plus className="h-4 w-4" /> Adicionar persona
      </Button>
    </div>
  );
}

// ── Competitors ───────────────────────────────────────────────────────────────

function CompetitorsForm({ items, setItems }: { items: CompetitorItem[]; setItems: React.Dispatch<React.SetStateAction<CompetitorItem[]>> }) {
  const update = (id: string, key: keyof CompetitorItem, val: string) =>
    setItems((prev) => prev.map((c) => c._id === id ? { ...c, [key]: val } : c));
  const remove = (id: string) => setItems((prev) => prev.filter((c) => c._id !== id));

  return (
    <div className="space-y-6">
      {items.map((c, i) => (
        <div key={c._id} className="rounded-lg border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">Concorrente {i + 1}</p>
            {items.length > 1 && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(c._id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Nome"><Input value={c.nome} onChange={(e) => update(c._id, "nome", e.target.value)} /></F>
            <F label="Instagram (@handle)"><Input value={c.instagram} onChange={(e) => update(c._id, "instagram", e.target.value)} /></F>
          </div>
          <F label="Pontos fortes"><Textarea rows={2} value={c.pontos_fortes} onChange={(e) => update(c._id, "pontos_fortes", e.target.value)} /></F>
          <F label="Pontos fracos"><Textarea rows={2} value={c.pontos_fracos} onChange={(e) => update(c._id, "pontos_fracos", e.target.value)} /></F>
          <F label="Como nos diferenciamos deste concorrente"><Textarea rows={2} value={c.diferencial_nosso} onChange={(e) => update(c._id, "diferencial_nosso", e.target.value)} /></F>
        </div>
      ))}
      <Button variant="outline" className="w-full" onClick={() => setItems((prev) => [...prev, emptyCompetitor()])}>
        <Plus className="h-4 w-4" /> Adicionar concorrente
      </Button>
    </div>
  );
}

// ── Positioning ───────────────────────────────────────────────────────────────

const ARQUETIPOS = [
  "Herói", "Sábio", "Cuidador", "Criador", "Explorador", "Fora-da-lei",
  "Mago", "Cara comum", "Amante", "Bobo da corte", "Governante", "Inocente",
];

function PositioningForm({ f, sf }: SF) {
  return (
    <>
      <F label="Proposta de valor principal"><Textarea rows={3} value={f("proposta_valor")} onChange={(e) => sf("proposta_valor", e.target.value)} /></F>
      <div className="grid grid-cols-2 gap-4">
        <F label="Missão"><Textarea rows={3} value={f("missao")} onChange={(e) => sf("missao", e.target.value)} /></F>
        <F label="Visão"><Textarea rows={3} value={f("visao")} onChange={(e) => sf("visao", e.target.value)} /></F>
      </div>
      <F label="Valores da marca (um por linha)"><Textarea rows={4} value={f("valores")} onChange={(e) => sf("valores", e.target.value)} /></F>
      <div className="grid grid-cols-2 gap-4">
        <F label="Arquétipo de marca">
          <Select value={f("arquetipo") || undefined} onValueChange={(v) => sf("arquetipo", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {ARQUETIPOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label="Hashtags fixas da marca"><Input value={f("hashtags")} onChange={(e) => sf("hashtags", e.target.value)} /></F>
      </div>
      <F label="A mensagem que nunca muda"><Textarea rows={3} value={f("mensagem_central")} onChange={(e) => sf("mensagem_central", e.target.value)} /></F>
    </>
  );
}

// ── Product Ladder (com DnD) ──────────────────────────────────────────────────

const PRODUCT_TIPOS = ["produto", "serviço", "mentoria", "curso", "assinatura", "outro"];

function ProductLadderForm({ items, setItems }: { items: ProductItem[]; setItems: React.Dispatch<React.SetStateAction<ProductItem[]>> }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const update = (id: string, key: keyof ProductItem, val: string) =>
    setItems((prev) => prev.map((p) => p._id === id ? { ...p, [key]: val } : p));
  const remove = (id: string) => setItems((prev) => prev.filter((p) => p._id !== id));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oi = prev.findIndex((p) => p._id === active.id);
        const ni = prev.findIndex((p) => p._id === over.id);
        return arrayMove(prev, oi, ni);
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Arraste para reordenar a esteira do menor para o maior valor.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((p) => p._id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {items.map((p, i) => (
              <SortableProductItem key={p._id} item={p} index={i} total={items.length} update={update} remove={remove} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button variant="outline" className="w-full" onClick={() => setItems((prev) => [...prev, emptyProduct()])}>
        <Plus className="h-4 w-4" /> Adicionar produto/serviço
      </Button>
    </div>
  );
}

function SortableProductItem({ item: p, index: i, total, update, remove }: {
  item: ProductItem; index: number; total: number;
  update: (id: string, k: keyof ProductItem, v: string) => void;
  remove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-muted-foreground flex-1">Produto {i + 1}</p>
        {total > 1 && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(p._id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <F label="Nome"><Input value={p.nome} onChange={(e) => update(p._id, "nome", e.target.value)} /></F>
        <F label="Tipo">
          <Select value={p.tipo} onValueChange={(v) => update(p._id, "tipo", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_TIPOS.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label="Preço"><Input value={p.preco} onChange={(e) => update(p._id, "preco", e.target.value)} /></F>
        <F label="Público-alvo"><Input value={p.publico_alvo} onChange={(e) => update(p._id, "publico_alvo", e.target.value)} /></F>
      </div>
      <F label="Descrição"><Input value={p.descricao} onChange={(e) => update(p._id, "descricao", e.target.value)} /></F>
      <F label="Principal objeção"><Input value={p.objecao_principal} onChange={(e) => update(p._id, "objecao_principal", e.target.value)} /></F>
    </div>
  );
}
