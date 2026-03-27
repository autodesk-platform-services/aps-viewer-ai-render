const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const WebSocket = require('ws');
const { COMFY_CLOUD_API_KEY } = require('../config.js');

const BASE_URL = 'https://cloud.comfy.org';
const WORKFLOWS_DIR = path.join(__dirname, '..', 'workflows');

const WORKFLOW_MAP = {
    'qwen': {
        file: 'Autodesk Viewer qwen depth controlnet.json',
        label: 'Qwen Depth ControlNet',
        needsDepth: true,
        screenshotNode: '71',
        depthNode: '108',
        positivePromptNode: '6',
        positivePromptField: 'text',
        negativePromptNode: '7',
        negativePromptField: 'text',
        seedNode: '3',
        seedField: 'seed'
    },
    'flux': {
        file: 'Autodesk Viewer flux depth controlnet.json',
        label: 'Flux Depth ControlNet',
        needsDepth: true,
        screenshotNode: '17',
        depthNode: '107',
        positivePromptNode: '23',
        positivePromptField: 'text',
        negativePromptNode: '7',
        negativePromptField: 'text',
        seedNode: '3',
        seedField: 'seed'
    }
};

// In-memory store for tracking job outputs via WebSocket
const jobResults = new Map();

const service = module.exports = {};

function getHeaders() {
    return {
        'X-API-Key': COMFY_CLOUD_API_KEY,
        'Content-Type': 'application/json'
    };
}

service.getAvailableWorkflows = () => {
    return Object.entries(WORKFLOW_MAP).map(([id, config]) => ({
        id,
        label: config.label,
        needsDepth: config.needsDepth
    }));
};

service.uploadImage = async (buffer, filename) => {
    const form = new FormData();
    form.append('image', buffer, { filename, contentType: 'image/png' });
    form.append('type', 'input');
    form.append('overwrite', 'true');

    const resp = await fetch(`${BASE_URL}/api/upload/image`, {
        method: 'POST',
        headers: { 'X-API-Key': COMFY_CLOUD_API_KEY },
        body: form
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Upload failed (${resp.status}): ${text}`);
    }
    return resp.json();
};

service.runWorkflow = async (workflowKey, positivePrompt, negativePrompt, screenshotFilename, depthFilename) => {
    const config = WORKFLOW_MAP[workflowKey];
    if (!config) throw new Error(`Unknown workflow: ${workflowKey}`);

    const workflowPath = path.join(WORKFLOWS_DIR, config.file);
    const workflow = JSON.parse(await fs.promises.readFile(workflowPath, 'utf-8'));

    workflow[config.screenshotNode].inputs.image = screenshotFilename;

    if (config.needsDepth && config.depthNode && depthFilename) {
        workflow[config.depthNode].inputs.image = depthFilename;
    }

    workflow[config.positivePromptNode].inputs[config.positivePromptField] = positivePrompt;

    if (config.negativePromptNode && negativePrompt) {
        workflow[config.negativePromptNode].inputs[config.negativePromptField] = negativePrompt;
    }

    workflow[config.seedNode].inputs[config.seedField] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

    const resp = await fetch(`${BASE_URL}/api/prompt`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ prompt: workflow })
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Submit failed (${resp.status}): ${text}`);
    }
    const result = await resp.json();
    if (result.error) throw new Error(`Workflow error: ${result.error}`);

    const promptId = result.prompt_id;
    trackJobOutputs(promptId);
    return promptId;
};

function trackJobOutputs(promptId) {
    jobResults.set(promptId, { outputs: {}, status: 'pending' });

    const clientId = crypto.randomUUID();
    const wsUrl = `wss://cloud.comfy.org/ws?clientId=${clientId}&token=${COMFY_CLOUD_API_KEY}`;
    console.log(`[ws] Connecting WebSocket for job ${promptId}...`);

    try {
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log(`[ws] WebSocket connected for job ${promptId}`);
        });

        const timeout = setTimeout(() => {
            console.warn(`[ws] WebSocket timed out for job ${promptId}`);
            ws.close();
            const job = jobResults.get(promptId);
            if (job && job.status !== 'completed' && job.status !== 'failed') {
                job.status = 'failed';
                job.error = 'WebSocket tracking timed out';
            }
        }, 10 * 60 * 1000);

        ws.on('message', (data) => {
            try {
                if (Buffer.isBuffer(data) && data.length > 0) {
                    const typeCode = data.readUInt32BE(0);
                    if (typeCode === 1 || typeCode === 4) return;
                }

                const msg = JSON.parse(data.toString());
                const msgData = msg.data || {};
                console.log(`[ws] Message type="${msg.type}" prompt_id="${msgData.prompt_id}" node="${msgData.node || ''}"`)

                if (msgData.prompt_id !== promptId) return;

                const job = jobResults.get(promptId);
                if (!job) return;

                if (msg.type === 'executing') {
                    job.status = 'in_progress';
                }
                if (msg.type === 'executed' && msgData.output) {
                    console.log(`[ws] Node ${msgData.node} output:`, JSON.stringify(msgData.output));
                    job.outputs[msgData.node] = msgData.output;
                }
                if (msg.type === 'execution_success') {
                    console.log(`[ws] Job ${promptId} completed. Outputs collected: ${Object.keys(job.outputs).length} nodes`);
                    job.status = 'completed';
                    clearTimeout(timeout);
                    ws.close();
                }
                if (msg.type === 'execution_error') {
                    console.error(`[ws] Job ${promptId} failed:`, msgData.exception_message);
                    job.status = 'failed';
                    job.error = msgData.exception_message || 'Unknown error';
                    clearTimeout(timeout);
                    ws.close();
                }
            } catch (_) {
            }
        });

        ws.on('error', (err) => {
            console.error(`[ws] WebSocket error for job ${promptId}:`, err.message);
            clearTimeout(timeout);
        });

        ws.on('close', (code, reason) => {
            console.log(`[ws] WebSocket closed for job ${promptId} (code=${code})`);
            clearTimeout(timeout);
            setTimeout(() => jobResults.delete(promptId), 30 * 60 * 1000);
        });
    } catch (err) {
        console.error(`[ws] Failed to open WebSocket for job ${promptId}:`, err.message);
    }
}

