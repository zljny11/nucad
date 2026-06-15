import React from "react";
import IMG from "./images/无标题.png";

const data2 = [
  {
    dataName: "包膜突破",
    data: "无",
  },
  {
    dataName: "精囊腺侵犯",
    data: "无（精囊腺根部见低密度囊性灶 9mm*14mm）",
  },
  {
    dataName: "直肠侵犯",
    data: "无",
  },
  {
    dataName: "膀胱侵犯",
    data: "无",
  },
  {
    dataName: "淋巴结转移",
    data: "无",
  },
  {
    dataName: "骨转移",
    data: "无",
  },
  {
    dataName: "前列腺增生",
    data: "有",
  },
  {
    dataName: "增生部位",
    data: "移行带",
  },
  {
    dataName: "凸向膀胱",
    data: "否",
  },
];

const ImagePerformance: React.FC = () => {
  return (
    <div className="ImagePerformance">
      <div className="imgContainer">
        <img src={IMG} alt="IMG" />
      </div>
      <div className="dataContainer">
        <div className="data1">
          <div className="title">前列腺相关影像表现：</div>
          <div className="flexContainer row1">
            <div>前列腺大小（mm）：</div>
            <div>左右径</div>
            <div>46</div>
            <div>前后径</div>
            <div>36</div>
            <div>上下径</div>
            <div>40</div>
          </div>
          <div className="flexContainer row2">
            <div>前列腺病灶：</div>
            <div>有</div>
            <div>累及双侧叶</div>
            <div>恶性</div>
          </div>
          <div className="flexContainer row3">
            <div>双发</div>
            <div>病灶位置</div>
            <div>
              <div>③⑦（11）</div>
              <div>⑨</div>
            </div>
            <div>
              <div>病灶大小&nbsp;&nbsp;20mmX16mm</div>
              <div>病灶大小&nbsp;&nbsp;5mmX6mm</div>
            </div>
            <div>
              <div>SUVmax=40.1</div>
              <div>SUVmax=11.0</div>
            </div>
          </div>
        </div>

        <div className="data2">
          {data2.map((dataItem) => {
            const { dataName, data } = dataItem;
            return (
              <div className="flexContainer">
                <div className="dataName">{dataName}：</div>
                <div>{data}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ImagePerformance;
