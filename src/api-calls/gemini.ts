import { z } from 'zod';
import { AppError } from '../middleware/error.middleware';

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY es requerida'),
});

const env = envSchema.parse(process.env);

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const FETCH_TIMEOUT_MS = 15000;
// Baja a propósito: menos alucinaciones, respuestas más apegadas a los datos reales del usuario.
const TEMPERATURE = 0.2;
// Limita el largo de la respuesta para acotar costo y latencia.
const MAX_OUTPUT_TOKENS = 500;

// content es opcional: Gemini devuelve un candidate sin content cuando
// bloquea la respuesta por seguridad (solo viene finishReason).
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string() })).min(1),
          })
          .optional(),
      })
    )
    .min(1)
    .optional(),
});

// Llama a Gemini con el system prompt y el mensaje (ya sanitizado) del usuario,
// y devuelve solo el texto de la respuesta. Lanza AppError si Gemini falla,
// devuelve un formato inesperado, o bloquea la respuesta por seguridad.
export async function generateChatReply(systemInstruction: string, userMessage: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: TEMPERATURE,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Gemini respondió con status ${response.status}`);
      throw new AppError('CHATBOT_UNAVAILABLE', 'El chatbot no está disponible en este momento, intentá de nuevo más tarde', 503);
    }

    let data: z.infer<typeof geminiResponseSchema>;
    try {
      data = geminiResponseSchema.parse(await response.json());
    } catch (parseError) {
      console.error('Gemini: la respuesta no tiene el formato esperado', parseError);
      throw new AppError('CHATBOT_UNAVAILABLE', 'El chatbot no está disponible en este momento, intentá de nuevo más tarde', 503);
    }

    const firstCandidate = data.candidates?.[0];

    // Sin candidates o sin content: Gemini bloqueó la respuesta por seguridad
    if (!firstCandidate?.content) {
      throw new AppError('CHATBOT_BLOCKED', 'No pude generar una respuesta para ese mensaje, intentá reformularlo', 502);
    }

    return firstCandidate.content.parts
      .map((part) => part.text)
      .join('')
      .trim();
  } finally {
    clearTimeout(timeout);
  }
}
