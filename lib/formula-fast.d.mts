import type { PretrainedModelOptions, PreTrainedTokenizer, RawImage, VisionEncoderDecoderModel } from '@huggingface/transformers';

interface FastFormulaModel {
  model: VisionEncoderDecoderModel;
  tokenizer: PreTrainedTokenizer;
}

export function loadFastFormula(options: PretrainedModelOptions): Promise<FastFormulaModel>;
export function recognizeFastFormula(model: FastFormulaModel, image: RawImage, maxTokens: number): Promise<string>;
