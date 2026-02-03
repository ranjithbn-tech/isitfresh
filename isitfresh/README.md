# isitfresh

Is it fresh? See Rotten Tomatoes ratings instantly when hovering over movies and TV shows on Netflix and Prime Video.

## Features

- **Instant ratings** - Cached database means zero latency on hover
- **Auto-updating** - Fetches latest data from GitHub Pages weekly
- **Clean UI** - Dark theme tooltip with Tomatometer and Audience scores
- **Netflix & Prime Video** - Supports both major streaming platforms

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `chrome-extension` folder (or root if using single repo structure)
6. Visit Netflix or Prime Video and hover over a title!

## Configuration

The extension is pre-configured to fetch ratings from:
\`\`\`
https://ranjithbn-tech.github.io/isitfresh/data/ratings.json
\`\`\`

To change this, edit `background/service-worker.js` and update the `RATINGS_URL`.

## How It Works

1. **On install/startup**: Extension fetches `ratings.json` from GitHub Pages
2. **Caching**: Data is stored in `chrome.storage.local` (supports up to 150K titles)
3. **On hover**: Instant lookup from local cache - no network delay
4. **Auto-update**: Checks for new data every 6 hours

## File Structure

\`\`\`
isitfresh/
├── manifest.json           # Extension configuration
├── content/
│   ├── content.js          # Hover detection & tooltip
│   └── content.css         # Tooltip styling
├── background/
│   └── service-worker.js   # Data fetching & caching
├── icons/
│   └── (add your icons)
├── data/
│   └── ratings.json        # Hosted via GitHub Pages
├── scripts/
│   ├── convert-kaggle-csv.js
│   ├── fetch-trending-titles.js
│   └── update-from-omdb.js
└── .github/
    └── workflows/
        └── update-ratings.yml
\`\`\`

## Adding Icons

Create icons in these sizes and add to the `icons/` folder:
- `icon-16.png` (16x16)
- `icon-48.png` (48x48)  
- `icon-128.png` (128x128)

Suggestion: Use a fresh tomato icon or create a custom "isitfresh" logo.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Cache ratings locally |
| `unlimitedStorage` | Support 150K+ titles (~18MB) |
| `host_permissions` | Access Netflix, Prime Video, and GitHub Pages URL |

## Data Updates

The GitHub Action runs every Sunday at midnight UTC and:
1. Fetches trending/popular titles from TMDb
2. Looks up RT ratings via OMDb API  
3. Merges new data with existing database
4. Commits and pushes changes

## Setting Up Data Pipeline

### 1. Initial Data Load

1. Download [Kaggle Rotten Tomatoes Dataset](https://www.kaggle.com/datasets/stefanoleone992/rotten-tomatoes-movies-and-critic-reviews-dataset)
2. Place CSV in `data/` folder
3. Run: `npm run convert`

### 2. Configure API Keys

Add secrets to GitHub repository (Settings > Secrets > Actions):

| Secret | Get from |
|--------|----------|
| `TMDB_API_KEY` | [TMDb API](https://www.themoviedb.org/settings/api) |
| `OMDB_API_KEY` | [OMDb API](https://www.omdbapi.com/apikey.aspx) |

### 3. Enable GitHub Pages

1. Go to Settings > Pages
2. Source: Deploy from a branch
3. Branch: `main`, folder: `/data`

## Troubleshooting

**"Loading ratings..." stays forever?**
- Check the service worker console (chrome://extensions > Details > Service Worker)
- Verify GitHub Pages URL is accessible

**Tooltip not showing?**
- Refresh the Netflix/Prime Video page
- Check browser console for errors (F12)

**Wrong title detected?**
- Netflix/Prime may have updated their HTML structure
- Check `content.js` selectors

## License

MIT - Feel free to modify and share!

## Repository

https://github.com/ranjithbn-tech/isitfresh
