import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { installChunkRecovery } from '@/lib/chunkRecovery'
import { captureAuthRedirectResult } from '@/lib/auth-redirect'

installChunkRecovery()
captureAuthRedirectResult()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
