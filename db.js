const path = require('path');
const fs = require('fs');

let useNetlifyBlobs = Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
let db = null;
let getStore = null;

try {
  if (!useNetlifyBlobs) {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'unicard.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Initialize database tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 6),
        university TEXT DEFAULT '',
        major TEXT DEFAULT '',
        admission_type TEXT DEFAULT '',
        admission_detail TEXT DEFAULT '',
        gpa REAL DEFAULT NULL,
        tendency TEXT DEFAULT '',
        status TEXT DEFAULT '입시결과',
        reserve_number TEXT DEFAULT '',
        is_submitted INTEGER DEFAULT 0,
        has_min_gpa INTEGER DEFAULT 0,
        min_gpa_subjects TEXT DEFAULT '',
        min_gpa_grade TEXT DEFAULT '',
        min_gpa_inquiry TEXT DEFAULT '',
        has_interview INTEGER DEFAULT 0,
        interview_start_date TEXT DEFAULT '',
        interview_end_date TEXT DEFAULT '',
        interview_detail TEXT DEFAULT '',
        note TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, rank),
        FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE
      );
    `);

    // Migrations for new columns and values
    const migrations = [
      'ALTER TABLE applications ADD COLUMN is_submitted INTEGER DEFAULT 0',
      'ALTER TABLE applications ADD COLUMN has_min_gpa INTEGER DEFAULT 0',
      'ALTER TABLE applications ADD COLUMN min_gpa_subjects TEXT DEFAULT ""',
      'ALTER TABLE applications ADD COLUMN min_gpa_grade TEXT DEFAULT ""',
      'ALTER TABLE applications ADD COLUMN min_gpa_inquiry TEXT DEFAULT ""',
      'ALTER TABLE applications ADD COLUMN has_interview INTEGER DEFAULT 0',
      'ALTER TABLE applications ADD COLUMN interview_start_date TEXT DEFAULT ""',
      'ALTER TABLE applications ADD COLUMN interview_end_date TEXT DEFAULT ""',
      'ALTER TABLE applications ADD COLUMN interview_detail TEXT DEFAULT ""',
      'ALTER TABLE applications ADD COLUMN reserve_number TEXT DEFAULT ""',
      "UPDATE applications SET status = '입시결과' WHERE status = '접수완료'"
    ];

    migrations.forEach(sql => {
      try { db.exec(sql); } catch (e) {}
    });
  }
} catch (err) {
  console.log('[Storage] SQLite initialization skipped, fallback to cloud/memory store:', err.message);
  useNetlifyBlobs = true;
}

// In-Memory / File Fallback for Serverless
const jsonDbPath = path.join(__dirname, 'unicard_data.json');
let inMemoryData = {
  settings: { teacher_password: '1234', app_title: '고3 수시 6장 대학 지원 관리' },
  students: []
};

if (fs.existsSync(jsonDbPath)) {
  try {
    inMemoryData = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
  } catch (e) {}
}

const saveJsonDb = () => {
  try {
    fs.writeFileSync(jsonDbPath, JSON.stringify(inMemoryData, null, 2), 'utf8');
  } catch (e) {}
};

// Netlify Blobs helper if available
let blobStore = null;
try {
  const blobs = require('@netlify/blobs');
  getStore = blobs.getStore;
  if (getStore) {
    blobStore = getStore('unicard_store');
  }
} catch (e) {}

// Set default teacher password if not set (default: '1234')
const getSetting = (key) => {
  if (db) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }
  return inMemoryData.settings[key] || (key === 'teacher_password' ? '1234' : null);
};

const setSetting = (key, value) => {
  if (db) {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  } else {
    inMemoryData.settings[key] = value;
    saveJsonDb();
  }
};

if (!getSetting('teacher_password')) {
  setSetting('teacher_password', '1234');
}

if (!getSetting('app_title')) {
  setSetting('app_title', '고3 수시 6장 대학 지원 관리');
}

// Student & Applications Helpers
const getStudentWithApps = (studentId) => {
  if (db) {
    const student = db.prepare('SELECT student_id, name, updated_at FROM students WHERE student_id = ?').get(studentId);
    if (!student) return null;

    const apps = db.prepare(`
      SELECT rank, university, major, admission_type, admission_detail, gpa, tendency, status, reserve_number, is_submitted,
             has_min_gpa, min_gpa_subjects, min_gpa_grade, min_gpa_inquiry,
             has_interview, interview_start_date, interview_end_date, interview_detail,
             note
      FROM applications
      WHERE student_id = ?
      ORDER BY rank ASC
    `).all(studentId);
    
    const fullApps = [];
    for (let r = 1; r <= 6; r++) {
      const found = apps.find(a => a.rank === r);
      fullApps.push(found || {
        rank: r,
        university: '',
        major: '',
        admission_type: '',
        admission_detail: '',
        gpa: null,
        tendency: '',
        status: '입시결과',
        reserve_number: '',
        is_submitted: 0,
        has_min_gpa: 0,
        min_gpa_subjects: '',
        min_gpa_grade: '',
        min_gpa_inquiry: '',
        has_interview: 0,
        interview_start_date: '',
        interview_end_date: '',
        interview_detail: '',
        note: ''
      });
    }

    return { student, applications: fullApps };
  } else {
    const student = inMemoryData.students.find(s => s.student_id === studentId);
    if (!student) return null;
    return {
      student: { student_id: student.student_id, name: student.name, updated_at: student.updated_at },
      applications: student.applications || []
    };
  }
};

const saveStudentWithApps = (studentId, name, pin, apps) => {
  if (db) {
    const saveTx = db.transaction((sId, sName, sPin, sApps) => {
      const existing = db.prepare('SELECT * FROM students WHERE student_id = ?').get(sId);
      if (existing) {
        if (sPin && existing.pin !== sPin) {
          throw new Error('비밀번호가 일치하지 않습니다.');
        }
        db.prepare('UPDATE students SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?').run(sName, sId);
      } else {
        db.prepare('INSERT INTO students (student_id, name, pin) VALUES (?, ?, ?)').run(sId, sName, sPin || '0000');
      }

      const upsertApp = db.prepare(`
        INSERT INTO applications (
          student_id, rank, university, major, admission_type, admission_detail, gpa, tendency, status, reserve_number, is_submitted,
          has_min_gpa, min_gpa_subjects, min_gpa_grade, min_gpa_inquiry,
          has_interview, interview_start_date, interview_end_date, interview_detail,
          note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id, rank) DO UPDATE SET
          university = excluded.university,
          major = excluded.major,
          admission_type = excluded.admission_type,
          admission_detail = excluded.admission_detail,
          gpa = excluded.gpa,
          tendency = excluded.tendency,
          status = excluded.status,
          reserve_number = excluded.reserve_number,
          is_submitted = excluded.is_submitted,
          has_min_gpa = excluded.has_min_gpa,
          min_gpa_subjects = excluded.min_gpa_subjects,
          min_gpa_grade = excluded.min_gpa_grade,
          min_gpa_inquiry = excluded.min_gpa_inquiry,
          has_interview = excluded.has_interview,
          interview_start_date = excluded.interview_start_date,
          interview_end_date = excluded.interview_end_date,
          interview_detail = excluded.interview_detail,
          note = excluded.note,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (let r = 1; r <= 6; r++) {
        const card = (sApps && sApps.find(a => a.rank === r)) || {};
        upsertApp.run(
          sId,
          r,
          card.university ? card.university.trim() : '',
          card.major ? card.major.trim() : '',
          card.admission_type ? card.admission_type.trim() : '',
          card.admission_detail ? card.admission_detail.trim() : '',
          card.gpa !== undefined && card.gpa !== null && card.gpa !== '' ? Number(card.gpa) : null,
          card.tendency ? card.tendency.trim() : '',
          card.status ? card.status.trim() : '입시결과',
          card.reserve_number !== undefined && card.reserve_number !== null ? String(card.reserve_number).trim() : '',
          card.is_submitted ? 1 : 0,
          card.has_min_gpa ? 1 : 0,
          card.min_gpa_subjects ? card.min_gpa_subjects.trim() : '',
          card.min_gpa_grade ? card.min_gpa_grade.trim() : '',
          card.min_gpa_inquiry ? card.min_gpa_inquiry.trim() : '',
          card.has_interview ? 1 : 0,
          card.interview_start_date ? card.interview_start_date.trim() : '',
          card.interview_end_date ? card.interview_end_date.trim() : '',
          card.interview_detail ? card.interview_detail.trim() : '',
          card.note ? card.note.trim() : ''
        );
      }

      return getStudentWithApps(sId);
    });

    return saveTx(studentId, name, pin, apps);
  } else {
    // In-memory / JSON fallback
    let existingIndex = inMemoryData.students.findIndex(s => s.student_id === studentId);
    if (existingIndex >= 0) {
      if (pin && inMemoryData.students[existingIndex].pin !== pin) {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }
      inMemoryData.students[existingIndex].name = name;
      inMemoryData.students[existingIndex].updated_at = new Date().toISOString();
    } else {
      inMemoryData.students.push({
        student_id: studentId,
        name: name,
        pin: pin || '0000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        applications: []
      });
      existingIndex = inMemoryData.students.length - 1;
    }

    const fullApps = [];
    for (let r = 1; r <= 6; r++) {
      const card = (apps && apps.find(a => a.rank === r)) || {};
      fullApps.push({
        rank: r,
        university: card.university ? card.university.trim() : '',
        major: card.major ? card.major.trim() : '',
        admission_type: card.admission_type ? card.admission_type.trim() : '',
        admission_detail: card.admission_detail ? card.admission_detail.trim() : '',
        gpa: card.gpa !== undefined && card.gpa !== null && card.gpa !== '' ? Number(card.gpa) : null,
        tendency: card.tendency ? card.tendency.trim() : '',
        status: card.status ? card.status.trim() : '입시결과',
        reserve_number: card.reserve_number !== undefined && card.reserve_number !== null ? String(card.reserve_number).trim() : '',
        is_submitted: card.is_submitted ? 1 : 0,
        has_min_gpa: card.has_min_gpa ? 1 : 0,
        min_gpa_subjects: card.min_gpa_subjects ? card.min_gpa_subjects.trim() : '',
        min_gpa_grade: card.min_gpa_grade ? card.min_gpa_grade.trim() : '',
        min_gpa_inquiry: card.min_gpa_inquiry ? card.min_gpa_inquiry.trim() : '',
        has_interview: card.has_interview ? 1 : 0,
        interview_start_date: card.interview_start_date ? card.interview_start_date.trim() : '',
        interview_end_date: card.interview_end_date ? card.interview_end_date.trim() : '',
        interview_detail: card.interview_detail ? card.interview_detail.trim() : '',
        note: card.note ? card.note.trim() : ''
      });
    }

    inMemoryData.students[existingIndex].applications = fullApps;
    saveJsonDb();
    return getStudentWithApps(studentId);
  }
};

