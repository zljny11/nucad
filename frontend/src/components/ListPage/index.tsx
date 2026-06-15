import React from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "../../redux/hooks";
import { setSearchName } from "../../redux/ListPageSlice";
import ListBody from "./ListBody";
import logo from "../../images/logonamegrey.png";
import "./index.less";

const ListPage: React.FC = () => {
  const navigate = useNavigate();
  const searchName = useAppSelector((state) => state.ListPage.searchName);
  const dispatch = useAppDispatch();

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  };

  return (
    <div className="ListPage clearfix">
      <div className="ListPageHeader clearfix">
        <img src={logo} alt="logo" className="logo" />

        <div className="searchBar">
          <form>
            <input
              type="text"
              placeholder="在此搜索患者信息..."
              value={searchName}
              onChange={(e) => dispatch(setSearchName(e.target.value))}
              onKeyPress={handleKeyPress}
            />
            <div className="searchBtn">
              <div className="NewIconfont">&#xe8b9;</div>
            </div>
          </form>
        </div>

        <div onClick={() => navigate("/")} className="backButton">
          <div className="NewIconfont"> &#xe8a4; 返回 </div>
        </div>
      </div>

      <ListBody />
    </div>
  );
};

export default ListPage;
