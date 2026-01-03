// ========================
// 상수 & 유틸리티
// ========================
const STORAGE_KEYS = {
    REPORTS: 'reports',
    DAILY_ACTIVITY: 'daily_activity',
    FREEZE_STATE: 'freeze_state',
    CURRENT_DRAFT: 'current_draft',
    DAILY_MOOD: 'daily_mood'
};

const MOOD_LABELS = {
    great: '아주 좋아요 😊',
    good: '좋아요 🙂',
    okay: '보통이에요 😐',
    tired: '피곤해요 😮‍💨',
    sad: '힘들어요 😢'
};

const MAX_ITEMS = 10;

// 오늘 날짜 (YYYY-MM-DD)
function getToday() {
    return new Date().toISOString().split('T')[0];
}

// 날짜 포맷팅
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// 날짜 차이 계산 (일 단위)
function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = d2 - d1;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// 이번 주 월~일 계산
function getThisWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=일, 1=월, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
        start: formatDate(monday),
        end: formatDate(sunday)
    };
}

// 지난 주 월~일 계산
function getLastWeek() {
    const thisWeek = getThisWeek();
    const monday = new Date(thisWeek.start);
    monday.setDate(monday.getDate() - 7);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
        start: formatDate(monday),
        end: formatDate(sunday)
    };
}

// 텍스트 파싱 함수 (섹션 헤더 없이도 자동 분류 시도)
function parseTextInput(text) {
    const result = {
        summary: '',
        done: [],
        progress: [],
        blockers: [],
        metrics: [],
        plan: []
    };

    // 섹션 키워드 정의 (대소문자 무시)
    const sectionPatterns = [
        { key: 'summary', patterns: ['summary', '요약', '한줄', '한 줄', '개요'] },
        { key: 'done', patterns: ['done', '완료', '했던', '한 일', '한일', '이번주', '이번 주', '금주', '작업', '완료된', '마무리'] },
        { key: 'progress', patterns: ['in progress', 'progress', '진행', '진행중', '진행 중', '하는 중', '작업중', '작업 중', 'wip', '개발중', '개발 중'] },
        { key: 'blockers', patterns: ['blocker', 'block', 'risk', '이슈', '블로커', '리스크', '문제', '장애', '어려움', '고민', 'issue'] },
        { key: 'metrics', patterns: ['metric', '지표', '수치', '데이터', '성과', 'kpi', '결과'] },
        { key: 'plan', patterns: ['plan', 'next', '계획', '다음', '다음주', '다음 주', '할 일', '할일', '예정', 'todo', 'to do', 'to-do', '차주'] }
    ];

    // 스마트 키워드 (섹션 헤더 없이 내용만으로 분류)
    const smartKeywords = {
        done: ['완료', '마무리', '끝냄', '배포함', '적용함', '확정', '공유함', '전달함', '분석함', '정리함', '리뷰함'],
        progress: ['진행중', '진행 중', '작업중', '작업 중', '개발중', '개발 중', '검토중', '검토 중', '논의중', '논의 중'],
        blockers: ['필요함', '필요', '요청', '확인 필요', '결정 필요', '지연', '블로커', '이슈', '리스크', '대기'],
        plan: ['예정', '할 예정', '계획', '진행 예정', '배포 예정', '할 것', '해야 함']
    };

    // 텍스트를 줄 단위로 분리
    const lines = text.split('\n');
    let currentSection = null;
    let noSectionItems = []; // 섹션 없이 들어온 항목들

    for (let line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // 섹션 헤더 체크 (마크다운 ## 포함)
        const lowerLine = trimmedLine.toLowerCase().replace(/^#{1,3}\s*/, '').replace(/[:\-*\[\]]/g, '').trim();
        let foundSection = null;

        for (const section of sectionPatterns) {
            if (section.patterns.some(p => lowerLine.startsWith(p) || lowerLine === p || lowerLine.includes(p))) {
                foundSection = section.key;
                break;
            }
        }

        if (foundSection) {
            currentSection = foundSection;
            // 섹션 헤더와 같은 줄에 내용이 있는지 체크
            const headerMatch = trimmedLine.match(/^[^:]+:\s*(.+)$/);
            if (headerMatch && headerMatch[1].trim()) {
                processLine(headerMatch[1].trim(), currentSection, result);
            }
            continue;
        }

        // 항목 추출 (- 또는 • 또는 숫자. 또는 체크박스)
        let content = trimmedLine;
        if (/^[-•*□☐☑✓✔]\s*|^\d+[.)]\s*|^\[.\]\s*/.test(trimmedLine)) {
            content = trimmedLine.replace(/^[-•*□☐☑✓✔]\s*|^\d+[.)]\s*|^\[.\]\s*/, '').trim();
        }

        if (!content) continue;

        if (currentSection) {
            processLine(content, currentSection, result);
        } else {
            // 섹션 없으면 스마트 분류 시도
            noSectionItems.push(content);
        }
    }

    // 섹션 없이 들어온 항목들 스마트 분류
    for (const item of noSectionItems) {
        const lowerItem = item.toLowerCase();
        let classified = false;

        // 키워드 기반 분류
        for (const [section, keywords] of Object.entries(smartKeywords)) {
            if (keywords.some(kw => lowerItem.includes(kw))) {
                processLine(item, section, result);
                classified = true;
                break;
            }
        }

        // 분류 안 되면 Done으로 기본 처리
        if (!classified) {
            processLine(item, 'done', result);
        }
    }

    return result;
}

