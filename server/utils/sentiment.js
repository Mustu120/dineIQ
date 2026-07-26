const Sentiment = require("sentiment");

const analyzer = new Sentiment();

// Turns a raw comparative score into a label. Pulled out on its own so the
// restaurant summary feature can classify already-stored scores the same
// way new reviews get classified.
function classifySentiment(score) {
  if (score > 0.1) return "positive";
  if (score < -0.1) return "negative";
  return "neutral";
}

// Scores a piece of review text and classifies it as positive/neutral/negative.
//
// `comparative` is the raw AFINN score divided by word count, so a short
// review and a long review are judged on the same scale -- that's the
// number we store in reviews.sentiment_score.
function analyzeSentiment(reviewText) {
  const result = analyzer.analyze(reviewText || "");
  const score = result.comparative;

  return { score, label: classifySentiment(score) };
}

module.exports = { analyzeSentiment, classifySentiment };
