const express = require("express");
const prisma = require("../../../lib/prisma");
const { authenticate, requireWorkspace } = require("../../../middleware/auth");
const { AppError } = require("../../../middleware/error");
const { sendOnboardingComplete } = require("../../../services/lifecycle.service");

const router = express.Router();

const VALID_STAGES = [3, 4, 5, 6, 7, 8, 9, 10];

// GET /onboarding — return current onboarding state
router.get("/", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const onboarding = req.workspace.settings?.onboarding || { stage: 3, complete: false, data: {} };
    res.json({ success: true, data: onboarding });
  } catch (err) { next(err); }
});

// POST /onboarding/stage/:n — save stage data and advance
router.post("/stage/:n", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const stage = parseInt(req.params.n);
    if (!VALID_STAGES.includes(stage)) throw new AppError("Invalid stage", 400, "VALIDATION_ERROR");

    const workspaceId = req.workspace.id;
    const current = req.workspace.settings?.onboarding || { stage: 3, complete: false, data: {} };

    // Don't allow skipping stages
    if (stage > current.stage) throw new AppError(`Must complete stage ${current.stage} first`, 400, "STAGE_ORDER");

    const nextStage = stage + 1;
    const complete  = stage === 10;

    const updated = {
      ...current,
      stage:    complete ? 10 : nextStage,
      complete,
      data:     { ...current.data, [`stage${stage}`]: req.body },
    };

    const settings = { ...(req.workspace.settings || {}), onboarding: updated };

    // Stage 8 — Capital Allocation. This is the step where a workspace's
    // trading portfolio actually comes into existence: nothing else in the
    // app ever creates one (verified - there is no other prisma.portfolio.create
    // call anywhere), so without this, deposit-watching and trading stay
    // permanently unreachable for a workspace no matter how far onboarding
    // otherwise progresses, since both require a portfolio to attach to.
    if (stage === 8 && req.body.stopLossPct) {
      const riskFields = {
        stopLossPct:             req.body.stopLossPct             ?? undefined,
        maxDrawdownPct:          req.body.maxDrawdownPct          ?? undefined,
        maxPositionPct:          req.body.maxPositionPct          ?? undefined,
        signalStrengthThreshold: req.body.signalStrengthThreshold ?? undefined,
      };

      let portfolio = await prisma.portfolio.findFirst({ where: { workspaceId }, include: { riskConfig: true } });

      if (!portfolio) {
        portfolio = await prisma.portfolio.create({
          data: {
            workspaceId,
            name: "Main Portfolio",
            riskConfig: { create: riskFields },
            snapshots:  { create: { nav: 0, cash: 0, invested: 0, unrealizedPnl: 0, realizedPnl: 0 } },
          },
        });
      } else if (portfolio.riskConfig?.id) {
        await prisma.riskConfig.update({ where: { id: portfolio.riskConfig.id }, data: riskFields });
      } else {
        await prisma.riskConfig.create({ data: { portfolioId: portfolio.id, ...riskFields } });
      }

      // Attach the portfolio to whichever strategy is actually live, so it
      // can receive signals at all. This was a real, hard gap: nothing
      // anywhere ever created this link automatically - a portfolio could
      // exist, wallets could be linked, real deposits could land, and
      // trading would still never happen, silently, because
      // evaluateSignal() only ever looks at portfolios with an explicit
      // PortfolioSignalConfig row. Idempotent (upsert) and self-healing -
      // runs on every stage-8 submission, not just first-time creation, so
      // a portfolio from before this fix existed gets attached too the
      // next time its owner touches this step.
      const liveConfig = await prisma.signalConfig.findFirst({
        where: { status: "FROZEN", strategy: { name: "OrderFlowMomentum" } },
      });
      if (liveConfig) {
        await prisma.portfolioSignalConfig.upsert({
          where: { portfolioId_signalConfigId: { portfolioId: portfolio.id, signalConfigId: liveConfig.id } },
          create: { portfolioId: portfolio.id, signalConfigId: liveConfig.id, active: true },
          update: { active: true, disabledAt: null },
        });
      }
    }

    // Stage 10 — final legal agreement (e-signature). Record a durable,
    // independent audit trail: typed name, agreement version, IP, timestamp.
    // This is the record that matters if the in-app settings blob is ever
    // edited/reset — the audit log is the actual evidence of consent.
    if (stage === 10) {
      if (!req.body.typedFullName || !req.body.agreed) {
        throw new AppError("Signature and agreement confirmation required", 400, "VALIDATION_ERROR");
      }
      await prisma.auditEvent.create({
        data: {
          workspaceId,
          actorId:     req.user.id,
          entityType:  "Workspace",
          entityId:    workspaceId,
          action:      "E_SIGNATURE",
          beforeState: { complete: false },
          afterState:  {
            typedFullName: req.body.typedFullName,
            agreementVersion: req.body.agreementVersion || "v1",
            agreedAt: new Date().toISOString(),
          },
          ipAddress:   req.ip,
        },
      });
      // Bridges onboarding -> KYC, the next real step - a real user's
      // whole path is decision-gated behind KYC approval from here (wallet
      // connect, deposits), so this is the single most important "here's
      // what to do next" moment to get right.
      sendOnboardingComplete(req.user.id, workspaceId).catch(() => {});
    }

    await prisma.workspace.update({ where: { id: workspaceId }, data: { settings } });

    res.json({ success: true, data: { stage: nextStage, complete } });
  } catch (err) { next(err); }
});

// POST /onboarding/reset — dev only
router.post("/reset", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") throw new AppError("Not allowed", 403, "FORBIDDEN");
    const settings = { ...(req.workspace.settings || {}), onboarding: { stage: 3, complete: false, data: {} } };
    await prisma.workspace.update({ where: { id: req.workspace.id }, data: { settings } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
