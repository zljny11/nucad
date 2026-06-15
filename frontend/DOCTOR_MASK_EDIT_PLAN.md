# NuCAD 医生可编辑 Mask 最短落地方案

## 1. 结论

基于当前 `Nuc-CAD` 与 `Nuc-CAD_server` 两个仓库的实现状态，系统目前还没有覆盖到“支持医生编辑 mask”的程度。

当前能力更接近：

- 本地 DICOM/PET-CT 图像查看
- 算法输出结果列表展示
- 病灶列表勾选与定位跳转
- 报告文本前端编辑与 PDF 导出

尚未具备的关键能力包括：

- mask 数据加载与叠加显示
- 医生对 mask 的画刷/擦除/轮廓编辑
- 编辑结果保存、重载、提交
- 原始算法结果与医生修订结果的版本隔离
- 围绕医生编辑行为的最小工作流

## 2. 当前代码现状

### 2.1 前端 `Nuc-CAD`

当前图像页具备的工具主要是：

- 翻层
- 窗宽窗位
- 平移
- 缩放
- 探针
- 十字线

未发现以下分割编辑相关能力：

- segmentation overlay 加载
- brush / eraser
- freehand contour
- ROI 编辑
- undo / redo
- label 切换
- mask 保存

病灶表数据来自算法输出的 `report.xlsx`，说明当前病灶展示依赖算法后处理结果，而不是前端可编辑的 segmentation 数据模型。

报告页虽然可编辑，但本质上是前端局部状态编辑后导出 PDF，不是临床意义上的“医生修订结果持久化”。

### 2.2 后端 `Nuc-CAD_server`

当前后端非常薄，主要是：

- 列表查询
- 删除记录
- 输出目录读取

尚无以下能力：

- segmentation 读写接口
- 医生编辑记录
- 版本管理
- 提交审核状态
- 并发编辑控制
- 医生身份与权限

## 3. 最短缺口清单

从当前系统到“医生可编辑 mask”，最短路径不是继续扩展报告页，而是优先打通以下 6 个缺口。

### 3.1 缺口一：mask 数据未进入前端渲染链路

当前图像页只加载 PET/CT volume，没有独立的 segmentation volume 或 labelmap overlay。

必须补齐：

- 明确算法输出 mask 的真实格式
- 前端将 mask 读入内存
- 在现有视口中叠加显示 mask
- 至少支持显隐、透明度、颜色

### 3.2 缺口二：没有医生编辑工具

当前工具不足以做任何分割修订。

必须补齐：

- Brush
- Eraser
- Undo / Redo
- 当前 label 选择
- 仅编辑当前 lesion

推荐顺序：

1. Brush / Eraser
2. Undo / Redo
3. Label 切换
4. Freehand 或轮廓编辑

### 3.3 缺口三：没有可编辑的 segmentation 数据模型

当前系统以 `report.xlsx` 作为病灶列表来源，适合展示，不适合作为编辑主数据。

必须建立最小数据模型：

- `study`
- `series`
- `segmentation`
- `segmentLabel`
- `lesion`

每个 lesion 至少应绑定：

- `lesionId`
- `labelId`
- `displayName`
- `color`
- `source`
- `status`

### 3.4 缺口四：编辑结果没有持久化

如果医生修改后不能保存、重新打开、再次编辑，就不算支持 mask 编辑。

必须补齐：

- 本地保存 segmentation
- 重新加载 segmentation
- 覆盖保存或另存为修订版
- 提交医生修订版
- 恢复算法原始版

### 3.5 缺口五：后端没有最小工作流接口

即使前端能编辑，也需要最小的落地接口或本地文件读写协议。

必须补齐：

- 获取 study 的 segmentation 列表
- 加载指定 segmentation
- 保存 segmentation 草稿
- 提交 segmentation 修订版
- 查询历史版本

### 3.6 缺口六：没有临床可用的最小交互约束

没有工作流约束，医生无法明确自己在编辑什么，也无法确认是否已经保存。

必须补齐：

- 当前编辑对象显示
- 未保存修改提醒
- 原始结果与修订结果区分
- 编辑人、编辑时间记录
- 导出与报告使用哪一版 mask 的明确规则

## 4. 最短实现方案

目标是先完成一个“单机可用、单医生可编辑、可保存回放”的最小版本，不先做复杂的多用户协作。

### 4.1 阶段一：让算法 mask 可见

目标：

- 在图像页显示算法产出的初始 mask

建议做法：

- 先确认算法输出格式
- 若当前输出目录没有标准 segmentation 文件，先定义一版中间格式
- 首版允许只支持一种格式，不追求兼容全部算法输出

推荐首版中间格式：

```json
{
  "studyId": "xxx",
  "seriesId": "xxx",
  "dimensions": [x, y, z],
  "spacing": [sx, sy, sz],
  "labels": [
    {
      "labelId": 1,
      "name": "lesion-1",
      "color": [255, 0, 0],
      "voxelDataPath": "mask/label-1.bin"
    }
  ]
}
```

如果现有算法已经输出 DICOM SEG 或 NIfTI，则不要自定义，直接围绕该标准格式接入。

阶段一完成标准：

- 医生能在图像页看到算法初始 mask
- 能显隐
- 能切换透明度
- 能选择当前编辑 label

### 4.2 阶段二：补最小编辑能力

目标：

- 医生能对某个 label 进行局部修订

必须实现：

- Brush
- Eraser
- Undo
- Redo
- 当前切片编辑

建议限制：

- 首版只支持 2D slice 逐层编辑
- 不做 3D 球刷
- 不做自动分割
- 不做多人协作锁

这样可以显著缩短落地周期。

阶段二完成标准：

- 医生能在轴位或当前激活视口上修 mask
- 改动后 overlay 立即刷新
- 可撤销与重做

