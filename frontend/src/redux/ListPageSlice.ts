import { createSlice } from "@reduxjs/toolkit";

interface ListPageState {
  curPage: number;
  searchName: string;
}

const initialState: ListPageState = {
  curPage: 1,
  searchName: "",
};

export const ListPageSlice = createSlice({
  name: "ListPage",
  initialState,
  reducers: {
    prePage: (state) => {
      const { curPage } = state;
      if (curPage > 1) {
        --state.curPage;
      }
    },
    nextPage: (state, action) => {
      const { curPage } = state;
      const totalPage = action.payload;
      if (curPage < totalPage) {
        ++state.curPage;
      }
    },
    toFirstPage: (state) => {
      const { curPage } = state;
      if (curPage > 1) {
        state.curPage = 1;
      }
    },
    toLastPage: (state, action) => {
      const { curPage } = state;
      const totalPage = action.payload;
      if (curPage < totalPage) {
        state.curPage = totalPage;
      }
    },
    setSearchName: (state, action) => {
      state.searchName = action.payload;
      state.curPage = 1
    },
  },
});

export const { prePage, nextPage, toFirstPage, toLastPage, setSearchName } =
  ListPageSlice.actions;

export default ListPageSlice.reducer;
