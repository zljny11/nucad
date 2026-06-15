import React from "react";
import Header from "../Header";
import PatientInfo from "../PatientInfo";
import ImagePerformance from "./ImagePerformance";
import Footer from "../Footer";
import "./index.less";

const Report2: React.FC = () => {
  return (
    <div className="Report2 ReportOne">
      <Header />
      <PatientInfo mode={"basic"} />
      <ImagePerformance />
      <Footer />
    </div>
  );
};

export default Report2;