function processLine(content, section, result) {
    // 빈 내용이나 너무 짧은 내용 무시
    if (!content || content.length < 2) return;

    switch (section) {
        case 'summary':
            result.summary = content;
            break;
        case 'done':
            if (result.done.length < MAX_ITEMS && !result.done.includes(content)) {
                result.done.push(content);
            }
            break;
        case 'progress':
            if (result.progress.length < MAX_ITEMS && !result.progress.includes(content)) {
                result.progress.push(content);
            }
            break;
        case 'blockers':
            // "이슈 / 필요지원" 또는 "이슈 - 필요지원" 또는 "이슈 → 필요지원" 형식 파싱
            if (result.blockers.length < MAX_ITEMS) {
                const parts = content.split(/\s*[\/→➡]\s*|\s+-\s+/);
                const blocker = {
                    issue: parts[0] || content,
                    ask: parts[1] || ''
                };
                if (!result.blockers.some(b => b.issue === blocker.issue)) {
                    result.blockers.push(blocker);
                }
            }
            break;
        case 'metrics':
            // "지표명: 값 / 전주대비" 또는 "지표명 값 (전주대비)" 형식 파싱
            if (result.metrics.length < MAX_ITEMS) {
                let name = '', value = '', wow = '';

                // 콜론 있는 경우
                const colonIndex = content.indexOf(':');
                if (colonIndex > 0) {
                    name = content.substring(0, colonIndex).trim();
                    const rest = content.substring(colonIndex + 1).trim();
                    const parts = rest.split(/\s*[\/→]\s*|\s+/);
                    value = parts[0] || '';
                    wow = parts[1] || '';
                } else {
                    // 콜론 없으면 공백으로 분리 시도
                    const parts = content.split(/\s+/);
                    name = parts[0] || content;
                    value = parts[1] || '';
                    wow = parts[2] || '';
                }

                // 괄호 안에 WoW가 있는 경우 추출
                const wowMatch = content.match(/\(([^)]+)\)/);
                if (wowMatch) {
                    wow = wowMatch[1];
                }

                if (!result.metrics.some(m => m.name === name)) {
                    result.metrics.push({ name, value, wow });
                }
            }
            break;
        case 'plan':
            if (result.plan.length < MAX_ITEMS && !result.plan.includes(content)) {
                result.plan.push(content);
            }
            break;
    }
}

// ========================
// localStorage 관리
// ========================
function getReports() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.REPORTS) || '{}');
}

function saveReports(reports) {
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
}

function getDailyActivity() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_ACTIVITY) || '{}');
}

function saveDailyActivity(activity) {
    localStorage.setItem(STORAGE_KEYS.DAILY_ACTIVITY, JSON.stringify(activity));
}

function getFreezeState() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.FREEZE_STATE) || '{"remaining": 1, "lastUsedDate": null}');
}

function saveFreezeState(state) {
    localStorage.setItem(STORAGE_KEYS.FREEZE_STATE, JSON.stringify(state));
}

function getDailyMood() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_MOOD) || '{}');
}

function saveDailyMood(mood) {
    localStorage.setItem(STORAGE_KEYS.DAILY_MOOD, JSON.stringify(mood));
}

function getCurrentDraft() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_DRAFT) || 'null');
}

function saveCurrentDraft(draft) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_DRAFT, JSON.stringify(draft));
}

// ========================
// 예시 데이터
// ========================
const EXAMPLES = {
    basic: `# Weekly Report: 2026-01-05 ~ 2026-01-11

## 1) Summary
- 온보딩 이탈 구간(가입 당일) 개선 가설 정리 + 지표 정의 완료

## 2) Done
- 가입 당일 이탈률 정의(기준 이벤트/세그먼트) 확정
- 사진 인증 미션 UX 개선안 1차 와이어프레임 공유
- 외부 요청 이슈 2건 원인 분석 및 정리

## 3) In Progress
- 2주 스프린트 보드 템플릿 적용
- 리워드 정책 변경 영향도 검토

## 4) Blockers / Risks
- 이슈: 외부 파트너 일정 미확정
  - 필요 지원: 일정 확정 커뮤니케이션 필요

## 5) Metrics (optional)
- 가입 당일 이탈률: 32% (WoW: -3%p)

## 6) Next Week Plan
- 개선안 실험 설계
- 파트너 일정 확정 및 배포 계획 수립

## 7) Asks
- 파트너 일정 확정 지원`,

    real: `# Weekly Report: 2026-01-05 ~ 2026-01-11

## 1) Summary
- 농장 초기 이탈 구간 개선을 위한 핵심 지표 재정의 및 외부 파트너(점신) 연동 리스크 범위 확정

## 2) Done
- 농장 가입 당일 이탈 기준 재정의(가입→작물선택→첫 물주기 완료)
- 최근 4주 이탈 유저 패턴 분석: 친구 0명 & 첫 수확 미경험 유저 이탈률↑
- 사진 인증 미션 VOC 정리: "인증 실패→보상 지연" 케이스 원인 분리
- 점신 연동 API 스펙 초안 리뷰(x-api-key 필수 필드/책임 주체 1차 합의)

## 3) In Progress
- 농장 2주 스프린트 운영 방식 도입(목표/회고 템플릿 공유)
- 물/비료 리워드 정책 변경 영향 시뮬레이션
- 점신 전달 규격 만료(exp)/중복 처리 기준 정리

## 4) Blockers / Risks
- 이슈: 점신 콜백 처리 정책이 내부 가이드와 불일치
  - 필요 지원: 홈모아 기준안 확정 후 강제 적용 여부 결정 필요
- 이슈: 신규 로그 정의가 개발 리소스에 부담
  - 필요 지원: MVP 로그 범위 우선 합의 필요
- 리스크: 사진 인증 실패 누적 시 VOC/CS 증가 가능성

## 5) Metrics (optional)
- 가입 당일 이탈률: 34% → 31% (WoW: -3%p)
- 첫 수확 경험률: 42% (WoW: +4%p)
- 농장 미션 CTR: 18% (WoW: +1.2%p)

## 6) Next Week Plan
- 가입 당일 이탈 개선안 1차 실험 설계(타겟/지표/기간)
- 사진 인증 미션 UX 보완안 기획 확정 및 개발 요청
- 점신 연동 API 만료/중복/책임 정책 문서화 및 최종 합의
- 스프린트 1회차 운영 후 회고

## 7) Asks
- 점신 연동 정책 의사결정(만료 필수 여부)
- 로그 MVP 범위(필수 이벤트) 우선순위 결정
- 사진 인증 미션 개선안 개발 일정 합의`
};

