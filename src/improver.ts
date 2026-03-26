import Groq from 'groq-sdk';
import { Message } from './sessions';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export async function improveCV(
  jd: string,
  cvText: string,
  chatHistory: Message[]
): Promise<string> {

  const conversationContext = chatHistory.length > 0
    ? `\nCONVERSATION CONTEXT (user's preferences and questions discussed):\n${chatHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`
    : '';

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: `You are a professional CV writer and career coach.

JOB DESCRIPTION:
${jd}

ORIGINAL CV:
${cvText}
${conversationContext}

Using the JD, the original CV, and any context from the conversation above, rewrite this CV. Rules:
- Do NOT fabricate experience or skills
- Add missing keywords naturally where they fit
- Use strong action verbs in bullet points
- Prioritize experience most relevant to the JD
- Incorporate any specific preferences the user mentioned in the conversation
- Keep same structure: Education, Experience, Skills, Projects

Return ONLY the improved CV text.`
      }
    ],
  });

  return response.choices[0].message.content!;
}