import React from "react";
import ChanghaiLogo from "./images/长海logo.png";
import "./index.less";

const Header: React.FC = () => {
  return (
    <div className="Header">
      <div className="flexContainer">
        <div className="imgContainer">
          <img src={ChanghaiLogo} alt="ChanghaiLogo" />
        </div>
        <div className="textContainer">
          <div>长 海 医 院 P E T - C T 中 心</div>
          <div>Changhai Hospital PET-CT Center</div>
        </div>
      </div>
    </div>
  );
};

export default Header;