// ========================
// DOM 요소
// ========================
const elements = {
    // 헤더
    streakDisplay: document.getElementById('streakDisplay'),
    streakMessage: document.getElementById('streakMessage'),
    totalDays: document.getElementById('totalDays'),
    currentStreak: document.getElementById('currentStreak'),
    freezeRemaining: document.getElementById('freezeRemaining'),
    freezeBtn: document.getElementById('freezeBtn'),

    // 잔디
    grassGrid: document.getElementById('grassGrid'),
    todayLabel: document.getElementById('todayLabel'),
    tooltip: document.getElementById('tooltip'),

    // 기분 이모지
    moodEmojis: document.getElementById('moodEmojis'),
    moodDisplay: document.getElementById('moodDisplay'),

    // 차트
    barChart: document.getElementById('barChart'),
    barLabels: document.getElementById('barLabels'),
    lineChart: document.getElementById('lineChart'),
    lineLabels: document.getElementById('lineLabels'),

    // 히스토리
    reportList: document.getElementById('reportList'),

    // 폼
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    thisWeekBtn: document.getElementById('thisWeekBtn'),
    lastWeekBtn: document.getElementById('lastWeekBtn'),
    summary: document.getElementById('summary'),
    contentInput: document.getElementById('contentInput'),
    insertTemplateBtn: document.getElementById('insertTemplateBtn'),
    insertExampleBtn: document.getElementById('insertExampleBtn'),

    // 버튼
    generateBtn: document.getElementById('generateBtn'),
    resetBtn: document.getElementById('resetBtn'),

    // 미리보기
    emptyState: document.getElementById('emptyState'),
    reportState: document.getElementById('reportState'),
    examplePreview: document.getElementById('examplePreview'),
    exampleSwitch: document.getElementById('exampleSwitch'),
    preview: document.getElementById('preview'),
    copyBtn: document.getElementById('copyBtn'),
    downloadMdBtn: document.getElementById('downloadMdBtn'),
    downloadTxtBtn: document.getElementById('downloadTxtBtn')
};

// ========================
// 리스트 아이템 관리
// ========================
function createSimpleItem(listId, value = '') {
    const list = document.getElementById(listId);
    if (list.children.length >= MAX_ITEMS) {
        showToast('최대 10개까지만 추가할 수 있습니다.');
        return null;
    }

    const row = document.createElement('div');
    row.className = 'item-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = '내용을 입력하세요';
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const targetMap = {
                'doneList': 'done',
                'progressList': 'progress',
                'planList': 'plan'
            };
            addItem(targetMap[listId]);
        }
    });
    input.addEventListener('input', saveDraft);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-item';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
        row.remove();
        saveDraft();
        validateForm();
    });

    row.appendChild(input);
    row.appendChild(deleteBtn);
    list.appendChild(row);

    input.focus();
    saveDraft();
    validateForm();
    return input;
}

