module.exports = {
  locales: ["en", "da", "de", "es", "fr", "no", "pt", "se", "tl", "is" ,"it", "he", "tr", "hu", "th", "zh-CN"],
  defaultLocale: "en",
  pages: {
    "*": ["peppermint"],
  },
  // Next 14+ config schema only accepts false here (true breaks `next build`)
  localeDetection: false,
};
