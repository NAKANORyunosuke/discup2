const CONTROL_DATA_URL = "data/control-table.json";
const MISSION_DATA_URL = "data/missions.json";
const MISSION_STATE_STORAGE_KEY = "discup2-reach-mission:v1";
const LEGACY_MISSION_STATE_STORAGE_KEY = "diskup2-reach-mission:v1";
const TABLE_PREFERENCES_STORAGE_KEY = "discup2-control-table:v1";
const LEGACY_TABLE_PREFERENCES_STORAGE_KEY = "diskup2-control-table:v1";
const CONTROL_REEL_REPEAT_COUNT = 9;
const CONTROL_REEL_CENTER_REPEAT = Math.floor(CONTROL_REEL_REPEAT_COUNT / 2);
const CONTROL_REEL_SETTLE_DELAY = 140;
const WHEEL_PIXEL_NOTCH = 100;
const TRACKPAD_STEP_THRESHOLD = 40;

// The control table numbers the symbol stopped on the lower row. The mission
// list groups the same 21 reel positions by its own left-position codes.
const RESULT_STOP_TO_MISSION_LEFT = Object.freeze({
  1: "2",
  2: "1",
  3: "l",
  4: "k",
  5: "j",
  6: "i",
  7: "h",
  8: "g",
  9: "f",
  10: "e",
  11: "d",
  12: "c",
  13: "b",
  14: "a",
  15: "9",
  16: "8",
  17: "7",
  18: "6",
  19: "5",
  20: "4",
  21: "3",
});

const elements = {
  stopGrid: document.querySelector("#stop-grid"),
  controlReelWindow: document.querySelector("#control-reel-window"),
  controlReelBottomValue: document.querySelector("#control-reel-bottom-value"),
  selectedCircled: document.querySelector("#selected-circled"),
  selectedSymbol: document.querySelector("#selected-symbol"),
  selectedStopImage: document.querySelector("#selected-stop-image"),
  slipTabs: document.querySelector("#slip-tabs"),
  resultImage: document.querySelector("#result-image"),
  routeStart: document.querySelector("#route-start"),
  routeSlip: document.querySelector("#route-slip"),
  routeEnd: document.querySelector("#route-end"),
  patternState: document.querySelector("#pattern-state"),
  impossibleMessage: document.querySelector("#impossible-message"),
  roleGroups: document.querySelector("#role-groups"),
  normalRoleGroup: document.querySelector("#normal-role-group"),
  hotRoleGroup: document.querySelector("#hot-role-group"),
  normalRoles: document.querySelector("#normal-roles"),
  hotRoles: document.querySelector("#hot-roles"),
  relatedMissions: document.querySelector("#related-missions"),
  relatedLeftLabel: document.querySelector("#related-left-label"),
  relatedMissionCount: document.querySelector("#related-mission-count"),
  relatedMissionTotal: document.querySelector("#related-mission-total"),
  relatedCompletedCount: document.querySelector("#related-completed-count"),
  showCompletedToggle: document.querySelector("#show-completed-toggle"),
  relatedMissionGrid: document.querySelector("#related-mission-grid"),
  relatedMissionEmpty: document.querySelector("#related-mission-empty"),
  roleSearch: document.querySelector("#role-search"),
  roleSearchClear: document.querySelector("#role-search-clear"),
  quickRoles: document.querySelectorAll(".quick-roles button"),
  reverseResults: document.querySelector("#reverse-results"),
  reverseCount: document.querySelector("#reverse-count"),
  reverseQueryLabel: document.querySelector("#reverse-query-label"),
  reverseGrid: document.querySelector("#reverse-result-grid"),
  workspace: document.querySelector("#control-workspace"),
  notes: document.querySelector("#control-notes-list"),
  print: document.querySelector("#print-button"),
  toast: document.querySelector("#table-toast"),
};