function createBlockerItem(issue = '', ask = '') {
    const list = elements.blockersList;
    if (list.children.length >= MAX_ITEMS) {
        showToast('최대 10개까지만 추가할 수 있습니다.');
        return null;
    }

    const row = document.createElement('div');
    row.className = 'item-row';

    const header = document.createElement('div');
    header.className = 'item-header';

    const label = document.createElement('span');
    label.className = 'item-label';
    label.textContent = `Blocker ${list.children.length + 1}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-item';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
        row.remove();
        updateBlockerLabels();
        saveDraft();
        validateForm();
    });

    header.appendChild(label);
    header.appendChild(deleteBtn);

    const inputs = document.createElement('div');
    inputs.className = 'blocker-inputs';

    const issueInput = document.createElement('input');
    issueInput.type = 'text';
    issueInput.value = issue;
    issueInput.placeholder = '이슈 내용';
    issueInput.dataset.type = 'issue';
    issueInput.addEventListener('input', saveDraft);

    const askInput = document.createElement('input');
    askInput.type = 'text';
    askInput.value = ask;
    askInput.placeholder = '필요 지원';
    askInput.dataset.type = 'ask';
    askInput.addEventListener('input', saveDraft);

    inputs.appendChild(issueInput);
    inputs.appendChild(askInput);

    row.appendChild(header);
    row.appendChild(inputs);
    list.appendChild(row);

    issueInput.focus();
    saveDraft();
    validateForm();
    return issueInput;
}

function createMetricItem(name = '', value = '', wow = '') {
    const list = elements.metricsList;
    if (list.children.length >= MAX_ITEMS) {
        showToast('최대 10개까지만 추가할 수 있습니다.');
        return null;
    }

    const row = document.createElement('div');
    row.className = 'item-row';

    const inputs = document.createElement('div');
    inputs.className = 'metric-inputs';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = name;
    nameInput.placeholder = '지표명';
    nameInput.dataset.type = 'name';
    nameInput.addEventListener('input', saveDraft);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = value;
    valueInput.placeholder = '값';
    valueInput.dataset.type = 'value';
    valueInput.addEventListener('input', saveDraft);

    const wowInput = document.createElement('input');
    wowInput.type = 'text';
    wowInput.value = wow;
    wowInput.placeholder = '전주대비';
    wowInput.dataset.type = 'wow';
    wowInput.addEventListener('input', saveDraft);

    inputs.appendChild(nameInput);
    inputs.appendChild(valueInput);
    inputs.appendChild(wowInput);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-item';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
        row.remove();
        saveDraft();
        validateForm();
    });

    row.appendChild(inputs);
    row.appendChild(deleteBtn);
    list.appendChild(row);

    nameInput.focus();
    saveDraft();
    validateForm();
    return nameInput;
}

function updateBlockerLabels() {
    const items = elements.blockersList.querySelectorAll('.item-row');
    items.forEach((item, index) => {
        const label = item.querySelector('.item-label');
        if (label) {
            label.textContent = `Blocker ${index + 1}`;
        }
    });
}

function addItem(target) {
    switch (target) {
        case 'done':
            createSimpleItem('doneList');
            break;
        case 'progress':
            createSimpleItem('progressList');
            break;
        case 'blockers':
            createBlockerItem();
            break;
        case 'metrics':
            createMetricItem();
            break;
        case 'plan':
            createSimpleItem('planList');
            break;
    }
}

// ========================
// 폼 데이터 수집 (텍스트 파싱 기반)
// ========================
function collectFormData() {
    const text = elements.contentInput.value.trim();
    const parsed = parseTextInput(text);

    return {
        start: elements.startDate.value,
        end: elements.endDate.value,
        summary: elements.summary.value.trim() || parsed.summary,
        done: parsed.done,
        progress: parsed.progress,
        blockers: parsed.blockers,
        metrics: parsed.metrics,
        plan: parsed.plan,
        rawContent: text,
        updatedAt: new Date().toISOString()
    };
}

// ========================
// 레벨 계산
// ========================
function calculateLevel(data) {
    const hasDone = data.done && data.done.length > 0;
    const hasProgress = data.progress && data.progress.length > 0;
    const hasPlan = data.plan && data.plan.length > 0;
    const hasBlockers = data.blockers && data.blockers.length > 0;
    const hasMetrics = data.metrics && data.metrics.length > 0;

    // Level 4: Blockers 또는 Metrics 있음
    if (hasBlockers || hasMetrics) return 4;

    // Level 3: Done + In Progress + Next Week Plan
    if (hasDone && hasProgress && hasPlan) return 3;

    // Level 2: Done + Next Week Plan
    if (hasDone && hasPlan) return 2;

    // Level 1: 뭔가 있음
    if (hasDone || hasProgress || hasPlan) return 1;

    // Level 0: 아무것도 없음
    return 0;
}

function getLevelDescription(level) {
    const descriptions = {
        0: '작성 안 함',
        1: '리포트 생성만 함',
        2: 'Done + Next Week Plan 작성',
        3: 'Done + In Progress + Next Week Plan 작성',
        4: 'Blockers 또는 Metrics 포함'
    };
    return descriptions[level] || '';
}

// ========================
// 마크다운 생성
// ========================
function generateMarkdown(data) {
    let md = `# Weekly Report: ${data.start} ~ ${data.end}\n\n`;

    // Summary
    md += `## 1) Summary\n`;
    md += `- ${data.summary || '—'}\n\n`;

    // Done
    md += `## 2) Done\n`;
    if (data.done.length > 0) {
        data.done.forEach(item => {
            md += `- ${item}\n`;
        });
    } else {
        md += `- —\n`;
    }
    md += '\n';

    // In Progress
    md += `## 3) In Progress\n`;
    if (data.progress.length > 0) {
        data.progress.forEach(item => {
            md += `- ${item}\n`;
        });
    } else {
        md += `- —\n`;
    }
    md += '\n';

    // Blockers
    md += `## 4) Blockers / Risks\n`;
    if (data.blockers.length > 0) {
        data.blockers.forEach(blocker => {
            md += `- 이슈: ${blocker.issue || '—'}\n`;
            md += `  - 필요 지원: ${blocker.ask || '—'}\n`;
        });
    } else {
        md += `- —\n`;
    }
    md += '\n';

    // Metrics
    md += `## 5) Metrics (optional)\n`;
    if (data.metrics.length > 0) {
        data.metrics.forEach(metric => {
            md += `- ${metric.name}: ${metric.value}`;
            if (metric.wow) md += ` (WoW: ${metric.wow})`;
            md += '\n';
        });
    } else {
        md += `- —\n`;
    }
    md += '\n';

    // Next Week Plan
    md += `## 6) Next Week Plan\n`;
    if (data.plan.length > 0) {
        data.plan.forEach(item => {
            md += `- ${item}\n`;
        });
    } else {
        md += `- —\n`;
    }
    md += '\n';

    // Asks
    md += `## 7) Asks\n`;
    const asks = data.blockers
        .filter(b => b.ask)
        .map(b => b.ask);
    if (asks.length > 0) {
        asks.forEach(ask => {
            md += `- ${ask}\n`;
        });
    } else {
        md += `- —\n`;
    }

    return md;
}

// ========================
// 리포트 저장
// ========================
function saveReport(data) {
    const reportKey = `${data.start}_${data.end}`;
    const reports = getReports();
    reports[reportKey] = data;
    saveReports(reports);

    // 일일 활동 기록 (리포트 기간의 모든 날짜에 반영)
    const activity = getDailyActivity();
    const level = calculateLevel(data);

    // 시작일부터 종료일까지 모든 날짜에 활동 기록
    const startDate = new Date(data.start);
    const endDate = new Date(data.end);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);

        // 이미 더 높은 레벨이 있으면 유지, 아니면 업데이트
        const existingLevel = activity[dateStr]?.level || 0;
        const existingMood = activity[dateStr]?.mood;

        activity[dateStr] = {
            level: Math.max(existingLevel, level),
            reportKey,
            updatedAt: new Date().toISOString(),
            isFreeze: activity[dateStr]?.isFreeze || false,
            mood: existingMood || activity[dateStr]?.mood
        };
    }

    saveDailyActivity(activity);

    return reportKey;
}

