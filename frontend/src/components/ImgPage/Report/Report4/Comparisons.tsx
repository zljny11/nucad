import React, { useState } from "react";
import ReactQuill from "react-quill";

const comparisons =
  "与其他影像学检查结果比较：<br/>" +
  "前列腺 mpMR：2023-08-17 我院 MRI：前列腺癌，左侧移行带尖部，PI-RADS 5分<br/>" +
  "全身类 PET： 无<br/>" +
  "BS（骨扫描）：无<br/>" +
  "FDG PET： 无<br/>" +
  "Choline PET： 无<br/>" +
  "FACBC PET： 无<br/>" +
  "NaF PET： 无<br/>" +
  "其他： 无<br/>" +
  "<br/>" +
  "其他有意义的影像学发现：<br/>" +
  "<br/>" +
  "头颈部：左侧基底节区小片状低密度灶。<br/>" +
  "胸部：双肺纹理增多，右肺尖后段胸膜下多发实性小结节灶，PSMA摄取不高，较大者直径约5mm。右下肺背段囊性透亮影。<br/>" +
  "腹盆腔：右肾下极类圆形囊性低密度灶，直径约21mm，PSMA摄取不高。<br/>" +
  "骨骼及软组织：脊柱各锥体。";

const Comparisons: React.FC = () => {
  const [content, setContent] = useState(comparisons);

  return (
    <div className="Comparisons">
      <ReactQuill
        className="text"
        theme="bubble"
        value={content}
        onChange={(value) => setContent(value)}
      />
    </div>
  );
};

export default Comparisons;
