import React, { useState } from "react";
import { useAppSelector } from "../../../redux/hooks";
import { Input } from "antd";

const { TextArea } = Input;

interface PatientInfoProps {
  mode: string;
}

const PatientInfo: React.FC<PatientInfoProps> = (props) => {
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const { pname, sex, birthday, seriesId, scanTime, modifiedTime } =
    patientInfo;
  const { mode } = props;
  const [TextAreaMarginTop, setTextAreaMarginTop] = useState(23);

  const getAge = (birthday: string) => {
    const birthDayTime = new Date(birthday).getTime();
    const nowTime = new Date().getTime();
    return Math.ceil((nowTime - birthDayTime) / 31536000000);
  };

  const TextAreaOnResize = ({ width, height }) => {
    if (height >= 52) {
      setTextAreaMarginTop(12);
    } else {
      setTextAreaMarginTop(23);
    }
  };

  return (
    <div className="patientInfo">
      <div className="row">
        <div>姓名:</div>
        <Input type="text" bordered={false} defaultValue={pname} />
        <div>性别:</div>
        <Input type="text" bordered={false} defaultValue={sex} />
        <div>年龄:</div>
        <Input type="text" bordered={false} defaultValue={getAge(birthday)} />
        <div>检查号:</div>
        <Input type="text" bordered={false} defaultValue={seriesId} />
      </div>

      {mode === "detail" ? (
        <div className="row">
          <div>申请科室:</div>
          <TextArea
            autoSize={{ minRows: 1, maxRows: 2 }}
            bordered={false}
            onResize={TextAreaOnResize}
            style={{ marginTop: TextAreaMarginTop }}
          />
          <div>住院号:</div>
          <Input type="text" bordered={false} />
          <div>门诊号:</div>
          <Input type="text" bordered={false} />
          <div>检查日期:</div>
          <Input type="text" bordered={false} defaultValue={scanTime} />
        </div>
      ) : null}
    </div>
  );
};

export default PatientInfo;
