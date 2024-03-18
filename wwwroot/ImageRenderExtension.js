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
    this._panel = null;
  }

  onToolbarCreated(toolbar) {
    this._panel = new ImageRenderPanel(this, 'image-render-panel', 'Image Render', { x: 10, y: 10 });
    this._button = this.createToolbarButton('imagerender-button', 'https://img.icons8.com/ios/50/pipelines.png', 'Image Render');
    this._button.onClick = async () => {
      const { ACTIVE, INACTIVE } = Autodesk.Viewing.UI.Button.State;
      this._panel.setVisible(!this._panel.isVisible());
      this._button.setState(this._panel.isVisible() ? ACTIVE : INACTIVE);
    };
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

}

Autodesk.Viewing.theExtensionManager.registerExtension('ImageRenderExtension', ImageRenderExtension);

class ImageRenderPanel extends Autodesk.Viewing.UI.DockingPanel {
  constructor(extension, id, title, options) {
    super(extension.viewer.container, id, title);
    this.extension = extension;
    this.container.style.left = (options.x || 0) + 'px';
    this.container.style.top = (options.y || 0) + 'px';
    this.container.style.width = (options.width || 1024) + 'px';
    this.container.style.height = (options.height || 1024) + 'px';
    this.container.style.resize = 'none';
    this.container.style.overflow = 'overlay';
    this.container.style.backgroundColor = 'transparent';
  }

  initialize() {
    this.title = this.createTitleBar(this.titleLabel || this.container.id);
    this.title.style.overflow = 'auto';
    this.initializeMoveHandlers(this.title);
    this.container.appendChild(this.title);

    this.div = document.createElement('div');
    this.container.appendChild(this.div);
  }
}