let tableData = null;
let missionData = null;
let completed = new Set();
let showCompleted = true;
let selectedStopNumber = 1;
let selectedSlipNumber = 0;
let searchFrame = null;
let toastTimer = null;
let controlReelScrollTimer = null;
let controlReelProgrammaticTimer = null;
let controlReelIndicatorFrame = null;
let controlReelProgrammaticScroll = false;
let controlReelWheelTarget = null;
let controlReelWheelRemainder = 0;
let controlReelWheelResetTimer = null;

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
    .replace(/\s+/g, "")
    .trim();
}

function isValidMissionNo(value) {
  return typeof value === "string" && /^\d{3}$/.test(value) &&
    Number(value) >= 1 && Number(value) <= 222;
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

function loadCompletionState() {
  try {
    const saved = JSON.parse(
      readMigratedStorage(
        MISSION_STATE_STORAGE_KEY,
        LEGACY_MISSION_STATE_STORAGE_KEY,
      ) || "{}",
    );
    completed = new Set(
      Array.isArray(saved.completed)
        ? saved.completed.filter(isValidMissionNo)
        : [],
    );
  } catch {
    completed = new Set();
  }
}

function loadTablePreferences() {
  try {
    const saved = JSON.parse(
      readMigratedStorage(
        TABLE_PREFERENCES_STORAGE_KEY,
        LEGACY_TABLE_PREFERENCES_STORAGE_KEY,
      ) || "{}",
    );
    showCompleted = saved.showCompleted !== false;
  } catch {
    showCompleted = true;
  }
  elements.showCompletedToggle.checked = showCompleted;
}

function saveTablePreferences() {
  try {
    localStorage.setItem(
      TABLE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ showCompleted }),
    );
    localStorage.removeItem(LEGACY_TABLE_PREFERENCES_STORAGE_KEY);
  } catch {
    showToast("表示設定を保存できませんでした");
  }
}

function stopByNumber(number) {
  return tableData.stops.find(function (stop) {
    return stop.number === number;
  });
}

function currentStop() {
  return stopByNumber(selectedStopNumber);
}

function currentSlip() {
  return currentStop().slips[selectedSlipNumber];
}

function controlReelSequence() {
  return tableData.stops.slice().reverse();
}

function controlReelCellHeight() {
  const cell = elements.controlReelWindow.querySelector(".control-reel-symbol");
  return cell
    ? cell.getBoundingClientRect().height
    : elements.controlReelWindow.clientHeight / 3;
}

