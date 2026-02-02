/**
 * Kaggle CSV to JSON Converter
 * 
 * Converts the Kaggle Rotten Tomatoes dataset to a minified JSON format
 * for use with the Chrome extension.
 * 
 * Dataset: https://www.kaggle.com/datasets/stefanoleone992/rotten-tomatoes-movies-and-critic-reviews-dataset
 * 
 * Usage:
 *   1. Download rotten_tomatoes_movies.csv from Kaggle
 *   2. Place it in the data/ folder
 *   3. Run: node scripts/convert-kaggle-csv.js
 */

const fs = require('fs');
const path = require('path');
const { createReadStream } = require('fs');
const readline = require('readline');

// Configuration
const CONFIG = {
  INPUT_FILE: path.join(__dirname, '../data/rotten_tomatoes_movies.csv'),
  OUTPUT_FILE: path.join(__dirname, '../data/ratings.json'),
  // Minimum number of reviews for inclusion (filters out obscure titles)
  MIN_REVIEWS: 5,
  // Maximum number of titles to include (set to null for all)
  MAX_TITLES: null,
  // Sort by tomatometer_count to prioritize popular titles
  SORT_BY_POPULARITY: true
};

// Normalize title for consistent lookup
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Extract year from date string (YYYY-MM-DD or just YYYY)
function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

async function convertCSV() {
  console.log('Starting Kaggle CSV to JSON conversion...\n');
  
  // Check if input file exists
  if (!fs.existsSync(CONFIG.INPUT_FILE)) {
    console.error(`Error: Input file not found: ${CONFIG.INPUT_FILE}`);
    console.error('\nPlease download the dataset from:');
    console.error('https://www.kaggle.com/datasets/stefanoleone992/rotten-tomatoes-movies-and-critic-reviews-dataset');
    console.error('\nAnd place rotten_tomatoes_movies.csv in the data/ folder.');
    process.exit(1);
  }
  
  const movies = [];
  let headers = null;
  let lineCount = 0;
  let skippedCount = 0;
  
  // Create readline interface for streaming large files
  const rl = readline.createInterface({
    input: createReadStream(CONFIG.INPUT_FILE, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    lineCount++;
    
    // Parse header row
    if (!headers) {
      headers = parseCSVLine(line);
      console.log('CSV Headers:', headers.slice(0, 10).join(', '), '...');
      continue;
    }
    
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    
    // Extract relevant fields
    // Kaggle dataset columns: movie_title, original_release_date, tomatometer_rating, 
    // audience_rating, tomatometer_count, audience_count, content_rating, genres, etc.
    const title = row.movie_title || row.title || '';
    const tomatometer = parseInt(row.tomatometer_rating, 10);
    const audience = parseInt(row.audience_rating, 10);
    const tomatometerCount = parseInt(row.tomatometer_count, 10) || 0;
    const audienceCount = parseInt(row.audience_count, 10) || 0;
    const year = extractYear(row.original_release_date || row.release_date);
    const consensus = row.tomatometer_top_critics_count ? '' : (row.critics_consensus || '');
    
    // Skip if missing essential data
    if (!title || isNaN(tomatometer) || isNaN(audience)) {
      skippedCount++;
      continue;
    }
    
    // Skip if too few reviews (optional filter)
    if (CONFIG.MIN_REVIEWS && tomatometerCount < CONFIG.MIN_REVIEWS) {
      skippedCount++;
      continue;
    }
    
    movies.push({
      title: title,
      year: year,
      tomatometer: tomatometer,
      audience: audience,
      popularity: tomatometerCount + audienceCount,
      consensus: consensus.length > 200 ? consensus.substring(0, 200) + '...' : consensus
    });
    
    // Progress indicator
    if (lineCount % 10000 === 0) {
      console.log(`Processed ${lineCount} lines...`);
    }
  }
  
  console.log(`\nProcessed ${lineCount} lines total`);
  console.log(`Skipped ${skippedCount} entries (missing data or below threshold)`);
  console.log(`Found ${movies.length} valid movies`);
  
  // Sort by popularity if configured
  if (CONFIG.SORT_BY_POPULARITY) {
    movies.sort((a, b) => b.popularity - a.popularity);
    console.log('Sorted by popularity (most popular first)');
  }
  
  // Limit number of titles if configured
  let finalMovies = movies;
  if (CONFIG.MAX_TITLES && movies.length > CONFIG.MAX_TITLES) {
    finalMovies = movies.slice(0, CONFIG.MAX_TITLES);
    console.log(`Limited to top ${CONFIG.MAX_TITLES} titles`);
  }
  
  // Convert to minified JSON format
  const ratings = {};
  for (const movie of finalMovies) {
    const key = normalizeTitle(movie.title);
    
    // Skip duplicates (keep the more popular one, which comes first after sorting)
    if (ratings[key]) continue;
    
    ratings[key] = {
      t: movie.title,                    // title
      y: movie.year,                     // year
      tm: movie.tomatometer,             // tomatometer score
      au: movie.audience                 // audience score
    };
    
    // Only include consensus if it exists and is meaningful
    if (movie.consensus && movie.consensus.length > 20) {
      ratings[key].c = movie.consensus;  // critics consensus
    }
  }
  
  // Create output object with metadata
  const output = {
    version: new Date().toISOString().split('T')[0],
    generated: new Date().toISOString(),
    count: Object.keys(ratings).length,
    source: 'kaggle-stefanoleone992',
    ratings: ratings
  };
  
  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write output file
  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(output));
  
  // Calculate file size
  const stats = fs.statSync(CONFIG.OUTPUT_FILE);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`\nOutput written to: ${CONFIG.OUTPUT_FILE}`);
  console.log(`Total entries: ${output.count}`);
  console.log(`File size: ${fileSizeMB} MB`);
  console.log(`Version: ${output.version}`);
  
  // Sample output
  const sampleKeys = Object.keys(ratings).slice(0, 3);
  console.log('\nSample entries:');
  sampleKeys.forEach(key => {
    console.log(`  "${key}": ${JSON.stringify(ratings[key])}`);
  });
}

// Run conversion
convertCSV().catch(console.error);
