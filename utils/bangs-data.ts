export interface Bang {
  name: string;
  url: string;
  main?: string;
}

export type BangsData = Record<string, Bang>;

export const LOCAL_BANGS: BangsData = {
  "!chat": {
    "name": "Tekir Chat",
    "url": "https://chat.tekir.co/?q={search}",
    "main": "https://chat.tekir.co/"
  },
  "!tekir": {
    "name": "Tekir",
    "url": "https://tekir.co/search?q={search}",
    "main": "https://tekir.co/"
  },
  "!g": {
    "name": "Google",
    "url": "https://www.google.com/search?q={search}",
    "main": "https://www.google.com/"
  },
  "!yt": {
    "name": "YouTube",
    "url": "https://www.youtube.com/results?search_query={search}",
    "main": "https://www.youtube.com/"
  },
  "!gh": {
    "name": "GitHub",
    "url": "https://github.com/search?q={search}",
    "main": "https://github.com/"
  },
  "!w": {
    "name": "Wikipedia",
    "url": "https://en.wikipedia.org/wiki/Special:Search?search={search}",
    "main": "https://en.wikipedia.org/"
  },
  "!a": {
    "name": "Amazon",
    "url": "https://www.amazon.com/s?k={search}",
    "main": "https://www.amazon.com/"
  },
  "!m": {
    "name": "Maps",
    "url": "https://www.google.com/maps/search/{search}",
    "main": "https://www.google.com/maps/"
  },
  "!r": {
    "name": "Reddit",
    "url": "https://www.reddit.com/search/?q={search}",
    "main": "https://www.reddit.com/"
  },
  "!tw": {
    "name": "Twitter",
    "url": "https://twitter.com/search?q={search}",
    "main": "https://twitter.com/"
  },
  "!ddg": {
    "name": "DuckDuckGo",
    "url": "https://duckduckgo.com/?q={search}",
    "main": "https://duckduckgo.com/"
  },
  "!so": {
    "name": "Stack Overflow",
    "url": "https://stackoverflow.com/search?q={search}",
    "main": "https://stackoverflow.com/"
  },
  "!npm": {
    "name": "npm",
    "url": "https://www.npmjs.com/search?q={search}",
    "main": "https://www.npmjs.com/"
  },
  "!mdn": {
    "name": "MDN",
    "url": "https://developer.mozilla.org/en-US/search?q={search}",
    "main": "https://developer.mozilla.org/"
  },
  "!docker": {
    "name": "Docker Hub",
    "url": "https://hub.docker.com/search?q={search}",
    "main": "https://hub.docker.com/"
  },
  "!btt": {
    "name": "Bilinçli Teknloji Tüketicileri",
    "url": "https://btt.community/search?q={search}",
    "main": "https://btt.community/"
  },
  "!b": {
    "name": "Bing",
    "url": "https://www.bing.com/search?q={search}",
    "main": "https://www.bing.com/"
  },
  "!y": {
    "name": "Yahoo",
    "url": "https://search.yahoo.com/search?p={search}",
    "main": "https://www.yahoo.com/"
  },
  "!baidu": {
    "name": "Baidu",
    "url": "https://www.baidu.com/s?wd={search}",
    "main": "https://www.baidu.com/"
  },
  "!fb": {
    "name": "Facebook",
    "url": "https://www.facebook.com/search/top/?q={search}",
    "main": "https://www.facebook.com/"
  },
  "!pin": {
    "name": "Pinterest",
    "url": "https://www.pinterest.com/search/pins/?q={search}",
    "main": "https://www.pinterest.com/"
  },
  "!li": {
    "name": "LinkedIn",
    "url": "https://www.linkedin.com/search/results/all/?keywords={search}",
    "main": "https://www.linkedin.com/"
  },
  "!ebay": {
    "name": "eBay",
    "url": "https://www.ebay.com/sch/i.html?_nkw={search}",
    "main": "https://www.ebay.com/"
  },
  "!alibaba": {
    "name": "Alibaba",
    "url": "https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&CatId=&SearchText={search}",
    "main": "https://www.alibaba.com/"
  },
  "!etsy": {
    "name": "Etsy",
    "url": "https://www.etsy.com/search?q={search}",
    "main": "https://www.etsy.com/"
  },
  "!walmart": {
    "name": "Walmart",
    "url": "https://www.walmart.com/search/?query={search}",
    "main": "https://www.walmart.com/"
  },
  "!target": {
    "name": "Target",
    "url": "https://www.target.com/s?searchTerm={search}",
    "main": "https://www.target.com/"
  },
  "!cnn": {
    "name": "CNN",
    "url": "https://www.cnn.com/search?q={search}",
    "main": "https://www.cnn.com/"
  },
  "!bbc": {
    "name": "BBC",
    "url": "https://www.bbc.co.uk/search?q={search}",
    "main": "https://www.bbc.co.uk/"
  },
  "!nyt": {
    "name": "New York Times",
    "url": "https://www.nytimes.com/search?query={search}",
    "main": "https://www.nytimes.com/"
  },
  "!guardian": {
    "name": "The Guardian",
    "url": "https://www.theguardian.com/search?q={search}",
    "main": "https://www.theguardian.com/"
  },
  "!wa": {
    "name": "Wolfram Alpha",
    "url": "https://www.wolframalpha.com/input/?i={search}",
    "main": "https://www.wolframalpha.com/"
  },
  "!khan": {
    "name": "Khan Academy",
    "url": "https://www.khanacademy.org/search?page_search_query={search}",
    "main": "https://www.khanacademy.org/"
  },
  "!coursera": {
    "name": "Coursera",
    "url": "https://www.coursera.org/search?query={search}",
    "main": "https://www.coursera.org/"
  },
  "!edx": {
    "name": "edX",
    "url": "https://www.edx.org/search?q={search}",
    "main": "https://www.edx.org/"
  },
  "!brit": {
    "name": "Britannica",
    "url": "https://www.britannica.com/search?query={search}",
    "main": "https://www.britannica.com/"
  },
  "!se": {
    "name": "Stack Exchange",
    "url": "https://stackexchange.com/search?q={search}",
    "main": "https://stackexchange.com/"
  },
  "!medium": {
    "name": "Medium",
    "url": "https://medium.com/search?q={search}",
    "main": "https://medium.com/"
  },
  "!devto": {
    "name": "Dev.to",
    "url": "https://dev.to/search?q={search}",
    "main": "https://dev.to/"
  },
  "!hn": {
    "name": "Hacker News",
    "url": "https://hn.algolia.com/?q={search}",
    "main": "https://news.ycombinator.com/"
  },
  "!cp": {
    "name": "CodePen",
    "url": "https://codepen.io/search/pens?q={search}",
    "main": "https://codepen.io/"
  },
  "!gl": {
    "name": "GitLab",
    "url": "https://gitlab.com/search?search={search}",
    "main": "https://gitlab.com/"
  },
  "!imdb": {
    "name": "IMDb",
    "url": "https://www.imdb.com/find?q={search}",
    "main": "https://www.imdb.com/"
  },
  "!rt": {
    "name": "Rotten Tomatoes",
    "url": "https://www.rottentomatoes.com/search?search={search}",
    "main": "https://www.rottentomatoes.com/"
  },
  "!sc": {
    "name": "SoundCloud",
    "url": "https://soundcloud.com/search?q={search}",
    "main": "https://soundcloud.com/"
  },
  "!netflix": {
    "name": "Netflix",
    "url": "https://www.netflix.com/search?q={search}",
    "main": "https://www.netflix.com/"
  },
  "!ta": {
    "name": "TripAdvisor",
    "url": "https://www.tripadvisor.com/Search?q={search}",
    "main": "https://www.tripadvisor.com/"
  },
  "!booking": {
    "name": "Booking.com",
    "url": "https://www.booking.com/searchresults.html?ss={search}",
    "main": "https://www.booking.com/"
  },
  "!expedia": {
    "name": "Expedia",
    "url": "https://www.expedia.com/Hotel-Search?destination={search}",
    "main": "https://www.expedia.com/"
  },
  "!webmd": {
    "name": "WebMD",
    "url": "https://www.webmd.com/search/search_results/default.aspx?query={search}",
    "main": "https://www.webmd.com/"
  },
  "!mayo": {
    "name": "Mayo Clinic",
    "url": "https://www.mayoclinic.org/search/search-results?q={search}",
    "main": "https://www.mayoclinic.org/"
  },
  "!yf": {
    "name": "Yahoo Finance",
    "url": "https://finance.yahoo.com/lookup?s={search}",
    "main": "https://finance.yahoo.com/"
  },
  "!bloomberg": {
    "name": "Bloomberg",
    "url": "https://www.bloomberg.com/search?query={search}",
    "main": "https://www.bloomberg.com/"
  },
  "!mw": {
    "name": "MarketWatch",
    "url": "https://www.marketwatch.com/search?q={search}",
    "main": "https://www.marketwatch.com/"
  },
  "!quora": {
    "name": "Quora",
    "url": "https://www.quora.com/search?q={search}",
    "main": "https://www.quora.com/"
  },
  "!mathworld": {
    "name": "Wolfram MathWorld",
    "url": "https://mathworld.wolfram.com/search/?query={search}",
    "main": "https://mathworld.wolfram.com/"
  },
  "!archive": {
    "name": "Archive.org",
    "url": "https://archive.org/search.php?query={search}",
    "main": "https://archive.org/"
  },
  "!fandom": {
    "name": "Fandom",
    "url": "https://www.fandom.com/search?query={search}",
    "main": "https://www.fandom.com/"
  },
  "!genius": {
    "name": "Genius",
    "url": "https://genius.com/search?q={search}",
    "main": "https://genius.com/"
  },
  "!allmusic": {
    "name": "AllMusic",
    "url": "https://www.allmusic.com/search/all/{search}",
    "main": "https://www.allmusic.com/"
  },
  "!discogs": {
    "name": "Discogs",
    "url": "https://www.discogs.com/search/?q={search}",
    "main": "https://www.discogs.com/"
  },
  "!lastfm": {
    "name": "Last.fm",
    "url": "https://www.last.fm/search?q={search}",
    "main": "https://www.last.fm/"
  },
  "!bandcamp": {
    "name": "Bandcamp",
    "url": "https://bandcamp.com/search?q={search}",
    "main": "https://bandcamp.com/"
  },
  "!steam": {
    "name": "Steam",
    "url": "https://store.steampowered.com/search/?term={search}",
    "main": "https://store.steampowered.com/"
  },
  "!gog": {
    "name": "GOG",
    "url": "https://www.gog.com/games?search={search}",
    "main": "https://www.gog.com/"
  },
  "!arxiv": {
    "name": "ArXiv",
    "url": "https://arxiv.org/search/?query={search}&searchtype=all",
    "main": "https://arxiv.org/"
  }
};
