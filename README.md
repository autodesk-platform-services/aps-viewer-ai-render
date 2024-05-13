# aps-viewer-ai-render

## Introduction

Rendering is a required and sometimes painful part of the process in the lives of designers. With a quick search using the words AI and render you can find a set of solutions already addressing this process with the help of AI models. In this project, we'll share one option to generate a photorealistic scene starting with one image generated from a scene rendered with APS Viewer as input.

## Prerequisites

This sample leverages the [Hubs Browser tutorial](https://tutorials.autodesk.io/tutorials/hubs-browser/) as a base to select designs and render those with the Viewer.

From this point, we have the integration with generative AI.

To make this possible, we take advantage of [Stable Diffusion](https://en.wikipedia.org/wiki/Stable_Diffusion).

We've chosen [Comfy UI](https://github.com/comfyanonymous/ComfyUI) to help us achieve our goal.
We strongly you to take some time exploring this amazing tool to work with Stable Diffusion models. You can find a detailed guide at https://stable-diffusion-art.com/comfyui/

To use Comfy UI in a web app through an API, we used [comfy.icu](https://comfy.icu/) for its simplicity.

![comfy workflow in comfy.icu]()

To summarize, to run this app, you'll need:

1. [APS account and APS app](https://tutorials.autodesk.io/#create-an-account)
1. [Provision that in your ACC hub](https://tutorials.autodesk.io/#provision-access-in-other-products)
1. [Comfy.icu](https://comfy.icu/) account

## How it works

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
