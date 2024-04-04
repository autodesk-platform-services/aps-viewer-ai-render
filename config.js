require('dotenv').config();

let { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_CALLBACK_URL, SERVER_SESSION_SECRET, COMFY_KEY, PORT } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET || !APS_CALLBACK_URL || !SERVER_SESSION_SECRET || !COMFY_KEY) {
    console.warn('Missing some of the environment variables.');
    process.exit(1);
}
const INTERNAL_TOKEN_SCOPES = ['data:read'];
const PUBLIC_TOKEN_SCOPES = ['viewables:read'];
PORT = PORT || 8080;

module.exports = {
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    APS_CALLBACK_URL,
    SERVER_SESSION_SECRET,
    INTERNAL_TOKEN_SCOPES,
    PUBLIC_TOKEN_SCOPES,
    COMFY_KEY,
    PORT
};