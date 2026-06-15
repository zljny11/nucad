import React from "react";
import PET from "../images/PET.png";
import PETCT from "../images/PET-CT.png";

const infoName = [
  {
    infoName1: "注射药物：",
    infoName2: "体重：",
  },
  {
    infoName1: "注射剂量：",
    infoName2: "检查前准备：",
  },
  {
    infoName1: "注射时间：",
    infoName2: "检查部位：",
  },
  {
    infoName1: "PET显像方式：",
    infoName2: "床位数：",
  },
  {
    infoName1: "发射扫描时间/床位：",
    infoName2: "注射部位：",
  },
];

interface ClinicalDiagnosisProps {
  clinicalDiagnosis: string[];
}

const ClinicalDiagnosis: React.FC<ClinicalDiagnosisProps> = (props) => {
  const { clinicalDiagnosis } = props;

  return (
    <div className="ClinicalDiagnosis">
      <div className="title">临床诊断：{"前列腺癌"}</div>
      <div className="title2">检查技术：</div>
      <div className="content">
        {infoName.map((infoName, index) => {
          const { infoName1, infoName2 } = infoName;
          return (
            <div className="row">
              <div className="infoName">{infoName1}</div>
              <div>{clinicalDiagnosis[2 * index]}</div>
              <div className="infoName">{infoName2}</div>
              <div>{clinicalDiagnosis[2 * index + 1]}</div>
            </div>
          );
        })}
      </div>
      <div className="imgContainer">
        <img src={PET} alt="PET" />
        <img src={PETCT} alt="PET-CT" />
      </div>
    </div>
  );
};

export default ClinicalDiagnosis;
