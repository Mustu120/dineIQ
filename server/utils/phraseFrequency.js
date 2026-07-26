// Common words that carry no meaning on their own ("the", "was", "and"...).
// Filtering these out is what keeps the word-frequency count useful.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "to", "of", "in", "on", "at",
  "is", "was", "were", "are", "be", "been", "it", "its", "this", "that",
  "i", "we", "they", "he", "she", "you", "my", "our", "their",
  "for", "with", "as", "not", "no", "very", "really", "just",
  "had", "have", "has", "did", "do", "does", "went", "got",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word));
}

// Counts how often each two-word phrase ("slow service", "cold food",
// "great atmosphere") appears across a set of review texts, and returns the
// most repeated ones. Works for any set of reviews -- pass positive reviews
// in to surface compliments, negative reviews in to surface complaints.
// Only phrases that show up more than once are considered a real pattern
// rather than a one-off comment.
function findFrequentPhrases(reviewTexts, topN = 5) {
  const phraseCounts = {};

  reviewTexts.forEach((text) => {
    const words = tokenize(text || "");
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  });

  return Object.entries(phraseCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase, count]) => ({ phrase, count }));
}

module.exports = findFrequentPhrases;
