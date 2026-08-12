const STORAGE_KEY = "discup2-reach-mission:v1";
const LEGACY_STORAGE_KEY = "diskup2-reach-mission:v1";
const DATA_URL = "data/missions.json";
const PATTERN_DATA_URL = "data/mission-patterns.json";
const TOTAL_MISSIONS = 222;
const RANK_ORDER = ["NORMAL", "A", "S", "SS"];
const REEL_KEYS = ["left", "middle", "right"];
const REEL_LABELS = {
  left: "左",
  middle: "中",
  right: "右",
};
const REEL_COLUMNS = {
  left: 0,
  middle: 1,
  right: 2,
};
const REEL_REPEAT_COUNT = 9;
const REEL_CENTER_REPEAT = Math.floor(REEL_REPEAT_COUNT / 2);
const REEL_SETTLE_DELAY = 140;
const ROW_LABELS = ["上", "中", "下"];
const RANK_COLORS = {
  NORMAL: "#aeb6c5",
  A: "#42cbff",
  S: "#ff4054",
  SS: "#ffc85a",
};
const LEFT_GROUPS = {
  red: new Set(["4", "5", "6"]),
  blue: new Set(["b", "c", "d"]),
  black: new Set(["i", "j", "k"]),
};
const LEFT_OPTION_ORDER = [
  "6", "5", "4", "3", "2", "1", "l", "k", "j", "i", "h", "g", "f",
  "e", "d", "c", "b", "a", "9", "8", "7",
];
const METHOD_LABELS = {
  sequential: "順押し",
  sandwich: "ハサミ打ち",
  unspecified: "指定なし",
};

const icons = {
  zoom:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16 16 4 4M11 8v6M8 11h6"></path></svg>',
  star:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>',
};

const elements = {
  grid: document.querySelector("#mission-grid"),
  empty: document.querySelector("#empty-state"),
  resultCount: document.querySelector("#result-count"),
  resultLabel: document.querySelector("#result-label"),
  activeFilterNote: document.querySelector("#active-filter-note"),
  patternPanel: document.querySelector("#pattern-search-panel"),
  patternMatchCount: document.querySelector("#pattern-match-count"),
  patternMatchLabel: document.querySelector("#pattern-match-label"),
  patternClear: document.querySelector("#pattern-clear"),
  patternSelects: {
    left: document.querySelector("#pattern-left-select"),
    middle: document.querySelector("#pattern-middle-select"),
    right: document.querySelector("#pattern-right-select"),
  },
  patternClears: {
    left: document.querySelector("#pattern-left-clear"),
    middle: document.querySelector("#pattern-middle-clear"),
    right: document.querySelector("#pattern-right-clear"),
  },
  patternWindows: {
    left: document.querySelector("#pattern-left-window"),
    middle: document.querySelector("#pattern-middle-window"),
    right: document.querySelector("#pattern-right-window"),
  },
  search: document.querySelector("#search-input"),
  leftFilter: document.querySelector("#left-filter"),
  methodFilter: document.querySelector("#method-filter"),
  sort: document.querySelector("#sort-select"),
  clear: document.querySelector("#clear-filters"),
  emptyClear: document.querySelector("#empty-clear"),
  statusTabs: document.querySelectorAll(".status-tab"),
  rankFilters: document.querySelectorAll(".rank-filter"),
  progressRing: document.querySelector("#progress-ring"),
  progressPercent: document.querySelector("#progress-percent"),
  progressDate: document.querySelector("#progress-date"),
  completedCount: document.querySelector("#completed-count"),
  remainingCount: document.querySelector("#remaining-count"),
  favoriteCount: document.querySelector("#favorite-count"),
  rankProgress: document.querySelector("#rank-progress"),
  random: document.querySelector("#random-button"),
  scrollToMissions: document.querySelector("#scroll-to-missions"),
  importButton: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  exportButton: document.querySelector("#export-button"),
  dialog: document.querySelector("#mission-dialog"),
  dialogClose: document.querySelector("#dialog-close"),
  dialogImage: document.querySelector("#dialog-image"),
  dialogNumber: document.querySelector("#dialog-number"),
  dialogRank: document.querySelector("#dialog-rank"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogNote: document.querySelector("#dialog-note"),
  dialogLeft: document.querySelector("#dialog-left"),
  dialogVariants: document.querySelector("#dialog-variants"),
  dialogConstraintRow: document.querySelector("#dialog-constraint-row"),
  dialogConstraint: document.querySelector("#dialog-constraint"),
  dialogFavorite: document.querySelector("#dialog-favorite"),
  dialogComplete: document.querySelector("#dialog-complete"),
  dialogPrev: document.querySelector("#dialog-prev"),
  dialogNext: document.querySelector("#dialog-next"),
  toast: document.querySelector("#toast"),
};

let missions = [];
let leftPositions = {};
let patternData = null;
let symbolSprites = {};
const patternDefaults = { left: null, middle: null, right: null };
let completed = new Set();
let favorites = new Set();
let renderedMissions = [];
let activeMissionNo = null;
let toastTimer = null;
let searchFrame = null;
const reelScrollTimers = { left: null, middle: null, right: null };
const reelProgrammaticTimers = { left: null, middle: null, right: null };
const reelProgrammaticScroll = { left: false, middle: false, right: false };

const filters = {
  query: "",
  status: "all",
  rank: "all",
  left: "all",
  method: "all",
  sort: "number",
  pattern: {
    left: null,
    middle: null,
    right: null,
  },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

function normalizeSearch(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidMissionNo(value) {
  return typeof value === "string" && /^\d{3}$/.test(value) &&
    Number(value) >= 1 && Number(value) <= TOTAL_MISSIONS;
}

function readMigratedStorage(key, legacyKey) {
  const currentValue = localStorage.getItem(key);
  if (currentValue !== null) return currentValue;
  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue !== null) {
    try {
      localStorage.setItem(key, legacyValue);
      localStorage.removeItem(legacyKey);
    } catch {
      // The legacy value can still be read even when migration is unavailable.
    }
  }
  return legacyValue;
}

function loadLocalState() {
  try {
    const saved = JSON.parse(
      readMigratedStorage(STORAGE_KEY, LEGACY_STORAGE_KEY) || "{}",
    );
    completed = new Set(
      Array.isArray(saved.completed) ? saved.completed.filter(isValidMissionNo) : [],
    );
    favorites = new Set(
      Array.isArray(saved.favorites) ? saved.favorites.filter(isValidMissionNo) : [],
    );
    if (saved.updatedAt) {
      elements.progressDate.textContent = formatUpdatedAt(saved.updatedAt);
    }
  } catch {
    completed = new Set();
    favorites = new Set();
    showToast("保存データを読み込めなかったため、新しい状態で開始しました");
  }
}

function saveLocalState() {
  const payload = {
    version: 1,
    completed: Array.from(completed).sort(),
    favorites: Array.from(favorites).sort(),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    elements.progressDate.textContent = formatUpdatedAt(payload.updatedAt);
  } catch {
    showToast("このブラウザでは達成状態を保存できませんでした");
  }
}

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "LOCAL DATA";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date) + " 更新";
}

