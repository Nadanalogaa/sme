import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'

const DUMMY_CREDENTIALS = {
  username: 'mentor',
  password: 'neet2025',
}

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

const Field = ({
  label,
  className = '',
  children,
}) => (
  <section className={`space-y-2 ${className}`}>
    <p className="text-sm font-medium text-slate-300">{label}</p>
    {children}
  </section>
)

const UploadButton = ({ id, label, onChange, accept }) => (
  <label
    htmlFor={id}
    className="flex cursor-pointer items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
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

const LoginScreen = ({ onLogin, error }) => {
  const [formState, setFormState] = useState({
    username: '',
    password: '',
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    onLogin(formState)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-6 py-10 text-slate-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800 bg-surface-raised p-10 shadow-2xl shadow-black/40"
      >
        <header className="space-y-2 text-center">
          <p className="text-xl font-semibold tracking-tight">
            NEET Question Studio
          </p>
          <p className="text-sm text-slate-400">
            Use the demo credentials to continue
          </p>
        </header>

        <div className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="text-slate-300">Username</span>
            <input
              type="text"
              value={formState.username}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  username: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-800 bg-surface-base px-4 py-3 text-sm text-slate-100 outline-none ring-0 transition focus:border-accent focus:ring-2 focus:ring-accent/40"
              placeholder="mentor"
              autoComplete="username"
              required
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-slate-300">Password</span>
            <input
              type="password"
              value={formState.password}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-800 bg-surface-base px-4 py-3 text-sm text-slate-100 outline-none ring-0 transition focus:border-accent focus:ring-2 focus:ring-accent/40"
              placeholder="neet2025"
              autoComplete="current-password"
              required
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-surface-base px-4 py-3 text-xs text-slate-400">
            <p>
              Username: <span className="text-slate-200">mentor</span>
            </p>
            <p>
              Password: <span className="text-slate-200">neet2025</span>
            </p>
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-surface-base transition hover:bg-yellow-500"
        >
          Login
        </button>
      </form>
    </div>
  )
}

const RecordNavigator = ({
  index,
  total,
  onNext,
  onPrev,
  disabled,
}) => (
  <div className="flex items-center justify-between gap-3">
    <p className="text-sm text-slate-400">
      {total > 0 ? `Record ${index + 1} of ${total}` : 'No records loaded'}
    </p>
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={disabled || index === 0}
        className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled || index >= total - 1}
        className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  </div>
)

const OptionsGrid = ({ label, options, language, onChange }) => (
  <Field label={label}>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option, idx) => (
        <textarea
          key={`${language}-${idx}`}
          value={option}
          onChange={(event) => onChange(idx, event.target.value)}
          className="min-h-[56px] rounded-lg border border-slate-800 bg-surface-base px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
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
}) => {
  if (!record) {
    return (
      <div className="flex h-full flex-col justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-900/30 text-center text-slate-400">
        <p className="text-lg font-semibold text-slate-200">
          Upload an Excel sheet to begin
        </p>
        <p className="mt-2 text-sm text-slate-400">
          The viewer will render each question, options, answers, and
          explanations in Tamil and English.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-800 bg-surface-raised p-6 shadow-2xl shadow-black/40">
      <RecordNavigator
        index={index}
        total={total}
        onNext={onNext}
        onPrev={onPrev}
        disabled={!record}
      />

      <div className="mt-6 flex-1 overflow-hidden">
        <div className="flex h-full flex-col gap-6 overflow-y-auto pr-3">
          <Field label={FIELD_LABELS.questionTa}>
            <textarea
              value={record.questionTa}
              onChange={(event) =>
                onUpdateRecord({
                  ...record,
                  questionTa: event.target.value,
                })
              }
              className="min-h-[72px] w-full rounded-xl border border-slate-800 bg-surface-base px-4 py-3 text-sm text-slate-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
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

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label={FIELD_LABELS.glossary}>
              {glossaryEntry ? (
                <div className="space-y-1 text-sm leading-relaxed">
                  <p className="font-semibold text-accent">
                    {glossaryEntry.term}
                  </p>
                  <p className="text-slate-300">{glossaryEntry.description}</p>
                </div>
              ) : (
                <span className="text-slate-500">
                  Upload a glossary file to review terms alongside the
                  question.
                </span>
              )}
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
                className="min-h-[56px] w-full rounded-xl border border-slate-800 bg-surface-base px-4 py-3 text-sm text-slate-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
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
              className="min-h-[96px] w-full rounded-xl border border-slate-800 bg-surface-base px-4 py-3 text-sm text-slate-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
            />
          </Field>

          <div className="h-px w-full bg-slate-800/60" />

          <section className="space-y-4">
            <Field label="தமிழ் (read-only snapshot)">
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm leading-relaxed text-slate-300">
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
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm leading-relaxed text-slate-300">
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

  const currentRecord = useMemo(
    () => (records.length > 0 ? records[currentIndex] : null),
    [records, currentIndex]
  )

  const activeGlossaryEntry = useMemo(() => {
    if (glossary.length === 0) return null
    const entry = glossary[currentIndex % glossary.length]
    return entry
  }, [glossary, currentIndex])

  const handleLogin = ({ username, password }) => {
    if (
      username.trim().toLowerCase() ===
        DUMMY_CREDENTIALS.username.toLowerCase() &&
      password === DUMMY_CREDENTIALS.password
    ) {
      setUser({
        username: DUMMY_CREDENTIALS.username,
        loginTime: dayjs().format('DD MMM YYYY • hh:mm A'),
      })
      setAuthError('')
      return
    }

    setAuthError('Incorrect username or password. Try mentor / neet2025.')
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

      setRecords(parsed)
      setCurrentIndex(0)
      setExcelMeta({
        name: file.name,
        total: parsed.length,
      })
    } catch (error) {
      console.error(error)
      setExcelMeta(null)
      setRecords([])
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

  if (!user) {
    return <LoginScreen onLogin={handleLogin} error={authError} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-base text-slate-100">
      <header className="border-b border-slate-800 bg-surface-raised px-6 py-5 shadow-lg shadow-black/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xl font-semibold text-slate-100">
              NEET Question Studio
            </p>
            <p className="text-sm text-slate-400">
              {user.username} • Logged in {user.loginTime}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              {excelMeta ? (
                <span className="rounded-full border border-slate-700 px-3 py-1">
                  {excelMeta.name} · {excelMeta.total} records
                </span>
              ) : (
                <span className="rounded-full border border-slate-700 px-3 py-1">
                  Upload question sheet
                </span>
              )}
              {glossaryMeta ? (
                <span className="rounded-full border border-slate-700 px-3 py-1">
                  {glossaryMeta.name} · {glossaryMeta.total} terms
                </span>
              ) : (
                <span className="rounded-full border border-slate-700 px-3 py-1">
                  Glossary not loaded
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
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
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden px-6 py-6">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-1 flex-col gap-6 overflow-hidden lg:flex-row">
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
                  prev.map((row, rowIndex) =>
                    rowIndex === currentIndex ? updated : row
                  )
                )
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
