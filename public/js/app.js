/**
 * app.js
 * ------------------------------------------------------------------
 * Small hand-written state machine, no framework: the spec calls for
 * a static frontend, and this app has seven states (landing, picker,
 * loading, stakes, assessment, guide, error) with no shared client-side
 * state beyond "which sector did the user pick", their assessment
 * answers, and the guide content assembled across the two API calls,
 * so a framework would add build tooling for very little benefit here.
 * ------------------------------------------------------------------
 */

(function () {
  "use strict";

  const state = {
    sectorId: null,
    guide: null,
    answers: {},
  };

  // Which action to re-run when the user hits "Try again" on the error
  // screen: whichever of the two API calls (stage 1 or stage 2) most
  // recently failed, so a retry resumes from where it broke rather than
  // always restarting the whole flow from the sector picker.
  let retryAction = generateGuide;

  const views = {
    landing: document.getElementById("view-landing"),
    picker: document.getElementById("view-picker"),
    loading: document.getElementById("view-loading"),
    error: document.getElementById("view-error"),
    stakes: document.getElementById("view-stakes"),
    assessment: document.getElementById("view-assessment"),
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
      // Selecting a sector goes straight to the stakes page: there is no
      // separate "generate" step to click through first.
      btn.addEventListener("click", () => {
        state.sectorId = sector.id;
        grid.querySelectorAll(".sector-card").forEach((c) => {
          c.classList.remove("selected");
          c.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
        generateGuide();
      });
      grid.appendChild(btn);
    });
  }

  // ---------------- Generation (stage 1: stakes content) ----------------

  async function generateGuide() {
    retryAction = generateGuide;
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
      state.answers = {};
      renderStakes(guide);
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

  // ---------------- Assessment (required, ten fixed questions) ----------------

  function renderAssessmentQuestions(questions) {
    const list = document.getElementById("assessment-list");
    list.innerHTML = "";
    (questions || []).forEach((q, index) => {
      const li = document.createElement("li");
      li.className = "assessment-item";
      li.innerHTML = `
        <p class="assessment-question"><span class="intervention-number">${String(
          index + 1
        ).padStart(2, "0")}</span>${escapeHtml(q.text)}</p>
        <div class="assessment-answers" role="group" aria-label="Answer to question ${index + 1}">
          <button type="button" class="answer-btn" data-question-id="${q.id}" data-answer="yes" aria-pressed="false">Yes</button>
          <button type="button" class="answer-btn" data-question-id="${q.id}" data-answer="no" aria-pressed="false">No</button>
        </div>
      `;
      list.appendChild(li);

      // Restore a previous answer if the user has come back to this
      // screen (for example via "Back" from the guide screen), so
      // re-answering everything from scratch is never required.
      if (typeof state.answers[q.id] === "boolean") {
        const answeredYes = state.answers[q.id];
        li.querySelectorAll(".answer-btn").forEach((btn) => {
          const isMatch = (btn.dataset.answer === "yes") === answeredYes;
          btn.classList.toggle("selected", isMatch);
          btn.setAttribute("aria-pressed", isMatch ? "true" : "false");
        });
      }
    });

    list.querySelectorAll(".answer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const questionId = btn.dataset.questionId;
        state.answers[questionId] = btn.dataset.answer === "yes";
        list
          .querySelectorAll(`.answer-btn[data-question-id="${questionId}"]`)
          .forEach((b) => {
            b.classList.toggle("selected", b === btn);
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
        updateSeeResultsButton(questions.length);
      });
    });

    updateSeeResultsButton(questions.length);
  }

  function updateSeeResultsButton(totalQuestions) {
    const answered = Object.keys(state.answers).length;
    document.getElementById("see-results-btn").disabled = answered < totalQuestions;
  }

  // ---------------- Scoring (stage 2: Met/Not Met per intervention) ----------------

  async function submitAssessment() {
    retryAction = submitAssessment;
    showView("loading");
    try {
      const res = await fetch("/api/score-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: state.sectorId, answers: state.answers }),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const scored = await res.json();
      state.guide.interventions = scored.interventions;
      state.guide.customerNotice = scored.customerNotice;
      state.guide.disclaimer = scored.disclaimer;
      renderGuide(state.guide);
      showView("guide");
    } catch (err) {
      document.getElementById("error-message").textContent =
        "We couldn't score your assessment right now (" + err.message + "). Please try again.";
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

    // stakesHeadline is fixed, code-assembled content (sector name,
    // stakes level, and a one-line reason, e.g. "HEALTHCARE SECTOR -
    // HIGH STAKE. You handle sensitive data."), never generated by the
    // model: see buildStakesHeadline() in data/reference.js.
    document.getElementById("stakes-headline").textContent = guide.stakesHeadline;
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
      const isMet = item.status === "met";
      li.innerHTML = `
        <div class="intervention-head">
          <h3 class="intervention-title"><span class="intervention-number">${String(
            index + 1
          ).padStart(2, "0")}</span>${escapeHtml(item.title)}</h3>
          <div class="badge-row">
            <span class="badge badge-status ${isMet ? "status-met" : "status-not-met"}">${
              isMet ? "Met" : "Not met"
            }</span>
            <span class="badge badge-flag ${isNonNegotiable ? "" : "flag-worthdoing"}">${escapeHtml(
              item.flagLabel
            )}</span>
            <span class="badge badge-citation">${escapeHtml(item.citation)}</span>
          </div>
        </div>
        <p class="intervention-body">${escapeHtml(item.body)}</p>
        ${(item.recommendations || [])
          .map((line) => `<p class="intervention-practice">${escapeHtml(line)}</p>`)
          .join("")}
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
    lines.push(`Stakes: ${guide.stakesTier === "higher" ? "High stakes" : "Standard stakes"}`);
    if (guide.isFallback) {
      lines.push("");
      lines.push(`Note: ${guide.fallbackNote}`);
    }
    lines.push("");
    lines.push(guide.stakesHeadline);
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
      const isMet = item.status === "met";
      lines.push("");
      lines.push(
        `${i + 1}. ${item.title} [${isMet ? "Met" : "Not met"}] [${item.flagLabel}] (${item.citation})`
      );
      lines.push(item.body);
      (item.recommendations || []).forEach((line) => lines.push(line));
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
  }

  document.getElementById("start-btn").addEventListener("click", () => {
    showView("picker");
  });

  document.getElementById("back-to-landing").addEventListener("click", () => {
    showView("landing");
  });

  document.getElementById("retry-btn").addEventListener("click", () => retryAction());

  document.getElementById("see-guide-btn").addEventListener("click", () => {
    renderAssessmentQuestions((state.guide && state.guide.assessmentQuestions) || []);
    showView("assessment");
  });

  document.getElementById("back-to-picker").addEventListener("click", () => {
    showView("picker");
  });

  document.getElementById("back-to-stakes").addEventListener("click", () => {
    showView("stakes");
  });

  document.getElementById("see-results-btn").addEventListener("click", submitAssessment);

  document.getElementById("back-to-assessment").addEventListener("click", () => {
    renderAssessmentQuestions((state.guide && state.guide.assessmentQuestions) || []);
    showView("assessment");
  });

  document.getElementById("download-btn").addEventListener("click", downloadGuide);

  document.getElementById("restart-btn").addEventListener("click", () => {
    state.guide = null;
    state.answers = {};
    resetPickerSelection();
    showView("landing");
  });

  renderSectorGrid();
})();