// ========================
// 리포트 로드
// ========================
function loadReport(reportKey) {
    const reports = getReports();
    const data = reports[reportKey];
    if (!data) return;

    // 폼 클리어
    clearForm(false);

    // 데이터 로드
    elements.startDate.value = data.start || '';
    elements.endDate.value = data.end || '';
    elements.summary.value = data.summary || '';

    // rawContent가 있으면 그대로 사용, 없으면 데이터를 텍스트로 변환
    if (data.rawContent) {
        elements.contentInput.value = data.rawContent;
    } else {
        // 이전 형식 데이터를 텍스트로 변환
        let content = '';
        if (data.done && data.done.length > 0) {
            content += 'Done:\n' + data.done.map(d => `- ${d}`).join('\n') + '\n\n';
        }
        if (data.progress && data.progress.length > 0) {
            content += '진행중:\n' + data.progress.map(p => `- ${p}`).join('\n') + '\n\n';
        }
        if (data.blockers && data.blockers.length > 0) {
            content += '이슈:\n' + data.blockers.map(b => `- ${b.issue}${b.ask ? ' / ' + b.ask : ''}`).join('\n') + '\n\n';
        }
        if (data.metrics && data.metrics.length > 0) {
            content += '지표:\n' + data.metrics.map(m => `- ${m.name}: ${m.value}${m.wow ? ' / ' + m.wow : ''}`).join('\n') + '\n\n';
        }
        if (data.plan && data.plan.length > 0) {
            content += '다음주:\n' + data.plan.map(p => `- ${p}`).join('\n');
        }
        elements.contentInput.value = content.trim();
    }

    validateForm();
    updateReportList();
}

// ========================
// 폼 유효성 검사
// ========================
function validateForm() {
    const hasStart = elements.startDate.value !== '';
    const hasEnd = elements.endDate.value !== '';
    elements.generateBtn.disabled = !(hasStart && hasEnd);
}

// ========================
// 폼 클리어
// ========================
function clearForm(clearStorage = true) {
    elements.startDate.value = '';
    elements.endDate.value = '';
    elements.summary.value = '';
    elements.contentInput.value = '';

    if (clearStorage) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_DRAFT);
    }

    validateForm();
}

// ========================
// 드래프트 저장/복원
// ========================
function saveDraft() {
    const data = collectFormData();
    saveCurrentDraft(data);
    // 내용이 있으면 미저장 상태로 표시
    const hasContent = data.rawContent || data.summary || data.start || data.end;
    setUnsavedChanges(!!hasContent);
}

function restoreDraft() {
    const draft = getCurrentDraft();
    if (!draft) return;

    elements.startDate.value = draft.start || '';
    elements.endDate.value = draft.end || '';
    elements.summary.value = draft.summary || '';
    elements.contentInput.value = draft.rawContent || '';

    validateForm();
}

// ========================
// 잔디 그리드
// ========================
function renderGrassGrid() {
    const grid = elements.grassGrid;
    grid.innerHTML = '';

    const today = new Date();
    const activity = getDailyActivity();

    // 오늘 날짜 라벨 업데이트
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const todayStr = `${today.getMonth() + 1}/${today.getDate()}(${dayNames[today.getDay()]}) 오늘`;
    elements.todayLabel.textContent = todayStr;

    // 오늘부터 과거 12주(84일) - 오늘이 맨 앞(왼쪽 상단)
    const totalDays = 84; // 12주

    for (let i = 0; i < totalDays; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = formatDate(date);

        const cell = document.createElement('div');
        cell.className = 'grass-cell';
        cell.dataset.date = dateStr;
        cell.style.animationDelay = `${i * 0.008}s`;

        const dayActivity = activity[dateStr];

        if (dayActivity) {
            if (dayActivity.isFreeze) {
                cell.classList.add('freeze');
                cell.textContent = '❄️';
            } else {
                cell.classList.add(`level-${dayActivity.level}`);
            }
        }

        // 오늘 강조
        if (dateStr === getToday()) {
            cell.classList.add('today');
        }

        // 툴팁 이벤트
        cell.addEventListener('mouseenter', (e) => showTooltip(e, dateStr, dayActivity));
        cell.addEventListener('mouseleave', hideTooltip);

        grid.appendChild(cell);
    }
}

// ========================
// 차트 렌더링
// ========================
function renderCharts() {
    renderBarChart();
    renderLineChart();
}

function renderBarChart() {
    const barChart = elements.barChart;
    const barLabels = elements.barLabels;
    barChart.innerHTML = '';
    barLabels.innerHTML = '';

    const today = new Date();
    const activity = getDailyActivity();
    const weeks = 8; // 최근 8주

    const weekData = [];
    for (let w = 0; w < weeks; w++) {
        let weekTotal = 0;
        for (let d = 0; d < 7; d++) {
            const date = new Date(today);
            date.setDate(today.getDate() - (w * 7 + d));
            const dateStr = formatDate(date);
            const dayActivity = activity[dateStr];
            if (dayActivity && (dayActivity.level > 0 || dayActivity.isFreeze)) {
                weekTotal++;
            }
        }
        weekData.unshift(weekTotal); // 오래된 순으로
    }

    const maxVal = Math.max(...weekData, 1);

    weekData.forEach((val, idx) => {
        const item = document.createElement('div');
        item.className = 'bar-item';

        const bar = document.createElement('div');
        bar.className = 'bar' + (val === 0 ? ' empty' : '');
        bar.style.height = (val / maxVal * 60) + 'px';

        const value = document.createElement('span');
        value.className = 'bar-value';
        value.textContent = val;

        item.appendChild(value);
        item.appendChild(bar);
        barChart.appendChild(item);

        // 라벨
        const label = document.createElement('span');
        if (idx === weeks - 1) {
            label.textContent = '이번주';
        } else {
            label.textContent = `${weeks - 1 - idx}주전`;
        }
        barLabels.appendChild(label);
    });
}