function controlReelPeekOffset() {
  return parseFloat(
    getComputedStyle(elements.controlReelWindow).getPropertyValue(
      "--control-reel-peek",
    ),
  ) || 0;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function controlReelWheelSteps(event) {
  const direction = Math.sign(event.deltaY);
  if (!direction) return 0;

  if (
    controlReelWheelRemainder &&
    Math.sign(controlReelWheelRemainder) !== direction
  ) {
    controlReelWheelRemainder = 0;
  }

  if (event.deltaMode === 1) {
    return direction * Math.max(1, Math.round(Math.abs(event.deltaY) / 3));
  }
  if (event.deltaMode === 2) return direction;

  if (Math.abs(event.deltaY) >= TRACKPAD_STEP_THRESHOLD) {
    controlReelWheelRemainder = 0;
    return direction * Math.max(
      1,
      Math.round(Math.abs(event.deltaY) / WHEEL_PIXEL_NOTCH),
    );
  }

  controlReelWheelRemainder += event.deltaY;
  const steps = Math.trunc(
    controlReelWheelRemainder / TRACKPAD_STEP_THRESHOLD,
  );
  controlReelWheelRemainder -= steps * TRACKPAD_STEP_THRESHOLD;
  return steps;
}

function scrollControlReelByWheel(event) {
  const steps = controlReelWheelSteps(event);
  window.clearTimeout(controlReelWheelResetTimer);
  controlReelWheelResetTimer = window.setTimeout(function () {
    controlReelWheelTarget = null;
    controlReelWheelRemainder = 0;
  }, 520);
  if (!steps) return;

  const cellHeight = controlReelCellHeight();
  const peekOffset = controlReelPeekOffset();
  if (!cellHeight) return;
  const currentTarget = Number.isInteger(controlReelWheelTarget)
    ? controlReelWheelTarget
    : Math.round(
      (elements.controlReelWindow.scrollTop + peekOffset) / cellHeight,
    );
  controlReelWheelTarget = currentTarget + steps;
  elements.controlReelWindow.scrollTo({
    top: controlReelWheelTarget * cellHeight - peekOffset,
    behavior: "smooth",
  });
}

function controlReelPosition() {
  const sequence = controlReelSequence();
  const cellHeight = controlReelCellHeight();
  const peekOffset = controlReelPeekOffset();
  if (!cellHeight) return null;
  const rawIndex = Math.round(
    (elements.controlReelWindow.scrollTop + peekOffset) / cellHeight,
  );
  const localStartIndex = positiveModulo(rawIndex, sequence.length);
  const bottomIndex = positiveModulo(rawIndex + 2, sequence.length);
  return {
    cellHeight,
    rawIndex,
    localStartIndex,
    stop: sequence[bottomIndex],
  };
}

function updateControlReelValue(stop) {
  if (!stop) return;
  elements.controlReelBottomValue.textContent =
    stop.circled + "番 " + stop.symbol;
  elements.controlReelWindow.setAttribute(
    "aria-label",
    "左リール：下段 " + stop.circled + "番 " + stop.symbol,
  );
}

function scrollControlReelToStop(stopNumber, behavior = "smooth") {
  const sequence = controlReelSequence();
  const bottomIndex = sequence.findIndex(function (stop) {
    return stop.number === Number(stopNumber);
  });
  const cellHeight = controlReelCellHeight();
  const peekOffset = controlReelPeekOffset();
  if (bottomIndex < 0 || !cellHeight) return;
  const topIndex = positiveModulo(bottomIndex - 2, sequence.length);

  controlReelProgrammaticScroll = true;
  elements.controlReelWindow.classList.remove("is-scrolling");
  window.clearTimeout(controlReelProgrammaticTimer);
  elements.controlReelWindow.scrollTo({
    top: (sequence.length * CONTROL_REEL_CENTER_REPEAT + topIndex) * cellHeight -
      peekOffset,
    behavior,
  });
  updateControlReelValue(stopByNumber(stopNumber));
  controlReelProgrammaticTimer = window.setTimeout(function () {
    controlReelProgrammaticScroll = false;
  }, behavior === "smooth" ? 520 : 80);
}

function settleControlReel() {
  const position = controlReelPosition();
  if (!position) return;
  const sequence = controlReelSequence();
  const needsRecentering = position.rawIndex < sequence.length * 2 ||
    position.rawIndex >= sequence.length * (CONTROL_REEL_REPEAT_COUNT - 2);
  const targetIndex = needsRecentering
    ? sequence.length * CONTROL_REEL_CENTER_REPEAT + position.localStartIndex
    : position.rawIndex;
  const targetTop = targetIndex * position.cellHeight - controlReelPeekOffset();

  controlReelWheelTarget = null;
  controlReelWheelRemainder = 0;
  window.clearTimeout(controlReelWheelResetTimer);

  elements.controlReelWindow.classList.remove("is-scrolling");
  selectPattern(position.stop.number, selectedSlipNumber, false, false);
  updateControlReelValue(position.stop);

  if (Math.abs(elements.controlReelWindow.scrollTop - targetTop) > 0.5) {
    controlReelProgrammaticScroll = true;
    window.clearTimeout(controlReelProgrammaticTimer);
    elements.controlReelWindow.scrollTo({
      top: targetTop,
      behavior: needsRecentering ? "auto" : "smooth",
    });
    controlReelProgrammaticTimer = window.setTimeout(function () {
      controlReelProgrammaticScroll = false;
    }, needsRecentering ? 80 : 300);
  }
}

function controlReelSymbolMarkup(stop) {
  return [
    '<span class="control-reel-symbol" aria-hidden="true">',
    '<span class="control-reel-symbol-art">',
    '<img src="', escapeHtml(stop.image), '" alt="" draggable="false" />',
    "</span>",
    '<span class="control-reel-symbol-meta"><strong>', stop.circled,
    '</strong><small>', escapeHtml(stop.symbol), "</small></span>",
    "</span>",
  ].join("");
}

function buildControlReel() {
  const sequence = controlReelSequence();
  const symbols = [];
  for (let copy = 0; copy < CONTROL_REEL_REPEAT_COUNT; copy += 1) {
    sequence.forEach(function (stop) {
      symbols.push(controlReelSymbolMarkup(stop));
    });
  }
  elements.controlReelWindow.innerHTML =
    '<span class="control-reel-track">' + symbols.join("") + "</span>";

  function releaseProgrammaticScroll() {
    controlReelProgrammaticScroll = false;
    window.clearTimeout(controlReelProgrammaticTimer);
  }

  elements.controlReelWindow.addEventListener("wheel", function (event) {
    if (!event.deltaY || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    releaseProgrammaticScroll();
    scrollControlReelByWheel(event);
  }, { passive: false });
  elements.controlReelWindow.addEventListener("pointerdown", function () {
    releaseProgrammaticScroll();
    controlReelWheelTarget = null;
    controlReelWheelRemainder = 0;
    window.clearTimeout(controlReelWheelResetTimer);
  });

  elements.controlReelWindow.addEventListener("scroll", function () {
    if (controlReelProgrammaticScroll) return;
    elements.controlReelWindow.classList.add("is-scrolling");
    window.cancelAnimationFrame(controlReelIndicatorFrame);
    controlReelIndicatorFrame = window.requestAnimationFrame(function () {
      const position = controlReelPosition();
      if (position) updateControlReelValue(position.stop);
    });
    window.clearTimeout(controlReelScrollTimer);
    controlReelScrollTimer = window.setTimeout(
      settleControlReel,
      CONTROL_REEL_SETTLE_DELAY,
    );
  });

  elements.controlReelWindow.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    releaseProgrammaticScroll();
    const cellHeight = controlReelCellHeight();
    elements.controlReelWindow.scrollBy({
      top: (event.key === "ArrowDown" ? 1 : -1) * cellHeight,
      behavior: "smooth",
    });
  });

  window.requestAnimationFrame(function () {
    scrollControlReelToStop(selectedStopNumber, "auto");
  });
}