async function fetchHistoryOutputs(promptId) {
    try {
        const url = `${BASE_URL}/api/history/${encodeURIComponent(promptId)}`;
        console.log(`[history] Fetching outputs from ${url}`);
        const resp = await fetch(url, {
            headers: { 'X-API-Key': COMFY_CLOUD_API_KEY }
        });
        if (!resp.ok) {
            console.warn(`[history] API returned ${resp.status}: ${await resp.text()}`);
            return {};
        }
        const history = await resp.json();
        console.log(`[history] Response keys:`, Object.keys(history));
        const entry = history[promptId];
        if (entry && entry.outputs) {
            console.log(`[history] Found outputs with ${Object.keys(entry.outputs).length} nodes`);
            return entry.outputs;
        }
        console.warn(`[history] No outputs found in history entry. Entry keys:`, entry ? Object.keys(entry) : 'null');
        return {};
    } catch (err) {
        console.warn(`[history] Fetch failed for job ${promptId}:`, err.message);
        return {};
    }
}

service.getJobStatus = async (promptId) => {
    const localJob = jobResults.get(promptId);
    console.log(`[status] Checking job ${promptId} — local status="${localJob ? localJob.status : 'none'}", local outputs=${localJob ? Object.keys(localJob.outputs).length : 0} nodes`);

    try {
        const resp = await fetch(`${BASE_URL}/api/job/${encodeURIComponent(promptId)}/status`, {
            headers: getHeaders()
        });
        if (!resp.ok) {
            const errText = await resp.text();
            console.warn(`[status] API returned ${resp.status}: ${errText}`);
            return {
                status: localJob ? localJob.status : 'pending',
                outputs: localJob ? localJob.outputs : {},
                error: (localJob && localJob.error) ? localJob.error : undefined
            };
        }
        const apiStatus = await resp.json();
        const normalizedStatus = apiStatus.status === 'success' ? 'completed' : apiStatus.status;
        console.log(`[status] API status="${apiStatus.status}" (normalized="${normalizedStatus}") for job ${promptId}`);

        let outputs = localJob ? localJob.outputs : {};
        if (normalizedStatus === 'completed' && Object.keys(outputs).length === 0) {
            console.log(`[status] No WebSocket outputs for ${promptId}, fetching from history...`);
            outputs = await fetchHistoryOutputs(promptId);
            console.log(`[status] History returned ${Object.keys(outputs).length} node outputs`);
        }

        const result = {
            status: normalizedStatus,
            outputs,
            error: (localJob && localJob.error) ? localJob.error : undefined
        };
        console.log(`[status] Returning: status="${result.status}", outputs=${Object.keys(result.outputs).length} nodes`);
        return result;
    } catch (err) {
        console.warn(`[status] Check error for job ${promptId}:`, err.message);
        return {
            status: localJob ? localJob.status : 'pending',
            outputs: localJob ? localJob.outputs : {},
            error: (localJob && localJob.error) ? localJob.error : undefined
        };
    }
};

service.downloadOutput = async (filename, subfolder, type) => {
    const params = new URLSearchParams({
        filename: filename || '',
        subfolder: subfolder || '',
        type: type || 'output'
    });

    const resp = await fetch(`${BASE_URL}/api/view?${params}`, {
        headers: { 'X-API-Key': COMFY_CLOUD_API_KEY },
        redirect: 'manual'
    });

    if (resp.status === 302) {
        const signedUrl = resp.headers.get('location');
        const fileResp = await fetch(signedUrl);
        if (!fileResp.ok) throw new Error(`Download failed: ${fileResp.status}`);
        return fileResp.buffer();
    }

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Download failed (${resp.status}): ${text}`);
    }
    return resp.buffer();
};
