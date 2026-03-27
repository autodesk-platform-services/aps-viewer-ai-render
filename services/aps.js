const fs = require('fs');
const { AuthenticationClient, Scopes, ResponseType } = require('@aps_sdk/authentication');
const { OssClient, Region, PolicyKey, Access } = require('@aps_sdk/oss');
const { DataManagementClient } = require('@aps_sdk/data-management');
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_CALLBACK_URL } = require('../config.js');

const authClient = new AuthenticationClient();
const ossClient = new OssClient();
const dmClient = new DataManagementClient();

const INTERNAL_SCOPES = [Scopes.DataRead, Scopes.DataWrite, Scopes.DataCreate, Scopes.BucketRead, Scopes.BucketCreate, Scopes.ViewablesRead];

let twoLeggedCache = { token: null, expiresAt: 0 };

const service = module.exports = {};

service.getAuthorizationUrl = () =>
    authClient.authorize(APS_CLIENT_ID, ResponseType.Code, APS_CALLBACK_URL, INTERNAL_SCOPES);

service.authCallbackMiddleware = async (req, res, next) => {
    const internalCredentials = await authClient.getThreeLeggedToken(APS_CLIENT_ID, req.query.code, APS_CALLBACK_URL, { clientSecret: APS_CLIENT_SECRET });
    req.session.public_token = internalCredentials.access_token;
    req.session.internal_token = internalCredentials.access_token;
    req.session.refresh_token = internalCredentials.refresh_token;
    req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;
    next();
};

service.authRefreshMiddleware = async (req, res, next) => {
    const { refresh_token, expires_at } = req.session;
    if (!refresh_token) {
        res.status(401).end();
        return;
    }

    if (expires_at < Date.now()) {
        try {
            const internalCredentials = await authClient.refreshToken(refresh_token, APS_CLIENT_ID, { clientSecret: APS_CLIENT_SECRET });
            req.session.public_token = internalCredentials.access_token;
            req.session.internal_token = internalCredentials.access_token;
            req.session.refresh_token = internalCredentials.refresh_token;
            req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;
        } catch (err) {
            console.warn('Token refresh failed, clearing session:', err.message);
            req.session = null;
            res.status(401).end();
            return;
        }
    }
    req.internalOAuthToken = {
        access_token: req.session.internal_token,
        expires_in: Math.round((req.session.expires_at - Date.now()) / 1000)
    };
    req.publicOAuthToken = {
        access_token: req.session.public_token,
        expires_in: Math.round((req.session.expires_at - Date.now()) / 1000)
    };
    next();
};

service.getInternalToken = async () => {
    if (twoLeggedCache.expiresAt > Date.now()) return twoLeggedCache.token;
    const creds = await authClient.getTwoLeggedToken(APS_CLIENT_ID, APS_CLIENT_SECRET, INTERNAL_SCOPES);
    twoLeggedCache.token = creds.access_token;
    twoLeggedCache.expiresAt = Date.now() + creds.expires_in * 1000;
    return creds.access_token;
};

service.getUserProfile = async (token) => {
    const resp = await authClient.getUserInfo('Bearer ' + token.access_token);
    return resp;
};

service.getHubs = async (token) => {
    const resp = await dmClient.getHubs({ accessToken: token.access_token });
    return resp.data;
};

service.getProjects = async (hubId, token) => {
    const resp = await dmClient.getHubProjects(hubId, { accessToken: token.access_token });
    return resp.data;
};

service.getProjectContents = async (hubId, projectId, folderId, token) => {
    if (!folderId) {
        const resp = await dmClient.getProjectTopFolders(hubId, projectId, { accessToken: token.access_token });
        return resp.data;
    } else {
        const resp = await dmClient.getFolderContents(projectId, folderId, { accessToken: token.access_token });
        return resp.data;
    }
};

service.getItemVersions = async (projectId, itemId, token) => {
    const resp = await dmClient.getItemVersions(projectId, itemId, { accessToken: token.access_token });
    return resp.data;
};

service.ensureBucketExists = async (bucketKey) => {
    const accessToken = await service.getInternalToken();
    try {
        await ossClient.getBucketDetails(bucketKey, { accessToken });
    } catch (err) {
        if (err.axiosError && err.axiosError.response && err.axiosError.response.status === 404) {
            await ossClient.createBucket(Region.Us, { bucketKey, policyKey: PolicyKey.Persistent }, { accessToken });
        } else if (err.statusCode === 404 || (err.response && err.response.status === 404)) {
            await ossClient.createBucket(Region.Us, { bucketKey, policyKey: PolicyKey.Persistent }, { accessToken });
        } else {
            throw err;
        }
    }
};

service.listObjects = async (bucketKey) => {
    await service.ensureBucketExists(bucketKey);
    const accessToken = await service.getInternalToken();
    let resp = await ossClient.getObjects(bucketKey, { limit: 64, accessToken });
    let objects = resp.items;
    while (resp.next) {
        const startAt = new URL(resp.next).searchParams.get('startAt');
        resp = await ossClient.getObjects(bucketKey, { limit: 64, startAt, accessToken });
        objects = objects.concat(resp.items);
    }
    return objects;
};

service.uploadObject = async (objectName, filePath, bucketKey) => {
    await service.ensureBucketExists(bucketKey);
    const accessToken = await service.getInternalToken();
    const buffer = await fs.promises.readFile(filePath);
    const result = await ossClient.uploadObject(bucketKey, objectName, buffer, { accessToken });
    return result;
};

service.uploadObjectWithBuffer = async (objectName, buffer, bucketKey) => {
    await service.ensureBucketExists(bucketKey);
    const accessToken = await service.getInternalToken();
    const result = await ossClient.uploadObject(bucketKey, objectName, buffer, { accessToken });
    return result;
};

service.getSignedURL = async (bucketKey, objectName) => {
    await service.ensureBucketExists(bucketKey);
    const accessToken = await service.getInternalToken();
    const resp = await ossClient.createSignedResource(bucketKey, objectName, { access: Access.Read, minutesExpiration: 30, accessToken });
    return resp.signedUrl;
};

service.urnify = (id) => Buffer.from(id).toString('base64').replace(/=/g, '');
