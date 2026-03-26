import Groq from 'groq-sdk';
import { Message } from './sessions';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export interface ConversationalResponse {
  answer: string;
  suggestedFollowUp: string[];
}

export async function generateConversationalResponse(
  userMessage: string,
  jd: string,
  cvText: string,
  chatHistory: Message[]
): Promise<ConversationalResponse> {
  const systemPrompt = `You are an expert career coach and resume advisor having a conversational interview with a candidate.

CONTEXT:
- Job Description: ${jd}
- Candidate's CV: ${cvText}
- Conversation so far: ${chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Your goals:
1. Answer questions about the role, CV, or career strategy
2. Be conversational and engaging (not robotic)
3. When discussing skills gaps, suggest practical solutions
4. Reference specific parts of their CV when relevant
5. Ask clarifying questions if needed
6. Provide actionable advice

Also suggest 2-3 follow-up questions they could ask to deepen the analysis.

Format your response as JSON:
{
  "answer": "Your conversational response here",
  "suggestedFollowUp": [
    "Follow-up question 1?",
    "Follow-up question 2?",
    "Follow-up question 3?"
  ]
}`;

  const messages = [
    ...chatHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  const content = response.choices[0].message.content!;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      answer: content,
      suggestedFollowUp: [],
    };
  }

  return JSON.parse(jsonMatch[0]) as ConversationalResponse;
}

export async function generateInterviewQuestions(jd: string, cvText: string): Promise<string[]> {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: `Based on this job description and resume, generate 5 likely interview questions the interviewer might ask:

JD:
${jd.substring(0, 500)}

CV:
${cvText.substring(0, 500)}

Return ONLY a JSON array of strings, no markdown:
["question1", "question2", "question3", "question4", "question5"]`,
      },
    ],
  });

  const content = response.choices[0].message.content!;
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as string[];
}

export function formatInterviewPrep(questions: string[]): string {
  const formatted = questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n');
  return `
*🎯 Likely Interview Questions*

Based on your CV and the job description, here are 5 questions you should prepare for:

${formatted}

*Tip:* Use the STAR method (Situation, Task, Action, Result) to answer technical questions. Reference specific projects from your CV.
  `.trim();
}