function populateLeftFilter() {
  LEFT_OPTION_ORDER.forEach(function (code) {
    if (!leftPositions[code]) return;
    const option = document.createElement("option");
    option.value = code;
    option.textContent = leftPositions[code];
    elements.leftFilter.append(option);
  });
}

function playMethodsForMission(mission) {
  const text = [mission.constraint, mission.note].filter(Boolean).join(" ");
  const methods = [];
  // The source also uses compact forms such as 単順, 択順, 単挟, and 択挟.
  if (/順/.test(text)) {
    methods.push("sequential");
  }
  if (/ハサミ|挟/.test(text)) {
    methods.push("sandwich");
  }
  return methods.length ? methods : ["unspecified"];
}

function populateMethodFilterCounts() {
  for (const option of elements.methodFilter.options) {
    if (option.value === "all") continue;
    const count = missions.filter(function (mission) {
      return mission.playMethods.includes(option.value);
    }).length;
    option.textContent = METHOD_LABELS[option.value] + "（" + count + "）";
  }
}

function patternOptionLabel(pattern) {
  return pattern.map(function (symbol) {
    return patternData.symbolLabels[symbol] || symbol;
  }).join("・");
}

function buildSymbolSprites() {
  symbolSprites = {};
  missions.forEach(function (mission) {
    REEL_KEYS.forEach(function (reel) {
      const pattern = mission.stopPattern[reel];
      if (!pattern) return;
      pattern.forEach(function (symbol, row) {
        if (symbolSprites[symbol]) return;
        symbolSprites[symbol] = {
          image: mission.image,
          column: REEL_COLUMNS[reel],
          row,
        };
      });
    });
  });

  Object.keys(patternData.symbolLabels).forEach(function (symbol) {
    if (!symbolSprites[symbol]) {
      throw new Error("Missing image crop for symbol " + symbol);
    }
  });

  Object.values(symbolSprites).forEach(function (sprite) {
    const image = new Image();
    image.src = sprite.image;
  });
}

