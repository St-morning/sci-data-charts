# Template provenance

## 2026-11-18 plotting and formula recognition upgrade

- OmicShare public categories and parameter descriptions are functional references only; no source code, icons, or UI assets were copied: https://www.omicshare.com/tools/home/index/index.html .
- TexTeller ONNX model: https://huggingface.co/onnx-community/TexTeller-ONNX (Apache-2.0 per its model card). Weights are downloaded on demand and not included in source.
- Image preprocessing conventions follow the official TexTeller `texteller/utils/image.py` and `texteller/constants.py`, independently implemented for the browser: https://github.com/OleehyO/TexTeller .
- Transformers.js 4.3.2 (Apache-2.0): https://github.com/huggingface/transformers.js .
- ml-matrix (MIT): https://github.com/mljs/matrix .

Adapted from the user-provided Codex Sites 0.1.66 `sites-building/templates/vinext-starter`.

The UI catalog, hooks, utilities, Tailwind stylesheet and vendored Shadcn CSS originate from that template. The vendored CSS license is preserved beside the file. Dependencies retain their own licenses.

Qoder adaptations replace Vinext/Next server rendering and Cloudflare configuration with a Vite static build; remove D1/Drizzle, R2 and ChatGPT authentication scaffolding; set Shadcn to client rendering; and make the toast component use its system theme without a Next theme provider. The Function example reuses Qoder Sites' credential-free handler. No upstream hosting, auth or resource configuration is copied into generated projects.

Qoder adds the Sites design contract and maps the starter theme, spacing, typography and transition scales to Nudge variables. Original light/dark colors are preserved as named project variables.
