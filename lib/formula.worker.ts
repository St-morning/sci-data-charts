/// <reference lib="webworker" />
import { pipeline, env, Tensor, RawImage, type ImageToTextPipeline } from "@huggingface/transformers";
import { configureTexTeller, recognizeFormula } from "./formula-model.mjs";
configureTexTeller(env);
env.backends.onnx.wasm!.numThreads = 1;
let recognizer: Promise<ImageToTextPipeline> | undefined;
let activeId = 0;
self.onmessage = async (event: MessageEvent<{id:number;image:string;maxTokens:number}>) => {
  const {id,image,maxTokens}=event.data; activeId=id;
  try {
    recognizer ??= pipeline("image-to-text", "onnx-community/TexTeller-ONNX", {
      dtype: "q8", device: "wasm",
      progress_callback: (p: {status:string;progress?:number;file?:string}) => self.postMessage({id:activeId,type:"progress",progress:p.progress??0,file:p.file,status:p.status}),
    }).catch(e=>{recognizer=undefined;throw e;});
    const model=await recognizer;
    self.postMessage({id,type:"recognizing"});
    const text=await recognizeFormula(model,image,Tensor,RawImage,maxTokens);
    if(!text.trim())throw new Error("公式模型未输出内容，请裁剪到单条清晰公式后重试");
    self.postMessage({id,type:"result",text});
  } catch(e) { self.postMessage({id,type:"error",error:e instanceof Error?e.message:String(e)}); }
};
