# aps-viewer-ai-render

## Introduction

Rendering is a required and sometimes painful part of the process in the lives of designers. With a quick search using the words AI and render you can find a set of solutions already addressing this process with the help of AI models. In this project, we'll share one option to generate a photorealistic scene starting with one image generated from a scene rendered with APS Viewer as input.

## Thumbnail

![Thumbnail](./assets/thumbnail.gif)

## Demo

Read only demo at https://aps-viewer-ai-render.autodesk.io

Check the video of this sample at https://www.youtube.com/watch?v=HmjW4ZyQ-k4&t=468s

## Prerequisites

This sample leverages the [Hubs Browser tutorial](https://tutorials.autodesk.io/tutorials/hubs-browser/) as a base to select designs and render those with the Viewer.

From this point, we have the integration with generative AI.

To make this possible, we take advantage of [Stable Diffusion](https://en.wikipedia.org/wiki/Stable_Diffusion).

We've chosen [Comfy UI](https://github.com/comfyanonymous/ComfyUI) to help us achieve our goal.
We strongly you to take some time exploring this amazing tool to work with Stable Diffusion models. You can find a detailed guide at https://stable-diffusion-art.com/comfyui/

To use Comfy UI in a web app through an API, we used [comfy.icu](https://comfy.icu/) for its simplicity.

![comfy workflow in comfy.icu](./assets/comfyicu.gif)

To summarize, to run this app, you'll need:

1. [Node.js](https://nodejs.org) (Long Term Support version is recommended)
1. [APS account and APS app](https://tutorials.autodesk.io/#create-an-account)
1. [Provision that in your ACC hub](https://tutorials.autodesk.io/#provision-access-in-other-products)
1. [Comfy.icu](https://comfy.icu/) account

### Setup & Run

- Clone this repository: `git clone https://github.com/autodesk-platform-services/aps-simple-viewer-nodejs`
- Go to the project folder: `cd aps-simple-viewer-nodejs`
- Install Node.js dependencies: `npm install`
- Open the project folder in a code editor of your choice
- Create a _.env_ file in the project folder, and populate it with the snippet below,
  replacing `<client-id>` and `<client-secret>` with your APS Client ID and Client Secret:

```bash
APS_CLIENT_ID="<client-id>"
APS_CLIENT_SECRET="<client-secret>"
APS_CALLBACK_URL="http://localhost:8080/api/auth/callback" # URL your users will be redirected to after logging in with their Autodesk account
COMFY_WORKFLOW_ID=""
COMFY_KEY=""
```

- Run the application, either from your code editor, or by running `npm start` in terminal
- Open http://localhost:8080

> When using [Visual Studio Code](https://code.visualstudio.com), you can run & debug
> the application by pressing `F5`.

## How it works

Through Comfy.icu we can easily trigger the same workflow through an http request. We just need to pass a json structure with all the nodes we'll use and its connections, like the sample below:

```js
{
    "prompt": {
      "3": {
          "_meta": {
              "title": "KSampler"
          },
          "inputs": {
              "cfg": 7,
              "seed": 70988865502061,
              "model": [
                  "4",
                  0
              ],
              "steps": 20,
              "denoise": 0.95,
              "negative": [
                  "7",
                  0
              ],
              "positive": [
                  "22",
                  0
              ],
              "scheduler": "karras",
              "latent_image": [
                  "20",
                  0
              ],
              "sampler_name": "dpmpp_sde"
          },
          "class_type": "KSampler"
      },
      "4": {
          "_meta": {
              "title": "Load Checkpoint"
          },
          "inputs": {
              "ckpt_name": "architecturerealmix_v1repair.safetensors"
          },
          "class_type": "CheckpointLoaderSimple"
      },
      "6": {
          "_meta": {
              "title": "CLIP Text Encode (Prompt)"
          },
          "inputs": {
              "clip": [
                  "4",
                  1
              ],
              "text": positiveprompt
          },
          "class_type": "CLIPTextEncode"
      },
      "7": {
          "_meta": {
              "title": "CLIP Text Encode (Prompt)"
          },
          "inputs": {
              "clip": [
                  "4",
                  1
              ],
              "text": negativePrompt
          },
          "class_type": "CLIPTextEncode"
      },
      "8": {
          "_meta": {
              "title": "VAE Decode"
          },
          "inputs": {
              "vae": [
                  "4",
                  2
              ],
              "samples": [
                  "3",
                  0
              ]
          },
          "class_type": "VAEDecode"
      },
      "9": {
          "_meta": {
              "title": "Save Image"
          },
          "inputs": {
              "images": [
                  "8",
                  0
              ],
              "filename_prefix": "ComfyUI"
          },
          "class_type": "SaveImage"
      },
      "14": {
          "_meta": {
              "title": "Preview Image"
          },
          "inputs": {
              "images": [
                  "29",
                  0
              ]
          },
          "class_type": "PreviewImage"
      },
      "19": {
          "_meta": {
              "title": "Load Image"
          },
          "inputs": {
              "image": "image.png",
              "upload": "image"
          },
          "class_type": "LoadImage"
      },
      "20": {
          "_meta": {
              "title": "VAE Encode"
          },
          "inputs": {
              "vae": [
                  "4",
                  2
              ],
              "pixels": [
                  "19",
                  0
              ]
          },
          "class_type": "VAEEncode"
      },
      "22": {
          "_meta": {
              "title": "Apply ControlNet"
          },
          "inputs": {
              "image": [
                  "29",
                  0
              ],
              "strength": 0.8,
              "control_net": [
                  "24",
                  0
              ],
              "conditioning": [
                  "6",
                  0
              ]
          },
          "class_type": "ControlNetApply"
      },
      "24": {
          "_meta": {
              "title": "Load ControlNet Model"
          },
          "inputs": {
              "control_net_name": "control_v11p_sd15_canny_fp16.safetensors"
          },
          "class_type": "ControlNetLoader"
      },
      "29": {
          "_meta": {
              "title": "Canny Edge"
          },
          "inputs": {
              "image": [
                  "19",
                  0
              ],
              "resolution": 1472,
              "low_threshold": 80,
              "high_threshold": 250
          },
          "class_type": "CannyEdgePreprocessor"
      }
    },
    "files":{
      "/input/image.png":signedDownloadURL
    }
}
```

You can find the json for this workflow in the assets folder (controlnet.json).

The Comfy workflow to generate our images requires some input image that is used as a reference, and some text prompts (one negative and one positive) that are used by the model to compose our output image.

Our sample app implements that just like described below:

1. The user selects one design from his ACC hub
1. With the design rendered, the user configure one specific scene by walking to one room, hiding elements, doing cuts...
1. After clicking in the `ImageRenderExtension` the process gets triggered.
1. Through the Viewer's [getScreenShot](https://aps.autodesk.com/en/docs/viewer/v7/reference/Viewing/GuiViewer3D/#getscreenshot-w-h-cb-overlayrenderer) method, we generate the input image and send that to [OSS](https://aps.autodesk.com/en/docs/data/v2/developers_guide/overview/).
1. As soon as this upload is complete, we generate a signed URL for that input image and send that to comfy.icu together with the input texts.
1. After the process gets completed, we download the output image and send that also to OSS, in a way the two images can be rendered in our app for comparision.

## License

This sample is licensed under the terms of the [MIT License](http://opensource.org/licenses/MIT). Please see the [LICENSE](LICENSE) file for full details.

## Written by

Joao Martins [in/jpornelas](https://linkedin.com/in/jpornelas), [Developer Advocate](http://aps.autodesk.com)
Jaime Rosales [in/jaimerosales](https://linkedin.com/in/jaimerosales), [Senior Developer Advocate](http://aps.autodesk.com)
