const express = require('express');
const { getAuthorizationUrl, authCallbackMiddleware, authRefreshMiddleware, getUserProfile, getViewerToken } = require('../services/aps.js');
const { APS_CLIENT_ID } = require('../config.js');

let router = express.Router();

router.get('/api/auth/clientid', function (req, res) {
    res.json({ clientId: APS_CLIENT_ID });
});

router.get('/api/auth/login', function (req, res) {
    res.redirect(getAuthorizationUrl());
});

router.get('/api/auth/logout', function (req, res) {
    req.session = null;
    res.redirect('/');
});

router.get('/api/auth/callback', authCallbackMiddleware, function (req, res) {
    res.redirect('/');
});

router.get('/api/auth/token', authRefreshMiddleware, function (req, res) {
    res.json(req.publicOAuthToken);
});

router.get('/api/auth/viewtoken', async function (req, res, next) {
    try {
        const token = await getViewerToken();
        res.json(token);
    } catch (err) {
        next(err);
    }
});

router.get('/api/auth/profile', authRefreshMiddleware, async function (req, res, next) {
    try {
        const profile = await getUserProfile(req.internalOAuthToken);
        res.json({ name: profile.name });
    } catch (err) {
        next(err);
    }
});

module.exports = router;