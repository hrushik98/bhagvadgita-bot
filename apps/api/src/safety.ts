// Detects messages that suggest the person may be in crisis, so the UI can show
// helplines alongside the answer. Deliberately broad: a false positive only
// shows a gentle support card.

const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid/i,
  /\bkill(ing)?\s+(myself|me)\b/i,
  /\bend(ing)?\s+(my\s+(own\s+)?life|it\s+all|everything)\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
  /\b(want|wanted|wanting|going)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|exist|wake\s+up)\b/i,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living)\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\bself[-\s]?harm/i,
  /\b(cut|cutting|hurt|hurting|harm|harming)\s+myself\b/i,
  /\b(aatmahatya|atmahatya|khudkushi|khudkhushi)\b/i,
  /आत्महत्या|ख़ुदकुशी|खुदकुशी|मरना\s+चाहत|जीना\s+नहीं\s+चाहत/,
];

export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}
