/**
 * 고3 수시 6장 대학 지원 및 원서 접수 관리 시스템 (UniCard Tracker)
 * Google Apps Script 백엔드 (Code.gs)
 * 
 * 구글 스프레드시트와 100% 연동되어 데이터가 영구 보존됩니다.
 */

// 1. 웹 앱 접속 시 실행 (GET 요청 처리)
function doGet(e) {
  // HTML 서비스로 직접 접속한 경우 프론트엔드 단일 HTML 렌더링
  if (!e || !e.parameter || !e.parameter.action) {
    try {
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('고3 수시 6장 대학 지원 관리')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'online',
        message: 'UniCard Tracker Google Apps Script API Server'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  const action = e.parameter.action;
  let result = { success: false, error: 'Unknown action' };

  try {
    if (action === 'getSystemInfo') {
      result = getSystemInfo();
    } else if (action === 'getOverview') {
      result = getOverview();
    } else if (action === 'studentAuth') {
      const studentId = e.parameter.student_id;
      const name = e.parameter.name;
      const pin = e.parameter.pin;
      result = handleStudentAuth(studentId, name, pin);
    }
  } catch (err) {
    result = { success: false, error: err.message || String(err) };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 2. 데이터 저장/수정 시 실행 (POST 요청 처리)
function doPost(e) {
  let result = { success: false, error: 'Invalid request' };

  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action;

    if (action === 'studentAuth') {
      result = handleStudentAuth(payload.student_id, payload.name, payload.pin);
    } else if (action === 'studentSave') {
      result = handleStudentSave(payload.student_id, payload.name, payload.pin, payload.applications);
    } else if (action === 'teacherLogin') {
      result = handleTeacherLogin(payload.password);
    } else if (action === 'getOverview') {
      result = getOverview();
    } else if (action === 'changePassword') {
      result = handleChangePassword(payload.newPassword);
    } else if (action === 'teacherSaveStudent') {
      result = handleStudentSave(payload.student_id, payload.name, payload.pin, payload.applications);
    } else if (action === 'deleteStudent') {
      result = handleDeleteStudent(payload.student_id);
    } else if (action === 'resetStudentPin') {
      result = handleResetStudentPin(payload.student_id, payload.pin);
    } else if (action === 'getSystemInfo') {
      result = getSystemInfo();
    }
  } catch (err) {
    result = { success: false, error: err.message || String(err) };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 📊 스프레드시트 자동 생성 및 관리 함수
// ==========================================
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(sheetName, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#1E293B');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// 시트 초기화
function initSheets() {
  // 1. 학생 계정 및 메타데이터 시트
  getOrCreateSheet('학생목록', ['학번', '이름', '비밀번호PIN', '최근수정일시']);

  // 2. 6장 지원 카드 상세 시트
  getOrCreateSheet('수시지원카드', [
    '학번', '이름', '순위', '대학명', '학과(부)명', '전형구분', '세부전형명',
    '내신등급', '지원성향', '입시결과', '예비번호', '불합격사유', '원서접수여부',
    '수능최저여부', '반영과목수', '등급합기준', '탐구반영방식',
    '면접유무', '면접시작일', '면접종료일', '면접세부사항', '비고(메모)', '수정일시'
  ]);

  // 3. 환경설정 시트
  const settingSheet = getOrCreateSheet('설정', ['설정키', '값']);
  const data = settingSheet.getDataRange().getValues();
  let hasPwd = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'teacher_password') hasPwd = true;
  }
  if (!hasPwd) {
    settingSheet.appendRow(['teacher_password', '1234']);
    settingSheet.appendRow(['app_title', '고3 수시 6장 대학 지원 관리']);
  }
}

// ==========================================
// 🔑 관리자 / 학생 비즈니스 로직
// ==========================================

function getSetting(key, defaultValue) {
  initSheets();
  const sheet = getOrCreateSheet('설정', ['설정키', '값']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      return String(data[i][1]);
    }
  }
  return defaultValue;
}

function setSetting(key, value) {
  initSheets();
  const sheet = getOrCreateSheet('설정', ['설정키', '값']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(String(value));
      return;
    }
  }
  sheet.appendRow([key, String(value)]);
}

function getSystemInfo() {
  return {
    success: true,
    platform: 'Google Apps Script (Google Spreadsheet)',
    storage: 'Google Sheets Live Database (영구 보존)',
    app_title: getSetting('app_title', '고3 수시 6장 대학 지원 관리')
  };
}

function handleTeacherLogin(password) {
  const currentPwd = getSetting('teacher_password', '1234');
  if (String(password).trim() === currentPwd) {
    return {
      success: true,
      token: 'gas_teacher_session_' + new Date().getTime(),
      message: '로그인 성공'
    };
  }
  return { success: false, error: '관리자 비밀번호가 올바르지 않습니다.' };
}

function handleChangePassword(newPassword) {
  if (!newPassword || String(newPassword).trim().length < 4) {
    return { success: false, error: '비밀번호는 4자리 이상이어야 합니다.' };
  }
  setSetting('teacher_password', String(newPassword).trim());
  return { success: true, message: '비밀번호가 성공적으로 변경되었습니다.' };
}

// 학생 인증 및 6장 데이터 로드
function handleStudentAuth(studentId, name, pin) {
  initSheets();
  const trimmedId = String(studentId).trim();
  const trimmedName = String(name).trim();
  const trimmedPin = String(pin).trim();

  if (!trimmedId || !trimmedName || !trimmedPin) {
    return { success: false, error: '학번, 이름, 비밀번호를 모두 입력해주세요.' };
  }

  const studentSheet = getOrCreateSheet('학생목록', ['학번', '이름', '비밀번호PIN', '최근수정일시']);
  const studentsData = studentSheet.getDataRange().getValues();

  let studentRowIndex = -1;
  let isNew = true;

  for (let i = 1; i < studentsData.length; i++) {
    if (String(studentsData[i][0]).trim() === trimmedId) {
      studentRowIndex = i + 1;
      isNew = false;
      
      if (String(studentsData[i][1]).trim() !== trimmedName) {
        return { success: false, error: `학번(${trimmedId})에 등록된 이름(${studentsData[i][1]})과 일치하지 않습니다.` };
      }
      if (String(studentsData[i][2]).trim() !== trimmedPin) {
        return { success: false, error: '비밀번호가 일치하지 않습니다. 담임선생님께 재설정을 요청하세요.' };
      }
      break;
    }
  }

  // 신규 학생 등록
  if (isNew) {
    studentSheet.appendRow([trimmedId, trimmedName, trimmedPin, new Date().toLocaleString('ko-KR')]);
  }

  const apps = loadStudentApps(trimmedId);

  return {
    success: true,
    isNew: isNew,
    student: {
      student_id: trimmedId,
      name: trimmedName
    },
    applications: apps
  };
}

// 6장 카드 불러오기 헬퍼
function loadStudentApps(studentId) {
  const cardSheet = getOrCreateSheet('수시지원카드', []);
  const cardData = cardSheet.getDataRange().getValues();
  const apps = [];

  for (let r = 1; r <= 6; r++) {
    let found = null;
    for (let i = 1; i < cardData.length; i++) {
      if (String(cardData[i][0]).trim() === String(studentId) && Number(cardData[i][2]) === r) {
        found = {
          rank: r,
          university: String(cardData[i][3] || ''),
          major: String(cardData[i][4] || ''),
          admission_type: String(cardData[i][5] || ''),
          admission_detail: String(cardData[i][6] || ''),
          gpa: cardData[i][7] !== '' && cardData[i][7] !== null ? Number(cardData[i][7]) : null,
          tendency: String(cardData[i][8] || ''),
          status: String(cardData[i][9] || '입시결과'),
          reserve_number: String(cardData[i][10] || ''),
          fail_reason: String(cardData[i][11] || ''),
          is_submitted: Boolean(cardData[i][12] === true || cardData[i][12] === 1 || String(cardData[i][12]) === '1' || String(cardData[i][12]) === '접수완료'),
          has_min_gpa: Boolean(cardData[i][13] === true || cardData[i][13] === 1 || String(cardData[i][13]) === '1' || String(cardData[i][13]) === 'TRUE'),
          min_gpa_subjects: String(cardData[i][14] || '3개'),
          min_gpa_grade: String(cardData[i][15] || ''),
          min_gpa_inquiry: String(cardData[i][16] || '탐구 1과목 반영'),
          has_interview: Boolean(cardData[i][17] === true || cardData[i][17] === 1 || String(cardData[i][17]) === '1' || String(cardData[i][17]) === 'TRUE'),
          interview_start_date: String(cardData[i][18] || ''),
          interview_end_date: String(cardData[i][19] || ''),
          interview_detail: String(cardData[i][20] || ''),
          note: String(cardData[i][21] || '')
        };
        break;
      }
    }

    if (!found) {
      found = {
        rank: r,
        university: '',
        major: '',
        admission_type: '',
        admission_detail: '',
        gpa: null,
        tendency: '',
        status: '입시결과',
        reserve_number: '',
        fail_reason: '',
        is_submitted: false,
        has_min_gpa: false,
        min_gpa_subjects: '3개',
        min_gpa_grade: '',
        min_gpa_inquiry: '탐구 1과목 반영',
        has_interview: false,
        interview_start_date: '',
        interview_end_date: '',
        interview_detail: '',
        note: ''
      };
    }
    apps.push(found);
  }
  return apps;
}

// 학생 6장 지원 내역 저장
function handleStudentSave(studentId, name, pin, applications) {
  initSheets();
  const trimmedId = String(studentId).trim();
  const trimmedName = String(name).trim();
  const nowStr = new Date().toLocaleString('ko-KR');

  const studentSheet = getOrCreateSheet('학생목록', ['학번', '이름', '비밀번호PIN', '최근수정일시']);
  const sData = studentSheet.getDataRange().getValues();
  let foundStudent = false;

  for (let i = 1; i < sData.length; i++) {
    if (String(sData[i][0]).trim() === trimmedId) {
      foundStudent = true;
      if (pin && String(sData[i][2]).trim() !== String(pin).trim()) {
        return { success: false, error: '비밀번호가 일치하지 않습니다.' };
      }
      studentSheet.getRange(i + 1, 2).setValue(trimmedName);
      studentSheet.getRange(i + 1, 4).setValue(nowStr);
      break;
    }
  }

  if (!foundStudent) {
    studentSheet.appendRow([trimmedId, trimmedName, pin || '0000', nowStr]);
  }

  // 6장 카드 저장
  const cardSheet = getOrCreateSheet('수시지원카드', []);
  const cardData = cardSheet.getDataRange().getValues();

  for (let r = 1; r <= 6; r++) {
    const card = (applications && applications.find(a => Number(a.rank) === r)) || {};
    let rowIndex = -1;

    for (let i = 1; i < cardData.length; i++) {
      if (String(cardData[i][0]).trim() === trimmedId && Number(cardData[i][2]) === r) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowValues = [
      trimmedId,
      trimmedName,
      r,
      card.university ? String(card.university).trim() : '',
      card.major ? String(card.major).trim() : '',
      card.admission_type ? String(card.admission_type).trim() : '',
      card.admission_detail ? String(card.admission_detail).trim() : '',
      card.gpa !== undefined && card.gpa !== null && card.gpa !== '' ? Number(card.gpa) : '',
      card.tendency ? String(card.tendency).trim() : '',
      card.status ? String(card.status).trim() : '입시결과',
      card.reserve_number ? String(card.reserve_number).trim() : '',
      card.fail_reason ? String(card.fail_reason).trim() : '',
      card.is_submitted ? 1 : 0,
      card.has_min_gpa ? 1 : 0,
      card.min_gpa_subjects ? String(card.min_gpa_subjects).trim() : '3개',
      card.min_gpa_grade ? String(card.min_gpa_grade).trim() : '',
      card.min_gpa_inquiry ? String(card.min_gpa_inquiry).trim() : '탐구 1과목 반영',
      card.has_interview ? 1 : 0,
      card.interview_start_date ? String(card.interview_start_date).trim() : '',
      card.interview_end_date ? String(card.interview_end_date).trim() : '',
      card.interview_detail ? String(card.interview_detail).trim() : '',
      card.note ? String(card.note).trim() : '',
      nowStr
    ];

    if (rowIndex > 0) {
      cardSheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      cardSheet.appendRow(rowValues);
    }
  }

  return {
    success: true,
    message: '저장 완료',
    applications: loadStudentApps(trimmedId)
  };
}

// 교사용 전체 학생 목록 및 통계
function getOverview() {
  initSheets();
  const studentSheet = getOrCreateSheet('학생목록', ['학번', '이름', '비밀번호PIN', '최근수정일시']);
  const sData = studentSheet.getDataRange().getValues();

  const students = [];
  let totalCards = 0;
  let submittedCount = 0;
  const tendencyCounts = { '상향': 0, '소신': 0, '안정': 0, '기타': 0 };
  const uniMap = {};
  const majorMap = {};

  for (let i = 1; i < sData.length; i++) {
    const sId = String(sData[i][0]).trim();
    if (!sId) continue;
    const name = String(sData[i][1]).trim();
    const pin = String(sData[i][2]).trim();
    const updatedAt = String(sData[i][3] || '');

    const apps = loadStudentApps(sId);
    students.push({
      student_id: sId,
      name: name,
      pin: pin,
      updated_at: updatedAt,
      applications: apps
    });

    apps.forEach(a => {
      if (a.university || a.major) totalCards++;
      if (a.is_submitted) submittedCount++;
      if (a.tendency && tendencyCounts[a.tendency] !== undefined) {
        tendencyCounts[a.tendency]++;
      } else if (a.tendency) {
        tendencyCounts['기타']++;
      }

      if (a.university) uniMap[a.university] = (uniMap[a.university] || 0) + 1;
      if (a.major) majorMap[a.major] = (majorMap[a.major] || 0) + 1;
    });
  }

  // Sort students by student_id
  students.sort((a, b) => a.student_id.localeCompare(b.student_id, undefined, { numeric: true }));

  const topUnis = Object.keys(uniMap)
    .map(u => ({ university: u, count: uniMap[u] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topMajors = Object.keys(majorMap)
    .map(m => ({ major: m, count: majorMap[m] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    success: true,
    students: students,
    stats: {
      totalStudents: students.length,
      totalCards: totalCards,
      submittedCount: submittedCount,
      tendencyCounts: tendencyCounts,
      topUniversities: topUnis,
      topMajors: topMajors
    }
  };
}

// 학생 삭제
function handleDeleteStudent(studentId) {
  const ss = getSpreadsheet();
  const sId = String(studentId).trim();

  // 1. 학생목록에서 삭제
  const studentSheet = ss.getSheetByName('학생목록');
  if (studentSheet) {
    const data = studentSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === sId) {
        studentSheet.deleteRow(i + 1);
      }
    }
  }

  // 2. 수시지원카드에서 삭제
  const cardSheet = ss.getSheetByName('수시지원카드');
  if (cardSheet) {
    const data = cardSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === sId) {
        cardSheet.deleteRow(i + 1);
      }
    }
  }

  return { success: true, message: '학생 데이터가 삭제되었습니다.' };
}

// 학생 PIN 재설정
function handleResetStudentPin(studentId, newPin) {
  const ss = getSpreadsheet();
  const sId = String(studentId).trim();
  const pin = String(newPin).trim() || '0000';

  const studentSheet = ss.getSheetByName('학생목록');
  if (studentSheet) {
    const data = studentSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === sId) {
        studentSheet.getRange(i + 1, 3).setValue(pin);
        return { success: true, message: `학번 ${sId}의 비밀번호가 ${pin}으로 재설정되었습니다.` };
      }
    }
  }
  return { success: false, error: '해당 학번의 학생을 찾을 수 없습니다.' };
}
