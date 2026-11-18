# 绘图工作台升级说明

## 类别与覆盖范围

2026-11-18 查看 OmicShare 公开主页和分类页面。主页显示 167 个工具，包含绘图、数据库分析、序列算法和格式转换，并非 167 种独立图形。

|参考类别|本项目入口及用途|
|---|---|
|[动态交互](https://www.omicshare.com/tools/Home/Index/index/type/report)|网络、流量和三维图；参数即时预览、悬停值、图元编辑|
|[功能分析](https://www.omicshare.com/tools/Home/Index/index/type/func)|导入已计算的富集结果，绘制条形、点棒和气泡|
|[基础绘图](https://www.omicshare.com/tools/Home/Index/index/type/plot)|柱、盒形、饼、散点、回归、面积、分布等|
|[聚类分析](https://www.omicshare.com/tools/Home/Index/index/type/cluster)|真实 PCA、PCoA、HCA 与 K-means|
|[差异检验](https://www.omicshare.com/tools/Home/Index/index/type/count)|火山、MA、样本相关性、ROC、临床图|
|[序列处理](https://www.omicshare.com/tools/Home/Index/index/type/seqdeal)|对齐序列 LOGO、序列长度分布|
|[热图工具](https://www.omicshare.com/tools/Home/Index/index/type/heatmap)|聚类矩阵、二值、圆点、气泡、环状和相关性热图|

本次保留原有 53 种，新增 20 种，共 73 种。新增：富集气泡、富集点棒、K-means、MA、二值/点棒/气泡/环状热图、PCA、PCoA、HCA、样本相关性热图、饼图、环形饼图、堆叠面积、核密度、有向/权重网络、序列 LOGO、序列长度分布。

这不是对 OmicShare 全部工具的复刻。GO/KEGG 富集图使用用户已计算的结果；不会自动查询数据库或执行富集检验。edgeR/DESeq2、GSEA、CCA/RDA、NMDS、tSNE/UMAP、BLAST、进化树和多序列比对尚未实现，需要独立算法、数据库或服务。

## 热图参数

选择“热图（聚类树 / 分组注释 / Z-score）”，打开“图形选项”。

1. 列范围按原表从 1 编号，支持 `2-4,6-8` 或中文逗号；标签列不能参与数值区域。留空使用全部数值列；错误范围会提示原因。
2. Z-score 可选行、列、先行后列或不处理；使用样本标准差（ddof=1），常量向量归一化为 0。格子数字是处理后的值。
3. 行/列独立聚类。距离：Euclidean、Manhattan、`1 − Pearson r`；连接方式：average、complete、single。排序和树高均来自真实距离，不使用占位树。
4. 聚类树可显示全部、行、列或隐藏；隐藏树保留聚类排序。上方高度、左侧宽度单位 mm，默认 20。
5. 行列标签分别显隐，字体默认 10 pt，列名角度可调；支持粘贴或上传仅需显示的行名列表。
6. 数字支持显隐、字号与小数位。
7. 渐变预设含 green-black-red、navy-white-firebrick3、olive-white-pink；自定义两个或更多 `#RRGGBB` 色号，从低到高排列。色标最小、中点、最大值可指定。
8. 分组注释可上传或粘贴两列数据，每行 `样本名,分组名`；样本名需与选中列名一致；色号数量应匹配分组数。聚类后仍按样本名对齐注释。
9. 格子形状、描边颜色/粗细、宽高 mm 均可调。尺寸 0 表示自适应，`5 × 5` 为 5 mm 方格；固定尺寸超出原宽度时扩展导出画布。

聚类每个维度最多 500 个对象；热图最多 100000 个格子。超过时先筛选或关闭聚类。

## 动态设置与数据约定

所有已提供的参数修改后立即更新预览和导出。支持自定义出版宽度 cm、字体字号、线宽、点半径、配色、轴范围和标题。散点柱状图支持柱宽和抖动比例，显著性说明在底部独立留白并居中。

点击预览图元，在“图元精调”修改文字、点、线或色块的坐标、尺寸、颜色、透明度、线宽与文字内容。修改进入 SVG/PNG，但不改变原始数据和统计结果。切换图形或重新载入示例会重置计算参数。

- PCA / PCoA / HCA / K-means：特征为行、样本为列；可选标准化。PCA 通过中心化 Gram 矩阵特征分解。K-means 在原特征空间计算，PCA 仅用于展示。PCoA 支持欧氏/Bray–Curtis，负特征值会提示；非负丰度数据使用 Bray–Curtis 时建议关闭 Z-score。
- 富集气泡：X=RichFactor，Y=P/Q，Size=Count，点标签=Term；可调阈值、Top N、色标和透明度。输入是已计算的富集结果。
- 火山图：阈值可调，分类、图例和报告采用当前阈值。
- LOGO：输入等长且已对齐的 FASTA 或位置频数矩阵；可选 bits/probability。统一转换为大写，gap 不计入频率，不执行序列比对。

## 公式识别与验证

默认使用 TexTeller 专用公式模型，直接输出 LaTeX；英文 OCR 仅保留为简单文字的备选。采用官方灰度、裁边、比例缩放、归一化、补边约定，并修复解码器文件命名、完整前缀解码兼容性。模型在浏览器 Worker 中推理，图片不上传，首次下载约 316 MB 后缓存；可取消加载。

- `npm run build`：严格 TypeScript 和生产构建。
- `npm run check:charts`：73 个示例的计算与 SVG，另验证列选择、Z-score、聚类顺序、PCA 解释率、固定 mm 格子、阈值和 FASTA。
- `npm run check:formula`：生成分式截图，用真实模型精确校验 `\frac{x^{2}}{a^{2}}-\frac{y^{2}}{b^{2}}=1`，需要能访问 Hugging Face。

本次修改位于原始 `60615678` 目录；GitHub 克隆目录不会自动同步这些文件。
