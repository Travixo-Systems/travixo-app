'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface ViewQRModalProps {
  isOpen: boolean
  onClose: () => void
  asset: {
    id: string
    name: string
    qr_code: string
  }
}

export default function ViewQRModal({ isOpen, onClose, asset }: ViewQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { language } = useLanguage()
  const t = createTranslator(language)

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const fullUrl = `${window.location.origin}/scan/${asset.qr_code}`
      QRCode.toCanvas(canvasRef.current, fullUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
    }
  }, [isOpen, asset.qr_code])

  const downloadQR = () => {
    if (!canvasRef.current) return
    
    const url = canvasRef.current.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `QR-${asset.name.replace(/\s+/g, '-')}.png`
    link.href = url
    link.click()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl p-6 transition-all" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {t('assets.qrCodeTitle')}
                  </Dialog.Title>
                  <button onClick={onClose} className="transition-colors" style={{ color: 'var(--text-muted, #777)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="text-center">
                  <h3 className="text-[15px] font-semibold mb-4" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {asset.name}
                  </h3>

                  <div className="flex justify-center mb-4">
                    <canvas ref={canvasRef} className="border-4 rounded-lg" style={{ borderColor: '#dcdee3' }} />
                  </div>

                  <p className="text-[14px] mb-4" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('assets.qrScanInstruction')}
                  </p>

                  <button
                    onClick={downloadQR}
                    className="inline-flex items-center px-4 py-2 text-[15px] font-medium rounded-md text-white hover:opacity-90" style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                  >
                    <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                    {t('assets.qrDownload')}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}