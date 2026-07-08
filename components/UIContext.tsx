"use client"
import React, { createContext, useContext, useState } from 'react'

type UIState = {
  aiOpen: boolean
  setAIOpen: (v: boolean) => void
  toggleAI: () => void
  importOpen: boolean
  setImportOpen: (v: boolean) => void
}

const UIContext = createContext<UIState | null>(null)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [aiOpen, setAIOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const toggleAI = () => setAIOpen(v => !v)
  return <UIContext.Provider value={{ aiOpen, setAIOpen, toggleAI, importOpen, setImportOpen }}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used within UIProvider')
  return ctx
}

export default UIContext
