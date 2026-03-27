const express = require('express');
const formidable = require('express-formidable');
const fs = require('fs');
const { authRefreshMiddleware } = require('../services/aps.js');
const comfy = require('../services/comfy.js');

let router = express.Router();

router.get('/api/comfy/workflows', function (req, res) {
    res.json(comfy.getAvailableWorkflows());
});

router.post('/api/comfy/upload', authRefreshMiddleware, formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    try {
        const file = req.files['image-file'];
        if (!file) {
            res.status(400).json({ error: 'Missing image-file field' });
            return;
        }
        const buffer = await fs.promises.readFile(file.path);
        console.log(`[comfy/upload] Uploading "${file.name}" (${buffer.length} bytes) to Comfy Cloud`);
        const result = await comfy.uploadImage(buffer, file.name);
        console.log(`[comfy/upload] Result:`, JSON.stringify(result));
        res.json(result);
    } catch (err) {
        next(err);
    }
});

router.post('/api/comfy/run', authRefreshMiddleware, express.json(), async function (req, res, next) {
    try {
        const { workflow, positivePrompt, negativePrompt, screenshotFilename, depthFilename } = req.body;
        if (!workflow || !positivePrompt || !screenshotFilename) {
            res.status(400).json({ error: 'Missing required fields: workflow, positivePrompt, screenshotFilename' });
            return;
        }
        console.log(`[comfy/run] workflow=${workflow}, screenshot=${screenshotFilename}, depth=${depthFilename}`);
        const promptId = await comfy.runWorkflow(workflow, positivePrompt, negativePrompt, screenshotFilename, depthFilename);
        console.log(`[comfy/run] Submitted, promptId=${promptId}`);
        res.json({ status: 'ok', promptId });
    } catch (err) {
        next(err);
    }
});

router.get('/api/comfy/status/:promptId', authRefreshMiddleware, async function (req, res, next) {
    try {
        const result = await comfy.getJobStatus(req.params.promptId);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

router.get('/api/comfy/output', authRefreshMiddleware, async function (req, res, next) {
    try {
        const { filename, subfolder, type } = req.query;
        if (!filename) {
            res.status(400).json({ error: 'Missing filename parameter' });
            return;
        }
        const buffer = await comfy.downloadOutput(filename, subfolder, type);
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
