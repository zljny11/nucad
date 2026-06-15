import { Route, Routes } from 'react-router-dom'
import store from './redux/store'
import { Provider } from 'react-redux'
import Home from './components/Home'
import ListPage from './components/ListPage'
import LicensePage from './components/LicensePage'
import ImgPage from './components/ImgPage'
import './Newincon/iconfont.css'
import './App.css'

export default function App() {
  return (
    <Provider store={store}>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ListPage" element={<ListPage />} />
          <Route path="/LicensePage" element={<LicensePage />} />
          <Route path="/ImgPage" element={<ImgPage />} />
        </Routes>
      </div>
    </Provider>
  )
}
