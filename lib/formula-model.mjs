// TexTeller exports a decoder without a KV cache. Transformers.js expects
// the merged decoder filename by convention; map only this model's filename.
export function configureTexTeller(env) {
  env.allowLocalModels = false;
  const fetchModel = env.fetch;
  env.fetch = (input, init) => {
    const url = String(input);
    const mapped = url.includes('/onnx-community/TexTeller-ONNX/')
      ? url.replace('/decoder_model_merged_', '/decoder_model_')
      : url;
    return fetchModel(mapped, init);
  };
}

// Implements the model's published grayscale, border crop, aspect-preserving
// resize, normalization and zero-pad convention (not generic image captioning).
export async function texTellerProcessor(images, Tensor) {
  const tensors=[];
  for(const source of images) {
    let image=source.grayscale();
    const {width,height,data}=image;
    const corners=[data[0],data[width-1],data[(height-1)*width],data[width*height-1]].sort((a,b)=>a-b),bg=corners[1];
    let x0=width,y0=height,x1=-1,y1=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(Math.abs(data[y*width+x]-bg)>15){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1<0)throw new Error('截图没有可识别的公式笔画');
    image=await image.crop([x0,y0,x1,y1]);
    const scale=Math.min(447/Math.min(image.width,image.height),448/Math.max(image.width,image.height));
    image=await image.resize(Math.max(1,Math.floor(image.width*scale)),Math.max(1,Math.floor(image.height*scale)),{resample:3});
    const values=new Float32Array(448*448);
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)values[y*448+x]=(image.data[y*image.width+x]/255-0.9545467)/0.15394445;
    tensors.push(values);
  }
  const values=new Float32Array(tensors.length*448*448);tensors.forEach((v,i)=>values.set(v,i*448*448));
  return {pixel_values:new Tensor('float32',values,[tensors.length,1,448,448])};
}

export async function recognizeFormula(recognizer, image, Tensor, RawImage, maxTokens=384) {
  const raw=typeof image==='string'?await RawImage.read(image):image;
  const {pixel_values}=await texTellerProcessor([raw],Tensor);
  const model=recognizer.model;
  const encoder_outputs=await model._encode_input('model',{pixel_values},'last_hidden_state');
  const ids=[0];
  for(let step=0;step<maxTokens;step++) {
    const input=new Tensor('int64',BigInt64Array.from(ids.map(BigInt)),[1,ids.length]);
    const output=await model.forward({encoder_outputs,decoder_input_ids:input});
    const logits=output.logits, vocab=logits.dims.at(-1), offset=logits.data.length-vocab;
    let next=0,best=-Infinity;
    for(let i=0;i<vocab;i++)if(logits.data[offset+i]>best){best=logits.data[offset+i];next=i;}
    input.dispose();logits.dispose();
    if(next===2)break;
    ids.push(next);
    if(step===maxTokens-1)throw new Error('公式超过输出长度，请增大最大输出长度或缩小截图范围');
  }
  encoder_outputs.dispose();pixel_values.dispose();
  return recognizer.tokenizer.decode(ids,{skip_special_tokens:true}).trim();
}
