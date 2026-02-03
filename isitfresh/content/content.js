/**
 * isitfresh - Content Script
 * Runs on Netflix and Prime Video pages
 * Detects hover events on movie/TV show titles and displays Rotten Tomatoes ratings
 */

(function () {
  "use strict";

  // Note: 'chrome' is a global object in Chrome extensions - no import needed

  // Ratings database (loaded from background script)
  let ratingsDatabase = {};
  let dataVersion = "unknown";
  let isLoading = true;

  // Tooltip element
  let tooltip = null;
  let currentHoveredElement = null;
  let hideTimeout = null;

  // Normalize title for lookup (must match the database format)
  function normalizeTitle(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Load ratings from background script
  async function loadRatings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_RATINGS" });
      if (response && response.ratings) {
        ratingsDatabase = response.ratings;
        dataVersion = response.version;
        isLoading = false;
        console.log(
          `[isitfresh] Loaded ${Object.keys(ratingsDatabase).length} ratings (version: ${dataVersion})`
        );
      }
    } catch (error) {
      console.error("[isitfresh] Failed to load ratings:", error);
      isLoading = false;
    }
  }

  // Create tooltip element
  function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.id = "isitfresh-tooltip";
    tooltip.innerHTML = `
      <div class="rt-tooltip-header">
        <span class="rt-tooltip-title"></span>
        <span class="rt-tooltip-year"></span>
      </div>
      <div class="rt-tooltip-loading">Loading ratings...</div>
      <div class="rt-tooltip-scores">
        <div class="rt-score rt-tomatometer">
          <div class="rt-score-icon rt-tomato"></div>
          <div class="rt-score-value">
            <span class="rt-score-number">--</span>
            <span class="rt-score-label">Tomatometer</span>
          </div>
        </div>
        <div class="rt-score rt-audience">
          <div class="rt-score-icon rt-popcorn"></div>
          <div class="rt-score-value">
            <span class="rt-score-number">--</span>
            <span class="rt-score-label">Audience</span>
          </div>
        </div>
      </div>
      <div class="rt-tooltip-consensus"></div>
      <div class="rt-tooltip-notfound">Rating not found in database</div>
    `;
    document.body.appendChild(tooltip);
  }

  // Look up rating from cached database
  function lookupRating(title) {
    const normalized = normalizeTitle(title);
    return ratingsDatabase[normalized] || null;
  }

  // Get tomato freshness class
  function getTomatoClass(score) {
    if (score >= 60) return "fresh";
    return "rotten";
  }

  // Get audience score class
  function getAudienceClass(score) {
    if (score >= 60) return "liked";
    return "disliked";
  }

  // Show tooltip with rating data
  function showTooltip(element, title) {
    if (!tooltip) createTooltip();

    const rating = lookupRating(title);

    // Get elements
    const titleEl = tooltip.querySelector(".rt-tooltip-title");
    const yearEl = tooltip.querySelector(".rt-tooltip-year");
    const loadingEl = tooltip.querySelector(".rt-tooltip-loading");
    const tomatometerEl = tooltip.querySelector(".rt-tomatometer .rt-score-number");
    const audienceEl = tooltip.querySelector(".rt-audience .rt-score-number");
    const consensusEl = tooltip.querySelector(".rt-tooltip-consensus");
    const notFoundEl = tooltip.querySelector(".rt-tooltip-notfound");
    const scoresEl = tooltip.querySelector(".rt-tooltip-scores");
    const tomatoIcon = tooltip.querySelector(".rt-tomatometer .rt-score-icon");
    const popcornIcon = tooltip.querySelector(".rt-audience .rt-score-icon");

    titleEl.textContent = rating ? rating.t : title;
    yearEl.textContent = rating ? `(${rating.y})` : "";

    // Handle loading state
    if (isLoading) {
      loadingEl.style.display = "block";
      scoresEl.style.display = "none";
      notFoundEl.style.display = "none";
      consensusEl.style.display = "none";
    } else if (rating) {
      loadingEl.style.display = "none";
      scoresEl.style.display = "flex";
      notFoundEl.style.display = "none";

      tomatometerEl.textContent = `${rating.tm}%`;
      audienceEl.textContent = `${rating.au}%`;

      // Update freshness indicators
      tomatoIcon.className = `rt-score-icon rt-tomato ${getTomatoClass(rating.tm)}`;
      popcornIcon.className = `rt-score-icon rt-popcorn ${getAudienceClass(rating.au)}`;

      if (rating.c) {
        consensusEl.textContent = rating.c;
        consensusEl.style.display = "block";
      } else {
        consensusEl.style.display = "none";
      }
    } else {
      loadingEl.style.display = "none";
      scoresEl.style.display = "none";
      consensusEl.style.display = "none";
      notFoundEl.style.display = "block";
    }

    // Position tooltip
    const rect = element.getBoundingClientRect();

    let top = rect.top - 10;
    let left = rect.left + rect.width / 2;

    // Adjust if tooltip would go off screen
    if (top < 150) {
      top = rect.bottom + 10;
      tooltip.classList.add("rt-tooltip-below");
    } else {
      tooltip.classList.remove("rt-tooltip-below");
    }

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.classList.add("rt-visible");
  }

  // Hide tooltip
  function hideTooltip() {
    if (tooltip) {
      tooltip.classList.remove("rt-visible");
    }
    currentHoveredElement = null;
  }

  // Extract title from element based on platform
  function extractTitle(element) {
    const hostname = window.location.hostname;

    // Netflix selectors
    if (hostname.includes("netflix.com")) {
      const titleCard = element.closest(
        ".title-card-container, .slider-item, .ptrack-content"
      );
      if (titleCard) {
        // Check for aria-label first (most reliable)
        const ariaLabel = titleCard.querySelector("[aria-label]");
        if (ariaLabel) {
          const label = ariaLabel.getAttribute("aria-label");
          return label
            .replace(/^Play\s+/i, "")
            .replace(/^\d+\.\s*/, "")
            .trim();
        }

        // Check for title in various locations
        const titleEl = titleCard.querySelector(
          '.fallback-text, .title-text, [data-uia="title-text"]'
        );
        if (titleEl) return titleEl.textContent.trim();

        // Check image alt text
        const img = titleCard.querySelector("img");
        if (img && img.alt) return img.alt.trim();
      }

      if (element.getAttribute("aria-label")) {
        return element.getAttribute("aria-label").replace(/^Play\s+/i, "").trim();
      }
    }

    // Prime Video selectors
    if (hostname.includes("primevideo.com") || hostname.includes("amazon.com")) {
      const container = element.closest(
        "[data-card-title], .av-hover-wrapper, ._card_container_bxjvm_3, article"
      );
      if (container) {
        const dataTitle = container.getAttribute("data-card-title");
        if (dataTitle) return dataTitle.trim();

        const titleEl = container.querySelector(
          '[data-automation-id="title"], .av-title, ._tile-title_bxjvm_61, h3'
        );
        if (titleEl) return titleEl.textContent.trim();

        const ariaLabel = container.querySelector("[aria-label]");
        if (ariaLabel) {
          return ariaLabel.getAttribute("aria-label").trim();
        }

        const img = container.querySelector("img");
        if (img && img.alt) return img.alt.trim();
      }
    }

    return null;
  }

  // Check if element is a hoverable movie/show card
  function isHoverableCard(element) {
    const hostname = window.location.hostname;

    if (hostname.includes("netflix.com")) {
      return (
        element.closest(
          '.title-card-container, .slider-item, .ptrack-content, [data-uia="title-card"]'
        ) !== null
      );
    }

    if (hostname.includes("primevideo.com") || hostname.includes("amazon.com")) {
      return (
        element.closest(
          '[data-card-title], .av-hover-wrapper, ._card_container_bxjvm_3, article, [data-testid="card"]'
        ) !== null
      );
    }

    return false;
  }

  // Handle mouse enter
  function handleMouseEnter(event) {
    const target = event.target;

    if (!isHoverableCard(target)) return;

    const card = target.closest(
      '.title-card-container, .slider-item, .ptrack-content, [data-uia="title-card"], [data-card-title], .av-hover-wrapper, ._card_container_bxjvm_3, article, [data-testid="card"]'
    );

    if (card === currentHoveredElement) return;

    const title = extractTitle(target);
    if (!title) return;

    clearTimeout(hideTimeout);
    currentHoveredElement = card;
    showTooltip(card, title);
  }

  // Handle mouse leave
  function handleMouseLeave(event) {
    const target = event.target;

    if (!isHoverableCard(target)) return;

    hideTimeout = setTimeout(hideTooltip, 200);
  }

  // Keep tooltip visible when hovering over it
  function setupTooltipHover() {
    if (!tooltip) return;

    tooltip.addEventListener("mouseenter", () => {
      clearTimeout(hideTimeout);
    });

    tooltip.addEventListener("mouseleave", () => {
      hideTimeout = setTimeout(hideTooltip, 200);
    });
  }

  // Initialize
  async function init() {
    // Load ratings from background script
    await loadRatings();

    createTooltip();
    setupTooltipHover();

    // Use event delegation for better performance
    document.addEventListener("mouseenter", handleMouseEnter, true);
    document.addEventListener("mouseleave", handleMouseLeave, true);

    // Handle dynamically loaded content with MutationObserver
    const observer = new MutationObserver(() => {
      // Content has changed, no action needed as we use event delegation
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log("[isitfresh] Extension initialized - hover over a title to see if it's fresh!");
  }

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