function selectedPattern(reel) {
  const index = filters.pattern[reel];
  if (!Number.isInteger(index)) return null;
  return patternData.reelWindows[reel][index] || null;
}

function populatePatternSelectors() {
  REEL_KEYS.forEach(function (reel) {
    const select = elements.patternSelects[reel];
    const fragment = document.createDocumentFragment();
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "未指定";
    fragment.append(emptyOption);

    patternData.reelWindows[reel].forEach(function (pattern, index) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = patternOptionLabel(pattern);
      fragment.append(option);
    });
    select.replaceChildren(fragment);
  });
}

function symbolImageMarkup(symbol) {
  const sprite = symbolSprites[symbol];
  const label = patternData.symbolLabels[symbol] || symbol;
  if (!sprite) return "<strong>" + escapeHtml(label) + "</strong>";
  return [
    '<span class="pattern-symbol-art" aria-hidden="true" style="--sprite-column:',
    sprite.column, "; --sprite-row:", sprite.row, '">',
    '<img src="', escapeHtml(sprite.image), '" alt="" draggable="false" />',
    "</span>",
    '<span class="sr-only">', escapeHtml(label), "</span>",
  ].join("");
}

function patternIndexForWindow(reel, pattern) {
  return patternData.reelWindows[reel].findIndex(function (candidate) {
    return samePattern(candidate, pattern);
  });
}

function initializePatternDefaults() {
  const firstMissionPattern = missions[0].stopPattern;
  const defaults = {
    left: firstMissionPattern.left,
    middle: patternData.reelWindows.middle[0],
    right: firstMissionPattern.right,
  };
  REEL_KEYS.forEach(function (reel) {
    const index = patternIndexForWindow(reel, defaults[reel]);
    if (index < 0) throw new Error("Missing default pattern for " + reel + " reel");
    patternDefaults[reel] = index;
    filters.pattern[reel] = index;
    elements.patternSelects[reel].value = String(index);
  });
}

function reelDisplaySequence(reel) {
  return patternData.reelSequences[reel].slice().reverse();
}

function reelCellHeight(reel) {
  const container = elements.patternWindows[reel];
  const cell = container.querySelector(".pattern-reel-scroll-symbol");
  return cell ? cell.getBoundingClientRect().height : container.clientHeight / 3;
}

function updatePatternWindowLabel(reel) {
  const container = elements.patternWindows[reel];
  const pattern = selectedPattern(reel);
  container.classList.toggle("is-inactive", !pattern);
  elements.patternClears[reel].disabled = !pattern;
  container.setAttribute(
    "aria-label",
    REEL_LABELS[reel] + "リール：" + (pattern
      ? pattern.map(function (symbol, row) {
        return ROW_LABELS[row] + "段 " + patternData.symbolLabels[symbol];
      }).join("、")
      : "検索対象外"),
  );
}

function scrollReelToPattern(reel, index, behavior = "smooth") {
  if (!Number.isInteger(index)) return;
  const container = elements.patternWindows[reel];
  const sequence = reelDisplaySequence(reel);
  const pattern = patternData.reelWindows[reel][index];
  const start = sequence.findIndex(function (_, sequenceIndex) {
    return samePattern(pattern, [
      sequence[sequenceIndex],
      sequence[(sequenceIndex + 1) % sequence.length],
      sequence[(sequenceIndex + 2) % sequence.length],
    ]);
  });
  const cellHeight = reelCellHeight(reel);
  if (start < 0 || !cellHeight) return;

  reelProgrammaticScroll[reel] = true;
  window.clearTimeout(reelProgrammaticTimers[reel]);
  container.scrollTo({
    top: (sequence.length * REEL_CENTER_REPEAT + start) * cellHeight,
    behavior,
  });
  reelProgrammaticTimers[reel] = window.setTimeout(function () {
    reelProgrammaticScroll[reel] = false;
  }, behavior === "smooth" ? 520 : 80);
}

function setPatternIndex(reel, index, behavior = "smooth", shouldRender = true) {
  filters.pattern[reel] = index;
  elements.patternSelects[reel].value = Number.isInteger(index) ? String(index) : "";
  updatePatternWindowLabel(reel);
  scrollReelToPattern(reel, index, behavior);
  if (shouldRender) renderMissions();
}

