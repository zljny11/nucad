import React, { useState } from "react";
import ReactQuill from "react-quill";

const result =
  "前列腺癌：T2cNOMO（病灶位于前列腺体部右侧外周带及左侧移行带，未见周围其他结构侵犯及转移征象，未见明显淋巴结转移，未见明显骨转移）；前列腺增生伴微钙化，精囊腺囊肿。<br/>" +
  "其他：<br/>" +
  "1. 左侧基底节区腔梗灶<br/>" +
  "2. 右上肺多发小结节（部分为陈旧灶），请 HRCT 随诊；右下肺大疱<br/>" +
  "3. 右肾囊肿<br/>" +
  "4. 脊柱退行性变<br/>";

const Result: React.FC = () => {
  const [content, setContent] = useState(result);

  return (
    <div className="Result">
      <div className="title">诊断意见：</div>
      <ReactQuill
        className="text"
        theme="bubble"
        value={content}
        onChange={(value) => setContent(value)}
      />
    </div>
  );
};

export default Result;