### 4.3 阶段三：补本地持久化

目标：

- 医生修改后的结果可以保存并再次打开

建议做法：

- 首版优先走 Electron 本地文件保存
- 服务端只做索引，不必先承担二进制大文件存储

推荐目录结构：

```text
output/
  <seriesId>/
    out/
    mask/
      original/
        segmentation.json
        label-1.bin
      draft/
        segmentation.json
        label-1.bin
      submitted/
        2026-05-28T18-30-00/
          segmentation.json
          label-1.bin
```

保存策略：

- `original/` 只读
- `draft/` 可反复覆盖
- `submitted/` 保留历史快照

阶段三完成标准：

- 可保存草稿
- 可重新打开草稿
- 可恢复原始版

### 4.4 阶段四：补最小后端接口

目标：

- 用最少接口支撑前端加载、保存和提交

建议接口：

```text
GET  /study/:seriesId/segmentations
GET  /study/:seriesId/segmentations/:version
POST /study/:seriesId/segmentations/draft
POST /study/:seriesId/segmentations/submit
POST /study/:seriesId/segmentations/reset
GET  /study/:seriesId/segmentations/history
```

建议返回字段：

- `seriesId`
- `version`
- `status`
- `editor`
- `updatedAt`
- `labels`
- `storagePath`

首版可以允许服务端只保存 metadata，mask 本体仍落本地文件。

### 4.5 阶段五：把病灶列表从“报表展示”升级为“编辑入口”

当前 `LesionTable` 更像算法结果表。

需要升级为：

- 当前 label 列表
- 选中某个 lesion 后高亮其 mask
- 支持“仅编辑当前 lesion”
- 显示该 lesion 是否已人工修改

推荐新增字段：

- `isEdited`
- `editedBy`
- `editedAt`
- `editStatus`

### 4.6 阶段六：补最小医生工作流

目标：

- 让编辑结果具备最基本的临床交付性

最小工作流：

1. 加载算法原始结果
2. 医生选择 lesion
3. 医生修订 mask
4. 保存草稿
5. 提交修订版
6. 报告导出明确引用提交版 segmentation

必须补的 UI 状态：

- 未保存修改提示
- 当前版本状态提示
- 提交前确认
- 提交后只读或重新开启编辑

## 5. 推荐技术路线

### 5.1 前端

优先复用现有 Cornerstone 工具链，不建议新起一套 canvas 标注系统。

原因：

- 当前项目图像显示已建立在 Cornerstone 上
- 继续沿这条链扩展成本最低
- 视口同步、切片定位、图像交互已经基本具备

首版不建议：

- 重新引入独立 WebGL 绘制层
- 自己手写体绘制引擎
- 同时支持多种 segmentation 标准

### 5.2 后端

后端首版不需要做复杂平台化。

建议路线：

- 第一阶段：Electron 本地文件保存 + 轻量 metadata
- 第二阶段：Node/Express 增加 segmentation 接口
- 第三阶段：再考虑医生账号、审核和远端同步

### 5.3 数据格式

优先级建议：

1. 直接复用算法现有标准输出
2. 若没有标准输出，定义一版本地中间格式
3. 等工作流跑通后再考虑统一成 DICOM SEG/NIfTI

## 6. 最小版本范围定义

为了避免需求膨胀，建议第一版范围严格限制为：

- 单机运行
- 单医生编辑
- 单 study / series
- 单视口逐层 brush 编辑
- 支持保存草稿与提交版本
- 支持报告引用最新提交版本

第一版不做：

- 多人协作
- 审核流
- 云端同步
- 自动分割交互优化
- 复杂 3D sculpt 编辑
- 全量历史对比可视化

## 7. 开发任务拆分

### 7.1 前端任务

- 增加 segmentation 数据加载模块
- 增加 mask overlay 渲染
- 增加 brush / eraser / undo / redo
- 增加当前 label 选择器
- 增加未保存状态管理
- 增加保存 / 提交 / 恢复按钮
- 升级 lesion 列表为编辑入口

### 7.2 后端任务

- 设计 segmentation metadata 结构
- 实现读取草稿与历史版本接口
- 实现保存草稿接口
- 实现提交版本接口
- 实现恢复原始版接口

### 7.3 本地文件任务

- 定义 segmentation 存储目录
- 定义 label 数据结构
- 定义版本命名规则
- 补异常恢复机制

### 7.4 验证任务

- 加载算法原始 mask
- 编辑后实时显示
- 保存后重新打开一致
- 提交后能区分版本
- 报告导出引用正确版本

## 8. 建议排期

如果只做最小落地版本，建议按下面节奏推进：

### 第 1 周

- 明确算法输出 mask 格式
- 完成 overlay 显示
- 完成 label 切换

### 第 2 周

- 完成 brush / eraser / undo / redo
- 完成本地草稿保存与重载

### 第 3 周

- 完成提交版与历史版机制
- 打通报告引用规则
- 完成基本验收

## 9. 验收标准

满足以下条件，才算“已经支持医生编辑 mask”：

- 医生能看到算法原始 mask
- 医生能对 mask 进行人工修订
- 修订结果能保存并重新打开
- 原始版和修订版可区分
- 报告或导出结果明确引用某一版 segmentation

如果仅仅做到“查看病灶列表 + 编辑报告文字”，仍不能算支持医生编辑 mask。

## 10. 推荐下一步

最优先的下一步不是继续写文档，而是先做一个技术探针：

1. 确认算法输出目录中是否已有可直接加载的 mask 文件
2. 若有，先把 overlay 显示做出来
3. 若没有，先定义首版 segmentation 中间格式
4. 再开始编辑工具接入

只有先完成“mask 可见”，后续医生编辑方案才有实际实现基础。
