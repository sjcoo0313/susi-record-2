const ExcelJS = require('exceljs');

async function generateUniversityExcel(studentsWithApps) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '고3 수시 지원 관리 시스템';
  workbook.created = new Date();

  // -------------------------------------------------------------
  // 1. SHEET 1: 학생별 종합 현황 (가로형)
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('학생별 종합 현황', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }]
  });

  // Header 1: Main Title
  summarySheet.mergeCells('A1:BK1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = `고3 수시 6장 대학 지원·수능최저·면접일정 종합 현황표 (총 ${studentsWithApps.length}명)`;
  titleCell.font = { name: '맑은 고딕', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2B1A07' } // Cocoa Ink
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getRow(1).height = 36;

  // Header 2: Column Titles (each card has 10 columns)
  const summaryHeaders = [
    '학번', '이름',
    // 1순위
    '1_대학', '1_학과', '1_전형', '1_세부전형', '1_내신', '1_성향', '1_접수여부', '1_수능최저', '1_면접일정', '1_상태',
    // 2순위
    '2_대학', '2_학과', '2_전형', '2_세부전형', '2_내신', '2_성향', '2_접수여부', '2_수능최저', '2_면접일정', '2_상태',
    // 3순위
    '3_대학', '3_학과', '3_전형', '3_세부전형', '3_내신', '3_성향', '3_접수여부', '3_수능최저', '3_면접일정', '3_상태',
    // 4순위
    '4_대학', '4_학과', '4_전형', '4_세부전형', '4_내신', '4_성향', '4_접수여부', '4_수능최저', '4_면접일정', '4_상태',
    // 5순위
    '5_대학', '5_학과', '5_전형', '5_세부전형', '5_내신', '5_성향', '5_접수여부', '5_수능최저', '5_면접일정', '5_상태',
    // 6순위
    '6_대학', '6_학과', '6_전형', '6_세부전형', '6_내신', '6_성향', '6_접수여부', '6_수능최저', '6_면접일정', '6_상태',
    '최종 등록 대학'
  ];

  const headerRow = summarySheet.getRow(2);
  headerRow.values = summaryHeaders;
  headerRow.height = 28;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    
    if (colNumber <= 2) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } }; // Charcoal
    } else if (colNumber === summaryHeaders.length) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6F1E' } }; // Marker Orange
    } else {
      const cardIdx = Math.floor((colNumber - 3) / 10);
      const isEven = cardIdx % 2 === 0;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FF3B82F6' : 'FF2563EB' }
      };
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'medium', color: { argb: 'FF333333' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };
  });

  // Add Data Rows
  studentsWithApps.forEach((student) => {
    const rowValues = [student.student_id, student.name];
    let finalEnrolled = '';

    for (let r = 1; r <= 6; r++) {
      const card = student.applications.find(a => a.rank === r) || {};
      const submitText = card.is_submitted ? '접수완료' : (card.university ? '미접수' : '');
      
      let minGpaText = '최저 없음';
      if (card.has_min_gpa) {
        minGpaText = `${card.min_gpa_subjects || ''} ${card.min_gpa_grade || ''}${card.min_gpa_inquiry ? ` (${card.min_gpa_inquiry})` : ''}`.trim() || '최저 있음';
      }

      let interviewText = '면접 없음';
      if (card.has_interview) {
        if (card.interview_start_date && card.interview_end_date && card.interview_start_date !== card.interview_end_date) {
          interviewText = `${card.interview_start_date} ~ ${card.interview_end_date}`;
        } else if (card.interview_start_date) {
          interviewText = card.interview_start_date;
        } else {
          interviewText = '면접 있음';
        }
        if (card.interview_detail) {
          interviewText += ` (${card.interview_detail})`;
        }
      }

      let statusText = card.status || '';
      if (card.status === '예비번호' && card.reserve_number) {
        statusText = `예비 ${card.reserve_number}번`;
      }

      rowValues.push(
        card.university || '',
        card.major || '',
        card.admission_type || '',
        card.admission_detail || '',
        card.gpa !== null && card.gpa !== undefined ? card.gpa : '',
        card.tendency || '',
        submitText,
        minGpaText,
        interviewText,
        statusText
      );

      if (card.status === '최종등록') {
        finalEnrolled = `${card.university} ${card.major} (${card.admission_type || ''})`;
      }
    }
    rowValues.push(finalEnrolled);

    const row = summarySheet.addRow(rowValues);
    row.height = 22;

    row.eachCell((cell) => {
      cell.font = { name: '맑은 고딕', size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      const val = String(cell.value || '');
      if (val === '상향') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        cell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FFDC2626' } };
      } else if (val === '소신') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FFD97706' } };
      } else if (val === '안정') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        cell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF16A34A' } };
      } else if (val === '최종등록' || val === '최종합격') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
        cell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF7C3AED' } };
      }
    });
  });

  // Auto adjust column widths
  summarySheet.columns.forEach((column, i) => {
    if (i < 2) {
      column.width = 11;
    } else if (i === summaryHeaders.length - 1) {
      column.width = 24;
    } else {
      const mod = (i - 2) % 10;
      if (mod === 0) column.width = 14; // 대학
      else if (mod === 1) column.width = 16; // 학과
      else if (mod === 2) column.width = 13; // 전형
      else if (mod === 3) column.width = 14; // 세부전형
      else if (mod === 4) column.width = 9;  // 내신
      else if (mod === 5) column.width = 9;  // 성향
      else if (mod === 6) column.width = 11; // 접수여부
      else if (mod === 7) column.width = 16; // 수능최저
      else if (mod === 8) column.width = 18; // 면접일정
      else if (mod === 9) column.width = 11; // 상태
    }
  });

  // -------------------------------------------------------------
  // 2. SHEET 2: 지원건별 상세 분석 (세로형 - 피벗 및 필터링용)
  // -------------------------------------------------------------
  const detailSheet = workbook.addWorksheet('지원건별 상세 분석', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const detailHeaders = [
    '학번', '성명', '지원순위', '대학명', '학과(부)명', '전형유형', '세부전형명', '산출내신', '지원성향', '원서접수여부', '수시수능최저', '탐구반영방식', '면접유무', '면접시작일', '면접종료일', '면접메모', '등록/합격상태', '비고'
  ];

  const dHeaderRow = detailSheet.getRow(1);
  dHeaderRow.values = detailHeaders;
  dHeaderRow.height = 26;

  dHeaderRow.eachCell((cell) => {
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B1A07' } }; // Cocoa Ink
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'medium', color: { argb: 'FF333333' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };
  });

  studentsWithApps.forEach(student => {
    student.applications.forEach(app => {
      const submitText = app.is_submitted ? '접수완료' : (app.university ? '미접수' : '');
      let statusText = app.status || '';
      if (app.status === '예비번호' && app.reserve_number) {
        statusText = `예비 ${app.reserve_number}번`;
      }

      const row = detailSheet.addRow([
        student.student_id,
        student.name,
        `${app.rank}순위`,
        app.university || '',
        app.major || '',
        app.admission_type || '',
        app.admission_detail || '',
        app.gpa !== null && app.gpa !== undefined ? app.gpa : '',
        app.tendency || '',
        submitText,
        minGpaText,
        app.min_gpa_inquiry || (app.has_min_gpa ? '미지정' : '-'),
        interviewText,
        app.interview_start_date || '',
        app.interview_end_date || '',
        app.interview_detail || '',
        statusText,
        app.note || ''
      ]);
      row.height = 21;

      row.eachCell((cell) => {
        cell.font = { name: '맑은 고딕', size: 9.5 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        const val = String(cell.value || '');
        if (val === '상향') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { name: '맑은 고딕', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
        } else if (val === '소신') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { name: '맑은 고딕', size: 9.5, bold: true, color: { argb: 'FFD97706' } };
        } else if (val === '안정') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          cell.font = { name: '맑은 고딕', size: 9.5, bold: true, color: { argb: 'FF16A34A' } };
        } else if (val === '최종등록' || val === '최종합격') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
          cell.font = { name: '맑은 고딕', size: 9.5, bold: true, color: { argb: 'FF7C3AED' } };
        }
      });
    });
  });

  detailSheet.columns = [
    { width: 11 }, // 학번
    { width: 12 }, // 성명
    { width: 11 }, // 지원순위
    { width: 18 }, // 대학명
    { width: 20 }, // 학과(부)명
    { width: 15 }, // 전형유형
    { width: 18 }, // 세부전형명
    { width: 11 }, // 산출내신
    { width: 12 }, // 지원성향
    { width: 13 }, // 원서접수여부
    { width: 16 }, // 수시수능최저
    { width: 16 }, // 탐구반영방식
    { width: 12 }, // 면접유무
    { width: 14 }, // 면접시작일
    { width: 14 }, // 면접종료일
    { width: 20 }, // 면접메모
    { width: 14 }, // 등록/합격상태
    { width: 22 }  // 비고
  ];

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateUniversityExcel };
