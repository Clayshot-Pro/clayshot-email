/** Conservative, optional local heuristic. Only moves messages to Junk; never rejects mail. */
export function suspectedJunk(subject: string, sender: string, preview: string): boolean {
  const title = subject.slice(0, 500).toLowerCase();
  const source = sender.slice(0, 320).toLowerCase();
  const excerpt = preview.slice(0, 4000).toLowerCase();
  let score = 0;
  if (/(?:lottery winner|crypto giveaway|free money|guaranteed profit|claim your prize|wire transfer immediately)/i.test(title)) score += 3;
  if (/(?:send.*gift cards|bitcoin wallet|recover your account now|secret inheritance|verify your banking password)/i.test(excerpt)) score += 3;
  if (/(?:!!!|\$\$\$)/.test(title)) score += 1;
  if (/^(?:no-?reply|notification)@/.test(source) && /(urgent|verify account|account suspended)/.test(title)) score += 1;
  if (/(?:bitcoin|crypto|investment)/.test(title) && /(guaranteed|profit|instant|double)/.test(title)) score += 2;
  return score >= 4;
}