function parseInitialSelection() {
  const values = new URLSearchParams(location.hash.slice(1));
  const stop = Number(values.get("stop"));
  const slip = Number(values.get("slip"));
  if (Number.isInteger(stop) && stop >= 1 && stop <= 21) {
    selectedStopNumber = stop;
  }
  if (Number.isInteger(slip) && slip >= 0 && slip <= 4) {
    selectedSlipNumber = slip;
  }
}

function updateLocation() {
  const hash = "stop=" + selectedStopNumber + "&slip=" + selectedSlipNumber;
  history.replaceState(null, "", location.pathname + location.search + "#" + hash);
}

function renderStopGrid() {
  elements.stopGrid.innerHTML = tableData.stops.map(function (stop) {
    const active = stop.number === selectedStopNumber;
    return [
      '<button class="stop-button', active ? " active" : "",
      '" type="button" data-stop="', stop.number,
      '" aria-pressed="', active ? "true" : "false",
      '" aria-label="', stop.circled, "番 ", escapeHtml(stop.symbol), '">',
      "<strong>", stop.circled, "</strong>",
      "<small>", escapeHtml(stop.symbol), "</small>",
      "</button>",
    ].join("");
  }).join("");
}

function slipLabel(slip) {
  return slip === 0 ? "ビタ" : slip + "コマ";
}