const getAllStudentsWithApps = () => {
  if (db) {
    const students = db.prepare('SELECT student_id, name, pin, updated_at FROM students ORDER BY student_id ASC').all();
    const allApps = db.prepare(`
      SELECT student_id, rank, university, major, admission_type, admission_detail, gpa, tendency, status, reserve_number, is_submitted,
             has_min_gpa, min_gpa_subjects, min_gpa_grade, min_gpa_inquiry,
             has_interview, interview_start_date, interview_end_date, interview_detail,
             note
      FROM applications
      ORDER BY student_id ASC, rank ASC
    `).all();

    const appMap = {};
    for (const app of allApps) {
      if (!appMap[app.student_id]) appMap[app.student_id] = [];
      appMap[app.student_id].push(app);
    }

    return students.map(student => {
      const sApps = appMap[student.student_id] || [];
      const fullApps = [];
      for (let r = 1; r <= 6; r++) {
        const found = sApps.find(a => a.rank === r);
        fullApps.push(found || {
          rank: r,
          university: '',
          major: '',
          admission_type: '',
          admission_detail: '',
          gpa: null,
          tendency: '',
          status: '입시결과',
          reserve_number: '',
          is_submitted: 0,
          has_min_gpa: 0,
          min_gpa_subjects: '',
          min_gpa_grade: '',
          min_gpa_inquiry: '',
          has_interview: 0,
          interview_start_date: '',
          interview_end_date: '',
          interview_detail: '',
          note: ''
        });
      }
      return {
        ...student,
        applications: fullApps
      };
    });
  } else {
    return [...inMemoryData.students].sort((a, b) => a.student_id.localeCompare(b.student_id));
  }
};

const deleteStudent = (studentId) => {
  if (db) {
    db.transaction((sId) => {
      db.prepare('DELETE FROM applications WHERE student_id = ?').run(sId);
      db.prepare('DELETE FROM students WHERE student_id = ?').run(sId);
    })(studentId);
  } else {
    inMemoryData.students = inMemoryData.students.filter(s => s.student_id !== studentId);
    saveJsonDb();
  }
};

const teacherResetPin = (studentId, newPin) => {
  if (db) {
    return db.prepare('UPDATE students SET pin = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?').run(newPin, studentId);
  } else {
    const student = inMemoryData.students.find(s => s.student_id === studentId);
    if (student) {
      student.pin = newPin;
      student.updated_at = new Date().toISOString();
      saveJsonDb();
    }
  }
};

module.exports = {
  db,
  getSetting,
  setSetting,
  getStudentWithApps,
  saveStudentWithApps,
  getAllStudentsWithApps,
  deleteStudent,
  teacherResetPin
};
