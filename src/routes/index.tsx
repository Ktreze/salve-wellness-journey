import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clipboard,
  Clock3,
  Eye,
  FileText,
  Instagram,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: OkaiDashboard,
  head: () => ({
    meta: [
      { title: "OKAI Influencer AI" },
      {
        name: "description",
        content:
          "Inteligência comercial para análise de influenciadoras e parcerias publicitárias.",
      },
      { property: "og:title", content: "OKAI Influencer AI" },
      {
        property: "og:description",
        content: "Decisões de parceria baseadas em potencial comercial.",
      },
    ],
  }),
});

type MetricKey =
  | "engagement"
  | "content"
  | "conversion"
  | "audience"
  | "authenticity"
  | "reach";

type Analysis = {
  score: number;
  confidence: number;
  status: "APROVADA" | "AVALIAR MELHOR" | "NÃO RECOMENDADA";
  model: "COMISSÃO" | "FIXO";
  fixedValue: number;
  positives: string[];
  negatives: string[];
  justification: string;
  copy: string;
  missing: string[];
};

type MaterialFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type Profile = {
  name: string;
  handle: string;
  niche: string;
  followers: string;
  engagement: string;
  views: string;
  status: Analysis["status"];
  score: number;
  model: Analysis["model"];
};

const navigation = [
  { label: "Visão geral", icon: LayoutDashboard },
  { label: "Análises", icon: Sparkles, active: true },
  { label: "Influenciadoras", icon: Users },
  { label: "Parcerias", icon: Target },
  { label: "Mensagens", icon: MessageCircleMore },
];

const recentProfiles: Profile[] = [
  {
    name: "Marina Costa",
    handle: "@marina.co",
    niche: "Lifestyle & beleza",
    followers: "84,2 mil",
    engagement: "5,8%",
    views: "31,4 mil",
    status: "APROVADA",
    score: 87,
    model: "COMISSÃO",
  },
  {
    name: "Letícia Almeida",
    handle: "@leticia.fit",
    niche: "Fitness & bem-estar",
    followers: "42,7 mil",
    engagement: "7,2%",
    views: "18,9 mil",
    status: "AVALIAR MELHOR",
    score: 74,
    model: "FIXO",
  },
  {
    name: "Bia Ramos",
    handle: "@biaramos",
    niche: "Moda & acessórios",
    followers: "126 mil",
    engagement: "2,1%",
    views: "22,8 mil",
    status: "NÃO RECOMENDADA",
    score: 49,
    model: "COMISSÃO",
  },
];

const scoreFactors: Array<{
  key: MetricKey;
  label: string;
  weight: number;
  color: string;
}> = [
  { key: "engagement", label: "Engajamento", weight: 20, color: "#82f58b" },
  { key: "content", label: "Conteúdo", weight: 15, color: "#6ee7b7" },
  { key: "conversion", label: "Conversão", weight: 25, color: "#a3e635" },
  { key: "audience", label: "Audiência", weight: 15, color: "#34d399" },
  { key: "authenticity", label: "Autenticidade", weight: 15, color: "#4ade80" },
  { key: "reach", label: "Alcance", weight: 10, color: "#bef264" },
];

const navIcons = navigation.map((item) => item.icon);

