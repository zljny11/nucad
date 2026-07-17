# NuCAD 交接说明

NuCAD 为本地运行的，帮助医生根据算法文件读取病灶并支持人工修改转nifti文件导出迭代的petct阅片工具，当前仓库包含前端 Electron/React 应用和后端 Express 服务。

Notebook6本地路径：
开发目录：`/home/radyn/work/nucad`
Windows 桌面 WSL 路径：`/mnt/c/Users/yinyu/Desktop`

## 技术栈

- 前端：Electron 18、React 17、TypeScript、Redux Toolkit、Ant Design、Less
- 影像：Cornerstone3D、Cornerstone Tools、dicom-parser、dcmjs
- 文件/导出：node-xlsx、NIfTI mask 后端接口、Electron 本地文件能力
- 后端：Node.js、Express、mysql2

## 目录

- `frontend/`：桌面端主程序、影像页、病灶编辑、报告页
- `backend/`：本地接口服务，当前主要负责病例数据和 mask 读写
- `start-nucad.sh`：WSL 下一键启动脚本

## 主要链路

1. 列表页选择 DICOM 序列，进入四视图阅片页。
2. 影像页加载 PET/CT volume，并按病例输出目录读取病灶表和 mask。
3. 医生可进入病灶编辑页修改 mask。
4. 保存 mask 后生成 `doctor_mask.nii.gz`，并更新医生结果 Excel。
5. 导出时选择目录，生成包含 `doctor_lesion_report.xlsx`、`doctor_mask.nii.gz` 和算法原始文件的结果文件夹。

## 数据库

- 后端默认连接 MySQL：`localhost:3306/radyn`，用户 `root`，默认密码 `radyn123`。
- 可通过环境变量覆盖：`DB_HOST`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`、`DB_PORT`。
- 列表页当前产品固定为 `NNUNET`，后端从同名表读取病例序列。
- MySQL 查询失败时会回退到 `backend/data/local-studies.json`，本地导入的病例也会写入这里作为兜底。

## 数据流

- 列表页每 2 秒请求 `POST /list`，拿到病例树后写入前端列表。
- 本地导入 DICOM 时，前端选择文件，后端 `POST /import-local` 复制文件并登记病例。
- 进入影像页后，前端用病例的 `inputPath/outputPath` 加载 DICOM、病灶表和 mask。
- 算法结果导入后会缓存到 `outputPath/out/segmentation/`：
  - `algorithm_mask.nii.gz`
  - `algorithm_lesion_report.xlsx`
  - `algorithm_lesion_report.meta.json`
- 医生保存 mask 后写入：
  - `doctor_mask.nii.gz`
  - `doctor_lesion_report.xlsx`
  - `doctor_lesion_report.meta.json`
- 导出结果时会复制医生结果和算法原始文件到用户选择的目录。

## 当前进度

- 已支持本地 DICOM 序列加载、PET/CT 四视图显示、窗宽窗位/缩放/定位等基础阅片功能。
- 已支持导入算法结果目录，读取 `lesion_report.xlsx` 和 NIfTI mask。
- 已支持医生编辑 mask、保存医生版 mask、导出医生结果。
- 医生结果 Excel 已自动填写：体积、中心索引、中心位置、范围、SUV Max/Mean/Std、Homogeneity、CT Min/Max/Mean/Std、调试信息。
- 算法来源病灶行导出时保持原样，不覆盖算法已识别字段。
- 暂不自动重算：部位、淋巴区、Lugano、Deauville、肝/纵隔参考 SUV。

**待开发**
- 更多病灶表字段的自动填充（需进一步与算法端协调）。
- 导出报告功能有待完善（动态渲染报告）。
- 编辑前端优化，画刷升级等。

## 本地启动

建议在 WSL/Linux 环境开发

首次安装依赖：

```bash
cd backend && npm install
cd ../frontend && npm install
```

一键启动：

```bash
cd /home/radyn/work/nucad
./start-nucad.sh
```

默认端口：

- 后端：`4001`
- 前端 dev server：`3002`

脚本会同时拉起 backend、frontend 和 Electron，日志文件写在对应目录下：

- `backend/backend.stdout.log`
- `backend/backend.stderr.log`
- `frontend/frontend.stdout.log`
- `frontend/frontend.stderr.log`
- `frontend/electron.stdout.log`
- `frontend/electron.stderr.log`

## 注意

- WSL 路径可通过 Windows 资源管理器的 `\\wsl$` 访问。
- 导出到 Windows 桌面等目录时，建议选择 `/mnt/c/Users/...` 下的路径。
- 当前 build 会受历史文件 lint/ts 配置影响，开发验证优先跑相关文件 eslint。
