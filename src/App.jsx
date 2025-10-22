import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import userDataSheetUrl from '../SME_Data.xlsx?url'
import loginBackdropUrl from '../images/student-class.jpg'

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

const OptionsGrid = ({ label, options, language, onChange }) => (
  <Field label={label}>
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {options.map((option, idx) => (
        <textarea
          key={`${language}-${idx}`}
          value={option}
          onChange={(event) => onChange(idx, event.target.value)}
          rows={2}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
        />
      ))}
    </div>
  </Field>
)

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
}) => {
  if (!record) {
    return (
      <div className="flex h-full flex-col justify-center rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Upload an Excel sheet to begin
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          The viewer will render each question, options, answers, and
          explanations in Tamil and English.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-surface-raised dark:shadow-2xl dark:shadow-black/40">
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
              onUpdateRecord({
                ...record,
                optionsTa: nextOptions,
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
              <textarea
                value={record.answerTa}
                onChange={(event) =>
                  onUpdateRecord({
                    ...record,
                    answerTa: event.target.value,
                  })
                }
                rows={2}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
              />
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
              rows={3}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-slate-800 dark:bg-surface-base dark:text-slate-100 resize-none"
            />
          </Field>

          <div className="h-px w-full bg-slate-200 dark:bg-slate-800/60" />

          <section className="space-y-3">
            <Field label="தமிழ் (read-only snapshot)">
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 transition dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <p>
                  <span className="font-medium">Question:</span>{' '}
                  {record.questionTa || '—'}
                </p>
                <p>
                  <span className="font-medium">Options:</span>{' '}
                  {record.optionsTa.length > 0
                    ? record.optionsTa.join(' | ')
                    : '—'}
                </p>
                <p>
                  <span className="font-medium">Answer:</span>{' '}
                  {record.answerTa || '—'}
                </p>
                <p>
                  <span className="font-medium">Explanation:</span>{' '}
                  {record.explanationTa || '—'}
                </p>
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
  const [authError, setAuthError] = useState('')
  const [user, setUser] = useState(null)
  const [records, setRecords] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [glossary, setGlossary] = useState([])
  const [excelMeta, setExcelMeta] = useState(null)
  const [glossaryMeta, setGlossaryMeta] = useState(null)
  const [storageKey, setStorageKey] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [users, setUsers] = useState([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [userDataError, setUserDataError] = useState('')
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

  const activeGlossaryEntry = useMemo(() => {
    if (glossary.length === 0) return null
    const entry = glossary[currentIndex % glossary.length]
    return entry
  }, [glossary, currentIndex])

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
        loginTime: dayjs().format('DD MMM YYYY • hh:mm A'),
      })
      setAuthError('')
      return
    }

    setAuthError('Incorrect email or password.')
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
      const merged = mergeWithStoredRecords(parsed, key)

      setStorageKey(key)
      setRecords(merged)
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
    } catch (error) {
      console.error(error)
      setGlossary([])
      setGlossaryMeta(null)
    } finally {
      event.target.value = ''
    }
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
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 transition-colors dark:bg-surface-base dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/90 px-5 py-4 shadow-md backdrop-blur dark:border-slate-800 dark:bg-surface-raised">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            {excelMeta ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/60 px-3 py-1 text-slate-600 dark:border-slate-700 dark:bg-surface-base/60 dark:text-slate-300">
                <span
                  className="max-w-[14rem] truncate"
                  title={excelMeta.name}
                >
                  {excelMeta.name}
                </span>
                <span className="flex-shrink-0">
                  · {excelMeta.total} records
                </span>
              </span>
            ) : (
              <span className="rounded-full border border-slate-300 bg-white/60 px-3 py-1 dark:border-slate-700 dark:bg-surface-base/60">
                Upload question sheet
              </span>
            )}
            {glossaryMeta ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/60 px-3 py-1 text-slate-600 dark:border-slate-700 dark:bg-surface-base/60 dark:text-slate-300">
                <span
                  className="max-w-[14rem] truncate"
                  title={glossaryMeta.name}
                >
                  {glossaryMeta.name}
                </span>
                <span className="flex-shrink-0">
                  · {glossaryMeta.total} terms
                </span>
              </span>
            ) : (
              <span className="rounded-full border border-slate-300 bg-white/60 px-3 py-1 dark:border-slate-700 dark:bg-surface-base/60">
                Glossary not loaded
              </span>
            )}
            {storageKey ? (
              <span className="rounded-full border border-accent/40 px-3 py-1 text-accent">
                {hasUnsavedChanges ? 'Unsaved edits' : 'All changes saved'}
              </span>
            ) : null}
            <UploadButton
              id="upload-excel"
              label="Upload Question Sheet"
              onChange={handleExcelUpload}
              accept=".xlsx,.xls"
            />
            <UploadButton
              id="upload-glossary"
              label="Upload Glossary"
              onChange={handleGlossaryUpload}
              accept=".xlsx,.xls"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
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
                ) : null}{' '}
                • Logged in {user.loginTime}
              </p>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden bg-slate-50/80 px-5 py-5 transition-colors dark:bg-transparent">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
          <div className="flex h-full flex-col overflow-hidden">
            <RecordPanel
              record={currentRecord}
              index={currentIndex}
              total={records.length}
              onNext={handleNext}
              onPrev={handlePrev}
              glossaryEntry={activeGlossaryEntry}
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
              showSave={hasUnsavedChanges && Boolean(storageKey)}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
