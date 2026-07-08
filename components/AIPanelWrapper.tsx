"use client"
import React from 'react'
import AIPanel from './AIPanel'
import { useUI } from './UIContext'

export default function AIPanelWrapper() {
  const { aiOpen } = useUI()
  if (!aiOpen) return null
  return <AIPanel />
}
