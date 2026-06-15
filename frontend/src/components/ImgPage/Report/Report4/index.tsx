import React from "react";
import Header from "../Header";
import PatientInfo from "../PatientInfo";
import Comparisons from "./Comparisons";
import Footer from "../Footer";
import "./index.less";

const Report4: React.FC = () => {
  return (
    <div className="Report4 ReportOne">
      <Header />
      <PatientInfo mode={"basic"} />
      <Comparisons />
      <Footer />
    </div>
  );
};

export default Report4;
