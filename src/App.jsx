import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import userDataSheetUrl from '../SME_Data.xlsx?url'
import loginBackdropUrl from '../images/student-class.jpg'
import logoUrl from './assets/logo.svg'
import appBackdropUrl from './assets/dashboard-pattern.svg'

const FIELD_LABELS = {
  questionTa: 'கேள்வி',
  optionsTa: 'விருப்பங்கள்',
  glossary: 'Glossary',
  answerTa: 'பதில்',
  explanationTa: 'விளக்கம்',
}

const readFileAsArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target.result)
    reader.onerror = (error) => reject(error)
    reader.readAsArrayBuffer(file)
  })

const sanitizeKey = (key = '') => key.trim().replace(/\s+/g, ' ')

const toText = (value) =>
  typeof value === 'string'
    ? value.replace(/\r\n/g, '\n').trim()
    : value ?? ''

const toSafeString = (value) =>
  value === undefined || value === null ? '' : String(value).trim()

const parseUserRecords = (worksheet) => {
  if (!worksheet) return []

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  })

  if (rows.length === 0) return []

  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => {
      const value = toSafeString(cell).toLowerCase()
      return value === 'email' || value === 'email id'
    })
  )

  if (headerRowIndex === -1) return []

  const headers = rows[headerRowIndex].map((header) =>
    toSafeString(header).toLowerCase()
  )

  const findIndex = (candidates) =>
    headers.findIndex((header) =>
      candidates.some(
        (candidate) => header === toSafeString(candidate).toLowerCase()
      )
    )

  const columnIndex = {
    name: findIndex(['SME Name', 'Name']),
    email: findIndex(['Email', 'Email Id']),
    password: findIndex(['Password']),
  }

  if (columnIndex.email === -1 || columnIndex.password === -1) return []

  return rows.slice(headerRowIndex + 1).reduce((accumulator, row) => {
    const email = toSafeString(row[columnIndex.email])
    const password = toSafeString(row[columnIndex.password])

    if (!email || !password) return accumulator

    accumulator.push({
      email,
      password,
      name: toSafeString(row[columnIndex.name]) || email,
    })

    return accumulator
  }, [])
}

const THEME_STORAGE_KEY = 'neet-question-theme'

const resolveInitialTheme = () => {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

const initialTheme = resolveInitialTheme()

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', initialTheme === 'dark')
}

const TAMIL_MONTH_STARTS = [
  { name: 'சித்திரை', start: [4, 14] },
  { name: 'வைகாசி', start: [5, 15] },
  { name: 'ஆனி', start: [6, 15] },
  { name: 'ஆடி', start: [7, 17] },
  { name: 'ஆவணி', start: [8, 17] },
  { name: 'புரட்டாசி', start: [9, 17] },
  { name: 'ஐப்பசி', start: [10, 17] },
  { name: 'கார்த்திகை', start: [11, 16] },
  { name: 'மார்கழி', start: [12, 16] },
  { name: 'தை', start: [1, 14] },
  { name: 'மாசி', start: [2, 13] },
  { name: 'பங்குனி', start: [3, 15] },
]

const getTamilCalendarLabel = (input) => {
  const moment = dayjs(input)
  if (!moment.isValid()) {
    return '—'
  }

  const candidates = TAMIL_MONTH_STARTS.flatMap((entry) => {
    const [month, day] = entry.start
    return [
      { ...entry, start: dayjs(new Date(moment.year(), month - 1, day)) },
      { ...entry, start: dayjs(new Date(moment.year() - 1, month - 1, day)) },
      { ...entry, start: dayjs(new Date(moment.year() + 1, month - 1, day)) },
    ]
  }).sort((a, b) => a.start.valueOf() - b.start.valueOf())

  let active = candidates[0]
  for (const candidate of candidates) {
    if (candidate.start.isSame(moment) || candidate.start.isBefore(moment)) {
      active = candidate
    } else {
      break
    }
  }

  const tamilDay = Math.max(1, moment.diff(active.start, 'day') + 1)
  return `${active.name} - ${tamilDay}`
}

const pickValue = (record, variants) => {
  for (const key of variants) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() !== '') {
        return toText(value)
      }
      if (typeof value === 'number') {
        return value.toString()
      }
    }
  }
  return ''
}

const splitOptions = (value) =>
  toText(value)
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)

const normalizeRow = (row) => {
  const normalised = Object.entries(row).reduce((acc, [key, value]) => {
    acc[sanitizeKey(key)] = value
    return acc
  }, {})

  const tamilOptionsRaw = pickValue(normalised, ['விருப்பங்கள்', 'விருப்பங்கள்'])
  const englishOptionsRaw = pickValue(normalised, ['questionOptions'])

  return {
    id: pickValue(normalised, ['_id']) || '',
    questionTa: pickValue(normalised, ['கேள்வி']),
    questionEn: pickValue(normalised, ['question']),
    optionsTa: splitOptions(tamilOptionsRaw),
    optionsEn: splitOptions(englishOptionsRaw),
    answerTa: pickValue(normalised, ['பதில்']),
    answerEn: pickValue(normalised, ['answers']),
    explanationTa: pickValue(normalised, ['விளக்கம்']),
    explanationEn: pickValue(normalised, ['explanation']),
  }
}

const normalizeGlossaryRows = (rows) =>
  rows
    .map((row, index) => {
      const normalised = Object.entries(row).reduce((acc, [key, value]) => {
        acc[sanitizeKey(key)] = toText(value)
        return acc
      }, {})

      const values = Object.values(normalised).filter(Boolean)
      if (values.length === 0) return null

      return {
        term: values[0],
        description: values.slice(1).join(' — ') || '—',
        index,
      }
    })
    .filter(Boolean)

const STORAGE_PREFIX = 'neet-question-studio'

const mergeWithStoredRecords = (records, key) => {
  if (typeof window === 'undefined' || !key) return records

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return records

    const payload = JSON.parse(raw)
    if (!payload || !Array.isArray(payload.records)) return records

    const storedRecords = payload.records
    return records.map((record, index) => {
      const stored =
        storedRecords.find((item) => item.id && item.id === record.id) ??
        storedRecords[index]
      if (!stored) return record

      return {
        ...record,
        questionTa: stored.questionTa ?? record.questionTa,
        optionsTa: Array.isArray(stored.optionsTa)
          ? stored.optionsTa.map((item) => toText(item))
          : record.optionsTa,
        answerTa: stored.answerTa ?? record.answerTa,
        explanationTa: stored.explanationTa ?? record.explanationTa,
      }
    })
  } catch (error) {
    console.error('Failed to restore saved edits', error)
    return records
  }
}

const persistRecordsToStorage = (key, records) => {
  if (typeof window === 'undefined' || !key) return

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        updatedAt: dayjs().toISOString(),
        records,
      })
    )
  } catch (error) {
    console.error('Failed to save edits', error)
  }
}

const Field = ({ label, className = '', children }) => (
  <section className={`space-y-1.5 ${className}`}>
    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
      {label}
    </p>
    {children}
  </section>
)

const UploadButton = ({ id, label, onChange, accept }) => (
  <label
    htmlFor={id}
    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
  >
    <input
      id={id}
      type="file"
      accept={accept}
      onChange={onChange}
      className="hidden"
    />
    {label}
  </label>
)

