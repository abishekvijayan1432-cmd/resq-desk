import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Modal } from './ui'

const NUMBER_KEY = 'resq-desk.sos-number'

function readNumber() {
  try {
    return window.localStorage.getItem(NUMBER_KEY) || '112'
  } catch {
    return '112'
  }
}

export default function SOSSheet({ onClose }) {
  const [number, setNumber] = useState(readNumber)
  const [coords, setCoords] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [locationState, setLocationState] = useState('idle')
  const [locationNote, setLocationNote] = useState('')
  const [handsFree, setHandsFree] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const audioUrlRef = useRef(null)
  const wakeLockRef = useRef(null)

  const message = useMemo(() => {
    if (coords) {
      return `I need emergency help. My location is latitude ${coords.lat.toFixed(5)}, longitude ${coords.lng.toFixed(5)}. Please send rescue.`
    }
    return 'I need emergency help. I cannot share my GPS location. Please trace this call.'
  }, [coords])

  const mapsLink = coords
    ? `https://maps.google.com/?q=${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`
    : ''

  function speak(text = message) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setNotice('This browser cannot speak the message. Show the screen or copy the text instead.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.92
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocationState('error')
      setLocationNote('GPS is not available in this browser.')
      return
    }
    setLocationState('locating')
    setLocationNote('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        })
        setAccuracy(Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null)
        setLocationState('ready')
      },
      () => {
        setLocationState('error')
        setLocationNote('Location was blocked. Enable GPS permission, or read your landmarks aloud.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    )
  }

  useEffect(() => {
    locate()
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockRef.current = lock
        })
        .catch(() => {})
    }
    return () => {
      window.speechSynthesis?.cancel()
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      wakeLockRef.current?.release?.().catch?.(() => {})
    }
  }, [])

  // Hands-free voice loop: repeats the location message while the sheet is open.
  useEffect(() => {
    if (!handsFree) {
      window.speechSynthesis?.cancel()
      setIsSpeaking(false)
      return undefined
    }
    speak(message)
    const interval = setInterval(() => speak(message), 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree, message])

  function updateNumber(value) {
    const cleaned = value.replace(/[^\d+]/g, '').slice(0, 10)
    setNumber(cleaned)
    try {
      window.localStorage.setItem(NUMBER_KEY, cleaned || '112')
    } catch {
      /* storage unavailable */
    }
  }

  async function copySOS() {
    const text = `${message}${mapsLink ? `\n${mapsLink}` : ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setNotice('SOS text and coordinates copied.')
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setNotice('Copy failed. Select the message text manually.')
    }
  }

  async function shareSOS() {
    if (!navigator.share) {
      copySOS()
      return
    }
    try {
      await navigator.share({ title: 'ResQ Desk SOS', text: `${message}${mapsLink ? `\n${mapsLink}` : ''}` })
    } catch {
      /* user cancelled */
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Voice recording is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
        const url = URL.createObjectURL(blob)
        audioUrlRef.current = url
        setAudioUrl(url)
        setRecording(false)
        setNotice('Voice note recorded on this device.')
        if (recordTimerRef.current) clearTimeout(recordTimerRef.current)
      }
      recorder.start()
      setRecording(true)
      setNotice('Recording… speak clearly, then press Stop.')
      recordTimerRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, 30000)
    } catch {
      setNotice('Microphone permission was denied. Allow it in your browser settings.')
      setRecording(false)
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }

  async function shareRecording() {
    if (!audioUrl) return
    try {
      const blob = await fetch(audioUrl).then((response) => response.blob())
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `resq-sos-${Date.now()}.${extension}`, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'ResQ Desk voice SOS',
          text: `${message}${mapsLink ? `\n${mapsLink}` : ''}`,
          files: [file],
        })
      } else {
        setNotice('Audio sharing is not supported here. Use the download link instead.')
      }
    } catch {
      setNotice('Could not share the recording. Use the download link instead.')
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Emergency SOS toolkit">
      <div className="sm:max-w-2xl">
        <header className="pr-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl border border-red-400/40 bg-red-500/15 text-red-300">
              <Icon name="phone" className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-red-300 uppercase">
                Offline SOS toolkit
              </p>
              <h2 className="font-display text-xl font-bold text-white">Emergency SOS</h2>
            </div>
            <span className="chip ml-auto border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <Icon name="shield" className="size-3" />
              Works without signal
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Locate yourself, call for help and play a spoken message. This page cannot dispatch help
            by itself — press <strong>Call</strong> so your phone dials the emergency line.
          </p>
        </header>

        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/[0.08] p-4">
          <a
            href={`tel:${number || '112'}`}
            className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-red-600 px-4 py-3 font-display text-lg font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
          >
            <Icon name="phone" className="size-5" />
            Call {number || '112'} now
          </a>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a
              href={`sms:${number || '112'}?body=${encodeURIComponent(
                `${message}${mapsLink ? ` ${mapsLink}` : ''}`,
              )}`}
              className="btn-secondary !py-2 text-xs"
            >
              <Icon name="share" className="size-3.5" />
              Text location
            </a>
            <button type="button" className="btn-secondary !py-2 text-xs" onClick={shareSOS}>
              <Icon name="share" className="size-3.5" />
              Share SOS
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-red-200/80">
            A website cannot dial silently. Your phone will ask you to confirm the call.
          </p>
        </div>

        <section className="mt-4 rounded-xl border border-white/10 bg-navy-900/50 p-3.5" aria-labelledby="sos-location-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="mapPin" className="size-4 text-sky-300" />
              <h3 id="sos-location-title" className="font-display text-sm font-semibold text-white">
                Your location
              </h3>
            </div>
            <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" onClick={locate}>
              <Icon name="crosshair" className="size-3.5" />
              {locationState === 'locating' ? 'Locating…' : 'Refresh GPS'}
            </button>
          </div>

          <div aria-live="polite">
            {coords ? (
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="font-mono text-lg font-semibold tracking-tight text-white">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {accuracy != null ? `Accurate to about ${accuracy} m · ` : ''}
                    Captured on this device. No network needed.
                  </p>
                </div>
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost !px-2 !py-1 text-[11px]"
                >
                  Open map
                  <Icon name="arrowRight" className="size-3" />
                </a>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                {locationState === 'locating'
                  ? 'Reading GPS. This works without mobile data.'
                  : locationState === 'error'
                    ? locationNote || 'Location unavailable. Type landmarks in your call.'
                    : 'Location not captured yet.'}
              </p>
            )}
          </div>
        </section>

        <section className="mt-3 rounded-xl border border-white/10 bg-navy-900/50 p-3.5" aria-labelledby="sos-voice-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="volume" className="size-4 text-violet-300" />
              <h3 id="sos-voice-title" className="font-display text-sm font-semibold text-white">
                Spoken rescue message
              </h3>
            </div>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                handsFree
                  ? 'border-red-400/40 bg-red-500/15 text-red-200'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
              onClick={() => setHandsFree((value) => !value)}
              aria-pressed={handsFree}
            >
              <span className={`size-1.5 rounded-full ${handsFree ? 'live-dot bg-red-400' : 'bg-slate-500'}`} />
              {handsFree ? 'Hands-free on' : 'Hands-free loop'}
            </button>
          </div>

          <blockquote className="mt-2 rounded-lg border-l-2 border-violet-400/50 bg-white/[0.04] px-3 py-2 text-sm leading-relaxed text-slate-200">
            “{message}”
          </blockquote>

          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => speak()}>
              <Icon name={isSpeaking ? 'stop' : 'volume'} className="size-3.5" />
              {isSpeaking ? 'Speaking…' : 'Speak now'}
            </button>
            {!recording ? (
              <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={startRecording}>
                <Icon name="mic" className="size-3.5" />
                Record voice note
              </button>
            ) : (
              <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" onClick={stopRecording}>
                <Icon name="stop" className="size-3.5" />
                Stop recording
              </button>
            )}
          </div>

          {audioUrl && (
            <div className="mt-2 rounded-lg border border-white/10 bg-navy-950/50 p-2.5">
              <audio controls src={audioUrl} className="w-full" />
              <div className="mt-1.5 flex flex-wrap gap-2">
                <a href={audioUrl} download="resq-sos-voice.webm" className="btn-ghost !px-2 !py-1 text-[11px]">
                  <Icon name="download" className="size-3" />
                  Download note
                </a>
                <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" onClick={shareRecording}>
                  <Icon name="share" className="size-3" />
                  Share note
                </button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Hands-free repeats the message every 20 seconds while this screen stays open. Increase
            your phone volume first. The recording never leaves this device unless you share it.
          </p>
        </section>

        {notice && (
          <p role="status" className="mt-3 rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-xs text-sky-200">
            {notice}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={copySOS}>
            <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
            {copied ? 'Copied' : 'Copy SOS + GPS'}
          </button>
          <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
            Advanced &amp; device setup
          </summary>
          <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-400">
            <p>
              <strong className="text-slate-200">Install for field use:</strong> in Chrome or Safari,
              choose “Add to Home Screen”. It opens full-screen and works with no signal.
            </p>
            <p>
              <strong className="text-slate-200">Permissions:</strong> allow Location and Microphone.
              GPS works offline; the microphone is only used when you record.
            </p>
            <p>
              <strong className="text-slate-200">Browser limits:</strong> Android and iOS block
              websites from calling or texting silently. This sheet prepares the call, message and
              speaker output; you must confirm the call.
            </p>
            <label htmlFor="sos-number" className="block pt-1 text-slate-300">
              Emergency number (saved on this device)
            </label>
            <input
              id="sos-number"
              value={number}
              onChange={(event) => updateNumber(event.target.value)}
              inputMode="tel"
              className="field-input max-w-40 font-mono"
            />
          </div>
        </details>

        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          ResQ Desk is a coordination demo. For a life-threatening emergency, contact your local
          emergency service directly. Location and recordings stay in this browser.
        </p>
      </div>
    </Modal>
  )
}
