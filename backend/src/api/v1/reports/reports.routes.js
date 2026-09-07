const express = require("express");
const { authenticate } = require("../../../middleware/auth");
const { assertPortfolioAccess } = require("../../../middleware/ownership");
const { AppError } = require("../../../middleware/error");
const { generateReport } = require("../../../services/reporting.service");
const prisma = require("../../../lib/prisma");

const router = express.Router();

// GET /reports/:portfolioId — generate report on demand
router.get("/:portfolioId", authenticate, async (req, res, next) => {
  try {
    const { period = "monthly" } = req.query;
    const valid = ["daily", "weekly", "monthly", "all"];
    if (!valid.includes(period)) throw new AppError("Invalid period", 400, "BAD_REQUEST");

    // Verifies the portfolio exists (404, not a 500 from generateReport) AND
    // that the caller is an active member of the portfolio's OWN workspace
    // with view_all — not a client-supplied x-workspace-id.
    await assertPortfolioAccess(req.params.portfolioId, req.user.id, { permission: "view_all" });

    const report = await generateReport(req.params.portfolioId, period);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// GET /reports/:portfolioId/summary — lightweight summary for dashboard
router.get("/:portfolioId/summary", authenticate, async (req, res, next) => {
  try {
    await assertPortfolioAccess(req.params.portfolioId, req.user.id, { permission: "view_all" });
    const report = await generateReport(req.params.portfolioId, "monthly");
    res.json({
      success: true,
      data: {
        summary:  report.summary,
        nav:      report.nav,
        period:   report.period,
        from:     report.from,
        to:       report.to,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