function settleScrolledReel(reel) {
  const container = elements.patternWindows[reel];
  const sequence = reelDisplaySequence(reel);
  const cellHeight = reelCellHeight(reel);
  if (!cellHeight) return;

  const rawIndex = Math.round(container.scrollTop / cellHeight);
  const sequenceIndex = ((rawIndex % sequence.length) + sequence.length) % sequence.length;
  const pattern = [
    sequence[sequenceIndex],
    sequence[(sequenceIndex + 1) % sequence.length],
    sequence[(sequenceIndex + 2) % sequence.length],
  ];
  const index = patternIndexForWindow(reel, pattern);
  if (index < 0) return;

  filters.pattern[reel] = index;
  elements.patternSelects[reel].value = String(index);
  updatePatternWindowLabel(reel);
  container.classList.remove("is-scrolling");

  const localIndex = ((rawIndex % sequence.length) + sequence.length) % sequence.length;
  const needsRecentering = rawIndex < sequence.length * 2 ||
    rawIndex >= sequence.length * (REEL_REPEAT_COUNT - 2);
  const targetIndex = needsRecentering
    ? sequence.length * REEL_CENTER_REPEAT + localIndex
    : rawIndex;
  const snappedTop = targetIndex * cellHeight;
  if (Math.abs(container.scrollTop - snappedTop) > 0.5) {
    reelProgrammaticScroll[reel] = true;
    container.scrollTo({
      top: snappedTop,
      behavior: needsRecentering ? "auto" : "smooth",
    });
    window.clearTimeout(reelProgrammaticTimers[reel]);
    reelProgrammaticTimers[reel] = window.setTimeout(function () {
      reelProgrammaticScroll[reel] = false;
    }, needsRecentering ? 80 : 300);
  }
  renderMissions();
}

function scrollPatternReelByOne(reel, direction, behavior = "smooth") {
  const container = elements.patternWindows[reel];
  const cellHeight = reelCellHeight(reel);
  if (!cellHeight) return;
  const currentIndex = Math.round(container.scrollTop / cellHeight);
  container.scrollTo({
    top: (currentIndex + direction) * cellHeight,
    behavior,
  });
}

function buildPatternReel(reel) {
  const container = elements.patternWindows[reel];
  const sequence = reelDisplaySequence(reel);
  const symbols = [];
  for (let copy = 0; copy < REEL_REPEAT_COUNT; copy += 1) {
    sequence.forEach(function (symbol) {
      symbols.push([
        '<span class="pattern-reel-scroll-symbol" aria-hidden="true">',
        symbolImageMarkup(symbol),
        "</span>",
      ].join(""));
    });
  }
  container.innerHTML = [
    '<span class="pattern-row-markers" aria-hidden="true">',
    ROW_LABELS.map(function (label) { return "<small>" + label + "</small>"; }).join(""),
    "</span>",
    '<span class="pattern-reel-scroll-track">', symbols.join(""), "</span>",
  ].join("");
  updatePatternWindowLabel(reel);

  function releaseProgrammaticScroll() {
    reelProgrammaticScroll[reel] = false;
    window.clearTimeout(reelProgrammaticTimers[reel]);
  }

  container.addEventListener("wheel", releaseProgrammaticScroll, { passive: true });
  container.addEventListener("pointerdown", releaseProgrammaticScroll);

  container.addEventListener("scroll", function () {
    if (reelProgrammaticScroll[reel]) return;
    container.classList.add("is-scrolling");
    window.clearTimeout(reelScrollTimers[reel]);
    reelScrollTimers[reel] = window.setTimeout(function () {
      settleScrolledReel(reel);
    }, REEL_SETTLE_DELAY);
  });
  container.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    releaseProgrammaticScroll();
    scrollPatternReelByOne(reel, event.key === "ArrowDown" ? 1 : -1);
  });

  window.requestAnimationFrame(function () {
    scrollReelToPattern(reel, filters.pattern[reel], "auto");
  });
}

function buildPatternReels() {
  REEL_KEYS.forEach(buildPatternReel);
}

function samePattern(first, second) {
  return Array.isArray(first) && Array.isArray(second) &&
    first.length === second.length && first.every(function (symbol, index) {
      return symbol === second[index];
    });
}

function patternMatches(mission) {
  return REEL_KEYS.every(function (reel) {
    const expected = selectedPattern(reel);
    if (!expected) return true;
    const actual = mission.stopPattern[reel];
    return actual === null || samePattern(actual, expected);
  });
}

function selectedReels() {
  return REEL_KEYS.filter(function (reel) {
    return Number.isInteger(filters.pattern[reel]);
  });
}

