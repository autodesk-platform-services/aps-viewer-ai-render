const express = require('express');
const { runWorkflow, getWorkflowRunStatus, authRefreshMiddleware } = require('../services/aps.js');

let router = express.Router();

router.post('/api/workflows', authRefreshMiddleware, async function (req, res, next) {
  try {
    let workflowResponse = await runWorkflow("cs59kno7qoFMOarLGkPoM", req.query.pos_prompt, req.query.neg_prompt);
    res.json({ status: 'ok', id: workflowResponse.id });
  } catch (err) {
    next(err);
  }
});

router.get('/api/workflows', authRefreshMiddleware, async function (req, res, next) {
  try {
    let runStatus = await getWorkflowRunStatus("cs59kno7qoFMOarLGkPoM", req.query.run_id);
    res.json({ status: 'ok', run: runStatus });
  } catch (err) {
    next(err);
  }
});


module.exports = router;