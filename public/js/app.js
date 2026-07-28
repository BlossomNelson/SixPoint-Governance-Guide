/**
 * app.js
 * ------------------------------------------------------------------
 * Small hand-written state machine, no framework: the spec calls for
 * a static frontend, and this app has six states (landing, picker,
 * loading, stakes, guide, error) with no shared client-side state
 * beyond "which sector did the user pick" and the generated guide
 * itself, so a framework would add build tooling for very little
 * benefit here.
 * ------------------------------------------------------------------
 */

(function () {
  "use strict";

  const state = {
    sectorId: null,
    guide: null,
  };

  const views = {
    landing: document.getElementById("view-landing"),
    picker: document.getElementById("view-picker"),
    loading: document.getElementById("view-loading"),
    error: document.getElementById("view-error"),
    stakes: document.getElementById("view-stakes"),
    guide: document.getElementById("view-guide"),
  };

  function showView(name) {
    Object.values(views).forEach((el) => {
      el.hidden = true;
    });
    views[name].hidden = false;
    // Move focus to the new view's heading so keyboard and screen-reader
    // users land somewhere sensible after a state change, instead of
    // staying wherever focus happened to be on the previous screen.
    const heading = views[name].querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: false });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------- Picker: render cards ----------------

  function renderSectorGrid() {
    const grid = document.getElementById("sector-grid");
    grid.innerHTML = "";
    SECTOR_OPTIONS.forEach((sector) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sector-card";
      btn.dataset.sectorId = sector.id;
      btn.setAttribute("aria-pressed", "false");
      // Stakes tier (higher/standard) is deliberately not shown here: it
      // only appears once a sector is picked and the guide is generated,
      // so the picker itself stays neutral between sectors.
      btn.innerHTML = `<span class="sector-card-label">${sector.label}</span>`;
      btn.addEventListener("click", () => {
        state.sectorId = sector.id;
        grid.querySelectorAll(".sector-card").forEach((c) => {
          c.classList.remove("selected");
          c.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
        updateGenerateButton();
      });
      grid.appendChild(btn);
    });
  }

  function updateGenerateButton() {
    document.getElementById("generate-btn").disabled = !state.sectorId;
  }

  // ---------------- Generation ----------------

  async function generateGuide() {
    showView("loading");
    try {
      const res = await fetch("/api/generate-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: state.sectorId }),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const guide = await res.json();
      state.guide = guide;
      renderStakes(guide);
      renderGuide(guide);
      showView("stakes");
    } catch (err) {
      // Note: this only fires if the /api/generate-guide request itself
      // fails to complete (e.g. the deployment is unreachable). If the
      // Anthropic call fails but the function still runs, the backend's
      // own fallback logic already returns 200 with isFallback: true:
      // this branch is the outer, last-resort safety net.
      document.getElementById("error-message").textContent =
        "We couldn't generate your guide right now (" + err.message + "). Please try again.";
      showView("error");
    }
  }

  // ---------------- Stakes screen rendering ----------------

  function renderStakes(guide) {
    const fallbackBanner = document.getElementById("fallback-banner");
    if (guide.isFallback) {
      document.getElementById("fallback-note-text").textContent =
        " " + guide.fallbackNote;
      fallbackBanner.hidden = false;
    } else {
      fallbackBanner.hidden = true;
    }

    const tierBadge = document.getElementById("stakes-tier-badge");
    tierBadge.textContent = guide.stakesTier === "higher" ? "Higher stakes" : "Standard stakes";
    tierBadge.className =
      "stakes-tier-badge mono " + (guide.stakesTier === "higher" ? "tier-higher" : "tier-standard");

    document.getElementById("stakes-heading").textContent = guide.stakesHeading;
    document.getElementById("stakes-explanation").textContent = guide.stakesExplanation;

    // Quiet note, not a callout: citation folded into the same small
    // italic sentence rather than shown as its own badge, so it reads
    // at the same visual weight as the closing disclaimer.
    if (guide.article22Caveat) {
      document.getElementById("caveat-text").textContent =
        `${guide.article22Caveat.text} (${guide.article22Caveat.citation})`;
    }

    const risksList = document.getElementById("sector-risks");
    risksList.innerHTML = "";
    (guide.sectorRisks || []).forEach((risk) => {
      const li = document.createElement("li");
      li.textContent = risk;
      risksList.appendChild(li);
    });
  }

  // ---------------- Guide screen rendering ----------------

  function renderGuide(guide) {
    const interventionsList = document.getElementById("interventions-list");
    interventionsList.innerHTML = "";
    (guide.interventions || []).forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "intervention-card";
      const isNonNegotiable = item.flagLabel === "non-negotiable";
      li.innerHTML = `
        <div class="intervention-head">
          <h3 class="intervention-title"><span class="intervention-number">${String(
            index + 1
          ).padStart(2, "0")}</span>${escapeHtml(item.title)}</h3>
          <div class="badge-row">
            <span class="badge badge-flag ${isNonNegotiable ? "" : "flag-worthdoing"}">${escapeHtml(
              item.flagLabel
            )}</span>
            <span class="badge badge-citation">${escapeHtml(item.citation)}</span>
          </div>
        </div>
        <p class="intervention-body">${escapeHtml(item.body)}</p>
        <p class="intervention-practice"><strong>Suggested practice:</strong> ${escapeHtml(
          item.suggestedPractice
        )}</p>
      `;
      interventionsList.appendChild(li);
    });

    document.getElementById("customer-notice-text").textContent = guide.customerNotice;
    document.getElementById("disclaimer-text").textContent = guide.disclaimer;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------------- Download ----------------

  function guideToPlainText(guide) {
    const lines = [];
    lines.push("SIXPOINT GOVERNANCE GUIDE");
    lines.push(`Sector: ${guide.sector}`);
    lines.push(`Stakes: ${guide.stakesTier === "higher" ? "Higher stakes" : "Standard stakes"}`);
    if (guide.isFallback) {
      lines.push("");
      lines.push(`Note: ${guide.fallbackNote}`);
    }
    lines.push("");
    lines.push(guide.stakesHeading);
    lines.push(guide.stakesExplanation);
    lines.push("");
    lines.push("RISKS TO WATCH FOR");
    (guide.sectorRisks || []).forEach((r) => lines.push(`- ${r}`));
    if (guide.article22Caveat) {
      lines.push("");
      lines.push(`${guide.article22Caveat.text} (${guide.article22Caveat.citation})`);
    }
    lines.push("");
    lines.push("SIX GOVERNANCE INTERVENTIONS");
    (guide.interventions || []).forEach((item, i) => {
      lines.push("");
      lines.push(`${i + 1}. ${item.title} [${item.flagLabel}] (${item.citation})`);
      lines.push(item.body);
      lines.push(`Suggested practice: ${item.suggestedPractice}`);
    });
    lines.push("");
    lines.push("TELL YOUR CUSTOMERS");
    lines.push(guide.customerNotice);
    lines.push("");
    lines.push(guide.disclaimer);
    return lines.join("\n");
  }

  function downloadGuide() {
    if (!state.guide) return;
    const text = guideToPlainText(state.guide);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sixpoint-guide-${state.sectorId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------- Wire up ----------------

  function resetPickerSelection() {
    state.sectorId = null;
    document.querySelectorAll(".sector-card").forEach((el) => {
      el.classList.remove("selected");
      el.setAttribute("aria-pressed", "false");
    });
    updateGenerateButton();
  }

  document.getElementById("start-btn").addEventListener("click", () => {
    showView("picker");
  });

  document.getElementById("back-to-landing").addEventListener("click", () => {
    showView("landing");
  });

  document.getElementById("generate-btn").addEventListener("click", generateGuide);

  document.getElementById("retry-btn").addEventListener("click", generateGuide);

  document.getElementById("see-guide-btn").addEventListener("click", () => {
    showView("guide");
  });

  document.getElementById("back-to-picker").addEventListener("click", () => {
    showView("picker");
  });

  document.getElementById("back-to-stakes").addEventListener("click", () => {
    showView("stakes");
  });

  document.getElementById("download-btn").addEventListener("click", downloadGuide);

  document.getElementById("restart-btn").addEventListener("click", () => {
    state.guide = null;
    resetPickerSelection();
    showView("landing");
  });

  renderSectorGrid();
})();