function renderSlipTabs() {
  const stop = currentStop();
  elements.slipTabs.innerHTML = stop.slips.map(function (slip) {
    const active = slip.slip === selectedSlipNumber;
    const subLabel = slip.state === "confirmed"
      ? slip.annotation
      : slip.state === "impossible" ? "停止しない" : "対応あり";
    return [
      '<button class="slip-button state-', slip.state, active ? " active" : "",
      '" type="button" role="tab" data-slip="', slip.slip,
      '" aria-selected="', active ? "true" : "false",
      '" aria-label="', escapeHtml(slip.label), '">',
      "<strong>", slipLabel(slip.slip), "</strong>",
      "<small>", escapeHtml(subLabel), "</small>",
      "</button>",
    ].join("");
  }).join("");
}

function renderRoleChips(target, roles) {
  target.innerHTML = roles.map(function (role) {
    return '<span class="role-chip">' + escapeHtml(role) + "</span>";
  }).join("");
}

function relatedMissionMarkup(mission) {
  const done = completed.has(mission.no);
  const description = mission.note || mission.leftLabel + "の停止形を画像で確認";
  return [
    '<a class="related-mission-card', done ? " completed" : "",
    '" href="', escapeHtml(mission.image),
    '" target="_blank" rel="noreferrer" aria-label="',
    done ? "達成済み、" : "", "ミッション", mission.no,
    'のリーチ目を原寸で開く">',
    '<span class="related-mission-visual">',
    '<img src="', escapeHtml(mission.image), '" alt="ミッションNo.', mission.no,
    'のリーチ目" loading="lazy" decoding="async" />',
    '<span class="related-rank" data-rank="', mission.rank, '">',
    mission.rank, "</span>",
    done ? '<span class="related-complete-badge">✓ 達成済み</span>' : "",
    "</span>",
    '<span class="related-mission-meta"><strong>MISSION ', mission.no,
    '</strong><span>候補 <b>', mission.variants, "</b>件</span></span>",
    '<span class="related-mission-description">', escapeHtml(description), "</span>",
    "</a>",
  ].join("");
}

function renderRelatedMissions() {
  const slip = currentSlip();
  const impossible = slip.state === "impossible";
  const leftCode = RESULT_STOP_TO_MISSION_LEFT[slip.resultStop];
  const leftLabel = leftCode ? missionData.leftPositions[leftCode] : "";
  const allMissions = impossible || !leftCode
    ? []
    : missionData.missions.filter(function (mission) {
      return mission.left === leftCode;
    });
  const completedCount = allMissions.filter(function (mission) {
    return completed.has(mission.no);
  }).length;
  const missions = showCompleted
    ? allMissions
    : allMissions.filter(function (mission) {
      return !completed.has(mission.no);
    });

  elements.relatedMissions.setAttribute("aria-busy", "false");
  elements.showCompletedToggle.checked = showCompleted;
  elements.showCompletedToggle.disabled = impossible || allMissions.length === 0;
  elements.relatedMissionCount.textContent = String(missions.length);
  elements.relatedMissionTotal.textContent =
    !showCompleted && allMissions.length ? " / " + allMissions.length : "";
  elements.relatedCompletedCount.textContent =
    "達成済み " + completedCount + "件";
  elements.relatedMissionGrid.hidden = missions.length === 0;
  elements.relatedMissionEmpty.hidden = missions.length !== 0;

  if (impossible) {
    elements.relatedLeftLabel.textContent = "停止しない制御";
    elements.relatedMissionEmpty.textContent =
      "この位置・スベリでは停止しないため、対応するリーチ目はありません。";
    elements.relatedMissionGrid.innerHTML = "";
    return;
  }

  elements.relatedLeftLabel.textContent = leftLabel;
  elements.relatedMissionGrid.innerHTML = missions.map(relatedMissionMarkup).join("");
  if (!missions.length) {
    elements.relatedMissionEmpty.textContent = allMissions.length
      ? "この停止形のリーチ目はすべて達成済みです。「達成済みも表示」をオンにすると確認できます。"
      : "この左リール停止形に対応するミッションは収録されていません。";
  }
}

