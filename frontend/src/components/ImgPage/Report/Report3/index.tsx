import React from "react";
import Header from "../Header";
import PatientInfo from "../PatientInfo";
import Result from "./Result";
import ReportInfo from "./ReportInfo";
import Footer from "../Footer";
import "./index.less";

const Report3: React.FC = () => {
  return (
    <div className="Report3 ReportOne">
      <Header />
      <PatientInfo mode={"basic"} />
      <Result />
      <ReportInfo />
      <Footer />
    </div>
  );
};

export default Report3;
