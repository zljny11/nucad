import React from "react";
import { Input } from "antd";

const ReportInfo: React.FC = () => {
  return (
    <div className="ReportInfo">
      <div className="dataName">报告医师：</div>
      <Input type="text" bordered={false} defaultValue={"xxx"} />
      <div className="dataName">审核医生：</div>
      <Input type="text" bordered={false} defaultValue={"xxx"} />
      <div className="dataName">报告日期：</div>
      <Input
        type="text"
        bordered={false}
        defaultValue={"xxxx-xx-xx xx:xx:xx"}
      />
    </div>
  );
};

export default ReportInfo;
