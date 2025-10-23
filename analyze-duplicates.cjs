const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('bl_bio_bot_unit_4_chap_9_the_tissues_qb.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(worksheet);

console.log('Total rows:', data.length);
console.log('\nColumn names:');
console.log(Object.keys(data[0]).join(', '));

// Extract Tamil fields
const tamilContent = [];

data.forEach((row, idx) => {
  const entry = {
    rowNumber: idx + 2, // +2 because Excel is 1-indexed and has header
    question: row['கேள்வி'] || '',
    options: row['விருப்பங்கள்'] || '',
    answer: row['பதில்'] || '',
    explanation: row['விளக்கம்'] || ''
  };
  tamilContent.push(entry);
});

// Find duplicates in questions
const questionMap = new Map();
tamilContent.forEach(entry => {
  const normalized = entry.question.trim().toLowerCase();
  if (normalized) {
    if (!questionMap.has(normalized)) {
      questionMap.set(normalized, []);
    }
    questionMap.get(normalized).push(entry.rowNumber);
  }
});

const duplicateQuestions = Array.from(questionMap.entries())
  .filter(([_, rows]) => rows.length > 1);

console.log('\n=== DUPLICATE TAMIL QUESTIONS ===');
console.log('Found', duplicateQuestions.length, 'duplicate questions\n');

duplicateQuestions.forEach(([question, rows]) => {
  console.log('Question:', question.substring(0, 100) + (question.length > 100 ? '...' : ''));
  console.log('Appears in rows:', rows.join(', '));
  console.log('---');
});

// Find duplicates in options
const optionsMap = new Map();
tamilContent.forEach(entry => {
  const normalized = entry.options.trim().toLowerCase();
  if (normalized) {
    if (!optionsMap.has(normalized)) {
      optionsMap.set(normalized, []);
    }
    optionsMap.get(normalized).push(entry.rowNumber);
  }
});

const duplicateOptions = Array.from(optionsMap.entries())
  .filter(([_, rows]) => rows.length > 1);

console.log('\n=== DUPLICATE TAMIL OPTIONS ===');
console.log('Found', duplicateOptions.length, 'duplicate option sets\n');

duplicateOptions.slice(0, 10).forEach(([options, rows]) => {
  console.log('Options:', options.substring(0, 100) + (options.length > 100 ? '...' : ''));
  console.log('Appears in rows:', rows.join(', '));
  console.log('---');
});

if (duplicateOptions.length > 10) {
  console.log('... and', duplicateOptions.length - 10, 'more duplicate option sets');
}

// Find duplicates in answers
const answerMap = new Map();
tamilContent.forEach(entry => {
  const normalized = entry.answer.trim().toLowerCase();
  if (normalized) {
    if (!answerMap.has(normalized)) {
      answerMap.set(normalized, []);
    }
    answerMap.get(normalized).push(entry.rowNumber);
  }
});

const duplicateAnswers = Array.from(answerMap.entries())
  .filter(([_, rows]) => rows.length > 1);

// Summary
console.log('\n=== SUMMARY ===');
console.log('Total records:', data.length);
console.log('Duplicate questions:', duplicateQuestions.length);
console.log('Duplicate option sets:', duplicateOptions.length);
console.log('Duplicate answers:', duplicateAnswers.length);

// Export detailed report
const report = {
  totalRecords: data.length,
  duplicates: {
    questions: duplicateQuestions.map(([q, rows]) => ({ content: q, rows })),
    options: duplicateOptions.map(([o, rows]) => ({ content: o, rows })),
    answers: duplicateAnswers.map(([a, rows]) => ({ content: a, rows }))
  }
};

console.log('\nWriting detailed report to duplicate-report.json...');
require('fs').writeFileSync('duplicate-report.json', JSON.stringify(report, null, 2));
console.log('Done!');
