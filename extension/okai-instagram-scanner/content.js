(() => {
  "use strict";

  const PROFILE_PATH_PATTERN = /^\/(?:[^/]+\/)?([^/]+)\/?$/;
  const RESERVED_PATHS = new Set([
    "about",
    "accounts",
    "admin",
    "apps",
    "channels",
    "collections",
    "develop",
    "directory",
    "domain",
    "emails",
    "explore",
    "legal",
    "one",
    "p",
    "people",
    "privacy",
    "reels",
    "saved",
    "search",
    "settings",
    "shop",
    "stories",
    "subscribe",
    "topics"
  ]);

  const STORAGE_KEY = "okaiDetectedProfile";
  const POSTS_STORAGE_KEY = "okaiDetectedPosts";
  const POST_PATH_PATTERN = /^\/(?:[^/]+\/)?(p|reel|tv)\/([^/?#]+)/i;

  const SELECTORS = {
    username: [
      "header h1",
      "main h1",
      'div[role="main"] h1'
    ],
    displayName: [
      'header a[href$="followers("]',
      'header div[data-testid="UserName"]'
    ],
    biography: [
      'header div[data-testid="UserBio"]',
      "header section ul",
      'div[data-testid="UserBio"]'
    ],
    avatar: [
      'header img[alt*="photo de perfil" i]',
      'header img[alt*="profile picture" i]',
      'header img[alt*="foto do perfil" i]',
      'header img[alt*="avatar" i]',
      "header img"
    ]
  };

  let lastSnapshot = "";
  let lastPostsSnapshot = "";
  let observerTimer = 0;
  let postsTimer = 0;
  let lastScannedUrl = "";

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function getUsernameFromUrl() {
    const url = new URL(window.location.href);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;

    const match = url.pathname.match(PROFILE_PATH_PATTERN);
    if (!match) return null;

    const candidate = decodeURIComponent(match[1]).trim();
    if (!candidate || RESERVED_PATHS.has(candidate.toLowerCase())) return null;
    if (/^(stories|reels|explore)$/i.test(candidate)) return null;

    return candidate;
  }

  function firstMatch(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function readUsername(username) {
    const heading = firstMatch(SELECTORS.username);
    const headingText = cleanText(heading?.textContent);
    if (headingText.startsWith("@")) return headingText.slice(1);
    return username;
  }

  function readDisplayName(username, extractedUsername) {
    const heading = firstMatch(SELECTORS.username);
    const headingText = cleanText(heading?.textContent);
    if (headingText && !headingText.startsWith("@")) return headingText;

    const linkedName = firstMatch(SELECTORS.displayName);
    const linkedText = cleanText(linkedName?.textContent);
    if (linkedText && linkedText !== extractedUsername) return linkedText;

    return null;
  }

  function readBiography() {
    const element = firstMatch(SELECTORS.biography);
    if (!element) return null;

    const text = cleanText(element.textContent);
    return text || null;
  }

  function readAvatar() {
    const element = firstMatch(SELECTORS.avatar);
    const source = element?.currentSrc || element?.getAttribute("src") || null;
    if (!source) return null;

    try {
      const url = new URL(source, window.location.origin);
      return url.href;
    } catch {
      return null;
    }
  }

  function detectProfile() {
    const username = getUsernameFromUrl();

    if (!username) {
      return {
        status: "not_profile",
        detectedAt: new Date().toISOString(),
        url: window.location.href
      };
    }

    const extractedUsername = readUsername(username);
    return {
      status: "profile_detected",
      detectedAt: new Date().toISOString(),
      username: extractedUsername,
      displayName: readDisplayName(username, extractedUsername),
      biography: readBiography(),
      avatarUrl: readAvatar(),
      profileUrl: `https://www.instagram.com/${encodeURIComponent(extractedUsername)}/`,
      sourceUrl: window.location.href
    };
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function getPostType(pathname) {
    if (/^\/(?:[^/]+\/)?reel\//i.test(pathname)) return "REEL";
    if (/^\/(?:[^/]+\/)?tv\//i.test(pathname)) return "REEL";
    if (/^\/(?:[^/]+\/)?p\//i.test(pathname)) return "PUBLICACAO";
    return null;
  }

  function findNearbyCard(anchor) {
    return anchor.closest('article, li, [role="listitem"], [data-testid]') || anchor.parentElement;
  }

  function findCoverImage(anchor) {
    const card = findNearbyCard(anchor);
    const candidates = card ? card.querySelectorAll("img") : [];

    for (const image of candidates) {
      const source = image.currentSrc || image.getAttribute("src") || null;
      if (!source) continue;
      try {
        return new URL(source, window.location.origin).href;
      } catch {
        // Ignore malformed image URLs exposed by the page.
      }
    }

    return null;
  }

  function parseCount(value) {
    const normalized = cleanText(value).toLowerCase();
    if (!normalized) return null;

    const numberMatch = normalized.match(/[\d.,]+/);
    if (!numberMatch) return null;

    const rawNumber = numberMatch[0];
    let numeric = rawNumber;
    if (/,\d{1,2}$/.test(rawNumber)) {
      numeric = rawNumber.replace(/\./g, "").replace(",", ".");
    } else {
      numeric = rawNumber.replace(/,/g, "");
    }

    const parsed = Number(numeric);
    if (!Number.isFinite(parsed)) return null;

    if (/\b(?:k|mil)\b/i.test(normalized)) return Math.round(parsed * 1000);
    if (/\b(?:mi|milhão|milhoes|milhões)\b/i.test(normalized)) return Math.round(parsed * 1000000);
    return Math.round(parsed);
  }

  function readAccessibleMetric(scope, labels) {
    if (!scope) return null;

    const elements = scope.querySelectorAll('[aria-label], [title]');
    for (const element of elements) {
      const accessibleText = cleanText(element.getAttribute("aria-label") || element.getAttribute("title"));
      const normalized = accessibleText.toLowerCase();
      if (labels.some((label) => normalized.includes(label))) {
        const parsed = parseCount(accessibleText);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  function readVisibleMetric(scope, patterns) {
    if (!scope) return null;

    const text = cleanText(scope.textContent);
    if (!text) return null;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = parseCount(match[1]);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  function readMetrics(anchor) {
    const card = findNearbyCard(anchor);

    const likes = readAccessibleMetric(card, ["curtida", "like", "likes"])
      ?? readVisibleMetric(card, [
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*curtidas?/i,
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*likes?/i
      ]);

    const comments = readAccessibleMetric(card, ["comentário", "comment", "comments"])
      ?? readVisibleMetric(card, [
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*comentários?/i,
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*comments?/i
      ]);

    const views = readAccessibleMetric(card, ["visualização", "visualizações", "view", "views", "play", "plays"])
      ?? readVisibleMetric(card, [
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*visualizações?/i,
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*views?/i,
        /([\d.,]+\s*(?:k|mi|mil|milhão|milhões)?)\s*plays?/i
      ]);

    return {
      likes,
      comments,
      views,
      availability: {
        likes: likes !== null,
        comments: comments !== null,
        views: views !== null
      }
    };
  }

  function collectVisiblePosts() {
    const posts = new Map();
    const anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');

    for (const anchor of anchors) {
      const rawHref = anchor.getAttribute("href");
      if (!rawHref) continue;

      const url = normalizeUrl(rawHref);
      if (!url) continue;

      const parsedUrl = new URL(url);
      const type = getPostType(parsedUrl.pathname);
      if (!type) continue;

      const match = parsedUrl.pathname.match(POST_PATH_PATTERN);
      if (!match) continue;

      const canonicalUrl = `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/`;
      const metrics = readMetrics(anchor);

      posts.set(canonicalUrl, {
        url: canonicalUrl,
        type,
        image: findCoverImage(anchor),
        likes: metrics.likes,
        comments: metrics.comments,
        views: metrics.views,
        capturedAt: new Date().toISOString(),
        availability: metrics.availability
      });
    }

    return Array.from(posts.values());
  }

  async function persistVisiblePosts(profile) {
    if (!profile || profile.status !== "profile_detected" || !profile.username) return;

    const visiblePosts = collectVisiblePosts();
    if (!visiblePosts.length) return;

    let stored = {};
    try {
      const result = await chrome.storage.local.get(POSTS_STORAGE_KEY);
      stored = result?.[POSTS_STORAGE_KEY] || {};
    } catch {
      stored = {};
    }

    const existingPosts = Array.isArray(stored.posts) ? stored.posts : [];
    const postsByUrl = new Map();

    for (const post of [...existingPosts, ...visiblePosts]) {
      if (!post?.url || postsByUrl.has(post.url)) continue;
      postsByUrl.set(post.url, post);
    }

    const posts = Array.from(postsByUrl.values());
    const snapshot = JSON.stringify({
      username: profile.username,
      posts: posts.map((post) => ({
        url: post.url,
        type: post.type,
        image: post.image,
        likes: post.likes,
        comments: post.comments,
        views: post.views,
        availability: post.availability,
        capturedAt: post.capturedAt
      }))
    });

    if (snapshot === lastPostsSnapshot) return;
    lastPostsSnapshot = snapshot;

    await chrome.storage.local.set({
      [POSTS_STORAGE_KEY]: {
        username: profile.username,
        profileUrl: profile.profileUrl,
        count: posts.length,
        updatedAt: new Date().toISOString(),
        posts
      }
    }).catch(() => undefined);
  }

  function publishProfile() {
    const profile = detectProfile();
    const stableSnapshot = JSON.stringify({
      status: profile.status,
      username: profile.username,
      displayName: profile.displayName,
      biography: profile.biography,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
      sourceUrl: profile.sourceUrl
    });

    if (stableSnapshot !== lastSnapshot) {
      lastSnapshot = stableSnapshot;

      window.dispatchEvent(
        new CustomEvent("okai:profile-detected", { detail: profile })
      );
      chrome.storage.local
        .set({ [STORAGE_KEY]: profile })
        .catch(() => undefined);
    }

    lastScannedUrl = window.location.href;
    persistVisiblePosts(profile);
  }

  function scheduleDetection() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(publishProfile, 120);
  }

  function schedulePostsDetection() {
    window.clearTimeout(postsTimer);
    postsTimer = window.setTimeout(() => {
      const profile = detectProfile();
      persistVisiblePosts(profile);
    }, 250);
  }

  const observer = new MutationObserver(scheduleDetection);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("popstate", scheduleDetection);
  window.addEventListener("hashchange", scheduleDetection);
  window.addEventListener("okai:request-profile", publishProfile);
  window.addEventListener("scroll", schedulePostsDetection, { passive: true });

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    scheduleDetection();
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleDetection();
    return result;
  };

  window.setInterval(() => {
    if (window.location.href !== lastLocation) {
      lastLocation = window.location.href;
      scheduleDetection();
    }
    schedulePostsDetection();
  }, 700);

  let lastLocation = window.location.href;
  publishProfile();
})();
