import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export interface Improvement {
  id: string;
  category: string;
  title: string;
  current: string;
  improved: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'quick' | 'medium' | 'long';
}

export interface ImprovementSuggestions {
  improvements: Improvement[];
  summary: string;
}

export async function generateImprovementSuggestions(
  jd: string,
  cvText: string,
  gaps: string[]
): Promise<ImprovementSuggestions> {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: `You are a CV expert. Provide specific, actionable improvements to make the CV match the JD better.

JD:
${jd.substring(0, 500)}

CURRENT CV:
${cvText.substring(0, 500)}

Key Gaps:
${gaps.join(', ')}

For each major gap, suggest a specific improvement with:
1. Category: (Experience | Skills | Keywords | Format | Achievements)
2. Title: Short title
3. Current: Example from CV
4. Improved: Your suggestion
5. Impact: high/medium/low
6. Effort: quick (< 1 hour)/medium (1-3 hours)/long (> 3 hours)

Return ONLY valid JSON (no markdown, no backticks):
{
  "improvements": [
    {
      "id": "imp_1",
      "category": "Category",
      "title": "Title",
      "current": "example",
      "improved": "suggested fix",
      "impact": "high",
      "effort": "quick"
    }
  ],
  "summary": "Overall strategy in 2 sentences"
}`,
      },
    ],
  });

  const text = response.choices[0].message.content!;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in improvement suggestions');

  return JSON.parse(jsonMatch[0]) as ImprovementSuggestions;
}

export function formatImprovementSuggestions(suggestions: ImprovementSuggestions): string {
  const sorted = [...suggestions.improvements].sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    const effortOrder = { quick: 0, medium: 1, long: 2 };
    return impactOrder[a.impact] - impactOrder[b.impact] || effortOrder[a.effort] - effortOrder[b.effort];
  });

  const improvementTexts = sorted.map((imp) => {
    const impactEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[imp.impact];
    const effortEmoji = { quick: '⚡', medium: '⏱️', long: '📚' }[imp.effort];

    return `
*${impactEmoji} ${imp.title}* ${effortEmoji}
Category: ${imp.category}

*Current:* \`${imp.current}\`
*Improved:* \`${imp.improved}\`
    `.trim();
  });

  return `
*💡 Actionable Improvement Suggestions*

${suggestions.summary}

---

${improvementTexts.join('\n\n')}

Use these tips to quickly boost your match score!
  `.trim();
}
