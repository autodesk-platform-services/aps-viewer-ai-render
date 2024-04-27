const express = require('express');
const { runWorkflow, getWorkflowRunStatus, authRefreshMiddleware } = require('../services/aps.js');
const { COMFY_WORKFLOW_ID } = require('../config.js');

let router = express.Router();

router.post('/api/workflows', authRefreshMiddleware, async function (req, res, next) {
  try {
    let workflowResponse = await runWorkflow(COMFY_WORKFLOW_ID, req.query.pos_prompt, req.query.neg_prompt, req.query.image_signed_url);
    res.json({ status: 'ok', id: workflowResponse.id });
  } catch (err) {
    next(err);
  }
});

router.get('/api/workflows', authRefreshMiddleware, async function (req, res, next) {
  try {
    let runStatus = await getWorkflowRunStatus(COMFY_WORKFLOW_ID, req.query.run_id);
    res.json({ status: 'ok', run: runStatus });
  } catch (err) {
    next(err);
  }
});


module.exports = router;