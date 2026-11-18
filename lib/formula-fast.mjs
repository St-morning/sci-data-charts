import { PreTrainedTokenizer, Tensor, VisionEncoderDecoderModel } from '@huggingface/transformers';

const MODEL = 'alephpi/FormulaNet';
const REVISION = 'b2668efe5112082846fde4d446b9bfaab3989533';
const SIZE = 384;

export async function loadFastFormula(options) {
  const settings = { ...options, revision: REVISION };
  const model = await VisionEncoderDecoderModel.from_pretrained(MODEL, { ...settings, dtype: 'fp32' });
  try {
    const tokenizer = await PreTrainedTokenizer.from_pretrained(MODEL, settings);
    return { model, tokenizer };
  } catch (error) {
    await model.dispose();
    throw error;
  }
}

async function prepareImage(image) {
  let gray = image.clone().grayscale();
  const { width, height, data } = gray;
  const corners = [data[0], data[width - 1], data[(height - 1) * width], data[data.length - 1]];
  const lightBackground = corners.filter(value => value >= 128).length >= 2;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (lightBackground) data[i] = 255 - data[i];
      if (data[i] > 52) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) throw new Error('截图没有可识别的公式笔画');

  gray = await gray.crop([left, top, right, bottom]);
  const scale = SIZE / Math.max(gray.width, gray.height);
  gray = await gray.resize(
    Math.max(1, Math.round(gray.width * scale)),
    Math.max(1, Math.round(gray.height * scale)),
  );

  // Texo expects centered light strokes, three grayscale planes and UniMERNet normalization.
  const plane = SIZE * SIZE;
  const values = new Float32Array(plane * 3).fill(-0.7931 / 0.1738);
  const dx = Math.floor((SIZE - gray.width) / 2), dy = Math.floor((SIZE - gray.height) / 2);
  for (let y = 0; y < gray.height; y++) {
    for (let x = 0; x < gray.width; x++) {
      values[(dy + y) * SIZE + dx + x] = (gray.data[y * gray.width + x] / 255 - 0.7931) / 0.1738;
    }
  }
  values.copyWithin(plane, 0, plane);
  values.copyWithin(plane * 2, 0, plane);
  return new Tensor('float32', values, [1, 3, SIZE, SIZE]);
}

export async function recognizeFastFormula({ model, tokenizer }, image, maxTokens) {
  const pixels = await prepareImage(image);
  try {
    const output = await model.generate({
      inputs: pixels,
      max_new_tokens: maxTokens,
      forced_eos_token_id: null,
      do_sample: false,
      use_cache: true,
    });
    try {
      if (Number(output.data.at(-1)) !== 2) {
        throw new Error('公式超过输出长度，请增大最大输出长度或缩小截图范围');
      }
      return tokenizer.batch_decode(output, { skip_special_tokens: true })[0].trim();
    } finally {
      output.dispose();
    }
  } finally {
    pixels.dispose();
  }
}