function renderLineChart() {
    const svg = elements.lineChart;
    const lineLabels = elements.lineLabels;
    lineLabels.innerHTML = '';

    const today = new Date();
    const activity = getDailyActivity();
    const days = 7;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const data = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = formatDate(date);
        const dayActivity = activity[dateStr];
        const level = dayActivity ? (dayActivity.isFreeze ? 1 : dayActivity.level) : 0;
        data.push({
            date: dateStr,
            level: level,
            dayName: dayNames[date.getDay()],
            isToday: i === 0
        });
    }

    // SVG 크기
    const width = 280;
    const height = 100;
    const padding = 20;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // 좌표 계산
    const points = data.map((d, i) => ({
        x: padding + (i / (days - 1)) * graphWidth,
        y: height - padding - (d.level / 4) * graphHeight,
        level: d.level,
        isToday: d.isToday
    }));

    // SVG 생성
    svg.innerHTML = `
        <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.4"/>
                <stop offset="100%" stop-color="#58a6ff" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <!-- 그리드 라인 -->
        ${[0, 1, 2, 3, 4].map(i =>
            `<line class="grid-line" x1="${padding}" y1="${height - padding - (i / 4) * graphHeight}" x2="${width - padding}" y2="${height - padding - (i / 4) * graphHeight}"/>`
        ).join('')}
        <!-- 영역 -->
        <path class="area-path" d="M ${points.map((p, i) => i === 0 ? `${p.x},${height - padding}` : '').join('')} ${points.map(p => `L ${p.x},${p.y}`).join(' ')} L ${points[points.length - 1].x},${height - padding} Z"/>
        <!-- 선 -->
        <path class="line-path" d="M ${points.map((p, i) => `${i === 0 ? '' : 'L '}${p.x},${p.y}`).join(' ')}"/>
        <!-- 점 -->
        ${points.map(p =>
            `<circle class="dot${p.isToday ? ' today' : ''}" cx="${p.x}" cy="${p.y}" r="${p.isToday ? 5 : 4}"/>`
        ).join('')}
    `;

    // 라벨
    data.forEach(d => {
        const label = document.createElement('span');
        label.textContent = d.dayName;
        if (d.isToday) label.style.color = 'var(--accent-color)';
        lineLabels.appendChild(label);
    });
}

// ========================
// 툴팁
// ========================
function showTooltip(event, dateStr, activity) {
    const tooltip = elements.tooltip;

    let status = '미작성';
    let levelText = 'Level 0';
    let levelDesc = getLevelDescription(0);
    let reportInfo = '';
    let updateTime = '';
    let moodInfo = '';

    if (activity) {
        if (activity.isFreeze) {
            status = 'Freeze used ❄️';
            levelText = 'Freeze';
            levelDesc = '스트릭 보호';
        } else {
            status = '작성';
            levelText = `Level ${activity.level}`;
            levelDesc = getLevelDescription(activity.level);
        }

        if (activity.reportKey) {
            const [start, end] = activity.reportKey.split('_');
            reportInfo = `리포트: ${start} ~ ${end}`;
        }

        if (activity.updatedAt) {
            updateTime = `업데이트: ${new Date(activity.updatedAt).toLocaleString('ko-KR')}`;
        }

        if (activity.mood && MOOD_LABELS[activity.mood]) {
            moodInfo = `기분: ${MOOD_LABELS[activity.mood]}`;
        }
    }

    tooltip.innerHTML = `
        <div class="tooltip-date">${dateStr}</div>
        <div class="tooltip-status">상태: ${status}</div>
        <div class="tooltip-level">${levelText} - ${levelDesc}</div>
        ${moodInfo ? `<div class="tooltip-mood">${moodInfo}</div>` : ''}
        ${reportInfo ? `<div class="tooltip-report">${reportInfo}</div>` : ''}
        ${updateTime ? `<div class="tooltip-report">${updateTime}</div>` : ''}
    `;

    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
    tooltip.classList.add('visible');
}

function hideTooltip() {
    elements.tooltip.classList.remove('visible');
}

// ========================
// 스트릭 계산
// ========================
function calculateStreak() {
    const activity = getDailyActivity();
    const today = new Date();
    let streak = 0;

    // 오늘부터 역순으로 체크
    for (let i = 0; i <= 365; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = formatDate(date);

        const dayActivity = activity[dateStr];

        if (dayActivity && (dayActivity.level > 0 || dayActivity.isFreeze)) {
            streak++;
        } else if (i === 0) {
            // 오늘 아직 안 썼으면 스트릭 0은 아님 (어제까지 확인)
            continue;
        } else {
            break;
        }
    }

    return streak;
}

function updateStreakDisplay() {
    const streak = calculateStreak();
    const activity = getDailyActivity();
    const todayActivity = activity[getToday()];
    const hasTodayActivity = todayActivity && (todayActivity.level > 0 || todayActivity.isFreeze);

    // 스트릭 표시
    if (streak > 0) {
        elements.streakDisplay.textContent = `${streak}🔥`;
        elements.streakDisplay.className = 'streak-display active';
        elements.currentStreak.textContent = `${streak}🔥`;

        if (hasTodayActivity) {
            elements.streakMessage.textContent = `${streak}🔥 유지 중! 오늘도 잘했어요!`;
        } else {
            elements.streakMessage.textContent = `${streak}🔥 유지 중! 오늘도 한 줄만 써도 좋아요.`;
        }
    } else {
        elements.streakDisplay.textContent = 'X';
        elements.streakDisplay.className = 'streak-display inactive';
        elements.currentStreak.textContent = 'X';
        elements.streakMessage.textContent = '오늘은 X.🥲 지금 작성하면 1🔥부터 다시 시작!';
    }

    // 총 작성일 수
    const totalDays = Object.values(activity).filter(a => a.level > 0 || a.isFreeze).length;
    elements.totalDays.textContent = totalDays;

    // 프리즈 상태
    const freezeState = getFreezeState();
    elements.freezeRemaining.textContent = freezeState.remaining;

    // 프리즈 버튼 상태
    const canUseFreeze = freezeState.remaining > 0 && !hasTodayActivity;
    elements.freezeBtn.disabled = !canUseFreeze;
}

// ========================
// 기분 선택기
// ========================
function initMoodSelector() {
    const moods = getDailyMood();
    const today = getToday();
    const todayMood = moods[today];

    // 선택된 기분 표시
    document.querySelectorAll('.mood-emoji').forEach(btn => {
        btn.classList.remove('selected');
        if (todayMood && btn.dataset.mood === todayMood) {
            btn.classList.add('selected');
        }
    });

    // 표시 텍스트 업데이트
    if (todayMood && MOOD_LABELS[todayMood]) {
        elements.moodDisplay.textContent = MOOD_LABELS[todayMood];
    } else {
        elements.moodDisplay.textContent = '오늘 기분을 선택해주세요';
    }
}

