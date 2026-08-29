const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const {
  getSetting,
  setSetting,
  getStudentWithApps,
  saveStudentWithApps,
  getAllStudentsWithApps,
  deleteStudent,
  teacherResetPin
} = require('./db');
const { generateUniversityExcel } = require('./excelExport');
const { getPublicUrl } = require('./tunnel');

const app = express();

app.use(cors());
app.use(express.json());

// Helper: Get primary local IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

// -------------------------------------------------------------
// STUDENT APIs
// -------------------------------------------------------------

// Student Login / Verification
app.post('/api/student/auth', (req, res) => {
  try {
    const { student_id, name, pin } = req.body;
    if (!student_id || !name || !pin) {
      return res.status(400).json({ error: '학번, 이름, 4자리 비밀번호를 모두 입력해주세요.' });
    }

    const trimmedId = String(student_id).trim();
    const trimmedName = String(name).trim();
    const trimmedPin = String(pin).trim();

    if (!/^\d{4}$/.test(trimmedId)) {
      return res.status(400).json({ error: '학번은 4자리 숫자로 입력해주세요 (예: 3201).' });
    }

    if (trimmedPin.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자리 이상으로 설정해주세요.' });
    }

    const result = getStudentWithApps(trimmedId);

    if (result) {
      if (result.student.name !== trimmedName) {
        return res.status(400).json({ error: `학번(${trimmedId})에 등록된 이름과 일치하지 않습니다.` });
      }
      return res.json({ success: true, isNew: false, student: result.student, applications: result.applications });
    } else {
      const initialApps = [];
      for (let r = 1; r <= 6; r++) {
        initialApps.push({
          rank: r,
          university: '',
          major: '',
          admission_type: r <= 2 ? '학생부교과' : (r <= 5 ? '학생부종합' : '논술'),
          admission_detail: '',
          gpa: null,
          tendency: r <= 3 ? '소신' : (r === 4 ? '상향' : '안정'),
          status: '입시결과',
          reserve_number: '',
          is_submitted: false,
          has_min_gpa: false,
          min_gpa_subjects: '3개',
          min_gpa_grade: '',
          min_gpa_inquiry: '탐구 1과목 반영',
          has_interview: r === 3 || r === 4,
          interview_start_date: '',
          interview_end_date: '',
          interview_detail: '',
          note: ''
        });
      }
      const saved = saveStudentWithApps(trimmedId, trimmedName, trimmedPin, initialApps);
      return res.json({ success: true, isNew: true, student: { student_id: trimmedId, name: trimmedName }, applications: saved.applications });
    }
  } catch (err) {
    console.error('Student Auth Error:', err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
});

// Save / Update 6 Application Cards
app.post('/api/student/save', (req, res) => {
  try {
    const { student_id, name, pin, applications } = req.body;
    if (!student_id || !name || !pin) {
      return res.status(400).json({ error: '인증 정보가 누락되었습니다.' });
    }

    const trimmedId = String(student_id).trim();
    const trimmedPin = String(pin).trim();

    if (!Array.isArray(applications) || applications.length !== 6) {
      return res.status(400).json({ error: '1순위부터 6순위까지 6개 카드를 모두 전송해야 합니다.' });
    }

    const result = saveStudentWithApps(trimmedId, String(name).trim(), trimmedPin, applications);
    res.json({ success: true, message: '성공적으로 저장되었습니다.', applications: result.applications });
  } catch (err) {
    console.error('Student Save Error:', err);
    res.status(500).json({ error: err.message || '저장 중 오류가 발생했습니다.' });
  }
});

// -------------------------------------------------------------
// TEACHER (ADMIN) APIs
// -------------------------------------------------------------

// Teacher Password Login
app.post('/api/teacher/login', (req, res) => {
  const { password } = req.body;
  const masterPassword = getSetting('teacher_password') || '1234';

  if (password === masterPassword) {
    res.json({ success: true, token: 'authenticated_teacher_session' });
  } else {
    res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
  }
});

// Teacher: Change Administrator Password
app.post('/api/teacher/change-password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const masterPassword = getSetting('teacher_password') || '1234';

    if (currentPassword !== masterPassword) {
      return res.status(401).json({ error: '현재 관리자 비밀번호가 일치하지 않습니다.' });
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자리 이상이어야 합니다.' });
    }

    setSetting('teacher_password', newPassword.trim());
    res.json({ success: true, message: '관리자 비밀번호가 성공적으로 변경되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Get All Students & Statistics
app.get('/api/teacher/overview', (req, res) => {
  try {
    const students = getAllStudentsWithApps();

    // Calculate aggregated statistics
    let totalApplications = 0;
    let totalSubmittedApps = 0;
    let upCount = 0;
    let midCount = 0;
    let safeCount = 0;
    let registeredCount = 0;
    let passedCount = 0;

    const universityStats = {};
    const majorStats = {};
    const admissionTypeStats = {};

    students.forEach(s => {
      s.applications.forEach(a => {
        if (a.university && a.university.trim() !== '') {
          totalApplications++;
          if (a.is_submitted) totalSubmittedApps++;

          const uni = a.university.trim();
          universityStats[uni] = (universityStats[uni] || 0) + 1;

          if (a.major && a.major.trim() !== '') {
            const maj = a.major.trim();
            majorStats[maj] = (majorStats[maj] || 0) + 1;
          }

          if (a.admission_type && a.admission_type.trim() !== '') {
            const adm = a.admission_type.trim();
            admissionTypeStats[adm] = (admissionTypeStats[adm] || 0) + 1;
          }

          if (a.tendency === '상향') upCount++;
          else if (a.tendency === '소신') midCount++;
          else if (a.tendency === '안정') safeCount++;

          if (a.status === '최종등록') registeredCount++;
          if (a.status === '최종합격') passedCount++;
        }
      });
    });

    const topUniversities = Object.entries(universityStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topMajors = Object.entries(majorStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      students,
      stats: {
        totalStudents: students.length,
        totalApplications,
        totalSubmittedApps,
        upCount,
        midCount,
        safeCount,
        registeredCount,
        passedCount,
        topUniversities,
        topMajors,
        admissionTypeStats
      }
    });
  } catch (err) {
    console.error('Teacher Overview Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Update specific student's application data
app.put('/api/teacher/student/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, applications } = req.body;

    const student = getStudentWithApps(studentId);
    if (!student) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

    const result = saveStudentWithApps(studentId, name || student.student.name, null, applications);
    res.json({ success: true, student: result.student, applications: result.applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Delete student
app.delete('/api/teacher/student/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    deleteStudent(studentId);
    res.json({ success: true, message: '학생 데이터가 성공적으로 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Reset Student Password
app.post('/api/teacher/reset-pin', (req, res) => {
  try {
    const { student_id, new_pin } = req.body;
    if (!student_id || !new_pin || String(new_pin).length < 4) {
      return res.status(400).json({ error: '새 4자리 비밀번호를 입력해주세요.' });
    }
    teacherResetPin(student_id, String(new_pin).trim());
    res.json({ success: true, message: `학번 ${student_id} 학생의 비밀번호가 [${new_pin}] (으)로 재설정되었습니다.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Export Excel
app.get('/api/teacher/export-excel', async (req, res) => {
  try {
    const studentsWithApps = getAllStudentsWithApps();
    const workbook = await generateUniversityExcel(studentsWithApps);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=highschool_university_applications_${encodeURIComponent(new Date().toISOString().slice(0, 10))}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: '엑셀 생성에 실패했습니다.' });
  }
});

// System Info & QR Code
app.get('/api/system/info', async (req, res) => {
  try {
    const localIP = getLocalIP();
    const port = process.env.PORT || 3000;
    let publicUrl = getPublicUrl();

    // If running in Netlify or Cloud
    if (!publicUrl && (process.env.URL || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || process.env.PROJECT_DOMAIN)) {
      publicUrl = process.env.URL || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
    } else if (!publicUrl && req.get('host') && !req.get('host').includes('localhost') && !req.get('host').includes('127.0.0.1')) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      publicUrl = `${protocol}://${req.get('host')}`;
    }

    const studentUrl = publicUrl || `http://${localIP}:${port}`;
    const qrDataUrl = await QRCode.toDataURL(studentUrl, { width: 300, margin: 2 });

    res.json({
      localIP,
      port,
      publicUrl,
      localUrl: `http://${localIP}:${port}`,
      studentUrl,
      qrDataUrl,
      title: getSetting('app_title') || '고3 수시 6장 대학 지원 관리'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
