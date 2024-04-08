const express = require('express');
const formidable = require('express-formidable');
const { listObjects, uploadObject, urnify } = require('../services/aps.js');

let router = express.Router();
const BUCKETKEYPREFIX = 'jpom-';

router.get('/api/models', async function (req, res, next) {
    try {
        const bucketKey = req.query.bucket_key;
        const objects = await listObjects(BUCKETKEYPREFIX+bucketKey);
        res.json(objects.map(o => ({
            name: o.objectKey,
            urn: urnify(o.objectId)
        })));
    } catch (err) {
        next(err);
    }
});

router.post('/api/images', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    const file = req.files['image-file'];
    const bucketKey = req.query.bucket_key;
    if (!file) {
        res.status(400).send('The required field ("image-file") is missing.');
        return;
    }
    try {
        const obj = await uploadObject(file.name, file.path, BUCKETKEYPREFIX+bucketKey);
        res.json({
            name: obj.objectKey,
            urn: urnify(obj.objectId)
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;