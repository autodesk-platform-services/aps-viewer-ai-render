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
      //First we send the thumbnail to the OSS bucket
      const imageName = Date.now() + CURRENT_MODEL.split('.')[0] + '.png';
      await this.generateThumbnail('lmv'+imageName,  async (imagename, blob) =>{
          let fileBlob = await fetch(blob).then(r => r.blob());
          var file = new File([fileBlob], imagename);
          let data = new FormData();
          data.append('image-file', file);
          const respLMVIMGUpload = await fetch(`/api/images?bucket_key=${CURRENT_MODEL}`, { method: 'POST', body: data });
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