function selectMood(mood) {
    const moods = getDailyMood();
    const today = getToday();
    moods[today] = mood;
    saveDailyMood(moods);

    // 일일 활동에도 기분 저장
    const activity = getDailyActivity();
    if (!activity[today]) {
        activity[today] = { level: 0, reportKey: null, updatedAt: new Date().toISOString(), isFreeze: false };
    }
    activity[today].mood = mood;
    saveDailyActivity(activity);

    initMoodSelector();
    renderGrassGrid(); // 잔디에도 기분 반영

    const week = getThisWeek();
    showToast(`${MOOD_LABELS[mood]} 이번 주(${week.start.slice(5)} ~ ${week.end.slice(5)}) 기분 저장됨!`);
}

// ========================
// 프리즈 사용
// ========================
function useFreeze() {
    const freezeState = getFreezeState();
    const today = getToday();
    const activity = getDailyActivity();

    if (freezeState.remaining <= 0) {
        showToast('프리즈가 없습니다.');
        return;
    }

    if (activity[today] && (activity[today].level > 0 || activity[today].isFreeze)) {
        showToast('오늘은 이미 활동이 있습니다.');
        return;
    }

    // 프리즈 사용
    activity[today] = {
        level: 0,
        reportKey: null,
        updatedAt: new Date().toISOString(),
        isFreeze: true
    };
    saveDailyActivity(activity);

    freezeState.remaining--;
    freezeState.lastUsedDate = today;
    saveFreezeState(freezeState);

    renderGrassGrid();
    renderCharts();
    updateStreakDisplay();
    showToast('❄️ 프리즈를 사용했습니다!');
}

// ========================
// 리포트 목록
// ========================
function updateReportList() {
    const reports = getReports();
    const list = elements.reportList;
    list.innerHTML = '';

    const keys = Object.keys(reports).sort().reverse();

    if (keys.length === 0) {
        list.innerHTML = '<li class="empty-history">저장된 리포트가 없습니다.</li>';
        return;
    }

    keys.forEach(key => {
        const li = document.createElement('li');
        li.className = 'report-item';

        const header = document.createElement('div');
        header.className = 'report-header';

        const arrow = document.createElement('span');
        arrow.className = 'report-arrow';
        arrow.textContent = '▶';

        const title = document.createElement('span');
        title.className = 'report-title';
        title.textContent = key.replace('_', ' ~ ');

        const actions = document.createElement('div');
        actions.className = 'report-actions';

        const loadBtn = document.createElement('button');
        loadBtn.className = 'load-report';
        loadBtn.textContent = '📝 편집';
        loadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            loadReport(key);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-report';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteReport(key);
        });

        actions.appendChild(loadBtn);
        actions.appendChild(deleteBtn);

        header.appendChild(arrow);
        header.appendChild(title);
        header.appendChild(actions);

        // 미리보기 영역
        const preview = document.createElement('div');
        preview.className = 'report-preview';
        const report = reports[key];
        const previewText = generateMarkdown(report);
        preview.textContent = previewText.substring(0, 500) + (previewText.length > 500 ? '...' : '');

        // 펼침/접기 토글
        header.addEventListener('click', () => {
            li.classList.toggle('expanded');
            arrow.textContent = li.classList.contains('expanded') ? '▼' : '▶';
        });

        li.appendChild(header);
        li.appendChild(preview);
        list.appendChild(li);
    });
}

function deleteReport(key) {
    if (!confirm(`"${key.replace('_', ' ~ ')}" 리포트를 삭제하시겠습니까?`)) {
        return;
    }

    const reports = getReports();
    delete reports[key];
    saveReports(reports);

    updateReportList();
    showToast('리포트가 삭제되었습니다.');
}

// ========================
// 내보내기
// ========================
async function copyToClipboard() {
    const text = elements.preview.value;
    if (!text) {
        showToast('복사할 내용이 없습니다.');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showToast('클립보드에 복사되었습니다!');
    } catch (err) {
        // Fallback for older browsers or non-HTTPS
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();

        try {
            document.execCommand('copy');
            showToast('클립보드에 복사되었습니다!');
        } catch (e) {
            showToast('복사 실패. HTTPS 환경 또는 로컬서버에서 시도해주세요.');
        }

        document.body.removeChild(textArea);
    }
}

