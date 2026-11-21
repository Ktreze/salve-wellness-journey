import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash";
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 10;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMissingData(profile: AnalysisRequest["profile"]) {
  const missing: string[] = [];
  if (!textValue(profile?.followers)) missing.push("Seguidores.");
  if (!textValue(profile?.engagement)) missing.push("Engajamento médio.");
  if (!textValue(profile?.views)) missing.push("Visualizações de Reels ou Stories.");
  if (!textValue(profile?.frequency)) missing.push("Frequência de publicação.");
  if (!textValue(profile?.history)) missing.push("Histórico de publicidade.");
  if (!textValue(profile?.observations)) missing.push("Observações visuais.");
  return missing;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function detectImageType(fileName: string, metadataType?: string) {
  const normalizedType = metadataType?.toLowerCase();
  if (normalizedType && ALLOWED_IMAGE_TYPES.has(normalizedType)) return normalizedType;

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function buildPrompt(profile: AnalysisRequest["profile"], imageCount: number) {
  return `Você é o gestor comercial sênior da OKAI Influencer AI. Analise a influenciadora usando exclusivamente os dados informados e as imagens anexadas. Não invente métricas. Não afirme que seguidores são falsos ou que há engajamento artificial sem evidência visível. Quando uma informação não estiver disponível, registre-a como indisponível e reduza a confiança.

Dados preenchidos pelo gestor:
${JSON.stringify(profile, null, 2)}

Quantidade de imagens analisadas: ${imageCount}.

Critérios e pesos obrigatórios:
- Engajamento e interações: 20 pontos.
- Qualidade e consistência do conteúdo: 15 pontos.
- Potencial de conversão: 25 pontos.
- Qualidade e compatibilidade da audiência: 15 pontos.
- Autenticidade aparente: 15 pontos.
- Alcance e distribuição de conteúdo: 10 pontos.
A quantidade de seguidores é apenas contexto e nunca decide sozinha.

Regras comerciais obrigatórias:
- Comissão: referência de 45% sobre os depósitos atribuídos à rede da influenciadora.
- Parceria fixa: somente quando o perfil demonstrar potencial comercial suficiente, sempre entre R$ 50 e R$ 70; um perfil pequeno pode receber proposta fixa e um perfil grande não recebe pagamento fixo automaticamente.
- Recusa: recomende NÃO RECOMENDADA quando houver baixo potencial comercial, sinais fundamentados de engajamento suspeito, audiência incompatível ou custo-benefício desfavorável.
- APROVADA: nota de 75 a 100.
- AVALIAR MELHOR: nota de 58 a 74.
- NÃO RECOMENDADA: nota de 0 a 57.

As imagens podem conter perfil, publicações, comentários, Stories e métricas. Extraia somente o que estiver visualmente legível. Diferencie dados verificados, estimativas e informações indisponíveis. Avalie qualidade visual, nicho, autenticidade aparente, compatibilidade da audiência, sinais de conversão, alcance e riscos comerciais.

Retorne SOMENTE um objeto JSON válido, sem markdown, com esta estrutura:
{
  "score": 0,
  "confidence": 0,
  "status": "APROVADA | AVALIAR MELHOR | NÃO RECOMENDADA",
  "model": "COMISSÃO | FIXO",
  "fixedValue": 0,
  "commercialPotential": "",
  "positives": [],
  "negatives": [],
  "missing": [],
  "risks": [],
  "justification": "",
  "copy": "",
  "report": {
    "identification": "",
    "followers": "",
    "contentCharacteristics": "",
    "engagementAnalysis": "",
    "authenticityAnalysis": "",
    "audienceCompatibility": "",
    "reachAnalysis": "",
    "dataAvailability": ""
  }
}`;
}

async function callLovableAI(
  profile: AnalysisRequest["profile"],
  images: Array<{ mimeType: string; data: string }>,
) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Lovable AI não está habilitada ou acessível nesta Edge Function. Habilite Lovable AI em Lovable Cloud e disponibilize o segredo gerenciado LOVABLE_API_KEY nas Edge Functions.",
    );
  }

  const model = Deno.env.get("LOVABLE_AI_MODEL") || DEFAULT_VISION_MODEL;
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: buildPrompt(profile, images.length) },
  ];

  for (const image of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    });
  }

  const response = await fetch(LOVABLE_AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let detail = errorBody;
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string }; message?: string };
      detail = parsed.error?.message || parsed.message || errorBody;
    } catch {
      // A resposta original será exibida de forma segura abaixo.
    }
    throw new Error(`Lovable AI respondeu com erro ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Lovable AI não retornou um relatório de análise.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Lovable AI retornou um relatório fora do formato JSON esperado.");
  }

  return parsed;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Configuração administrativa do Supabase ausente no servidor." }, 500);
  }

  try {
    const body = (await request.json()) as AnalysisRequest;
    const analysisId = textValue(body.analysisId);
    const profile = body.profile || {};
    if (!analysisId) return json({ error: "A identificação da análise é obrigatória." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: files, error: listError } = await admin.storage
      .from("influencer-analysis")
      .list(analysisId, { limit: MAX_IMAGES });
    if (listError) {
      throw new Error(`Não foi possível consultar os materiais: ${listError.message}`);
    }

    const imageFiles = (files || []).filter((file) => file.name && !file.name.endsWith("/"));
    if (imageFiles.length > MAX_IMAGES) {
      throw new Error(`A análise aceita no máximo ${MAX_IMAGES} imagens.`);
    }

    const images: Array<{ mimeType: string; data: string }> = [];
    for (const file of imageFiles) {
      const mimeType = detectImageType(file.name, file.metadata?.mimetype);
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        throw new Error(`Formato não permitido no material ${file.name}. Use PNG, JPG, JPEG ou WEBP.`);
      }

      const { data, error: downloadError } = await admin.storage
        .from("influencer-analysis")
        .download(`${analysisId}/${file.name}`);
      if (downloadError) {
        throw new Error(`Falha ao recuperar ${file.name}: ${downloadError.message}`);
      }
      if (data.size > MAX_FILE_SIZE) {
        throw new Error(`O material ${file.name} excede o limite de 10 MB.`);
      }

      images.push({ mimeType, data: arrayBufferToBase64(await data.arrayBuffer()) });
    }

    const result = await callLovableAI(profile, images);
    const score = clamp(Number(result.score) || 0, 0, 100);
    const status = score >= 75 ? "APROVADA" : score >= 58 ? "AVALIAR MELHOR" : "NÃO RECOMENDADA";
    const model = score >= 82 && profile.authenticity !== "suspeita" ? "FIXO" : "COMISSÃO";
    const fixedValue = score >= 90 ? 70 : score >= 82 ? 60 : score >= 74 ? 50 : 0;
    const missing = getMissingData(profile);

    result.score = score;
    result.status = status;
    result.model = model;
    result.fixedValue = fixedValue;
    result.confidence = clamp(Number(result.confidence) || 0, 0, 100);
    result.missing = Array.isArray(result.missing) ? result.missing : missing;
    result.positives = Array.isArray(result.positives) ? result.positives : [];
    result.negatives = Array.isArray(result.negatives) ? result.negatives : [];
    result.risks = Array.isArray(result.risks) ? result.risks : [];
    result.report = result.report || {};

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao analisar a influenciadora.";
    return json({ error: message }, 500);
  }
});
