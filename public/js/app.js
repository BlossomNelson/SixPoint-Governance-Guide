/**
 * app.js
 * ------------------------------------------------------------------
 * Small hand-written state machine, no framework: the spec calls for
 * a static frontend, and this app has seven states (landing, picker,
 * loading, stakes, assessment, guide, error) with no shared client-side
 * state beyond "which sector did the user pick", their assessment
 * answers, and the report content assembled across the two API calls,
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
        <p class="assessment-question"><span class="item-number">${String(
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

  // ---------------- Scoring (stage 2: flat, per-question recommendations) ----------------

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
      state.guide.recommendations = scored.recommendations;
      state.guide.allMet = scored.allMet;
      state.guide.allMetMessage = scored.allMetMessage;
      state.guide.customerNotice = scored.customerNotice;
      state.guide.disclaimer = scored.disclaimer;
      renderRecommendations(state.guide);
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

  // ---------------- Report rendering ----------------

  // Flat list, one card per question the SME answered "no" to, nothing
  // for questions answered "yes", no grouping above the individual
  // question. If every question was "yes", recommendations is empty and
  // a single fixed confirmation message renders instead.
  function renderRecommendations(guide) {
    const list = document.getElementById("recommendations-list");
    list.innerHTML = "";

    if (guide.allMet) {
      const p = document.createElement("p");
      p.className = "all-met-message";
      p.textContent = guide.allMetMessage;
      list.appendChild(p);
    } else {
      (guide.recommendations || []).forEach((item) => {
        const card = document.createElement("div");
        card.className = "recommendation-card";
        card.innerHTML = `
          <p class="recommendation-question">${escapeHtml(item.question)}</p>
          <p class="recommendation-text">${escapeHtml(item.text)}</p>
          <span class="badge badge-citation">${escapeHtml(item.citation)}</span>
        `;
        list.appendChild(card);
      });
    }

    document.getElementById("customer-notice-text").textContent = guide.customerNotice;
    document.getElementById("disclaimer-text").textContent = guide.disclaimer;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------------- Download (PDF) ----------------

  // Approximates the on-screen design system within what jsPDF's core
  // fonts support: "times" stands in for the serif (Fraunces) used on
  // headings, "helvetica" for the body font (Inter), "courier" for the
  // monospaced citation labels (IBM Plex Mono), and the same ink/soft-ink/
  // accent/border colours as styles.css. No custom font embedding: this
  // is a client-side, CDN-loaded library with no build step, and the
  // core fonts are what it can render without one.
  const PDF_COLORS = {
    ink: [23, 20, 15],
    inkSoft: [74, 70, 63],
    accent: [232, 71, 31],
    border: [221, 217, 209],
  };

  function formatReportDate(date) {
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function buildReportPdf(guide) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    function ensureSpace(height) {
      if (y + height > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    }

    function addText(text, opts) {
      opts = opts || {};
      const font = opts.font || "helvetica";
      const style = opts.style || "normal";
      const size = opts.size || 10.5;
      const color = opts.color || PDF_COLORS.ink;
      const lineHeight = opts.lineHeight || size * 1.4;
      const width = opts.width || contentWidth;

      doc.setFont(font, style);
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.splitTextToSize(text, width).forEach((line) => {
        ensureSpace(lineHeight);
        doc.text(line, margin, y);
        y += lineHeight;
      });
    }

    function addDivider() {
      ensureSpace(14);
      doc.setDrawColor(PDF_COLORS.border[0], PDF_COLORS.border[1], PDF_COLORS.border[2]);
      doc.setLineWidth(0.75);
      doc.line(margin, y, margin + contentWidth, y);
      y += 14;
    }

    // Title
    addText("SixPoint, Know Where Your CRM's AI Stands", {
      font: "times",
      style: "bold",
      size: 19,
      lineHeight: 23,
    });
    y += 8;

    // Sector, stakes level, generation date
    const stakesLabel = guide.stakesTier === "higher" ? "High stakes" : "Standard stakes";
    addText(`Sector: ${guide.sector}`, { color: PDF_COLORS.inkSoft });
    addText(`Stakes level: ${stakesLabel}`, { color: PDF_COLORS.inkSoft });
    addText(`Generated on ${formatReportDate(new Date())}`, { color: PDF_COLORS.inkSoft });
    if (guide.isFallback) {
      y += 4;
      addText(`Note: ${guide.fallbackNote}`, {
        style: "italic",
        size: 9,
        color: PDF_COLORS.inkSoft,
      });
    }
    y += 6;
    addDivider();

    // Stakes summary
    addText(guide.stakesHeadline, { font: "times", style: "bold", size: 13, lineHeight: 17 });
    y += 4;
    addText(guide.stakesExplanation, { color: PDF_COLORS.inkSoft });
    y += 6;

    if (guide.sectorRisks && guide.sectorRisks.length) {
      addText("Risks worth watching for", { style: "bold", size: 11 });
      y += 2;
      guide.sectorRisks.forEach((risk) => {
        addText(`•  ${risk}`, { size: 10, color: PDF_COLORS.inkSoft });
      });
      y += 4;
    }

    if (guide.article22Caveat) {
      addText(`${guide.article22Caveat.text} (${guide.article22Caveat.citation})`, {
        style: "italic",
        size: 9,
        color: PDF_COLORS.inkSoft,
      });
    }
    y += 8;
    addDivider();

    // Recommendations, clearly separated per item rather than run together
    addText("Recommendations based on your answers", {
      font: "times",
      style: "bold",
      size: 15,
      lineHeight: 19,
    });
    y += 8;

    if (guide.allMet) {
      addText(guide.allMetMessage, { style: "bold", size: 11 });
      y += 10;
    } else {
      const items = guide.recommendations || [];
      items.forEach((item, index) => {
        ensureSpace(60);
        addText(item.question, {
          font: "times",
          style: "italic",
          size: 9.5,
          lineHeight: 12,
          color: PDF_COLORS.inkSoft,
        });
        y += 2;
        addText(item.text, { size: 10.5, lineHeight: 14 });
        y += 3;
        addText(item.citation.toUpperCase(), {
          font: "courier",
          style: "bold",
          size: 8.5,
          color: PDF_COLORS.accent,
        });
        y += 8;
        if (index < items.length - 1) {
          addDivider();
        }
      });
    }
    y += 4;
    addDivider();

    // Tell your customers
    addText("Tell your customers", { font: "times", style: "bold", size: 12 });
    y += 3;
    addText(guide.customerNotice, { size: 10, color: PDF_COLORS.inkSoft });
    y += 10;
    addDivider();

    // Disclaimer, smaller text at the bottom
    addText(guide.disclaimer, { style: "italic", size: 8, lineHeight: 11, color: PDF_COLORS.inkSoft });

    return doc;
  }

  function downloadGuide() {
    if (!state.guide) return;
    const doc = buildReportPdf(state.guide);
    doc.save(`sixpoint-report-${state.sectorId}.pdf`);
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
