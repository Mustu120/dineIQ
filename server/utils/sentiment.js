const Sentiment = require("sentiment");

const analyzer = new Sentiment();

// Turns a raw comparative score (and, when known, the reviewer's own star
// rating) into a label. The star rating is the stronger signal by far --
// it's the reviewer's own direct verdict, not a guess from word-counting
// -- so it takes priority: 1-2 stars is always negative, 4-5 is always
// positive, and only a genuinely ambiguous 3-star review falls back to
// the text's own tone as a tiebreaker. Without word-order or negation
// handling, AFINN-style scoring alone can misread a mixed review (an
// early compliment followed by paragraphs of complaints scores as
// "positive" if the nice words outnumber the harsh ones) -- exactly the
// failure mode Phase 10.7 of the build guide calls out, and exactly what
// a 2-star review is supposed to prevent.
function classifySentiment(score, rating) {
  if (rating != null) {
    if (rating <= 2) return "negative";
    if (rating >= 4) return "positive";
  }
  if (score > 0.1) return "positive";
  if (score < -0.1) return "negative";
  return "neutral";
}

// Scores a piece of review text and classifies it as positive/neutral/negative.
//
// `comparative` is the raw AFINN score divided by word count, so a short
// review and a long review are judged on the same scale -- that's the
// number we store in reviews.sentiment_score. `rating`, when passed, is
// the reviewer's own star rating -- see classifySentiment above for why
// it takes priority over the text score for labelling.
function analyzeSentiment(reviewText, rating) {
  const result = analyzer.analyze(reviewText || "");
  const score = result.comparative;

  return { score, label: classifySentiment(score, rating) };
}

module.exports = { analyzeSentiment, classifySentiment };
