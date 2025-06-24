const express = require('express');
const formidable = require('express-formidable');
const { listObjects, uploadObject, urnify, getSignedURL, uploadObjectWithBuffer } = require('../services/aps.js');
const { route } = require('./auth.js');
const fetch = require('node-fetch');
const Buffer = require('buffer').Buffer 

let router = express.Router();
//Change this to your bucket key prefix
const BUCKETKEYPREFIX = 'jpom-';

router.get('/api/images', async function (req, res, next) {
    try {
        const bucketKey = BUCKETKEYPREFIX + req.query.bucket_key;
        const objects = await listObjects(bucketKey);
        res.json(objects.map(o => ({
            name: o.objectKey,
            urn: urnify(o.objectId)
        })));
    } catch (err) {
        next(err);
    }
});

router.get('/api/signedurl', async function(req, res, next) {
  try {
    const bucketKey = BUCKETKEYPREFIX + req.query.bucket_key;
    const objectKey = req.query.object_key;
    const signedURResponse = await getSignedURL(bucketKey, objectKey);
    res.json({url:signedURResponse.body.signedUrl});
  }
  catch (err) {
    next(err);
  }
});

router.post('/api/images', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    try {
      const file = req.files['image-file'];
      const bucketKey = BUCKETKEYPREFIX + req.query.bucket_key;
      if (!file) {
        res.status(400).send('The required field ("image-file") is missing.');
        return;
      }
      const obj = await uploadObject(file.name, file.path, bucketKey);
      res.json({
          name: obj.objectKey,
          urn: urnify(obj.objectId)
      });
    } catch (err) {
        next(err);
    }
});

router.post('/api/signedurl', async function (req, res, next) {
  try {
    const downloadurl = req.query.signed_url;
    const resp = await fetch(downloadurl);
    const blob = await resp.blob();
    var buffer = await blob.arrayBuffer();
    buffer = Buffer.from(buffer);
    const bucketKey = BUCKETKEYPREFIX + req.query.bucket_key;
    const objectName = req.query.object_name;
    if (!buffer) {
      res.status(400).send('The required field ("image-file") is missing.');
      return;
    }
    const obj = await uploadObjectWithBuffer(objectName, buffer, bucketKey);
    res.json({
        name: obj.objectKey,
        urn: urnify(obj.objectId)
    });
  } catch (err) {
      next(err);
  }
});

module.exports = router;