import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export interface SkillGap {
  skill: string;
  severity: 'critical' | 'important' | 'nice_to_have';
  effort: 'quick_win' | 'medium' | 'long_term';
  suggestion: string;
}

export interface SkillsGapAnalysis {
  critical: SkillGap[];
  important: SkillGap[];
  niceToHave: SkillGap[];
  quickWins: SkillGap[];
  longTermGrowth: string[];
}

export async function analyzeSkillsGap(
  jd: string,
  cvText: string,
  missingKeywords: string[]
): Promise<SkillsGapAnalysis> {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'user',
        content: `You are a career strategist. Analyze the skill gaps between a CV and a job description.

JD:
${jd}

CV:
${cvText}

Missing Keywords from Analysis:
${missingKeywords.join(', ')}

For each missing keyword/skill, categorize it as:
- severity: 'critical' (deal-breaker), 'important' (strongly preferred), or 'nice_to_have' (bonus)
- effort: 'quick_win' (can learn/add in < 1 week), 'medium' (2-4 weeks), or 'long_term' (3+ months)
- suggestion: Brief actionable tip

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "gaps": [
    {
      "skill": "skill name",
      "severity": "critical|important|nice_to_have",
      "effort": "quick_win|medium|long_term",
      "suggestion": "actionable tip"
    }
  ],
  "quickWinsExamples": ["example 1", "example 2"],
  "longTermRecommendations": ["recommendation 1", "recommendation 2"]
}`,
      },
    ],
  });

  const text = response.choices[0].message.content!;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in gap analysis response');

  const parsed = JSON.parse(jsonMatch[0]);

  // Organize gaps by severity and effort
  const analysis: SkillsGapAnalysis = {
    critical: [],
    important: [],
    niceToHave: [],
    quickWins: [],
    longTermGrowth: parsed.longTermRecommendations || [],
  };

  for (const gap of parsed.gaps) {
    const skillGap: SkillGap = {
      skill: gap.skill,
      severity: gap.severity,
      effort: gap.effort,
      suggestion: gap.suggestion,
    };

    if (gap.severity === 'critical') {
      analysis.critical.push(skillGap);
    } else if (gap.severity === 'important') {
      analysis.important.push(skillGap);
    } else {
      analysis.niceToHave.push(skillGap);
    }

    if (gap.effort === 'quick_win') {
      analysis.quickWins.push(skillGap);
    }
  }

  return analysis;
}

export function formatSkillsGapReport(analysis: SkillsGapAnalysis): string {
  const formatGaps = (gaps: SkillGap[], title: string, emoji: string) => {
    if (gaps.length === 0) return '';
    return `${emoji} *${title}* (${gaps.length})\n${gaps.map(g => `• ${g.skill} - ${g.suggestion}`).join('\n')}`;
  };

  const sections = [
    formatGaps(analysis.critical, 'CRITICAL GAPS', '🚨'),
    formatGaps(analysis.important, 'Important Skills to Add', '⚠️'),
    formatGaps(analysis.niceToHave, 'Nice-to-Have Skills', '✨'),
  ].filter(Boolean);

  let report = `*📊 Skills Gap Breakdown*\n\n${sections.join('\n\n')}`;

  if (analysis.quickWins.length > 0) {
    report += `\n\n*⚡ Quick Wins (Can do this week):*\n${analysis.quickWins.map(w => `• ${w.skill} - ${w.suggestion}`).join('\n')}`;
  }

  if (analysis.longTermGrowth.length > 0) {
    report += `\n\n*📚 Long-Term Growth Path (3-6 months):*\n${analysis.longTermGrowth.map(r => `• ${r}`).join('\n')}`;
  }

  return report;
}
