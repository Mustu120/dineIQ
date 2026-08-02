// The bigram phrase-repeat approach in phraseFrequency.js works well on
// short, templated text but finds almost nothing on small samples of
// genuinely varied real reviews -- Google caps every place at 5 reviews,
// and real people rarely repeat the exact same two words verbatim. This
// is the fix: instead of requiring a literal repeated phrase, pull out
// the most representative whole SENTENCES from the reviews themselves
// (extractive summarisation -- Phase 12 of the build guide). Nothing is
// generated or paraphrased, so it can't hallucinate; it's just picking
// the sentences that best represent what most reviews are actually
// saying, the same idea as a TF-IDF centroid but simplified to plain
// word-frequency scoring since a handful of reviews doesn't need a full
// vectoriser.

// Beyond ordinary stopwords, words that are near-universal *within
// restaurant reviews specifically* ("food", "restaurant", "place"...)
// would otherwise dominate every sentence's score just for being
// present, the same distortion IDF corrects for at corpus scale -- with
// only a handful of documents here, it's cheaper to just list them.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "to", "of", "in", "on", "at",
  "is", "was", "were", "are", "be", "been", "it", "its", "this", "that",
  "i", "we", "they", "he", "she", "you", "my", "our", "their", "here",
  "for", "with", "as", "not", "no", "very", "really", "just", "also",
  "had", "have", "has", "did", "do", "does", "went", "got", "get",
  "food", "restaurant", "place", "order", "ordered", "menu", "visit",
  "visited", "would", "will", "one", "us", "if", "all", "out", "up",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word));
}

// Splits on sentence-ending punctuation followed by whitespace, then
// discards fragments too short to carry a real opinion or long enough to
// be an entire multi-paragraph review dumped in as "one sentence".
function splitSentences(text) {
  return (text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      const wordCount = s.split(/\s+/).length;
      return wordCount >= 5 && wordCount <= 40;
    });
}

// Returns up to maxSentences real sentences, pulled verbatim from
// reviewTexts, ranked by how representative they are of the set as a
// whole (average frequency of their own words across all the sentences
// considered). Pass positive reviews in for compliment highlights,
// negative reviews in for complaint highlights.
function summarise(reviewTexts, maxSentences = 2) {
  const sentences = reviewTexts.flatMap(splitSentences);
  if (sentences.length === 0) return [];

  const sentenceWords = sentences.map(tokenize);
  const wordFrequency = {};
  sentenceWords.forEach((words) => words.forEach((w) => (wordFrequency[w] = (wordFrequency[w] || 0) + 1)));

  const scored = sentences.map((sentence, i) => {
    const words = sentenceWords[i];
    const score = words.length ? words.reduce((sum, w) => sum + wordFrequency[w], 0) / words.length : 0;
    return { sentence, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const picked = [];
  for (const { sentence } of scored) {
    const key = sentence.toLowerCase().replace(/[^a-z]/g, "").slice(0, 40);
    if (seen.has(key)) continue; // near-duplicate opening -- skip
    seen.add(key);
    picked.push(sentence);
    if (picked.length >= maxSentences) break;
  }

  return picked;
}

module.exports = { summarise };