function renderPattern() {
  const stop = currentStop();
  const slip = currentSlip();
  const resultStop = stopByNumber(slip.resultStop);

  elements.resultImage.src = slip.image;
  elements.resultImage.alt =
    stop.circled + "番を下段に押して" + slip.label + "した停止形";
  elements.routeStart.textContent = stop.circled;
  elements.routeSlip.textContent = slip.label;
  elements.routeEnd.textContent = resultStop.circled;

  elements.patternState.className = "pattern-state";
  if (slip.state === "confirmed") {
    elements.patternState.textContent = slip.annotation;
    elements.patternState.classList.add("confirmed");
  } else if (slip.state === "impossible") {
    elements.patternState.textContent = "停止しない";
    elements.patternState.classList.add("impossible");
  } else {
    elements.patternState.textContent = "通常制御";
  }

  const impossible = slip.state === "impossible";
  elements.impossibleMessage.hidden = !impossible;
  elements.roleGroups.hidden = impossible;

  if (!impossible) {
    elements.normalRoleGroup.hidden = slip.normalRoles.length === 0;
    elements.hotRoleGroup.hidden = slip.hotRoles.length === 0;
    renderRoleChips(elements.normalRoles, slip.normalRoles);
    renderRoleChips(elements.hotRoles, slip.hotRoles);
  }

  renderRelatedMissions();
}

function renderSelectedStop() {
  const stop = currentStop();
  elements.selectedCircled.textContent = stop.circled;
  elements.selectedSymbol.textContent = "左リール：" + stop.symbol;
  elements.selectedStopImage.src = stop.image;
  elements.selectedStopImage.alt = stop.heading + "の押下位置";
  updateControlReelValue(stop);
}

function renderExplorer() {
  renderStopGrid();
  renderSelectedStop();
  renderSlipTabs();
  renderPattern();
  updateLocation();
}