function renderPatternSearchResult() {
  const reels = selectedReels();
  const hasSelection = reels.length > 0;
  const count = hasSelection
    ? missions.filter(patternMatches).length
    : null;
  elements.patternMatchCount.textContent = hasSelection ? String(count) : "—";
  elements.patternMatchLabel.textContent = hasSelection ? "件のリーチ目候補" : "リールを選択";
  elements.patternClear.disabled = !hasSelection;
  elements.patternPanel.classList.toggle("has-selection", hasSelection);
  elements.patternPanel.classList.toggle("has-no-match", hasSelection && count === 0);
}

function missionMatches(mission) {
  if (filters.status === "complete" && !completed.has(mission.no)) return false;
  if (filters.status === "incomplete" && completed.has(mission.no)) return false;
  if (filters.status === "favorite" && !favorites.has(mission.no)) return false;
  if (filters.rank !== "all" && mission.rank !== filters.rank) return false;

  if (filters.left !== "all") {
    const group = LEFT_GROUPS[filters.left];
    if (group ? !group.has(mission.left) : mission.left !== filters.left) return false;
  }

  if (
    filters.method !== "all" &&
    !mission.playMethods.includes(filters.method)
  ) return false;

  if (!patternMatches(mission)) return false;

  if (filters.query && !mission.searchText.includes(filters.query)) return false;
  return true;
}

function sortMissions(list) {
  const copy = list.slice();
  if (filters.sort === "difficulty") {
    return copy.sort(function (a, b) {
      return RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank) ||
        Number(a.no) - Number(b.no);
    });
  }
  if (filters.sort === "remaining") {
    return copy.sort(function (a, b) {
      return Number(completed.has(a.no)) - Number(completed.has(b.no)) ||
        Number(a.no) - Number(b.no);
    });
  }
  if (filters.sort === "variants") {
    return copy.sort(function (a, b) {
      return b.variants - a.variants || Number(a.no) - Number(b.no);
    });
  }
  return copy.sort(function (a, b) {
    return Number(a.no) - Number(b.no);
  });
}

function cardMarkup(mission) {
  const done = completed.has(mission.no);
  const favorite = favorites.has(mission.no);
  const note = mission.note || "停止形を画像でチェック";
  const constraint = mission.constraint
    ? '<span class="constraint-pill">' + escapeHtml(mission.constraint) + "</span>"
    : "";

  return [
    '<article class="mission-card', done ? " complete" : "", '" data-mission-no="',
    mission.no, '">',
    '<button class="card-visual" type="button" data-action="open" data-no="',
    mission.no, '" aria-label="ミッション', mission.no, 'の詳細を開く">',
    '<img src="', escapeHtml(mission.image), '" alt="ミッションNo.', mission.no,
    'のリーチ目" loading="lazy" decoding="async" />',
    '<span class="zoom-label">', icons.zoom, " 詳細を見る</span>",
    "</button>",
    '<div class="card-content">',
    '<div class="card-topline">',
    '<span class="mission-number">MISSION <strong>', mission.no, "</strong></span>",
    '<span class="rank-badge" data-rank="', mission.rank, '">', mission.rank, "</span>",
    "</div>",
    '<h3 class="card-title">', escapeHtml(mission.leftLabel), "からのリーチ目</h3>",
    '<p class="card-description', mission.note ? "" : " empty", '">',
    escapeHtml(note), "</p>",
    constraint,
    '<div class="card-footer">',
    '<span class="variant-count">候補 <strong>', mission.variants, "</strong>件</span>",
    '<button class="favorite-button', favorite ? " active" : "",
    '" type="button" data-action="favorite" data-no="', mission.no,
    '" aria-label="ミッション', mission.no, favorite ? "をお気に入りから外す" : "をお気に入りに追加",
    '" aria-pressed="', favorite ? "true" : "false", '">', icons.star, "</button>",
    '<button class="complete-button', done ? " active" : "",
    '" type="button" data-action="complete" data-no="', mission.no,
    '" aria-pressed="', done ? "true" : "false", '">',
    done ? "達成済み" : "達成にする", "</button>",
    "</div></div></article>",
  ].join("");
}

function renderMissions() {
  renderedMissions = sortMissions(missions.filter(missionMatches));
  elements.grid.setAttribute("aria-busy", "true");
  elements.grid.innerHTML = renderedMissions.map(cardMarkup).join("");
  elements.grid.setAttribute("aria-busy", "false");
  elements.resultCount.textContent = String(renderedMissions.length);
  elements.resultLabel.textContent = renderedMissions.length === 1 ? "件を表示" : "件を表示";
  elements.grid.hidden = renderedMissions.length === 0;
  elements.empty.hidden = renderedMissions.length !== 0;
  renderPatternSearchResult();
  renderActiveFilterNote();
}