function downloadFile(content, filename, type) {
    if (!content) {
        showToast('다운로드할 내용이 없습니다.');
        return;
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${filename} 다운로드 완료!`);
}

// ========================
// 예시 & 리포트 상태 관리
// ========================
let currentExampleType = 'basic';
let hasGeneratedReport = false;

function showEmptyState() {
    elements.emptyState.style.display = 'block';
    elements.reportState.style.display = 'none';
    showExample(currentExampleType);
}

function showReportState(markdown) {
    elements.emptyState.style.display = 'none';
    elements.reportState.style.display = 'block';
    elements.preview.value = markdown;
    hasGeneratedReport = true;
}

function showExample(type) {
    currentExampleType = type;
    elements.examplePreview.textContent = EXAMPLES[type];

    // 버튼 활성화 상태 업데이트
    document.querySelectorAll('.example-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

// ========================
// 토스트 메시지
// ========================
function showToast(message) {
    // 기존 토스트 제거
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ========================
// 페이지 이탈 경고
// ========================
let hasUnsavedChanges = false;

function setUnsavedChanges(value) {
    hasUnsavedChanges = value;
}

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

// ========================
// 전체 초기화
// ========================
function resetAll() {
    if (!confirm('모든 데이터를 초기화하시겠습니까?\n(저장된 리포트, 잔디, 프리즈 모두 삭제됩니다)')) {
        return;
    }

    // 앱 관련 키만 삭제 (다른 앱 데이터 보호)
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
    clearForm(true);
    setUnsavedChanges(false);
    renderGrassGrid();
    renderCharts();
    updateStreakDisplay();
    updateReportList();
    initMoodSelector();
    showEmptyState();
    hasGeneratedReport = false;
    showToast('모든 데이터가 초기화되었습니다.');
}

// ========================
// 이벤트 리스너
// ========================
function initEventListeners() {
    // 폼 입력 이벤트
    elements.startDate.addEventListener('change', () => {
        saveDraft();
        validateForm();
    });
    elements.endDate.addEventListener('change', () => {
        saveDraft();
        validateForm();
    });
    elements.summary.addEventListener('input', saveDraft);

    // 이번 주 / 지난 주 버튼
    elements.thisWeekBtn.addEventListener('click', () => {
        const week = getThisWeek();
        elements.startDate.value = week.start;
        elements.endDate.value = week.end;
        saveDraft();
        validateForm();
        showToast('이번 주로 설정됨');
    });

    elements.lastWeekBtn.addEventListener('click', () => {
        const week = getLastWeek();
        elements.startDate.value = week.start;
        elements.endDate.value = week.end;
        saveDraft();
        validateForm();
        showToast('지난 주로 설정됨');
    });

    // 템플릿 삽입
    const TEMPLATES = {
        done: '## Done:\n- ',
        progress: '## 진행중:\n- ',
        blockers: '## 이슈:\n- 이슈내용 / 필요지원',
        metrics: '## 지표:\n- 지표명: 값 / 전주대비',
        plan: '## 다음주:\n- ',
        full: `## Done:
-

## 진행중:
-

## 이슈:
- 이슈내용 / 필요지원

## 지표:
- 지표명: 값 / 전주대비

## 다음주:
- `,
        example: `## Done:
- 가입 당일 이탈률 정의 확정
- UX 개선안 1차 와이어프레임 공유
- 외부 요청 이슈 2건 원인 분석

## 진행중:
- 2주 스프린트 보드 템플릿 적용
- 리워드 정책 변경 영향도 검토

## 이슈:
- 외부 파트너 일정 미확정 / 일정 확정 커뮤니케이션 필요
- 개발 리소스 부족 / MVP 범위 우선 합의 필요

## 지표:
- 이탈률: 32% / -3%p
- DAU: 15,000 / +5%

## 다음주:
- 개선안 실험 설계
- 파트너 일정 확정 및 배포 계획`
    };

    // 빈 템플릿 삽입
    elements.insertTemplateBtn.addEventListener('click', () => {
        if (elements.contentInput.value.trim()) {
            if (!confirm('현재 내용을 덮어쓸까요?')) return;
        }
        elements.contentInput.value = TEMPLATES.full;
        elements.contentInput.focus();
        saveDraft();
        showToast('빈 템플릿이 삽입되었습니다');
    });

    // 예시 삽입
    elements.insertExampleBtn.addEventListener('click', () => {
        if (elements.contentInput.value.trim()) {
            if (!confirm('현재 내용을 덮어쓸까요?')) return;
        }
        elements.contentInput.value = TEMPLATES.example;
        elements.contentInput.focus();
        saveDraft();
        showToast('예시가 삽입되었습니다');
    });

    // 개별 섹션 칩 클릭
    document.querySelectorAll('.template-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const type = chip.dataset.template;
            const template = TEMPLATES[type];
            const input = elements.contentInput;
            const cursorPos = input.selectionStart;
            const before = input.value.substring(0, cursorPos);
            const after = input.value.substring(cursorPos);

            // 줄바꿈 추가
            const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
            input.value = before + prefix + template + after;

            // 커서 위치 조정
            const newPos = cursorPos + prefix.length + template.length;
            input.setSelectionRange(newPos, newPos);
            input.focus();
            saveDraft();
        });
    });

    // 텍스트 입력 자동저장
    elements.contentInput.addEventListener('input', saveDraft);

    // 리포트 생성
    elements.generateBtn.addEventListener('click', () => {
        const btn = elements.generateBtn;
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');

        // 로딩 상태 표시
        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        // 약간의 딜레이로 UX 피드백 (너무 빠르면 깜빡임)
        setTimeout(() => {
            const data = collectFormData();
            const markdown = generateMarkdown(data);
            showReportState(markdown);
            saveReport(data);

            renderGrassGrid();
            renderCharts();
            updateStreakDisplay();
            updateReportList();

            // 저장 완료 - 미저장 상태 해제
            setUnsavedChanges(false);

            // 버튼 원복
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            btn.disabled = false;

            showToast('리포트가 생성되었습니다!');
        }, 300);
    });

    // 초기화
    elements.resetBtn.addEventListener('click', resetAll);

    // 프리즈
    elements.freezeBtn.addEventListener('click', useFreeze);

    // 내보내기
    elements.copyBtn.addEventListener('click', copyToClipboard);
    elements.downloadMdBtn.addEventListener('click', () => {
        const data = collectFormData();
        const filename = data.start && data.end
            ? `weekly-report_${data.start}_${data.end}.md`
            : 'weekly-report.md';
        downloadFile(elements.preview.value, filename, 'text/markdown');
    });
    elements.downloadTxtBtn.addEventListener('click', () => {
        const data = collectFormData();
        const filename = data.start && data.end
            ? `weekly-report_${data.start}_${data.end}.txt`
            : 'weekly-report.txt';
        downloadFile(elements.preview.value, filename, 'text/plain');
    });

    // 예시 타입 전환
    document.querySelectorAll('.example-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showExample(btn.dataset.type);
        });
    });

    // 기분 이모지 선택
    document.querySelectorAll('.mood-emoji').forEach(btn => {
        btn.addEventListener('click', () => {
            selectMood(btn.dataset.mood);
        });
    });
}

// ========================
// 초기화
// ========================
function init() {
    initEventListeners();
    restoreDraft();
    renderGrassGrid();
    renderCharts();
    updateStreakDisplay();
    updateReportList();
    initMoodSelector();
    validateForm();
    showEmptyState(); // 기본: 예시 표시
}

// DOM 로드 후 실행
document.addEventListener('DOMContentLoaded', init);
