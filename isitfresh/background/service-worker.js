/**
 * isitfresh - Background Service Worker
 * Handles fetching and caching the ratings database from GitHub Pages
 */

// Configuration
const CONFIG = {
  // GitHub Pages URL for ratings data
  RATINGS_URL: 'https://ranjithbn-tech.github.io/isitfresh/data/ratings.json',
  // How often to check for updates (in milliseconds)
  UPDATE_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  // Storage keys
  STORAGE_KEY: 'ratingsDatabase',
  LAST_UPDATE_KEY: 'lastUpdate',
  VERSION_KEY: 'dataVersion'
};

// Note: 'chrome' is a global object in Chrome extensions - no import needed

// Fetch and cache the ratings database
async function fetchAndCacheRatings() {
  try {
    console.log('[isitfresh] Fetching ratings database...');
    
    const response = await fetch(CONFIG.RATINGS_URL, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Store in chrome.storage.local
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEY]: data.ratings,
      [CONFIG.LAST_UPDATE_KEY]: Date.now(),
      [CONFIG.VERSION_KEY]: data.version || 'unknown'
    });
    
    console.log(`[isitfresh] Cached ${Object.keys(data.ratings).length} ratings (version: ${data.version})`);
    
    return true;
  } catch (error) {
    console.error('[isitfresh] Failed to fetch ratings:', error);
    return false;
  }
}

// Check if we need to update the cache
async function checkForUpdates() {
  const result = await chrome.storage.local.get([CONFIG.LAST_UPDATE_KEY, CONFIG.STORAGE_KEY]);
  
  const lastUpdate = result[CONFIG.LAST_UPDATE_KEY] || 0;
  const hasData = result[CONFIG.STORAGE_KEY] !== undefined;
  const timeSinceUpdate = Date.now() - lastUpdate;
  
  // Fetch if no data or if update interval has passed
  if (!hasData || timeSinceUpdate > CONFIG.UPDATE_INTERVAL) {
    await fetchAndCacheRatings();
  } else {
    console.log(`[isitfresh] Using cached data (updated ${Math.round(timeSinceUpdate / 1000 / 60)} minutes ago)`);
  }
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[isitfresh] Extension ${details.reason}`);
  
  // Fetch ratings on install or update
  await fetchAndCacheRatings();
});

// Handle browser startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[isitfresh] Browser started');
  await checkForUpdates();
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_RATINGS') {
    // Return the cached ratings database
    chrome.storage.local.get([CONFIG.STORAGE_KEY, CONFIG.VERSION_KEY]).then((result) => {
      sendResponse({
        ratings: result[CONFIG.STORAGE_KEY] || {},
        version: result[CONFIG.VERSION_KEY] || 'unknown'
      });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.type === 'FORCE_UPDATE') {
    // Force a refresh of the ratings
    fetchAndCacheRatings().then((success) => {
      sendResponse({ success });
    });
    return true;
  }
  
  return false;
});

// Set up periodic update check using alarms
chrome.alarms.create('checkForUpdates', {
  periodInMinutes: 60 * 6 // Check every 6 hours
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkForUpdates') {
    checkForUpdates();
  }
});

console.log('[isitfresh] Service worker initialized');