function renderActiveFilterNote() {
  const labels = [];
  if (filters.query) labels.push("検索「" + filters.query + "」");
  if (filters.status !== "all") {
    labels.push({
      incomplete: "未達成",
      complete: "達成済み",
      favorite: "お気に入り",
    }[filters.status]);
  }
  if (filters.rank !== "all") labels.push("ランク " + filters.rank);
  if (filters.left !== "all") {
    const groupNames = { red: "枠内 赤7", blue: "枠内 青7", black: "枠内 黒BAR" };
    labels.push(groupNames[filters.left] || leftPositions[filters.left]);
  }
  if (filters.method !== "all") {
    labels.push("打ち方：" + METHOD_LABELS[filters.method]);
  }
  const reels = selectedReels();
  if (reels.length) {
    labels.push("停止形：" + reels.map(function (reel) {
      return REEL_LABELS[reel] + "リール";
    }).join("・"));
  }

  elements.activeFilterNote.hidden = labels.length === 0;
  if (labels.length) {
    elements.activeFilterNote.textContent =
      labels.join(" ・ ") + " で絞り込み中 — " + renderedMissions.length + "件";
  }
}

function renderProgress() {
  const done = completed.size;
  const percent = Math.round((done / TOTAL_MISSIONS) * 100);
  elements.progressRing.style.setProperty("--progress", (percent * 3.6) + "deg");
  elements.progressRing.setAttribute("aria-valuenow", String(done));
  elements.progressPercent.innerHTML = percent + "<small>%</small>";
  elements.completedCount.textContent = String(done);
  elements.remainingCount.textContent = String(TOTAL_MISSIONS - done);
  elements.favoriteCount.textContent = String(favorites.size);

  elements.rankProgress.innerHTML = RANK_ORDER.map(function (rank) {
    const rankMissions = missions.filter(function (mission) {
      return mission.rank === rank;
    });
    const rankDone = rankMissions.filter(function (mission) {
      return completed.has(mission.no);
    }).length;
    const rankPercent = rankMissions.length
      ? Math.round((rankDone / rankMissions.length) * 100)
      : 0;
    return [
      '<div class="rank-mini" style="--rank-color:', RANK_COLORS[rank],
      "; --rank-progress:", rankPercent, '%">',
      '<div class="rank-mini-head"><span>', rank, "</span><span>", rankDone, "/",
      rankMissions.length, "</span></div>",
      '<div class="rank-mini-track"><span></span></div>',
      "</div>",
    ].join("");
  }).join("");
}

