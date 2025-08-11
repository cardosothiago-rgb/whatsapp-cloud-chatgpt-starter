import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const META_TOKEN = process.env.META_TOKEN;               // Token permanente da Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;     // ID do número do WhatsApp
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;  // Seu token de verificação do webhook

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function sendWhatsAppText(to, body) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${META_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("WhatsApp send error:", resp.status, errText);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Verificação do webhook
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Verification failed");
  }

  if (req.method === "POST") {
    try {
      const entry = req.body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (Array.isArray(messages)) {
        for (const msg of messages) {
          const from = msg.from;
          const text = msg.text?.body;
          if (from && text) {
            // Prompt do atendente no seu tom e regras do estúdio
            const systemPrompt = `Você é o atendente do estúdio de tatuagem do Thiago Cardoso (realismo preto e cinza, Zona Norte de SP).
- Seja direto, educado e vendedor, sem rodeios. PT-BR sempre.
- Coleta mínima: região do corpo + tamanho em cm + referência (se houver).
- Não passe preço fechado sem contexto; ofereça faixa e convide a enviar detalhes.
- Use CTAs fortes, urgência responsável e proponha horários disponíveis (qui/sex 14-20h; sáb 9-13h).
- Se perguntarem sobre estilos delicados/femininos, explique que a Fabi é especialista (fine line), com orçamentos próprios.
- Não prometa desenho antecipado; composições são definidas na sessão.
- Se a conversa esfriar, ofereça reservar horário com nome completo.`;

            const completion = await openai.chat.completions.create({
              model: OPENAI_MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
              ],
              temperature: 0.6,
              max_tokens: 300
            });

            const reply = completion.choices?.[0]?.message?.content?.trim()
              || "Olá! Pra te passar valores e datas, me diz a região do corpo e o tamanho em cm. Se tiver referência, manda aqui! :)";

            await sendWhatsAppText(from, reply);
          }
        }
      }

      return res.status(200).json({ status: "ok" });
    } catch (e) {
      console.error("POST webhook error:", e);
      return res.status(200).json({ status: "ok" }); // reconhece pra evitar retry
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).send("Method Not Allowed");
}