const ThemeToggle = ({ theme, onToggle, className = '' }) => {
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-surface-raised/80 dark:text-slate-200 ${className}`}
      aria-pressed={isDark}
      aria-label={`Activate ${isDark ? 'light' : 'dark'} theme`}
    >
      <span className="relative flex h-5 w-10 items-center rounded-full bg-slate-300 transition group-hover:bg-slate-400 dark:bg-slate-600 dark:group-hover:bg-slate-500">
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-surface-raised ${
            isDark ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
      <span>{isDark ? 'Dark' : 'Light'} mode</span>
    </button>
  )
}

const LoginScreen = ({
  onLogin,
  error,
  isLoadingUsers,
  userDataError,
  theme,
  onToggleTheme,
}) => {
  const [formState, setFormState] = useState({
    email: '',
    password: '',
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    onLogin(formState)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 transition-colors dark:bg-surface-base">
      <div className="absolute inset-0">
        <img
          src={loginBackdropUrl}
          alt="Students collaborating in a classroom"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm transition-colors dark:bg-surface-base/80" />
      </div>

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className="relative z-10 flex w-full max-w-5xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-stretch">
        <section className="hidden flex-1 flex-col justify-between rounded-3xl border border-white/40 bg-white/75 p-10 text-slate-700 shadow-2xl backdrop-blur-lg dark:border-slate-800/70 dark:bg-surface-raised/70 dark:text-slate-200 lg:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
              NEET Question Studio
            </p>
            <h1 className="mt-6 text-3xl font-bold text-slate-900 dark:text-slate-100">
              Craft precise NEET question sets with ease.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Upload curated question sheets, refine bilingual responses, and
              collaborate with your fellow subject experts in one focused
              workspace.
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-800 dark:text-slate-200">
                Built for educators
              </dt>
              <dd className="mt-1 leading-relaxed">
                Iterate on questions and translations side by side with instant
                previews.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800 dark:text-slate-200">
                Secure access
              </dt>
              <dd className="mt-1 leading-relaxed">
                Sign in with the credentials provided in the SME roster.
              </dd>
            </div>
          </dl>
        </section>

        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-md space-y-7 rounded-3xl border border-slate-200 bg-white/85 p-10 text-slate-900 shadow-2xl backdrop-blur-lg transition-colors dark:border-slate-800 dark:bg-surface-raised/90 dark:text-slate-100"
        >
          <header className="space-y-3 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-accent">
              Welcome back
            </p>
            <h2 className="text-3xl font-bold">Sign in to continue</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Use the email and password shared with you in the SME data sheet.
            </p>
          </header>

          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Email</span>
              <input
                type="email"
                value={formState.email}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-700 dark:bg-surface-base/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                Password
              </span>
              <input
                type="password"
                value={formState.password}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-700 dark:bg-surface-base/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="••••••"
                autoComplete="current-password"
                required
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 transition dark:text-red-200 dark:bg-red-500/20">
              {error}
            </p>
          ) : (
            <div className="space-y-1 rounded-2xl border border-slate-300 bg-white/60 px-4 py-3 text-xs text-slate-500 transition dark:border-slate-700 dark:bg-surface-base/70 dark:text-slate-300">
              <p>Use the credentials shared in the SME data sheet.</p>
              {userDataError ? (
                <p className="text-red-500 dark:text-red-200">
                  {userDataError}
                </p>
              ) : isLoadingUsers ? (
                <p>Loading authorised user list…</p>
              ) : null}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-yellow-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70 dark:text-surface-base"
            disabled={isLoadingUsers}
          >
            {isLoadingUsers ? 'Please wait…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

const RecordNavigator = ({
  index,
  total,
  onNext,
  onPrev,
  disabled,
  showSave,
  onSave,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2.5">
    <p className="text-sm text-slate-600 dark:text-slate-400">
      {total > 0 ? `Record ${index + 1} of ${total}` : 'No records loaded'}
    </p>
    <div className="flex items-center gap-2">
      {showSave ? (
        <button
          type="button"
          onClick={onSave}
          className="rounded-full border border-accent/60 bg-accent px-3.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-yellow-500 dark:text-surface-base"
        >
          Save
        </button>
      ) : null}
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled || index === 0}
        className="rounded-full border border-slate-300 px-3.5 py-1.5 text-sm text-slate-600 transition enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled || index >= total - 1}
        className="rounded-full border border-slate-300 px-3.5 py-1.5 text-sm text-slate-600 transition enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
      >
        Next
      </button>
    </div>
  </div>
)

const OptionsGrid = ({ label, options, language, onChange }) => {
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [clipboardContent, setClipboardContent] = useState('')

  const handleFieldFocus = async (idx) => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText && clipboardText.trim()) {
        setClipboardContent(clipboardText.trim())
        setFocusedIndex(idx)
      }
    } catch (error) {
      console.log('Clipboard access not available')
    }
  }

  const handlePaste = (idx, currentValue) => {
    if (!clipboardContent) return

    // Extract option letter if present (A), B), C), D))
    const optionLetterMatch = currentValue.match(/^([A-D])[):]\s*/)

    if (optionLetterMatch) {
      // Keep the option letter and replace the rest
      const optionLetter = optionLetterMatch[0] // "A) " or "A: "
      const newValue = `${optionLetter}${clipboardContent}`
      onChange(idx, newValue)
    } else {
      // No option letter, just paste the text
      onChange(idx, clipboardContent)
    }

    setFocusedIndex(null)
    setClipboardContent('')
  }

  return (
    <Field label={label}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {options.map((option, idx) => (
          <div key={`${language}-${idx}`} className="relative">
            <textarea
              value={option}
              onChange={(event) => onChange(idx, event.target.value)}
              onFocus={() => handleFieldFocus(idx)}
              onBlur={() => setTimeout(() => setFocusedIndex(null), 200)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
            />
            {focusedIndex === idx && clipboardContent && (
              <button
                type="button"
                onClick={() => handlePaste(idx, option)}
                className="absolute right-2 top-2 rounded-md bg-accent px-3 py-1 text-xs font-semibold text-slate-900 shadow-md transition hover:bg-yellow-500"
              >
                Paste Here
              </button>
            )}
          </div>
        ))}
      </div>
    </Field>
  )
}

const GlossaryDrawer = ({ open, onClose, glossary }) => (
  <div
    className={`fixed inset-0 z-40 transition duration-300 ${
      open ? 'pointer-events-auto' : 'pointer-events-none'
    }`}
    aria-hidden={!open}
  >
    <button
      type="button"
      aria-label="Close glossary panel"
      onClick={onClose}
      tabIndex={open ? 0 : -1}
      className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${
        open ? 'opacity-100' : 'opacity-0'
      }`}
    />
    <aside
      className={`absolute left-0 top-0 flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-surface-raised ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Glossary
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {glossary.length} curated term{glossary.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-accent hover:text-accent dark:border-slate-600 dark:text-slate-300"
        >
          Close
        </button>
      </div>
      <div className="h-full overflow-y-auto px-6 py-5">
        {glossary.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No glossary terms available. Upload a glossary sheet to review its
            contents here.
          </p>
        ) : (
          <ul className="space-y-4">
            {glossary.map((entry) => (
              <li
                key={`${entry.term}-${entry.index}`}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-accent/60 dark:border-slate-700 dark:bg-surface-base"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {entry.term}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {entry.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  </div>
)

const GlossarySlider = ({ open, onClose, glossary, onAddGlossary }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTerm, setNewTerm] = useState({ english: '', tamil: '' })
  const [copiedIndex, setCopiedIndex] = useState(null)

  const filteredGlossary = useMemo(() => {
    if (!searchQuery.trim()) return glossary

    const query = searchQuery.toLowerCase().trim()
    const queryWords = query.split(/\s+/)

    return glossary.filter((entry) => {
      const searchText = `${entry.term} ${entry.description}`.toLowerCase()

      // Smart search: match if ANY word in the query appears in the entry
      return queryWords.some(word => searchText.includes(word))
    })
  }, [glossary, searchQuery])

  const handleAddGlossary = () => {
    if (!newTerm.english.trim() || !newTerm.tamil.trim()) return

    const newEntry = {
      term: newTerm.english.trim(),
      description: newTerm.tamil.trim(),
      index: glossary.length,
    }

    onAddGlossary(newEntry)
    setNewTerm({ english: '', tamil: '' })
    setShowAddForm(false)
  }

  const handleCopyTerm = (description, index) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(description).then(() => {
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 1500)
      })
    }
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
        open ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="relative bg-white shadow-2xl dark:bg-surface-raised">
        {/* Header with search and close */}
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Glossary"
                className="w-full rounded-full border border-slate-300 bg-white/80 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-700 dark:bg-surface-base/80 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/20"
            >
              <span className="text-lg leading-none">+</span>
              <span>Add Glossary</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:border-accent hover:text-accent dark:border-slate-600 dark:text-slate-300"
              aria-label="Close glossary slider"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Add Glossary Form */}
          {showAddForm && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-surface-base/60">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Add New Glossary Term
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newTerm.english}
                  onChange={(e) => setNewTerm({ ...newTerm, english: e.target.value })}
                  placeholder="English term"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-700 dark:bg-surface-base dark:text-slate-100"
                />
                <input
                  type="text"
                  value={newTerm.tamil}
                  onChange={(e) => setNewTerm({ ...newTerm, tamil: e.target.value })}
                  placeholder="Tamil meaning"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-700 dark:bg-surface-base dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddGlossary}
                    disabled={!newTerm.english.trim() || !newTerm.tamil.trim()}
                    className="flex-1 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false)
                      setNewTerm({ english: '', tamil: '' })
                    }}
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Glossary Pills */}
        <div className="max-h-64 overflow-y-auto px-6 py-5">
          {filteredGlossary.length === 0 ? (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {searchQuery ? 'No glossary terms match your search' : 'No glossary terms available'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {filteredGlossary.map((entry) => (
                <button
                  key={`${entry.term}-${entry.index}`}
                  type="button"
                  onClick={() => handleCopyTerm(entry.description, entry.index)}
                  className={`group relative inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-md transition hover:shadow-lg ${
                    copiedIndex === entry.index
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  title={`${entry.term} - ${entry.description}\nClick to copy Tamil text`}
                >
                  <span>{entry.term} - {entry.description}</span>
                  {copiedIndex === entry.index ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const InitialUploadScreen = ({ onExcelUpload, onGlossaryUpload }) => (
  <div className="flex h-full items-center justify-center">
    <div className="grid w-full max-w-4xl grid-cols-1 gap-6 px-6 md:grid-cols-2">
      {/* Question Sheet Upload Section */}
      <div className="flex flex-col justify-center rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center backdrop-blur dark:border-slate-700 dark:bg-slate-900/30">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
          <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Upload an Excel sheet to begin
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          The viewer will render each question, options, answers, and explanations in Tamil and English.
        </p>
        <label
          htmlFor="initial-excel-upload"
          className="mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-yellow-500"
        >
          <input
            id="initial-excel-upload"
            type="file"
            accept=".xlsx,.xls"
            onChange={onExcelUpload}
            className="hidden"
          />
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Question Sheet
        </label>
      </div>

      {/* Glossary Upload Section */}
      <div className="flex flex-col justify-center rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center backdrop-blur dark:border-slate-700 dark:bg-slate-900/30">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20">
          <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Upload Glossary File
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Add reference terms and definitions to assist with question creation and review.
        </p>
        <label
          htmlFor="initial-glossary-upload"
          className="mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-indigo-600/60 bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-700"
        >
          <input
            id="initial-glossary-upload"
            type="file"
            accept=".xlsx,.xls"
            onChange={onGlossaryUpload}
            className="hidden"
          />
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Glossary
        </label>
      </div>
    </div>
  </div>
)

const ChangesModal = ({ open, onClose, records, originalRecords, onNavigateToRecord }) => {
  if (!open) return null

  const handleRowClick = (rowNumber) => {
    onNavigateToRecord(rowNumber - 1) // Convert to 0-indexed
    onClose()
  }

  // Helper to normalize text for comparison
  const normalize = (text) => {
    if (!text) return ''
    // Remove trailing punctuation (dots, commas, etc.) and normalize
    return text.trim().toLowerCase().replace(/[.,:;!?]+$/g, '')
  }

  // Find similar records for a given field - search in BOTH current records AND original records
  const findSimilarRecords = (currentIndex, fieldName, value) => {
    if (!value) {
      console.log('findSimilarRecords: No value')
      return []
    }

    const normalized = normalize(value)
    const similarRows = []

    console.log('Searching for similar content:', {
      currentIndex,
      fieldName,
      normalized: normalized.substring(0, 50),
      totalRecords: records.length,
      totalOriginalRecords: originalRecords.length
    })

    // Search in current records (edited state)
    records.forEach((rec, idx) => {
      if (idx === currentIndex) return // Skip current record

      let fieldValue = ''
      if (fieldName === 'கேள்வி') fieldValue = rec.questionTa
      else if (fieldName === 'பதில்') fieldValue = rec.answerTa
      else if (fieldName === 'விளக்கம்') fieldValue = rec.explanationTa

      const normalizedField = normalize(fieldValue)

      if (normalizedField === normalized && !similarRows.includes(idx + 1)) {
        console.log('Found similar in current records at index', idx + 1)
        similarRows.push(idx + 1) // 1-indexed row number
      }
    })

    // Also search in original records to find duplicates that existed in Excel
    originalRecords.forEach((rec, idx) => {
      if (idx === currentIndex) return // Skip current record

      let fieldValue = ''
      if (fieldName === 'கேள்வி') fieldValue = rec.questionTa
      else if (fieldName === 'பதில்') fieldValue = rec.answerTa
      else if (fieldName === 'விளக்கம்') fieldValue = rec.explanationTa

      const normalizedField = normalize(fieldValue)

      if (normalizedField === normalized && !similarRows.includes(idx + 1)) {
        console.log('Found similar in original records at index', idx + 1)
        similarRows.push(idx + 1) // 1-indexed row number
      }
    })

    console.log('Found similar rows:', similarRows)
    return similarRows
  }

  // Find all modified records
  const modifiedRecords = records
    .map((record, index) => {
      const original = originalRecords[index]
      if (!original) return null

      // Check if any field has changed
      const hasChanges =
        normalize(record.questionTa) !== normalize(original.questionTa) ||
        normalize(record.answerTa) !== normalize(original.answerTa) ||
        normalize(record.explanationTa) !== normalize(original.explanationTa) ||
        record.optionsTa.some(
          (opt, idx) => normalize(opt) !== normalize(original.optionsTa?.[idx])
        )

      if (!hasChanges) return null

      return {
        record,
        original,
        rowNumber: index + 1, // 1-indexed row number
      }
    })
    .filter(Boolean)

  // Helper to render diff text
  const renderDiff = (current, original) => {
    const normCurrent = normalize(current)
    const normOriginal = normalize(original)

    if (normCurrent === normOriginal) {
      return <span>{current || '—'}</span>
    }

    return (
      <span>
        {original && (
          <span className="text-sm text-red-600 line-through dark:text-red-400">
            {original}
          </span>
        )}
        {' '}
        <span className="rounded bg-green-100 px-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          {current || '—'}
        </span>
      </span>
    )
  }

  // Helper to render option diff
  const renderOptionDiff = (currentOption, originalOption, optionLetter) => {
    const stripPrefix = (text) => {
      if (!text) return text
      return text.replace(/^[A-D][):]\s*/, '')
    }

    const cleanCurrent = stripPrefix(currentOption)
    const cleanOriginal = stripPrefix(originalOption)
    const hasChanged = normalize(cleanCurrent) !== normalize(cleanOriginal)

    if (!hasChanged) {
      return (
        <p className="text-sm">
          <span className="font-medium">{optionLetter})</span> {cleanCurrent || '—'}
        </p>
      )
    }

    return (
      <p className="text-sm">
        <span className="font-medium">{optionLetter})</span>{' '}
        {cleanOriginal && (
          <span className="text-sm text-red-600 line-through dark:text-red-400">
            {cleanOriginal}
          </span>
        )}
        {' '}
        <span className="rounded bg-green-100 px-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          {cleanCurrent || '—'}
        </span>
      </p>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="relative mx-4 flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-surface-raised">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              View Changes
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {modifiedRecords.length} record{modifiedRecords.length === 1 ? '' : 's'} modified
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:border-accent hover:text-accent dark:border-slate-600 dark:text-slate-300"
            aria-label="Close changes view"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {modifiedRecords.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-slate-500 dark:text-slate-400">
                No changes detected. All records match the original uploaded data.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {modifiedRecords.map(({ record, original, rowNumber }) => {
                // Find similar content for this record
                const currentIndex = rowNumber - 1 // Convert to 0-indexed

                console.log(`Checking Row ${rowNumber} for similar content`)

                const questionChanged = normalize(record.questionTa) !== normalize(original.questionTa)
                const similarInQuestion = questionChanged
                  ? findSimilarRecords(currentIndex, 'கேள்வி', record.questionTa)
                  : []

                const answerChanged = normalize(record.answerTa) !== normalize(original.answerTa)
                const similarInAnswer = answerChanged
                  ? findSimilarRecords(currentIndex, 'பதில்', record.answerTa)
                  : []

                const explanationChanged = normalize(record.explanationTa) !== normalize(original.explanationTa)
                const similarInExplanation = explanationChanged
                  ? findSimilarRecords(currentIndex, 'விளக்கம்', record.explanationTa)
                  : []

                const hasSimilar = similarInQuestion.length > 0 || similarInAnswer.length > 0 || similarInExplanation.length > 0

                console.log(`Row ${rowNumber} - Has similar:`, hasSimilar, {
                  questionChanged,
                  similarInQuestion,
                  answerChanged,
                  similarInAnswer,
                  explanationChanged,
                  similarInExplanation
                })

                return (
                  <div
                    key={rowNumber}
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/30"
                  >
                    <div className="mb-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRowClick(rowNumber)}
                          className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-slate-900 transition hover:bg-yellow-500 hover:shadow-md cursor-pointer"
                          title={`Go to Row #${rowNumber}`}
                        >
                          Row #{rowNumber}
                        </button>
                      </div>

                      {/* Similar content warning */}
                      {hasSimilar && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
                          <div className="flex items-start gap-2">
                            <svg className="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="flex-1 text-xs">
                              <p className="font-semibold text-orange-800 dark:text-orange-300 mb-1">
                                Similar content found!
                              </p>
                              {similarInQuestion.length > 0 && (
                                <div className="mb-1">
                                  <span className="font-medium text-orange-700 dark:text-orange-400">கேள்வி:</span>
                                  <span className="ml-1 text-orange-600 dark:text-orange-400">
                                    Row {similarInQuestion.join(', ')}
                                  </span>
                                </div>
                              )}
                              {similarInAnswer.length > 0 && (
                                <div className="mb-1">
                                  <span className="font-medium text-orange-700 dark:text-orange-400">பதில்:</span>
                                  <span className="ml-1 text-orange-600 dark:text-orange-400">
                                    Row {similarInAnswer.join(', ')}
                                  </span>
                                </div>
                              )}
                              {similarInExplanation.length > 0 && (
                                <div className="mb-1">
                                  <span className="font-medium text-orange-700 dark:text-orange-400">விளக்கம்:</span>
                                  <span className="ml-1 text-orange-600 dark:text-orange-400">
                                    Row {similarInExplanation.join(', ')}
                                  </span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  // Navigate to first similar record
                                  const firstSimilar = similarInQuestion[0] || similarInAnswer[0] || similarInExplanation[0]
                                  if (firstSimilar) {
                                    handleRowClick(firstSimilar)
                                  }
                                }}
                                className="mt-2 rounded-md bg-orange-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600"
                              >
                                Go to similar record
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 text-sm">
                    {/* Question */}
                    {normalize(record.questionTa) !== normalize(original.questionTa) && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          கேள்வி:{' '}
                        </span>
                        {renderDiff(record.questionTa, original.questionTa)}
                      </div>
                    )}

                    {/* Options */}
                    {record.optionsTa.some(
                      (opt, idx) => normalize(opt) !== normalize(original.optionsTa?.[idx])
                    ) && (
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
                          விருப்பங்கள்:
                        </p>
                        <div className="ml-4 space-y-1">
                          {['A', 'B', 'C', 'D'].map((letter, idx) => {
                            if (
                              normalize(record.optionsTa[idx]) !==
                              normalize(original.optionsTa?.[idx])
                            ) {
                              return (
                                <div key={letter}>
                                  {renderOptionDiff(
                                    record.optionsTa[idx],
                                    original.optionsTa?.[idx],
                                    letter
                                  )}
                                </div>
                              )
                            }
                            return null
                          })}
                        </div>
                      </div>
                    )}

                    {/* Answer */}
                    {normalize(record.answerTa) !== normalize(original.answerTa) && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          பதில்:{' '}
                        </span>
                        {renderDiff(record.answerTa, original.answerTa)}
                      </div>
                    )}

                    {/* Explanation */}
                    {normalize(record.explanationTa) !== normalize(original.explanationTa) && (
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          விளக்கம்:{' '}
                        </span>
                        {renderDiff(record.explanationTa, original.explanationTa)}
                      </div>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const SimilarContentModal = ({ open, onClose, onUpdate, similarRows, fieldName, newValue, currentRecordIndex }) => {
  if (!open) return null

  // Count how many similar records found
  const similarCount = similarRows.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-raised">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Similar Content Found!
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Found {similarCount} similar {similarCount === 1 ? 'record' : 'records'} in <span className="font-semibold text-slate-900 dark:text-slate-100">{fieldName}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {similarRows.map(rowNum => (
              <span
                key={rowNum}
                className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              >
                Row #{rowNum}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Similar content in field: {fieldName}
          </p>
          <p className="text-sm text-slate-900 dark:text-slate-100">
            {newValue.length > 100 ? newValue.substring(0, 100) + '...' : newValue}
          </p>
        </div>

        <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
          Do you want to update all similar records?
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onUpdate}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-yellow-500"
          >
            Yes, Update
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-300"
          >
            No, Skip
          </button>
        </div>
      </div>
    </div>
  )
}

const RecordPanel = ({
  record,
  index,
  total,
  onNext,
  onPrev,
  glossaryEntry,
  onUpdateRecord,
  showSave,
  onSave,
  originalRecord, // Original unedited record for comparison
  allRecords, // All records for similarity detection
  onBatchUpdate, // Handler for batch updates
  onNavigateToRecord, // Navigate to a specific record
}) => {
  const [showAnswerPaste, setShowAnswerPaste] = useState(false)
  const [answerClipboard, setAnswerClipboard] = useState('')
  const [similarityCheck, setSimilarityCheck] = useState(null)
  const [visitedSimilarRecords, setVisitedSimilarRecords] = useState([])

  if (!record) {
    return null
  }

  // Helper to normalize text for comparison
  const normalize = (text) => {
    if (!text) return ''
    // Remove trailing punctuation (dots, commas, etc.) and normalize
    return text.trim().toLowerCase().replace(/[.,:;!?]+$/g, '')
  }

  // Find similar content in other rows
  const findSimilarRows = (fieldName, value) => {
    if (!value || !allRecords) return []

    const normalized = normalize(value)
    const similarRows = []

    allRecords.forEach((rec, idx) => {
      if (idx === index) return // Skip current record

      let fieldValue = ''
      if (fieldName === 'கேள்வி') fieldValue = rec.questionTa
      else if (fieldName === 'பதில்') fieldValue = rec.answerTa
      else if (fieldName === 'விளக்கம்') fieldValue = rec.explanationTa
      else if (fieldName.startsWith('விருப்பங்கள்')) {
        // For options, check individual option
        const optionIndex = parseInt(fieldName.split('-')[1])
        fieldValue = rec.optionsTa[optionIndex]
      }

      if (normalize(fieldValue) === normalized) {
        similarRows.push(idx + 1) // 1-indexed row number
      }
    })

    return similarRows
  }

  // Handle similarity check and update
  const checkSimilarityAndUpdate = (fieldName, newValue, updateFn) => {
    const similarRows = findSimilarRows(fieldName, newValue)

    if (similarRows.length > 0) {
      setSimilarityCheck({
        fieldName,
        newValue,
        similarRows,
        updateFn
      })
    } else {
      updateFn()
    }
  }

  const handleBatchUpdateConfirm = () => {
    if (!similarityCheck) return

    const { fieldName, newValue, updateFn, similarRows } = similarityCheck

    // Update current record
    updateFn()

    // Update all similar records
    onBatchUpdate(similarRows, fieldName, newValue)

    // Navigate to the first similar record to show the update
    if (similarRows.length > 0) {
      const firstSimilarRow = similarRows[0]
      setVisitedSimilarRecords([...similarRows])
      onNavigateToRecord(firstSimilarRow - 1) // Convert to 0-indexed
    }

    // Close modal
    setSimilarityCheck(null)
  }

  const handleSimilarityModalClose = () => {
    if (!similarityCheck) return

    // Just update current record, skip others
    similarityCheck.updateFn()
    setSimilarityCheck(null)
  }

  const handleAnswerFocus = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText && clipboardText.trim()) {
        setAnswerClipboard(clipboardText.trim())
        setShowAnswerPaste(true)
      }
    } catch (error) {
      console.log('Clipboard access not available')
    }
  }

  const handleAnswerPaste = () => {
    if (!answerClipboard) return

    const currentValue = record.answerTa || ''
    const answerLetterMatch = currentValue.match(/^([A-D])[):]\s*/)

    if (answerLetterMatch) {
      const answerLetter = answerLetterMatch[0]
      const newValue = `${answerLetter}${answerClipboard}`
      onUpdateRecord({
        ...record,
        answerTa: newValue,
      })
    } else {
      onUpdateRecord({
        ...record,
        answerTa: answerClipboard,
      })
    }

    setShowAnswerPaste(false)
    setAnswerClipboard('')
  }

  // Helper to render option with diff
  const renderOptionDiff = (currentOption, originalOption, optionLetter) => {
    // Strip option letter prefix if present (e.g., "A) text" -> "text")
    const stripPrefix = (text) => {
      if (!text) return text
      // Remove patterns like "A) ", "B) ", "A: ", etc.
      return text.replace(/^[A-D][):]\s*/, '')
    }

    const normalize = (text) => {
      if (!text) return ''
      // Remove trailing punctuation (dots, commas, etc.) and normalize
      return text.trim().toLowerCase().replace(/[.,:;!?]+$/g, '')
    }

    const cleanCurrent = stripPrefix(currentOption)
    const cleanOriginal = stripPrefix(originalOption)

    // Compare normalized versions to handle case/spacing differences
    const hasChanged = normalize(cleanCurrent) !== normalize(cleanOriginal)

    if (!hasChanged) {
      return (
        <p>
          <span className="font-medium">{optionLetter})</span> {cleanCurrent || '—'}
        </p>
      )
    }

    return (
      <p>
        <span className="font-medium">{optionLetter})</span>{' '}
        {cleanOriginal && (
          <span className="text-sm text-red-600 line-through dark:text-red-400">
            {cleanOriginal}
          </span>
        )}
        {' '}
        <span className="rounded bg-green-100 px-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          {cleanCurrent || '—'}
        </span>
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-surface-raised dark:shadow-2xl dark:shadow-black/40">
      <SimilarContentModal
        open={!!similarityCheck}
        onClose={handleSimilarityModalClose}
        onUpdate={handleBatchUpdateConfirm}
        similarRows={similarityCheck?.similarRows || []}
        fieldName={similarityCheck?.fieldName || ''}
        newValue={similarityCheck?.newValue || ''}
        currentRecordIndex={index}
      />
      <RecordNavigator
        index={index}
        total={total}
        onNext={onNext}
        onPrev={onPrev}
        disabled={!record}
        showSave={showSave}
        onSave={onSave}
      />

      <div className="mt-4 flex-1 overflow-hidden">
        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-3">
          <Field label={FIELD_LABELS.questionTa}>
            <textarea
              value={record.questionTa}
              onChange={(event) =>
                onUpdateRecord({
                  ...record,
                  questionTa: event.target.value,
                })
              }
              onBlur={(event) => {
                const newValue = event.target.value
                if (newValue && newValue !== originalRecord?.questionTa) {
                  checkSimilarityAndUpdate('கேள்வி', newValue, () => {})
                }
              }}
              rows={2}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
            />
          </Field>

          <OptionsGrid
            label={FIELD_LABELS.optionsTa}
            options={record.optionsTa}
            language="ta"
            onChange={(optionIndex, value) => {
              const nextOptions = [...record.optionsTa]
              nextOptions[optionIndex] = value

              // Auto-update answer when option changes
              const optionLetters = ['A', 'B', 'C', 'D']
              const currentAnswerText = record.answerTa?.trim() || ''
              const currentAnswerLetter = currentAnswerText.charAt(0)
              const currentAnswerIndex = optionLetters.indexOf(currentAnswerLetter)

              let newAnswer = record.answerTa

              // If the changed option matches the current answer, update it
              if (currentAnswerIndex === optionIndex) {
                // Detect the separator: "A:" or "A)"
                let separator = ':'
                if (currentAnswerText.includes(')')) {
                  separator = ')'
                } else if (currentAnswerText.includes(':')) {
                  separator = ':'
                }

                // Strip option letter prefix from the new value (e.g., "A) text" -> "text")
                const cleanValue = value.replace(/^[A-D][):]\s*/, '')

                // IMPORTANT: Only use the clean text without prefix
                newAnswer = `${optionLetters[optionIndex]}${separator} ${cleanValue}`
              }

              onUpdateRecord({
                ...record,
                optionsTa: nextOptions,
                answerTa: newAnswer,
              })
            }}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={FIELD_LABELS.glossary}>
              <div className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 transition dark:border-slate-800 dark:bg-surface-base dark:text-slate-200">
                {glossaryEntry ? (
                  <div className="space-y-1 leading-relaxed">
                    <p className="font-semibold text-accent">
                      {glossaryEntry.term}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {glossaryEntry.description}
                    </p>
                  </div>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    Upload a glossary file to review terms alongside the
                    question.
                  </span>
                )}
              </div>
            </Field>
            <Field label={FIELD_LABELS.answerTa}>
              <div className="relative">
                <textarea
                  value={record.answerTa}
                  onChange={(event) =>
                    onUpdateRecord({
                      ...record,
                      answerTa: event.target.value,
                    })
                  }
                  onFocus={handleAnswerFocus}
                  onBlur={() => setTimeout(() => setShowAnswerPaste(false), 200)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
                />
                {showAnswerPaste && answerClipboard && (
                  <button
                    type="button"
                    onClick={handleAnswerPaste}
                    className="absolute right-2 top-2 rounded-md bg-accent px-3 py-1 text-xs font-semibold text-slate-900 shadow-md transition hover:bg-yellow-500"
                  >
                    Paste Here
                  </button>
                )}
              </div>
            </Field>
          </div>

          <Field label={FIELD_LABELS.explanationTa}>
            <textarea
              value={record.explanationTa}
              onChange={(event) =>
                onUpdateRecord({
                  ...record,
                  explanationTa: event.target.value,
                })
              }
              onBlur={(event) => {
                const newValue = event.target.value
                if (newValue && newValue !== originalRecord?.explanationTa) {
                  checkSimilarityAndUpdate('விளக்கம்', newValue, () => {})
                }
              }}
              rows={3}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
            />
          </Field>

          <div className="h-px w-full bg-slate-200 dark:bg-slate-800/60" />

          <section className="space-y-3">
            <Field label="தமிழ் (read-only snapshot)">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 transition dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <div>
                  <span className="font-medium">Question:</span>{' '}
                  {record.questionTa?.trim().toLowerCase() === originalRecord?.questionTa?.trim().toLowerCase() ? (
                    <span>{record.questionTa || '—'}</span>
                  ) : (
                    <span>
                      {originalRecord?.questionTa && (
                        <span className="text-red-600 line-through dark:text-red-400">
                          {originalRecord.questionTa}
                        </span>
                      )}
                      {' '}
                      <span className="rounded bg-green-100 px-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {record.questionTa || '—'}
                      </span>
                    </span>
                  )}
                </div>

                <div>
                  <p className="font-medium mb-2">Options:</p>
                  <div className="ml-4 space-y-2">
                    {['A', 'B', 'C', 'D'].map((letter, idx) =>
                      renderOptionDiff(
                        record.optionsTa[idx],
                        originalRecord?.optionsTa?.[idx],
                        letter
                      )
                    )}
                  </div>
                </div>

                <div>
                  <span className="font-medium">Answer:</span>{' '}
                  {record.answerTa?.trim().toLowerCase() === originalRecord?.answerTa?.trim().toLowerCase() ? (
                    <span>{record.answerTa || '—'}</span>
                  ) : (
                    <span>
                      {originalRecord?.answerTa && (
                        <span className="text-sm text-red-600 line-through dark:text-red-400">
                          {originalRecord.answerTa}
                        </span>
                      )}
                      {' '}
                      <span className="rounded bg-green-100 px-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {record.answerTa || '—'}
                      </span>
                    </span>
                  )}
                </div>

                <div>
                  <span className="font-medium">Explanation:</span>{' '}
                  {record.explanationTa?.trim().toLowerCase() === originalRecord?.explanationTa?.trim().toLowerCase() ? (
                    <span>{record.explanationTa || '—'}</span>
                  ) : (
                    <span>
                      {originalRecord?.explanationTa && (
                        <span className="text-red-600 line-through dark:text-red-400">
                          {originalRecord.explanationTa}
                        </span>
                      )}
                      {' '}
                      <span className="rounded bg-green-100 px-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {record.explanationTa || '—'}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </Field>
            <Field label="English (read-only)">
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 transition dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <p>
                  <span className="font-medium">Question:</span>{' '}
                  {record.questionEn || '—'}
                </p>
                <p>
                  <span className="font-medium">Options:</span>{' '}
                  {record.optionsEn.length > 0
                    ? record.optionsEn.join(' | ')
                    : '—'}
                </p>
                <p>
                  <span className="font-medium">Answer:</span>{' '}
                  {record.answerEn || '—'}
                </p>
                <p>
                  <span className="font-medium">Explanation:</span>{' '}
                  {record.explanationEn || '—'}
                </p>
              </div>
            </Field>
          </section>
        </div>
      </div>
    </div>
  )
}

function App() {
  // Restore session from localStorage
  const restoreSession = () => {
    try {
      const sessionData = window.localStorage.getItem('neet-session')
      if (sessionData) {
        return JSON.parse(sessionData)
      }
    } catch (error) {
      console.error('Failed to restore session', error)
    }
    return null
  }

  const savedSession = restoreSession()

  const [authError, setAuthError] = useState('')
  const [user, setUser] = useState(savedSession?.user || null)
  const [records, setRecords] = useState([])
  const [originalRecords, setOriginalRecords] = useState([]) // Store original data for comparison
  const [currentIndex, setCurrentIndex] = useState(savedSession?.currentIndex || 0)
  const [glossary, setGlossary] = useState([])
  const [excelMeta, setExcelMeta] = useState(savedSession?.excelMeta || null)
  const [glossaryMeta, setGlossaryMeta] = useState(savedSession?.glossaryMeta || null)
  const [storageKey, setStorageKey] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [users, setUsers] = useState([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [userDataError, setUserDataError] = useState('')
  const [isGlossaryPanelOpen, setGlossaryPanelOpen] = useState(false)
  const [isGlossarySliderOpen, setGlossarySliderOpen] = useState(false)
  const [isChangesModalOpen, setChangesModalOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [theme, setTheme] = useState(() => initialTheme)

  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Prevent data loss on page reload/close
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault()
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return event.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Persist login state and current record index
  useEffect(() => {
    if (user && excelMeta) {
      const sessionData = {
        user,
        currentIndex,
        excelMeta,
        glossaryMeta,
        storageKey,
      }
      window.localStorage.setItem('neet-session', JSON.stringify(sessionData))
    }
  }, [user, currentIndex, excelMeta, glossaryMeta, storageKey])

  // Restore records and glossary on session restore
  useEffect(() => {
    if (savedSession?.excelMeta && savedSession?.storageKey) {
      const key = savedSession.storageKey
      setStorageKey(key)

      // Try to restore records from localStorage
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          const payload = JSON.parse(raw)
          if (payload && Array.isArray(payload.records)) {
            setRecords(payload.records)
          }
        }
      } catch (error) {
        console.error('Failed to restore records', error)
      }

      // Try to restore original records
      try {
        const originalKey = key.replace(STORAGE_PREFIX, `${STORAGE_PREFIX}:original`)
        const originalRaw = window.localStorage.getItem(originalKey)
        if (originalRaw) {
          const originalData = JSON.parse(originalRaw)
          if (Array.isArray(originalData)) {
            setOriginalRecords(originalData)
          }
        }
      } catch (error) {
        console.error('Failed to restore original records', error)
      }
    }

    if (savedSession?.glossaryMeta) {
      // Try to restore glossary from localStorage
      const glossaryKey = `${STORAGE_PREFIX}:glossary:${savedSession.glossaryMeta.name}`
      try {
        const raw = window.localStorage.getItem(glossaryKey)
        if (raw) {
          const glossaryData = JSON.parse(raw)
          if (Array.isArray(glossaryData)) {
            setGlossary(glossaryData)
          }
        }
      } catch (error) {
        console.error('Failed to restore glossary', error)
      }
    }
  }, []) // Run once on mount

  useEffect(() => {
    if (glossary.length === 0) {
      setGlossaryPanelOpen(false)
    }
  }, [glossary.length])

  useEffect(() => {
    if (!isGlossaryPanelOpen) return
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setGlossaryPanelOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isGlossaryPanelOpen])

  useEffect(() => {
    let cancelled = false

    const loadUsers = async () => {
      try {
        setIsLoadingUsers(true)
        const response = await fetch(userDataSheetUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const parsedUsers = parseUserRecords(worksheet)

        if (!cancelled) {
          setUsers(parsedUsers)
          setUserDataError(
            parsedUsers.length === 0
              ? 'No user records found in SME_Data.xlsx.'
              : ''
          )
        }
      } catch (error) {
        console.error('Failed to load SME user data', error)
        if (!cancelled) {
          setUsers([])
          setUserDataError(
            'Unable to load SME user list. Please contact the administrator.'
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUsers(false)
        }
      }
    }

    loadUsers()

    return () => {
      cancelled = true
    }
  }, [])

  const currentRecord = useMemo(
    () => (records.length > 0 ? records[currentIndex] : null),
    [records, currentIndex]
  )

  const currentOriginalRecord = useMemo(
    () => (originalRecords.length > 0 ? originalRecords[currentIndex] : null),
    [originalRecords, currentIndex]
  )

  const activeGlossaryEntry = useMemo(() => {
    if (glossary.length === 0) return null
    const entry = glossary[currentIndex % glossary.length]
    return entry
  }, [glossary, currentIndex])

  const nowMoment = useMemo(() => dayjs(now), [now])
  const tamilDateLabel = useMemo(
    () => getTamilCalendarLabel(nowMoment),
    [nowMoment]
  )
  const englishDateLabel = useMemo(
    () => nowMoment.format('DD MMM YYYY • hh:mm A'),
    [nowMoment]
  )

  // Calculate count of changed records
  const changedRecordsCount = useMemo(() => {
    if (records.length === 0 || originalRecords.length === 0) return 0

    const normalize = (text) => {
      if (!text) return ''
      // Remove trailing punctuation (dots, commas, etc.) and normalize
      return text.trim().toLowerCase().replace(/[.,:;!?]+$/g, '')
    }

    return records.filter((record, index) => {
      const original = originalRecords[index]
      if (!original) return false

      return (
        normalize(record.questionTa) !== normalize(original.questionTa) ||
        normalize(record.answerTa) !== normalize(original.answerTa) ||
        normalize(record.explanationTa) !== normalize(original.explanationTa) ||
        record.optionsTa.some(
          (opt, idx) => normalize(opt) !== normalize(original.optionsTa?.[idx])
        )
      )
    }).length
  }, [records, originalRecords])

  const handleLogin = ({ email, password }) => {
    const normalisedEmail = toSafeString(email).toLowerCase()
    const normalisedPassword = toSafeString(password)

    if (!normalisedEmail || !normalisedPassword) {
      setAuthError('Please provide both email and password.')
      return
    }

    if (isLoadingUsers) {
      setAuthError('User list is still loading. Please try again in a moment.')
      return
    }

    if (userDataError) {
      setAuthError(userDataError)
      return
    }

    const matchedUser = users.find(
      (entry) => entry.email.toLowerCase() === normalisedEmail
    )

    if (matchedUser && matchedUser.password === normalisedPassword) {
      setUser({
        email: matchedUser.email,
        displayName: matchedUser.name,
        loggedAt: dayjs().toISOString(),
      })
      setAuthError('')
      return
    }

    setAuthError('Incorrect email or password.')
  }

  const handleLogout = () => {
    // Clear session data
    window.localStorage.removeItem('neet-session')

    setUser(null)
    setAuthError('')
    setRecords([])
    setCurrentIndex(0)
    setExcelMeta(null)
    setGlossary([])
    setGlossaryMeta(null)
    setStorageKey('')
    setHasUnsavedChanges(false)
    setGlossaryPanelOpen(false)
    setGlossarySliderOpen(false)
  }

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await readFileAsArrayBuffer(file)
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false,
      })

      const parsed = rows.map(normalizeRow).filter(
        (record) =>
          record.questionTa ||
          record.questionEn ||
          record.answerTa ||
          record.answerEn
      )

      const key = `${STORAGE_PREFIX}:${file.name}`
      const originalKey = `${STORAGE_PREFIX}:original:${file.name}`
      const merged = mergeWithStoredRecords(parsed, key)

      // Store original data for comparison
      window.localStorage.setItem(originalKey, JSON.stringify(parsed))

      setStorageKey(key)
      setRecords(merged)
      setOriginalRecords(parsed)
      setCurrentIndex(0)
      setHasUnsavedChanges(false)
      setExcelMeta({
        name: file.name,
        total: merged.length,
      })
    } catch (error) {
      console.error(error)
      setExcelMeta(null)
      setRecords([])
      setStorageKey('')
      setHasUnsavedChanges(false)
    } finally {
      event.target.value = ''
    }
  }

  const handleGlossaryUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await readFileAsArrayBuffer(file)
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false,
      })

      const parsed = normalizeGlossaryRows(rows)
      setGlossary(parsed)
      setGlossaryMeta({
        name: file.name,
        total: parsed.length,
      })

      // Persist glossary to localStorage
      const glossaryKey = `${STORAGE_PREFIX}:glossary:${file.name}`
      window.localStorage.setItem(glossaryKey, JSON.stringify(parsed))
    } catch (error) {
      console.error(error)
      setGlossary([])
      setGlossaryMeta(null)
    } finally {
      event.target.value = ''
    }
  }

  const handleAddGlossaryTerm = (newEntry) => {
    setGlossary((prev) => [...prev, newEntry])
    setGlossaryMeta((prev) => ({
      ...prev,
      total: (prev?.total || 0) + 1,
    }))
  }

  const handleNext = () =>
    setCurrentIndex((prev) => Math.min(prev + 1, records.length - 1))
  const handlePrev = () =>
    setCurrentIndex((prev) => Math.max(prev - 1, 0))

  const handleSaveRecords = () => {
    if (!storageKey || records.length === 0) return
    persistRecordsToStorage(storageKey, records)
    setHasUnsavedChanges(false)
  }

  const handleDownloadExcel = () => {
    if (records.length === 0) return

    try {
      // Prepare data for Excel export
      const exportData = records.map((record) => ({
        '_id': record.id || '',
        'கேள்வி': record.questionTa || '',
        'question': record.questionEn || '',
        'விருப்பங்கள்': record.optionsTa.join(' | '),
        'questionOptions': record.optionsEn.join(' | '),
        'பதில்': record.answerTa || '',
        'answers': record.answerEn || '',
        'விளக்கம்': record.explanationTa || '',
        'explanation': record.explanationEn || '',
      }))

      // Create a new workbook
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions')

      // Generate filename with timestamp
      const timestamp = dayjs().format('YYYY-MM-DD_HH-mm')
      const filename = `NEET_Questions_${timestamp}.xlsx`

      // Download the file
      XLSX.writeFile(workbook, filename)
    } catch (error) {
      console.error('Failed to download Excel', error)
      alert('Failed to download Excel file. Please try again.')
    }
  }

  // Batch update handler for similarity updates
  const handleBatchUpdate = (rowNumbers, fieldName, newValue) => {
    setRecords((prev) =>
      prev.map((record, idx) => {
        const rowNum = idx + 1 // 1-indexed
        if (!rowNumbers.includes(rowNum)) return record

        // Update the specific field
        const updated = { ...record }
        if (fieldName === 'கேள்வி') {
          updated.questionTa = newValue
        } else if (fieldName === 'பதில்') {
          updated.answerTa = newValue
        } else if (fieldName === 'விளக்கம்') {
          updated.explanationTa = newValue
        } else if (fieldName.startsWith('விருப்பங்கள்')) {
          const optionIndex = parseInt(fieldName.split('-')[1])
          updated.optionsTa = [...record.optionsTa]
          updated.optionsTa[optionIndex] = newValue
        }

        return updated
      })
    )
    setHasUnsavedChanges(true)
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        error={authError}
        isLoadingUsers={isLoadingUsers}
        userDataError={userDataError}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-slate-100 text-slate-900 transition-colors dark:bg-surface-base dark:text-slate-100"
      style={{
        backgroundImage: `url(${appBackdropUrl})`,
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundPosition: 'center',
      }}
    >
      <GlossarySlider
        open={isGlossarySliderOpen}
        onClose={() => setGlossarySliderOpen(false)}
        glossary={glossary}
        onAddGlossary={handleAddGlossaryTerm}
      />
      <GlossaryDrawer
        open={isGlossaryPanelOpen}
        onClose={() => setGlossaryPanelOpen(false)}
        glossary={glossary}
      />
      <ChangesModal
        open={isChangesModalOpen}
        onClose={() => setChangesModalOpen(false)}
        records={records}
        originalRecords={originalRecords}
        onNavigateToRecord={(index) => setCurrentIndex(index)}
      />
      <header className="border-b border-slate-200 bg-white/85 px-5 py-4 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-surface-raised/95">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="NEET Question Studio"
                className="h-12 w-12 flex-shrink-0 rounded-2xl border border-white/60 bg-white/80 p-2 shadow dark:border-surface-raised/60 dark:bg-surface-base/60"
              />
              <div className="space-y-1">
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  NEET Question Studio
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Signed in as{' '}
                  <span className="text-slate-900 dark:text-slate-200">
                    {user.displayName || user.email}
                  </span>
                  {user.displayName ? (
                    <span className="text-slate-500"> ({user.email})</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tamilDateLabel} • {englishDateLabel}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {excelMeta && changedRecordsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setChangesModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-full border border-blue-600/60 bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-blue-700"
                  title="View all modified records"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  View Changes ({changedRecordsCount})
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveRecords}
                disabled={!hasUnsavedChanges || !storageKey}
                className="rounded-full border border-accent/60 bg-accent px-4 py-2 text-xs font-semibold text-slate-900 shadow transition hover:bg-yellow-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 dark:text-surface-base"
              >
                Save changes
              </button>
              {excelMeta && !hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="flex items-center gap-1.5 rounded-full border border-green-600/60 bg-green-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-green-700"
                  title="Download updated Excel file"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Excel
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 shadow transition hover:border-accent hover:text-accent dark:border-slate-700 dark:text-slate-300"
              >
                Logout
              </button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
          {(excelMeta || glossaryMeta) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              {excelMeta && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/70 px-3 py-1 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-surface-base/60 dark:text-slate-300">
                  <span
                    className="max-w-[14rem] truncate"
                    title={excelMeta.name}
                  >
                    {excelMeta.name}
                  </span>
                  <span className="flex-shrink-0">
                    · {excelMeta.total} records
                  </span>
                  <label
                    htmlFor="replace-excel"
                    className="ml-1 cursor-pointer text-accent transition hover:text-yellow-600"
                    title="Replace question sheet"
                  >
                    <input
                      id="replace-excel"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelUpload}
                      className="hidden"
                    />
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </label>
                </div>
              )}

              {/* Upload Glossary button when only Excel is uploaded */}
              {excelMeta && !glossaryMeta && (
                <label
                  htmlFor="header-glossary-upload"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-indigo-600/40 bg-indigo-600 px-3 py-1 text-white shadow-sm transition hover:bg-indigo-700"
                >
                  <input
                    id="header-glossary-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleGlossaryUpload}
                    className="hidden"
                  />
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Glossary
                </label>
              )}

              {/* Glossary filename button (opens slider) */}
              {glossaryMeta && (
                <button
                  type="button"
                  onClick={() => glossary.length > 0 && setGlossarySliderOpen(true)}
                  disabled={glossary.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-indigo-600/40 bg-indigo-600 px-3 py-1 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Open glossary slider"
                >
                  <span className="max-w-[14rem] truncate">
                    {glossaryMeta.name}
                  </span>
                  <span className="flex-shrink-0">
                    · {glossaryMeta.total} terms
                  </span>
                  <label
                    htmlFor="replace-glossary"
                    className="ml-1 cursor-pointer transition hover:opacity-80"
                    title="Replace glossary file"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      id="replace-glossary"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleGlossaryUpload}
                      className="hidden"
                    />
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </label>
                </button>
              )}

              {/* Upload Question Sheet button when only Glossary is uploaded */}
              {!excelMeta && glossaryMeta && (
                <label
                  htmlFor="header-excel-upload"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-accent/40 bg-accent px-3 py-1 text-slate-900 shadow-sm transition hover:bg-yellow-500"
                >
                  <input
                    id="header-excel-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Question Sheet
                </label>
              )}

              {storageKey && (
                <span className="rounded-full border border-accent/40 bg-white/70 px-3 py-1 text-accent shadow-sm dark:bg-surface-base/60">
                  {hasUnsavedChanges ? 'Unsaved edits' : 'All changes saved'}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden bg-slate-50/80 px-5 py-5 items-center transition-colors dark:bg-transparent">
        <div className="mx-auto justify-center flex h-full w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
          {!excelMeta ? (
            <InitialUploadScreen
              onExcelUpload={handleExcelUpload}
              onGlossaryUpload={handleGlossaryUpload}
            />
          ) : (
            <div className="flex h-full w-full flex-col overflow-hidden">
              <RecordPanel
                record={currentRecord}
                originalRecord={currentOriginalRecord}
                index={currentIndex}
                total={records.length}
                onNext={handleNext}
                onPrev={handlePrev}
                glossaryEntry={activeGlossaryEntry}
                allRecords={records}
                onBatchUpdate={handleBatchUpdate}
                onNavigateToRecord={(recordIndex) => setCurrentIndex(recordIndex)}
                onUpdateRecord={(updated) => {
                  setRecords((prev) =>
                    prev.map((row, rowIndex) => {
                      if (rowIndex !== currentIndex) return row
                      const next = {
                        ...row,
                        ...updated,
                      }
                      next.optionsTa = Array.isArray(updated.optionsTa)
                        ? [...updated.optionsTa]
                        : row.optionsTa
                      next.optionsEn = Array.isArray(updated.optionsEn)
                        ? [...updated.optionsEn]
                        : row.optionsEn
                      return next
                    })
                  )
                  setHasUnsavedChanges(true)
                }}
                onSave={handleSaveRecords}
                showSave={false}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
