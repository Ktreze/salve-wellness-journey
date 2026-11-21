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
  let observerTimer = 0;

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

    if (stableSnapshot === lastSnapshot) return;
    lastSnapshot = stableSnapshot;

    window.dispatchEvent(
      new CustomEvent("okai:profile-detected", { detail: profile })
    );
    chrome.storage.local
      .set({ okaiDetectedProfile: profile })
      .catch(() => undefined);
  }

  function scheduleDetection() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(publishProfile, 120);
  }

  const observer = new MutationObserver(scheduleDetection);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("popstate", scheduleDetection);
  window.addEventListener("hashchange", scheduleDetection);
  window.addEventListener("okai:request-profile", publishProfile);

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

  let lastLocation = window.location.href;
  window.setInterval(() => {
    if (window.location.href !== lastLocation) {
      lastLocation = window.location.href;
      scheduleDetection();
    }
  }, 350);

  publishProfile();
})();
