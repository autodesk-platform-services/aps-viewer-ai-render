//
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
    this.views = {};
  }

  onToolbarCreated(toolbar) {
    this._button = this.createToolbarButton('imagerender-button', 'https://img.icons8.com/ios/30/camera--v3.png', 'Image Render');
    this._button.onClick = async () => {
      //First we send the thumbnail to the OSS bucket
      const imageName = Date.now() + CURRENT_MODEL;
      this.generateThumbnail(imageName);
      // a post request to /api/workflow using fetch
      let positivePrompt = document.getElementById('positiveprompt').value;
      let negativePrompt = 'ugly,nsfw';
      let resp = await fetch(`/api/workflows?pos_prompt=${positivePrompt}&neg_prompt=${negativePrompt}`, {
        method: 'POST'
      });
      let workflowJSON = await resp.json();
      let workflowId = workflowJSON.id;
      let status = 'QUEUED';
      let workflowRun = {};
      while (status != 'COMPLETED' & status != 'ERROR') {
        resp = await fetch(`/api/workflows?run_id=${workflowId}`, {
          method: 'GET'
        });
        workflowJSON = await resp.json();
        status = workflowJSON.run.status;
        workflowRun = workflowJSON.run;
        await new Promise(resolve => setTimeout(resolve, 3000));
        this.showToast(status);
      }
      if(status == 'COMPLETED'){
        const response = await fetch(workflowRun.output[0].url);
        // here image is url/location of image
        const blob = await response.blob();
        const file = new File([blob], imageName, {type: blob.type});
        let data = new FormData();
        data.append('image-file', file);
        const resp = await fetch('/api/images', { method: 'POST', body: data });
        refreshImages();
        // add on img element inside the div with id thumbnails using one url as source
        // let img = document.createElement('img');
        // img.src = workflowRun.output[0].thumbnail_url;
        // img.style.width = '5em';
        // img.style.height = '5em';
        // img.id = workflowId;
        // this.views[workflowId] = workflowRun.output[0].url;
        // document.getElementById('thumbnails').appendChild(img);
        //react to img being clicked and print the img id
        // img.onclick = (ev) => {
        //   let imgURL = this.views[ev.target.id];
        //   let imageElement  = document.getElementById('image');
        //   imageElement.style.visibility = 'visible';
        //   imageElement.style.backgroundImage = `url(${imgURL})`;
        //   imageElement.style.backgroundRepeat = 'no-repeat,no-repeat';
        // }
      }
    };
  }

  refreshImages(){
    
    let newImageItem = `<sl-carousel-item>
      <img
        alt="The sun shines on the mountains and trees (by Adam Kool on Unsplash)"
        src="/assets/examples/carousel/mountains.jpg"
      />
    </sl-carousel-item>`;
  }

  retrieveDepthMapPixels(){
    this.viewer.impl.renderer().mrtFlags()
    const depthTarget = this.viewer.impl.renderer().getDepthTarget();
    const gl = this.viewer.canvas.getContext('webgl2');
    const pixels = new Float32Array(4 * depthTarget.width * depthTarget.height);
    const framebuffer = depthTarget.__webglFramebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);        
    gl.viewport(0, 0, depthTarget.width, depthTarget.height);
    gl.readPixels(0, 0, depthTarget.width, depthTarget.height, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pixels;
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

  async getViewElements() {
    const tool = this.viewer.getExtension('Autodesk.BoxSelection').boxSelectionTool;
    const { left: startX, top: startY, right: endX, bottom: endY } = this.viewer.impl.getCanvasBoundingClientRect();
    tool.startPoint.set(startX, startY);
    tool.endPoint.set(endX, endY);
    let selection = await tool.getSelection();
    return selection[0].ids;
  }

  findLeafNodes(model) {
    return new Promise(function (resolve, reject) {
      model.getObjectTree(function (tree) {
        let leaves = [];
        tree.enumNodeChildren(tree.getRootId(), function (dbid) {
          if (tree.getChildCount(dbid) === 0) {
            leaves.push(dbid);
          }
        }, true /* recursively enumerate children's children as well */);
        resolve(leaves);
      }, reject);
    });
  }

  getBulkPropertiesAsync(model, dbIds, options) {
    return new Promise((resolve, reject) => {
      model.getBulkProperties2(dbIds, options, resolve, resolve);
    });
  }

  async generateThumbnail(imagename) {
    const { left: startX, top: startY, right: endX, bottom: endY } = this.viewer.impl.getCanvasBoundingClientRect();
    let vw = endX-startX;
    let vh = endY-startY;
    await this.viewer.getScreenShot(vw, vh, async (blob) => {

      var file = new File([blob], imagename);
      let data = new FormData();
      data.append('image-file', file);
      const resp = await fetch('/api/images', { method: 'POST', body: data });
      // var tag = document.createElement('a');
      // tag.href = blob;
      // tag.download = `${imagename}.png`;
      // document.body.appendChild(tag);
      // tag.click();
      // document.body.removeChild(tag);
    });
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