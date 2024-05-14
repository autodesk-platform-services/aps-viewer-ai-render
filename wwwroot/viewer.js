/// import * as Autodesk from "@types/forge-viewer";

async function getAccessToken(callback) {
  try {
      const resp = await fetch('/api/auth/2lotoken');
      if (!resp.ok) {
          throw new Error(await resp.text());
      }
      const { access_token, expires_in } = await resp.json();
      console.log('access_token', access_token);
      console.log('expires_in', expires_in);
      callback(access_token, expires_in);
  } catch (err) {
      alert('Could not obtain access token. See the console for more details.');
      console.error(err);        
  }
}

// var getAccessToken = () => {"token"} 

export function initViewer(container) {
  return new Promise(function (resolve, reject) {
      Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', getAccessToken }, function () {
          const config = {
              extensions: ['Autodesk.DocumentBrowser', 'ImageRenderExtension']
          };
          let viewer = new Autodesk.Viewing.GuiViewer3D(container, config);
          viewer.start();
          viewer.setTheme('light-theme');
          resolve(viewer);
      });
  });
}

export function loadModel(viewer, urn) {
  function onDocumentLoadSuccess(doc) {
    viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
    const viewerContainer = document.getElementById('preview');
    const imagesContainer  = document.getElementById('image-comparer');
    viewerContainer.style.visibility = 'visible';
    imagesContainer.style.visibility = 'hidden';
  }
  function onDocumentLoadFailure(code, message) {
    alert('Could not load model. See console for more details.');
    console.error(message);
  }
  Autodesk.Viewing.Document.load('urn:' + urn, onDocumentLoadSuccess, onDocumentLoadFailure);
}