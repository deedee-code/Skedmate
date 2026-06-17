const HF_API_URL =
  'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are Skedmate, a friendly WhatsApp scheduling assistant buddy. Your job is to help users schedule messages, set reminders, and manage broadcasts. Keep replies short, warm, and conversational — like a helpful friend, not a robot. If the user's intent is unclear, ask one simple clarifying question. Never use markdown formatting — plain text only since this is WhatsApp.`;

/**
 * Call HuggingFace Mistral 7B to handle unrecognised / freeform messages.
 * Only used when the user's input doesn't match any menu-driven flow.
 */
export async function getAIReply(
  userMessage: string,
  conversationHistory: ConversationMessage[] = []
): Promise<string> {
  const historyText = conversationHistory
    .map((m) => `${m.role === 'user' ? 'User' : 'Skedmate'}: ${m.content}`)
    .join('\n');

  const prompt = `<s>[INST] ${SYSTEM_PROMPT}\n\nConversation so far:\n${historyText}\n\nUser: ${userMessage} [/INST]`;

  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      console.error('[HuggingFace] API error:', response.status, await response.text());
      return fallbackReply();
    }

    const data = (await response.json()) as Array<{ generated_text?: string }>;
    const text = data[0]?.generated_text?.trim();
    return text || fallbackReply();
  } catch (err) {
    console.error('[HuggingFace] Request failed:', err);
    return fallbackReply();
  }
}

function fallbackReply(): string {
  return "Sorry, I didn't catch that. Could you say that again? 😊";
}