function setStatusFilter(status) {
  filters.status = status;
  elements.statusTabs.forEach(function (button) {
    const active = button.dataset.status === status;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderMissions();
}

function setRankFilter(rank) {
  filters.rank = rank;
  elements.rankFilters.forEach(function (button) {
    const active = button.dataset.rank === rank;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderMissions();
}

function clearFilters() {
  filters.query = "";
  filters.left = "all";
  filters.method = "all";
  filters.sort = "number";
  elements.search.value = "";
  elements.leftFilter.value = "all";
  elements.methodFilter.value = "all";
  elements.sort.value = "number";
  clearPatternFilters(false);
  setStatusFilter("all");
  setRankFilter("all");
}

function clearPatternFilters(shouldRender = true) {
  REEL_KEYS.forEach(function (reel) {
    setPatternIndex(reel, null, "auto", false);
  });
  if (shouldRender) renderMissions();
}

function toggleComplete(no) {
  const nowCompleted = !completed.has(no);
  if (nowCompleted) completed.add(no);
  else completed.delete(no);
  saveLocalState();
  renderProgress();
  renderMissions();
  if (activeMissionNo === no && elements.dialog.open) updateDialog();
  showToast(
    "MISSION " + no + (nowCompleted ? " を達成済みにしました" : " を未達成に戻しました"),
  );
}

function toggleFavorite(no) {
  const nowFavorite = !favorites.has(no);
  if (nowFavorite) favorites.add(no);
  else favorites.delete(no);
  saveLocalState();
  renderProgress();
  renderMissions();
  if (activeMissionNo === no && elements.dialog.open) updateDialog();
  showToast(
    "MISSION " + no +
      (nowFavorite ? " をお気に入りに追加しました" : " をお気に入りから外しました"),
  );
}

function getMission(no) {
  return missions.find(function (mission) {
    return mission.no === no;
  });
}

function openMission(no) {
  if (!getMission(no)) return;
  activeMissionNo = no;
  updateDialog();
  if (!elements.dialog.open) elements.dialog.showModal();
}

function updateDialog() {
  const mission = getMission(activeMissionNo);
  if (!mission) return;
  const done = completed.has(mission.no);
  const favorite = favorites.has(mission.no);

  elements.dialogImage.src = mission.image;
  elements.dialogImage.alt = "ミッションNo." + mission.no + "のリーチ目";
  elements.dialogNumber.textContent = "MISSION " + mission.no;
  elements.dialogRank.textContent = mission.rank;
  elements.dialogRank.dataset.rank = mission.rank;
  elements.dialogTitle.textContent = mission.leftLabel + "からのリーチ目";
  elements.dialogNote.textContent = mission.note ||
    "停止形を画像で確認して、実戦で見つけたら達成にしましょう。";
  elements.dialogLeft.textContent = mission.leftLabel;
  elements.dialogVariants.textContent = mission.variants + "件";
  elements.dialogConstraintRow.hidden = !mission.constraint;
  elements.dialogConstraint.textContent = mission.constraint || "";
  elements.dialogFavorite.classList.toggle("active", favorite);
  elements.dialogFavorite.setAttribute("aria-pressed", String(favorite));
  elements.dialogFavorite.innerHTML = icons.star +
    (favorite ? " お気に入り済み" : " お気に入り");
  elements.dialogComplete.classList.toggle("completed", done);
  elements.dialogComplete.innerHTML = icons.check +
    (done ? " 達成済み — 取り消す" : " このミッションを達成");
}

function moveDialog(direction) {
  const pool = renderedMissions.length ? renderedMissions : missions;
  let index = pool.findIndex(function (mission) {
    return mission.no === activeMissionNo;
  });
  if (index < 0) {
    index = missions.findIndex(function (mission) {
      return mission.no === activeMissionNo;
    });
    const next = missions[(index + direction + missions.length) % missions.length];
    openMission(next.no);
    return;
  }
  const next = pool[(index + direction + pool.length) % pool.length];
  openMission(next.no);
}

function chooseRandomMission() {
  const remaining = missions.filter(function (mission) {
    return !completed.has(mission.no);
  });
  const pool = remaining.length ? remaining : missions;
  const mission = pool[Math.floor(Math.random() * pool.length)];
  openMission(mission.no);
}

function exportState() {
  const payload = {
    app: "DISC UP 2 Reach Mission",
    version: 1,
    exportedAt: new Date().toISOString(),
    completed: Array.from(completed).sort(),
    favorites: Array.from(favorites).sort(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "disc-up-2-missions-" +
    new Date().toISOString().slice(0, 10) + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("達成データを書き出しました");
}

async function importState(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!Array.isArray(payload.completed) || !Array.isArray(payload.favorites)) {
      throw new Error("invalid format");
    }
    const nextCompleted = new Set(payload.completed.filter(isValidMissionNo));
    const nextFavorites = new Set(payload.favorites.filter(isValidMissionNo));
    const message =
      "現在の達成データを、読み込んだデータ（達成 " + nextCompleted.size +
      "件）で置き換えます。よろしいですか？";
    if (!window.confirm(message)) return;
    completed = nextCompleted;
    favorites = nextFavorites;
    saveLocalState();
    renderProgress();
    renderMissions();
    showToast("達成データを読み込みました");
  } catch {
    showToast("読み込めないファイルです。書き出したJSONを選んでください");
  } finally {
    elements.importFile.value = "";
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(function () {
    elements.toast.classList.remove("visible");
  }, 2600);
}

function bindEvents() {
  elements.grid.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const no = button.dataset.no;
    if (button.dataset.action === "open") openMission(no);
    if (button.dataset.action === "complete") toggleComplete(no);
    if (button.dataset.action === "favorite") toggleFavorite(no);
  });

  elements.statusTabs.forEach(function (button) {
    button.addEventListener("click", function () {
      setStatusFilter(button.dataset.status);
    });
  });

  elements.rankFilters.forEach(function (button) {
    button.addEventListener("click", function () {
      setRankFilter(button.dataset.rank);
    });
  });

  elements.search.addEventListener("input", function () {
    window.cancelAnimationFrame(searchFrame);
    searchFrame = window.requestAnimationFrame(function () {
      filters.query = normalizeSearch(elements.search.value);
      renderMissions();
    });
  });

  elements.leftFilter.addEventListener("change", function () {
    filters.left = elements.leftFilter.value;
    renderMissions();
  });

  elements.methodFilter.addEventListener("change", function () {
    filters.method = elements.methodFilter.value;
    renderMissions();
  });

  REEL_KEYS.forEach(function (reel) {
    elements.patternSelects[reel].addEventListener("change", function () {
      const value = elements.patternSelects[reel].value;
      const next = value === "" ? null : Number(value);
      setPatternIndex(reel, next);
    });
    elements.patternClears[reel].addEventListener("click", function () {
      setPatternIndex(reel, null, "auto");
    });
  });

  elements.sort.addEventListener("change", function () {
    filters.sort = elements.sort.value;
    renderMissions();
  });

  elements.clear.addEventListener("click", clearFilters);
  elements.emptyClear.addEventListener("click", clearFilters);
  elements.patternClear.addEventListener("click", function () {
    clearPatternFilters();
  });
  elements.random.addEventListener("click", chooseRandomMission);
  elements.scrollToMissions.addEventListener("click", function () {
    elements.grid.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.exportButton.addEventListener("click", exportState);
  elements.importButton.addEventListener("click", function () {
    elements.importFile.click();
  });
  elements.importFile.addEventListener("change", function () {
    const file = elements.importFile.files && elements.importFile.files[0];
    if (file) importState(file);
  });

  elements.dialogClose.addEventListener("click", function () {
    elements.dialog.close();
  });
  elements.dialog.addEventListener("click", function (event) {
    if (event.target === elements.dialog) elements.dialog.close();
  });
  elements.dialogPrev.addEventListener("click", function () {
    moveDialog(-1);
  });
  elements.dialogNext.addEventListener("click", function () {
    moveDialog(1);
  });
  elements.dialogFavorite.addEventListener("click", function () {
    if (activeMissionNo) toggleFavorite(activeMissionNo);
  });
  elements.dialogComplete.addEventListener("click", function () {
    if (activeMissionNo) toggleComplete(activeMissionNo);
  });

  document.addEventListener("keydown", function (event) {
    const target = event.target;
    const typing = target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    if (event.key === "/" && !typing && !elements.dialog.open) {
      event.preventDefault();
      elements.search.focus();
    }
    if (elements.dialog.open && event.key === "ArrowLeft") moveDialog(-1);
    if (elements.dialog.open && event.key === "ArrowRight") moveDialog(1);
  });
}

async function initialize() {
  loadLocalState();
  bindEvents();
  try {
    const responses = await Promise.all([
      fetch(DATA_URL),
      fetch(PATTERN_DATA_URL),
    ]);
    if (!responses[0].ok || !responses[1].ok) {
      throw new Error("Mission data could not be loaded");
    }
    const payloads = await Promise.all(responses.map(function (response) {
      return response.json();
    }));
    const data = payloads[0];
    patternData = payloads[1];
    if (patternData.total !== TOTAL_MISSIONS) {
      throw new Error("Pattern data is incomplete");
    }
    leftPositions = data.leftPositions || {};
    missions = data.missions.map(function (mission) {
      const playMethods = playMethodsForMission(mission);
      const stopPattern = patternData.patterns[mission.no];
      if (!stopPattern) throw new Error("Missing pattern for mission " + mission.no);
      const searchText = normalizeSearch([
        mission.no,
        "No." + mission.no,
        mission.rank,
        mission.leftLabel,
        mission.constraint,
        mission.note,
        REEL_KEYS.map(function (reel) {
          const reelPattern = stopPattern[reel];
          return reelPattern ? patternOptionLabel(reelPattern) : "Any";
        }).join(" "),
        playMethods.map(function (method) { return METHOD_LABELS[method]; }).join(" "),
      ].join(" "));
      return Object.assign({}, mission, {
        playMethods,
        stopPattern,
        searchText,
      });
    });
    if (missions.length !== TOTAL_MISSIONS) {
      throw new Error("Mission data is incomplete");
    }
    buildSymbolSprites();
    populateLeftFilter();
    populateMethodFilterCounts();
    populatePatternSelectors();
    initializePatternDefaults();
    buildPatternReels();
    renderProgress();
    renderMissions();
  } catch (error) {
    elements.grid.innerHTML = "";
    elements.grid.hidden = true;
    elements.empty.hidden = false;
    elements.empty.querySelector("h3").textContent = "ミッションデータを読み込めませんでした";
    elements.empty.querySelector("p").textContent =
      "ローカルサーバーから開いているか確認してください。";
    elements.emptyClear.hidden = true;
    console.error(error);
  }
}

initialize();
