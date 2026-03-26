import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export async function improveCV(jd: string, cvText: string): Promise<string> {
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

Rewrite this CV to be better tailored for the JD. Rules:
- Keep all real experience and facts, do NOT fabricate
- Add missing keywords naturally where they fit
- Improve bullet points with strong action verbs
- Keep same structure (Education, Experience, Skills, Projects)

Return ONLY the improved CV text.`
      }
    ],
  });

  return response.choices[0].message.content!;
}