function selectPattern(stopNumber, slipNumber, scroll, syncReel = true) {
  selectedStopNumber = Math.min(21, Math.max(1, Number(stopNumber)));
  selectedSlipNumber = Math.min(4, Math.max(0, Number(slipNumber)));
  renderExplorer();
  if (syncReel) scrollControlReelToStop(selectedStopNumber);
  if (scroll) {
    elements.workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function searchPatterns(value) {
  const normalized = normalizeSearch(value);
  elements.roleSearchClear.hidden = !normalized;
  elements.quickRoles.forEach(function (button) {
    button.classList.toggle(
      "active",
      normalized && normalizeSearch(button.dataset.query) === normalized,
    );
  });

  if (!normalized) {
    elements.reverseResults.hidden = true;
    elements.reverseGrid.innerHTML = "";
    return;
  }

  const matches = [];
  for (const stop of tableData.stops) {
    for (const slip of stop.slips) {
      const haystack = normalizeSearch([
        stop.number,
        stop.circled,
        stop.symbol,
        slip.label,
        slip.annotation,
        slip.roles.join(" "),
      ].join(" "));
      if (haystack.includes(normalized)) {
        matches.push({ stop, slip });
      }
    }
  }

  elements.reverseResults.hidden = false;
  elements.reverseCount.textContent = String(matches.length);
  elements.reverseQueryLabel.textContent = "「" + value.trim() + "」";
  elements.reverseGrid.innerHTML = matches.length
    ? matches.map(function (match) {
      const roleSummary = match.slip.state === "impossible"
        ? "停止しない制御"
        : match.slip.roles.slice(0, 3).join("・") +
          (match.slip.roles.length > 3 ? " ほか" : "");
      return [
        '<button class="reverse-card" type="button" data-stop="',
        match.stop.number, '" data-slip="', match.slip.slip,
        '" aria-label="', match.stop.circled, "番 ", escapeHtml(match.slip.label),
        'を表示">',
        '<span class="reverse-card-top"><strong>', match.stop.circled,
        "番・", slipLabel(match.slip.slip), "</strong><span>",
        match.slip.annotation ? escapeHtml(match.slip.annotation) : escapeHtml(match.stop.symbol),
        "</span></span>",
        "<span>", escapeHtml(roleSummary), "</span>",
        "</button>",
      ].join("");
    }).join("")
    : '<p class="reverse-empty">該当する制御パターンがありません。別の成立役で検索してください。</p>';
}

function renderNotes() {
  elements.notes.innerHTML = tableData.notes.map(function (note) {
    return "<li>" + escapeHtml(note) + "</li>";
  }).join("");
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
  elements.stopGrid.addEventListener("click", function (event) {
    const button = event.target.closest("[data-stop]");
    if (!button) return;
    selectPattern(button.dataset.stop, selectedSlipNumber, false);
  });

  elements.slipTabs.addEventListener("click", function (event) {
    const button = event.target.closest("[data-slip]");
    if (!button) return;
    selectPattern(selectedStopNumber, button.dataset.slip, false);
  });

  elements.slipTabs.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = (selectedSlipNumber + direction + 5) % 5;
    selectPattern(selectedStopNumber, next, false);
    const active = elements.slipTabs.querySelector('[data-slip="' + next + '"]');
    if (active) active.focus();
  });

  elements.roleSearch.addEventListener("input", function () {
    window.cancelAnimationFrame(searchFrame);
    searchFrame = window.requestAnimationFrame(function () {
      searchPatterns(elements.roleSearch.value);
    });
  });

  elements.roleSearchClear.addEventListener("click", function () {
    elements.roleSearch.value = "";
    searchPatterns("");
    elements.roleSearch.focus();
  });

  elements.quickRoles.forEach(function (button) {
    button.addEventListener("click", function () {
      elements.roleSearch.value = button.dataset.query;
      searchPatterns(button.dataset.query);
    });
  });

  elements.showCompletedToggle.addEventListener("change", function () {
    showCompleted = elements.showCompletedToggle.checked;
    saveTablePreferences();
    if (missionData) renderRelatedMissions();
  });

  window.addEventListener("storage", function (event) {
    if (
      event.key === MISSION_STATE_STORAGE_KEY ||
      event.key === LEGACY_MISSION_STATE_STORAGE_KEY
    ) {
      loadCompletionState();
      if (missionData) renderRelatedMissions();
    }
    if (
      event.key === TABLE_PREFERENCES_STORAGE_KEY ||
      event.key === LEGACY_TABLE_PREFERENCES_STORAGE_KEY
    ) {
      loadTablePreferences();
      if (missionData) renderRelatedMissions();
    }
  });

  window.addEventListener("pageshow", function () {
    loadCompletionState();
    if (missionData) renderRelatedMissions();
  });

  elements.reverseGrid.addEventListener("click", function (event) {
    const button = event.target.closest(".reverse-card");
    if (!button) return;
    selectPattern(button.dataset.stop, button.dataset.slip, true);
  });

  elements.print.addEventListener("click", function () {
    window.print();
  });

  document.addEventListener("keydown", function (event) {
    const target = event.target;
    const typing = target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      elements.roleSearch.focus();
    }
  });
}

async function initialize() {
  bindEvents();
  loadCompletionState();
  loadTablePreferences();
  try {
    const responses = await Promise.all([
      fetch(CONTROL_DATA_URL),
      fetch(MISSION_DATA_URL),
    ]);
    if (responses.some(function (response) { return !response.ok; })) {
      throw new Error("Control or mission data could not be loaded");
    }
    [tableData, missionData] = await Promise.all(responses.map(function (response) {
      return response.json();
    }));
    if (tableData.stops.length !== 21 || tableData.totalPatterns !== 105) {
      throw new Error("Control data is incomplete");
    }
    if (missionData.missions.length !== 222) {
      throw new Error("Mission data is incomplete");
    }
    parseInitialSelection();
    renderNotes();
    renderExplorer();
    buildControlReel();
  } catch (error) {
    console.error(error);
    elements.stopGrid.innerHTML =
      '<p class="reverse-empty">制御データを読み込めませんでした。</p>';
    showToast("制御データを読み込めませんでした");
  }
}

initialize();
