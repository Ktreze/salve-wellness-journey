import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AnalysisRequest = {
  analysisId?: string;
  profile?: {
    handle?: string;
    name?: string;
    niche?: string;
    followers?: string;
    engagement?: string;
    views?: string;
    frequency?: string;
    history?: string;
    observations?: string;
    audience?: string;
    authenticity?: string;
    conversion?: string;
    contentQuality?: string;
  };
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: string) {
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fallbackResult(profile: AnalysisRequest["profile"], missing: string[], imageCount: number) {
  const engagement = safeNumber(textValue(profile?.engagement));
  const views = safeNumber(textValue(profile?.views));
  const followers = safeNumber(textValue(profile?.followers));
  const engagementScore = engagement ? clamp(Math.round((engagement / 8) * 20), 0, 20) : 8;
  const contentScore = profile?.contentQuality === "alta" ? 15 : profile?.contentQuality === "baixa" ? 5 : 10;
  const conversionScore = profile?.conversion === "alta" ? 25 : profile?.conversion === "baixa" ? 5 : profile?.conversion === "media" ? 16 : 8;
  const audienceScore = profile?.audience === "alta" ? 15 : profile?.audience === "incompativel" ? 3 : 9;
  const authenticityScore = profile?.authenticity === "alta" ? 15 : profile?.authenticity === "baixa" ? 3 : profile?.authenticity === "suspeita" ? 6 : 10;
  const reachScore = views ? clamp(Math.round((views / Math.max(followers, 1)) * 30), 0, 10) : followers > 100000 ? 6 : 5;
  const score = clamp(Math.round(engagementScore + contentScore + conversionScore + audienceScore + authenticityScore + reachScore), 0, 100);
  const status = score >= 75 ? "APROVADA" : score >= 58 ? "AVALIAR MELHOR" : "NÃO RECOMENDADA";
  const model = status === "NÃO RECOMENDADA" ? "COMISSÃO" : score >= 82 && profile?.authenticity !== "suspeita" ? "FIXO" : "COMISSÃO";
  const fixedValue = score >= 90 ? 70 : score >= 82 ? 60 : score >= 74 ? 50 : 0;
  return { score, status, model, fixedValue, confidence: Math.min(75, 45 + imageCount * 4), positives: ["Perfil recebido para avaliação comercial."], negatives: ["A análise multimodal não está disponível neste ambiente."], missing, justification: "A análise não pôde ser concluída por uma chamada de IA. A pontuação exibida é apenas um fallback técnico e não deve ser usada como decisão comercial final.", copy: "", risks: ["Análise de IA indisponível; não tomar decisão comercial com este resultado."] };
}

async function callOpenAI(profile: AnalysisRequest["profile"], images: Array<{ mimeType: string; data: string }>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada. Configure o segredo no Supabase antes de iniciar uma análise.");

  const prompt = `Você é o gestor comercial da OKAI Influencer AI. Analise a influenciadora usando somente os dados fornecidos e as imagens disponibilizadas. Não invente métricas, não afirme que seguidores são falsos sem evidência e classifique cada item como verificado, estimativa ou indisponível.\n\nDados do perfil:\n${JSON.stringify(profile, null, 2)}\n\nImagens recebidas: ${images.length}.\n\nAvalie estes fatores com os pesos fixos: engajamento 20, qualidade e consistência do conteúdo 15, potencial de conversão 25, qualidade e compatibilidade da audiência 15, autenticidade aparente 15, alcance e distribuição 10. A quantidade de seguidores nunca decide sozinha.\n\nRegras comerciais: comissão de 45% sobre depósitos atribuídos; pagamento fixo entre R$ 50 e R$ 70 apenas quando o perfil tiver alta qualidade comercial, e nunca apenas por ter muitos seguidores; caso o custo-benefício seja ruim, recomende NÃO RECOMENDADA. Status: APROVADA para nota >= 75, AVALIAR MELHOR para 58-74 e NÃO RECOMENDADA abaixo de 58.\n\nRetorne SOMENTE JSON válido com esta estrutura: {"score":0,"confidence":0,"status":"APROVADA|AVALIAR MELHOR|NÃO RECOMENDADA","model":"COMISSÃO|FIXO","fixedValue":0,"positives":[""],"negatives":[""],"missing":[""],"risks":[""],"justification":"","commercialPotential":"","copy":"","report":{"identification":"","followers":"","contentCharacteristics":"","engagementAnalysis":"","authenticityAnalysis":"","audienceCompatibility":"","reachAnalysis":"","dataAvailability":""}}.`;

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  for (const image of images) content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4o-mini", temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
  });
  if (!response.ok) throw new Error(`A API de IA respondeu com erro ${response.status}.`);
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("A API de IA não retornou um relatório válido.");
  return JSON.parse(raw);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração administrativa do Supabase ausente no servidor." }, 500);

  try {
    const body = await request.json() as AnalysisRequest;
    const analysisId = textValue(body.analysisId);
    const profile = body.profile || {};
    if (!analysisId) return json({ error: "A identificação da análise é obrigatória." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: files, error: listError } = await admin.storage.from("influencer-analysis").list(analysisId, { limit: 50 });
    if (listError) throw new Error(`Não foi possível consultar os materiais: ${listError.message}`);

    const images: Array<{ mimeType: string; data: string }> = [];
    for (const file of files || []) {
      if (!file.name || file.name.endsWith("/")) continue;
      const { data, error: downloadError } = await admin.storage.from("influencer-analysis").download(`${analysisId}/${file.name}`);
      if (downloadError) throw new Error(`Falha ao baixar ${file.name}: ${downloadError.message}`);
      const buffer = await data.arrayBuffer();
      let bytes = new Uint8Array(buffer);
      const mimeType = file.metadata?.mimetype || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      let binary = "";
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      images.push({ mimeType, data: btoa(binary) });
    }

    const missing: string[] = [];
    if (!textValue(profile.followers)) missing.push("Seguidores.");
    if (!textValue(profile.engagement)) missing.push("Engajamento médio.");
    if (!textValue(profile.views)) missing.push("Visualizações de Reels ou Stories.");
    if (!textValue(profile.frequency)) missing.push("Frequência de publicação.");
    if (!textValue(profile.history)) missing.push("Histórico de publicidade.");
    if (!textValue(profile.observations)) missing.push("Observações visuais.");

    let result;
    try {
      result = await callOpenAI(profile, images);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha inesperada na chamada de IA.";
      if (message.includes("OPENAI_API_KEY")) return json({ error: message }, 401);
      result = fallbackResult(profile, missing, images.length);
      result.error = message;
    }

    const score = clamp(Number(result?.score) || 0, 0, 100);
    const status = score >= 75 ? "APROVADA" : score >= 58 ? "AVALIAR MELHOR" : "NÃO RECOMENDADA";
    const model = score >= 82 && profile.authenticity !== "suspeita" ? "FIXO" : "COMISSÃO";
    const fixedValue = score >= 90 ? 70 : score >= 82 ? 60 : score >= 74 ? 50 : 0;
    result.score = score;
    result.status = status;
    result.model = model;
    result.fixedValue = fixedValue;
    result.confidence = clamp(Number(result?.confidence) || 0, 0, 100);
    result.missing = Array.isArray(result?.missing) ? result.missing : missing;
    result.positives = Array.isArray(result?.positives) ? result.positives : [];
    result.negatives = Array.isArray(result?.negatives) ? result.negatives : [];
    result.risks = Array.isArray(result?.risks) ? result.risks : [];
    result.report = result?.report || {};
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao analisar a influenciadora.";
    return json({ error: message }, 500);
  }
});
