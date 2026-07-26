import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/app.css'
import './styles/themes.css'
import { applyUiStyle, loadUiStyle } from './themes/uiStyles'

// restore the persisted UI style (and any custom CSS) before first paint
applyUiStyle(loadUiStyle())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