function OkaiDashboard() {
  const [activeNav, setActiveNav] = useState("Análises");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("Lifestyle & beleza");
  const [followers, setFollowers] = useState("");
  const [engagement, setEngagement] = useState("");
  const [views, setViews] = useState("");
  const [frequency, setFrequency] = useState("");
  const [history, setHistory] = useState("");
  const [observations, setObservations] = useState("");
  const [materialFiles, setMaterialFiles] = useState<MaterialFile[]>([]);
  const [materialError, setMaterialError] = useState("");
  const [materialUploadState, setMaterialUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [materialUploadError, setMaterialUploadError] = useState("");
  const [uploadedMaterialCount, setUploadedMaterialCount] = useState(0);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [audience, setAudience] = useState("adequada");
  const [authenticity, setAuthenticity] = useState("boa");
  const [conversion, setConversion] = useState("media");
  const [contentQuality, setContentQuality] = useState("boa");
  const [result, setResult] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const canAnalyze = handle.trim().length > 2 && followers.trim().length > 0;

  const confidence = useMemo(() => {
    if (!result) return 0;
    return result.confidence;
  }, [result]);

  async function runAnalysisLegacy() {
    if (!canAnalyze || materialUploadState === "uploading") return;

    if (materialFiles.length > 0) {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      const maxFileSize = 10 * 1024 * 1024;
      const analysisId = crypto.randomUUID();

      setMaterialUploadState("uploading");
      setMaterialUploadError("");
      setUploadedMaterialCount(0);

      try {
        for (let index = 0; index < materialFiles.length; index += 1) {
          const material = materialFiles[index];

          if (!allowedTypes.includes(material.file.type)) {
            throw new Error(`Formato inválido em "${material.file.name}". Use PNG, JPG, JPEG ou WEBP.`);
          }

          if (material.file.size > maxFileSize) {
            throw new Error(`"${material.file.name}" excede o limite de 10 MB.`);
          }

          const safeFileName = material.file.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]/g, "-")
            .replace(/-+/g, "-");
          const storagePath = `${analysisId}/${crypto.randomUUID()}-${safeFileName}`;
          const { error } = await supabase.storage
            .from("influencer-analysis")
            .upload(storagePath, material.file, {
              cacheControl: "3600",
              contentType: material.file.type,
              upsert: false,
            });

          if (error) {
            throw new Error(error.message);
          }

          setUploadedMaterialCount(index + 1);
        }

        setMaterialUploadState("success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível enviar as imagens para o armazenamento.";
        setMaterialUploadError(message);
        setMaterialUploadState("error");
        return;
      }
    }

    const followerNumber = parseLocaleNumber(followers);
    const engagementNumber = parseLocaleNumber(engagement);
    const viewNumber = parseLocaleNumber(views);

    const engagementScore = engagementNumber
      ? clamp(Math.round((engagementNumber / 8) * 20), 0, 20)
      : 8;
    const contentScore = contentQuality === "alta" ? 15 : contentQuality === "baixa" ? 5 : 10;
    const conversionScore =
      conversion === "alta" ? 25 : conversion === "baixa" ? 5 : conversion === "media" ? 16 : 8;
    const audienceScore = audience === "alta" ? 15 : audience === "incompativel" ? 3 : 9;
    const authenticityScore =
      authenticity === "alta" ? 15 : authenticity === "baixa" ? 3 : authenticity === "suspeita" ? 6 : 10;
    const reachScore = viewNumber
      ? clamp(Math.round((viewNumber / Math.max(followerNumber, 1)) * 30), 0, 10)
      : followerNumber > 100000
        ? 6
        : 5;

    const score = Math.round(
      engagementScore +
        contentScore +
        conversionScore +
        audienceScore +
        authenticityScore +
        reachScore,
    );

    const dataQuality = [
      engagementNumber ? 1 : 0,
      viewNumber ? 1 : 0,
      frequency ? 1 : 0,
      history ? 1 : 0,
      observations.length > 30 ? 1 : 0,
      audience !== "adequada" ? 1 : 0,
    ].filter(Boolean).length;
    const confidenceValue = clamp(52 + dataQuality * 7, 52, 96);

    const status: Analysis["status"] =
      score >= 75
        ? "APROVADA"
        : score >= 58
          ? "AVALIAR MELHOR"
          : "NÃO RECOMENDADA";

    const model: Analysis["model"] =
      status === "NÃO RECOMENDADA"
        ? "COMISSÃO"
        : score >= 82 && authenticity !== "suspeita"
          ? "FIXO"
          : "COMISSÃO";

    const fixedValue =
      score >= 90
        ? 70
        : score >= 82
          ? 60
          : score >= 74
            ? 50
            : 0;

    const positives: string[] = [];
    const negatives: string[] = [];
    const missing: string[] = [];

    if (engagementNumber >= 4) positives.push("Engajamento acima de 4% indica resposta relevante da audiência.");
    else if (engagementNumber) negatives.push("Engajamento abaixo de 4% exige validação de qualidade do público.");
    else missing.push("Média de curtidas e comentários.");

    if (contentQuality === "alta") positives.push("Conteúdo consistente e com boa apresentação visual.");
    if (contentQuality === "baixa") negatives.push("Baixa consistência ou qualidade de produção do conteúdo.");

    if (conversion === "alta") positives.push("O nicho apresenta sinais fortes de intenção de compra.");
    if (conversion === "baixa") negatives.push("A adequação do nicho com a campanha exige validação.");

    if (audience === "alta") positives.push("Audiência describeda como qualificada e coerente com a campanha.");
    if (audience === "incompativel") negatives.push("Audiência apresentada como incompatível com a campanha.");

    if (authenticity === "alta") positives.push("Perfil apresenta sinais aparentes de autenticidade.");
    if (authenticity === "suspeita") negatives.push("Há indícios de engajamento artificial ou audiência pouco confiável.");
    if (authenticity === "baixa") negatives.push("O perfil não apresenta sinais suficientes de autenticidade.");

    if (viewNumber && followerNumber > 0 && viewNumber / followerNumber >= 0.25) {
      positives.push("Visualizações representativas em relação ao tamanho da audiência.");
    }

    if (!frequency) missing.push("Frequência de publicação.");
    if (!history) missing.push("Histórico de publicidade e parcerias.");
    if (!observations) missing.push("Evidências visuais e qualitative das publicações.");
    if (!viewNumber) missing.push("Visualizações de Reels ou Stories.");

    if (!positives.length) positives.push("Existe potencial de parceria, mas ainda faltam evidências para uma decisão segura.");
    if (!negatives.length) negatives.push("Nenhum risco crítico identificado nos dados fornecidos.");

    const identifier = name.trim() || handle.replace("@", "");
    const copy = buildCopy({
      identifier,
      niche,
      model,
      score,
      status,
    });

    setResult({
      score,
      confidence: confidenceValue,
      status,
      model,
      fixedValue,
      positives: positives.slice(0, 4),
      negatives: negatives.slice(0, 4),
      justification:
        status === "APROVADA"
          ? `O perfil apresenta boa relação entre qualidade da audiência, interação e potencial de conversão. A recomendação é ${model === "FIXO" ? `um pagamento fixo entre R$ 50 e R$ 70, inicialmente em R$ ${fixedValue}` : "parceria por comissão de 45% sobre depósitos atribuídos"}.`
          : status === "AVALIAR MELHOR"
            ? "O perfil tem sinais comerciais relevantes, mas a confiança ainda é insuficiente para um compromisso integral. A comissão reduz o risco e preserva espaço para validação."
            : "O custo-benefício atual não favorece uma parceria. A audiência, o engajamento ou a compatibilidade precisam de sinais mais fortes antes de avançar.",
      copy,
      missing,
    });
  }

  async function runAnalysis() {
    if (!canAnalyze || materialUploadState === "uploading") return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    const maxFileSize = 10 * 1024 * 1024;
    const analysisId = crypto.randomUUID();
    const uploadedPaths: string[] = [];

    setMaterialUploadState("uploading");
    setMaterialUploadError("");
    setUploadedMaterialCount(0);

    try {
      for (let index = 0; index < materialFiles.length; index += 1) {
        const material = materialFiles[index];
        if (!allowedTypes.includes(material.file.type)) throw new Error(`Formato inválido em "${material.file.name}". Use PNG, JPG, JPEG ou WEBP.`);
        if (material.file.size > maxFileSize) throw new Error(`"${material.file.name}" excede o limite de 10 MB.`);

        const safeFileName = material.file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
        const storagePath = `${analysisId}/${crypto.randomUUID()}-${safeFileName}`;
        const { error } = await supabase.storage.from("influencer-analysis").upload(storagePath, material.file, { cacheControl: "3600", contentType: material.file.type, upsert: false });
        if (error) throw new Error(error.message);
        uploadedPaths.push(storagePath);
        setUploadedMaterialCount(index + 1);
      }

      const { data, error } = await supabase.functions.invoke("analyze-influencer", { body: { analysisId, profile: { handle, name, niche, followers, engagement, views, frequency, history, observations, audience, authenticity, conversion, contentQuality } } });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== "object") throw new Error("A Edge Function não retornou um relatório válido.");
      setResult(data as Analysis);
      setMaterialUploadState("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir a análise de IA.";
      setMaterialUploadError(message);
      setMaterialUploadState("error");
    }
  }

  function addMaterialFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    const maxFileSize = 10 * 1024 * 1024;
    const maxFiles = 10;
    const incomingFiles = Array.from(fileList);
    const invalidType = incomingFiles.find((file) => !allowedTypes.includes(file.type));
    const oversizedFile = incomingFiles.find((file) => file.size > maxFileSize);

    if (invalidType) {
      setMaterialError("Formato inválido. Envie apenas arquivos PNG, JPG, JPEG ou WEBP.");
      return;
    }

    if (oversizedFile) {
      setMaterialError("Cada imagem deve ter no máximo 10 MB.");
      return;
    }

    setMaterialFiles((currentFiles) => {
      const availableSlots = maxFiles - currentFiles.length;
      if (availableSlots <= 0) {
        setMaterialError("Você pode adicionar até 10 imagens por análise.");
        return currentFiles;
      }

      if (incomingFiles.length > availableSlots) {
        setMaterialError(`Serão adicionadas ${availableSlots} imagens. O limite é de 10 imagens por análise.`);
      } else {
        setMaterialError("");
      }

      const newFiles = incomingFiles.slice(0, availableSlots).map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      return [...currentFiles, ...newFiles];
    });
  }

  function removeMaterialFile(id: string) {
    setMaterialFiles((currentFiles) => {
      const fileToRemove = currentFiles.find((item) => item.id === id);
      if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);
      return currentFiles.filter((item) => item.id !== id);
    });
    setMaterialError("");
  }

  async function copyMessage() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.copy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050706] text-white">
      <div className="ambient-glow ambient-glow-one" />
      <div className="ambient-glow ambient-glow-two" />

      <aside className={cn("sidebar", mobileMenu && "sidebar-open")}>
        <div className="flex h-[76px] items-center justify-between border-b border-white/[0.07] px-5">
          <a href="/" className="flex items-center gap-3" aria-label="OKAI Influencer AI">
            <div className="brand-mark"><Bot size={21} /></div>
            <div>
              <div className="text-[13px] font-black tracking-[0.18em] text-white">OKAI</div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#82f58b]">Influencer AI</div>
            </div>
          </a>
          <button className="lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>

        <div className="px-3 py-5">
          <p className="sidebar-label">Workspace</p>
          <nav className="mt-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => { setActiveNav(item.label); setMobileMenu(false); }}
                  className={cn("sidebar-link", activeNav === item.label && "sidebar-link-active")}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {item.label === "Análises" && <span className="ml-auto rounded-full bg-[#82f58b]/10 px-2 py-0.5 text-[10px] text-[#82f58b]">12</span>}
                </button>
              );
            })}
          </nav>

          <p className="sidebar-label mt-7">Inteligência</p>
          <nav className="mt-2 space-y-1">
            <button className="sidebar-link"><Activity size={17} /><span>Sinais do perfil</span></button>
            <button className="sidebar-link"><BarChart3 size={17} /><span>Performance</span></button>
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-[#82f58b]/15 bg-[#82f58b]/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Motor comercial</span>
              <span className="h-2 w-2 rounded-full bg-[#82f58b] shadow-[0_0_12px_#82f58b]" />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-[#4ade80] to-[#b9ff8f]" />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-white/40">Modo local ativo. Integrações externas serão conectadas em etapa posterior.</p>
          </div>
        </div>
      </aside>

      {mobileMenu && <button className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Fechar menu" />}

      <main className="relative z-10 lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-white/[0.07] bg-[#050706]/85 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <button className="icon-button lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={19} /></button>
            <div className="hidden items-center gap-2 text-xs text-white/35 sm:flex">
              <span>Workspace</span><span>/</span><span className="text-white/75">Análises</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/40 md:flex">
              <Search size={14} /><span>Buscar perfis...</span><kbd className="ml-5 rounded border border-white/10 px-1.5 py-0.5 text-[9px]">⌘ K</kbd>
            </div>
            <button className="icon-button relative" aria-label="Notificações"><Activity size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#82f58b]" /></button>
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#82f58b] to-emerald-700 text-xs font-black text-black">OI</div>
              <div className="hidden sm:block"><p className="text-xs font-semibold">OKAI Influencer</p><p className="text-[10px] text-white/35">Agência</p></div>
              <ChevronDown size={14} className="hidden text-white/35 sm:block" />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-4 sm:p-7">
          <section className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#82f58b]/20 bg-[#82f58b]/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#82f58b]"><Sparkles size={12} /> Intelligence workspace</div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-[30px]">Olá, vamos encontrar a melhor parceria?</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">Analise o perfil, entenda o potencial comercial e prepare o primeiro contato com inteligência.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/35"><span className="h-2 w-2 rounded-full bg-[#82f58b]" />Análise local pronta</div>
          </section>

          <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Users} label="Perfis analisados" value="128" change="+18 este mês" />
            <MetricCard icon={UserRoundCheck} label="Potencial aprovado" value="46" change="35,9% da base" positive />
            <MetricCard icon={CircleDollarSign} label="Parcerias ativas" value="27" change="R$ 84,2k em negociação" />
            <MetricCard icon={TrendingUp} label="Conversão média" value="3,8x" change="+12,4% vs. mês anterior" positive />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <div className="panel p-5 sm:p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div><div className="flex items-center gap-2"><div className="section-icon"><Instagram size={17} /></div><h2 className="text-base font-semibold">Nova análise</h2></div><p className="mt-2 text-xs leading-5 text-white/35">Preencha apenas os dados que conseguiu verificar.</p></div>
                <span className="rounded-lg border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/35">Etapa 01</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Instagram" icon="@" placeholder="@usuario" value={handle} onChange={setHandle} />
                <Field label="Nome ou identificação" icon="Aa" placeholder="Como devemos chamar?" value={name} onChange={setName} />
                <Field label="Seguidores" icon="#" placeholder="Ex.: 84.200" value={followers} onChange={setFollowers} />
                <Field label="Engajamento médio" icon="%" placeholder="Ex.: 5,8" value={engagement} onChange={setEngagement} />
                <Field label="Visualizações dos Reels" icon="▶" placeholder="Ex.: 31.400" value={views} onChange={setViews} />
                <Field label="Frequência de publicação" icon="↻" placeholder="Ex.: 4 posts por semana" value={frequency} onChange={setFrequency} />
              </div>

              <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-white/80">Materiais para análise</h3>
                      {materialFiles.length > 0 && (
                        <span className="rounded-full border border-[#82f58b]/20 bg-[#82f58b]/[0.08] px-2 py-0.5 text-[9px] font-bold text-[#82f58b]">
                          {materialFiles.length} {materialFiles.length === 1 ? "imagem" : "imagens"}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 max-w-xl text-[10px] leading-5 text-white/35">
                      Envie capturas do perfil, publicações, comentários, Stories e métricas para que a inteligência artificial possa realizar uma avaliação mais completa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => materialInputRef.current?.click()}
                    className="secondary-button shrink-0"
                  >
                    <FileText size={15} />
                    Adicionar imagens
                  </button>
                  <input
                    ref={materialInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      addMaterialFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>

                {(materialError || materialUploadError) && (
                  <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[10px] text-amber-200">
                    {materialError || materialUploadError}
                  </p>
                )}

                {materialUploadState === "uploading" && (
                  <div className="mt-3 rounded-lg border border-[#82f58b]/15 bg-[#82f58b]/[0.04] px-3 py-2">
                    <div className="flex items-center justify-between text-[10px] text-white/45">
                      <span>Enviando materiais...</span>
                      <span>{uploadedMaterialCount} de {materialFiles.length}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-[#82f58b] transition-all duration-300"
                        style={{ width: `${materialFiles.length ? (uploadedMaterialCount / materialFiles.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {materialUploadState === "success" && (
                  <p className="mt-3 rounded-lg border border-[#82f58b]/15 bg-[#82f58b]/[0.05] px-3 py-2 text-[10px] text-[#82f58b]">
                    {uploadedMaterialCount} {uploadedMaterialCount === 1 ? "imagem armazenada" : "imagens armazenadas"} com segurança.
                  </p>
                )}

                {materialFiles.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {materialFiles.map((material) => (
                      <div key={material.id} className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#0a0d0b]">
                        <div className="aspect-[4/3] overflow-hidden bg-white/[0.03]">
                          <img
                            src={material.previewUrl}
                            alt={`Prévia de ${material.file.name}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center gap-2 p-3">
                          <p className="min-w-0 flex-1 truncate text-[10px] text-white/55" title={material.file.name}>
                            {material.file.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeMaterialFile(material.id)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.08] text-white/35 transition-colors hover:border-red-400/20 hover:bg-red-400/10 hover:text-red-300"
                            aria-label={`Remover ${material.file.name}`}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {materialFiles.length === 0 && (
                  <button
                    type="button"
                    onClick={() => materialInputRef.current?.click()}
                    className="mt-4 flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.1] bg-white/[0.015] px-4 py-7 text-center transition-colors hover:border-[#82f58b]/30 hover:bg-[#82f58b]/[0.025]"
                  >
                    <FileText size={20} className="mb-2 text-white/25" />
                    <span className="text-[10px] font-semibold text-white/45">Selecione capturas e imagens do Instagram</span>
                    <span className="mt-1 text-[9px] text-white/25">PNG, JPG, JPEG ou WEBP · até 10 MB por arquivo</span>
                  </button>
                )}
              </div>

              <div className="my-6 h-px bg-white/[0.07]" />

              <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold text-white/80">Leitura comercial</h3><span className="text-[10px] text-white/25">Avaliação do gestor comercial</span></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Qualidade do conteúdo" value={contentQuality} onChange={setContentQuality} options={[["alta", "Alta"], ["boa", "Boa"], ["baixa", "Baixa"]]} />
                <SelectField label="Potencial de conversão" value={conversion} onChange={setConversion} options={[["alta", "Alto"], ["media", "Médio"], ["baixa", "Baixo"]]} />
                <SelectField label="Qualidade da audiência" value={audience} onChange={setAudience} options={[["alta", "Alta e qualificada"], ["adequada", "Adequada"], ["incompativel", "Incompatível"]]} />
                <SelectField label="Autenticidade aparente" value={authenticity} onChange={setAuthenticity} options={[["alta", "Alta"], ["boa", "Boa"], ["suspeita", "Sinais suspeitos"], ["baixa", "Baixa"]]} />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="field-label">Histórico de publicidade<textarea className="field-input min-h-24 resize-none py-3" placeholder="Ex.: já-working com marcas de skincare e beleza natural." value={history} onChange={(event) => setHistory(event.target.value)} /></label>
                <label className="field-label">Observações e evidências visuais<textarea className="field-input min-h-24 resize-none py-3" placeholder="Descreva o conteúdo, a consistência e os sinais observados." value={observations} onChange={(event) => setObservations(event.target.value)} /></label>
              </div>

              <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-[#82f58b]/15 bg-[#82f58b]/[0.035] p-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3"><FileText size={17} className="mt-0.5 shrink-0 text-[#82f58b]" /><p className="text-[11px] leading-5 text-white/40">A quantidade de seguidores é apenas um contexto. A decisão usa seis fatores ponderados e confiança conforme os dados disponíveis.</p></div>
                <button onClick={runAnalysis} disabled={!canAnalyze || materialUploadState === "uploading"} className="primary-button shrink-0"><Sparkles size={16} />{materialUploadState === "uploading" ? "Enviando materiais..." : "Analisar perfil"}</button>
              </div>
            </div>

            <div className="panel min-h-[620px] p-5 sm:p-6">
              {!result ? (
                <div className="flex h-full min-h-[540px] flex-col items-center justify-center text-center">
                  <div className="empty-orb"><Sparkles size={28} /></div>
                  <h3 className="mt-6 text-lg font-semibold">Aguardando análise</h3>
                  <p className="mt-2 max-w-xs text-xs leading-5 text-white/35">Preencha os dados do perfil para receber a pontuação, recomendação e uma abordagem personalizada.</p>
                  <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-2">
                    {["20", "25", "15"].map((value, index) => <div key={value} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-lg font-bold text-white/20">{value}</p><p className="text-[9px] uppercase tracking-wider text-white/25">{["Engajamento", "Conversão", "Audiência"][index]}</p></div>)}
                  </div>
                </div>
              ) : (
                <div className="animate-fade-in">
                  <div className="mb-5 flex items-start justify-between">
                    <div><div className="flex items-center gap-2"><h2 className="text-base font-semibold">Resultado comercial</h2><span className={cn("status-pill", result.status === "APROVADA" ? "status-approved" : result.status === "AVALIAR MELHOR" ? "status-review" : "status-rejected")}>{result.status}</span></div><p className="mt-1 text-xs text-white/35">{handle || "Perfil analisado"} · análise {(result.confidence / 100).toFixed(0)}% completa</p></div>
                    <div className="relative grid h-20 w-20 place-items-center rounded-full" style={{ background: `conic-gradient(#82f58b ${result.score * 3.6}deg, rgba(255,255,255,.06) 0deg)` }}><div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-[#0a0d0b]"><span className="text-2xl font-black">{result.score}</span></div></div>
                  </div>

                  <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="result-stat"><span>Modalidade</span><strong>{result.model}</strong></div>
                    <div className="result-stat"><span>Confiança</span><strong>{result.confidence}%</strong></div>
                  </div>

                  <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold">Composição da nota</h3><span className="text-[10px] text-white/30">100 pontos</span></div>
                    <div className="space-y-3">
                      {scoreFactors.map((factor) => {
                        const factorScore = calculateFactorScore(factor.key, result.score);
                        return <div key={factor.key}><div className="mb-1.5 flex justify-between text-[10px]"><span className="text-white/50">{factor.label} <span className="text-white/20">· máx. {factor.weight}</span></span><span className="font-semibold text-white/70">{factorScore}/{factor.weight}</span></div><div className="h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${(factorScore / factor.weight) * 100}%`, background: factor.color }} /></div></div>;
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <InsightList title="Pontos positivos" items={result.positives} positive />
                    <InsightList title="Pontos de atenção" items={result.negatives} />
                  </div>

                  <div className="mt-5 rounded-2xl border border-[#82f58b]/20 bg-gradient-to-br from-[#82f58b]/[0.08] to-transparent p-4">
                    <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><CircleDollarSign size={15} className="text-[#82f58b]" />Recomendação comercial</h3>{result.fixedValue > 0 && <span className="text-sm font-black text-[#82f58b]">R$ {result.fixedValue}</span>}</div>
                    <p className="text-[11px] leading-5 text-white/50">{result.justification}</p>
                    {result.model === "COMISSÃO" && result.status !== "NÃO RECOMENDADA" && <p className="mt-2 text-[10px] font-semibold text-[#82f58b]">Referência: 45% sobre depósitos atribuídos.</p>}
                  </div>

                  {result.missing.length > 0 && <button onClick={() => setShowDetails(!showDetails)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/[0.07] p-3 text-left text-[10px] text-white/40"><span className="flex items-center gap-2"><Eye size={14} />{result.missing.length} dados adicionais recomendados</span><ChevronDown size={14} className={cn("transition-transform", showDetails && "rotate-180")} /></button>}
                  {showDetails && <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] leading-5 text-white/40">{result.missing.join(" · ")}</div>}

                  <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0a0d0b] p-4">
                    <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><Send size={14} className="text-[#82f58b]" />Primeiro contato</h3><span className="text-[9px] uppercase tracking-wider text-white/25">Gerador de copy</span></div>
                    <p className="min-h-20 text-[11px] leading-5 text-white/55">{result.copy}</p>
                    <button onClick={copyMessage} className="secondary-button mt-4 w-full">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Mensagem copiada" : "Copiar mensagem"}</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.07] p-5"><div><h2 className="text-sm font-semibold">Análises recentes</h2><p className="mt-1 text-[10px] text-white/30">Últimas avaliações comerciais da agência</p></div><button className="text-[10px] font-semibold text-[#82f58b]">Ver todas</button></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.14em] text-white/25"><th className="px-5 py-3 font-medium">Perfil</th><th className="px-4 py-3 font-medium">Seguidores</th><th className="px-4 py-3 font-medium">Engajamento</th><th className="px-4 py-3 font-medium">Nota</th><th className="px-4 py-3 font-medium">Decisão</th><th className="px-4 py-3 font-medium">Modelo</th></tr></thead>
                  <tbody>{recentProfiles.map((profile) => <tr key={profile.handle} className="border-b border-white/[0.05] text-xs transition-colors last:border-0 hover:bg-white/[0.025]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-white/10 to-white/[0.03] text-[10px] font-bold text-[#82f58b]">{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><p className="font-semibold text-white/80">{profile.name}</p><p className="mt-0.5 text-[10px] text-white/30">{profile.handle} · {profile.niche}</p></div></div></td><td className="px-4 py-4 text-white/55">{profile.followers}</td><td className="px-4 py-4 text-white/55">{profile.engagement}</td><td className="px-4 py-4"><span className={cn("font-bold", profile.score >= 70 ? "text-[#82f58b]" : "text-amber-300")}>{profile.score}</span><span className="text-[9px] text-white/20">/100</span></td><td className="px-4 py-4"><span className={cn("status-pill", profile.status === "APROVADA" ? "status-approved" : profile.status === "AVALIAR MELHOR" ? "status-review" : "status-rejected")}>{profile.status}</span></td><td className="px-4 py-4 text-white/50">{profile.model}</td></tr>)}</tbody>
                </table>
              </div>
            </div>

            <div className="panel p-5">
              <div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold">Pipeline comercial</h2><p className="mt-1 text-[10px] text-white/30">Distribuição das parcerias</p></div><button className="icon-button h-8 w-8"><ArrowUpRight size={14} /></button></div>
              <div className="mt-6 flex items-center justify-center">
                <div className="relative grid h-40 w-40 place-items-center rounded-full" style={{ background: "conic-gradient(#82f58b 0 42%, #4ade80 42% 68%, #a3e635 68% 84%, #33413a 84% 100%)" }}><div className="grid h-28 w-28 place-items-center rounded-full bg-[#0a0d0b] text-center"><div><p className="text-3xl font-black">27</p><p className="text-[9px] uppercase tracking-wider text-white/30">ativas</p></div></div></div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3">
                <LegendItem color="#82f58b" label="Aprovadas" value="46" />
                <LegendItem color="#4ade80" label="Em avaliação" value="18" />
                <LegendItem color="#a3e635" label="Negociação" value="9" />
                <LegendItem color="#33413a" label="Não recomendadas" value="7" />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, change, positive }: { icon: typeof Users; label: string; value: string; change: string; positive?: boolean }) {
  return <div className="panel group p-4 transition-colors hover:border-[#82f58b]/20 sm:p-5"><div className="flex items-start justify-between"><div className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/50"><Icon size={17} /></div><ArrowUpRight size={15} className="text-white/15 transition-colors group-hover:text-[#82f58b]" /></div><p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-white/30">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className="text-2xl font-bold tracking-tight">{value}</p><p className={cn("mb-1 text-[9px]", positive ? "text-[#82f58b]" : "text-white/30")}>{change}</p></div></div>;
}

function Field({ label, icon, placeholder, value, onChange }: { label: string; icon: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return <label className="field-label"><span>{label}</span><div className="field-wrap"><span className="field-icon">{icon}</span><input className="field-input field-input-plain" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></div></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="field-label"><span>{label}</span><div className="relative"><select className="field-input appearance-none pr-9" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, label]) => <option key={key} value={key} className="bg-[#0b0f0c]">{label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30" /></div></label>;
}

function InsightList({ title, items, positive }: { title: string; items: string[]; positive?: boolean }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><h3 className={cn("mb-2 text-[10px] font-semibold uppercase tracking-wider", positive ? "text-[#82f58b]" : "text-white/45")}>{title}</h3><ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-[10px] leading-4 text-white/38"><span className={cn("mt-1 h-1 w-1 shrink-0 rounded-full", positive ? "bg-[#82f58b]" : "bg-amber-300/70")} />{item}</li>)}</ul></div>;
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="flex items-center gap-2 text-[10px] text-white/35"><span className="h-2 w-2 rounded-full" style={{ background: color }} /><span className="flex-1">{label}</span><strong className="text-white/65">{value}</strong></div>;
}

function parseLocaleNumber(value: string) {
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(".", "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function calculateFactorScore(key: MetricKey, total: number) {
  const ratios: Record<MetricKey, number> = {
    engagement: 0.74,
    content: 0.68,
    conversion: 0.72,
    audience: 0.68,
    authenticity: 0.7,
    reach: 0.62,
  };
  const factor = scoreFactors.find((item) => item.key === key)!;
  return Math.min(factor.weight, Math.round(factor.weight * Math.min(1, Math.max(0.45, ratios[key] + (total - 70) / 250))));
}

function buildCopy({ identifier, niche, model, score, status }: { identifier: string; niche: string; model: Analysis["model"]; score: number; status: Analysis["status"] }) {
  const firstName = identifier.split(" ")[0];
  const nicheLabel = niche.toLowerCase();
  if (status === "NÃO RECOMENDADA") {
    return `Oi, ${firstName}! Sou da OKAI Influencer e acompanhamos o seu trabalho em ${nicheLabel}. Gostamos bastante da forma como você se conecta com a sua audiência. Podemos conversar sobre uma parceria com modelo de comissão?`;
  }
  if (model === "FIXO") {
    return `Oi, ${firstName}! Sou da OKAI Influencer. Adoramos o seu conteúdo sobre ${nicheLabel} e acredito que existe uma afinidade forte com o público que trabalhamos. Podemos apresentar uma proposta de parceria fixa para uma campanha?`;
  }
  return `Oi, ${firstName}! Sou da OKAI Influencer. Seu conteúdo sobre ${nicheLabel} tem uma relação muito boa com a nossa audiência, e essa parceria pode fazer sentido para os dois lados. Topa conversar sobre uma proposta por comissão?`;
}
