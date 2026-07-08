"use client"
import React from 'react'
import { useUI } from './UIContext'
import UploadExcel from './UploadExcel'

export default function ImportModal() {
  const { importOpen, setImportOpen } = useUI()
  if (!importOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setImportOpen(false)}
      />

      <div className="relative w-[720px] max-w-full p-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold text-lg">Import Data</div>
            <button
              onClick={() => setImportOpen(false)}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Close
            </button>
          </div>

          <UploadExcel />
        </div>
      </div>
    </div>
  )
}