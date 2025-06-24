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

class ImageRenderExtension extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.viewsNames = {};
  }

  onToolbarCreated(toolbar) {
    this._button = this.createToolbarButton('imagerender-button', 'https://img.icons8.com/ios/30/camera--v3.png', 'Image Render');
    this._button.onClick = async () => {

      //We send the thumbnail to the OSS bucket
      const imageName = Date.now() + CURRENT_MODEL.split('.')[0] + '.png';
      this.extractDepthAndNormalMaps(this.viewer, imageName);
      await this.generateThumbnail('lmv'+imageName,  async (imagename, blob) =>{
          let fileBlob = await fetch(blob).then(r => r.blob());
          //check if downloadimages option is checked
          if (document.getElementById('downloadimages').checked) {
            this.createDownloadLink(URL.createObjectURL(fileBlob), imagename, 'Download Thumbnail');
          }
          this.uploadImageToBucket(imagename, fileBlob);
          // var file = new File([fileBlob], imagename);
          // let data = new FormData();
          // data.append('image-file', file);
          // const respLMVIMGUpload = await fetch(`/api/images?bucket_key=${CURRENT_MODEL}`, { method: 'POST', body: data });
          const respLMVSignedDownloadURL = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_key=${imagename}`);
          let lmvSignedDownloadURLjson = await respLMVSignedDownloadURL.json();
          let positivePrompt = document.getElementById('positiveprompt').value;
          let negativePrompt = 'hazy,bloom,blurry,nsfw';
          let respComfyWorkflow = await fetch(`/api/workflows?pos_prompt=${positivePrompt}&neg_prompt=${negativePrompt}&image_signed_url=${lmvSignedDownloadURLjson.url}`, {
            method: 'POST'
          });
          let workflowJSON = await respComfyWorkflow.json();
          let workflowId = workflowJSON.id;
          let status = 'QUEUED';
          let workflowRun = {};
          this.showToast("JOB TRIGGERED!");
          //now we add the new image as thumbnail with loading gif
          const thumbnailscontainer = document.getElementById('itens-container');
          thumbnailscontainer.innerHTML += `<sl-carousel-item>
            <img
              alt=""
              src="${lmvSignedDownloadURLjson.url}"
              onclick="updateImages('./loading.gif', '${lmvSignedDownloadURLjson.url}', true)"
            />
          </sl-carousel-item>`;
          // And in parallel we check comfy.icu workflow status
          while (status != 'COMPLETED' & status != 'ERROR') {
            let respRunStatus = await fetch(`/api/workflows?run_id=${workflowId}`, {
              method: 'GET'
            });
            workflowJSON = await respRunStatus.json();
            status = workflowJSON.run.status;
            workflowRun = workflowJSON.run;
            const leftImage = document.getElementById('image-left');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          if(status == 'COMPLETED'){
            const imageURL = workflowRun.output[0].url;
            const resp = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_name=${imagename.replace('lmv','')}&signed_url=${imageURL}`, { method: 'POST' });
            GLOBAL_VIEWER.getExtension('ImageRenderExtension').refreshImages();
            let viewState = GLOBAL_VIEWER.getState();
            localStorage.setItem(imagename, JSON.stringify(viewState));
            const viewerContainer = document.getElementById('preview');
            const imagesContainer  = document.getElementById('image-comparer');
            viewerContainer.style.visibility = 'visible';
            imagesContainer.style.visibility = 'hidden';
          }
      });
    };
    this.refreshImages();
  }

  async uploadImageToBucket(imageName, fileBlob) {
    var file = new File([fileBlob], imageName);
    let data = new FormData();
    data.append('image-file', file);
    const respLMVIMGUpload = await fetch(`/api/images?bucket_key=${CURRENT_MODEL}`, { method: 'POST', body: data });
    return respLMVIMGUpload.json();
  }

  // Simplified function to extract working depth map and normal map
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
        
        console.log(`Extracting depth and normals from target: ${w}x${h}`);
        
        // Save current WebGL state
        const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const currentViewport = gl.getParameter(gl.VIEWPORT);
        
        // Bind the depth target's framebuffer
        const framebuffer = depthTarget.__webglFramebuffer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, w, h);
        
        // Read RGBA float data
        const pixels = new Float32Array(4 * w * h);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);
        
        // Restore WebGL state
        gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
        gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);
        
        console.log('Successfully read depth target RGBA data');
        
        // Find which channel contains depth data
        const depthChannel = this.findDepthChannel(pixels);
        console.log(`Using channel ${depthChannel} for depth data`);
        
        // Generate both maps
        this.createWorkingDepthMap(pixels, w, h, depthChannel, imageName);
        this.createNormalMap(pixels, w, h, imageName);
        
        return true;
          
      } catch (error) {
        console.error('Depth and normal extraction failed:', error);
        return false;
      }
  }

  // Find the channel with the most depth-like variation
  findDepthChannel(pixels) {
    const channelStats = [
      { min: Infinity, max: -Infinity, nonZero: 0 }, // R
      { min: Infinity, max: -Infinity, nonZero: 0 }, // G  
      { min: Infinity, max: -Infinity, nonZero: 0 }, // B
      { min: Infinity, max: -Infinity, nonZero: 0 }  // A
    ];
      
      // Analyze each channel
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
      
      // Find the channel with the most variation (likely depth)
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

  // Create the working depth map (your best result)
  createWorkingDepthMap(pixels, w, h, depthChannel, imageName) {
      // Collect valid depth values
      const validDepths = [];
      for (let i = depthChannel; i < pixels.length; i += 4) {
          const depth = pixels[i];
          if (depth !== 0) {
              validDepths.push(depth);
          }
      }
      
      validDepths.sort((a, b) => a - b);
      
      // Use 1st and 99th percentiles to ignore outliers
      const minDepth = validDepths[Math.floor(validDepths.length * 0.01)];
      const maxDepth = validDepths[Math.floor(validDepths.length * 0.99)];
      
      console.log(`Depth range: ${minDepth} to ${maxDepth}`);
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      
      // Process each pixel
      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              const pixelIndex = (y * w + x) * 4;
              const depth = pixels[pixelIndex + depthChannel];
              
              let normalizedDepth = 0;
              if (depth !== 0 && maxDepth > minDepth) {
                  normalizedDepth = ((depth - minDepth) / (maxDepth - minDepth)) * 255;
              }
              
              const imageIndex = ((h - y - 1) * w + x) * 4; // Flip Y
              data[imageIndex] = normalizedDepth;     // R
              data[imageIndex + 1] = normalizedDepth; // G
              data[imageIndex + 2] = normalizedDepth; // B
              data[imageIndex + 3] = 255;             // A
          }
      }
      
      //check if downloadimages option is checked
      if (document.getElementById('downloadimages').checked) {
        ctx.putImageData(imageData, 0, 0);
        const url = canvas.toDataURL('image/png');
        this.createDownloadLink(url, `${imageName}-depth-map.png`, 'Download Working Depth Map');
      }

      //upload the depth map to the bucket
      // const blob = new Blob([data], { type: 'image/png' });
      // const fileBlob = new File([blob], `${imageName}-depth-map.png`);
      // this.uploadImageToBucket(imagename, fileBlob);
  }

  // Create normal map from RGB channels
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
              
              // Read normal data from RGB channels
              const nx = pixels[pixelIndex];     // R channel
              const ny = pixels[pixelIndex + 1]; // G channel
              
              // Reconstruct Z component of normal
              let nz = 0;
              if (nx !== 0 || ny !== 0) {
                  // Unpack normals (assuming they're in -1 to 1 range)
                  const normalizedNx = nx * 2.0 - 1.0;
                  const normalizedNy = ny * 2.0 - 1.0;
                  nz = Math.sqrt(Math.max(0, 1.0 - normalizedNx * normalizedNx - normalizedNy * normalizedNy));
              }
              
              const imageIndex = ((h - y - 1) * w + x) * 4; // Flip Y
              
              // Convert normals to 0-255 range for visualization
              data[imageIndex] = Math.floor((nx + 1.0) * 0.5 * 255);     // R (nx)
              data[imageIndex + 1] = Math.floor((ny + 1.0) * 0.5 * 255); // G (ny)
              data[imageIndex + 2] = Math.floor((nz + 1.0) * 0.5 * 255); // B (nz)
              data[imageIndex + 3] = 255;                                // A
          }
      }
      
      //check if downloadimages option is checked
      if (document.getElementById('downloadimages').checked) {
        ctx.putImageData(imageData, 0, 0);
        const url = canvas.toDataURL('image/png');
        this.createDownloadLink(url, `${imageName}-normal-map.png`, 'Download Normal Map');
      }

      //upload the normal map to the bucket
      // const blob = new Blob([data], { type: 'image/png' });
      // const fileBlob = new File([blob], `${imageName}-normal-map.png`);
      // this.uploadImageToBucket(imagename, fileBlob);
  }

  // Helper function to create download links
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
      
      // Auto-download
      setTimeout(() => {
          downloadLink.click();
          // Remove link after download
          setTimeout(() => {
              document.body.removeChild(downloadLink);
          }, 1000);
      }, 100);
  }

  async refreshImages(){
    const thumbnailscontainer = document.getElementById('itens-container');
    thumbnailscontainer.innerHTML = '';
    if(CURRENT_MODEL !== ''){
      const resp = await fetch(`/api/images?bucket_key=${CURRENT_MODEL}`);
      if (!resp.ok) {
          throw new Error(await resp.text());
      }
      const images = await resp.json();
      const imagesAI = images.filter(i => !i.name.includes('lmv'));
      for(const imageAI of imagesAI){
        try{
          const resp = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_key=${imageAI.name}`);
          if (!resp.ok) {
              throw new Error(await resp.text());
          }
          const signedURL = await resp.json();
          this.viewsNames[signedURL.url] = imageAI.name;
          let imageLMV = images.find(i => i.name === 'lmv'+imageAI.name);
          const respLMV = await fetch(`/api/signedurl?bucket_key=${CURRENT_MODEL}&object_key=${imageLMV.name}`);
          if (!respLMV.ok) {
            throw new Error(await respLMV.text());
          }
          const signedURLLMV = await respLMV.json();
          this.viewsNames[signedURLLMV.url] = imageLMV.name;
          // IMAGES_SIGNED_URLS[signedURL.url]=signedURLLMV.url;
          thumbnailscontainer.innerHTML += `<sl-carousel-item>
            <img
              alt=""
              src="${signedURL.url}"
              onclick="updateImages('${signedURL.url}', '${signedURLLMV.url}')"
            />
          </sl-carousel-item>`;
        }
        catch(error){
          console.log(`Error loading image ${imageAI.name}`)
        }
      }
    }
    else{
      this.showToast('SELECT A MODEL FIRST!');
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
    return true;
  }

  unload() {
    if (this._button) {
      this.removeToolbarButton(this._button);
      this._button = null;
    }
    return true;
  }

  async generateThumbnail(imagename, callback) {
    const { left: startX, top: startY, right: endX, bottom: endY } = this.viewer.impl.getCanvasBoundingClientRect();
    let vw = endX-startX;
    let vh = endY-startY;
    //For sd15 ratio
    // vw = 512;
    // vh = 512;
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