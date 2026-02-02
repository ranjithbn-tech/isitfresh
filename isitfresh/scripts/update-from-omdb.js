/**
 * OMDb API Update Script
 * 
 * Fetches new/updated movie ratings from OMDb API and merges with existing database.
 * OMDb includes Rotten Tomatoes scores in their responses.
 * 
 * Usage:
 *   1. Get an API key from https://www.omdbapi.com/apikey.aspx
 *   2. Set OMDB_API_KEY environment variable or update CONFIG below
 *   3. Add titles to NEW_TITLES array or use the popular movies list
 *   4. Run: node scripts/update-from-omdb.js
 * 
 * Rate limits: Free tier = 1,000 requests/day
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
  OMDB_API_KEY: process.env.OMDB_API_KEY || 'YOUR_API_KEY_HERE',
  RATINGS_FILE: path.join(__dirname, '../data/ratings.json'),
  // Delay between requests to avoid rate limiting (in ms)
  REQUEST_DELAY: 100,
  // Maximum concurrent requests
  MAX_CONCURRENT: 5
};

// New titles to fetch - add recent releases here
// Format: { title: 'Movie Title', year: 2024 } or just 'Movie Title'
const NEW_TITLES = [
  // Add your new titles here
  // { title: 'Dune: Part Two', year: 2024 },
  // { title: 'Oppenheimer', year: 2023 },
  // 'The Batman',
];

// Popular/trending titles list (fetched from TMDb or manually curated)
// This can be populated by another script that pulls from TMDb trending API
const TRENDING_TITLES_FILE = path.join(__dirname, '../data/trending-titles.json');

// Normalize title for consistent lookup
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Make HTTP request (promise-based)
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Fetch movie from OMDb API
async function fetchFromOMDb(title, year = null) {
  const params = new URLSearchParams({
    apikey: CONFIG.OMDB_API_KEY,
    t: title,
    type: 'movie'
  });
  
  if (year) {
    params.set('y', year.toString());
  }
  
  const url = `https://www.omdbapi.com/?${params.toString()}`;
  
  try {
    const data = await fetchJSON(url);
    
    if (data.Response === 'False') {
      return { error: data.Error, title };
    }
    
    // Extract Rotten Tomatoes rating from Ratings array
    let tomatometer = null;
    if (data.Ratings) {
      const rtRating = data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
      if (rtRating) {
        tomatometer = parseInt(rtRating.Value.replace('%', ''), 10);
      }
    }
    
    // OMDb doesn't provide audience score directly, use Metascore as fallback indicator
    // or set a reasonable default
    const metascore = parseInt(data.Metascore, 10);
    const imdbRating = parseFloat(data.imdbRating);
    
    // Estimate audience score from IMDB rating (rough approximation)
    // IMDB 7.0 ≈ 70% audience score
    const audienceEstimate = imdbRating ? Math.round(imdbRating * 10) : null;
    
    return {
      title: data.Title,
      year: parseInt(data.Year, 10),
      tomatometer: tomatometer,
      audience: audienceEstimate,
      imdbRating: imdbRating,
      metascore: metascore,
      genre: data.Genre,
      plot: data.Plot
    };
  } catch (error) {
    return { error: error.message, title };
  }
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Process titles in batches
async function processTitles(titles) {
  const results = [];
  const errors = [];
  
  console.log(`Processing ${titles.length} titles...`);
  
  for (let i = 0; i < titles.length; i++) {
    const item = titles[i];
    const title = typeof item === 'string' ? item : item.title;
    const year = typeof item === 'object' ? item.year : null;
    
    process.stdout.write(`\r[${i + 1}/${titles.length}] Fetching: ${title}...`);
    
    const result = await fetchFromOMDb(title, year);
    
    if (result.error) {
      errors.push({ title, year, error: result.error });
    } else if (result.tomatometer !== null) {
      results.push(result);
    } else {
      errors.push({ title, year, error: 'No Rotten Tomatoes rating found' });
    }
    
    // Rate limiting delay
    await sleep(CONFIG.REQUEST_DELAY);
  }
  
  console.log('\n');
  return { results, errors };
}

// Load existing ratings
function loadExistingRatings() {
  if (!fs.existsSync(CONFIG.RATINGS_FILE)) {
    return {
      version: new Date().toISOString().split('T')[0],
      generated: new Date().toISOString(),
      count: 0,
      source: 'omdb',
      ratings: {}
    };
  }
  
  return JSON.parse(fs.readFileSync(CONFIG.RATINGS_FILE, 'utf-8'));
}

// Merge new ratings into existing database
function mergeRatings(existing, newResults) {
  let addedCount = 0;
  let updatedCount = 0;
  
  for (const movie of newResults) {
    const key = normalizeTitle(movie.title);
    
    const entry = {
      t: movie.title,
      y: movie.year,
      tm: movie.tomatometer,
      au: movie.audience || movie.tomatometer // Fallback to tomatometer if no audience score
    };
    
    if (existing.ratings[key]) {
      // Update existing entry
      existing.ratings[key] = entry;
      updatedCount++;
    } else {
      // Add new entry
      existing.ratings[key] = entry;
      addedCount++;
    }
  }
  
  // Update metadata
  existing.version = new Date().toISOString().split('T')[0];
  existing.generated = new Date().toISOString();
  existing.count = Object.keys(existing.ratings).length;
  existing.lastUpdate = {
    added: addedCount,
    updated: updatedCount,
    timestamp: new Date().toISOString()
  };
  
  return { addedCount, updatedCount };
}

// Load trending titles if available
function loadTrendingTitles() {
  if (fs.existsSync(TRENDING_TITLES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TRENDING_TITLES_FILE, 'utf-8'));
      return data.titles || [];
    } catch (e) {
      console.warn('Warning: Could not load trending titles file');
    }
  }
  return [];
}

async function main() {
  console.log('OMDb Rating Update Script');
  console.log('========================\n');
  
  // Validate API key
  if (CONFIG.OMDB_API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('Error: Please set your OMDb API key');
    console.error('Get one at: https://www.omdbapi.com/apikey.aspx');
    console.error('Then set OMDB_API_KEY environment variable or update CONFIG in this script');
    process.exit(1);
  }
  
  // Collect all titles to fetch
  let titlesToFetch = [...NEW_TITLES];
  
  // Add trending titles if available
  const trendingTitles = loadTrendingTitles();
  if (trendingTitles.length > 0) {
    console.log(`Found ${trendingTitles.length} trending titles to check`);
    titlesToFetch = [...titlesToFetch, ...trendingTitles];
  }
  
  if (titlesToFetch.length === 0) {
    console.log('No new titles to fetch. Add titles to NEW_TITLES array or create trending-titles.json');
    console.log('\nExample format for trending-titles.json:');
    console.log(JSON.stringify({ titles: [{ title: 'Movie Name', year: 2024 }] }, null, 2));
    process.exit(0);
  }
  
  // Load existing ratings
  const existing = loadExistingRatings();
  console.log(`Existing database: ${existing.count} titles`);
  
  // Filter out titles we already have (optional - comment out to always refresh)
  const existingKeys = new Set(Object.keys(existing.ratings));
  const newTitles = titlesToFetch.filter(item => {
    const title = typeof item === 'string' ? item : item.title;
    return !existingKeys.has(normalizeTitle(title));
  });
  
  console.log(`New titles to fetch: ${newTitles.length}`);
  console.log(`Skipped (already in database): ${titlesToFetch.length - newTitles.length}\n`);
  
  if (newTitles.length === 0) {
    console.log('All titles already in database. Nothing to update.');
    process.exit(0);
  }
  
  // Fetch ratings
  const { results, errors } = await processTitles(newTitles);
  
  console.log(`Successfully fetched: ${results.length}`);
  console.log(`Failed: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\nFailed titles:');
    errors.forEach(e => console.log(`  - ${e.title}: ${e.error}`));
  }
  
  // Merge and save
  if (results.length > 0) {
    const { addedCount, updatedCount } = mergeRatings(existing, results);
    
    // Ensure output directory exists
    const outputDir = path.dirname(CONFIG.RATINGS_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.RATINGS_FILE, JSON.stringify(existing));
    
    console.log(`\nDatabase updated:`);
    console.log(`  Added: ${addedCount} new titles`);
    console.log(`  Updated: ${updatedCount} existing titles`);
    console.log(`  Total: ${existing.count} titles`);
    console.log(`  Version: ${existing.version}`);
  }
}

// Run script
main().catch(console.error);
