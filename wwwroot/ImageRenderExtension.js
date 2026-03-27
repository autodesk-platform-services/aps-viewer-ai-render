// Copyright (c) Autodesk, Inc. All rights reserved
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
//

const WORKFLOW_NEEDS_DEPTH = {
  'qwen': true,
  'flux': true
};

class ImageRenderExtension extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.viewsNames = {};
  }

  onToolbarCreated(toolbar) {
    this._button = this.createToolbarButton('imagerender-button', 'https://img.icons8.com/ios/30/camera--v3.png', 'Image Render');
    this._button.onClick = async () => {
      const imageName = Date.now() + CURRENT_MODEL.split('.')[0] + '.png';
      const selectedWorkflow = document.getElementById('workflow-select').value;
      const needsDepth = WORKFLOW_NEEDS_DEPTH[selectedWorkflow];
      const downloadMode = document.getElementById('downloadimages').checked;

      const screenshotBlob = await this.captureScreenshotBlob();

      if (downloadMode) {
        this.createDownloadLink(URL.createObjectURL(screenshotBlob), 'lmv' + imageName, 'Download Thumbnail');
        this.extractDepthAndNormalMaps(this.viewer, imageName);
        return;
      }

      try {
        // Upload screenshot to OSS for the gallery
        await this.uploadImageToBucket('lmv' + imageName, screenshotBlob);
        const respLMVSigned = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_key=lmv${imageName}`);
        const lmvSignedJson = await respLMVSigned.json();

        this.showToast("UPLOADING TO COMFY CLOUD...");

        // Upload screenshot to Comfy Cloud
        console.log('Uploading screenshot to Comfy Cloud...');
        const screenshotUpload = await this.uploadToComfyCloud(screenshotBlob, 'screenshot_' + imageName);
        console.log('Screenshot upload response:', screenshotUpload);

        // Upload depth map to Comfy Cloud if workflow needs it
        let depthFilename = null;
        if (needsDepth) {
          console.log('Capturing depth map...');
          const depthBlob = await this.captureDepthBlob();
          if (depthBlob) {
            console.log('Depth blob captured, size:', depthBlob.size, 'bytes. Uploading...');
            const depthUpload = await this.uploadToComfyCloud(depthBlob, 'depth_' + imageName);
            console.log('Depth upload response:', depthUpload);
            depthFilename = depthUpload.name;
          } else {
            console.warn('captureDepthBlob returned null — depth target may not be available');
          }
        }

        // Submit workflow
        const positivePrompt = document.getElementById('positiveprompt').value;
        const negativePrompt = 'hazy,bloom,blurry,nsfw';

        const runPayload = {
          workflow: selectedWorkflow,
          positivePrompt,
          negativePrompt,
          screenshotFilename: screenshotUpload.name,
          depthFilename
        };
        console.log('Submitting workflow with:', runPayload);
        const runResp = await fetch('/api/comfy/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runPayload)
        });
        const runResult = await runResp.json();
        if (!runResp.ok) throw new Error(runResult.error || 'Failed to submit workflow');

        const promptId = runResult.promptId;
        this.showToast("JOB TRIGGERED!");

        // Add loading thumbnail to carousel
        const thumbnailscontainer = document.getElementById('itens-container');
        thumbnailscontainer.innerHTML += `<sl-carousel-item>
          <img
            alt=""
            src="${lmvSignedJson.url}"
            onclick="updateImages('./loading.gif', '${lmvSignedJson.url}', true)"
          />
        </sl-carousel-item>`;

        // Poll for completion, updating the user every 5 seconds
        let status = 'pending';
        let outputs = {};
        let jobError = null;
        const statusLabels = {
          'pending': 'QUEUED',
          'in_progress': 'IN PROGRESS',
          'completed': 'COMPLETED',
          'failed': 'FAILED',
          'cancelled': 'CANCELLED'
        };
        let pollErrors = 0;
        let prevStatus = status;
        while (status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
          await new Promise(resolve => setTimeout(resolve, 5000));
          try {
            const statusResp = await fetch(`/api/comfy/status/${encodeURIComponent(promptId)}`);
            if (!statusResp.ok) {
              pollErrors++;
              console.warn(`Status poll returned ${statusResp.status} (attempt ${pollErrors})`);
              if (pollErrors >= 5) {
                status = 'failed';
                jobError = 'Lost connection to job status';
                break;
              }
              continue;
            }
            pollErrors = 0;
            const statusResult = await statusResp.json();
            status = statusResult.status;
            outputs = statusResult.outputs || {};
            jobError = statusResult.error || null;
          } catch (err) {
            pollErrors++;
            console.warn(`Status poll error (attempt ${pollErrors}):`, err.message);
            if (pollErrors >= 5) {
              status = 'failed';
              jobError = 'Lost connection to job status';
              break;
            }
            continue;
          }
          if (status !== prevStatus) {
            this.showToast(`Job status: ${statusLabels[status] || status}`);
            prevStatus = status;
          }
        }

        // Remove the loading carousel item we added
        const lastItem = thumbnailscontainer.querySelector('sl-carousel-item:last-child');

        if (status === 'completed') {
          this.showToast("DOWNLOADING FROM COMFY CLOUD...");
          console.log('Job completed. Outputs:', JSON.stringify(outputs));

          let outputImageInfo = null;
          for (const nodeOutputs of Object.values(outputs)) {
            if (nodeOutputs.images && nodeOutputs.images.length > 0) {
              outputImageInfo = nodeOutputs.images[0];
              break;
            }
          }

          if (!outputImageInfo) {
            console.warn('No output images found in outputs, job may have produced no images');
            if (lastItem) lastItem.remove();
            this.showToast("JOB COMPLETED BUT NO IMAGES FOUND");
          } else {
            console.log('Downloading output:', outputImageInfo.filename);
            const outputParams = new URLSearchParams({
              filename: outputImageInfo.filename,
              subfolder: outputImageInfo.subfolder || '',
              type: outputImageInfo.type || 'output'
            });
            const outputResp = await fetch(`/api/comfy/output?${outputParams}`);
            if (!outputResp.ok) {
              console.error('Failed to download output from Comfy Cloud:', outputResp.status);
              if (lastItem) lastItem.remove();
              this.showToast("FAILED TO DOWNLOAD OUTPUT");
            } else {
              const outputBlob = await outputResp.blob();
              console.log('Downloaded output blob, size:', outputBlob.size, 'bytes. Uploading to bucket...');

              this.showToast("UPLOADING TO BUCKET...");
              await this.uploadImageToBucket(imageName, outputBlob);
              console.log('Upload to bucket complete');

              this.refreshImages();
              const viewState = GLOBAL_VIEWER.getState();
              localStorage.setItem('lmv' + imageName, JSON.stringify(viewState));

              const viewerContainer = document.getElementById('preview');
              const imagesContainer = document.getElementById('image-comparer');
              viewerContainer.style.visibility = 'visible';
              imagesContainer.style.visibility = 'hidden';
              this.showToast("DONE!");
            }
          }
        } else {
          console.error(`Job ${promptId} ended with status: ${status}`, jobError);
          if (lastItem) lastItem.remove();
          this.showToast("JOB FAILED!");
        }
      } catch (err) {
        console.error('Workflow error:', err);
        this.showToast("ERROR: " + err.message);
      }
    };
  }

  async captureScreenshotBlob() {
    return new Promise((resolve) => {
      const { left: startX, top: startY, right: endX, bottom: endY } = this.viewer.impl.getCanvasBoundingClientRect();
      const vw = endX - startX;
      const vh = endY - startY;
      this.viewer.getScreenShot(vw, vh, async (blobUrl) => {
        const resp = await fetch(blobUrl);
        const blob = await resp.blob();
        resolve(blob);
      });
    });
  }

  async uploadToComfyCloud(blob, filename) {
    const formData = new FormData();
    formData.append('image-file', new File([blob], filename));
    const resp = await fetch('/api/comfy/upload', {
      method: 'POST',
      body: formData
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('Comfy Cloud upload failed: ' + text);
    }
    return resp.json();
  }

  async captureDepthBlob() {
    try {
      const renderer = this.viewer.impl.renderer();
      const gl = this.viewer.impl.glrenderer().context;
      const depthTarget = renderer.getDepthTarget();

      if (!depthTarget) return null;

      const w = depthTarget.width;
      const h = depthTarget.height;

      const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const currentViewport = gl.getParameter(gl.VIEWPORT);

      gl.bindFramebuffer(gl.FRAMEBUFFER, depthTarget.__webglFramebuffer);
      gl.viewport(0, 0, w, h);

      const pixels = new Float32Array(4 * w * h);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);

      gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
      gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);

      const depthChannel = this.findDepthChannel(pixels);

      const validDepths = [];
      for (let i = depthChannel; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) validDepths.push(pixels[i]);
      }
      validDepths.sort((a, b) => a - b);
      const depthCount = validDepths.length;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pixelIndex = (y * w + x) * 4;
          const depth = pixels[pixelIndex + depthChannel];

          let normalizedDepth = 0;
          if (depth !== 0 && depthCount > 1) {
            let lo = 0, hi = depthCount - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (validDepths[mid] <= depth) lo = mid + 1;
              else hi = mid - 1;
            }
            normalizedDepth = Math.pow(lo / depthCount, 0.55) * 255;
          }

          const imageIndex = ((h - y - 1) * w + x) * 4;
          data[imageIndex] = normalizedDepth;
          data[imageIndex + 1] = normalizedDepth;
          data[imageIndex + 2] = normalizedDepth;
          data[imageIndex + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });
    } catch (error) {
      console.error('Depth extraction failed:', error);
      return null;
    }
  }

  async uploadImageToBucket(imageName, fileBlob) {
    console.log(`[bucket] Uploading "${imageName}" (${fileBlob.size} bytes) to bucket_key="${CURRENT_MODEL}"`);
    var file = new File([fileBlob], imageName);
    let data = new FormData();
    data.append('image-file', file);
    const respLMVIMGUpload = await fetch(`/api/images?bucket_key=${CURRENT_MODEL}`, { method: 'POST', body: data });
    if (!respLMVIMGUpload.ok) {
      const errText = await respLMVIMGUpload.text();
      console.error(`[bucket] Upload failed (${respLMVIMGUpload.status}):`, errText);
      throw new Error(`Bucket upload failed: ${errText}`);
    }
    const result = await respLMVIMGUpload.json();
    console.log('[bucket] Upload result:', JSON.stringify(result));
    return result;
  }

  extractDepthAndNormalMaps(viewer, imageName) {
      try {
        const renderer = viewer.impl.renderer();
        const gl = viewer.impl.glrenderer().context;
        const depthTarget = renderer.getDepthTarget();

        if (!depthTarget) {
            console.error('No depth target available');
            return false;
        }

        const w = depthTarget.width;
        const h = depthTarget.height;

        const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const currentViewport = gl.getParameter(gl.VIEWPORT);

        gl.bindFramebuffer(gl.FRAMEBUFFER, depthTarget.__webglFramebuffer);
        gl.viewport(0, 0, w, h);

        const pixels = new Float32Array(4 * w * h);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);

        gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
        gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);

        const depthChannel = this.findDepthChannel(pixels);

        this.createWorkingDepthMap(pixels, w, h, depthChannel, imageName);
        this.createNormalMap(pixels, w, h, imageName);

        return true;

      } catch (error) {
        console.error('Depth and normal extraction failed:', error);
        return false;
      }
  }

  findDepthChannel(pixels) {
    const channelStats = [
      { min: Infinity, max: -Infinity, nonZero: 0 },
      { min: Infinity, max: -Infinity, nonZero: 0 },
      { min: Infinity, max: -Infinity, nonZero: 0 },
      { min: Infinity, max: -Infinity, nonZero: 0 }
    ];

      for (let i = 0; i < pixels.length; i += 4) {
          for (let c = 0; c < 4; c++) {
              const val = pixels[i + c];
              if (val !== 0) {
                  channelStats[c].nonZero++;
                  channelStats[c].min = Math.min(channelStats[c].min, val);
                  channelStats[c].max = Math.max(channelStats[c].max, val);
              }
          }
      }

      let bestChannel = 0;
      let bestRange = 0;
      for (let c = 0; c < 4; c++) {
          const range = channelStats[c].max - channelStats[c].min;
          if (range > bestRange && channelStats[c].nonZero > 0) {
              bestRange = range;
              bestChannel = c;
          }
      }

      return bestChannel;
  }

  createWorkingDepthMap(pixels, w, h, depthChannel, imageName) {
      const validDepths = [];
      for (let i = depthChannel; i < pixels.length; i += 4) {
          const depth = pixels[i];
          if (depth !== 0) {
              validDepths.push(depth);
          }
      }

      validDepths.sort((a, b) => a - b);
      const depthCount = validDepths.length;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;

      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              const pixelIndex = (y * w + x) * 4;
              const depth = pixels[pixelIndex + depthChannel];

              let normalizedDepth = 0;
              if (depth !== 0 && depthCount > 1) {
                  let lo = 0, hi = depthCount - 1;
                  while (lo <= hi) {
                      const mid = (lo + hi) >> 1;
                      if (validDepths[mid] <= depth) lo = mid + 1;
                      else hi = mid - 1;
                  }
                  normalizedDepth = Math.pow(lo / depthCount, 0.55) * 255;
              }

              const imageIndex = ((h - y - 1) * w + x) * 4;
              data[imageIndex] = normalizedDepth;
              data[imageIndex + 1] = normalizedDepth;
              data[imageIndex + 2] = normalizedDepth;
              data[imageIndex + 3] = 255;
          }
      }

      ctx.putImageData(imageData, 0, 0);
      const url = canvas.toDataURL('image/png');
      this.createDownloadLink(url, `${imageName}-depth-map.png`, 'Download Working Depth Map');
  }

  createNormalMap(pixels, w, h, imageName) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;

      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              const pixelIndex = (y * w + x) * 4;

              const nx = pixels[pixelIndex];
              const ny = pixels[pixelIndex + 1];

              let nz = 0;
              if (nx !== 0 || ny !== 0) {
                  const normalizedNx = nx * 2.0 - 1.0;
                  const normalizedNy = ny * 2.0 - 1.0;
                  nz = Math.sqrt(Math.max(0, 1.0 - normalizedNx * normalizedNx - normalizedNy * normalizedNy));
              }

              const imageIndex = ((h - y - 1) * w + x) * 4;

              data[imageIndex] = Math.floor((nx + 1.0) * 0.5 * 255);
              data[imageIndex + 1] = Math.floor((ny + 1.0) * 0.5 * 255);
              data[imageIndex + 2] = Math.floor((nz + 1.0) * 0.5 * 255);
              data[imageIndex + 3] = 255;
          }
      }

      ctx.putImageData(imageData, 0, 0);
      const url = canvas.toDataURL('image/png');
      this.createDownloadLink(url, `${imageName}-normal-map.png`, 'Download Normal Map');
  }

  createDownloadLink(pngUrl, fileName, linkText) {
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = fileName;
      downloadLink.innerText = linkText;
      downloadLink.style.display = 'block';
      downloadLink.style.margin = '10px';
      downloadLink.style.padding = '10px';
      downloadLink.style.backgroundColor = '#007ACC';
      downloadLink.style.color = 'white';
      downloadLink.style.textDecoration = 'none';
      downloadLink.style.borderRadius = '4px';

      document.body.appendChild(downloadLink);

      setTimeout(() => {
          downloadLink.click();
          setTimeout(() => {
              document.body.removeChild(downloadLink);
          }, 1000);
      }, 100);
  }

  async refreshImages(){
    if (this._refreshing) {
      this._refreshPending = true;
      return;
    }
    this._refreshing = true;
    console.log(`[gallery] refreshImages called, CURRENT_MODEL="${CURRENT_MODEL}"`);
    const thumbnailscontainer = document.getElementById('itens-container');
    thumbnailscontainer.innerHTML = '';
    if(CURRENT_MODEL !== ''){
      try {
        const resp = await fetch(`/api/images?bucket_key=${CURRENT_MODEL}`);
        if (!resp.ok) {
          console.error(`[gallery] Failed to list images (${resp.status}):`, await resp.text());
          return;
        }
        const images = await resp.json();
        console.log(`[gallery] Found ${images.length} objects in bucket`);
        const imagesAI = images.filter(i => !i.name.includes('lmv'));
        console.log(`[gallery] ${imagesAI.length} AI images, ${images.length - imagesAI.length} LMV images`);
        for(const imageAI of imagesAI){
          try{
            const resp = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_key=${imageAI.name}`);
            if (!resp.ok) {
                throw new Error(await resp.text());
            }
            const signedURL = await resp.json();
            this.viewsNames[signedURL.url] = imageAI.name;
            let imageLMV = images.find(i => i.name === 'lmv'+imageAI.name);
            if (!imageLMV) {
              console.warn(`[gallery] No matching LMV image for "${imageAI.name}", skipping`);
              continue;
            }
            const respLMV = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_key=${imageLMV.name}`);
            if (!respLMV.ok) {
              throw new Error(await respLMV.text());
            }
            const signedURLLMV = await respLMV.json();
            this.viewsNames[signedURLLMV.url] = imageLMV.name;
            thumbnailscontainer.innerHTML += `<sl-carousel-item>
              <img
                alt=""
                src="${signedURL.url}"
                onclick="updateImages('${signedURL.url}', '${signedURLLMV.url}')"
              />
            </sl-carousel-item>`;
          }
          catch(error){
            console.warn(`[gallery] Error loading image ${imageAI.name}:`, error);
          }
        }
      } catch (err) {
        console.error('[gallery] refreshImages error:', err);
      }
    }
    else{
      console.log('[gallery] CURRENT_MODEL is empty, skipping refresh');
    }
    this._refreshing = false;
    if (this._refreshPending) {
      this._refreshPending = false;
      this.refreshImages();
    }
  }

  createToolbarButton(buttonId, buttonIconUrl, buttonTooltip) {
    let group = this.viewer.toolbar.getControl('images-toolbar-group');
    if (!group) {
      group = new Autodesk.Viewing.UI.ControlGroup('images-toolbar-group');
      this.viewer.toolbar.addControl(group);
    }
    const button = new Autodesk.Viewing.UI.Button(buttonId);
    button.setToolTip(buttonTooltip);
    group.addControl(button);
    const icon = button.container.querySelector('.adsk-button-icon');
    if (icon) {
      icon.style.backgroundImage = `url(${buttonIconUrl})`;
      icon.style.backgroundSize = `24px`;
      icon.style.backgroundRepeat = `no-repeat`;
      icon.style.backgroundPosition = `center`;
    }
    return button;
  }

  removeToolbarButton(button) {
    const group = this.viewer.toolbar.getControl('images-toolbar-group');
    group.removeControl(button);
  }

  async load() {
    console.log('Images Render Extension has been loaded.');
    this.viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this._onObjectTreeCreated);
    this._onGeometryLoaded = () => {
      console.log('[gallery] Geometry loaded, refreshing images...');
      this.refreshImages();
    };
    this.viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this._onGeometryLoaded);
    return true;
  }

  unload() {
    if (this._button) {
      this.removeToolbarButton(this._button);
      this._button = null;
    }
    if (this._onGeometryLoaded) {
      this.viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this._onGeometryLoaded);
    }
    return true;
  }

  async generateThumbnail(imagename, callback) {
    const { left: startX, top: startY, right: endX, bottom: endY } = this.viewer.impl.getCanvasBoundingClientRect();
    let vw = endX-startX;
    let vh = endY-startY;
    this.viewer.getScreenShot(vw, vh, (blob) => callback(imagename, blob));
  }

  async showToast(message) {
    Swal.fire({
      title: message,
      timer: 3000,
      toast: true,
      position: 'top',
      showConfirmButton: false
    })
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension('ImageRenderExtension', ImageRenderExtension);