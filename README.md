# sci-data-charts · 科研数图工作台

让数据看得见。一个基于 React、TypeScript、Vite 和 Tailwind CSS 的浏览器科研数据工作台。

## 功能

- 论文图表复核：单位、有效数字、误差棒声明、颜色辨识度及图文一致性检查。
- 数据转论文段落：导入 Excel / CSV，清洗数据、计算描述统计、执行 Welch t 检验或单因素 ANOVA，并生成结果与讨论初稿。
- 图片防误用检测：重复、镜像、裁剪重叠和比例尺候选检查。
- 跨批次对比：样品对齐、方差分解和排序一致性分析。
- 数据故事板：组织研究问题、实验设计、发现、证据和结论。
- 科研 / BI 绘图：53 种图形、配色、字体、误差线、SVG 与 600 dpi PNG 导出。
- 多图自动排版：网格组合、面板编号和统一栏宽。
- 公式截图转 LaTeX：本地 OCR、KaTeX 预览和模板插入。

数据分析在浏览器中进行；部分工作区内容保存在浏览器本地存储。OCR 运行时可能需要联网下载引擎和语言模型。统计结论及自动生成文本应由研究者复核。

## 本地运行

需要 Node.js `^22.13.0 || >=24.0.0`。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。构建和预览：

```sh
npm run build
npm run preview
```

`build` 会先运行严格 TypeScript 检查，再生成 `dist/`。部署时发布 `dist/` 中的静态文件；模块使用 hash 路由。

## 目录

- `src/`：应用入口、导航和全局样式。
- `modules/`：八个功能模块。
- `lib/`：数据解析、统计、绘图、图像处理和本地存储。
- `components/`、`hooks/`：共享组件及 hooks。
- `functions/`：可选的 Deno 示例接口，前端核心功能不依赖它。
- `dev/`：本地接口入口和合成图像测试素材。
- `vendor/`：保留的第三方样式及许可证。

可选接口需要安装 Deno：

```sh
npm run check:function
npm run dev:function
```

Vite 的开发和预览服务器会将 `/functions/v1/app` 代理到 `127.0.0.1:8000`。

## 当前版本说明

本次上传保留现有功能实现。已知待改进项包括：导入 SVG 的安全清理、`xlsx` / `zod` 依赖安全问题、本地存储容量不足时的错误反馈、批次残差表述，以及部分组名的重复后缀。目前未配置自动化测试与 Lint；`npm run build` 包含前端类型检查。

源代码不包含 `node_modules/`、`dist/`、环境变量文件、本地工作台元数据或文档摘录。第三方来源说明见 [PROVENANCE.md](PROVENANCE.md)。
