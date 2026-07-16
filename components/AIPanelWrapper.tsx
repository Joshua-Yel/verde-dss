"use client"
import React, { useEffect, useRef } from 'react'
import AIPanel from './AIPanel'
import { useUI } from './UIContext'

export default function AIPanelWrapper() {
  const { aiOpen, setAIOpen } = useUI()
  const panelRef = useRef<HTMLDivElement>(null)

  // Close panel on click outside
  useEffect(() => {
    if (!aiOpen) return

    function handleClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setAIOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [aiOpen, setAIOpen])

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`fixed inset-0 bg-black/50 z-30 transition-opacity md:hidden ${
          aiOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setAIOpen(false)}
      />

      <div ref={panelRef} className={`fixed top-0 right-0 h-full z-40 w-80 max-w-[90vw] bg-card border-l shadow-2xl transform transition-transform duration-300 ${aiOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <AIPanel />
      </div>
    </>
  )
}
