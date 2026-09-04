import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { installChunkRecovery } from '@/lib/chunkRecovery'
import { captureAuthReturnLocation } from '@/lib/authReturn'

installChunkRecovery()
captureAuthReturnLocation()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
