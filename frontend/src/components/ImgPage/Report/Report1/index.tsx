import React from "react";
import Header from "../Header";
import PatientInfo from "../PatientInfo";
import MedicalHistory from "./MedicalHistory";
import ClinicalDiagnosis from "./ClinicalDiagnosis";
import Footer from "../Footer";
import { getDefaultText1 } from "../functions/getDefaultText";
import "./index.less";

const clinicalDiagnosis = [
  "PSMA",
  "69kg",
  "7.11mCi",
  "无",
  "15: 18: 00",
  "全身PET/CT检查",
  "3D",
  "6",
  "2mins",
  "右手",
];

const Report1: React.FC = () => {
  const text1 = getDefaultText1();

  return (
    <div className="Report1 ReportOne">
      <Header />
      <div className="reportText">检查报告单</div>
      <PatientInfo mode={"detail"} />
      <MedicalHistory text1={text1} />
      <ClinicalDiagnosis clinicalDiagnosis={clinicalDiagnosis} />
      <Footer />
    </div>
  );
};

export default Report1;
