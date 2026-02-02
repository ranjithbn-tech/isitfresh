/**
 * TMDb Trending Titles Fetcher
 * 
 * Fetches trending/popular movies and TV shows from TMDb API
 * to create a list of titles for the OMDb update script.
 * 
 * TMDb API is free and has generous rate limits.
 * 
 * Usage:
 *   1. Get an API key from https://www.themoviedb.org/settings/api
 *   2. Set TMDB_API_KEY environment variable
 *   3. Run: node scripts/fetch-trending-titles.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
  TMDB_API_KEY: process.env.TMDB_API_KEY || 'YOUR_API_KEY_HERE',
  OUTPUT_FILE: path.join(__dirname, '../data/trending-titles.json'),
  // Number of pages to fetch (20 results per page)
  PAGES_TO_FETCH: 10,
  // Include both movies and TV shows
  INCLUDE_TV: true
};

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

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch popular movies from TMDb
async function fetchPopularMovies(page = 1) {
  const url = `https://api.themoviedb.org/3/movie/popular?api_key=${CONFIG.TMDB_API_KEY}&language=en-US&page=${page}`;
  return fetchJSON(url);
}

// Fetch popular TV shows from TMDb
async function fetchPopularTV(page = 1) {
  const url = `https://api.themoviedb.org/3/tv/popular?api_key=${CONFIG.TMDB_API_KEY}&language=en-US&page=${page}`;
  return fetchJSON(url);
}

// Fetch trending (weekly) from TMDb
async function fetchTrending(mediaType = 'all', page = 1) {
  const url = `https://api.themoviedb.org/3/trending/${mediaType}/week?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`;
  return fetchJSON(url);
}

// Extract year from date string
function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

async function main() {
  console.log('TMDb Trending Titles Fetcher');
  console.log('============================\n');
  
  // Validate API key
  if (CONFIG.TMDB_API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('Error: Please set your TMDb API key');
    console.error('Get one at: https://www.themoviedb.org/settings/api');
    console.error('Then set TMDB_API_KEY environment variable');
    process.exit(1);
  }
  
  const allTitles = [];
  const seenTitles = new Set();
  
  // Fetch trending titles
  console.log('Fetching trending titles...');
  for (let page = 1; page <= CONFIG.PAGES_TO_FETCH; page++) {
    try {
      const data = await fetchTrending('all', page);
      
      for (const item of data.results || []) {
        const title = item.title || item.name;
        const year = extractYear(item.release_date || item.first_air_date);
        const key = `${title.toLowerCase()}-${year}`;
        
        if (!seenTitles.has(key) && title) {
          seenTitles.add(key);
          allTitles.push({
            title: title,
            year: year,
            type: item.media_type || (item.title ? 'movie' : 'tv'),
            popularity: item.popularity
          });
        }
      }
      
      process.stdout.write(`\r  Trending page ${page}/${CONFIG.PAGES_TO_FETCH}`);
      await sleep(250); // Rate limiting
    } catch (error) {
      console.error(`\n  Error fetching trending page ${page}:`, error.message);
    }
  }
  console.log('\n');
  
  // Fetch popular movies
  console.log('Fetching popular movies...');
  for (let page = 1; page <= CONFIG.PAGES_TO_FETCH; page++) {
    try {
      const data = await fetchPopularMovies(page);
      
      for (const item of data.results || []) {
        const year = extractYear(item.release_date);
        const key = `${item.title.toLowerCase()}-${year}`;
        
        if (!seenTitles.has(key) && item.title) {
          seenTitles.add(key);
          allTitles.push({
            title: item.title,
            year: year,
            type: 'movie',
            popularity: item.popularity
          });
        }
      }
      
      process.stdout.write(`\r  Movies page ${page}/${CONFIG.PAGES_TO_FETCH}`);
      await sleep(250);
    } catch (error) {
      console.error(`\n  Error fetching movies page ${page}:`, error.message);
    }
  }
  console.log('\n');
  
  // Fetch popular TV shows
  if (CONFIG.INCLUDE_TV) {
    console.log('Fetching popular TV shows...');
    for (let page = 1; page <= CONFIG.PAGES_TO_FETCH; page++) {
      try {
        const data = await fetchPopularTV(page);
        
        for (const item of data.results || []) {
          const year = extractYear(item.first_air_date);
          const key = `${item.name.toLowerCase()}-${year}`;
          
          if (!seenTitles.has(key) && item.name) {
            seenTitles.add(key);
            allTitles.push({
              title: item.name,
              year: year,
              type: 'tv',
              popularity: item.popularity
            });
          }
        }
        
        process.stdout.write(`\r  TV page ${page}/${CONFIG.PAGES_TO_FETCH}`);
        await sleep(250);
      } catch (error) {
        console.error(`\n  Error fetching TV page ${page}:`, error.message);
      }
    }
    console.log('\n');
  }
  
  // Sort by popularity
  allTitles.sort((a, b) => b.popularity - a.popularity);
  
  // Create output
  const output = {
    version: new Date().toISOString().split('T')[0],
    generated: new Date().toISOString(),
    count: allTitles.length,
    source: 'tmdb',
    titles: allTitles.map(t => ({
      title: t.title,
      year: t.year,
      type: t.type
    }))
  };
  
  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write output
  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log(`\nOutput written to: ${CONFIG.OUTPUT_FILE}`);
  console.log(`Total titles: ${output.count}`);
  console.log(`  Movies: ${allTitles.filter(t => t.type === 'movie').length}`);
  console.log(`  TV Shows: ${allTitles.filter(t => t.type === 'tv').length}`);
  
  // Show top 10
  console.log('\nTop 10 by popularity:');
  allTitles.slice(0, 10).forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.title} (${t.year}) [${t.type}]`);
  });
}

// Run script
main().catch(console.error);
